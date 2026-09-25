namespace RBBPMM.Core;

/// <summary>Safe removal of installed mods with a backup-and-restore safety net.</summary>
public static class ModUnInstaller
{
    private const string PluginExt = ".dll";

    private static void RemoveSafe(string target, string root)
    {
        if (Directory.Exists(target))
        {
            if (!PathGuard.IsInside(root, target))
                throw new InvalidOperationException($"refusing to modify path outside root: {target}");
            Directory.Delete(target, recursive: true);
        }
    }

    private static void RemoveFileIfExists(string target, string root)
    {
        if (File.Exists(target))
        {
            if (!PathGuard.IsInside(root, target))
                throw new InvalidOperationException($"refusing to modify path outside root: {target}");
            File.Delete(target);
        }
    }

    private static List<string> CfgFiles(string gameRoot, IEnumerable<string> names)
    {
        var configDir = Path.Combine(gameRoot, "BepInEx", Constants.BepInExConfigFolder);
        var outList = new List<string>();
        foreach (var n in names)
        {
            var stem = ModActivator.DllStem(n);
            if (!string.IsNullOrEmpty(stem) && !outList.Contains($"{stem}.cfg"))
                outList.Add(Path.Combine(configDir, $"{stem}.cfg"));
        }
        return outList;
    }

    private sealed record Backup(string Src, string Rel);

    private static List<Backup> BackupTargets(string gameRoot, string backupRoot, List<string> targets)
    {
        var backedUp = new List<Backup>();
        foreach (var src in targets)
        {
            if (!File.Exists(src) && !Directory.Exists(src)) continue;
            var rel = Path.GetRelativePath(gameRoot, src);
            var dst = Path.Combine(backupRoot, rel);
            Directory.CreateDirectory(Path.GetDirectoryName(dst)!);
            if (Directory.Exists(src))
                CopyDirectory(src, dst);
            else
                File.Copy(src, dst, overwrite: true);
            backedUp.Add(new Backup(src, rel));
        }
        return backedUp;
    }

    private static void RestoreBackups(string gameRoot, string backupRoot, List<Backup> backedUp)
    {
        foreach (var b in Enumerable.Reverse(backedUp))
        {
            try
            {
                var orig = Path.Combine(gameRoot, b.Rel);
                if (File.Exists(b.Src)) File.Delete(b.Src);
                if (Directory.Exists(b.Src)) Directory.Delete(b.Src, recursive: true);
                var src = Path.Combine(backupRoot, b.Rel);
                Directory.CreateDirectory(Path.GetDirectoryName(orig)!);
                if (Directory.Exists(src))
                    CopyDirectory(src, orig);
                else if (File.Exists(src))
                    File.Copy(src, orig, overwrite: true);
            }
            catch { /* best effort */ }
        }
    }

    public static void DeleteMod(string gameRoot, string installDir, ModManifest manifest)
    {
        var backupRoot = Path.Combine(gameRoot, Constants.GmpMetadataFolder, Constants.TempFolder,
            $"backup_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}");
        Directory.CreateDirectory(backupRoot);
        var patchersDir = Constants.BepinexPatchersDir(gameRoot);
        List<Backup> backedUp = [];
        try
        {
            var targets = new List<string> { installDir };
            foreach (var a in manifest.Assets)
                if (!string.IsNullOrEmpty(a.Destination))
                    targets.Add(Path.GetFullPath(Path.Combine(gameRoot, a.Destination)));
            foreach (var p in manifest.Patchers)
                targets.Add(Path.Combine(patchersDir, Path.GetFileName(p)));
            targets.AddRange(CfgFiles(gameRoot, manifest.Plugins.Concat(manifest.Patchers)));

            backedUp = BackupTargets(gameRoot, backupRoot, targets.Distinct().ToList());
            RemoveSafe(installDir, gameRoot);
            foreach (var p in manifest.Patchers)
            {
                var abs = Path.Combine(patchersDir, Path.GetFileName(p));
                RemoveSafe(abs, gameRoot);
                RemoveFileIfExists(abs[..^PluginExt.Length] + ".disabled", gameRoot);
            }
            foreach (var a in manifest.Assets)
            {
                if (string.IsNullOrEmpty(a.Destination)) continue;
                var dest = Path.GetFullPath(Path.Combine(gameRoot, a.Destination));
                if (PathGuard.IsInside(gameRoot, dest))
                    RemoveSafe(dest, gameRoot);
            }
            foreach (var c in CfgFiles(gameRoot, manifest.Plugins.Concat(manifest.Patchers)))
                RemoveFileIfExists(c, gameRoot);
            Directory.Delete(backupRoot, recursive: true);
        }
        catch
        {
            RestoreBackups(gameRoot, backupRoot, backedUp);
            throw;
        }
    }

    public static void DeleteLegacyPlugin(string gameRoot, string installDir, List<string> pluginFiles)
    {
        var pluginsDir = Path.Combine(gameRoot, "BepInEx", Constants.PluginsFolder);
        var backupRoot = Path.Combine(gameRoot, Constants.GmpMetadataFolder, Constants.TempFolder,
            $"backup_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}");
        Directory.CreateDirectory(backupRoot);
        var stems = pluginFiles.Select(ModActivator.DllStem).ToList();
        var lookups = new List<string>();
        foreach (var pf in pluginFiles)
        {
            var abs = Path.GetFullPath(Path.Combine(installDir, pf));
            if (PathGuard.IsInside(installDir, abs) && PathGuard.IsInside(gameRoot, abs))
                lookups.Add(abs);
        }
        var scanRoot = (installDir != pluginsDir && PathGuard.IsInside(pluginsDir, installDir) && Directory.Exists(installDir))
            ? installDir : pluginsDir;
        if (Directory.Exists(scanRoot))
        {
            foreach (var e in Directory.GetFiles(scanRoot))
            {
                var stem = ModActivator.DllStem(Path.GetFileName(e));
                if (stems.Contains(stem))
                {
                    var abs = Path.GetFullPath(Path.Combine(scanRoot, Path.GetFileName(e)));
                    if (PathGuard.IsInside(gameRoot, abs) && PathGuard.IsInside(pluginsDir, abs))
                        lookups.Add(abs);
                }
            }
        }
        var targets = lookups.Distinct().ToList();
        targets.AddRange(CfgFiles(gameRoot, stems));
        List<Backup> backedUp = [];
        try
        {
            backedUp = BackupTargets(gameRoot, backupRoot, targets);
            foreach (var t in targets)
            {
                if (!File.Exists(t) && !Directory.Exists(t)) continue;
                if (!PathGuard.IsInside(gameRoot, t))
                    throw new InvalidOperationException($"refusing to modify path outside root: {t}");
                if (File.Exists(t)) File.Delete(t);
                else RemoveSafe(t, gameRoot);
            }
            if (installDir != pluginsDir && PathGuard.IsInside(pluginsDir, installDir) &&
                Directory.Exists(installDir) && Directory.GetFileSystemEntries(installDir).Length == 0)
                Directory.Delete(installDir);
            Directory.Delete(backupRoot, recursive: true);
        }
        catch
        {
            RestoreBackups(gameRoot, backupRoot, backedUp);
            throw;
        }
    }

    private static void CopyDirectory(string src, string dst)
    {
        Directory.CreateDirectory(dst);
        foreach (var entry in Directory.GetFileSystemEntries(src))
        {
            var name = Path.GetFileName(entry);
            var to = Path.Combine(dst, name);
            if (Directory.Exists(entry))
                CopyDirectory(entry, to);
            else
                File.Copy(entry, to, overwrite: true);
        }
    }
}
