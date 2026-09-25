using System.Text.RegularExpressions;

namespace RBBPMM.Core;

/// <summary>
/// Path safety helpers. Ported from src/main/services/PathGuard.ts.
/// Guarantees that every install/extract target stays inside an approved root.
/// </summary>
public static class PathGuard
{
    /// <summary>Resolve <paramref name="parts"/> under <paramref name="gameRoot"/>, throwing if they escape.</summary>
    public static string SearchAbsolutePath(string gameRoot, params string[] parts)
    {
        var root = Path.GetFullPath(gameRoot);
        var formed = parts.Length == 0 ? root : Path.GetFullPath(Path.Combine([root, ..parts]));
        if (formed != root && !IsInside(root, formed))
            throw new InvalidOperationException($"Path escapes game root: {string.Join('/', parts)}");
        return formed;
    }

    /// <summary>True when <paramref name="target"/> is strictly inside <paramref name="root"/>.</summary>
    public static bool IsInside(string root, string target)
    {
        var r = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            .ToLowerInvariant();
        var t = Path.GetFullPath(target).ToLowerInvariant();
        if (t == r)
            return false;
        var sep = Path.DirectorySeparatorChar;
        return t.StartsWith(r + sep) || t.StartsWith(r + '/');
    }

    public static bool IsPathSafetyValid(string gameRoot, params string[] parts)
    {
        try
        {
            SearchAbsolutePath(gameRoot, parts);
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Resolve a single zip entry name to an absolute path under <paramref name="extractRoot"/>.
    /// Throws on absolute entries, "<c>..</c>" traversal, or targets escaping the root.
    /// </summary>
    public static string SafeZipEntryPath(string extractRoot, string entryName)
    {
        var normalized = entryName.Replace('\\', '/');
        if (normalized.StartsWith('/') || Regex.IsMatch(normalized, @"^[a-zA-Z]:"))
            throw new InvalidOperationException($"Unsafe zip entry (absolute): {entryName}");
        if (normalized.Split('/').Contains(".."))
            throw new InvalidOperationException($"Unsafe zip entry (path traversal): {entryName}");
        var target = Path.GetFullPath(Path.Combine(extractRoot, entryName));
        var rootFull = Path.GetFullPath(extractRoot);
        if (!IsInside(rootFull, target) && target != rootFull)
            throw new InvalidOperationException($"Unsafe zip entry (outside root): {entryName}");
        return target;
    }
}
