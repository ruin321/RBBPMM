using System.Text;
using System.Text.RegularExpressions;

namespace RBBPMM.Core;

/// <summary>
/// Extracts BepInEx plugin GUID candidates straight out of a compiled <c>.dll</c> by scanning its
/// string table — no assembly loading, so a malformed or hostile plugin can never execute here.
/// Ported from src/main/services/PluginGuid.ts.
/// </summary>
public static class PluginGuid
{
    // Dotted identifiers with 2..6 extra segments, e.g. "Some.Author.CoolMod".
    private static readonly Regex TokenRe = new(
        @"[A-Za-z][A-Za-z0-9_]{1,40}(?:\.[A-Za-z][A-Za-z0-9_]{0,40}){2,6}",
        RegexOptions.Compiled);

    // UTF-16LE runs appear as "X\0Y\0Z\0" once the file is decoded as Latin-1.
    private static readonly Regex Utf16RunRe = new(
        @"(?:[A-Za-z0-9_.]\x00){3,}",
        RegexOptions.Compiled);

    private static readonly Regex StopTail = new(
        @"\.(patches|ui|optionsapi|assettools|configuration|logging|bootstrap|api|tool|editor|handler|objectpool|extensions|manager|debug|state|core)$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex NumericSegment = new(@"^\d+$", RegexOptions.Compiled);

    private static readonly HashSet<string> StopSegments = new(StringComparer.OrdinalIgnoreCase)
    {
        "system", "unity", "unityengine", "microsoft", "mscorlib", "mono", "monomod",
        "newtonsoft", "bepinex", "csharp", "assembly", "js", "native", "dotnet"
    };

    private static readonly HashSet<string> StopMid = new(StringComparer.OrdinalIgnoreCase)
    {
        "ui", "editor", "tools", "extensions", "handlers", "objectpool", "manager",
        "debug", "state", "core", "patches", "api"
    };

    private const int CandidateCacheMax = 1024;
    private static readonly Dictionary<string, string[]> CandidateCache = new();
    private static readonly Lock CacheLock = new();

    public static (List<string> Utf16, List<string> Ascii) ScanTokens(string text)
    {
        var ascii = TokenRe.Matches(text).Select(m => m.Value);
        var utf16 = Utf16RunRe.Matches(text).Select(m => m.Value.Replace("\0", ""));

        var utf = Plausible(utf16).OrderBy(t => t.Count(c => c == '.')).ToList();
        var asciiOut = Plausible(ascii)
            .OrderBy(t => t.Count(c => c == '.'))
            .Where(t => !utf.Contains(t))
            .ToList();

        return (utf, asciiOut);
    }

    private static List<string> Plausible(IEnumerable<string> raw)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var outList = new List<string>();

        foreach (var rawTok in raw)
        {
            var segs = rawTok.Split('.', StringSplitOptions.RemoveEmptyEntries);
            if (segs.Length < 3 || segs.Length > 7)
                continue;
            if (segs.Any(s => StopSegments.Contains(s)))
                continue;
            if (segs.Any(s => NumericSegment.IsMatch(s)))
                continue;

            var tok = string.Join('.', segs);
            if (!seen.Add(tok))
                continue;
            if (StopTail.IsMatch(tok))
                continue;

            var mid = segs.Skip(1).Take(segs.Length - 2).ToList();
            if (mid.Any(s => StopMid.Contains(s)))
                continue;

            outList.Add(tok);
        }

        return outList;
    }

    /// <summary>Key on directory + name + size + mtime so a rewritten dll invalidates its entry.</summary>
    private static string? CacheKeyFor(string dllPath)
    {
        try
        {
            var fi = new FileInfo(dllPath);
            if (!fi.Exists)
                return null;
            return $"{Path.GetDirectoryName(dllPath)?.ToLowerInvariant()}\0{fi.Name.ToLowerInvariant()}\0{fi.Length}\0{fi.LastWriteTimeUtc.Ticks}";
        }
        catch
        {
            return null;
        }
    }

    private static List<string> ComputeCandidates(string dllPath)
    {
        string text;
        try
        {
            text = Encoding.Latin1.GetString(File.ReadAllBytes(dllPath));
        }
        catch
        {
            return [];
        }

        var (utf16, ascii) = ScanTokens(text);
        return [.. utf16, .. ascii];
    }

    /// <summary>Ordered GUID candidates for a plugin dll (UTF-16 hits first, then ASCII-only).</summary>
    public static List<string> ExtractPluginCandidates(string dllPath)
    {
        if (!File.Exists(dllPath))
            return [];

        var key = CacheKeyFor(dllPath);
        if (key == null)
            return [];

        lock (CacheLock)
        {
            if (CandidateCache.TryGetValue(key, out var cached))
                return [.. cached];

            var value = ComputeCandidates(dllPath);

            if (CandidateCache.Count >= CandidateCacheMax)
            {
                var oldest = CandidateCache.Keys.FirstOrDefault();
                if (oldest != null)
                    CandidateCache.Remove(oldest);
            }

            CandidateCache[key] = [.. value];
            return value;
        }
    }

    /// <summary>Best-effort plugin GUID — the first candidate, or <c>null</c>.</summary>
    public static string? ExtractPluginGuid(string dllPath)
    {
        var candidates = ExtractPluginCandidates(dllPath);
        return candidates.Count > 0 ? candidates[0] : null;
    }
}
