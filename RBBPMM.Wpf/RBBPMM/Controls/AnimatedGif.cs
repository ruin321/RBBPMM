using System.Windows;
using System.Windows.Controls;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace RBBPMM.Controls;

/// <summary>
/// Minimal animated-GIF player.
///
/// WPF only ships a still-image decoder — <see cref="GifBitmapDecoder"/> hands back every frame
/// but never advances them, and the usual answer is a third-party package. A one-off Easter egg
/// doesn't justify a dependency, so this decodes the frames and swaps them on a timer.
///
/// Frame delays come from the GIF's own graphic-control extension (hundredths of a second).
/// Values of 0/1 are extremely common and mean "as fast as possible" in practice, so they get
/// normalised to 100 ms — otherwise the scare animation blinks past in a few frames.
/// </summary>
public sealed class AnimatedGif : Image
{
    /// <summary>Delay used when the GIF asks for 0 or 1 hundredths (see the class remarks).</summary>
    private static readonly TimeSpan MinimumDelay = TimeSpan.FromMilliseconds(100);

    public static readonly DependencyProperty GifSourceProperty = DependencyProperty.Register(
        nameof(GifSource),
        typeof(Uri),
        typeof(AnimatedGif),
        new PropertyMetadata(null, OnGifSourceChanged));

    private readonly DispatcherTimer _timer = new(DispatcherPriority.Render);
    private BitmapFrame[] _frames = [];
    private TimeSpan[] _delays = [];
    private int _index;

    /// <summary>Bumped on every load so a slow decode from a previous source can't win the race.</summary>
    private int _generation;

    public AnimatedGif()
    {
        _timer.Tick += OnTick;
        Loaded += (_, _) => Restart();
        Unloaded += (_, _) => _timer.Stop();
    }

    /// <summary>Pack URI of the GIF to play, e.g. <c>pack://application:,,,/Assets/scare-703263.gif</c>.</summary>
    public Uri? GifSource
    {
        get => (Uri?)GetValue(GifSourceProperty);
        set => SetValue(GifSourceProperty, value);
    }

    /// <summary>Number of decoded frames; 0 until a source is loaded. Useful for tests.</summary>
    public int FrameCount => _frames.Length;

    private static void OnGifSourceChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
        => ((AnimatedGif)d).Load(e.NewValue as Uri);

    private void Load(Uri? uri)
    {
        _timer.Stop();
        _generation++;
        _frames = [];
        _delays = [];
        _index = 0;

        if (uri is null)
        {
            Source = null;
            return;
        }

        var generation = _generation;
        _ = Task.Run(() =>
        {
            (BitmapFrame[] Frames, TimeSpan[] Delays) decoded;
            try
            {
                decoded = Decode(uri);
            }
            catch (Exception)
            {
                // A missing or corrupt asset must not take the app down — the egg just doesn't play.
                return;
            }

            // 必须显式回到控件自己的 Dispatcher：依赖环境里的 SynchronizationContext 只在
            // Application.Run() 启动的线程上才存在，别处会掉到线程池上，写 DP 直接抛。
            Dispatcher.InvokeAsync(() => Apply(decoded, generation), DispatcherPriority.Background);
        });
    }

    private void Apply((BitmapFrame[] Frames, TimeSpan[] Delays) decoded, int generation)
    {
        // A newer source arrived while we were decoding.
        if (generation != _generation)
            return;

        _frames = decoded.Frames;
        _delays = decoded.Delays;
        _index = 0;

        if (_frames.Length == 0)
            return;

        Source = _frames[0];
        if (IsLoaded)
            Restart();
    }

    private static (BitmapFrame[], TimeSpan[]) Decode(Uri uri)
    {
        // OnLoad keeps the stream closed and lets WPF cache the frames.
        var decoder = new GifBitmapDecoder(uri, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);

        var frames = new BitmapFrame[decoder.Frames.Count];
        var delays = new TimeSpan[decoder.Frames.Count];
        for (var i = 0; i < decoder.Frames.Count; i++)
        {
            var frame = decoder.Frames[i];
            frames[i] = frame;
            delays[i] = ReadDelay(frame);
        }

        return (frames, delays);
    }

    private static TimeSpan ReadDelay(BitmapFrame frame)
    {
        if (frame.Metadata is not BitmapMetadata metadata)
            return MinimumDelay;

        try
        {
            if (metadata.GetQuery("/grctlext/Delay") is ushort hundredths && hundredths > 1)
                return TimeSpan.FromMilliseconds(hundredths * 10);
        }
        catch (NotSupportedException)
        {
            // Some encoders expose no timing at all; fall back to the minimum.
        }

        return MinimumDelay;
    }

    private void Restart()
    {
        _timer.Stop();
        if (_frames.Length <= 1)
            return;

        _timer.Interval = _delays[_index];
        _timer.Start();
    }

    private void OnTick(object? sender, EventArgs e)
    {
        if (_frames.Length <= 1)
        {
            _timer.Stop();
            return;
        }

        _index = (_index + 1) % _frames.Length;
        Source = _frames[_index];
        _timer.Interval = _delays[_index];
    }
}
