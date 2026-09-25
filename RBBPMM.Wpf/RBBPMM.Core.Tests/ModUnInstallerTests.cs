namespace RBBPMM.Core.Tests;

public class ModUnInstallerTests
{
    [Fact]
    public void DeleteMod_RemovesInstallDirAndConfig_LeavesUnrelated()
    {
        var gameRoot = TestHelpers.Tmp("un");
        var installDir = Path.Combine(gameRoot, "BepInEx", "plugins", "CoolMod");
        Directory.CreateDirectory(installDir);
        TestHelpers.WriteFile(Path.Combine(installDir, "data.txt"));
        TestHelpers.WriteFile(Path.Combine(gameRoot, "BepInEx", "plugins", "Other.dll"));
        Directory.CreateDirectory(Path.Combine(gameRoot, "BepInEx", "config"));
        TestHelpers.WriteFile(Path.Combine(gameRoot, "BepInEx", "config", "CoolMod.cfg"));

        var manifest = new ModManifest
        {
            Guid = "g",
            Name = "CoolMod",
            Author = "a",
            Version = "1",
            Plugins = ["CoolMod.dll"],
            Patchers = [],
            Assets = []
        };
        ModUnInstaller.DeleteMod(gameRoot, installDir, manifest);

        Assert.False(Directory.Exists(installDir));
        Assert.False(File.Exists(Path.Combine(gameRoot, "BepInEx", "config", "CoolMod.cfg")));
        Assert.True(File.Exists(Path.Combine(gameRoot, "BepInEx", "plugins", "Other.dll")));
    }

    [Fact]
    public void DeleteMod_BackupFolderCleanedUp()
    {
        var gameRoot = TestHelpers.Tmp("un2");
        var installDir = Path.Combine(gameRoot, "BepInEx", "plugins", "M");
        Directory.CreateDirectory(installDir);
        var manifest = new ModManifest
        {
            Guid = "g",
            Name = "M",
            Author = "a",
            Version = "1",
            Plugins = ["M.dll"],
            Patchers = [],
            Assets = []
        };
        ModUnInstaller.DeleteMod(gameRoot, installDir, manifest);
        var backupBase = Path.Combine(gameRoot, Constants.GmpMetadataFolder, Constants.TempFolder);
        Assert.False(Directory.Exists(backupBase) && Directory.GetFileSystemEntries(backupBase).Length > 0);
    }

    [Fact]
    public void DeleteLegacyPlugin_RemovesMatchedDll()
    {
        var gameRoot = TestHelpers.Tmp("un3");
        var plugins = Path.Combine(gameRoot, "BepInEx", "plugins");
        Directory.CreateDirectory(plugins);
        TestHelpers.WriteFile(Path.Combine(plugins, "Legacy.dll"));
        TestHelpers.WriteFile(Path.Combine(plugins, "Keep.dll"));
        ModUnInstaller.DeleteLegacyPlugin(gameRoot, plugins, ["Legacy.dll"]);
        Assert.False(File.Exists(Path.Combine(plugins, "Legacy.dll")));
        Assert.True(File.Exists(Path.Combine(plugins, "Keep.dll")));
    }
}
