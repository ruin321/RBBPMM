namespace RBBPMM.Core;

/// <summary>
/// Lightweight static analysis of an extracted mod manifest.
/// Ported from src/main/services/SecurityScanner.ts.
/// </summary>
public static class SecurityScanner
{
    private static readonly HashSet<string> ExecutableExts =
        [".exe", ".dll", ".so", ".dylib", ".bat", ".cmd", ".sh", ".ps1", ".jar"];

    private static bool LooksExecutable(string filePath)
    {
        var ext = Path.GetExtension(filePath).ToLowerInvariant();
        if (ExecutableExts.Contains(ext))
            return true;
        try
        {
            var head = File.ReadAllBytes(filePath);
            if (head.Length >= 2 && head[0] == 0x4D && head[1] == 0x5A)
                return true; // PE (MZ)
            if (head.Length >= 4 && head[0] == 0x7F && head[1] == 0x45 && head[2] == 0x4C && head[3] == 0x46)
                return true; // ELF
        }
        catch
        {
            // ignore
        }
        return false;
    }

    public static List<SecurityWarning> ScanManifest(string gameRoot, string extractRoot, ModManifest manifest)
    {
        var warnings = new List<SecurityWarning>();
        var i = 0;
        foreach (var asset in manifest.Assets)
        {
            if (string.IsNullOrEmpty(asset.Destination))
                continue;
            var dest = Path.GetFullPath(Path.Combine(gameRoot, asset.Destination));
            if (!PathGuard.IsInside(Path.GetFullPath(gameRoot), dest))
            {
                warnings.Add(new SecurityWarning($"assets[{i}].Destination", "path escapes game root"));
                continue;
            }
            var localAbs = Path.GetFullPath(Path.Combine(extractRoot, NormalizeRel(asset.LocalPath)));
            if (File.Exists(localAbs) && LooksExecutable(localAbs))
                warnings.Add(new SecurityWarning($"assets[{i}].LocalPath", "asset looks like an executable"));
            i++;
        }
        return warnings;
    }

    public static string NormalizeRel(string p)
    {
        var n = p.Replace('\\', '/');
        return n.StartsWith('/') ? n[1..] : n;
    }
}
