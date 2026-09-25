namespace RBBPMM.Core.Tests;

public class TexturePackServiceTests
{
    [Fact]
    public void FindPackDirs_LocatesPackJsonDirs()
    {
        var root = TestHelpers.Tmp("tp");
        var pack = Path.Combine(root, "MyPack");
        Directory.CreateDirectory(pack);
        TestHelpers.WriteFile(Path.Combine(pack, Constants.TexturePackManifest), """{"Name":"My Pack"}""");
        var nested = Path.Combine(root, "Outer", "Inner");
        Directory.CreateDirectory(nested);
        TestHelpers.WriteFile(Path.Combine(nested, Constants.TexturePackManifest));
        var dirs = TexturePackService.FindPackDirs(root);
        Assert.Contains(pack, dirs);
        Assert.Contains(nested, dirs);
    }

    [Fact]
    public void HasModStructureInRoot_DetectsBepInExOrModded()
    {
        var root = TestHelpers.Tmp("tp2");
        Directory.CreateDirectory(Path.Combine(root, "BepInEx", "plugins"));
        Assert.True(TexturePackService.HasModStructureInRoot(root));
        var clean = TestHelpers.Tmp("tp2b");
        TestHelpers.WriteFile(Path.Combine(clean, "readme.txt"));
        Assert.False(TexturePackService.HasModStructureInRoot(clean));
    }

    [Fact]
    public void ListTexturePacks_ReadsPackJson()
    {
        var gameRoot = TestHelpers.Tmp("tp3");
        var packs = Path.Combine(gameRoot, "BALDI_Data", "StreamingAssets", "Texture Packs");
        var pack = Path.Combine(packs, "CoolPack");
        Directory.CreateDirectory(pack);
        TestHelpers.WriteFile(Path.Combine(pack, Constants.TexturePackManifest),
            """{"Name":"Cool Pack","Author":"Z","Version":"2.0"}""");

        var list = TexturePackService.ListTexturePacks(gameRoot);
        var found = Assert.Single(list);
        Assert.Equal("CoolPack", found.FolderName);
        Assert.Equal("Cool Pack", found.Name);
        Assert.Equal("Z", found.Author);
        Assert.Equal("2.0", found.Version);
    }

    [Fact]
    public void UninstallTexturePack_RefusesProtected()
    {
        var gameRoot = TestHelpers.Tmp("tp4");
        Assert.Throws<InvalidOperationException>(() =>
            TexturePackService.UninstallTexturePack(gameRoot, "core"));
    }

    [Fact]
    public async Task InstallTexturePacksFromRoot_CopiesPackFolders()
    {
        var gameRoot = TestHelpers.Tmp("tp5");
        var extract = TestHelpers.Tmp("tp5x");
        var pack = Path.Combine(extract, "NewPack");
        Directory.CreateDirectory(pack);
        TestHelpers.WriteFile(Path.Combine(pack, Constants.TexturePackManifest), """{"Name":"New"}""");
        TestHelpers.WriteFile(Path.Combine(pack, "tex.png"));

        var result = await TexturePackService.InstallTexturePacksFromRoot(gameRoot, extract, "fallback");
        Assert.Single(result.Installed);
        Assert.True(Directory.Exists(Path.Combine(gameRoot, "BALDI_Data", "StreamingAssets", "Texture Packs", "NewPack")));
    }
}
