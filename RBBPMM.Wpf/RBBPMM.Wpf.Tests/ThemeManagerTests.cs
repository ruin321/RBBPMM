using System.Windows;
using RBBPMM.Services;

namespace RBBPMM.Wpf.Tests;

public class ThemeManagerTests
{
    private static (ThemeManager Manager, ResourceDictionary AppResources, List<string> Loaded) MakeManager()
    {
        var appResources = new ResourceDictionary();
        var loaded = new List<string>();
        var manager = new ThemeManager(
            appResources,
            loader: name =>
            {
                loaded.Add(name);
                return new ResourceDictionary { ["__ThemeTag__"] = name };
            });
        return (manager, appResources, loaded);
    }

    [Fact]
    public void ApplyTheme_Dark_SetsCurrentAndMergesDictionary()
    {
        var (mgr, app, loaded) = MakeManager();

        mgr.ApplyTheme("Dark");

        Assert.Equal("Dark", mgr.CurrentTheme);
        Assert.Single(app.MergedDictionaries);
        Assert.Contains("Dark", loaded);
    }

    [Fact]
    public void ApplyTheme_UnknownValue_NormalizesToLight()
    {
        var (mgr, _, _) = MakeManager();

        mgr.ApplyTheme("banana");

        Assert.Equal("Light", mgr.CurrentTheme);
    }

    [Fact]
    public void ApplyTheme_SwitchingReplacesActiveDictionary()
    {
        var (mgr, app, _) = MakeManager();

        mgr.ApplyTheme("Light");
        mgr.ApplyTheme("Dark");

        Assert.Equal("Dark", mgr.CurrentTheme);
        Assert.Single(app.MergedDictionaries); // 旧主题字典被替换，而非叠加
    }

    [Fact]
    public void ApplyTheme_RaisesThemeChangedOnlyOnChange()
    {
        var (mgr, _, _) = MakeManager();
        var raised = 0;
        mgr.ThemeChanged += (_, _) => raised++;

        mgr.ApplyTheme("Dark");
        mgr.ApplyTheme("Dark"); // 同值不应再触发

        Assert.Equal(1, raised);
    }

    [Fact]
    public void Initialize_AppliesSettingsTheme()
    {
        var (mgr, _, _) = MakeManager();
        var settings = new UserSettings { Theme = "Dark" };

        mgr.Initialize(settings);

        Assert.Equal("Dark", mgr.CurrentTheme);
    }
}
