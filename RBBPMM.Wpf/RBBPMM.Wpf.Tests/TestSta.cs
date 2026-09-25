using System.Diagnostics;
using System.Runtime.ExceptionServices;
using System.Windows.Threading;

namespace RBBPMM.Wpf.Tests;

/// <summary>
/// Runs WPF-touching work on a dedicated STA thread.
///
/// xUnit's own threads are MTA, and WPF objects (DispatcherObject, DependencyObject, anything
/// created from XAML) refuse to be built there. Every test that touches the visual tree — the
/// startup smoke test and the Easter-egg tests — goes through here.
/// </summary>
internal static class TestSta
{
    public static void Run(Action action)
    {
        Exception? failure = null;

        var thread = new Thread(() =>
        {
            try
            {
                action();
            }
            catch (Exception ex)
            {
                failure = ex;
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();

        Assert.True(thread.Join(TimeSpan.FromSeconds(120)), "STA 测试超时");

        // 保留原始堆栈后重抛，方便定位
        if (failure is not null)
            ExceptionDispatchInfo.Capture(failure).Throw();
    }

    /// <summary>
    /// Pumps the dispatcher until <paramref name="done"/> turns true or the deadline passes.
    ///
    /// Needed for anything driven by a <see cref="DispatcherTimer"/> (the scare's close timer):
    /// timers only tick while the dispatcher is actually running a loop, and a bare
    /// <c>Dispatcher.Invoke</c> does not pump one.
    /// </summary>
    public static bool PumpUntil(Func<bool> done, TimeSpan timeout)
    {
        if (done())
            return true;

        var frame = new DispatcherFrame();
        var deadline = new DispatcherTimer(
            timeout, DispatcherPriority.Background, (_, _) => frame.Continue = false,
            Dispatcher.CurrentDispatcher);
        var poll = new DispatcherTimer(
            TimeSpan.FromMilliseconds(20), DispatcherPriority.Background,
            (_, _) =>
            {
                if (done())
                    frame.Continue = false;
            },
            Dispatcher.CurrentDispatcher);

        deadline.Start();
        poll.Start();
        try
        {
            Dispatcher.PushFrame(frame);
        }
        finally
        {
            deadline.Stop();
            poll.Stop();
        }

        return done();
    }
}
