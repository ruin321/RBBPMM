using System.IO.Compression;

namespace RBBPMM.Core.Tests;

public class ModArchiveExtractorTests
{
    [Fact]
    public void StartsWithZipMagic_DetectsPkHeader()
    {
        var zip = Path.Combine(TestHelpers.Tmp("z"), "a.zip");
        TestHelpers.MakeZip(zip, new Dictionary<string, string> { ["x.txt"] = "hi" });
        Assert.True(ModArchiveExtractor.StartsWithZipMagic(zip));
        Assert.True(ModArchiveExtractor.IsZipFormat(zip));
    }

    [Fact]
    public void ExtractZip_WritesEntriesAndRejectsTraversal()
    {
        var root = TestHelpers.Tmp("zx");
        var zip = Path.Combine(TestHelpers.Tmp("zxz"), "good.zip");
        TestHelpers.MakeZip(zip, new Dictionary<string, string>
        {
            ["folder/file.txt"] = "data",
            ["top.txt"] = "x"
        });
        ModArchiveExtractor.ExtractZip(zip, root);
        Assert.True(File.Exists(Path.Combine(root, "folder", "file.txt")));
        Assert.True(File.Exists(Path.Combine(root, "top.txt")));
    }

    [Fact]
    public void ExtractZip_RejectsPathTraversalEntry()
    {
        var zip = Path.Combine(TestHelpers.Tmp("zt"), "evil.zip");
        using (var z = ZipFile.Open(zip, ZipArchiveMode.Create))
        {
            var e = z.CreateEntry("../escape.txt");
            using var w = new StreamWriter(e.Open());
            w.Write("bad");
        }
        var root = TestHelpers.Tmp("ztr");
        Assert.Throws<InvalidOperationException>(() => ModArchiveExtractor.ExtractZip(zip, root));
    }

    [Fact]
    public void LocateGmpRoot_PivotsSinglePackUp()
    {
        var root = TestHelpers.Tmp("lg");
        var zip = Path.Combine(Path.GetTempPath(), $"wrap_{Guid.NewGuid():N}.zip");
        using (var z = ZipFile.Open(zip, ZipArchiveMode.Create))
        {
            var m = z.CreateEntry($"Mod/Cool/{Constants.GmpMetadataFolder}/{Constants.ManifestFile}");
            using (var w = new StreamWriter(m.Open())) w.Write("{}");
            var p = z.CreateEntry("Mod/Cool/plugin.dll");
            using (var w = new StreamWriter(p.Open())) w.Write("x");
        }
        ModArchiveExtractor.ExtractArchive(zip, root);
        Assert.True(Directory.Exists(Path.Combine(root, "Mod", "Cool", Constants.GmpMetadataFolder)));
        Assert.True(File.Exists(Path.Combine(root, "plugin.dll")));
    }
}
