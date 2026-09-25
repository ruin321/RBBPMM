using RBBPMM.Core;

namespace RBBPMM.Core.Tests;

public class ConfigServiceTests
{
    private const string SampleCfg = """
# File level comment
# second line

[General]
# Setting type: Boolean
SomeFlag = true

# A description
# Setting type: Int32
Count = 5

# Setting type: String
# Acceptable values: A, B, C
Mode = A

# Acceptable value range: 1 to 10
Level = 3

[Advanced]
# Setting type: Single
Speed = 1.5
""";

    private static string WriteCfg(string tag, string content)
    {
        var root = TestHelpers.Tmp(tag);
        var path = Path.Combine(root, Constants.BepInExFolder, Constants.BepInExConfigFolder, "Sample.cfg");
        TestHelpers.WriteFile(path, content);
        return path;
    }

    [Fact]
    public void ParseCfgFile_CapturesFileHeadingFromFirstCommentBlock()
    {
        var parsed = ConfigService.ParseCfgFile(WriteCfg("cfg", SampleCfg));

        Assert.NotNull(parsed);
        Assert.Equal("Sample.cfg", parsed!.FileName);
        Assert.Equal("File level comment\nsecond line", parsed.Heading);
    }

    [Fact]
    public void ParseCfgFile_KeepsPerSectionHeadingsAbsentForUpstreamParity()
    {
        var parsed = ConfigService.ParseCfgFile(WriteCfg("cfg", SampleCfg))!;

        // Mirrors the Electron expression `fileHead ? undefined : head`, which never yields one.
        Assert.All(parsed.Sections, s => Assert.Null(s.Heading));
    }

    [Fact]
    public void ParseCfgFile_SplitsSectionsAndInfersControls()
    {
        var parsed = ConfigService.ParseCfgFile(WriteCfg("cfg", SampleCfg))!;

        Assert.Equal(["General", "Advanced"], parsed.Sections.Select(s => s.Name));

        var general = parsed.Sections[0].Entries;
        Assert.Equal(["SomeFlag", "Count", "Mode", "Level"], general.Select(e => e.Key));

        Assert.Equal("boolean", general[0].Control);
        Assert.Equal("true", general[0].Value);

        Assert.Equal("number", general[1].Control);
        Assert.Equal(1, general[1].Step);
        Assert.Equal("A description", general[1].Description);

        Assert.Equal("select", general[2].Control);
        Assert.Equal(["A", "B", "C"], general[2].Acceptable);

        Assert.Equal("number", general[3].Control);
        Assert.Equal(1, general[3].Min);
        Assert.Equal(10, general[3].Max);
    }

    [Fact]
    public void ParseCfgFile_InfersFloatStepFromTypeHint()
    {
        var parsed = ConfigService.ParseCfgFile(WriteCfg("cfg", SampleCfg))!;

        Assert.Equal(0.1, parsed.Sections[1].Entries[0].Step);
    }

    [Fact]
    public void ParseCfgFile_ReturnsNullForMissingFile()
    {
        var root = TestHelpers.Tmp("cfg");

        Assert.Null(ConfigService.ParseCfgFile(Path.Combine(root, "nope.cfg")));
    }

    [Fact]
    public void ParseCfgFile_HandlesCrlfAndComments()
    {
        var path = WriteCfg("cfg", "# top\r\n\r\n[Sec]\r\n# Desc\r\nKey = value\r\n");

        var parsed = ConfigService.ParseCfgFile(path)!;

        Assert.Equal("top", parsed.Heading);
        Assert.Equal("Sec", parsed.Sections[0].Name);
        Assert.Equal("value", parsed.Sections[0].Entries[0].Value);
        Assert.Equal("Desc", parsed.Sections[0].Entries[0].Description);
    }

    [Fact]
    public void ListCfgFiles_ReturnsParsedFilesSortedByName()
    {
        var root = TestHelpers.Tmp("cfg");
        var dir = Path.Combine(root, Constants.BepInExFolder, Constants.BepInExConfigFolder);
        TestHelpers.WriteFile(Path.Combine(dir, "B.cfg"), "[S]\nK = 1\n");
        TestHelpers.WriteFile(Path.Combine(dir, "A.cfg"), "[S]\nK = 2\n");
        TestHelpers.WriteFile(Path.Combine(dir, "notes.txt"), "ignore me");

        var files = ConfigService.ListCfgFiles(root);

        Assert.Equal(["A.cfg", "B.cfg"], files.Select(f => f.FileName));
    }

    [Fact]
    public void SetConfigValue_RewritesOnlyTheTargetKeyInItsSection()
    {
        var path = WriteCfg("cfg", SampleCfg);

        Assert.True(ConfigService.SetConfigValue(path, "General", "Count", "42"));

        var reparsed = ConfigService.ParseCfgFile(path)!;
        Assert.Equal("42", reparsed.Sections[0].Entries.Single(e => e.Key == "Count").Value);
        // Same key name in another section must stay untouched — there is none here, so also
        // assert the untouched neighbouring value.
        Assert.Equal("true", reparsed.Sections[0].Entries.Single(e => e.Key == "SomeFlag").Value);
    }

    [Fact]
    public void SetConfigValue_DoesNotTouchSameKeyInOtherSections()
    {
        var path = WriteCfg("cfg", "[A]\nKey = one\n\n[B]\nKey = two\n");

        Assert.True(ConfigService.SetConfigValue(path, "B", "Key", "changed"));

        var text = File.ReadAllText(path);
        Assert.Contains("Key = one", text);
        Assert.Contains("Key = changed", text);
    }

    [Fact]
    public void SetConfigValue_PreservesCrlf()
    {
        var path = WriteCfg("cfg", "[S]\r\nKey = 1\r\nOther = 2\r\n");

        Assert.True(ConfigService.SetConfigValue(path, "S", "Key", "9"));

        var text = File.ReadAllText(path);
        Assert.Contains("Key = 9\r\n", text);
        // No line ending got rewritten to a bare LF.
        Assert.DoesNotContain("\n", text.Replace("\r\n", ""));
    }

    [Fact]
    public void SetConfigValue_ReturnsFalseForUnknownKey()
    {
        var path = WriteCfg("cfg", SampleCfg);

        Assert.False(ConfigService.SetConfigValue(path, "General", "Nope", "1"));
        Assert.False(ConfigService.SetConfigValue(path, "Missing", "Count", "1"));
    }

    [Fact]
    public void IsSafeCfgPath_RejectsEscapes()
    {
        var root = TestHelpers.Tmp("cfg");
        var cfgDir = Path.Combine(root, Constants.BepInExFolder, Constants.BepInExConfigFolder);
        Directory.CreateDirectory(cfgDir);

        Assert.True(ConfigService.IsSafeCfgPath(root, Path.Combine(cfgDir, "ok.cfg")));
        Assert.False(ConfigService.IsSafeCfgPath(root, cfgDir));
        Assert.False(ConfigService.IsSafeCfgPath(root, Path.Combine(root, "outside.cfg")));
        Assert.False(ConfigService.IsSafeCfgPath(root, Path.Combine(cfgDir, "..", "..", "evil.cfg")));
    }

    [Fact]
    public void DeleteConfigFile_RefusesPathsOutsideConfigDir()
    {
        var root = TestHelpers.Tmp("cfg");
        var cfgDir = Path.Combine(root, Constants.BepInExFolder, Constants.BepInExConfigFolder);
        Directory.CreateDirectory(cfgDir);
        var outside = Path.Combine(root, "keep.cfg");
        TestHelpers.WriteFile(outside, "x");

        Assert.False(ConfigService.DeleteConfigFile(root, outside));
        Assert.True(File.Exists(outside));

        var inside = Path.Combine(cfgDir, "gone.cfg");
        TestHelpers.WriteFile(inside, "x");
        Assert.True(ConfigService.DeleteConfigFile(root, inside));
        Assert.False(File.Exists(inside));
    }
}
