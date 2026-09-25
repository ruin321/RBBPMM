using System.ComponentModel;
using System.IO;
using System.Windows;
using RBBPMM.Models;
using RBBPMM.Services;
using RBBPMM.ViewModels;

namespace RBBPMM.Wpf.Tests;

/// <summary>
/// 端到端验证「切语言 → 界面文案即时刷新」这条链路：
/// LocalizationService.Current → ViewModelBase.Title / NavItem.Title /
/// SettingsPageViewModel 的按钮文案。
///
/// 注意：LocalizationService.Current 是静态的，本类每个用例自行装/卸，收尾复位为 null。
/// </summary>
public class LocalizationIntegrationTests
{
    private static LocalizationService InstallRealResources()
    {
        var loc = new LocalizationService();
        loc.LoadFromDirectory(TestFs.ResourcesDir());
        loc.Language = "en";
        LocalizationService.SetCurrent(loc);
        return loc;
    }

    [Fact]
    public void PageViewModelTitle_FollowsLanguageSwitch()
    {
        var loc = InstallRealResources();
        try
        {
            var vm = new ModsPageViewModel();
            Assert.Equal("Your Mods", vm.Title);

            loc.Language = "zh-CN";
            Assert.Equal("我的模组", vm.Title);

            loc.Language = "ja";
            Assert.Equal("マイMOD", vm.Title);
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }

    [Fact]
    public void PageViewModelTitle_RaisesPropertyChanged_OnLanguageSwitch()
    {
        var loc = InstallRealResources();
        try
        {
            var vm = new ModsPageViewModel();
            var raised = new List<string?>();
            vm.PropertyChanged += (_, e) => raised.Add(e.PropertyName);

            loc.Language = "zh-TW";

            Assert.Contains(nameof(ViewModelBase.Title), raised);
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }

    [Fact]
    public void NavItemTitle_FollowsLanguageSwitch()
    {
        var loc = InstallRealResources();
        try
        {
            var item = new NavItem("mods", "nav.mods", "📦");
            Assert.Equal("Mods", item.Title);

            loc.Language = "zh-CN";
            Assert.Equal("模组", item.Title);

            loc.Language = "ydyy";
            Assert.Equal("Dóva", item.Title);

            loc.Language = "fish";
            Assert.Equal("FISH", item.Title);
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }

    [Fact]
    public void SettingsPage_SelectingLanguage_SwitchesServiceAndPersists()
    {
        var loc = InstallRealResources();
        var settingsPath = Path.Combine(TestFs.TempDir(), "settings.json");
        var settings = new UserSettings(settingsPath);
        try
        {
            var vm = new SettingsPageViewModel(settings, new ThemeManager(new ResourceDictionary()), loc);
            Assert.Equal("Switch to Dark", vm.ThemeButtonLabel);
            Assert.Equal("Light", vm.CurrentThemeLabel);

            vm.SelectedLanguage = "zh-CN";

            // 服务已切换、设置已落盘、VM 文案同步刷新
            Assert.Equal("zh-CN", loc.Language);
            Assert.Equal("zh-CN", settings.Language);
            Assert.Equal("切换到深色", vm.ThemeButtonLabel);
            Assert.Equal("浅色", vm.CurrentThemeLabel);
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }

    [Fact]
    public void SettingsPage_LabelsRefresh_WhenDarkThemeApplied()
    {
        var loc = InstallRealResources();
        try
        {
            var theme = new ThemeManager(new ResourceDictionary(),
                loader: name => new ResourceDictionary { ["__ThemeTag__"] = name });
            var vm = new SettingsPageViewModel(new UserSettings(), theme, loc);

            loc.Language = "zh-CN";
            Assert.Equal("切换到深色", vm.ThemeButtonLabel);

            theme.ApplyTheme("Dark");

            Assert.Equal("切换到浅色", vm.ThemeButtonLabel);
            Assert.Equal("深色", vm.CurrentThemeLabel);
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }

    [Fact]
    public void MissingKey_ShowsKeyName_RatherThanCrash()
    {
        var loc = InstallRealResources();
        try
        {
            Assert.Equal("nope.not.a.key", loc.Get("nope.not.a.key"));
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }
}
