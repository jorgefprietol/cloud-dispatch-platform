using Amazon.SQS;
using Amazon.SQS.Model;
using Npgsql;

namespace CloudDispatch;

public sealed class OutboxPublisher(NpgsqlDataSource db, IAmazonSQS sqs, IConfiguration config, ILogger<OutboxPublisher> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { await PublishOne(ct); }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception error) { log.LogError(error, "Outbox publishing failed; retrying"); }
            await Task.Delay(TimeSpan.FromSeconds(1), ct);
        }
    }
    private async Task PublishOne(CancellationToken ct)
    {
        await using var connection = await db.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        await using var claim = new NpgsqlCommand("SELECT id,payload,attempts FROM outbox WHERE published_at IS NULL AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1", connection, tx);
        Guid id; string body; int attempts;
        await using (var reader = await claim.ExecuteReaderAsync(ct))
        { if (!await reader.ReadAsync(ct)) return; id = reader.GetGuid(0); body = reader.GetString(1); attempts = reader.GetInt32(2); }
        var sent = false;
        try
        {
            await sqs.SendMessageAsync(new SendMessageRequest { QueueUrl = config["AWS:QueueUrl"], MessageBody = body }, ct);
            sent = true; log.LogInformation("Published dispatch event {EventId}", id);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        { log.LogWarning(error, "Event {EventId} failed at attempt {Attempt}", id, attempts + 1); }
        await using var finish = new NpgsqlCommand(sent
            ? "UPDATE outbox SET published_at=now(),attempts=attempts+1 WHERE id=@id"
            : "UPDATE outbox SET attempts=attempts+1,next_attempt_at=now()+make_interval(secs=>@delay) WHERE id=@id", connection, tx);
        finish.Parameters.AddWithValue("id", id);
        if (!sent) finish.Parameters.AddWithValue("delay", (int)Math.Min(300, Math.Pow(2, Math.Min(attempts + 1, 9))));
        await finish.ExecuteNonQueryAsync(ct); await tx.CommitAsync(ct);
    }
}
