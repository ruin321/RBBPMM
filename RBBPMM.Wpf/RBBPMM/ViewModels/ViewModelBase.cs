using CommunityToolkit.Mvvm.ComponentModel;

namespace RBBPMM.ViewModels;

/// <summary>
/// 所有页面 ViewModel 的基类。提供统一的标题属性，供外壳顶栏显示。
/// </summary>
public abstract class ViewModelBase : ObservableObject
{
    private string _title = "";

    public string Title
    {
        get => _title;
        set => SetProperty(ref _title, value);
    }
}
