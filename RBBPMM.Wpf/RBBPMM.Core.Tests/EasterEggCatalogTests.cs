using RBBPMM.Core;

namespace RBBPMM.Core.Tests;

public class EasterEggCatalogTests
{
    [Theory]
    [InlineData(EasterEggCatalog.Flee, EasterEggKind.Flee)]
    [InlineData(EasterEggCatalog.Scare, EasterEggKind.Scare)]
    [InlineData(0, EasterEggKind.None)]
    [InlineData(12345, EasterEggKind.None)]
    public void KindFor_MapsKnownSubmissionsAndIgnoresTheRest(int id, EasterEggKind expected)
        => Assert.Equal(expected, EasterEggCatalog.KindFor(id));

    [Fact]
    public void KindFor_LongOverload_RejectsValuesOutsideIntRange()
    {
        Assert.Equal(EasterEggKind.Flee, EasterEggCatalog.KindFor((long)EasterEggCatalog.Flee));
        Assert.Equal(EasterEggKind.None, EasterEggCatalog.KindFor(long.MaxValue));
        Assert.Equal(EasterEggKind.None, EasterEggCatalog.KindFor(long.MinValue));
    }

    [Fact]
    public void EggIds_AreDistinct()
        => Assert.NotEqual(EasterEggCatalog.Flee, EasterEggCatalog.Scare);
}
