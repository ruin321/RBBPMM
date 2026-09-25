using System.Windows;
using RBBPMM.ViewModels;

namespace RBBPMM.Views;

public partial class ModsPage : System.Windows.Controls.UserControl
{
    private bool _initialized;

    public ModsPage()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    /// <summary>
    /// 首次显示时才扫描磁盘 —— 构造 VM 时可能还没拿到游戏目录，
    /// 而且扫描不该阻塞窗口创建。
    /// </summary>
    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (_initialized || DataContext is not ModsPageViewModel vm)
            return;

        _initialized = true;
        await vm.RefreshAsync();
    }
}
