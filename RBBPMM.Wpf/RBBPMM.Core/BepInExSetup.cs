namespace RBBPMM.Core;

/// <summary>BepInEx detection + install (7z). Ported from src/main/services/BepInExSetup.ts.</summary>
public static class BepInExSetup
{
    /// <summary>Override the bundled BepInEx.zip location (defaults to the app base dir).</summary>
    public static string? BepInExArchivePathOverride { get; set; }

    public static string BepinexRoot(string gameRoot) => Path.Combine(gameRoot, Constants.BepInExFolder);

    public static bool DetectBepInEx(string gameRoot)
    {
        var root = BepinexRoot(gameRoot);
        if (File.Exists(Path.Combine(root, "config", "BepInEx.cfg"))) return true;
        if (File.Exists(Path.Combine(root, "core", "BepInEx.Core.dll"))) return true;
        return File.Exists(Path.Combine(root, "BepInEx.dll"));
    }

    public static string? ResolveBepInExArchive()
    {
        if (!string.IsNullOrEmpty(BepInExArchivePathOverride) && File.Exists(BepInExArchivePathOverride))
            return BepInExArchivePathOverride;
        string[] candidates =
        [
            Path.Combine(AppContext.BaseDirectory, "BepInEx.zip"),
            Path.Combine(AppContext.BaseDirectory, "resources", "BepInEx.zip"),
        ];
        foreach (var c in candidates)
            if (!string.IsNullOrEmpty(c) && File.Exists(c))
                return c;
        return null;
    }

    public static async Task<Result<bool>> InstallBepInEx(string gameRoot, Action<InstallProgress>? onProgress = null)
    {
        var archive = ResolveBepInExArchive();
        if (archive == null)
            return Result<bool>.Fail("BepInEx package is missing from the application bundle.");
        var tempRoot = ModArchiveExtractor.CreateTempDir(gameRoot);
        try
        {
            onProgress?.Invoke(new InstallProgress("setup-bepinex", 10, "Extracting BepInEx..."));
            await ModArchiveExtractor.ExtractArchiveAsync(archive, tempRoot);
            onProgress?.Invoke(new InstallProgress("setup-bepinex", 60, "Moving into game folder..."));
            MoveToGameRoot(tempRoot, Path.GetFullPath(gameRoot));
            onProgress?.Invoke(new InstallProgress("setup-bepinex", 100, "BepInEx installed."));
            return Result<bool>.Success(DetectBepInEx(gameRoot));
        }
        catch (Exception e)
        {
            return Result<bool>.Fail(e.Message);
        }
        finally
        {
            ModArchiveExtractor.RemoveDirIfInside(gameRoot, tempRoot);
        }
    }

    private static void MoveChildren(string srcDir, string dstDir)
    {
        foreach (var name in Directory.GetFileSystemEntries(srcDir))
        {
            var dst = Path.Combine(dstDir, Path.GetFileName(name));
            Directory.CreateDirectory(Path.GetDirectoryName(dst)!);
            try
            {
                if (Directory.Exists(name)) Directory.Move(name, dst);
                else File.Move(name, dst);
            }
            catch
            {
                if (Directory.Exists(name)) CopyDirectoryTree(name, dst);
                else File.Copy(name, dst, overwrite: true);
                try { if (Directory.Exists(name)) Directory.Delete(name, recursive: true); else File.Delete(name); }
                catch { /* best effort */ }
            }
        }
    }

    private static void MoveToGameRoot(string tempRoot, string gameRoot)
    {
        var top = Directory.GetFileSystemEntries(tempRoot);
        if (top.Length == 1 && Directory.Exists(top[0]) && Path.GetFileName(top[0]) != Constants.BepInExFolder)
        {
            MoveChildren(top[0], gameRoot);
            return;
        }
        MoveChildren(tempRoot, gameRoot);
    }

    private static void CopyDirectoryTree(string src, string dst)
    {
        Directory.CreateDirectory(dst);
        foreach (var entry in Directory.GetFileSystemEntries(src))
        {
            var to = Path.Combine(dst, Path.GetFileName(entry));
            if (Directory.Exists(entry)) CopyDirectoryTree(entry, to);
            else File.Copy(entry, to, overwrite: true);
        }
    }
}
