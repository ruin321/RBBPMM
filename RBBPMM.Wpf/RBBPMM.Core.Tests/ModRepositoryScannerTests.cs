using RBBPMM.Core;

namespace RBBPMM.Core.Tests;

public class ModRepositoryScannerTests
{
    private static string GameRoot(string tag)
    {
        var root = TestHelpers.Tmp(tag);
        Directory.CreateDirectory(Constants.BepinexPluginsDir(root));
        return root;
    }

    private static string Plugins(string root) => Constants.BepinexPluginsDir(root);

    private static void WriteManifest(string modDir, string json) =>
        TestHelpers.WriteFile(Path.Combine(modDir, Constants.GmpMetadataFolder, Constants.ManifestFile), json);

    [Fact]
    public void ScanRepository_ReadsManagedModFromManifest()
    {
        var root = GameRoot("scan");
        var modDir = Path.Combine(Plugins(root), "MyMod");
        WriteManifest(modDir,
            """{"guid":"com.example.MyMod","name":"My Mod","author":"Me","version":"1.0.0","plugins":["MyMod.dll"]}""");
        TestHelpers.WriteFile(Path.Combine(modDir, "MyMod.dll"), "dll");

        var item = Assert.Single(ModRepositoryScanner.ScanRepository(root, "0.14"));

        Assert.Equal("My Mod", item.Name);
        Assert.Equal("com.example.MyMod", item.Guid);
        Assert.Equal("Me", item.Author);
        Assert.Equal("1.0.0", item.Version);
        Assert.Equal(["MyMod.dll"], item.PluginFiles);
        Assert.True(item.Activated);
        Assert.True(item.SupportsCurrentVersion);
        Assert.False(item.Loose);
        Assert.Equal("MyMod", item.DirectoryName);
        Assert.NotNull(item.InstalledAt);
    }

    [Fact]
    public void ScanRepository_SupportsVersionGateViaSupVerFiles()
    {
        var root = GameRoot("scan");
        var modDir = Path.Combine(Plugins(root), "Gated");
        WriteManifest(modDir,
            """{"guid":"g","name":"Gated","author":"a","version":"1","plugins":[]}""");
        TestHelpers.WriteFile(
            Path.Combine(modDir, Constants.GmpMetadataFolder, Constants.SupportedVersionPrefix + "0.13_0.13.1"), "");

        Assert.True(ModRepositoryScanner.ScanRepository(root, "0.13.1")[0].SupportsCurrentVersion);
        Assert.False(ModRepositoryScanner.ScanRepository(root, "0.14")[0].SupportsCurrentVersion);
    }

    [Fact]
    public void ScanRepository_GroupsLegacyPluginsByStem()
    {
        var root = GameRoot("scan");
        var sub = Path.Combine(Plugins(root), "LegacyFolder");
        TestHelpers.WriteFile(Path.Combine(sub, "Cool.dll"), "dll");
        TestHelpers.WriteFile(Path.Combine(sub, "Other.disabled"), "dll");

        var mods = ModRepositoryScanner.ScanRepository(root);

        Assert.Equal(2, mods.Count);

        var cool = mods.Single(m => m.Name == "Cool");
        Assert.Equal("legacy:LegacyFolder/Cool", cool.Guid);
        Assert.Equal("LegacyFolder", cool.Group);
        Assert.Equal(sub, cool.InstallDir);
        Assert.True(cool.Activated);
        Assert.False(cool.Loose);

        // A disabled plugin keeps its logical name; the disk state lives on Activated.
        var other = mods.Single(m => m.Name == "Other");
        Assert.Equal(["Other.dll"], other.PluginFiles);
        Assert.False(other.Activated);
    }

    [Fact]
    public void ScanRepository_KeepsNestedRelativePathForPlugins()
    {
        var root = GameRoot("scan");
        var sub = Path.Combine(Plugins(root), "Folder");
        TestHelpers.WriteFile(Path.Combine(sub, "nested", "Deep.dll"), "dll");

        var item = Assert.Single(ModRepositoryScanner.ScanRepository(root));

        Assert.Equal([Path.Combine("nested", "Deep.dll")], item.PluginFiles);
    }

    [Fact]
    public void ScanRepository_TreatsLooseRootDllsAsUngrouped()
    {
        var root = GameRoot("scan");
        TestHelpers.WriteFile(Path.Combine(Plugins(root), "Loose.dll"), "dll");

        var item = Assert.Single(ModRepositoryScanner.ScanRepository(root));

        Assert.Equal("legacy:Loose", item.Guid);
        Assert.Equal("Loose", item.Name);
        Assert.Null(item.Group);
        Assert.True(item.Loose);
        Assert.True(item.Activated);
    }

    [Fact]
    public void ScanRepository_DoesNotRelistDllsAlreadyClaimedByAManifest()
    {
        var root = GameRoot("scan");
        var modDir = Path.Combine(Plugins(root), "MyMod");
        WriteManifest(modDir,
            """{"guid":"g","name":"My Mod","author":"a","version":"1","plugins":["Shared.dll"]}""");
        TestHelpers.WriteFile(Path.Combine(modDir, "Shared.dll"), "dll");
        TestHelpers.WriteFile(Path.Combine(Plugins(root), "Shared.dll"), "dll");

        var item = Assert.Single(ModRepositoryScanner.ScanRepository(root));

        Assert.Equal("My Mod", item.Name);
    }

    [Fact]
    public void ScanRepository_IgnoresDotFolders()
    {
        var root = GameRoot("scan");
        TestHelpers.WriteFile(Path.Combine(Plugins(root), ".hidden", "Ghost.dll"), "dll");

        Assert.Empty(ModRepositoryScanner.ScanRepository(root));
    }

    [Fact]
    public void ScanRepository_LinksLegacyModToModdedFolderByName()
    {
        var root = GameRoot("scan");
        TestHelpers.WriteFile(Path.Combine(Plugins(root), "LegacyMod", "LegacyMod.dll"), "not a real assembly");
        var modded = Path.Combine(ModRepositoryScanner.ModdedRoot(root), "LegacyMod");
        TestHelpers.WriteFile(Path.Combine(modded, "level.dat"), "data");

        var item = Assert.Single(ModRepositoryScanner.ScanRepository(root));

        Assert.Equal(modded, item.ModdedFolder);
    }

    [Fact]
    public void ScanRepository_MatchesConfigFileByPluginStem()
    {
        var root = GameRoot("scan");
        TestHelpers.WriteFile(Path.Combine(Plugins(root), "CoolMod.dll"), "dll");
        var cfg = Path.Combine(root, Constants.BepInExFolder, Constants.BepInExConfigFolder, "CoolMod.cfg");
        TestHelpers.WriteFile(cfg, "[General]\nKey = 1\n");

        var item = Assert.Single(ModRepositoryScanner.ScanRepository(root));

        Assert.Equal(cfg, item.ConfigFile);
    }

    [Fact]
    public void ScanRepository_ReturnsEmptyWhenPluginsFolderMissing()
    {
        var root = TestHelpers.Tmp("scan");

        Assert.Empty(ModRepositoryScanner.ScanRepository(root));
    }

    [Fact]
    public void ScanRepositoryCached_ReusesUntilInvalidated()
    {
        var root = GameRoot("scan");
        TestHelpers.WriteFile(Path.Combine(Plugins(root), "A.dll"), "x");

        Assert.Single(ModRepositoryScanner.ScanRepositoryCached(root, "0.14"));

        TestHelpers.WriteFile(Path.Combine(Plugins(root), "B.dll"), "x");
        Assert.Single(ModRepositoryScanner.ScanRepositoryCached(root, "0.14"));

        ModRepositoryScanner.InvalidateModScan(root, "0.14");
        Assert.Equal(2, ModRepositoryScanner.ScanRepositoryCached(root, "0.14").Count);
    }

    [Fact]
    public void InvalidateModScan_WithoutVersionDropsEveryEntryForRoot()
    {
        var root = GameRoot("scan");
        TestHelpers.WriteFile(Path.Combine(Plugins(root), "A.dll"), "x");

        ModRepositoryScanner.ScanRepositoryCached(root, "0.13");
        ModRepositoryScanner.ScanRepositoryCached(root, "0.14");
        TestHelpers.WriteFile(Path.Combine(Plugins(root), "B.dll"), "x");

        ModRepositoryScanner.InvalidateModScan(root);

        Assert.Equal(2, ModRepositoryScanner.ScanRepositoryCached(root, "0.13").Count);
        Assert.Equal(2, ModRepositoryScanner.ScanRepositoryCached(root, "0.14").Count);
    }

    [Fact]
    public void PatchModScanEntry_UpdatesCachedCopyInPlace()
    {
        var root = GameRoot("scan");
        TestHelpers.WriteFile(Path.Combine(Plugins(root), "A.dll"), "x");
        var guid = Assert.Single(ModRepositoryScanner.ScanRepositoryCached(root, "0.14")).Guid;

        var hit = ModRepositoryScanner.PatchModScanEntry(root, guid, m => m with { Activated = false });

        Assert.True(hit);
        Assert.False(ModRepositoryScanner.ScanRepositoryCached(root, "0.14").Single(m => m.Guid == guid).Activated);
    }

    [Fact]
    public void PatchModScanEntry_ReportsMissForUnknownGuid()
    {
        var root = GameRoot("scan");
        TestHelpers.WriteFile(Path.Combine(Plugins(root), "A.dll"), "x");
        ModRepositoryScanner.ScanRepositoryCached(root, "0.14");

        Assert.False(ModRepositoryScanner.PatchModScanEntry(root, "legacy:ghost", m => m));
    }

    [Theory]
    [InlineData("Cool", "Some.Author.Cool", 3)]
    [InlineData("Cool", "Some.Author.CoolMod", 2)]
    [InlineData("CoolMod", "Some.Author.Cool", 2)]
    [InlineData("Totally", "Unrelated.Thing.Here", 0)]
    public void TitleMatchScore_ScoresProgressiveMatches(string title, string guid, int expected)
    {
        Assert.Equal(expected, ModRepositoryScanner.TitleMatchScore(title, guid));
    }

    [Fact]
    public void PluginDiskPath_FindsDisabledVariant()
    {
        var dir = TestHelpers.Tmp("scan");
        var disabled = Path.Combine(dir, "Cool.dll.disabled");
        TestHelpers.WriteFile(disabled, "x");

        Assert.Equal(disabled, ModRepositoryScanner.PluginDiskPath(dir, "Cool.dll"));
    }
}
