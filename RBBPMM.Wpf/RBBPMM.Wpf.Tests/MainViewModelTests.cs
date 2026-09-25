using System.Windows;
using RBBPMM.Navigation;
using RBBPMM.Services;
using RBBPMM.ViewModels;

namespace RBBPMM.Wpf.Tests;

public class MainViewModelTests
{
    private static (MainViewModel vm, ThemeManager theme, UserSettings settings) Build()
    {
        var eggs = TestServices.Eggs();
        var nav = new NavigationService();
        nav.Register("mods", () => TestServices.ModsVm());
        nav.Register("textures", () => TestServices.TexturesVm());
        nav.Register("levels", () => TestServices.LevelsVm());
        nav.Register("gamebanana", () => TestServices.BananaVm(eggs));
        nav.Register("settings", () => new SettingsPageViewModel(new UserSettings(), new ThemeManager(new ResourceDictionary())));

        var theme = new ThemeManager(
            new ResourceDictionary(),
            loader: name => new ResourceDictionary { ["__ThemeTag__"] = name });
        var settings = new UserSettings();

        var vm = new MainViewModel(nav, theme, settings, eggs);
        return (vm, theme, settings);
    }

    [Fact]
    public void Constructor_RegistersAllNavItems_AndNavigatesToMods()
    {
        var (vm, _, _) = Build();

        Assert.Equal(5, vm.NavItems.Count);
        Assert.Equal("mods", vm.Nav.CurrentKey);
        Assert.IsType<ModsPageViewModel>(vm.Nav.CurrentPage);
    }

    [Fact]
    public void NavigateCommand_SwitchesCurrentPage()
    {
        var (vm, _, _) = Build();

        vm.NavigateCommand.Execute("settings");

        Assert.Equal("settings", vm.Nav.CurrentKey);
        Assert.IsType<SettingsPageViewModel>(vm.Nav.CurrentPage);
    }

    [Fact]
    public void ToggleThemeCommand_FlipsThemeAndPersists()
    {
        var (vm, theme, settings) = Build();
        Assert.Equal("Light", theme.CurrentTheme);

        vm.ToggleThemeCommand.Execute(null);

        Assert.Equal("Dark", theme.CurrentTheme);
        Assert.Equal("Dark", settings.Theme);
        Assert.Equal("☀️", vm.ThemeGlyph);
    }

    [Fact]
    public void ThemeChanged_UpdatesGlyphAcrossViewModels()
    {
        var (vm, theme, _) = Build();

        theme.ApplyTheme("Dark");

        Assert.Equal("☀️", vm.ThemeGlyph);
    }

    [Fact]
    public void NavItems_CarryLocalizationKeys()
    {
        var (vm, _, _) = Build();

        Assert.All(vm.NavItems, item => Assert.StartsWith("nav.", item.TitleKey));
        Assert.Equal(new[] { "mods", "textures", "levels", "gamebanana", "settings" },
            vm.NavItems.Select(i => i.Key));
    }

    [Fact]
    public void OnlyCurrentNavItem_IsMarkedActive()
    {
        var (vm, _, _) = Build();

        // 构造时默认进 Mods
        Assert.True(vm.NavItems.Single(i => i.Key == "mods").IsActive);
        Assert.True(vm.NavItems.Count(i => i.IsActive) == 1);

        vm.NavigateCommand.Execute("settings");

        Assert.True(vm.NavItems.Single(i => i.Key == "settings").IsActive);
        Assert.False(vm.NavItems.Single(i => i.Key == "mods").IsActive);
        Assert.True(vm.NavItems.Count(i => i.IsActive) == 1);
    }

    [Fact]
    public void IsActive_NotifiesPropertyChanged_SoSidebarHighlightRefreshes()
    {
        var (vm, _, _) = Build();
        var mods = vm.NavItems.Single(i => i.Key == "mods");

        var raised = new List<string?>();
        mods.PropertyChanged += (_, e) => raised.Add(e.PropertyName);

        vm.NavigateCommand.Execute("textures");

        Assert.Contains(nameof(RBBPMM.Models.NavItem.IsActive), raised);
    }
}
