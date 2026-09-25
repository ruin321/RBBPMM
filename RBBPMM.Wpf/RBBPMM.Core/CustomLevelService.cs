using System.Text;
using System.Text.RegularExpressions;

namespace RBBPMM.Core;

/// <summary>
/// Lists, toggles and deletes <c>.pbpl</c> custom levels, reading name/author/type out of the
/// binary prefix and lifting the embedded PNG artwork as a thumbnail.
/// Ported from src/main/services/CustomLevelParser.ts + CustomLevelService.ts.
/// </summary>
public static class CustomLevelService
{
    public const string DisabledSuffix = ".disabled";

    private static readonly byte[] PngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    private static readonly byte[] IendMagic = Encoding.ASCII.GetBytes("IEND");

    private static readonly Regex GuidRun = new(
        @"^[A-Za-z0-9_-]{8}-[A-Za-z0-9_-]{4}-[A-Za-z0-9_-]{4}-[A-Za-z0-9_-]{4}-[A-Za-z0-9_-]{12}$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex StandardType = new(@"^standard$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex TypeLike = new(@"^[a-z][a-z0-9._-]*$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>Test seam: overrides the Level Studio Playables directory.</summary>
    public static string? PlayablesPathOverride
    {
        get => LevelStudioInstaller.PlayablesPathOverride;
        set => LevelStudioInstaller.PlayablesPathOverride = value;
    }

    public static string StripDisabled(string name) =>
        name.EndsWith(DisabledSuffix, StringComparison.Ordinal) ? name[..^DisabledSuffix.Length] : name;

    private static bool IsPbpl(string name) =>
        name.EndsWith(LevelStudioInstaller.PbplExtension, StringComparison.OrdinalIgnoreCase);

    private static bool IsPrintableAscii(byte b) => b is >= 32 and <= 126;

    /// <summary>Walks the length-prefixed string table that precedes the embedded PNG.</summary>
    public static List<string> CollectStrings(byte[] buf, int end)
    {
        var outList = new List<string>();
        var i = 0;

        while (i + 1 <= end && i < buf.Length)
        {
            var len = buf[i];
            if (len >= 3 && len <= 64 && i + 1 + len <= end && i + 1 + len <= buf.Length)
            {
                var printable = true;
                for (var k = 0; k < len; k++)
                {
                    if (!IsPrintableAscii(buf[i + 1 + k]))
                    {
                        printable = false;
                        break;
                    }
                }

                if (printable)
                {
                    outList.Add(Encoding.Latin1.GetString(buf, i + 1, len));
                    i += 1 + len;
                    continue;
                }
            }

            i++;
        }

        return outList;
    }

    private static int IndexOf(byte[] haystack, byte[] needle, int start = 0)
    {
        if (needle.Length == 0 || haystack.Length < needle.Length)
            return -1;

        for (var i = Math.Max(0, start); i <= haystack.Length - needle.Length; i++)
        {
            var match = true;
            for (var j = 0; j < needle.Length; j++)
            {
                if (haystack[i + j] != needle[j])
                {
                    match = false;
                    break;
                }
            }
            if (match)
                return i;
        }

        return -1;
    }

    /// <summary>Reads one <c>.pbpl</c>. Returns <c>null</c> when the file cannot be read.</summary>
    public static CustomLevel? ReadCustomLevel(string pbplPath, long size)
    {
        byte[] buf;
        var statSize = size;
        try
        {
            buf = File.ReadAllBytes(pbplPath);
            if (statSize <= 0)
                statSize = buf.Length;
        }
        catch
        {
            return null;
        }

        var pngStart = IndexOf(buf, PngMagic);
        var metaEnd = pngStart >= 0 ? pngStart : buf.Length;

        var raw = CollectStrings(buf, metaEnd);
        var strings = raw.Where(s => s.Length >= 3 && !GuidRun.IsMatch(s)).ToList();
        var pool = strings.Count > 0 ? strings : raw;

        var name = pool.Count > 0 ? pool[0] : "";
        var author = pool.Count > 1 ? pool[1] : "";

        var knownType = pool.FirstOrDefault(s => StandardType.IsMatch(s));
        var type = knownType ?? "";
        if (type.Length == 0)
        {
            type = pool.FirstOrDefault(s =>
                s.Length <= 24 && TypeLike.IsMatch(s) && s != name && s != author) ?? "";
        }

        string? thumbnail = null;
        if (pngStart >= 0)
        {
            var iend = IndexOf(buf, IendMagic, pngStart);
            if (iend >= 0)
            {
                var pngEnd = Math.Min(iend + 8, buf.Length);
                var pngLen = pngEnd - pngStart;
                if (pngLen > PngMagic.Length)
                    thumbnail = "data:image/png;base64," + Convert.ToBase64String(buf, pngStart, pngLen);
            }
        }

        return new CustomLevel(
            FileName: "",
            Name: name,
            Author: author,
            Type: type,
            Size: statSize,
            Enabled: true,
            Thumbnail: thumbnail);
    }

    /// <summary>Every <c>.pbpl</c> in Playables, including <c>.disabled</c> ones.</summary>
    public static List<CustomLevel> ListCustomLevels()
    {
        var playables = LevelStudioInstaller.LevelStudioPlayablesPath();
        var outList = new List<CustomLevel>();

        FileSystemInfo[] entries;
        try
        {
            entries = new DirectoryInfo(playables).GetFileSystemInfos();
        }
        catch
        {
            return outList;
        }

        foreach (var entry in entries)
        {
            if (entry is not FileInfo)
                continue;

            var name = entry.Name;
            if (name.EndsWith(DisabledSuffix, StringComparison.Ordinal))
            {
                if (!IsPbpl(StripDisabled(name)))
                    continue;
            }
            else if (!IsPbpl(name))
            {
                continue;
            }

            var baseName = StripDisabled(name);
            var enabled = !name.EndsWith(DisabledSuffix, StringComparison.Ordinal);
            long size = 0;
            try
            {
                size = new FileInfo(entry.FullName).Length;
            }
            catch
            {
                // size stays 0
            }

            var parsed = ReadCustomLevel(entry.FullName, size);
            if (parsed != null)
                outList.Add(parsed with { FileName = baseName, Enabled = enabled });
            else
                outList.Add(new CustomLevel(baseName, baseName, "", "", size, enabled));
        }

        return outList;
    }

    /// <summary>Renames between <c>x.pbpl</c> and <c>x.pbpl.disabled</c>.</summary>
    public static void ToggleCustomLevel(string fileName, bool enable)
    {
        var playables = LevelStudioInstaller.LevelStudioPlayablesPath();
        var baseName = StripDisabled(fileName);
        var targetName = baseName + (enable ? "" : DisabledSuffix);
        var targetAbs = Path.Combine(playables, targetName);

        if (!PathGuard.IsInside(playables, targetAbs))
            throw new InvalidOperationException($"invalid custom level path: {fileName}");

        var oppositeName = baseName + (enable ? DisabledSuffix : "");
        var oppositeAbs = Path.Combine(playables, oppositeName);

        if (File.Exists(oppositeAbs) && PathGuard.IsInside(playables, oppositeAbs))
        {
            File.Move(oppositeAbs, targetAbs, overwrite: true);
            return;
        }

        if (File.Exists(targetAbs))
            return;

        throw new FileNotFoundException($"custom level not found: {fileName}");
    }

    /// <summary>Deletes both the enabled and disabled variants of a level.</summary>
    public static void DeleteCustomLevel(string fileName)
    {
        var playables = LevelStudioInstaller.LevelStudioPlayablesPath();
        var baseName = StripDisabled(fileName);
        var deleted = false;

        foreach (var nm in new[] { baseName, baseName + DisabledSuffix })
        {
            var abs = Path.Combine(playables, nm);
            if (!PathGuard.IsInside(playables, abs))
                continue;
            if (File.Exists(abs))
            {
                File.Delete(abs);
                deleted = true;
            }
        }

        if (!deleted)
            throw new FileNotFoundException($"custom level not found: {fileName}");
    }
}
