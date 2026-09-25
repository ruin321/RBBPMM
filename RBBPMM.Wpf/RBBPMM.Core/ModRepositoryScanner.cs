using System.Text.RegularExpressions;

namespace RBBPMM.Core;

/// <summary>
/// Builds the mod list the UI shows. Three sources are merged:
/// <list type="number">
///   <item>managed GMP mods (a <c>manifest.json</c> under <c>BepInEx/plugins/&lt;dir&gt;/.rbbpmm</c>)</item>
///   <item>legacy plugins grouped by dll stem inside plugin subfolders</item>
///   <item>legacy plugins sitting loose in <c>BepInEx/plugins</c></item>
/// </list>
/// Legacy entries are then linked to their <c>StreamingAssets/Modded/&lt;folder&gt;</c> asset folder.
/// Ported from src/main/services/ModRepositoryScanner.ts (cache semantics preserved).
/// </summary>
public static class ModRepositoryScanner
{
    private static readonly Regex DllOrPdb = new(@"\.(dll|pdb)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex BackupDll = new(@"^(.*\.dll)\.\d+$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex ActiveDll = new(@"\.dll$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex NotActiveDll = new(@"\.(disabled|disable|\.\d+)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex CfgFile = new(@"\.cfg$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex NonAlphaNum = new(@"[^a-z0-9]", RegexOptions.Compiled);

    private sealed record PluginEntry(string Stem, string File, bool Disabled)
    {
        public string StemLower => Stem.ToLowerInvariant();
    }

    private sealed record PluginDiskEntry(string File, bool Disabled);

    private sealed class LegacyMeta
    {
        public required ModItem Item { get; init; }
        public required List<string> Candidates { get; init; }
    }

    private sealed class PluginGroup
    {
        public required string Title { get; init; }
        public List<string> Active { get; } = [];
        public List<string> Disabled { get; } = [];
    }

    private sealed record ScanCacheEntry(string? GameVersion, List<ModItem> Mods);

    private static readonly Dictionary<string, ScanCacheEntry> ScanCache = new();
    private static readonly Lock CacheLock = new();

    public static string ModdedRoot(string gameRoot) =>
        Path.Combine(gameRoot, Constants.GameDataFolder, "StreamingAssets", "Modded");

    // ---------------------------------------------------------------- filesystem helpers

    private static FileSystemInfo[] ReadEntries(string dir)
    {
        try
        {
            return new DirectoryInfo(dir).GetFileSystemInfos();
        }
        catch
        {
            return [];
        }
    }

    private static bool SamePath(string a, string b) =>
        string.Equals(
            a.ToLowerInvariant().TrimEnd('\\', '/'),
            b.ToLowerInvariant().TrimEnd('\\', '/'),
            StringComparison.Ordinal);

    /// <summary>Newest dll/pdb mtime under <paramref name="abs"/>, else the folder's own mtime.</summary>
    public static long? DirInstalledAt(string abs)
    {
        try
        {
            long newest = 0;

            void Walk(string dir)
            {
                foreach (var e in ReadEntries(dir))
                {
                    if (e is DirectoryInfo di)
                    {
                        Walk(di.FullName);
                    }
                    else if (DllOrPdb.IsMatch(e.Name))
                    {
                        try
                        {
                            var m = new DateTimeOffset(e.LastWriteTimeUtc).ToUnixTimeMilliseconds();
                            if (m > newest)
                                newest = m;
                        }
                        catch { /* skip */ }
                    }
                }
            }

            Walk(abs);
            if (newest > 0)
                return newest;

            var self = new DirectoryInfo(abs);
            var mtime = new DateTimeOffset(self.LastWriteTimeUtc).ToUnixTimeMilliseconds();
            return mtime > 0 ? mtime : null;
        }
        catch
        {
            return null;
        }
    }

    private static Dictionary<string, string>? ModdedFolderMap(string gameRoot)
    {
        var root = ModdedRoot(gameRoot);
        if (!Directory.Exists(root))
            return null;

        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var e in ReadEntries(root))
            if (e is DirectoryInfo di)
                map[di.Name.ToLowerInvariant()] = di.FullName;
        return map;
    }

    private static string? FindModdedFolder(string gameRoot, IEnumerable<string?> names)
    {
        var dirs = ModdedFolderMap(gameRoot);
        if (dirs == null)
            return null;

        foreach (var n in names)
        {
            if (string.IsNullOrEmpty(n))
                continue;
            if (dirs.TryGetValue(n.ToLowerInvariant(), out var abs))
                return abs;
        }
        return null;
    }

    /// <summary>Resolves a logical plugin name onto whichever on-disk variant exists.</summary>
    public static string PluginDiskPath(string pluginDir, string rel)
    {
        var direct = Path.Combine(pluginDir, rel);
        if (File.Exists(direct))
            return direct;

        var stem = Regex.Replace(direct, @"\.dll$", "", RegexOptions.IgnoreCase);
        string[] alternatives = [direct + ".disabled", direct + ".disable", stem + ".disabled", stem + ".disable", direct + ".1"];
        foreach (var alt in alternatives)
            if (File.Exists(alt))
                return alt;

        return direct;
    }

    private static List<string> CollectCandidates(string pluginDir, IReadOnlyList<string> pluginFiles)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var outList = new List<string>();

        foreach (var rel in pluginFiles.Take(16))
            foreach (var c in PluginGuid.ExtractPluginCandidates(PluginDiskPath(pluginDir, rel)))
                if (seen.Add(c))
                    outList.Add(c);

        return outList;
    }

    private static string? ResolveIdentifyName(string title, IReadOnlyList<string> candidates)
    {
        if (ModGuidTable.ModGuidOverrides.TryGetValue(title, out var over))
            return over;
        return candidates.Count > 0 ? candidates[0] : null;
    }

    /// <summary>0..3 confidence that a mod title refers to a plugin GUID.</summary>
    public static int TitleMatchScore(string? title, string? guid)
    {
        if (string.IsNullOrEmpty(title) || string.IsNullOrEmpty(guid))
            return 0;

        var t = title.ToLowerInvariant();
        var g = guid.ToLowerInvariant();
        var last = g.Split('.').LastOrDefault() ?? "";

        if (t == last || t == g)
            return 3;
        if (last.Contains(t, StringComparison.Ordinal) || t.Contains(last, StringComparison.Ordinal))
            return 2;

        var tJ = NonAlphaNum.Replace(t, "");
        var gJ = NonAlphaNum.Replace(g, "");
        if (gJ.Contains(tJ, StringComparison.Ordinal) || tJ.Contains(gJ, StringComparison.Ordinal))
            return 1;

        return 0;
    }

    // ---------------------------------------------------------------- item builders

    public static ModItem BuildModItem(string gameRoot, string modRoot, ModManifest manifest, bool supports)
    {
        var dirName = Path.GetFileName(modRoot);
        var meta = ManifestLoader.LoadMetadata(modRoot);

        return new ModItem
        {
            Guid = manifest.Guid,
            Name = manifest.Name,
            Author = manifest.Author,
            Version = manifest.Version,
            Description = manifest.Description,
            IdentifyName = manifest.Guid,
            InstalledAt = DirInstalledAt(modRoot),
            ModdedFolder = FindModdedFolder(gameRoot, [dirName, manifest.Name, manifest.Guid]),
            DirectoryName = dirName,
            InstallDir = modRoot,
            Activated = meta.Activated,
            SupportsCurrentVersion = supports,
            PluginFiles = [.. manifest.Plugins],
            AssetPaths = manifest.Assets.Select(a =>
                !string.IsNullOrEmpty(a.Destination) ? a.Destination! : a.LocalPath).ToList(),
            Loose = false,
            GamebananaSource = meta.GamebananaSource
        };
    }

    private static PluginEntry? ParsePluginEntry(string name)
    {
        if (string.IsNullOrEmpty(name) || name[0] == '.')
            return null;

        var lc = name.ToLowerInvariant();

        if (lc.EndsWith(".disabled", StringComparison.Ordinal) || lc.EndsWith(".disable", StringComparison.Ordinal))
        {
            var raw = lc.EndsWith(".disabled", StringComparison.Ordinal) ? name[..^9] : name[..^8];
            var stem = raw.ToLowerInvariant().EndsWith(".dll", StringComparison.Ordinal) ? raw[..^4] : raw;
            if (stem.Length == 0)
                return null;
            return new PluginEntry(stem, stem + ".dll", true);
        }

        if (lc.EndsWith(".dll", StringComparison.Ordinal))
            return new PluginEntry(name[..^4], name, false);

        var backup = BackupDll.Match(name);
        if (backup.Success)
        {
            var logical = backup.Groups[1].Value;
            return new PluginEntry(logical[..^4], logical, true);
        }

        return null;
    }

    private static void CollectPlugins(string dir, string prefix, List<PluginDiskEntry> outList)
    {
        foreach (var e in ReadEntries(dir))
        {
            var rel = prefix.Length > 0 ? Path.Combine(prefix, e.Name) : e.Name;

            if (e is FileInfo)
            {
                var norm = ParsePluginEntry(e.Name);
                if (norm != null)
                    outList.Add(new PluginDiskEntry(
                        norm.File == e.Name ? rel : Path.Combine(prefix, norm.File),
                        norm.Disabled));
            }
            else if (e is DirectoryInfo)
            {
                if (e.Name.StartsWith('.'))
                    continue;
                CollectPlugins(e.FullName, rel, outList);
            }
        }
    }

    private static ModItem BuildLegacyItem(
        string installDir,
        string title,
        List<string> plugins,
        bool activated,
        string? identifyName,
        string? group = null,
        string? guidOverride = null)
    {
        return new ModItem
        {
            Guid = guidOverride ?? $"legacy:{title}",
            Name = title,
            Author = "BepInEx plugin",
            Version = "",
            Description = null,
            IdentifyName = identifyName,
            InstalledAt = DirInstalledAt(installDir),
            ModdedFolder = null,
            DirectoryName = Path.GetFileName(installDir),
            InstallDir = installDir,
            Activated = activated,
            SupportsCurrentVersion = true,
            PluginFiles = plugins,
            AssetPaths = [],
            Loose = false,
            Group = group
        };
    }

    // ---------------------------------------------------------------- cache

    private static string ScanCacheKey(string gameRoot, string? gameVersion) =>
        $"{gameRoot.ToLowerInvariant()}\0{gameVersion ?? ""}";

    /// <summary>Drops cached scans for a root — pass a version to drop just that one.</summary>
    public static void InvalidateModScan(string gameRoot, string? gameVersion = null)
    {
        lock (CacheLock)
        {
            if (gameVersion != null)
            {
                ScanCache.Remove(ScanCacheKey(gameRoot, gameVersion));
                return;
            }

            var prefix = gameRoot.ToLowerInvariant();
            foreach (var k in ScanCache.Keys.Where(k => k.StartsWith(prefix, StringComparison.Ordinal)).ToList())
                ScanCache.Remove(k);
        }
    }

    /// <summary>
    /// Rewrites a single cached entry without rescanning the disk (used after install/activate/
    /// uninstall). Also re-resolves the derived dll/config paths on the patched copy.
    /// </summary>
    public static bool PatchModScanEntry(string gameRoot, string guid, Func<ModItem, ModItem> apply)
    {
        lock (CacheLock)
        {
            var prefix = gameRoot.ToLowerInvariant();
            var hit = false;

            foreach (var key in ScanCache.Keys.Where(k => k.StartsWith(prefix, StringComparison.Ordinal)).ToList())
            {
                var entry = ScanCache[key];
                var idx = entry.Mods.FindIndex(m => m.Guid == guid);
                if (idx < 0)
                    continue;

                var next = apply(entry.Mods[idx]);
                ApplyResolvedPaths(gameRoot, next);
                entry.Mods[idx] = next;
                hit = true;
            }

            return hit;
        }
    }

    public static List<ModItem> ScanRepositoryCached(string gameRoot, string? gameVersion = null)
    {
        var key = ScanCacheKey(gameRoot, gameVersion);
        lock (CacheLock)
        {
            if (ScanCache.TryGetValue(key, out var hit))
                return [.. hit.Mods];
        }

        var mods = ScanRepository(gameRoot, gameVersion);
        lock (CacheLock)
        {
            ScanCache[key] = new ScanCacheEntry(gameVersion, mods);
        }
        return [.. mods];
    }

    // ---------------------------------------------------------------- scan

    public static List<ModItem> ScanRepository(string gameRoot, string? gameVersion = null)
    {
        var pluginsDir = Constants.BepinexPluginsDir(gameRoot);
        if (!Directory.Exists(pluginsDir))
            return [];

        var mods = new List<ModItem>();
        var coveredStems = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var legacyMetas = new List<LegacyMeta>();
        var entries = ReadEntries(pluginsDir);

        // --- pass 1: plugin subfolders (managed GMP mods, then legacy stems)
        foreach (var entry in entries)
        {
            if (entry is not DirectoryInfo di || di.Name.StartsWith('.'))
                continue;

            var modRoot = di.FullName;
            var manifest = ManifestLoader.LoadModManifest(modRoot);

            if (manifest != null)
            {
                var supports = ManifestLoader.MatchSupportedVersion(modRoot, gameVersion);
                mods.Add(BuildModItem(gameRoot, modRoot, manifest, supports));
                foreach (var p in manifest.Plugins)
                {
                    var norm = ParsePluginEntry(Path.GetFileName(p));
                    if (norm != null)
                        coveredStems.Add(norm.StemLower);
                }
                continue;
            }

            var plugins = new List<PluginDiskEntry>();
            CollectPlugins(modRoot, "", plugins);
            if (plugins.Count == 0)
                continue;

            var byStem = new Dictionary<string, (string Stem, string? Active, string? Disabled)>(StringComparer.OrdinalIgnoreCase);
            foreach (var p in plugins)
            {
                var parsed = ParsePluginEntry(Path.GetFileName(p.File));
                if (parsed == null)
                    continue;

                var key = parsed.StemLower;
                if (!byStem.TryGetValue(key, out var cur))
                    cur = (parsed.Stem, null, null);

                if (p.Disabled)
                    cur.Disabled ??= p.File;
                else
                    cur.Active ??= p.File;

                byStem[key] = cur;
            }

            foreach (var (_, cur) in byStem)
            {
                var file = cur.Active ?? cur.Disabled ?? "";
                if (file.Length == 0)
                    continue;

                var activated = cur.Active != null;
                var candidates = CollectCandidates(modRoot, [file]);
                var item = BuildLegacyItem(
                    modRoot,
                    cur.Stem,
                    [file],
                    activated,
                    ResolveIdentifyName(di.Name, candidates),
                    di.Name,
                    $"legacy:{di.Name}/{cur.Stem}");
                mods.Add(item);
                legacyMetas.Add(new LegacyMeta { Item = item, Candidates = candidates });
            }

            foreach (var p in plugins)
                coveredStems.Add(Path.GetFileName(p.File).ToLowerInvariant());
        }

        // --- pass 2: loose plugin files directly in BepInEx/plugins
        var roots = new List<PluginGroup>();
        var rootIndex = new Dictionary<string, PluginGroup>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in entries)
        {
            if (entry is not FileInfo)
                continue;

            var norm = ParsePluginEntry(entry.Name);
            if (norm == null)
                continue;

            var stem = norm.StemLower;
            if (coveredStems.Contains(stem))
                continue;

            if (!rootIndex.TryGetValue(stem, out var group))
            {
                group = new PluginGroup { Title = norm.Stem };
                rootIndex[stem] = group;
                roots.Add(group);
            }

            if (norm.Disabled)
                group.Disabled.Add(norm.File);
            else
                group.Active.Add(norm.File);
        }

        foreach (var g in roots)
        {
            if (g.Active.Count > 0)
            {
                var candidates = CollectCandidates(pluginsDir, g.Active);
                var item = BuildLegacyItem(pluginsDir, g.Title, g.Active, true, ResolveIdentifyName(g.Title, candidates));
                mods.Add(item);
                legacyMetas.Add(new LegacyMeta { Item = item, Candidates = candidates });
            }
            else if (g.Disabled.Count > 0)
            {
                var candidates = CollectCandidates(pluginsDir, [g.Disabled[0]]);
                var item = BuildLegacyItem(pluginsDir, g.Title, [g.Disabled[0]], false, ResolveIdentifyName(g.Title, candidates));
                mods.Add(item);
                legacyMetas.Add(new LegacyMeta { Item = item, Candidates = candidates });
            }
        }

        // --- pass 3: attach StreamingAssets/Modded folders to legacy entries
        var dirs = ModdedFolderMap(gameRoot);
        if (dirs != null && legacyMetas.Count > 0)
            LinkModdedFolders(gameRoot, dirs, mods, legacyMetas);

        foreach (var m in mods)
            ApplyResolvedPaths(gameRoot, m);

        return mods;
    }

    private static void LinkModdedFolders(
        string gameRoot,
        Dictionary<string, string> dirs,
        List<ModItem> mods,
        List<LegacyMeta> legacyMetas)
    {
        var identFreq = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var le in legacyMetas)
        {
            var idn = le.Item.IdentifyName;
            if (string.IsNullOrEmpty(idn))
                continue;
            var k = idn.ToLowerInvariant();
            identFreq[k] = identFreq.GetValueOrDefault(k) + 1;
        }

        var claimed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var m in mods)
            if (!string.IsNullOrEmpty(m.ModdedFolder))
                claimed.Add(Path.GetFileName(m.ModdedFolder).ToLowerInvariant());

        foreach (var le in legacyMetas)
        {
            if (string.IsNullOrEmpty(le.Item.IdentifyName))
                continue;
            if (dirs.TryGetValue(le.Item.IdentifyName.ToLowerInvariant(), out var abs))
                claimed.Add(Path.GetFileName(abs).ToLowerInvariant());
        }

        // Guid-identified folders: only attach when the owner is unambiguous.
        var identOwners = new Dictionary<string, List<(LegacyMeta Le, int Score)>>(StringComparer.OrdinalIgnoreCase);
        foreach (var le in legacyMetas)
        {
            var idn = le.Item.IdentifyName;
            if (string.IsNullOrEmpty(idn))
                continue;
            if (!dirs.TryGetValue(idn.ToLowerInvariant(), out var abs))
                continue;

            var k = Path.GetFileName(abs).ToLowerInvariant();
            var score = Math.Max(
                TitleMatchScore(le.Item.Name, idn),
                identFreq.GetValueOrDefault(k) == 1 ? 1 : 0);

            if (!identOwners.TryGetValue(k, out var arr))
                identOwners[k] = arr = [];
            arr.Add((le, score));
        }

        foreach (var (k, owners) in identOwners)
        {
            var scored = owners.Where(o => o.Score > 0).ToList();
            var pool = scored.Count > 0 ? scored : owners;
            var best = pool.Count > 0 ? pool.Aggregate((a, b) => b.Score > a.Score ? b : a) : default;

            if (pool.Count != 1 && best.Score == 0)
                continue;

            best.Le.Item.ModdedFolder = dirs[k];
            claimed.Add(k);
        }

        foreach (var le in legacyMetas)
        {
            if (!string.IsNullOrEmpty(le.Item.ModdedFolder))
                continue;

            foreach (var c in le.Candidates)
            {
                if (string.IsNullOrEmpty(c))
                    continue;
                if (!dirs.TryGetValue(c.ToLowerInvariant(), out var abs))
                    continue;
                var baseName = Path.GetFileName(abs).ToLowerInvariant();
                if (claimed.Contains(baseName))
                    continue;
                le.Item.ModdedFolder = abs;
                claimed.Add(baseName);
                break;
            }

            if (string.IsNullOrEmpty(le.Item.ModdedFolder))
            {
                var tf = FindModdedFolder(gameRoot, [le.Item.Name]);
                if (tf != null && !claimed.Contains(Path.GetFileName(tf).ToLowerInvariant()))
                    le.Item.ModdedFolder = tf;
            }
        }
    }

    /// <summary>Fills in the derived dll/config paths consumed by the UI and uninstaller.</summary>
    public static void ApplyResolvedPaths(string gameRoot, ModItem m)
    {
        var pluginsDir = Constants.BepinexPluginsDir(gameRoot);
        var active = m.PluginFiles.FirstOrDefault(p => ActiveDll.IsMatch(p) && !NotActiveDll.IsMatch(p))
                     ?? (m.PluginFiles.Count > 0 ? m.PluginFiles[0] : null);

        if (active != null)
        {
            var abs = Path.IsPathRooted(active) ? active : Path.Combine(m.InstallDir, active);
            m.DllFile = abs;
            m.DllDirectory = Path.GetDirectoryName(abs);
            m.Loose = m.DllDirectory != null && SamePath(m.DllDirectory, pluginsDir);
        }
        else
        {
            m.Loose = SamePath(m.InstallDir, pluginsDir);
        }

        var bepinexRoot = Path.GetDirectoryName(pluginsDir) ?? gameRoot;
        m.ConfigFile = FindConfigFile(Path.Combine(bepinexRoot, Constants.BepInExConfigFolder), m);
    }

    /// <summary>Best-effort match of a mod onto its BepInEx <c>config/&lt;stem&gt;.cfg</c>.</summary>
    public static string? FindConfigFile(string configDir, ModItem m)
    {
        if (!Directory.Exists(configDir))
            return null;

        List<string> cfgFiles;
        try
        {
            cfgFiles = Directory.GetFiles(configDir)
                .Select(Path.GetFileName)
                .Where(f => f != null && CfgFile.IsMatch(f))
                .Select(f => f!)
                .ToList();
        }
        catch
        {
            return null;
        }

        if (cfgFiles.Count == 0)
            return null;

        var stems = m.PluginFiles
            .Select(p => Regex.Replace(Path.GetFileName(p), @"\.dll$", "", RegexOptions.IgnoreCase).ToLowerInvariant())
            .ToList();

        foreach (var stem in stems)
        {
            if (stem.Length == 0)
                continue;
            var hit = cfgFiles.FirstOrDefault(f =>
            {
                var s = Regex.Replace(f.ToLowerInvariant(), @"\.cfg$", "", RegexOptions.IgnoreCase);
                return s == stem || s.StartsWith(stem, StringComparison.Ordinal) || stem.StartsWith(s, StringComparison.Ordinal);
            });
            if (hit != null)
                return Path.Combine(configDir, hit);
        }

        var idn = (m.IdentifyName ?? "").ToLowerInvariant();
        if (idn.Length > 0)
        {
            var byGuid = cfgFiles.FirstOrDefault(f =>
            {
                var s = Regex.Replace(f.ToLowerInvariant(), @"\.cfg$", "", RegexOptions.IgnoreCase);
                return s.Contains(idn, StringComparison.Ordinal) || idn.Contains(s, StringComparison.Ordinal);
            });
            if (byGuid != null)
                return Path.Combine(configDir, byGuid);
        }

        return null;
    }

    /// <summary>Groups mods by their owning plugin subfolder for display.</summary>
    public static string? GroupOf(ModItem m) => m.Group;
}
