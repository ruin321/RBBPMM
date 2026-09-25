using System.Collections.Generic;
using System.Linq;
using CommunityToolkit.Mvvm.Input;
using RBBPMM.Models;
using RBBPMM.Services;

namespace RBBPMM.ViewModels;

/// <summary>
/// 设置页：主题切换 + 语言选择。语言选择直接驱动 LocalizationService，
/// 所有 loc:Loc 绑定与 VM 内的 Title 会即时刷新；选择同步持久化到 UserSettings。
/// </summary>
public sealed class SettingsPageViewModel : ViewModelBase
{
    private readonly UserSettings _settings;
    private readonly ThemeManager _theme;
    private readonly LocalizationService? _loc;
    private string _selectedLanguage;
    private string _themeButtonLabel = "";
    private string _currentThemeLabel = "";

    public SettingsPageViewModel(UserSettings settings, ThemeManager theme, LocalizationService? loc = null)
    {
        _settings = settings;
        _theme = theme;
        _loc = loc;
        SetTitle("page.settings.title", "Settings");

        Languages = new List<LanguageOption>
        {
            new("en", "English"),
            new("zh-CN", "简体中文"),
            new("zh-TW", "繁體中文"),
            new("ja", "日本語"),
            new("ko", "한국어"),
            new("es", "Español"),
            new("pt", "Português"),
            new("fr", "Français"),
            new("de", "Deutsch"),
            new("ru", "Русский"),
            new("ydyy", "亚等约语"),
        };

        _selectedLanguage = Languages.Any(l => l.Code == _settings.Language)
            ? _settings.Language
            : Languages[0].Code;

        ToggleThemeCommand = new RelayCommand(ToggleTheme);
        _theme.ThemeChanged += (_, _) =>
        {
            OnPropertyChanged(nameof(IsDark));
            RefreshLabels();
        };
        if (_loc is not null)
            _loc.CultureChanged += (_, _) => RefreshLabels();
        RefreshLabels();
    }

    public IReadOnlyList<LanguageOption> Languages { get; }

    public string SelectedLanguage
    {
        get => _selectedLanguage;
        set
        {
            if (SetProperty(ref _selectedLanguage, value))
            {
                _settings.Language = value;
                _settings.Save();
                if (_loc is not null)
                    _loc.Language = value;
            }
        }
    }

    /// <summary>主题切换按钮上的文案（"切换到浅色"/"切换到深色"）。</summary>
    public string ThemeButtonLabel
    {
        get => _themeButtonLabel;
        private set => SetProperty(ref _themeButtonLabel, value);
    }

    /// <summary>当前主题名（"浅色"/"深色"）。</summary>
    public string CurrentThemeLabel
    {
        get => _currentThemeLabel;
        private set => SetProperty(ref _currentThemeLabel, value);
    }

    public bool IsDark => _theme.CurrentTheme == "Dark";

    public IRelayCommand ToggleThemeCommand { get; }

    private void RefreshLabels()
    {
        var loc = _loc;
        ThemeButtonLabel = loc is null
            ? (IsDark ? "Switch to Light" : "Switch to Dark")
            : loc.Get(IsDark ? "settings.theme.toLight" : "settings.theme.toDark");

        CurrentThemeLabel = loc is null
            ? (IsDark ? "Dark" : "Light")
            : loc.Get(IsDark ? "theme.dark" : "theme.light");
    }

    private void ToggleTheme()
    {
        var next = _theme.CurrentTheme == "Dark" ? "Light" : "Dark";
        _theme.ApplyTheme(next);
        _settings.Theme = next;
        _settings.Save();
    }
}
