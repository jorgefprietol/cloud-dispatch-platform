using Npgsql;
using System.Text.Json;

namespace CloudDispatch;

public sealed class Store(NpgsqlDataSource db)
{
    public async Task Migrate(CancellationToken ct)
    {
        await using var connection = await db.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        await using var migrationLock = new NpgsqlCommand("SELECT pg_advisory_xact_lock(73190412)", connection, transaction);
        await migrationLock.ExecuteNonQueryAsync(ct);
        await using var command = new NpgsqlCommand("""
            CREATE TABLE IF NOT EXISTS orders (
              id uuid PRIMARY KEY, owner_id text NOT NULL, customer varchar(120) NOT NULL,
              destination varchar(120) NOT NULL, priority text NOT NULL CHECK(priority IN ('standard','express')),
              amount numeric(12,2) NOT NULL CHECK(amount > 0), status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','dispatched')),
              created_at timestamptz NOT NULL DEFAULT now(), tracking_code text, report_key text,
              idempotency_key varchar(128) NOT NULL, fingerprint text NOT NULL, UNIQUE(owner_id,idempotency_key));
            CREATE INDEX IF NOT EXISTS orders_owner_created ON orders(owner_id,created_at DESC);
            CREATE TABLE IF NOT EXISTS outbox (
              id uuid PRIMARY KEY, payload text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
              published_at timestamptz, attempts int NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now());
            CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(next_attempt_at) WHERE published_at IS NULL;
            """, connection, transaction);
        await command.ExecuteNonQueryAsync(ct);
        await transaction.CommitAsync(ct);
    }

    private static Order Read(NpgsqlDataReader r) => new(r.GetGuid(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetDecimal(4), r.GetString(5), r.GetFieldValue<DateTimeOffset>(6), r.IsDBNull(7) ? null : r.GetString(7), r.IsDBNull(8) ? null : r.GetString(8));
    private const string Columns = "id,customer,destination,priority,amount,status,created_at,tracking_code,report_key";

    public async Task<(Order Order, bool Created)> Create(CreateOrder input, string owner, string key, CancellationToken ct)
    {
        await using var connection = await db.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        var id = Guid.NewGuid();
        await using var insert = new NpgsqlCommand($"INSERT INTO orders(id,owner_id,customer,destination,priority,amount,idempotency_key,fingerprint) VALUES(@id,@owner,@customer,@destination,@priority,@amount,@key,@hash) ON CONFLICT(owner_id,idempotency_key) DO NOTHING RETURNING {Columns}", connection, tx);
        insert.Parameters.AddWithValue("id", id); insert.Parameters.AddWithValue("owner", owner);
        insert.Parameters.AddWithValue("customer", input.Customer); insert.Parameters.AddWithValue("destination", input.Destination);
        insert.Parameters.AddWithValue("priority", input.Priority); insert.Parameters.AddWithValue("amount", input.Amount);
        insert.Parameters.AddWithValue("key", key); insert.Parameters.AddWithValue("hash", Rules.Fingerprint(input));
        Order? order;
        await using (var reader = await insert.ExecuteReaderAsync(ct)) { order = await reader.ReadAsync(ct) ? Read(reader) : null; }
        if (order is null)
        {
            await using var existing = new NpgsqlCommand($"SELECT {Columns},fingerprint FROM orders WHERE owner_id=@owner AND idempotency_key=@key", connection, tx);
            existing.Parameters.AddWithValue("owner", owner); existing.Parameters.AddWithValue("key", key);
            await using var reader = await existing.ExecuteReaderAsync(ct);
            await reader.ReadAsync(ct);
            if (reader.GetString(9) != Rules.Fingerprint(input)) throw new IdempotencyConflictException();
            order = Read(reader); await reader.DisposeAsync(); await tx.CommitAsync(ct);
            return (order, false);
        }
        var eventId = Guid.NewGuid();
        await using var publish = new NpgsqlCommand("INSERT INTO outbox(id,payload) VALUES(@id,@payload)", connection, tx);
        publish.Parameters.AddWithValue("id", eventId);
        publish.Parameters.AddWithValue("payload", JsonSerializer.Serialize(new DispatchEvent(1, eventId, id, input.Destination, input.Priority, input.Amount), Rules.Json));
        await publish.ExecuteNonQueryAsync(ct); await tx.CommitAsync(ct);
        return (order, true);
    }
    public async Task<IReadOnlyList<Order>> List(string owner, CancellationToken ct)
    {
        await using var cmd = db.CreateCommand($"SELECT {Columns} FROM orders WHERE owner_id=@owner ORDER BY created_at DESC LIMIT 100");
        cmd.Parameters.AddWithValue("owner", owner);
        await using var reader = await cmd.ExecuteReaderAsync(ct); var orders = new List<Order>();
        while (await reader.ReadAsync(ct)) orders.Add(Read(reader));
        return orders;
    }
    public async Task<Order?> Find(Guid id, string owner, CancellationToken ct)
    {
        await using var cmd = db.CreateCommand($"SELECT {Columns} FROM orders WHERE id=@id AND owner_id=@owner");
        cmd.Parameters.AddWithValue("id", id); cmd.Parameters.AddWithValue("owner", owner);
        await using var reader = await cmd.ExecuteReaderAsync(ct); return await reader.ReadAsync(ct) ? Read(reader) : null;
    }
    public async Task<Dashboard> Stats(string owner, CancellationToken ct)
    {
        await using var cmd = db.CreateCommand("SELECT count(*),count(*) FILTER(WHERE status='queued'),count(*) FILTER(WHERE status='dispatched'),coalesce(sum(amount),0) FROM orders WHERE owner_id=@owner");
        cmd.Parameters.AddWithValue("owner", owner);
        await using var r = await cmd.ExecuteReaderAsync(ct); await r.ReadAsync(ct);
        return new(r.GetInt64(0),r.GetInt64(1),r.GetInt64(2),r.GetDecimal(3));
    }
    public async Task<string?> Fulfill(Guid id, Fulfillment result, CancellationToken ct)
    {
        await using var cmd = db.CreateCommand("UPDATE orders SET status='dispatched',tracking_code=@tracking,report_key=@report WHERE id=@id AND (status='queued' OR (tracking_code=@tracking AND report_key=@report)) RETURNING owner_id");
        cmd.Parameters.AddWithValue("id", id); cmd.Parameters.AddWithValue("tracking", result.TrackingCode); cmd.Parameters.AddWithValue("report", result.ReportKey);
        return (string?)await cmd.ExecuteScalarAsync(ct);
    }
}
