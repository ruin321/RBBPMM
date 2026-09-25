namespace RBBPMM.Core;

/// <summary>
/// Manual title → plugin GUID overrides for mods whose dll does not expose a usable GUID.
/// Keyed by the mod's display title (case-sensitive, matching the Electron table).
/// </summary>
public static class ModGuidTable
{
    public static readonly Dictionary<string, string> ModGuidOverrides = new(StringComparer.Ordinal);
}
