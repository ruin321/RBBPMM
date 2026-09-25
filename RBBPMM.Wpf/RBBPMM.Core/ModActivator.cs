using System.Text.RegularExpressions;

namespace RBBPMM.Core;

/// <summary>Enable/disable mods by renaming their DLLs to/from the <c>.disabled</c> sentinel.</summary>
public static class ModActivator
{
    private const string PluginExt = ".dll";
    private const string DisabledSuffix = ".disabled";

    /// <summary>Strip activation suffixes and extensions to get a DLL's logical stem.</summary>
    public static string DllStem(string relative)
    {
        var s = relative;
        var lc = s.ToLowerInvariant();
        if (lc.EndsWith(".disabled")) s = s[..^9];
        else if (lc.EndsWith(".disable")) s = s[..^8];
        lc = s.ToLowerInvariant();
        var backup = Regex.Match(s, @"^(.*)\.dll\.\d+$", RegexOptions.IgnoreCase);
        if (backup.Success) return backup.Groups[1].Value;
        if (lc.EndsWith(".dll")) return s[..^4];
        return s;
    }

    private static List<string> DisabledCandidates(string baseName)
    {
        var stem = Path.GetFileName(baseName);
        return
        [
            $"{stem}{DisabledSuffix}",
            $"{stem}.disable",
            $"{stem}.dll{DisabledSuffix}",
            $"{stem}.dll.disable",
            $"{stem}.dll.1"
        ];
    }

    private static string? DetectStemFromName(string name)
    {
        if (string.IsNullOrEmpty(name) || name[0] == '.') return null;
        var lc = name.ToLowerInvariant();
        if (lc.EndsWith(DisabledSuffix))
        {
            var raw = name[..^DisabledSuffix.Length];
            return raw.ToLowerInvariant().EndsWith(".dll") ? raw[..^4] : raw;
        }
        if (lc.EndsWith(".disable"))
        {
            var raw = name[..^8];
            return raw.ToLowerInvariant().EndsWith(".dll") ? raw[..^4] : raw;
        }
        var dot = name.LastIndexOf('.');
        return dot > 0 ? name[..dot] : null;
    }

    private static string? FindDisabledFile(string dir, string baseName)
    {
        var stem = Path.GetFileName(baseName).ToLowerInvariant();
        string? found = null;
        foreach (var f in Directory.GetFiles(dir))
        {
            var fn = Path.GetFileName(f);
            if (fn.ToLowerInvariant() == $"{stem}.dll") continue;
            var detected = DetectStemFromName(fn);
            if (detected != null && detected.ToLowerInvariant() == stem)
            {
                if (found != null) return null;
                found = fn;
            }
        }
        return found;
    }

    private static bool RenameDll(string dir, string baseName, bool activate)
    {
        var active = Path.Combine(dir, $"{Path.GetFileName(baseName)}.dll");
        if (activate)
        {
            if (File.Exists(active)) return true;
            foreach (var cand in DisabledCandidates(baseName))
            {
                var src = Path.Combine(dir, cand);
                if (File.Exists(src) && !Directory.Exists(src))
                {
                    File.Move(src, active);
                    return true;
                }
            }
            var stemName = Path.GetFileName(baseName).ToLowerInvariant();
            foreach (var f in Directory.GetFiles(dir))
            {
                var fn = Path.GetFileName(f);
                if (Regex.IsMatch(fn, @"\.dll\.\d+$", RegexOptions.IgnoreCase) &&
                    fn.ToLowerInvariant().StartsWith($"{stemName}.dll."))
                {
                    File.Move(f, active);
                    return true;
                }
            }
            var loose = FindDisabledFile(dir, baseName);
            if (loose != null && !loose.Equals($"{Path.GetFileName(baseName)}.dll", StringComparison.OrdinalIgnoreCase))
            {
                File.Move(Path.Combine(dir, loose), active);
                return true;
            }
            return false;
        }
        if (File.Exists(active))
        {
            File.Move(active, Path.Combine(dir, $"{Path.GetFileName(baseName)}{DisabledSuffix}"));
            return true;
        }
        return true;
    }

    public static bool ToggleActivation(string gameRoot, string modRoot, ModManifest manifest, bool activate)
    {
        foreach (var p in manifest.Plugins)
        {
            var pluginPath = Path.GetFullPath(Path.Combine(modRoot, p.StartsWith("..") ? Path.Combine("..", p) : p));
            var dir = Path.GetDirectoryName(pluginPath)!;
            var baseName = Path.GetFileNameWithoutExtension(pluginPath);
            if (Directory.Exists(dir))
                RenameDll(dir, baseName, activate);
        }
        var patchersDir = Constants.BepinexPatchersDir(gameRoot);
        foreach (var p in manifest.Patchers)
        {
            var baseName = Path.GetFileNameWithoutExtension(p);
            if (Directory.Exists(patchersDir))
                RenameDll(patchersDir, baseName, activate);
        }
        var meta = ManifestLoader.LoadMetadata(modRoot);
        meta.Activated = activate;
        ManifestLoader.SaveMetadata(modRoot, meta);
        return activate;
    }

    public static (bool Activated, List<string> PluginFiles) ToggleLegacyPlugin(
        string installDir, List<string> pluginFiles, bool activate)
    {
        var next = new List<string>();
        foreach (var pf in pluginFiles)
        {
            var dir = Path.GetDirectoryName(Path.GetFullPath(Path.Combine(installDir, pf)))!;
            RenameDll(dir, DllStem(pf), activate);
            var logical = $"{Path.GetFileName(DllStem(pf))}{PluginExt}";
            var prefix = Path.GetDirectoryName(pf) ?? "";
            next.Add(prefix == "." ? logical : Path.Combine(prefix, logical));
        }
        return (activate, next);
    }
}
