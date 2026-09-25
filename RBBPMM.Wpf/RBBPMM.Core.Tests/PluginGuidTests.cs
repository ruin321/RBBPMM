using System.Text;
using RBBPMM.Core;

namespace RBBPMM.Core.Tests;

public class PluginGuidTests
{
    [Fact]
    public void ScanTokens_KeepsPlausibleDottedIdentifiers()
    {
        var (utf16, ascii) = PluginGuid.ScanTokens("garbage aa.bb.cc more xx.yy.zz.ww end");

        Assert.Empty(utf16);
        Assert.Equal(["aa.bb.cc", "xx.yy.zz.ww"], ascii);
    }

    [Fact]
    public void ScanTokens_RejectsFewerThanThreeSegments()
    {
        var (_, ascii) = PluginGuid.ScanTokens("aa.bb");

        Assert.Empty(ascii);
    }

    [Fact]
    public void ScanTokens_TruncatesOverLongRunsToTheSegmentCap()
    {
        // The token regex itself caps at 7 segments, so the 8-segment tail is simply not matched.
        var (_, ascii) = PluginGuid.ScanTokens("aa.bb.cc.dd.ee.ff.gg.hh");

        Assert.Equal(["aa.bb.cc.dd.ee.ff.gg"], ascii);
    }

    [Theory]
    [InlineData("System.Foo.Bar")]
    [InlineData("Foo.UnityEngine.Bar")]
    [InlineData("Foo.BepInEx.Bar")]
    public void ScanTokens_RejectsFrameworkSegments(string token)
    {
        var (_, ascii) = PluginGuid.ScanTokens($"pad {token} pad");

        Assert.Empty(ascii);
    }

    [Fact]
    public void ScanTokens_RejectsNumericSegments()
    {
        var (_, ascii) = PluginGuid.ScanTokens("aa.1.cc");

        Assert.Empty(ascii);
    }

    [Theory]
    [InlineData("aa.bb.patches")]
    [InlineData("aa.bb.OptionsAPI")]
    public void ScanTokens_RejectsStopTail(string token)
    {
        var (_, ascii) = PluginGuid.ScanTokens(token);

        Assert.Empty(ascii);
    }

    [Fact]
    public void ScanTokens_RejectsStopMidSegments()
    {
        var (_, ascii) = PluginGuid.ScanTokens("aa.Manager.cc");

        Assert.Empty(ascii);
    }

    [Fact]
    public void ScanTokens_DetectsUtf16RunsAndPrefersThem()
    {
        // A UTF-16LE string, viewed through the Latin-1 decoder the scanner uses.
        var utf16Text = Encoding.Latin1.GetString(Encoding.Unicode.GetBytes("aa.bb.cc"));
        var (utf16, ascii) = PluginGuid.ScanTokens(utf16Text + " plus xx.yy.zz");

        Assert.Equal(["aa.bb.cc"], utf16);
        // ASCII-only hits exclude anything already found as UTF-16.
        Assert.Equal(["xx.yy.zz"], ascii);
    }

    [Fact]
    public void ExtractPluginCandidates_ReadsUtf16GuidFromDisk()
    {
        var dir = TestHelpers.Tmp("pluginguid");
        var dll = Path.Combine(dir, "Cool.dll");
        File.WriteAllBytes(dll, Encoding.Unicode.GetBytes("junk Some.Author.CoolMod junk"));

        var candidates = PluginGuid.ExtractPluginCandidates(dll);

        Assert.Equal("Some.Author.CoolMod", candidates[0]);
        Assert.Equal("Some.Author.CoolMod", PluginGuid.ExtractPluginGuid(dll));
    }

    [Fact]
    public void ExtractPluginCandidates_ReturnsEmptyForMissingFile()
    {
        var dir = TestHelpers.Tmp("pluginguid");

        Assert.Empty(PluginGuid.ExtractPluginCandidates(Path.Combine(dir, "nope.dll")));
    }

    [Fact]
    public void ExtractPluginCandidates_InvalidatesCacheWhenFileChanges()
    {
        var dir = TestHelpers.Tmp("pluginguid");
        var dll = Path.Combine(dir, "Cool.dll");

        File.WriteAllBytes(dll, Encoding.ASCII.GetBytes("aa.bb.cc"));
        Assert.Equal("aa.bb.cc", PluginGuid.ExtractPluginCandidates(dll)[0]);

        // different length → different cache key
        File.WriteAllBytes(dll, Encoding.ASCII.GetBytes("xx.yy.zzzzz"));
        Assert.Equal("xx.yy.zzzzz", PluginGuid.ExtractPluginCandidates(dll)[0]);
    }

    [Fact]
    public void CheckStringWithNoiseYieldsNothing()
    {
        var (utf16, ascii) = PluginGuid.ScanTokens("just some words with no dotted ids at all");

        Assert.Empty(utf16);
        Assert.Empty(ascii);
    }
}
