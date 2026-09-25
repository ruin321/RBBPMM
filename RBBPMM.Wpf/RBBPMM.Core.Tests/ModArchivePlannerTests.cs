using RBBPMM.Core;

namespace RBBPMM.Core.Tests;

public class ModArchivePlannerTests
{
    private static string Tmp(string tag)
    {
        var dir = Path.Combine(Path.GetTempPath(), $"rbbpmm_test_{tag}_{Guid.NewGuid():N}");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static void File(string path) =>
        System.IO.File.WriteAllText(path, "x");

    private static void Tree(string root, Dictionary<string, string[]> layout)
    {
        foreach (var (dir, files) in layout)
        {
            var full = Path.Combine(root, dir);
            Directory.CreateDirectory(full);
            foreach (var f in files)
                File(Path.Combine(full, f));
        }
    }

    [Fact]
    public void IsValidGuidFolderName_Rules()
    {
        Assert.True(ModArchivePlanner.IsValidGuidFolderName("a.b"));
        Assert.True(ModArchivePlanner.IsValidGuidFolderName("com.test.mod"));
        Assert.True(ModArchivePlanner.IsValidGuidFolderName("a.b.c.d.e"));
        Assert.False(ModArchivePlanner.IsValidGuidFolderName("a"));
        Assert.False(ModArchivePlanner.IsValidGuidFolderName("a.b.c.d.e.f"));
        Assert.False(ModArchivePlanner.IsValidGuidFolderName("Com.Example"));
        Assert.False(ModArchivePlanner.IsValidGuidFolderName("has space.mod"));
        Assert.False(ModArchivePlanner.IsValidGuidFolderName(""));
    }

    [Fact]
    public void IsTemplateFolderName_Rules()
    {
        Assert.True(ModArchivePlanner.IsTemplateFolderName("MyTemplate"));
        Assert.True(ModArchivePlanner.IsTemplateFolderName("ExampleMod"));
        Assert.False(ModArchivePlanner.IsTemplateFolderName("realmod"));
    }

    [Fact]
    public void CollectTargets_Heuristic_SortsAllElements()
    {
        var root = Tmp("heur");
        Tree(root, new Dictionary<string, string[]>
        {
            [""] = ["MyMod.dll", "MyMod.pdb", "MyMod.xml", "MyMod.deps.json"],
            ["deep/patchers"] = ["Pat.dll"],
            ["deep/MyPatchers"] = ["Loose.dll"],
            ["com.test.mod"] = ["x.txt"],
            ["ExampleStuff"] = ["Skip.dll"]
        });

        var t = ModArchivePlanner.CollectTargets(root);

        Assert.Contains("com.test.mod", t.Modded.Select(m => m.DestRel));
        Assert.DoesNotContain(t.Modded, m => m.DestRel == "ExampleStuff");

        var myMod = t.Plugins.Single(p => p.DestRel == "MyMod.dll");
        Assert.Equal(3, myMod.Extras.Count);
        Assert.Contains(myMod.Extras, e => e.EndsWith("MyMod.pdb"));
        Assert.Contains(myMod.Extras, e => e.EndsWith("MyMod.xml"));
        Assert.Contains(myMod.Extras, e => e.EndsWith("MyMod.deps.json"));

        Assert.Contains(t.Plugins, p => p.DestRel == "deep/MyPatchers/Loose.dll");

        var pat = t.Patchers.Single();
        Assert.Equal("Pat.dll", pat.DestRel);

        Assert.DoesNotContain(t.Plugins, p => p.DestRel.Contains("Skip"));
    }

    [Fact]
    public void CollectTargets_StructuredBranch_ShortCircuits()
    {
        var root = Tmp("struct");
        Tree(root, new Dictionary<string, string[]>
        {
            ["BepInEx/plugins"] = ["X.dll"],
            ["com.test.mod"] = ["x.txt"]
        });

        var t = ModArchivePlanner.CollectTargets(root);

        Assert.Contains(t.Plugins, p => p.DestRel == "X.dll");
        Assert.Empty(t.Modded);
    }

    [Fact]
    public void BuildPlan_DerivesNameAndConfirm()
    {
        var root = Tmp("plan");
        Tree(root, new Dictionary<string, string[]>
        {
            ["BepInEx/plugins"] = ["CoolMod.dll"],
            ["BALDI_Data/StreamingAssets/Modded/SomeMod"] = []
        });

        var plan = ModArchivePlanner.BuildPlan(root);
        Assert.Equal("CoolMod", plan.ModName);
        Assert.False(plan.NeedsConfirm);
    }
}
