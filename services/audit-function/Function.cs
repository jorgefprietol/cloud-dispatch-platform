using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.Lambda.Core;
using Amazon.Lambda.SQSEvents;
using System.Text.Json;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]
namespace CloudDispatch.Audit;
public sealed class Function
{
    private readonly IAmazonDynamoDB db;
    private readonly string table;
    public Function() : this(new AmazonDynamoDBClient(), Environment.GetEnvironmentVariable("AUDIT_TABLE") ?? throw new InvalidOperationException("AUDIT_TABLE required")) { }
    public Function(IAmazonDynamoDB db, string table) { this.db = db; this.table = table; }
    public async Task<SQSBatchResponse> Handler(SQSEvent input, ILambdaContext context)
    {
        var failures = new List<SQSBatchResponse.BatchItemFailure>();
        foreach (var message in input.Records)
        {
            try
            {
                using var body = JsonDocument.Parse(message.Body);
                var root = body.RootElement;
                var order = root.GetProperty("orderId").GetGuid(); var eventId = root.GetProperty("eventId").GetGuid();
                var request = new PutItemRequest
                {
                    TableName = table, ConditionExpression = "attribute_not_exists(pk)",
                    Item = new() { ["pk"] = new AttributeValue($"ORDER#{order}"), ["sk"] = new AttributeValue($"EVENT#{eventId}"),
                        ["payload"] = new AttributeValue(message.Body), ["recordedAt"] = new AttributeValue(DateTimeOffset.UtcNow.ToString("O")),
                        ["expiresAt"] = new AttributeValue { N = DateTimeOffset.UtcNow.AddDays(365).ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture) } }
                };
                try { await db.PutItemAsync(request); } catch (ConditionalCheckFailedException) { /* Previously archived event: successful replay. */ }
            }
            catch (Exception error)
            {
                context.Logger.LogError($"Audit failed messageId={message.MessageId} type={error.GetType().Name}");
                failures.Add(new SQSBatchResponse.BatchItemFailure { ItemIdentifier = message.MessageId });
            }
        }
        return new SQSBatchResponse { BatchItemFailures = failures };
    }
}
