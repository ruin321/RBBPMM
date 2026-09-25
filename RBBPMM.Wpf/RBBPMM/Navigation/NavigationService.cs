using System.Collections.Generic;
using System.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using RBBPMM.ViewModels;

namespace RBBPMM.Navigation;

/// <summary>
/// 极简导航：把字符串键映射到页面 ViewModel 工厂，切换时把实例暴露给
/// ContentControl（配合按 VM 类型渲染的 DataTemplate）。纯逻辑、可单测。
/// </summary>
public sealed class NavigationService : ObservableObject
{
    private readonly Dictionary<string, Func<ViewModelBase>> _factories = new();
    private object? _currentPage;
    private string _currentKey = "";

    public object? CurrentPage
    {
        get => _currentPage;
        private set => SetProperty(ref _currentPage, value);
    }

    public string CurrentKey
    {
        get => _currentKey;
        private set => SetProperty(ref _currentKey, value);
    }

    public IReadOnlyCollection<string> Keys => _factories.Keys.ToList();

    public void Register(string key, Func<ViewModelBase> factory) => _factories[key] = factory;

    public bool Navigate(string key)
    {
        if (!_factories.TryGetValue(key, out var factory))
            return false;

        CurrentPage = factory();
        CurrentKey = key;
        return true;
    }

    public bool Contains(string key) => _factories.ContainsKey(key);
}
