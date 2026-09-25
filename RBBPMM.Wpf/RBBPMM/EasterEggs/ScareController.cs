using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;

namespace RBBPMM.EasterEggs;

/// <summary>
/// The jump-scare: a black scrim covers the window, the gif punches out from a dot to full size,
/// and then the app closes itself.
///
/// Ported from the Electron original, including its timings — 900 ms expand, then close at
/// 1300 ms (i.e. the result is held for 400 ms before the window disappears) and the same
/// <c>cubic-bezier(0.55, 0, 1, 0.45)</c> curve, expressed here as a spline key frame.
///
/// The close is a settable delegate so a test can observe it without tearing down the process.
/// </summary>
public sealed class ScareController : IDisposable
{
    /// <summary>Starting size, as a fraction of full size.</summary>
    public const double ScaleFrom = 0.06;

    /// <summary>How long the gif takes to grow to full size.</summary>
    public const int ExpandMilliseconds = 900;

    /// <summary>How long after the click the app closes (400 ms after the expand finishes).</summary>
    public const int CloseMilliseconds = 1300;

    private readonly UIElement _scrim;
    private readonly Image _image;
    private readonly FrameworkElement _host;
    private readonly DispatcherTimer _closeTimer = new();

    private ScaleTransform? _scale;
    private bool _fired;
    private bool _disposed;

    public ScareController(UIElement scrim, Image image, FrameworkElement host)
    {
        _scrim = scrim;
        _image = image;
        _host = host;

        _closeTimer.Interval = TimeSpan.FromMilliseconds(CloseMilliseconds);
        _closeTimer.Tick += (_, _) =>
        {
            _closeTimer.Stop();
            CloseAction?.Invoke();
        };

        CloseAction = () => Window.GetWindow(_host)?.Close();
    }

    /// <summary>What "close the tool" means. Defaults to closing the host window.</summary>
    public Action? CloseAction { get; set; }

    public bool IsFired => _fired;

    public bool OverlayVisible => _scrim.Visibility == Visibility.Visible;

    /// <summary>Sizes the gif to the viewport's larger dimension and starts the scene.</summary>
    public void Fit()
    {
        var width = Math.Max(_host.ActualWidth, _host.ActualHeight);
        if (width > 0)
            _image.Width = width;
    }

    /// <summary>
    /// Plays the scare. Returns false when it has already fired — the original latches on the
    /// first click so a second one can't restart (or cancel) the close.
    /// </summary>
    public bool Fire()
    {
        if (_fired || _disposed)
            return false;

        _fired = true;
        Fit();

        _scale = new ScaleTransform(ScaleFrom, ScaleFrom);
        _image.RenderTransformOrigin = new Point(0.5, 0.5);
        _image.RenderTransform = _scale;

        _scrim.Visibility = Visibility.Visible;
        _image.Visibility = Visibility.Visible;

        var expand = new DoubleAnimationUsingKeyFrames
        {
            Duration = TimeSpan.FromMilliseconds(ExpandMilliseconds),
        };
        expand.KeyFrames.Add(new LinearDoubleKeyFrame(ScaleFrom, KeyTime.FromTimeSpan(TimeSpan.Zero)));
        expand.KeyFrames.Add(new SplineDoubleKeyFrame(1.0, KeyTime.FromTimeSpan(
            TimeSpan.FromMilliseconds(ExpandMilliseconds)))
        {
            // cubic-bezier(0.55, 0, 1, 0.45)
            KeySpline = new KeySpline(0.55, 0, 1, 0.45),
        });

        _scale.BeginAnimation(ScaleTransform.ScaleXProperty, expand);
        _scale.BeginAnimation(ScaleTransform.ScaleYProperty, expand);

        _closeTimer.Start();
        return true;
    }

    /// <summary>Tears the scene back down. Only used by tests and the offscreen render harness.</summary>
    public void Reset()
    {
        _closeTimer.Stop();
        _fired = false;
        _scrim.Visibility = Visibility.Collapsed;
        _image.Visibility = Visibility.Collapsed;
        _image.RenderTransform = null;
        _scale = null;
    }

    public void Dispose()
    {
        _disposed = true;
        _closeTimer.Stop();
    }
}
