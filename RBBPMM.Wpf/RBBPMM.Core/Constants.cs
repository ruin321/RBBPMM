namespace RBBPMM.Core;

public static class Constants
{
    public const string GameExeName = "BALDI.exe";
    public const string GameDataFolder = "BALDI_Data";
    public const string GameVersionFile = "globalgamemanagers";
    public const string BepInExFolder = "BepInEx";
    public const string PluginsFolder = "plugins";
    public const string PatcherFolder = "patchers";
    public const string ModInfoFolder = "modInfo";
    public const string BepInExConfigFolder = "config";
    public static readonly string[] TexturePacksRelative = ["BALDI_Data", "StreamingAssets", "Texture Packs"];
    public const string TexturePackManifest = "pack.json";
    public const string TexturePackReadmePattern = @"^readme.*\.txt$";
    public static readonly HashSet<string> ProtectedTexturePackFolders = ["core"];
    public const string GmpMetadataFolder = ".rbbpmm";
    public const string GmpFallbackMetadataFolder = "_rbbpmm";
    public const string ManifestFile = "manifest.json";
    public const string MetadataFile = ".metadata";
    public const string ScriptFile = "script.txt";
    public const string DisabledExtension = "disabled";
    public const string TempFolder = "temp";
    public const string SupportedVersionPrefix = "supVer_";
    public const string ThemeDefault = "dark";
    public static readonly HashSet<string> DarkThemeIds =
        ["dark", "baldi-black", "purple-black", "ocean-black", "forest-black", "rose-black"];
    public const string FontDefault = "Comic Sans MS";
    public const string LocaleDefault = "en";

    public static bool IsGameExeName(string name)
    {
        return !string.IsNullOrEmpty(name) &&
               string.Equals(name, GameExeName, StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsDarkTheme(string id) => DarkThemeIds.Contains(id);

    public static string InferSystemLocale(string systemLocale)
    {
        if (string.IsNullOrEmpty(systemLocale))
            return LocaleDefault;
        var full = systemLocale.ToLowerInvariant();
        var baseLang = System.Text.RegularExpressions.Regex.Replace(full, @"[_-].*$", "");
        return baseLang switch
        {
            "zh" => full.Contains("tw") || full.Contains("hk") || full.Contains("mo") ? "zh-TW" : "zh-CN",
            "ja" => "ja",
            "ko" => "ko",
            "fr" => "fr",
            "de" => "de",
            "es" => "es",
            "pt" => "pt",
            "ru" => "ru",
            _ => LocaleDefault
        };
    }

    public static string BepinexPluginsDir(string gameRoot) =>
        Path.Combine(gameRoot, BepInExFolder, PluginsFolder);

    public static string BepinexPatchersDir(string gameRoot) =>
        Path.Combine(gameRoot, BepInExFolder, PatcherFolder);

    public static string BepinexModInfoDir(string gameRoot) =>
        Path.Combine(gameRoot, BepInExFolder, ModInfoFolder);

    public static string TexturePacksDir(string gameRoot) =>
        Path.Combine([gameRoot, .. TexturePacksRelative]);
}
