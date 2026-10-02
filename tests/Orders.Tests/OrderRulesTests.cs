using CloudDispatch;
using Xunit;
namespace Orders.Tests;
public class OrderRulesTests
{
    [Theory]
    [InlineData(0)] [InlineData(-1)] [InlineData(1000001)] [InlineData(0.001)]
    public void RejectsInvalidAmount(decimal amount) => Assert.NotNull(Rules.Validate(new("Acme", "Quito", "standard", amount)));
    [Theory]
    [InlineData("standard")] [InlineData("express")]
    public void AcceptsSupportedPriority(string priority) => Assert.Null(Rules.Validate(new("Acme", "Quito", priority, 10.25m)));
    [Fact] public void ChangedPayloadProducesDifferentFingerprint() => Assert.NotEqual(Rules.Fingerprint(new("Acme","Quito","express",10m)), Rules.Fingerprint(new("Acme","Quito","express",11m)));
    [Fact] public void RejectsMissingCustomer() => Assert.NotNull(Rules.Validate(new(" ", "Quito", "standard", 10m)));
    [Fact] public void WorkerRequiresExactStrongSecret()
    {
        var secret = new string('a', 40);
        Assert.True(Rules.SecretMatches(secret, secret));
        Assert.False(Rules.SecretMatches(secret + "b", secret));
        Assert.False(Rules.SecretMatches("", ""));
    }
}
