using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Threading;
using RBBPMM.Core;
using RBBPMM.Navigation;
using RBBPMM.Services;
using RBBPMM.ViewModels;
using RBBPMM.Views;

namespace RBBPMM.Wpf.Tests;

/// <summary>
/// 无图形界面的「真启动」冒烟测试 —— 把 App.OnStartup 里除 Show() 以外的链路整条跑一遍：
///   App.Resources 挂样式 → ThemeManager 用真实 pack URI 加载主题 → LocalizationService
///   读 Resources/*.json → 注册导航 → new MainWindow() → 布局。
///
/// 这样能在没有桌面的环境里兜住：pack URI 写错、MainWindow 引用不到的 StaticResource、
/// DataTemplate 没把 VM 映射到页面、loc:Loc 绑定没接到视觉树。
/// </summary>
public class AppStartupSmokeTests
{
    private static readonly object Gate = new();

    /// <summary>
    /// App.xaml 用相对 URI "/Styles/Controls.xaml"、ThemeManager 用 "/Themes/{n}Theme.xaml"；
    /// 测试宿主里 Application.ResourceAssembly 已被钉为 testhost 且不可改，
    /// 所以用等价的显式 component URI，验证对应 BAML 确实被打进了 RBBPMM 程序集。
    /// </summary>
    [Fact]
    public void PackedXamlResources_ExistForThePathsProductCodeUses()
    {
        string[] paths =
        [
            "Styles/Controls.xaml",
            "Themes/LightTheme.xaml",
            "Themes/DarkTheme.xaml",
            "MainWindow.xaml",
            "Views/ModsPage.xaml",
            "Views/TexturesPage.xaml",
            "Views/LevelsPage.xaml",
            "Views/GameBananaPage.xaml",
            "Views/SettingsPage.xaml",
            // 彩蛋素材：漏打进程序集的话，突脸只会放个黑屏，平时完全看不出来
            "Assets/scare-703263.gif",
        ];

        RunSta(() =>
        {
            foreach (var path in paths)
            {
                var info = Application.GetResourceStream(
                    new Uri($"pack://application:,,,/RBBPMM;component/{path}"));
                Assert.True(info is not null, $"程序集里找不到资源 {path}");
            }
        });
    }

    [Fact]
    public void StartupPath_LaysOutMainWindow_AndLocalizesIt()
        => RunSta(RunStartupPath);

    private static void RunStartupPath()
    {
        lock (Gate)
        {
            var app = Application.Current ?? new Application();

            // 对应 App.xaml 的 MergedDictionaries
            app.Resources.MergedDictionaries.Add(new ResourceDictionary
            {
                Source = new Uri("pack://application:,,,/RBBPMM;component/Styles/Controls.xaml")
            });

            // 对应 App.xaml 里那三个 xxxConverter 资源。页面用 {StaticResource BoolToVis}
            // 引用它们，漏注册的话 MainWindow 一实例化页面就抛 XamlParseException ——
            // 这正是本测试存在的意义（曾真的漏过）。
            app.Resources["BoolToVis"] = new Converters.BoolToVisibilityConverter();
            app.Resources["NotBoolToVis"] = new Converters.InverseBoolToVisibilityConverter();
            app.Resources["NotBool"] = new Converters.InverseBoolConverter();

            var settings = new UserSettings(Path.Combine(TestFs.TempDir(), "settings.json"));

            // 对应 App.OnStartup 的主题初始化：真实 pack URI 加载 Light/Dark
            var theme = new ThemeManager(app.Resources, name => new ResourceDictionary
            {
                Source = new Uri($"pack://application:,,,/RBBPMM;component/Themes/{name}Theme.xaml")
            });
            theme.Initialize(settings);
            Assert.Equal("Light", theme.CurrentTheme);
            theme.ApplyTheme("Dark");
            Assert.Equal("Dark", theme.CurrentTheme);
            theme.ApplyTheme("Light");
            Assert.Equal("Light", theme.CurrentTheme);

            // 对应 App.OnStartup 的 i18n 初始化
            var loc = new LocalizationService();
            loc.LoadFromDirectory(TestFs.ResourcesDir());
            LocalizationService.SetCurrent(loc);
            loc.Language = settings.Language;
            Assert.Equal(12, loc.AvailableLanguages.Count);

            // 对应 DI 里的导航注册
            var eggs = TestServices.Eggs();
            var nav = new NavigationService();
            nav.Register("mods", () => TestServices.ModsVm());
            nav.Register("textures", () => TestServices.TexturesVm());
            nav.Register("levels", () => TestServices.LevelsVm());
            nav.Register("gamebanana", () => TestServices.BananaVm(eggs));
            nav.Register("settings", () => new SettingsPageViewModel(settings, theme, loc));

            try
            {
                var mainVm = new MainViewModel(nav, theme, settings, eggs);
                var window = new MainWindow { DataContext = mainVm };

                // Window 自身没有 HwndSource 时不会往下走布局，改从它的根内容开始量。
                var root = Assert.IsAssignableFrom<FrameworkElement>(window.Content);
                Lay(root);

                // 1) DataTemplate 把 ModsPageViewModel 映射成了 ModsPage
                var modsPage = Descendants(root).OfType<ModsPage>().FirstOrDefault();
                Assert.True(modsPage is not null, "视觉树里没有 ModsPage。实际树:\n" + Dump(root));

                // 2) 窗口标题已本地化（loc:Loc 接到了 Window.Title）
                Assert.Equal(loc.Get("app.title"), window.Title);

                // 3) 页内标题已落到视觉树
                Assert.Contains("Your Mods", Texts(modsPage!));

                // 4) 切语言 → 视觉树文案即时刷新（Phase 4 的核心目标）
                loc.Language = "zh-CN";
                Lay(root);
                Assert.Contains("我的模组", Texts(modsPage!));

                // 5) 导航到设置页，DataTemplate 同样生效，且按钮文案本地化
                mainVm.NavigateCommand.Execute("settings");
                Lay(root);

                var settingsPage = Descendants(root).OfType<SettingsPage>().FirstOrDefault();
                Assert.True(settingsPage is not null, "导航后视觉树里没有 SettingsPage。实际树:\n" + Dump(root));
                Assert.Contains("切换到深色", Texts(settingsPage!));

                // 6) 深色主题下下拉框必须仍然可读：它不能沿用 Aero2 的浅底，
                //    否则会跟隐式 TextBlock 的浅色 Foreground 撞成「浅底浅字」。
                theme.ApplyTheme("Dark");
                Lay(root);

                var combo = Descendants(settingsPage!).OfType<ComboBox>().FirstOrDefault();
                Assert.True(combo is not null, "设置页里找不到语言下拉框");

                var comboBg = Assert.IsType<SolidColorBrush>(combo!.Background);
                Assert.Equal(((SolidColorBrush)app.Resources["SurfaceBrush"]).Color, comboBg.Color);

                // 下拉框要真的套上了自定义模板（自定义模板少接 PART_Popup 就会失灵；
                // 这里只查结构，真开下拉需要窗口，无桌面环境做不到）
                combo!.ApplyTemplate();
                Assert.IsAssignableFrom<Popup>(combo.Template.FindName("PART_Popup", combo));
                Assert.IsAssignableFrom<ToggleButton>(combo.Template.FindName("DropDownToggle", combo));

                // 选中项要显示语言名本身，而不是 LanguageOption 的 ToString()
                Assert.Contains("English", Texts(combo));

                // 7) 主题能切回来
                theme.ApplyTheme("Light");
                Lay(root);
                Assert.Equal("Light", theme.CurrentTheme);

                // 8) 彩蛋层：MainWindow 确实把 FieldTarget / Eggs 接上了，且场地框停在内容区里。
                //    这一条防的是「场地框越界压标题栏」—— Electron 版踩过的坑。
                var layer = Descendants(root).OfType<EasterEggs.EggLayer>().SingleOrDefault();
                Assert.True(layer is not null, "视觉树里没有 EggLayer。实际树:\n" + Dump(root));

                var pageHost = Descendants(root).OfType<ContentControl>()
                    .FirstOrDefault(c => c.Name == "PageHost");
                Assert.True(pageHost is not null, "视觉树里没有 PageHost");

                var field = layer!.FieldBounds;
                Assert.Equal(pageHost!.ActualHeight, field.Height, 1);
                Assert.Equal(pageHost.ActualWidth, field.Width, 1);
                Assert.True(field.Top > 0,
                    $"彩蛋场地压到了标题栏：Top={field.Top}");

                // 未解锁时一个按钮都不显示；解锁跑路彩蛋后只剩它自己
                Assert.Equal(0, VisibleButtons(layer).Count);

                mainVm.Eggs.SetFromSubmission(EasterEggCatalog.Flee);
                Lay(root);

                var visible = VisibleButtons(layer);
                Assert.True(visible.Count == 1, $"跑路彩蛋应只有一个按钮可见，实际 {visible.Count}");
                Assert.Equal(loc.Get("egg.flee.arm"), visible[0].Content);

                // 收起彩蛋：按钮必须跟着消失（否则离开彩蛋页后还会挂在别的页面上）
                mainVm.Eggs.Clear();
                Lay(root);
                Assert.Equal(0, VisibleButtons(layer).Count);

                window.Close();
            }
            finally
            {
                LocalizationService.SetCurrent(null);
            }
        }
    }

    /// <summary>
    /// 强制走一遍布局：窗口没有 HwndSource 时布局队列不会自动排空，
    /// 所以内容变化后要手动再量一次，并顺手把 Dispatcher 队列跑空。
    /// </summary>
    private static void Lay(FrameworkElement root)
    {
        var size = new Size(1180, 760);
        root.Measure(size);
        root.Arrange(new Rect(new Point(), size));
        root.UpdateLayout();
        root.Dispatcher.Invoke(() => { }, DispatcherPriority.Background);
    }

    private static IEnumerable<DependencyObject> Descendants(DependencyObject root)
    {
        var count = VisualTreeHelper.GetChildrenCount(root);
        for (var i = 0; i < count; i++)
        {
            var child = VisualTreeHelper.GetChild(root, i);
            yield return child;
            foreach (var grand in Descendants(child))
                yield return grand;
        }
    }

    private static List<string> Texts(DependencyObject root)
        => Descendants(root).OfType<TextBlock>().Select(t => t.Text).ToList();

    /// <summary>彩蛋层里当前真正可见的按钮（突脸 / 跑路各一个，未解锁时都收起来）。</summary>
    private static List<Button> VisibleButtons(DependencyObject root)
        => Descendants(root).OfType<Button>()
            .Where(b => b.Visibility == Visibility.Visible)
            .ToList();

    private static string Dump(DependencyObject root)
    {
        if (VisualTreeHelper.GetChildrenCount(root) == 0)
            return $"(空树，根节点 {root.GetType().Name})";

        return string.Join("\n", Descendants(root).Select(d => "  " + d.GetType().Name));
    }

    private static void RunSta(Action action) => TestSta.Run(action);
}
