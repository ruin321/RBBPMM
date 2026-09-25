using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using RBBPMM.Core;
using RBBPMM.Services;

namespace RBBPMM.EasterEggs;

/// <summary>
/// The shell-level overlay that draws both Easter eggs around the page content.
///
/// It is deliberately hosted by the window rather than by the pages: the scare scrim has to cover
/// the sidebar too, while the corner buttons have to stay inside the page content rectangle so
/// they can never overlap the header strip. Both are positioned from <see cref="FieldTarget"/>.
/// </summary>
public partial class EggLayer : UserControl
{
    public static readonly DependencyProperty FieldTargetProperty = DependencyProperty.Register(
        nameof(FieldTarget),
        typeof(FrameworkElement),
        typeof(EggLayer),
        new PropertyMetadata(null, OnFieldTargetChanged));

    public static readonly DependencyProperty EggsProperty = DependencyProperty.Register(
        nameof(Eggs),
        typeof(EggService),
        typeof(EggLayer),
        new PropertyMetadata(null, OnEggsChanged));

    /// <summary>Last rectangle pushed into the field (device-independent pixels, layer space).</summary>
    private Rect _fieldRect;

    private FleeController? _flee;
    private ScareController? _scare;
    private bool _hooked;

    public EggLayer()
    {
        InitializeComponent();

        // 与 Electron 版一致的无障碍名（那边是 aria-label="scare"）。
        AutomationProperties.SetName(ScareButton, "scare");

        ScareThumb.Loaded += (_, _) => _scare?.Fit();
        SizeChanged += (_, _) =>
        {
            _scare?.Fit();
            SyncField();
        };
        LayoutUpdated += (_, _) => SyncField();

        RefreshFleeLabel();
        LocalizationService.Current?.CultureChanged += (_, _) => RefreshFleeLabel();
    }

    /// <summary>The page content rectangle both eggs are positioned against.</summary>
    public FrameworkElement? FieldTarget
    {
        get => (FrameworkElement?)GetValue(FieldTargetProperty);
        set => SetValue(FieldTargetProperty, value);
    }

    /// <summary>Which egg the current page unlocked.</summary>
    public EggService? Eggs
    {
        get => (EggService?)GetValue(EggsProperty);
        set => SetValue(EggsProperty, value);
    }

    /// <summary>Text of the runaway-buttons toggle. Mirrors the original's arm/armed labels.</summary>
    public string FleeLabel { get; private set; } = "";

    public bool IsFleeArmed => _flee?.IsArmed == true;

    /// <summary>Exposed so the offscreen render harness and tests can drive the physics.</summary>
    public FleeController? Flee => _flee;

    /// <summary>Exposed so tests can assert the scare timings without closing the process.</summary>
    public ScareController? Scare => _scare;

    /// <summary>
    /// The content rectangle the corner buttons are confined to, in layer space. Exposed so tests
    /// and the offscreen render harness can prove the eggs never cover the header strip.
    /// </summary>
    public Rect FieldBounds => _fieldRect;

    private static void OnFieldTargetChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        => ((EggLayer)d).Rebuild();

    private static void OnEggsChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        var layer = (EggLayer)d;
        if (e.OldValue is EggService old)
            old.PropertyChanged -= layer.OnEggsPropertyChanged;
        if (e.NewValue is EggService fresh)
            fresh.PropertyChanged += layer.OnEggsPropertyChanged;

        layer.ApplyActiveEgg();
    }

    private void OnEggsPropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName is nameof(EggService.Active))
            ApplyActiveEgg();
    }

    private void Rebuild()
    {
        Unhook();

        if (FieldTarget is { } target)
        {
            _flee = new FleeController(target);
            _scare = new ScareController(Scrim, ScareImage, Root);
            Hook(target);
            SyncField();
        }

        ApplyActiveEgg();
    }

    private void Hook(FrameworkElement target)
    {
        target.SizeChanged += OnTargetSizeChanged;
        target.LayoutUpdated += OnTargetLayoutUpdated;
        _hooked = true;
    }

    private void Unhook()
    {
        if (_hooked && FieldTarget is { } target)
        {
            target.SizeChanged -= OnTargetSizeChanged;
            target.LayoutUpdated -= OnTargetLayoutUpdated;
        }

        _hooked = false;
        _flee?.Dispose();
        _scare?.Dispose();
        _flee = null;
        _scare = null;
    }

    private void OnTargetSizeChanged(object sender, SizeChangedEventArgs e) => SyncField();

    private void OnTargetLayoutUpdated(object? sender, EventArgs e) => SyncField();

    /// <summary>
    /// Aligns the field to the content rectangle. Guarded by a change check because
    /// <c>LayoutUpdated</c> fires on every layout pass of the whole tree.
    ///
    /// The offset is computed via the nearest **common ancestor**, not via an ancestor of this
    /// element: the field target is a sibling subtree of this layer in the shell's grid, and
    /// <c>TransformToAncestor</c> throws outright when the "ancestor" is not actually one —
    /// which is what happens if you transform to one of the two elements directly.
    /// </summary>
    private void SyncField()
    {
        // 用 ActualSize 判空而不是 IsLoaded：离屏（无 PresentationSource）时 IsLoaded 永远是 false，
        // 布局却已经完成，靠 IsLoaded guarding 会让这一层在无桌面环境里彻底不工作。
        if (FieldTarget is not { } target || target.ActualWidth <= 0 || target.ActualHeight <= 0)
            return;

        if (FindCommonAncestor(this, target) is not { } ancestor)
            return;

        var layerOrigin = this.TransformToAncestor(ancestor).Transform(new Point(0, 0));
        var targetOrigin = target.TransformToAncestor(ancestor).Transform(new Point(0, 0));

        var rect = new Rect(
            new Point(targetOrigin.X - layerOrigin.X, targetOrigin.Y - layerOrigin.Y),
            new Size(target.ActualWidth, target.ActualHeight));

        if (rect == _fieldRect)
            return;

        _fieldRect = rect;
        Canvas.SetLeft(Field, rect.X);
        Canvas.SetTop(Field, rect.Y);
        Field.Width = rect.Width;
        Field.Height = rect.Height;
    }

    /// <summary>Nearest visual ancestor shared by both elements, or null when they aren't connected.</summary>
    private static Visual? FindCommonAncestor(Visual a, Visual b)
    {
        var chain = new HashSet<Visual>();
        for (Visual? node = a; node is not null; node = VisualTreeHelper.GetParent(node) as Visual)
            chain.Add(node);

        for (Visual? node = b; node is not null; node = VisualTreeHelper.GetParent(node) as Visual)
        {
            if (chain.Contains(node))
                return node;
        }

        return null;
    }

    private void ApplyActiveEgg()
    {
        var active = Eggs?.Active ?? EasterEggKind.None;

        var fleeVisible = active == EasterEggKind.Flee;
        FleeButton.Visibility = fleeVisible ? Visibility.Visible : Visibility.Collapsed;
        if (!fleeVisible)
        {
            _flee?.Disarm();
            RefreshFleeLabel();
        }

        ScareButton.Visibility = active == EasterEggKind.Scare
            ? Visibility.Visible
            : Visibility.Collapsed;

        if (active != EasterEggKind.Scare && _scare?.IsFired == true)
            _scare.Reset();
    }

    private void OnFleeClick(object sender, RoutedEventArgs e)
    {
        if (_flee is null)
            return;

        if (_flee.IsArmed)
            _flee.Disarm();
        else
            _flee.Arm();

        RefreshFleeLabel();
    }

    private void OnScareClick(object sender, RoutedEventArgs e) => _scare?.Fire();

    private void RefreshFleeLabel()
    {
        var armed = _flee?.IsArmed == true;
        FleeLabel = armed
            ? LocalizationService.T("egg.flee.armed", "Welp.")
            : LocalizationService.T("egg.flee.arm", "Do not click");
        FleeButton.Content = FleeLabel;
    }
}
