using Microsoft.Extensions.Logging;
using RBBPMM.Core;

namespace RBBPMM.Services;

/// <summary>
/// Locates and remembers the Baldi's Basics Plus install. All other services ask this for the
/// game root instead of taking a path parameter, so "no game selected" is one nullable check.
/// </summary>
public sealed class GameFolderService
{
    private static readonly string[] AutoDetectCandidates =
    [
        @"C:\Program Files (x86)\Steam\steamapps\common\Baldi's Basics Plus",
        @"C:\Program Files\Steam\steamapps\common\Baldi's Basics Plus",
        @"D:\Steam\steamapps\common\Baldi's Basics Plus",
        @"D:\SteamLibrary\steamapps\common\Baldi's Basics Plus",
        @"E:\SteamLibrary\steamapps\common\Baldi's Basics Plus"
    ];

    private readonly UserSettings _settings;
    private readonly ILogger<GameFolderService>? _log;

    public GameFolderService(UserSettings settings, ILogger<GameFolderService>? log = null)
    {
        _settings = settings;
        _log = log;
    }

    public GameEnvironment? Environment { get; private set; }

    public string? GameRoot => Environment?.RootPath;

    public string? GameVersion => Environment?.GameVersion;

    public string? ExecutablePath => Environment?.ExecutablePath;

    public bool IsReady => Environment is not null;

    /// <summary>Raised when the resolved install changes (including on first restore).</summary>
    public event EventHandler? EnvironmentChanged;

    /// <summary>
    /// Accepts either the game exe or the folder containing it. Returns false when the path is not
    /// a recognisable BB+ install (exe name, data folder and version markers must all check out).
    /// </summary>
    public bool TrySetFromPath(string path)
    {
        var env = Resolve(path);
        if (env is null)
        {
            _log?.LogWarning("不是有效的 BB+ 安装路径: {Path}", path);
            return false;
        }

        Environment = env;
        _settings.GamePath = env.ExecutablePath;
        _settings.Save();
        _log?.LogInformation("游戏目录: {Root} (版本 {Version})", env.RootPath, env.GameVersion);
        EnvironmentChanged?.Invoke(this, EventArgs.Empty);
        return true;
    }

    /// <summary>Restores the previously saved install, if it still resolves.</summary>
    public bool TryRestoreFromSettings()
    {
        var saved = _settings.GamePath;
        if (string.IsNullOrWhiteSpace(saved))
            return false;

        var env = Resolve(saved);
        if (env is null)
        {
            _log?.LogWarning("上次记住的游戏目录已失效: {Path}", saved);
            return false;
        }

        Environment = env;
        EnvironmentChanged?.Invoke(this, EventArgs.Empty);
        return true;
    }

    /// <summary>Tries the usual Steam locations and adopts the first valid one.</summary>
    public string? AutoDetect()
    {
        foreach (var candidate in AutoDetectCandidates)
        {
            if (!Directory.Exists(candidate))
                continue;
            if (TrySetFromPath(candidate))
                return ExecutablePath;
        }
        return null;
    }

    private static GameEnvironment? Resolve(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return null;

        try
        {
            if (File.Exists(path))
                return GameEnvironmentService.ResolveEnvironment(path);

            if (!Directory.Exists(path))
                return null;

            // The folder itself, then a single nested folder (Steam sometimes already points one deep).
            var direct = GameEnvironmentService.ResolveEnvironment(
                Path.Combine(path, Constants.GameExeName));
            if (direct is not null)
                return direct;

            foreach (var sub in Directory.GetDirectories(path))
            {
                var nested = GameEnvironmentService.ResolveEnvironment(
                    Path.Combine(sub, Constants.GameExeName));
                if (nested is not null)
                    return nested;
            }
        }
        catch
        {
            // unreadable path — treat as invalid
        }

        return null;
    }
}
