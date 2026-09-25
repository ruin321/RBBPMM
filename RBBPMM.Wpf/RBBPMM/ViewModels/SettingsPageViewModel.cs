using System.Collections.Generic;
using System.Linq;
using CommunityToolkit.Mvvm.Input;
using RBBPMM.Models;
using RBBPMM.Services;

namespace RBBPMM.ViewModels;

/// <summary>
/// 设置页：主题切换 + 语言选择。语言选择 Phase 4 才真正驱动 UI 文案，
/// 这里先把选择持久化到 UserSettings。
/// </summary>
public sealed class SettingsPageViewModel : ViewModelBase
{
    private readonly UserSettings _settings;
    private readonly ThemeManager _theme;
    private string _selectedLanguage;
    private string _themeButtonLabel = "";

    public SettingsPageViewModel(UserSettings settings, ThemeManager theme)
    {
        _settings = settings;
        _theme = theme;
        Title = "Settings";

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
            new("zh-rt", "亚等约语"),
        };

        _selectedLanguage = Languages.Any(l => l.Code == _settings.Language)
            ? _settings.Language
            : Languages[0].Code;

        ToggleThemeCommand = new RelayCommand(ToggleTheme);
        _theme.ThemeChanged += (_, _) => { OnPropertyChanged(nameof(IsDark)); UpdateThemeLabel(); };
        UpdateThemeLabel();
    }

    public string ThemeButtonLabel
    {
        get => _themeButtonLabel;
        private set => SetProperty(ref _themeButtonLabel, value);
    }

    private void UpdateThemeLabel() => ThemeButtonLabel = IsDark ? "切换到亮色" : "切换到暗色";

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
            }
        }
    }

    public bool IsDark => _theme.CurrentTheme == "Dark";

    public IRelayCommand ToggleThemeCommand { get; }

    private void ToggleTheme()
    {
        var next = _theme.CurrentTheme == "Dark" ? "Light" : "Dark";
        _theme.ApplyTheme(next);
        _settings.Theme = next;
        _settings.Save();
    }
}
