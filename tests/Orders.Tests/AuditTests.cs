using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.Lambda.Core;
using Amazon.Lambda.SQSEvents;
using CloudDispatch.Audit;
using Moq;
using Xunit;
namespace Orders.Tests;
public class AuditTests
{
    private static readonly string Body = "{\"orderId\":\"01234567-89ab-4cde-8012-3456789abcde\",\"eventId\":\"11234567-89ab-4cde-8012-3456789abcde\"}";
    private static ILambdaContext Context() { var ctx = new Mock<ILambdaContext>(); ctx.SetupGet(c => c.Logger).Returns(Mock.Of<ILambdaLogger>()); return ctx.Object; }
    private static SQSEvent Input(string body) => new() { Records = [new SQSEvent.SQSMessage { MessageId = "test-message", Body = body }] };
    [Fact] public async Task DuplicateAuditIsSuccessfulAndUsesConditionalWrite()
    {
        var db = new Mock<IAmazonDynamoDB>();
        db.Setup(d => d.PutItemAsync(It.IsAny<PutItemRequest>(), It.IsAny<CancellationToken>())).ThrowsAsync(new ConditionalCheckFailedException("exists"));
        var result = await new Function(db.Object, "audit").Handler(Input(Body), Context());
        Assert.Empty(result.BatchItemFailures);
        db.Verify(d => d.PutItemAsync(It.Is<PutItemRequest>(r => r.TableName == "audit" && r.ConditionExpression == "attribute_not_exists(pk)" && r.Item["pk"].S.StartsWith("ORDER#")), It.IsAny<CancellationToken>()), Times.Once);
    }
    [Fact] public async Task InvalidMessageDoesNotWriteAndIsReturnedForRetry()
    {
        var db = new Mock<IAmazonDynamoDB>();
        var result = await new Function(db.Object,"audit").Handler(Input("{}"), Context());
        Assert.Equal("test-message", Assert.Single(result.BatchItemFailures).ItemIdentifier);
        db.Verify(d => d.PutItemAsync(It.IsAny<PutItemRequest>(),It.IsAny<CancellationToken>()),Times.Never);
    }
    [Fact] public async Task InfrastructureFailureIsNotAcknowledged()
    {
        var db = new Mock<IAmazonDynamoDB>();
        db.Setup(d => d.PutItemAsync(It.IsAny<PutItemRequest>(),It.IsAny<CancellationToken>())).ThrowsAsync(new AmazonDynamoDBException("unavailable"));
        var result = await new Function(db.Object,"audit").Handler(Input(Body), Context());
        Assert.Single(result.BatchItemFailures);
    }
}
