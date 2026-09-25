using System.Diagnostics;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using RBBPMM.Core;

namespace RBBPMM.EasterEggs;

/// <summary>Per-frame summary, mostly so tests and the render harness can assert on it.</summary>
public readonly record struct FleeFrameReport(int Loose, int NewlyUnlocked, int Statics);

/// <summary>
/// Glue between the WPF visual tree and <see cref="FleeEngine"/>: walks the page content for
/// candidates, feeds the engine fresh rects every frame, and writes the resulting offsets back
/// as render transforms.
///
/// Two traps inherited from the Electron original, both handled here:
/// <list type="bullet">
/// <item>the frame loop is driven from exactly ONE place. <c>CompositionTarget.Rendering</c> is a
/// static event, so a second subscription per arm would compound every frame and saturate the
/// renderer — looking exactly like a hang. <see cref="Arm"/> is idempotent and
/// <see cref="Disarm"/> always unsubscribes;</item>
/// <item>elements that already carry a render transform get theirs saved and restored, instead of
/// being silently clobbered when they come loose.</item>
/// </list>
/// </summary>
public sealed class FleeController : IDisposable
{
    /// <summary>Hard ceiling on how many elements we even consider, mirroring the original's 2× cap.</summary>
    private const int CandidateScanLimit = FleeEngine.MaxBodies * 2;

    private readonly FrameworkElement _field;
    private readonly Stopwatch _clock = new();

    private readonly Dictionary<FrameworkElement, TranslateTransform> _transforms = [];
    private readonly Dictionary<FrameworkElement, Transform?> _saved = [];
    private readonly List<FrameworkElement> _candidates = [];

    private bool _running;
    private double _lastSeconds;
    private bool _disposed;

    public FleeController(FrameworkElement field)
    {
        _field = field;
        Engine = new FleeEngine { Contains = IsVisualDescendant };
    }

    public FleeEngine Engine { get; }

    public bool IsArmed => _running;

    public IReadOnlyList<FrameworkElement> Candidates => _candidates;

    public event EventHandler? ArmedChanged;

    /// <summary>Re-scans the content for movable elements. Call after the page's layout settles.</summary>
    public void RefreshCandidates()
    {
        _candidates.Clear();

        var fieldArea = _field.ActualWidth * _field.ActualHeight;
        if (fieldArea <= 0)
            return;

        foreach (var element in Descendants(_field))
        {
            if (_candidates.Count >= CandidateScanLimit)
                break;
            if (!FleeEngine.IsEligible(element.ActualWidth, element.ActualHeight, fieldArea))
                continue;
            _candidates.Add(element);
        }
    }

    /// <summary>Turns the physics on and starts the frame loop. Safe to call twice.</summary>
    public void Arm()
    {
        if (_running || _disposed)
            return;

        RefreshCandidates();
        _running = true;
        _clock.Restart();
        _lastSeconds = 0;

        // Single subscription — see the class remarks.
        CompositionTarget.Rendering += OnRendering;
        ArmedChanged?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Turns the physics off and restores every moved element. Safe to call twice.</summary>
    public void Disarm()
    {
        if (!_running)
            return;

        _running = false;
        CompositionTarget.Rendering -= OnRendering;
        _clock.Stop();

        Engine.Clear();
        RestoreTransforms();
        ArmedChanged?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>
    /// Advance exactly one frame with an explicit cursor position. The render loop calls this with
    /// the live cursor; tests call it directly so the physics can be driven without a real mouse.
    /// </summary>
    public FleeFrameReport StepFrame(double deltaSeconds, Point cursor)
    {
        if (!_running)
            return default;

        var fieldWidth = _field.ActualWidth;
        var fieldHeight = _field.ActualHeight;
        if (fieldWidth <= 0 || fieldHeight <= 0)
            return default;

        var candidates = MeasureCandidates();
        var clamped = FleeEngine.ClampDelta(deltaSeconds);

        var touches = Engine.TryTouchUnlock(cursor.X, cursor.Y, candidates);
        var result = Engine.Step(
            clamped, cursor.X, cursor.Y, candidates, fieldWidth, fieldHeight, touches);

        ApplyTransforms();

        return new FleeFrameReport(Engine.Count, result.Unlocked.Count + touches.Count, result.Statics.Count);
    }

    /// <summary>Fresh rects (in field space) for every candidate, skipping ones already loose.</summary>
    private List<FleeBody> MeasureCandidates()
    {
        var bodies = new List<FleeBody>(_candidates.Count);
        foreach (var element in _candidates)
        {
            var rect = TryGetRect(element);
            if (rect is not { } r)
                continue;
            if (r.Width < FleeEngine.MinWidth || r.Height < FleeEngine.MinHeight)
                continue;

            bodies.Add(new FleeBody
            {
                Element = element,
                Id = Describe(element),
                Left = r.X,
                Top = r.Y,
                Width = r.Width,
                Height = r.Height,
            });
        }

        return bodies;
    }

    private void ApplyTransforms()
    {
        var live = new HashSet<FrameworkElement>();

        foreach (var body in Engine.Bodies)
        {
            if (body.Element is not FrameworkElement element)
                continue;
            live.Add(element);

            if (!_transforms.TryGetValue(element, out var transform))
            {
                _saved[element] = element.RenderTransform;
                transform = new TranslateTransform();
                element.RenderTransform = transform;
                _transforms[element] = transform;
            }

            transform.X = body.X;
            transform.Y = body.Y;
        }

        // Anything the engine dropped (disarm part-way, cap) goes back where it belongs.
        foreach (var element in _transforms.Keys.ToList())
        {
            if (!live.Contains(element))
                Release(element);
        }
    }

    private void RestoreTransforms()
    {
        foreach (var element in _transforms.Keys.ToList())
            Release(element);
    }

    private void Release(FrameworkElement element)
    {
        if (_saved.TryGetValue(element, out var original))
            element.RenderTransform = original;

        _saved.Remove(element);
        _transforms.Remove(element);
    }

    private void OnRendering(object? sender, EventArgs e)
    {
        if (!_running)
            return;

        var now = _clock.Elapsed.TotalSeconds;
        var dt = now - _lastSeconds;
        _lastSeconds = now;

        var cursor = Mouse.GetPosition(_field);
        StepFrame(dt, cursor);
    }

    private Rect? TryGetRect(FrameworkElement element)
    {
        try
        {
            if (element.ActualWidth <= 0 || element.ActualHeight <= 0)
                return null;

            var origin = element.TransformToAncestor(_field).Transform(new Point(0, 0));
            return new Rect(origin, new Size(element.ActualWidth, element.ActualHeight));
        }
        catch (InvalidOperationException)
        {
            // Element detached between the scan and the measurement.
            return null;
        }
    }

    private static bool IsVisualDescendant(object container, object node)
    {
        if (container is not DependencyObject ancestor || node is not DependencyObject descendant)
            return false;

        try
        {
            for (var parent = VisualTreeHelper.GetParent(descendant);
                 parent is not null;
                 parent = VisualTreeHelper.GetParent(parent))
            {
                if (ReferenceEquals(parent, ancestor))
                    return true;
            }
        }
        catch (InvalidOperationException)
        {
            // Not a Visual (e.g. a ContentElement) — nothing can be inside it for our purposes.
        }

        return false;
    }

    private static IEnumerable<FrameworkElement> Descendants(DependencyObject root)
    {
        var count = VisualTreeHelper.GetChildrenCount(root);
        for (var i = 0; i < count; i++)
        {
            var child = VisualTreeHelper.GetChild(root, i);
            if (child is FrameworkElement element)
                yield return element;
            foreach (var nested in Descendants(child))
                yield return nested;
        }
    }

    private static string Describe(FrameworkElement element)
        => string.IsNullOrEmpty(element.Name)
            ? element.GetType().Name
            : element.Name;

    public void Dispose()
    {
        if (_disposed)
            return;
        Disarm();
        _disposed = true;
    }
}
