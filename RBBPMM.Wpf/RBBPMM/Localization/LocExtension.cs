using System;
using System.ComponentModel;
using System.Windows;
using System.Windows.Data;
using System.Windows.Markup;
using RBBPMM.Services;

namespace RBBPMM.Localization;

/// <summary>
/// XAML 本地化扩展：<TextBlock Text="{loc:Loc Key=nav.mods}"/>。
/// 返回一个绑定到 LocBindingSource 的 OneWay Binding；语言切换时
/// LocBindingSource 监听 CultureChanged 并通知，目标属性自动刷新。
/// </summary>
[MarkupExtensionReturnType(typeof(string))]
public sealed class LocExtension : MarkupExtension
{
    public LocExtension()
    {
    }

    public LocExtension(string key) => Key = key;

    public string? Key { get; set; }

    public override object ProvideValue(IServiceProvider serviceProvider)
    {
        if (string.IsNullOrEmpty(Key) || LocalizationService.Current is null)
            return Key ?? "";

        var target = (IProvideValueTarget?)serviceProvider.GetService(typeof(IProvideValueTarget));
        if (target?.TargetObject is DependencyObject && target.TargetProperty is DependencyProperty)
        {
            var source = new LocBindingSource(LocalizationService.Current, Key);
            var binding = new Binding
            {
                Source = source,
                Path = new PropertyPath(nameof(LocBindingSource.Value)),
                Mode = BindingMode.OneWay
            };
            return binding.ProvideValue(serviceProvider);
        }

        // 非依赖属性目标（如设计器）：直接返回当前值
        return LocalizationService.Current.Get(Key);
    }
}

/// <summary>
/// 每个 loc:Loc 的背后绑定源：暴露 Value，语言切换时通知刷新。
/// </summary>
internal sealed class LocBindingSource : INotifyPropertyChanged
{
    private readonly LocalizationService _svc;

    public LocBindingSource(LocalizationService svc, string key)
    {
        _svc = svc;
        Key = key;
        _svc.CultureChanged += OnCultureChanged;
    }

    public string Key { get; }

    public string Value => _svc.Get(Key);

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnCultureChanged(object? sender, EventArgs e)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Value)));
}
