using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using RBBPMM.Core;
using RBBPMM.EasterEggs;
using RBBPMM.Services;

namespace RBBPMM.Wpf.Tests;

/// <summary>
/// 两个彩蛋的装配层测试。
///
/// 物理本身在 RBBPMM.Core.Tests/FleeEngineTests 里覆盖；这里只管「接线」：
/// 页面选到哪个投稿 → 外壳亮哪个彩蛋 → 点一下会怎样 → 场地框有没有压到标题栏。
/// 这几条以前是 Electron 版真正踩过的坑（rAF 双订阅、场地框越界），所以必须有回归网。
/// </summary>
public class EasterEggTests
{
    /// <summary>标题栏高度，用于证明彩蛋按钮停在了内容区里。</summary>
    private const double HeaderHeight = 48;

    // ------------------------------------------------------------------ EggService

    [Fact]
    public void EggService_ReportsTheEggForTheSubmissionOnScreen()
    {
        var eggs = new EggService();

        Assert.Equal(EasterEggKind.None, eggs.Active);

        eggs.SetFromSubmission(EasterEggCatalog.Flee);
        Assert.Equal(EasterEggKind.Flee, eggs.Active);

        eggs.SetFromSubmission(EasterEggCatalog.Scare);
        Assert.Equal(EasterEggKind.Scare, eggs.Active);

        // 普通投稿必须把彩蛋收回去，否则翻页后旧彩蛋会一直挂在那
        eggs.SetFromSubmission(12345);
        Assert.Equal(EasterEggKind.None, eggs.Active);
    }

    [Fact]
    public void EggService_RaisesChangeNotification()
    {
        var eggs = new EggService();
        var seen = new List<EasterEggKind>();
        eggs.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(EggService.Active))
                seen.Add(eggs.Active);
        };

        eggs.SetFromSubmission(EasterEggCatalog.Scare);
        eggs.Clear();

        Assert.Equal([EasterEggKind.Scare, EasterEggKind.None], seen);
    }

    // ------------------------------------------------------------------ 可见性

    [Fact]
    public void EggLayer_ShowsOnlyTheUnlockedEgg()
        => TestSta.Run(() =>
        {
            var shell = Host();

            // 还没解锁：两个按钮都不该出现
            Assert.Equal(Visibility.Collapsed, FleeButton(shell).Visibility);
            Assert.Equal(Visibility.Collapsed, ScareButton(shell).Visibility);

            shell.Eggs.SetFromSubmission(EasterEggCatalog.Flee);
            shell.Lay();
            Assert.Equal(Visibility.Visible, FleeButton(shell).Visibility);
            Assert.Equal(Visibility.Collapsed, ScareButton(shell).Visibility);

            shell.Eggs.SetFromSubmission(EasterEggCatalog.Scare);
            shell.Lay();
            Assert.Equal(Visibility.Collapsed, FleeButton(shell).Visibility);
            Assert.Equal(Visibility.Visible, ScareButton(shell).Visibility);
        });

    [Fact]
    public void LeavingTheEgg_DisarmsThePhysics_AndHidesTheButtons()
        => TestSta.Run(() =>
        {
            var shell = Host();

            shell.Eggs.SetFromSubmission(EasterEggCatalog.Flee);
            shell.Lay();
            Click(FleeButton(shell));
            Assert.True(shell.Layer.IsFleeArmed);

            // 翻到普通投稿：必须自动收工，不能让物理在别的页面上继续跑
            shell.Eggs.SetFromSubmission(1);
            shell.Lay();

            Assert.False(shell.Layer.IsFleeArmed);
            Assert.Equal(Visibility.Collapsed, FleeButton(shell).Visibility);
        });

    // ------------------------------------------------------------------ 启用/复位

    [Fact]
    public void FleeButton_TogglesArming_AndSwapsItsLabel()
        => TestSta.Run(() =>
        {
            var shell = Host();
            shell.Eggs.SetFromSubmission(EasterEggCatalog.Flee);
            shell.Lay();

            // 未启用时是「别点」，且带英文兜底（此处 LocalizationService 为空，走 fallback）
            Assert.Equal("Do not click", shell.Layer.FleeLabel);
            Assert.False(shell.Layer.IsFleeArmed);

            Click(FleeButton(shell));
            Assert.True(shell.Layer.IsFleeArmed);
            Assert.Equal("Welp.", shell.Layer.FleeLabel);

            Click(FleeButton(shell));
            Assert.False(shell.Layer.IsFleeArmed);
            Assert.Equal("Do not click", shell.Layer.FleeLabel);
        });

    [Fact]
    public void FleeLabel_FollowsTheLanguage()
        => TestSta.Run(() =>
        {
            var loc = new LocalizationService();
            loc.LoadFromDirectory(TestFs.ResourcesDir());
            var previous = LocalizationService.Current;
            LocalizationService.SetCurrent(loc);

            try
            {
                var shell = Host();
                shell.Eggs.SetFromSubmission(EasterEggCatalog.Flee);
                shell.Lay();

                loc.Language = "zh-CN";
                Assert.Equal("别点", shell.Layer.FleeLabel);

                // 语言切换时按钮文案也要跟着变，而不是只在构造时读一次
                loc.Language = "en";
                Assert.Equal("Do not click", shell.Layer.FleeLabel);
            }
            finally
            {
                LocalizationService.SetCurrent(previous);
            }
        });

    [Fact]
    public void ArmingTwice_DoesNotCompoundTheFrameLoop()
        => TestSta.Run(() =>
        {
            var shell = Host();
            shell.Eggs.SetFromSubmission(EasterEggCatalog.Flee);
            shell.Lay();

            var flee = shell.Layer.Flee!;
            var armedEvents = 0;
            flee.ArmedChanged += (_, _) => armedEvents++;

            // 重复 Arm：必须幂等。Electron 版在这里踩过坑 —— 每多订阅一次
            // CompositionTarget.Rendering，每帧回调就翻一倍，界面看起来像挂了。
            flee.Arm();
            flee.Arm();
            flee.Arm();

            Assert.True(flee.IsArmed);
            Assert.Equal(1, armedEvents);

            // 手动推进一帧仍然正常，说明引擎只被喂了一次
            var report = flee.StepFrame(1.0 / 60.0, new Point(5, 5));
            Assert.True(report.Statics >= 0);

            flee.Disarm();
            Assert.False(flee.IsArmed);
            Assert.Equal(2, armedEvents);
        });

    // ------------------------------------------------------------------ 突脸

    [Fact]
    public void Scare_FiresOnce_AndLatchesShutAgainstASecondClick()
        => TestSta.Run(() =>
        {
            var shell = Host();
            shell.Eggs.SetFromSubmission(EasterEggCatalog.Scare);
            shell.Lay();

            var scare = shell.Layer.Scare!;
            var closed = false;
            scare.CloseAction = () => closed = true;

            Assert.False(scare.IsFired);
            Assert.False(scare.OverlayVisible);

            Click(ScareButton(shell));

            Assert.True(scare.IsFired);
            Assert.True(scare.OverlayVisible);

            // 已触发后再点不能重播（原版就是靠这个 latch 防止连点取消关窗）
            Assert.False(scare.Fire());

            scare.Reset();
            Assert.False(scare.IsFired);
            Assert.False(closed);
        });

    [Fact]
    public void Scare_ClosesTheWindowOnTheOriginalTiming()
        => TestSta.Run(() =>
        {
            var shell = Host();
            shell.Eggs.SetFromSubmission(EasterEggCatalog.Scare);
            shell.Lay();

            var scare = shell.Layer.Scare!;
            var closed = false;
            scare.CloseAction = () => closed = true;

            // 原版的三个数：0.06 起手、900ms 放大、1300ms 关窗
            Assert.Equal(0.06, ScareController.ScaleFrom, 3);
            Assert.Equal(900, ScareController.ExpandMilliseconds);
            Assert.Equal(1300, ScareController.CloseMilliseconds);

            var startedAt = DateTime.UtcNow;
            scare.Fire();

            TestSta.PumpUntil(() => closed, TimeSpan.FromSeconds(6));
            var elapsed = (DateTime.UtcNow - startedAt).TotalMilliseconds;

            Assert.True(closed, "突脸后没有触发关窗");
            Assert.True(elapsed >= 1100, $"关窗太早（{elapsed:F0}ms），应≈1300ms");
            Assert.True(elapsed < 4000, $"关窗太晚（{elapsed:F0}ms）");
        });

    // ------------------------------------------------------------------ 素材

    [Fact]
    public void ScareGif_IsEmbedded_AndDecodesIntoFrames()
        => TestSta.Run(() =>
        {
            // 这条守的是「gif 没打进程序集 / pack URI 写错」—— 那种情况下突脸只是黑屏，
            // 界面不报错、测试也不报错，只有真的点下去才发现。
            var gif = new Controls.AnimatedGif
            {
                GifSource = new Uri("pack://application:,,,/RBBPMM;component/Assets/scare-703263.gif"),
            };

            // 解码是 Task.Run 里跑的，完成后的续体要回到 Dispatcher 上，所以得抽帧
            TestSta.PumpUntil(() => gif.FrameCount > 0, TimeSpan.FromSeconds(10));

            Assert.True(gif.FrameCount > 1, $"gif 应该有多帧（实际 {gif.FrameCount}）");
            Assert.NotNull(gif.Source);
        });

    // ------------------------------------------------------------------ 场地框

    [Fact]
    public void Field_StaysInsideThePageContent_AndClearOfTheHeader()
        => TestSta.Run(() =>
        {
            var shell = Host();
            var field = shell.Layer.FieldBounds;

            // 场地框必须整体落在内容区里：不能压标题栏，也不能溢出窗口。
            // 这一条防的是 Electron 版踩过的「场地框越界」。
            Assert.True(field.Top >= HeaderHeight,
                $"场地框压到了标题栏：Top={field.Top}，标题栏高={HeaderHeight}");
            Assert.Equal(shell.Host.ActualHeight, field.Height, 1);
            Assert.Equal(shell.Host.ActualWidth, field.Width, 1);
            Assert.True(field.Bottom <= shell.Root.ActualHeight + 1, $"场地框溢出底部：{field.Bottom}");
        });

    // ------------------------------------------------------------------ helpers

    /// <summary>搭一个「标题栏 + 内容区 + 彩蛋层」的最小外壳，用于离屏布局。</summary>
    private static Shell Host()
    {
        var root = new Grid { Width = 1180, Height = 760 };
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(HeaderHeight) });
        root.RowDefinitions.Add(new RowDefinition());

        var header = new Border { Background = Brushes.Gray };
        var host = new Border();
        Grid.SetRow(host, 1);
        root.Children.Add(header);
        root.Children.Add(host);

        var eggs = new EggService();
        var layer = new EggLayer { FieldTarget = host, Eggs = eggs };
        Grid.SetRowSpan(layer, 2);
        root.Children.Add(layer);

        var shell = new Shell(root, layer, host, eggs);
        shell.Lay();
        return shell;
    }

    /// <summary>
    /// 测试外壳。<see cref="Lay"/> 量的必须是**根节点**：只量彩蛋层的话，兄弟子树之间的
    /// 坐标换算拿不到共同祖先，<c>TransformToAncestor</c> 会直接抛。
    /// </summary>
    private sealed record Shell(Grid Root, EggLayer Layer, Border Host, EggService Eggs)
    {
        public void Lay()
        {
            var size = new Size(1180, 760);
            Root.Measure(size);
            Root.Arrange(new Rect(new Point(), size));
            Root.UpdateLayout();
        }
    }

    private static Button FleeButton(Shell shell) => ButtonByLabel(shell, isScare: false);

    private static Button ScareButton(Shell shell) => ButtonByLabel(shell, isScare: true);

    /// <summary>
    /// 从视觉树里认出两个彩蛋按钮：突脸那个带无障碍名 "scare"（与原版 aria-label 一致），
    /// 剩下的就是跑路按钮。
    /// </summary>
    private static Button ButtonByLabel(Shell shell, bool isScare)
    {
        var buttons = Descendants(shell.Layer).OfType<Button>().ToList();
        Assert.Equal(2, buttons.Count);

        bool IsScare(Button b) => AutomationProperties.GetName(b) == "scare";
        var match = isScare ? buttons.Where(IsScare) : buttons.Where(b => !IsScare(b));
        return match.Single();
    }

    private static void Click(Button button)
        => button.RaiseEvent(new RoutedEventArgs(ButtonBase.ClickEvent, button));

    private static IEnumerable<DependencyObject> Descendants(DependencyObject root)
    {
        var count = VisualTreeHelper.GetChildrenCount(root);
        for (var i = 0; i < count; i++)
        {
            var child = VisualTreeHelper.GetChild(root, i);
            yield return child;
            foreach (var nested in Descendants(child))
                yield return nested;
        }
    }
}
