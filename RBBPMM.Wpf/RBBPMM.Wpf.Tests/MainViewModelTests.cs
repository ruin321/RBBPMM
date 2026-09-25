using System.Windows;
using RBBPMM.Navigation;
using RBBPMM.Services;
using RBBPMM.ViewModels;

namespace RBBPMM.Wpf.Tests;

public class MainViewModelTests
{
    private static (MainViewModel vm, ThemeManager theme, UserSettings settings) Build()
    {
        var nav = new NavigationService();
        nav.Register("mods", () => new ModsPageViewModel());
        nav.Register("textures", () => new TexturesPageViewModel());
        nav.Register("levels", () => new LevelsPageViewModel());
        nav.Register("gamebanana", () => new GameBananaPageViewModel());
        nav.Register("settings", () => new SettingsPageViewModel(new UserSettings(), new ThemeManager(new ResourceDictionary())));

        var theme = new ThemeManager(
            new ResourceDictionary(),
            loader: name => new ResourceDictionary { ["__ThemeTag__"] = name });
        var settings = new UserSettings();

        var vm = new MainViewModel(nav, theme, settings);
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
}
