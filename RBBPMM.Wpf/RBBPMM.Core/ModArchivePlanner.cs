namespace RBBPMM.Core;

public sealed record InstallTarget(string Src, string DestRel);

public sealed record PluginTarget(string Src, string DestRel, List<string> Extras);

public sealed class InstallTargets
{
    public List<InstallTarget> Modded { get; set; } = [];
    public List<PluginTarget> Plugins { get; set; } = [];
    public List<InstallTarget> Patchers { get; set; } = [];
    public List<InstallTarget> ModInfo { get; set; } = [];
}

public sealed class ModInstallPlan
{
    public required string ModName { get; init; }
    public required bool NeedsConfirm { get; init; }
    public required List<string> Modded { get; init; }
    public required List<string> Plugins { get; init; }
}

public static class ModArchivePlanner
{
    private const string PluginExt = ".dll";

    private static string[] PluginsRootCandidates(string extractRoot) =>
    [
        Path.Combine(extractRoot, Constants.BepInExFolder, Constants.PluginsFolder),
        Path.Combine(extractRoot, Constants.PluginsFolder)
    ];

    private static string[] ModdedRootCandidates(string extractRoot) =>
    [
        Path.Combine(extractRoot, Constants.GameDataFolder, "StreamingAssets", "Modded"),
        Path.Combine(extractRoot, "Modded")
    ];

    private static string[] PatchersRootCandidates(string extractRoot) =>
    [
        Path.Combine(extractRoot, Constants.BepInExFolder, Constants.PatcherFolder),
        Path.Combine(extractRoot, Constants.PatcherFolder)
    ];

    private static PluginTarget PluginTarget(string absDll, string rel)
    {
        var dir = Path.GetDirectoryName(absDll) ?? "";
        var stem = Path.GetFileNameWithoutExtension(absDll);
        var extras = new List<string>();
        foreach (var f in new[] { "xml", "pdb" })
        {
            var p = Path.Combine(dir, $"{stem}.{f}");
            if (File.Exists(p))
                extras.Add(p);
        }
        return new PluginTarget(absDll, rel, extras);
    }

    private static void WalkDlls(string dir, string rel, List<PluginTarget> into)
    {
        foreach (var e in Directory.EnumerateFileSystemEntries(dir))
        {
            var name = Path.GetFileName(e);
            var childRel = rel.Length == 0 ? name : $"{rel}/{name}";
            if (Directory.Exists(e))
            {
                WalkDlls(e, childRel, into);
            }
            else if (name.ToLowerInvariant().EndsWith(PluginExt))
            {
                into.Add(PluginTarget(e, childRel));
            }
        }
    }

    private static void WalkPatchers(string dir, string rel, List<InstallTarget> into)
    {
        foreach (var e in Directory.EnumerateFileSystemEntries(dir))
        {
            var name = Path.GetFileName(e);
            var childRel = rel.Length == 0 ? name : $"{rel}/{name}";
            if (Directory.Exists(e))
            {
                WalkPatchers(e, childRel, into);
            }
            else if (name.ToLowerInvariant().EndsWith(PluginExt))
            {
                into.Add(new InstallTarget(e, childRel));
            }
        }
    }

    public static bool IsValidGuidFolderName(string input)
    {
        if (string.IsNullOrEmpty(input))
            return false;
        if (!System.Text.RegularExpressions.Regex.IsMatch(input, @"^[a-z0-9.]+$"))
            return false;
        var segs = input.Split('.');
        return segs.Length is >= 2 and <= 5;
    }

    public static bool IsTemplateFolderName(string input)
    {
        var n = input.ToLowerInvariant();
        return n.Contains("template") || n.Contains("example");
    }

    private static string RelDirOf(string rel)
    {
        var i = rel.LastIndexOf('/');
        return i == -1 ? "" : rel[..i];
    }

    private static string StemOf(string rel)
    {
        var baseName = Path.GetFileName(rel);
        var dot = baseName.LastIndexOf('.');
        return dot == -1 ? baseName : baseName[..dot];
    }

    private static PluginTarget? FindPluginEntry(List<PluginTarget> plugins, string rel, string stem)
    {
        var dir = RelDirOf(rel);
        return plugins.Find(p => RelDirOf(p.DestRel) == dir &&
                                 StemOf(p.DestRel).ToLowerInvariant() == stem)
               ?? plugins.Find(p => StemOf(p.DestRel).ToLowerInvariant() == stem);
    }

    private static void WalkHeuristic(string extractRoot, InstallTargets targets)
    {
        var skipNames = new HashSet<string>
        {
            Constants.GmpMetadataFolder, Constants.GmpFallbackMetadataFolder, Constants.TempFolder
        };
        var pendingDirs = new Stack<(string Abs, string Rel)>();
        pendingDirs.Push((extractRoot, ""));
        var files = new List<(string Abs, string Rel)>();
        while (pendingDirs.Count > 0)
        {
            var (abs, rel) = pendingDirs.Pop();
            IEnumerable<string> entries;
            try
            {
                entries = Directory.EnumerateFileSystemEntries(abs);
            }
            catch (Exception)
            {
                continue;
            }
            foreach (var e in entries)
            {
                var name = Path.GetFileName(e);
                var childRel = rel.Length == 0 ? name : $"{rel}/{name}";
                if (Directory.Exists(e))
                {
                    if (skipNames.Contains(name))
                        continue;
                    if (IsTemplateFolderName(name))
                        continue;
                    if (IsValidGuidFolderName(name))
                    {
                        if (!targets.Modded.Any(m => m.DestRel == name))
                            targets.Modded.Add(new InstallTarget(e, name));
                        continue;
                    }
                    pendingDirs.Push((e, childRel));
                }
                else
                {
                    files.Add((e, childRel));
                }
            }
        }

        var dllStems = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var f in files)
        {
            if (f.Rel.ToLowerInvariant().EndsWith(PluginExt))
                dllStems.Add(StemOf(f.Rel).ToLowerInvariant());
        }

        foreach (var f in files)
        {
            if (!f.Rel.ToLowerInvariant().EndsWith(PluginExt))
                continue;
            if (f.Rel.Split('/').Any(seg => seg.ToLowerInvariant() == "patchers"))
            {
                targets.Patchers.Add(new InstallTarget(f.Abs, Path.GetFileName(f.Rel)));
            }
            else
            {
                targets.Plugins.Add(new PluginTarget(f.Abs, f.Rel, []));
            }
        }

        foreach (var f in files)
        {
            var lower = f.Rel.ToLowerInvariant();
            var stem = StemOf(f.Rel).ToLowerInvariant();
            if (lower.EndsWith(".pdb") || lower.EndsWith(".xml"))
            {
                var owner = FindPluginEntry(targets.Plugins, f.Rel, stem);
                owner?.Extras.Add(f.Abs);
                continue;
            }
            if (lower.EndsWith(".json"))
            {
                var jsonStem = lower[..^".json".Length];
                var isDeps = jsonStem.EndsWith(".deps");
                if (isDeps)
                    jsonStem = jsonStem[..^".deps".Length];
                if (!dllStems.Contains(jsonStem))
                    continue;
                if (isDeps)
                {
                    var owner = FindPluginEntry(targets.Plugins, f.Rel, jsonStem);
                    owner?.Extras.Add(f.Abs);
                }
                else
                {
                    targets.ModInfo.Add(new InstallTarget(f.Abs, Path.GetFileName(f.Rel)));
                }
            }
        }
    }

    public static InstallTargets CollectTargets(string input)
    {
        var extractRoot = input ?? "";
        var modWrap = Path.Combine(extractRoot, "Mod");
        if (Path.GetFullPath(modWrap) != Path.GetFullPath(extractRoot) &&
            (Directory.Exists(Path.Combine(modWrap, Constants.BepInExFolder)) ||
             Directory.Exists(Path.Combine(modWrap, Constants.GameDataFolder))))
        {
            extractRoot = modWrap;
        }

        for (var depth = 0; depth < 5; depth++)
        {
            bool IsWrapper(string n) =>
                n != Constants.GmpMetadataFolder && n != Constants.GmpFallbackMetadataFolder && n != Constants.TempFolder;
            var dirs = Directory.Exists(extractRoot)
                ? Directory.EnumerateFileSystemEntries(extractRoot)
                    .Where(e => Directory.Exists(e) && IsWrapper(Path.GetFileName(e)))
                    .Select(e => Path.GetFileName(e)!)
                    .ToArray()
                : [];
            if (dirs.Length != 1)
                break;
            var child = Path.Combine(extractRoot, dirs[0]);
            var marked = PluginsRootCandidates(child).Concat(ModdedRootCandidates(child)).Any(Directory.Exists);
            if (!marked)
                break;
            extractRoot = child;
        }

        var modded = new List<InstallTarget>();
        var plugins = new List<PluginTarget>();
        var patchers = new List<InstallTarget>();
        var modInfo = new List<InstallTarget>();

        var moddedRoots = ModdedRootCandidates(extractRoot).Where(Directory.Exists).ToArray();
        foreach (var mr in moddedRoots)
        {
            foreach (var e in Directory.EnumerateFileSystemEntries(mr))
            {
                if (Directory.Exists(e))
                {
                    var name = Path.GetFileName(e);
                    if (!modded.Any(x => x.DestRel == name))
                        modded.Add(new InstallTarget(e, name));
                }
            }
        }

        var pluginRoots = PluginsRootCandidates(extractRoot).Where(Directory.Exists).ToArray();
        foreach (var pr in pluginRoots)
            WalkDlls(pr, "", plugins);

        var patchersRoots = PatchersRootCandidates(extractRoot).Where(Directory.Exists).ToArray();
        foreach (var pr in patchersRoots)
            WalkPatchers(pr, "", patchers);

        if (pluginRoots.Length > 0 || moddedRoots.Length > 0 || patchersRoots.Length > 0)
            return new InstallTargets { Modded = modded, Plugins = plugins, Patchers = patchers, ModInfo = modInfo };

        var targets = new InstallTargets { Modded = modded, Plugins = plugins, Patchers = patchers, ModInfo = modInfo };
        WalkHeuristic(extractRoot, targets);
        return targets;
    }

    public static string DeriveModName(InstallTargets targets)
    {
        if (targets.Plugins.Count > 0)
        {
            var p = targets.Plugins[0].DestRel;
            if (p.Contains('/'))
                return p.Split('/')[0];
            return p[..^PluginExt.Length];
        }
        if (targets.Modded.Count > 0)
            return targets.Modded[0].DestRel;
        return "Unknown Mod";
    }

    public static ModInstallPlan BuildPlan(string extractRoot)
    {
        var targets = CollectTargets(extractRoot);
        var modded = targets.Modded.Select(x => x.DestRel).Distinct().ToList();
        var plugins = targets.Plugins.Select(x => x.DestRel).Distinct().ToList();
        var needsConfirm = !(targets.Modded.Count > 0 && targets.Plugins.Count > 0);
        return new ModInstallPlan
        {
            ModName = DeriveModName(targets),
            NeedsConfirm = needsConfirm,
            Modded = modded,
            Plugins = plugins
        };
    }
}
