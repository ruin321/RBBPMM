using System;
using CommunityToolkit.Mvvm.ComponentModel;
using RBBPMM.Services;

namespace RBBPMM.ViewModels;

/// <summary>
/// 所有页面 ViewModel 的基类。标题走本地化键：构造函数里用 <see cref="SetTitle"/>
/// 同时给出键与回退文案，<see cref="Title"/> 在读取时经 LocalizationService 解析，
/// 语言切换时广播 PropertyChanged 让绑定即时刷新。
/// </summary>
public abstract class ViewModelBase : ObservableObject
{
    private string _fallbackTitle = "";
    private string _titleKey = "";

    protected ViewModelBase()
    {
        // 语言切换 → 通知 Title 重新求值（测试/设计期没有该服务时静默跳过）
        LocalizationService.Current?.CultureChanged += (_, _) => OnPropertyChanged(nameof(Title));
    }

    /// <summary>
    /// 本地化键（如 <c>page.mods.title</c>）。切换语言时 <see cref="Title"/> 随之刷新。
    /// </summary>
    public string TitleKey
    {
        get => _titleKey;
        set
        {
            if (SetProperty(ref _titleKey, value))
                OnPropertyChanged(nameof(Title));
        }
    }

    /// <summary>
    /// 无本地化资源时的兜底文案（单测 / 设计器预览用）。
    /// </summary>
    public string FallbackTitle
    {
        get => _fallbackTitle;
        set
        {
            if (SetProperty(ref _fallbackTitle, value))
                OnPropertyChanged(nameof(Title));
        }
    }

    /// <summary>
    /// 已解析的显示标题：有键且有资源 → 译文；否则回退文案 → 再否则键名。
    /// </summary>
    public string Title
    {
        get
        {
            var loc = LocalizationService.Current;
            if (loc is not null && !string.IsNullOrEmpty(_titleKey))
            {
                var translated = loc.Get(_titleKey);
                if (!string.Equals(translated, _titleKey, StringComparison.Ordinal))
                    return translated;
            }
            return string.IsNullOrEmpty(_fallbackTitle) ? _titleKey : _fallbackTitle;
        }
    }

    /// <summary>
    /// 设置标题：键用于本地化，fallback 用于无资源场景。
    /// </summary>
    protected void SetTitle(string titleKey, string fallback)
    {
        _fallbackTitle = fallback;
        TitleKey = titleKey; // 内部已触发 Title 通知
        OnPropertyChanged(nameof(FallbackTitle));
    }
}
