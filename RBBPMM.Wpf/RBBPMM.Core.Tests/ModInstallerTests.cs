namespace RBBPMM.Core.Tests;

public class ModInstallerTests
{
    [Fact]
    public void InstallUnmanaged_CopiesModdedAndPlugins()
    {
        var gameRoot = TestHelpers.Tmp("inst");
        var extract = TestHelpers.Tmp("instx");
        TestHelpers.WriteFile(Path.Combine(extract, "BepInEx", "plugins", "MyMod.dll"));
        Directory.CreateDirectory(Path.Combine(extract, "BALDI_Data", "StreamingAssets", "Modded", "SomeMod"));

        var name = ModInstaller.InstallUnmanaged(extract, gameRoot);
        Assert.Equal("MyMod", name);
        Assert.True(File.Exists(Path.Combine(gameRoot, "BepInEx", "plugins", "MyMod.dll")));
        Assert.True(Directory.Exists(Path.Combine(gameRoot, "BALDI_Data", "StreamingAssets", "Modded", "SomeMod")));
    }

    [Fact]
    public void InstallUnmanaged_RollsBackOnCancel()
    {
        var gameRoot = TestHelpers.Tmp("instc");
        var extract = TestHelpers.Tmp("instcx");
        TestHelpers.WriteFile(Path.Combine(extract, "BepInEx", "plugins", "MyMod.dll"));
        Directory.CreateDirectory(Path.Combine(extract, "BALDI_Data", "StreamingAssets", "Modded", "SomeMod"));

        var calls = 0;
        bool Cancel() => ++calls >= 2; // allow modded, cancel before plugins

        Assert.Throws<OperationCanceledException>(() =>
            ModInstaller.InstallUnmanaged(extract, gameRoot, isCancelled: Cancel));

        Assert.False(Directory.Exists(Path.Combine(gameRoot, "BALDI_Data", "StreamingAssets", "Modded", "SomeMod")));
        Assert.False(File.Exists(Path.Combine(gameRoot, "BepInEx", "plugins", "MyMod.dll")));
    }

    [Fact]
    public void InstallUnmanaged_ThrowsWhenNothingToInstall()
    {
        var gameRoot = TestHelpers.Tmp("instn");
        var extract = TestHelpers.Tmp("instnx");
        TestHelpers.WriteFile(Path.Combine(extract, "readme.txt"));
        Assert.Throws<InvalidOperationException>(() => ModInstaller.InstallUnmanaged(extract, gameRoot));
    }

    [Fact]
    public void InstallModArchive_InstallsAndWritesMetadata()
    {
        var gameRoot = TestHelpers.Tmp("instm");
        var extract = TestHelpers.Tmp("instmx");
        var gmp = Path.Combine(extract, Constants.GmpMetadataFolder);
        Directory.CreateDirectory(gmp);
        File.WriteAllText(Path.Combine(gmp, Constants.ManifestFile),
            """{"guid":"com.test.mod","name":"Test Mod","author":"Me","version":"1.2","plugins":["TestMod.dll"],"patchers":[],"assets":[]}""");
        TestHelpers.WriteFile(Path.Combine(extract, "TestMod.dll"));

        var dirName = StableHash.GetModDirectoryName("com.test.mod", "Test Mod", "Me");
        var result = ModInstaller.InstallModArchive(gameRoot, extract, preExtractedRoot: extract, gameVersion: "0.10");
        Assert.Equal("Test Mod", result.Manifest.Name);
        Assert.True(Directory.Exists(result.InstallDir));
        Assert.True(File.Exists(Path.Combine(result.InstallDir, "TestMod.dll")));
        Assert.True(File.Exists(Path.Combine(result.InstallDir, Constants.GmpMetadataFolder, Constants.MetadataFile)));

        var meta = ManifestLoader.LoadMetadata(result.InstallDir);
        Assert.True(meta.Activated);
        Assert.Contains(dirName, result.InstallDir);
    }
}
