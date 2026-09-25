using System.Collections.Generic;
using System.Linq;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using RBBPMM.Models;
using RBBPMM.Navigation;
using RBBPMM.Services;

namespace RBBPMM.ViewModels;

/// <summary>
/// 外壳 ViewModel：持有导航项、当前页面（经 NavigationService）、主题切换命令。
/// 顶栏标题绑定到 Nav.CurrentPage.Title。
/// </summary>
public sealed class MainViewModel : ViewModelBase
{
    private readonly NavigationService _nav;
    private readonly ThemeManager _theme;
    private readonly UserSettings _settings;
    private readonly ILogger<MainViewModel>? _log;

    private string _themeGlyph = "🌙";

    public MainViewModel(NavigationService nav, ThemeManager theme, UserSettings settings,
        ILogger<MainViewModel>? log = null)
    {
        _nav = nav;
        _theme = theme;
        _settings = settings;
        _log = log;
        Title = "RBBPMM";

        NavItems = new List<NavItem>
        {
            new("mods", "Mods", "📦"),
            new("textures", "Texture Packs", "🎨"),
            new("levels", "Custom Levels", "🗺️"),
            new("gamebanana", "GameBanana", "🌐"),
            new("settings", "Settings", "⚙️"),
        };

        NavigateCommand = new RelayCommand<string>(key =>
        {
            if (!string.IsNullOrEmpty(key) && _nav.Navigate(key))
                _log?.LogDebug("导航到 {Key}", key);
            else
                _log?.LogWarning("未知导航键 {Key}", key);
        });
        ToggleThemeCommand = new RelayCommand(ToggleTheme);

        _theme.ThemeChanged += (_, name) => ThemeGlyph = name == "Dark" ? "☀️" : "🌙";
        ThemeGlyph = _theme.CurrentTheme == "Dark" ? "☀️" : "🌙";

        // 默认进入 Mods 页
        _nav.Navigate("mods");
    }

    public IReadOnlyList<NavItem> NavItems { get; }

    public NavigationService Nav => _nav;

    public string ThemeGlyph
    {
        get => _themeGlyph;
        private set => SetProperty(ref _themeGlyph, value);
    }

    public IRelayCommand<string> NavigateCommand { get; }
    public IRelayCommand ToggleThemeCommand { get; }

    private void ToggleTheme()
    {
        var next = _theme.CurrentTheme == "Dark" ? "Light" : "Dark";
        _theme.ApplyTheme(next);
        _settings.Theme = next;
        _settings.Save();
        _log?.LogDebug("主题切换为 {Theme}", next);
    }
}
