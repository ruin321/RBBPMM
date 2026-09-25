using System.Windows;
using Microsoft.Extensions.Logging;

namespace RBBPMM.Services;

/// <summary>
/// 运行时主题切换。颜色令牌集中在 LightTheme.xaml / DarkTheme.xaml，
/// 对应 Electron 里 Tailwind 指向 hsl(var(--x)) 的换肤思路：
/// 控件统一用 DynamicResource 引用 Brush，切主题只需替换合并字典。
///
/// 为可单测，目标资源字典与字典加载器都可注入。
/// </summary>
public sealed class ThemeManager
{
    private readonly ResourceDictionary _appResources;
    private readonly Func<string, ResourceDictionary> _loader;
    private readonly ILogger<ThemeManager>? _log;
    private ResourceDictionary? _active;

    public string CurrentTheme { get; private set; } = "Light";

    public event EventHandler<string>? ThemeChanged;

    public ThemeManager(ResourceDictionary appResources, Func<string, ResourceDictionary>? loader = null,
        ILogger<ThemeManager>? log = null)
    {
        _appResources = appResources;
        _log = log;
        _loader = loader ?? (name =>
            new ResourceDictionary
            {
                Source = new Uri($"pack://application:,,,/Themes/{name}Theme.xaml", UriKind.Absolute)
            });
    }

    public void Initialize(UserSettings settings) => ApplyTheme(settings.Theme);

    public void ApplyTheme(string name)
    {
        var normalized = string.Equals(name, "Dark", StringComparison.OrdinalIgnoreCase) ? "Dark" : "Light";

        ResourceDictionary dict;
        try
        {
            dict = _loader(normalized);
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "加载主题 {Name} 失败", normalized);
            return;
        }

        if (_active is not null)
            _appResources.MergedDictionaries.Remove(_active);
        _appResources.MergedDictionaries.Add(dict);
        _active = dict;

        if (CurrentTheme != normalized)
        {
            CurrentTheme = normalized;
            ThemeChanged?.Invoke(this, normalized);
        }
    }
}
