using System.Diagnostics;

namespace RBBPMM.Core;

/// <summary>
/// Detects and stops a running <c>BALDI.exe</c> so mods can be swapped safely.
/// Ported from src/main/services/GameProcess.ts.
/// </summary>
public static class GameProcessService
{
    private static async Task<(bool Ok, string Out)> RunAsync(string exe, string[] args)
    {
        try
        {
            var psi = new ProcessStartInfo(exe)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            foreach (var a in args)
                psi.ArgumentList.Add(a);

            using var proc = Process.Start(psi);
            if (proc == null)
                return (false, "");
            var stdout = await proc.StandardOutput.ReadToEndAsync();
            await proc.WaitForExitAsync();
            return (proc.ExitCode == 0, stdout);
        }
        catch
        {
            return (false, "");
        }
    }

    public static async Task<bool> IsGameRunningAsync()
    {
        var (ok, stdout) = await RunAsync("tasklist.exe",
            ["/FI", $"IMAGENAME eq {Constants.GameExeName}", "/FO", "CSV", "/NH"]);
        return ok && stdout.ToLowerInvariant().Contains(Constants.GameExeName.ToLowerInvariant(), StringComparison.Ordinal);
    }

    /// <summary>Kills the given pid when alive, otherwise every BALDI.exe.</summary>
    public static async Task<bool> StopGameAsync(int? gamePid = null)
    {
        if (gamePid is > 0)
        {
            var (ok, stdout) = await RunAsync("tasklist.exe",
                ["/FI", $"PID eq {gamePid.Value}", "/FO", "CSV", "/NH"]);
            if (ok && stdout.Contains(gamePid.Value.ToString(), StringComparison.Ordinal))
            {
                var (killed, _) = await RunAsync("taskkill.exe", ["/PID", gamePid.Value.ToString(), "/T", "/F"]);
                if (killed)
                    return true;
            }
        }

        var (fallback, _) = await RunAsync("taskkill.exe", ["/IM", Constants.GameExeName, "/T", "/F"]);
        return fallback;
    }
}
