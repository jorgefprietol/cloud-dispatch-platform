using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using Amazon.SQS;
using CloudDispatch;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Npgsql;
using StackExchange.Redis;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders(); builder.Logging.AddJsonConsole();
var config = builder.Configuration;
var demo = builder.Environment.IsDevelopment() && config.GetValue<bool>("Auth:Demo");
var workerSecret = config["Worker:Secret"] ?? "";
if (workerSecret.Length < 32) throw new InvalidOperationException("Worker__Secret must have at least 32 characters.");
if (!demo && (string.IsNullOrWhiteSpace(config["Auth:Authority"]) || string.IsNullOrWhiteSpace(config["Auth:Audience"]))) throw new InvalidOperationException("Configure Auth__Authority and Auth__Audience for Cognito authentication.");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.Authority = config["Auth:Authority"]; options.Audience = config["Auth:Audience"]; options.MapInboundClaims = false;
    options.Events = new JwtBearerEvents { OnTokenValidated = context =>
    { if (context.Principal?.FindFirstValue("token_use") != "id" || string.IsNullOrWhiteSpace(context.Principal.FindFirstValue("sub"))) context.Fail("A Cognito ID token with a subject is required."); return Task.CompletedTask; } };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("api", context => RateLimitPartition.GetFixedWindowLimiter(context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var connectionString = config.GetConnectionString("Orders") ?? new NpgsqlConnectionStringBuilder
{
    Host = config["Database:Host"], Database = "dispatch", Username = "dispatch",
    Password = config["Database:Password"], SslMode = SslMode.VerifyFull, RootCertificate = config["Database:RootCertificate"]
}.ConnectionString;
builder.Services.AddSingleton(NpgsqlDataSource.Create(connectionString));
builder.Services.AddSingleton<Store>();
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => string.IsNullOrEmpty(config["Redis:Connection"])
    ? ConnectionMultiplexer.Connect(new ConfigurationOptions { EndPoints = { { config["Redis:Host"] ?? "localhost", 6379 } }, Password = config["Redis:Password"], Ssl = true, AbortOnConnectFail = false, ConnectTimeout = 2000, SyncTimeout = 2000, AsyncTimeout = 2000 })
    : ConnectionMultiplexer.Connect(config["Redis:Connection"]!));
var region = RegionEndpoint.GetBySystemName(config["AWS:Region"] ?? "us-east-1");
builder.Services.AddSingleton<IAmazonSQS>(_ => string.IsNullOrEmpty(config["AWS:Endpoint"])
    ? new AmazonSQSClient(region) : new AmazonSQSClient(new AmazonSQSConfig { ServiceURL = config["AWS:Endpoint"], AuthenticationRegion = region.SystemName }));
builder.Services.AddSingleton<IAmazonS3>(_ => string.IsNullOrEmpty(config["AWS:Endpoint"])
    ? new AmazonS3Client(region) : new AmazonS3Client(new AmazonS3Config { ServiceURL = config["AWS:Endpoint"], AuthenticationRegion = region.SystemName, ForcePathStyle = true }));
builder.Services.AddHostedService<OutboxPublisher>();
var app = builder.Build();
await app.Services.GetRequiredService<Store>().Migrate(CancellationToken.None);
app.UseExceptionHandler(handler => handler.Run(async context =>
{
    context.Response.StatusCode = 500;
    await context.Response.WriteAsJsonAsync(new { title = "Request failed", status = 500, traceId = context.TraceIdentifier });
}));
app.UseAuthentication();
if (demo) app.Use(async (context, next) => { context.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", "local-operator")], "local")); await next(); });
app.UseAuthorization(); app.UseRateLimiter();
app.MapGet("/health/live", () => Results.Ok(new { status = "up", service = "orders-api" }));
app.MapGet("/health/ready", async (NpgsqlDataSource db, CancellationToken ct) =>
{ try { await using var cmd = db.CreateCommand("SELECT 1"); await cmd.ExecuteScalarAsync(ct); return Results.Ok(new { status = "ready" }); } catch { return Results.StatusCode(503); } });
var api = app.MapGroup("/api").RequireAuthorization().RequireRateLimiting("api");
api.MapGet("/orders", async (Store store, HttpContext ctx, CancellationToken ct) => Results.Ok(await store.List(ctx.User.FindFirstValue("sub")!, ct)));
api.MapGet("/orders/{id:guid}", async (Guid id, Store store, HttpContext ctx, CancellationToken ct) =>
{ var order = await store.Find(id, ctx.User.FindFirstValue("sub")!, ct); return order is null ? Results.NotFound() : Results.Ok(order); });
api.MapPost("/orders", async (CreateOrder input, Store store, IConnectionMultiplexer cache, HttpContext ctx, CancellationToken ct) =>
{
    var error = Rules.Validate(input); if (error is not null) return Results.Problem(error, statusCode: 400);
    var key = ctx.Request.Headers["Idempotency-Key"].ToString();
    if (key.Length is < 8 or > 128) return Results.Problem("Idempotency-Key must contain 8–128 characters.", statusCode: 400);
    var owner = ctx.User.FindFirstValue("sub")!;
    try
    {
        var result = await store.Create(input, owner, key, ct);
        try { await cache.GetDatabase().KeyDeleteAsync($"stats:{owner}"); } catch (RedisException) { }
        return result.Created ? Results.Created($"/api/orders/{result.Order.Id}", result.Order) : Results.Ok(result.Order);
    }
    catch (IdempotencyConflictException) { return Results.Problem("This idempotency key was already used with different data.", statusCode: 409); }
});
api.MapGet("/dashboard", async (Store store, IConnectionMultiplexer cache, HttpContext ctx, CancellationToken ct) =>
{
    var owner = ctx.User.FindFirstValue("sub")!; var key = $"stats:{owner}";
    try { var hit = await cache.GetDatabase().StringGetAsync(key); if (hit.HasValue) return Results.Content(hit!, "application/json"); } catch (RedisException) { }
    var stats = await store.Stats(owner, ct);
    try { await cache.GetDatabase().StringSetAsync(key, JsonSerializer.Serialize(stats, Rules.Json), TimeSpan.FromSeconds(10)); } catch (RedisException) { }
    return Results.Ok(stats);
});
api.MapGet("/orders/{id:guid}/report", async (Guid id, Store store, IAmazonS3 s3, IConfiguration cfg, HttpContext ctx, CancellationToken ct) =>
{
    var order = await store.Find(id, ctx.User.FindFirstValue("sub")!, ct);
    if (order?.ReportKey is null) return Results.NotFound();
    using var response = await s3.GetObjectAsync(new GetObjectRequest { BucketName = cfg["AWS:Bucket"], Key = order.ReportKey }, ct);
    using var body = new MemoryStream(); await response.ResponseStream.CopyToAsync(body, ct);
    return Results.File(body.ToArray(), "application/json", $"dispatch-{id}.json");
});
app.MapPost("/internal/orders/{id:guid}/fulfill", async (Guid id, Fulfillment result, Store store, IConnectionMultiplexer cache, HttpContext ctx, CancellationToken ct) =>
{
    if (!Rules.SecretMatches(ctx.Request.Headers["X-Worker-Secret"].ToString(), workerSecret)) return Results.Unauthorized();
    if (result.ReportKey != $"dispatch/{id}.json" || result.TrackingCode != $"CD-{id.ToString("N")[..12].ToUpperInvariant()}") return Results.BadRequest();
    var owner = await store.Fulfill(id, result, ct); if (owner is null) return Results.Conflict();
    try { await cache.GetDatabase().KeyDeleteAsync($"stats:{owner}"); } catch (RedisException) { }
    return Results.NoContent();
});
app.Run();
public partial class Program;
