using System.Text;
using RBBPMM.Core;

namespace RBBPMM.Core.Tests;

public class CustomLevelServiceTests
{
    private static byte[] BuildPbpl(string name, string author, string type, bool withPng)
    {
        using var ms = new MemoryStream();

        void Push(string s)
        {
            ms.WriteByte((byte)s.Length);
            ms.Write(Encoding.Latin1.GetBytes(s));
        }

        Push(name);
        Push(author);
        Push(type);

        if (withPng)
        {
            ms.Write([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            ms.Write(Encoding.ASCII.GetBytes("IEND"));
            ms.Write([0, 0, 0, 0]);
        }

        return ms.ToArray();
    }

    /// <summary>Runs <paramref name="body"/> with Playables pointed at a throwaway folder.</summary>
    private static void WithPlayables(Action<string> body)
    {
        var playables = TestHelpers.Tmp("playables");
        var previous = CustomLevelService.PlayablesPathOverride;
        CustomLevelService.PlayablesPathOverride = playables;
        try
        {
            body(playables);
        }
        finally
        {
            CustomLevelService.PlayablesPathOverride = previous;
        }
    }

    private static async Task WithPlayablesAsync(Func<string, Task> body)
    {
        var playables = TestHelpers.Tmp("playables");
        var previous = CustomLevelService.PlayablesPathOverride;
        CustomLevelService.PlayablesPathOverride = playables;
        try
        {
            await body(playables);
        }
        finally
        {
            CustomLevelService.PlayablesPathOverride = previous;
        }
    }

    [Fact]
    public void CollectStrings_ReadsLengthPrefixedPrintableRuns()
    {
        var buf = new List<byte>();
        foreach (var s in new[] { "one", "two" })
        {
            buf.Add((byte)s.Length);
            buf.AddRange(Encoding.ASCII.GetBytes(s));
        }
        buf.Add(0x00);
        buf.Add(0xFF);

        var strings = CustomLevelService.CollectStrings([.. buf], buf.Count);

        Assert.Equal(["one", "two"], strings);
    }

    [Fact]
    public void ReadCustomLevel_ExtractsNameAuthorTypeAndThumbnail()
    {
        var dir = TestHelpers.Tmp("pbpl");
        var path = Path.Combine(dir, "level.pbpl");
        File.WriteAllBytes(path, BuildPbpl("MyLevel", "SomeAuthor", "standard", withPng: true));

        var level = CustomLevelService.ReadCustomLevel(path, new FileInfo(path).Length);

        Assert.NotNull(level);
        Assert.Equal("MyLevel", level!.Name);
        Assert.Equal("SomeAuthor", level.Author);
        Assert.Equal("standard", level.Type);
        Assert.NotNull(level.Thumbnail);
        Assert.StartsWith("data:image/png;base64,", level.Thumbnail!);
    }

    [Fact]
    public void ReadCustomLevel_ReturnsNullForMissingFile()
    {
        var dir = TestHelpers.Tmp("pbpl");

        Assert.Null(CustomLevelService.ReadCustomLevel(Path.Combine(dir, "nope.pbpl"), 0));
    }

    [Fact]
    public void ReadCustomLevel_WorksWithoutEmbeddedPng()
    {
        var dir = TestHelpers.Tmp("pbpl");
        var path = Path.Combine(dir, "level.pbpl");
        File.WriteAllBytes(path, BuildPbpl("BareLevel", "Author", "standard", withPng: false));

        var level = CustomLevelService.ReadCustomLevel(path, 0)!;

        Assert.Equal("BareLevel", level.Name);
        Assert.Null(level.Thumbnail);
    }

    [Fact]
    public void ListCustomLevels_IncludesDisabledVariants()
    {
        WithPlayables(playables =>
        {
            File.WriteAllBytes(Path.Combine(playables, "MyLevel.pbpl"),
                BuildPbpl("MyLevel", "Author", "standard", withPng: false));
            File.WriteAllBytes(Path.Combine(playables, "Other.pbpl.disabled"),
                BuildPbpl("OtherLevel", "Author", "standard", withPng: false));
            TestHelpers.WriteFile(Path.Combine(playables, "notes.txt"), "ignore");

            var levels = CustomLevelService.ListCustomLevels();

            Assert.Equal(2, levels.Count);

            var enabled = levels.Single(l => l.FileName == "MyLevel.pbpl");
            Assert.True(enabled.Enabled);
            Assert.Equal("MyLevel", enabled.Name);

            var disabled = levels.Single(l => l.FileName == "Other.pbpl");
            Assert.False(disabled.Enabled);
        });
    }

    [Fact]
    public void ToggleCustomLevel_RenamesBothWays()
    {
        WithPlayables(playables =>
        {
            var path = Path.Combine(playables, "MyLevel.pbpl");
            File.WriteAllBytes(path, BuildPbpl("MyLevel", "Author", "standard", withPng: false));

            CustomLevelService.ToggleCustomLevel("MyLevel.pbpl", false);
            Assert.False(File.Exists(path));
            Assert.True(File.Exists(path + ".disabled"));

            CustomLevelService.ToggleCustomLevel("MyLevel.pbpl", true);
            Assert.True(File.Exists(path));
            Assert.False(File.Exists(path + ".disabled"));
        });
    }

    [Fact]
    public void ToggleCustomLevel_ThrowsWhenLevelMissing()
    {
        WithPlayables(_ =>
        {
            Assert.Throws<FileNotFoundException>(() => CustomLevelService.ToggleCustomLevel("Ghost.pbpl", false));
        });
    }

    [Fact]
    public void DeleteCustomLevel_RemovesEnabledAndDisabledVariants()
    {
        WithPlayables(playables =>
        {
            var path = Path.Combine(playables, "MyLevel.pbpl");
            File.WriteAllBytes(path, BuildPbpl("MyLevel", "Author", "standard", withPng: false));
            CustomLevelService.ToggleCustomLevel("MyLevel.pbpl", false);

            CustomLevelService.DeleteCustomLevel("MyLevel.pbpl");

            Assert.False(File.Exists(path));
            Assert.False(File.Exists(path + ".disabled"));
        });
    }

    [Fact]
    public async Task InstallLevelStudioPlayable_CopiesPbplFiles()
    {
        await WithPlayablesAsync(async playables =>
        {
            var extract = TestHelpers.Tmp("extract");
            File.WriteAllBytes(Path.Combine(extract, "Cool.pbpl"),
                BuildPbpl("Cool", "Author", "standard", withPng: false));

            var result = await LevelStudioInstaller.InstallLevelStudioPlayableAsync(extract);

            Assert.Equal(["Cool.pbpl"], result.Playables);
            Assert.True(File.Exists(Path.Combine(playables, "Cool.pbpl")));
        });
    }

    [Fact]
    public async Task InstallLevelStudioPlayable_FallsBackToNestedFolderContents()
    {
        await WithPlayablesAsync(async playables =>
        {
            var extract = TestHelpers.Tmp("extract");
            TestHelpers.WriteFile(Path.Combine(extract, "MyLevel", "readme.md"), "docs");
            TestHelpers.WriteFile(Path.Combine(extract, "MyLevel", "data.bin"), "payload");

            var result = await LevelStudioInstaller.InstallLevelStudioPlayableAsync(extract);

            Assert.Equal(["data.bin"], result.Playables);
            Assert.True(File.Exists(Path.Combine(playables, "data.bin")));
            // Readmes are reported, not copied. Upstream parity: the recursion rebases `root`,
            // so names are relative to the folder the readme sits in, not the archive root.
            Assert.DoesNotContain("readme.md", result.Playables);
            Assert.Equal("readme.md", Assert.Single(result.Readmes).Name);
        });
    }

    [Fact]
    public void StripDisabled_HandlesBothShapes()
    {
        Assert.Equal("A.pbpl", CustomLevelService.StripDisabled("A.pbpl.disabled"));
        Assert.Equal("A.pbpl", CustomLevelService.StripDisabled("A.pbpl"));
    }
}
