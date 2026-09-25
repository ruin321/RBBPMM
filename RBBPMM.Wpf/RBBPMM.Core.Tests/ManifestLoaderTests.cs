using System.Text.Json.Nodes;

namespace RBBPMM.Core.Tests;

public class ManifestLoaderTests
{
    [Fact]
    public void ParseManifest_RequiresRequiredFields()
    {
        var ok = JsonNode.Parse("""{"guid":"g","name":"n","author":"a","version":"1.0"}""");
        Assert.NotNull(ManifestLoader.ParseManifest(ok));
        var missing = JsonNode.Parse("""{"guid":"g","name":"n"}""");
        Assert.Null(ManifestLoader.ParseManifest(missing));
        var empty = JsonNode.Parse("{}");
        Assert.Null(ManifestLoader.ParseManifest(empty));
    }

    [Fact]
    public void ParseManifest_CoercesArrays()
    {
        var node = JsonNode.Parse("""{"guid":"g","name":"n","author":"a","version":"1","assets":[{"localPath":"a/b","destination":"c/d"}],"plugins":["P.dll"],"patchers":["Q.dll"]}""");
        var m = ManifestLoader.ParseManifest(node)!;
        Assert.Single(m.Assets);
        Assert.Equal("c/d", m.Assets[0].Destination);
        Assert.Equal("P.dll", m.Plugins[0]);
        Assert.Equal("Q.dll", m.Patchers[0]);
    }

    [Fact]
    public void LoadAndSaveMetadata_RoundTrips()
    {
        var root = TestHelpers.Tmp("ml");
        var metaFolder = Path.Combine(root, Constants.GmpMetadataFolder);
        Directory.CreateDirectory(metaFolder);
        File.WriteAllText(Path.Combine(metaFolder, Constants.ManifestFile),
            """{"guid":"g","name":"n","author":"a","version":"1"}""");
        var loaded = ManifestLoader.LoadModManifest(root);
        Assert.NotNull(loaded);
        Assert.Equal("g", loaded!.Guid);

        var meta = new ModMetadata { Activated = false, SupportedPlusVersions = ["0.10", "0.11"] };
        ManifestLoader.SaveMetadata(root, meta);
        var reread = ManifestLoader.LoadMetadata(root);
        Assert.False(reread.Activated);
        Assert.Equal(2, reread.SupportedPlusVersions.Count);
    }

    [Fact]
    public void MatchSupportedVersion_EmptyMeansAny()
    {
        var root = TestHelpers.Tmp("ml2");
        var metaFolder = Path.Combine(root, Constants.GmpMetadataFolder);
        Directory.CreateDirectory(metaFolder);
        File.WriteAllText(Path.Combine(metaFolder, Constants.ManifestFile),
            """{"guid":"g","name":"n","author":"a","version":"1"}""");
        Assert.True(ManifestLoader.MatchSupportedVersion(root, null));
        Assert.True(ManifestLoader.MatchSupportedVersion(root, "9.9"));
        File.WriteAllText(Path.Combine(metaFolder, Constants.SupportedVersionPrefix + "0.10_0.11"), "");
        Assert.True(ManifestLoader.MatchSupportedVersion(root, "0.11"));
        Assert.False(ManifestLoader.MatchSupportedVersion(root, "0.9"));
    }

    [Fact]
    public void HasManifest_DetectsBothFolders()
    {
        var root = TestHelpers.Tmp("ml3");
        Assert.False(ManifestLoader.HasManifest(root));
        Directory.CreateDirectory(Path.Combine(root, Constants.GmpMetadataFolder));
        Assert.False(ManifestLoader.HasManifest(root));
        File.WriteAllText(Path.Combine(root, Constants.GmpMetadataFolder, Constants.ManifestFile), "{}");
        Assert.True(ManifestLoader.HasManifest(root));
    }
}
