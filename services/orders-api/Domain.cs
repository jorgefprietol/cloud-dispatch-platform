using System.Text.Json;
using System.Security.Cryptography;
using System.Text;

namespace CloudDispatch;

public sealed record CreateOrder(string Customer, string Destination, string Priority, decimal Amount);
public sealed record Order(Guid Id, string Customer, string Destination, string Priority, decimal Amount, string Status, DateTimeOffset CreatedAt, string? TrackingCode, string? ReportKey);
public sealed record DispatchEvent(int Version, Guid EventId, Guid OrderId, string Destination, string Priority, decimal Amount);
public sealed record Fulfillment(string TrackingCode, string ReportKey);
public sealed record Dashboard(long Total, long Queued, long Dispatched, decimal Volume);
public sealed class IdempotencyConflictException : Exception;
public static class Rules
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static string? Validate(CreateOrder request)
    {
        if (string.IsNullOrWhiteSpace(request.Customer) || request.Customer.Length > 120) return "Customer must contain 1–120 characters.";
        if (string.IsNullOrWhiteSpace(request.Destination) || request.Destination.Length > 120) return "Destination must contain 1–120 characters.";
        if (request.Priority is not ("standard" or "express")) return "Priority must be standard or express.";
        if (request.Amount <= 0 || request.Amount > 1_000_000 || decimal.Round(request.Amount, 2) != request.Amount) return "Amount must be positive, at most 1,000,000 and have at most two decimals.";
        return null;
    }
    public static string Fingerprint(CreateOrder request) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(request, Json))));
    public static bool SecretMatches(string provided, string expected) => expected.Length >= 32 && CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(provided)), SHA256.HashData(Encoding.UTF8.GetBytes(expected)));
}
