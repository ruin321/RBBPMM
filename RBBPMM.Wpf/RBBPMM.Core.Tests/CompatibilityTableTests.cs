using RBBPMM.Core;

namespace RBBPMM.Core.Tests;

public class CompatibilityTableTests
{
    [Theory]
    [InlineData("0.14", "0.14")]
    [InlineData("v0.13.1 build 5", "0.13.1")]
    [InlineData("0.12.2a", "0.12.2")]
    [InlineData("nonsense", null)]
    [InlineData(null, null)]
    public void NormalizeGameVersion_ExtractsDottedVersion(string? input, string? expected)
    {
        Assert.Equal(expected, CompatibilityTable.NormalizeGameVersion(input));
    }

    [Theory]
    [InlineData("0.14", "11.0.0.1")]
    [InlineData("0.12.2a", "9.1.0.0")]
    [InlineData("0.3", "2.3.0.1")]
    [InlineData("9.9", null)]
    public void ResolveDevApiVersion_MapsKnownGameVersions(string? input, string? expected)
    {
        Assert.Equal(expected, CompatibilityTable.ResolveDevApiVersion(input));
    }

    [Theory]
    [InlineData("v1.2.3", "1.2.3")]
    [InlineData("0.12.2a", "0.12.2")]
    [InlineData("", null)]
    public void NormVersionPart_StripsDecoration(string? input, string? expected)
    {
        Assert.Equal(expected, CompatibilityTable.NormVersionPart(input));
    }

    [Fact]
    public void FileNameHasVersion_MatchesEmbeddedVersion()
    {
        Assert.True(CompatibilityTable.FileNameHasVersion("BBDevAPI_11.0.0.1.zip", "11.0.0.1"));
        Assert.False(CompatibilityTable.FileNameHasVersion("BBDevAPI_nightly.zip", "11.0.0.1"));
    }

    [Fact]
    public void SelectDevApiFile_PrefersVersionMatchThenHighestId()
    {
        var files = new List<GamebananaFile>
        {
            new(10, "api-10.2.0.1.zip", 0, "u10"),
            new(20, "api-11.0.0.1.zip", 0, "u20"),
            new(30, "api-nightly.zip", 0, "u30")
        };

        // 0.14 → 11.0.0.1, matched by file name
        Assert.Equal(20, CompatibilityTable.SelectDevApiFile(files, "0.14")!.Id);

        // explicit preference wins
        Assert.Equal(10, CompatibilityTable.SelectDevApiFile(files, "0.14", "10.2.0.1")!.Id);

        // unknown game version → highest id
        Assert.Equal(30, CompatibilityTable.SelectDevApiFile(files, "9.9")!.Id);
    }

    [Fact]
    public void SelectDevApiFile_ReturnsNullForEmptyList()
    {
        Assert.Null(CompatibilityTable.SelectDevApiFile([], "0.14"));
    }
}
