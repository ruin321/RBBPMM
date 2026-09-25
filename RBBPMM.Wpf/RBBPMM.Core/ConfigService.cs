using System.Text;
using System.Text.RegularExpressions;

namespace RBBPMM.Core;

/// <summary>
/// Reads and edits BepInEx <c>config/*.cfg</c> files, inferring an editor control per entry from
/// its <c># Setting type:</c> / <c># Acceptable values:</c> hint comments.
/// Ported from src/main/services/ConfigService.ts.
/// </summary>
public static class ConfigService
{
    private static readonly Regex SectionLine = new(@"^\s*\[(.+)\]\s*$", RegexOptions.Compiled);
    private static readonly Regex TypeHint = new(@"^#\s*Setting type:\s*(.*)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex DefaultHint = new(@"^#\s*Default value:\s*(.*)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex AcceptHint = new(@"^#\s*Acceptable values:\s*(.*)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex RangeHint = new(@"^#\s*Acceptable value range:\s*([\d.+\-eE]+)\s*(?:to|-)\s*([\d.+\-eE]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex MinHint = new(@"^#\s*(?:min|minimum):\s*([\d.+\-eE]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex MaxHint = new(@"^#\s*(?:max|maximum):\s*([\d.+\-eE]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex NumberType = new(
        @"^(s?byte|s?int|us?int|s?long|s?short|uint\d*|u?long\w*|int(8|16|32|64)|float|single|double|decimal)$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex FloatType = new(@"^(float|single|double|decimal)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex BoolLiteral = new(@"^(true|false)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex NumberLiteral = new(@"^-?\d+(\.\d+)?$", RegexOptions.Compiled);

    public static string ConfigDir(string gameRoot) =>
        Path.Combine(gameRoot, Constants.BepInExFolder, Constants.BepInExConfigFolder);

    /// <summary>All parsable <c>.cfg</c> files, ordered by file name.</summary>
    public static List<ConfigFile> ListCfgFiles(string gameRoot)
    {
        var dir = ConfigDir(gameRoot);
        List<string> names;
        try
        {
            names = Directory.GetFiles(dir)
                .Select(Path.GetFileName)
                .Where(f => f != null && f.EndsWith(".cfg", StringComparison.OrdinalIgnoreCase))
                .Select(f => f!)
                .OrderBy(f => f, StringComparer.Ordinal)
                .ToList();
        }
        catch
        {
            return [];
        }

        var outList = new List<ConfigFile>();
        foreach (var name in names)
        {
            var parsed = ParseCfgFile(Path.Combine(dir, name));
            if (parsed != null)
                outList.Add(parsed);
        }
        return outList;
    }

    /// <summary>Rewrites one key's value in place. Returns false when the key was not found.</summary>
    public static bool SetConfigValue(string cfgPath, string section, string key, string value)
    {
        string text;
        try
        {
            text = File.ReadAllText(cfgPath, Encoding.UTF8);
        }
        catch
        {
            return false;
        }

        var eol = text.Contains("\r\n", StringComparison.Ordinal) ? "\r\n" : "\n";
        var lines = Regex.Split(text, @"\r?\n");
        var inSection = false;
        var changed = false;

        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i];

            var sec = SectionLine.Match(line);
            if (sec.Success)
            {
                inSection = sec.Groups[1].Value.Trim() == section;
                continue;
            }

            if (!inSection)
                continue;

            var idx = line.IndexOf('=');
            if (idx <= 0)
                continue;

            var leftKey = line[..idx].Trim();
            if (leftKey != key)
                continue;

            changed = true;
            var left = Regex.Replace(line[..idx], @"\s+$", "");
            lines[i] = $"{left} = {value}";
        }

        if (!changed)
            return false;

        try
        {
            File.WriteAllText(cfgPath, string.Join(eol, lines), Encoding.UTF8);
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>True when <paramref name="cfgPath"/> resolves to a file strictly inside config/.</summary>
    public static bool IsSafeCfgPath(string gameRoot, string cfgPath)
    {
        var root = Path.GetFullPath(ConfigDir(gameRoot));
        string abs;
        try
        {
            abs = Path.GetFullPath(cfgPath);
        }
        catch
        {
            return false;
        }

        // Note: unlike Node's path.relative, Path.GetRelativePath returns "." for identical paths.
        var rel = Path.GetRelativePath(root, abs);
        return rel != "" && rel != "."
               && !rel.StartsWith("..", StringComparison.Ordinal)
               && !Path.IsPathRooted(rel);
    }

    public static bool DeleteConfigFile(string gameRoot, string cfgPath)
    {
        if (!IsSafeCfgPath(gameRoot, cfgPath))
            return false;
        try
        {
            if (!File.Exists(cfgPath))
                return true;
            File.Delete(cfgPath);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static (string Control, double? Step) ControlFor(string? rawType, string value, List<string>? accept)
    {
        var t = (rawType ?? "").ToLowerInvariant();

        if (t.Contains("bool", StringComparison.Ordinal) || (rawType == null && BoolLiteral.IsMatch(value)))
            return ("boolean", null);

        if (NumberType.IsMatch(t))
            return ("number", FloatType.IsMatch(t) ? 0.1 : 1);

        if (rawType == null && NumberLiteral.IsMatch(value))
            return ("number", value.Contains('.') ? 0.1 : 1);

        if (accept is { Count: > 0 } && !value.Contains(','))
            return ("select", null);

        return ("text", null);
    }

    private sealed class PendingMeta
    {
        public List<string> Desc { get; } = [];
        public string? Type { get; set; }
        public string? Default { get; set; }
        public List<string>? Accept { get; set; }
        public double? Min { get; set; }
        public double? Max { get; set; }
    }

    /// <summary>
    /// Parses a BepInEx cfg: comment hints attach to the next key, and the first comment block
    /// becomes the file-level heading.
    /// </summary>
    public static ConfigFile? ParseCfgFile(string cfgPath)
    {
        string text;
        try
        {
            text = File.ReadAllText(cfgPath, Encoding.UTF8);
        }
        catch
        {
            return null;
        }

        var rawLines = Regex.Split(text, @"(?<=\n)");
        var sections = new List<CfgSection>();
        CfgSection? current = null;
        PendingMeta? pending = null;
        string? fileHead = null;

        foreach (var raw in rawLines)
        {
            var line = Regex.Replace(raw, @"\r?\n$", "");
            var t = line.Trim();
            if (t.Length == 0)
                continue;

            var sectionMatch = Regex.Match(t, @"^\[(.+)\]$");
            if (sectionMatch.Success)
            {
                var name = sectionMatch.Groups[1].Value;
                var head = pending is { Desc.Count: > 0 } ? string.Join('\n', pending.Desc) : null;

                if (fileHead == null && pending is { Desc.Count: > 0 })
                    fileHead = head;

                // Upstream quirk kept for parity: `fileHead ? undefined : head` can never be
                // truthy here, so per-section headings are always absent (fileHead only).
                current = new CfgSection { Name = name, Heading = fileHead != null ? null : head };
                sections.Add(current);
                pending = null;
                continue;
            }

            var mType = TypeHint.Match(t);
            var mDef = DefaultHint.Match(t);
            var mAcc = AcceptHint.Match(t);
            var mRange = RangeHint.Match(t);
            var mMin = MinHint.Match(t);
            var mMax = MaxHint.Match(t);

            if (mType.Success || mDef.Success || mAcc.Success || mRange.Success || mMin.Success || mMax.Success)
            {
                pending ??= new PendingMeta();
                if (mType.Success)
                    pending.Type = mType.Groups[1].Value.Trim();
                if (mDef.Success)
                    pending.Default = mDef.Groups[1].Value.Trim();
                if (mAcc.Success)
                    pending.Accept = mAcc.Groups[1].Value
                        .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                        .ToList();
                if (mRange.Success)
                {
                    pending.Min = ParseDouble(mRange.Groups[1].Value);
                    pending.Max = ParseDouble(mRange.Groups[2].Value);
                }
                if (mMin.Success)
                    pending.Min = ParseDouble(mMin.Groups[1].Value);
                if (mMax.Success)
                    pending.Max = ParseDouble(mMax.Groups[1].Value);
                continue;
            }

            if (t.StartsWith('#'))
            {
                var content = t.StartsWith("##", StringComparison.Ordinal) ? t[2..] : t[1..];
                content = content.Trim();
                if (content.Length > 0)
                {
                    pending ??= new PendingMeta();
                    pending.Desc.Add(content);
                }
                continue;
            }

            if (current != null && !line.StartsWith('['))
            {
                var eq = line.IndexOf('=');
                if (eq > 0)
                {
                    var key = line[..eq].Trim();
                    var value = line[(eq + 1)..].Trim();
                    var (control, step) = ControlFor(pending?.Type, value, pending?.Accept);

                    current.Entries.Add(new CfgEntry
                    {
                        Key = key,
                        Value = value,
                        Control = control,
                        RawType = pending?.Type,
                        Description = pending is { Desc.Count: > 0 } ? string.Join('\n', pending.Desc) : null,
                        DefaultValue = pending?.Default,
                        Acceptable = pending?.Accept,
                        Min = pending?.Min,
                        Max = pending?.Max,
                        Step = step
                    });
                    pending = null;
                }
            }
        }

        return new ConfigFile
        {
            Path = cfgPath,
            FileName = Path.GetFileName(cfgPath),
            Heading = fileHead,
            Sections = sections
        };
    }

    private static double? ParseDouble(string s) =>
        double.TryParse(s, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d)
            ? d
            : null;
}
