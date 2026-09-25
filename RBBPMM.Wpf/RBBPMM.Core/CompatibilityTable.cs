using System.Text.RegularExpressions;

namespace RBBPMM.Core;

/// <summary>
/// GameBanana "BB+ Dev API" submission id plus the game-version → Dev API version table.
/// Ported from src/main/services/CompatibilityTable.ts.
/// </summary>
public static class CompatibilityTable
{
    public const int DevApiModId = 383711;

    public sealed record CompatibilityEntry(string GameVersion, string? DevApi);

    public static readonly CompatibilityEntry[] DevApiCompatibility =
    [
        new("0.14", "11.0.0.1"),
        new("0.13.1", "10.2.0.1"),
        new("0.13", "10.0.0.2"),
        new("0.12.2a", "9.1.0.0"),
        new("0.12.2", "9.1.0.0"),
        new("0.12.1", "9.1.0.0"),
        new("0.12", "9.0.0.0"),
        new("0.11", "8.2.1.0"),
        new("0.10.2", "7.1.0.0"),
        new("0.10.1", "7.1.0.0"),
        new("0.10", "7.1.0.0"),
        new("0.9a", "6.3.0.1"),
        new("0.9", "6.3.0.1"),
        new("0.8.1", "6.1.0.0"),
        new("0.8", "6.1.0.0"),
        new("0.7.1", "5.4.0.1"),
        new("0.7", "5.4.0.1"),
        new("0.6.2", "5.2.0.0"),
        new("0.6.1", "5.2.0.0"),
        new("0.6", "5.2.0.0"),
        new("0.5.2", "4.3.0.0"),
        new("0.5.1", "4.3.0.0"),
        new("0.5", "4.3.0.0"),
        new("0.4.2", "3.6.0.0"),
        new("0.4.1", "3.6.0.0"),
        new("0.4", "3.6.0.0"),
        new("0.3.8", "2.3.0.1"),
        new("0.3.7", "2.3.0.1"),
        new("0.3.6", "2.3.0.1"),
        new("0.3.5", "2.3.0.1"),
        new("0.3.4", "2.3.0.1"),
        new("0.3.3", "2.3.0.1"),
        new("0.3.2", "2.3.0.1"),
        new("0.3.1", "2.3.0.1"),
        new("0.3", "2.3.0.1")
    ];

    private static readonly Regex DottedVersion = new(@"(\d+(?:\.\d+)+)", RegexOptions.Compiled);
    private static readonly Regex LooseVersion = new(@"(\d+(?:\.\d+)*)", RegexOptions.Compiled);
    private static readonly Regex VersionPartsOf = new(@"\d+(?:\.\d+)*", RegexOptions.Compiled);
    private static readonly Regex NonVersionChars = new(@"[^0-9.a-z]", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>Extracts a dotted numeric version (needs at least one dot) or <c>null</c>.</summary>
    public static string? NormalizeGameVersion(string? v)
    {
        if (string.IsNullOrWhiteSpace(v))
            return null;
        var m = DottedVersion.Match(v.Trim().ToLowerInvariant());
        return m.Success ? m.Groups[1].Value : null;
    }

    /// <summary>Maps a game version onto the matching Dev API version, or <c>null</c> when unknown.</summary>
    public static string? ResolveDevApiVersion(string? gameVersion)
    {
        var norm = NormalizeGameVersion(gameVersion);
        if (norm == null)
            return null;
        foreach (var e in DevApiCompatibility)
            if (NormalizeGameVersion(e.GameVersion) == norm)
                return e.DevApi;
        return null;
    }

    /// <summary>Strips decoration from a version-ish token; a trailing <c>a</c> is dropped.</summary>
    public static string? NormVersionPart(string? v)
    {
        if (string.IsNullOrEmpty(v))
            return null;
        var cleaned = NonVersionChars.Replace(v, "");
        var m = LooseVersion.Match(cleaned);
        if (!m.Success)
            return null;
        var s = m.Groups[1].Value;
        return s.EndsWith('a') ? s[..^1] : s;
    }

    public static bool FileNameHasVersion(string fileName, string? version)
    {
        if (string.IsNullOrEmpty(version) || string.IsNullOrEmpty(fileName))
            return false;
        var target = NormVersionPart(version);
        if (target == null)
            return false;
        var parts = VersionPartsOf.Matches(fileName).Select(m => m.Value).ToList();
        return parts.Contains(target) || fileName.ToLowerInvariant().Contains(target);
    }

    /// <summary>
    /// Picks the Dev API file matching <paramref name="gameVersion"/> (or <paramref name="preferredVersion"/>),
    /// falling back to the highest file id.
    /// </summary>
    public static GamebananaFile? SelectDevApiFile(
        IReadOnlyList<GamebananaFile> files,
        string? gameVersion,
        string? preferredVersion = null)
    {
        if (files.Count == 0)
            return null;

        var target = preferredVersion ?? ResolveDevApiVersion(gameVersion);
        if (target != null)
        {
            var byVersion = files.FirstOrDefault(f => f.Version != null && NormVersionPart(f.Version) == NormVersionPart(target));
            if (byVersion != null)
                return byVersion;
            var byName = files.FirstOrDefault(f => FileNameHasVersion(f.FileName, target));
            if (byName != null)
                return byName;
        }

        return files.OrderByDescending(f => f.Id).FirstOrDefault(f => f.Id > 0) ?? files[0];
    }
}
