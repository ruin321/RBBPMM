namespace RBBPMM.Core.Tests;

public class ModActivatorTests
{
    [Fact]
    public void DllStem_StripsExtensionsAndSuffixes()
    {
        Assert.Equal("Foo", ModActivator.DllStem("Foo.dll"));
        Assert.Equal("Foo", ModActivator.DllStem("Foo.disabled"));
        Assert.Equal("Foo", ModActivator.DllStem("Foo.dll.disabled"));
        Assert.Equal("Foo", ModActivator.DllStem("Foo.dll.1"));
        Assert.Equal("Foo.Bar", ModActivator.DllStem("Foo.Bar.dll"));
    }

    [Fact]
    public void ToggleLegacyPlugin_DisablesAndReenables()
    {
        var dir = TestHelpers.Tmp("act");
        TestHelpers.WriteFile(Path.Combine(dir, "Foo.dll"));
        var off = ModActivator.ToggleLegacyPlugin(dir, ["Foo.dll"], activate: false);
        Assert.False(off.Activated);
        Assert.Contains("Foo.dll", off.PluginFiles);
        Assert.False(File.Exists(Path.Combine(dir, "Foo.dll")));
        Assert.True(File.Exists(Path.Combine(dir, "Foo.disabled")));

        var on = ModActivator.ToggleLegacyPlugin(dir, ["Foo.dll"], activate: true);
        Assert.True(on.Activated);
        Assert.True(File.Exists(Path.Combine(dir, "Foo.dll")));
        Assert.False(File.Exists(Path.Combine(dir, "Foo.disabled")));
    }

    [Fact]
    public void ToggleActivation_UpdatesMetadataAndRenames()
    {
        var root = TestHelpers.Tmp("act2");
        TestHelpers.WriteFile(Path.Combine(root, "CoolMod.dll"));
        var metaFolder = Path.Combine(root, Constants.GmpMetadataFolder);
        Directory.CreateDirectory(metaFolder);
        File.WriteAllText(Path.Combine(metaFolder, Constants.ManifestFile),
            """{"guid":"g","name":"n","author":"a","version":"1","plugins":["CoolMod.dll"],"patchers":[]}""");
        var manifest = ManifestLoader.LoadModManifest(root)!;

        var disabled = ModActivator.ToggleActivation(root, root, manifest, activate: false);
        Assert.False(disabled);
        Assert.True(File.Exists(Path.Combine(root, "CoolMod.disabled")));
        Assert.False(ManifestLoader.LoadMetadata(root).Activated);

        var enabled = ModActivator.ToggleActivation(root, root, manifest, activate: true);
        Assert.True(enabled);
        Assert.True(File.Exists(Path.Combine(root, "CoolMod.dll")));
        Assert.True(ManifestLoader.LoadMetadata(root).Activated);
    }
}
