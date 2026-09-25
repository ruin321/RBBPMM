using CommunityToolkit.Mvvm.ComponentModel;
using RBBPMM.Services;

namespace RBBPMM.Models;

/// <summary>
/// 侧边栏导航项。Key 必须与 NavigationService 注册键一致。
/// TitleKey 为本地化键；Title 在读取时解析，语言切换时通知刷新。
/// </summary>
public sealed class NavItem : ObservableObject
{
    private bool _isActive;

    public NavItem(string key, string titleKey, string icon = "")
    {
        Key = key;
        TitleKey = titleKey;
        Icon = icon;

        // 语言切换 → 重算 Title
        LocalizationService.Current?.CultureChanged += (_, _) => OnPropertyChanged(nameof(Title));
    }

    public string Key { get; }

    /// <summary>本地化键，如 <c>nav.mods</c>。</summary>
    public string TitleKey { get; }

    public string Icon { get; }

    /// <summary>已解析的显示标题（无资源时回退为键名）。</summary>
    public string Title => LocalizationService.Current?.Get(TitleKey) ?? TitleKey;

    /// <summary>
    /// 是否为当前页。由 MainViewModel 在导航切换时统一刷新
    /// （DataTrigger.Value 不支持 Binding，所以高亮靠这个布尔量驱动）。
    /// </summary>
    public bool IsActive
    {
        get => _isActive;
        set => SetProperty(ref _isActive, value);
    }
}
