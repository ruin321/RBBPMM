using System.Text.Json;

namespace RBBPMM.Core;

/// <summary>Outcome of installing a manifest-driven (GMP) mod archive.</summary>
public sealed record ModArchiveInstallResult(
    ModManifest Manifest,
    ModMetadata Metadata,
    List<SecurityWarning> Warnings,
    string InstallDir,
    bool SupportsCurrentVersion);

public sealed class ModInstaller
{
    private const string PluginExt = ".dll";
    private static readonly string ModdedRel =
        Path.Combine(Constants.GameDataFolder, "StreamingAssets", "Modded");

    public static ModArchiveInstallResult InstallModArchive(
        string gameRoot,
        string archivePath,
        string? gameVersion,
        Func<bool>? isCancelled = null,
        string? preExtractedRoot = null)
    {
        var ownsTemp = preExtractedRoot == null;
        var tempRoot = preExtractedRoot ?? ModArchiveExtractor.CreateTempDir(gameRoot);
        var created = new List<string>();
        var rollback = () =>
        {
            foreach (var to in Enumerable.Reverse(created))
            {
                try
                {
                    if (Directory.Exists(to)) Directory.Delete(to, recursive: true);
                    else if (File.Exists(to)) File.Delete(to);
                }
                catch { /* best effort */ }
            }
        };
        string extractRoot;
        ModManifest manifest;
        var pluginDir = "";
        try
        {
            extractRoot = preExtractedRoot ?? ModArchiveExtractor.ExtractArchive(archivePath, tempRoot);
            var parsed = ManifestLoader.LoadManifestCompat(extractRoot);
            if (parsed == null)
                throw new InvalidOperationException("No valid manifest.json found in archive");
            manifest = parsed;
            var warnings = SecurityScanner.ScanManifest(gameRoot, extractRoot, manifest);
            var dirName = StableHash.GetModDirectoryName(manifest.Guid, manifest.Name, manifest.Author);
            pluginDir = Path.Combine(Constants.BepinexPluginsDir(gameRoot), dirName);
            if (Directory.Exists(pluginDir))
                throw new InvalidOperationException($"Mod already installed: {manifest.Name}");
            Directory.CreateDirectory(pluginDir);
            created.Add(pluginDir);

            var installedPlugins = new List<string>();
            foreach (var p in manifest.Plugins.ToList())
            {
                if (isCancelled?.Invoke() == true) throw new OperationCanceledException("install cancelled");
                var src = Path.GetFullPath(Path.Combine(extractRoot, SecurityScanner.NormalizeRel(p)));
                if (!PathGuard.IsInside(extractRoot, src))
                    throw new InvalidOperationException($"Plugin escapes temp: {p}");
                if (!File.Exists(src)) continue;
                var baseName = Path.GetFileNameWithoutExtension(src);
                foreach (var rel in RelatedFiles(Path.GetDirectoryName(src)!, baseName))
                {
                    var from = Path.Combine(Path.GetDirectoryName(src)!, rel);
                    var to = Path.Combine(pluginDir, rel);
                    if (File.Exists(from))
                    {
                        File.Move(from, to);
                        created.Add(to);
                    }
                }
                installedPlugins.Add($"{baseName}{PluginExt}");
            }
            manifest.Plugins = installedPlugins;

            var patchersDir = Constants.BepinexPatchersDir(gameRoot);
            var installedPatchers = new List<string>();
            foreach (var p in manifest.Patchers.ToList())
            {
                if (isCancelled?.Invoke() == true) throw new OperationCanceledException("install cancelled");
                var src = Path.GetFullPath(Path.Combine(extractRoot, SecurityScanner.NormalizeRel(p)));
                if (!PathGuard.IsInside(extractRoot, src))
                    throw new InvalidOperationException($"Patcher escapes temp: {p}");
                if (!File.Exists(src)) continue;
                Directory.CreateDirectory(patchersDir);
                var to = Path.Combine(patchersDir, Path.GetFileName(src));
                File.Move(src, to);
                created.Add(to);
                installedPatchers.Add(Path.GetFileName(src));
            }
            manifest.Patchers = installedPatchers;

            for (var i = 0; i < manifest.Assets.Count; i++)
            {
                if (isCancelled?.Invoke() == true) throw new OperationCanceledException("install cancelled");
                var asset = manifest.Assets[i];
                if (string.IsNullOrEmpty(asset.Destination)) continue;
                var dest = Path.GetFullPath(Path.Combine(gameRoot, asset.Destination));
                if (!PathGuard.IsInside(gameRoot, dest))
                    throw new InvalidOperationException($"Asset destination escapes game root: {dest}");
                var src = Path.GetFullPath(Path.Combine(extractRoot, SecurityScanner.NormalizeRel(asset.LocalPath)));
                if (!PathGuard.IsInside(extractRoot, src)) continue;
                if (!File.Exists(src) && !Directory.Exists(src)) continue;
                Directory.CreateDirectory(dest);
                CopyTreeContents(src, dest, created);
            }

            var srcGmp = FindGmpDir(extractRoot);
            if (srcGmp != null)
            {
                var dstGmp = Path.Combine(pluginDir, Constants.GmpMetadataFolder);
                Directory.Move(srcGmp, dstGmp);
                created.Add(dstGmp);
                File.WriteAllText(Path.Combine(dstGmp, Constants.ManifestFile),
                    JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }),
                    System.Text.Encoding.UTF8);
            }

            var metaFolder = Path.Combine(pluginDir, Constants.GmpMetadataFolder);
            Directory.CreateDirectory(metaFolder);
            var meta = new ModMetadata
            {
                Activated = true,
                SupportedPlusVersions = [],
                LastUpdateDate = DateTime.UtcNow.ToString("yyyy-MM-dd")
            };
            File.WriteAllText(Path.Combine(metaFolder, Constants.MetadataFile),
                JsonSerializer.Serialize(meta, new JsonSerializerOptions { WriteIndented = true }),
                System.Text.Encoding.UTF8);

            var supports = ManifestLoader.MatchSupportedVersion(pluginDir, gameVersion);
            return new ModArchiveInstallResult(manifest, meta, warnings, pluginDir, supports);
        }
        catch
        {
            rollback();
            throw;
        }
        finally
        {
            if (ownsTemp)
            {
                try
                {
                    if (PathGuard.IsInside(gameRoot, tempRoot))
                        ModArchiveExtractor.RemoveDirIfInside(gameRoot, tempRoot);
                }
                catch { /* best effort */ }
            }
        }
    }

    public static string InstallUnmanaged(
        string extractRoot,
        string gameRoot,
        Func<bool>? isCancelled = null,
        Action<InstallProgress>? onProgress = null)
    {
        var targets = ModArchivePlanner.CollectTargets(extractRoot);
        if (targets.Modded.Count == 0 && targets.Plugins.Count == 0 && targets.Patchers.Count == 0)
            throw new InvalidOperationException("No installable files found in archive");

        var modName = ModArchivePlanner.DeriveModName(targets);
        var moddedRoot = Path.GetFullPath(Path.Combine(gameRoot, ModdedRel));
        var pluginsRoot = Path.GetFullPath(Constants.BepinexPluginsDir(gameRoot));
        var patchersRoot = Path.GetFullPath(Constants.BepinexPatchersDir(gameRoot));
        var created = new List<string>();
        var rollback = () =>
        {
            foreach (var to in Enumerable.Reverse(created))
            {
                try
                {
                    if (Directory.Exists(to)) Directory.Delete(to, recursive: true);
                    else if (File.Exists(to)) File.Delete(to);
                }
                catch { /* best effort */ }
            }
        };
        try
        {
            foreach (var item in targets.Modded)
            {
                if (isCancelled?.Invoke() == true) throw new OperationCanceledException("install cancelled");
                var dest = Path.GetFullPath(Path.Combine(moddedRoot, item.DestRel));
                if (!PathGuard.IsInside(moddedRoot, dest) || !PathGuard.IsInside(gameRoot, dest))
                    throw new InvalidOperationException($"Modded dest escapes: {dest}");
                CopyTreeContents(item.Src, dest, created);
                onProgress?.Invoke(new InstallProgress("install", 50, modName));
            }
            foreach (var plugin in targets.Plugins)
            {
                if (isCancelled?.Invoke() == true) throw new OperationCanceledException("install cancelled");
                var destRel = plugin.DestRel.Contains('/')
                    ? Path.Combine(plugin.DestRel.Split('/'))
                    : plugin.DestRel;
                var dest = Path.GetFullPath(Path.Combine(pluginsRoot, destRel));
                if (!PathGuard.IsInside(pluginsRoot, dest) || !PathGuard.IsInside(gameRoot, dest))
                    throw new InvalidOperationException($"plugin dest escapes: {dest}");
                Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
                var existed = File.Exists(dest);
                File.Copy(plugin.Src, dest, overwrite: true);
                if (!existed) created.Add(dest);
                foreach (var extra in plugin.Extras)
                {
                    if (!File.Exists(extra)) continue;
                    var extraDest = Path.Combine(Path.GetDirectoryName(dest)!, Path.GetFileName(extra));
                    var existedExtra = File.Exists(extraDest);
                    File.Copy(extra, extraDest, overwrite: true);
                    if (!existedExtra) created.Add(extraDest);
                }
            }
            foreach (var patcher in targets.Patchers)
            {
                if (isCancelled?.Invoke() == true) throw new OperationCanceledException("install cancelled");
                var destRel = patcher.DestRel.Contains('/')
                    ? Path.Combine(patcher.DestRel.Split('/'))
                    : patcher.DestRel;
                var dest = Path.GetFullPath(Path.Combine(patchersRoot, destRel));
                if (!PathGuard.IsInside(patchersRoot, dest) || !PathGuard.IsInside(gameRoot, dest))
                    throw new InvalidOperationException($"patcher dest escapes: {dest}");
                Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
                var existed = File.Exists(dest);
                File.Copy(patcher.Src, dest, overwrite: true);
                if (!existed) created.Add(dest);
            }
            if (targets.ModInfo.Count > 0)
            {
                var modInfoRoot = Path.GetFullPath(Constants.BepinexModInfoDir(gameRoot));
                Directory.CreateDirectory(modInfoRoot);
                foreach (var item in targets.ModInfo)
                {
                    if (isCancelled?.Invoke() == true) throw new OperationCanceledException("install cancelled");
                    var dest = Path.GetFullPath(Path.Combine(modInfoRoot, item.DestRel));
                    if (!PathGuard.IsInside(modInfoRoot, dest) || !PathGuard.IsInside(gameRoot, dest))
                        throw new InvalidOperationException($"modInfo dest escapes: {dest}");
                    Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
                    var existed = File.Exists(dest);
                    File.Copy(item.Src, dest, overwrite: true);
                    if (!existed) created.Add(dest);
                }
            }
            onProgress?.Invoke(new InstallProgress("done", 100, modName));
            return modName;
        }
        catch
        {
            rollback();
            throw;
        }
    }

    public static void CleanupInstallCancelled(string gameRoot)
    {
        try
        {
            var tempBase = Path.Combine(gameRoot, Constants.GmpMetadataFolder, Constants.TempFolder);
            if (Directory.Exists(tempBase))
                Directory.Delete(tempBase, recursive: true);
        }
        catch { /* best effort */ }
    }

    private static List<string> RelatedFiles(string dir, string baseName)
    {
        var outList = new List<string>();
        if (!Directory.Exists(dir)) return outList;
        foreach (var f in Directory.GetFiles(dir))
        {
            var n = Path.GetFileName(f);
            if (n == $"{baseName}.dll" || n == $"{baseName}.xml" || n == $"{baseName}.pdb")
                outList.Add(n);
        }
        return outList;
    }

    private static void CopyTreeContents(string srcDir, string destDir, List<string> created)
    {
        Directory.CreateDirectory(destDir);
        created.Add(destDir);
        foreach (var name in Directory.GetFileSystemEntries(srcDir))
        {
            var from = name;
            var to = Path.Combine(destDir, Path.GetFileName(name));
            if (Directory.Exists(from))
                CopyTreeContents(from, to, created);
            else
            {
                File.Move(from, to);
                created.Add(to);
            }
        }
    }

    private static string? FindGmpDir(string extractRoot)
    {
        foreach (var f in new[] { Constants.GmpMetadataFolder, Constants.GmpFallbackMetadataFolder })
        {
            var p = Path.Combine(extractRoot, f);
            if (Directory.Exists(p)) return p;
        }
        return null;
    }
}
