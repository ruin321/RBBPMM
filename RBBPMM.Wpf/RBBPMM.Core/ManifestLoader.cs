using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace RBBPMM.Core;

/// <summary>
/// Reads/writes the GMP manifest and per-mod metadata, plus the supported-version match.
/// Ported from src/main/services/ManifestLoader.ts.
/// </summary>
public static class ManifestLoader
{
    private static readonly string[] MetaFolders = [Constants.GmpMetadataFolder, Constants.GmpFallbackMetadataFolder];

    private static string? PickMetadataFolder(string modRoot)
    {
        foreach (var f in MetaFolders)
        {
            var p = Path.Combine(modRoot, f);
            if (Directory.Exists(p))
                return p;
        }
        return null;
    }

    public static ModManifest? LoadModManifest(string modRoot, string? gameVersion = null)
    {
        var metaFolder = PickMetadataFolder(modRoot);
        if (metaFolder == null)
            return null;
        var manifestPath = Path.Combine(metaFolder, Constants.ManifestFile);
        if (!File.Exists(manifestPath))
            return null;
        JsonNode? raw;
        try
        {
            raw = JsonNode.Parse(File.ReadAllText(manifestPath, Encoding.UTF8));
        }
        catch
        {
            return null;
        }
        var m = ParseManifest(raw);
        return m;
    }

    /// <summary>Parse + validate a manifest node (requires guid/name/author/version).</summary>
    public static ModManifest? ParseManifest(JsonNode? node)
    {
        if (node == null || node["guid"] == null || node["name"] == null ||
            node["author"] == null || node["version"] == null)
            return null;
        var m = new ModManifest
        {
            Guid = node["guid"]!.GetValue<string>(),
            Name = node["name"]!.GetValue<string>(),
            Author = node["author"]!.GetValue<string>(),
            Version = node["version"]!.GetValue<string>(),
            Description = node["description"]?.GetValue<string>(),
        };
        if (node["assets"] is JsonArray assets)
            foreach (var a in assets)
            {
                if (a == null) continue;
                m.Assets.Add(new ModAsset
                {
                    LocalPath = a["localPath"]?.GetValue<string>() ?? "",
                    Destination = a["destination"]?.GetValue<string>()
                });
            }
        if (node["plugins"] is JsonArray plugins)
            foreach (var p in plugins)
                if (p != null) m.Plugins.Add(p.GetValue<string>());
        if (node["patchers"] is JsonArray patchers)
            foreach (var p in patchers)
                if (p != null) m.Patchers.Add(p.GetValue<string>());
        return m;
    }

    /// <summary>Locate a GMP manifest inside an already-extracted archive root.</summary>
    public static ModManifest? LoadManifestCompat(string extractRoot)
    {
        foreach (var f in MetaFolders)
        {
            var p = Path.Combine(extractRoot, f, Constants.ManifestFile);
            if (!File.Exists(p)) continue;
            try
            {
                var raw = JsonNode.Parse(File.ReadAllText(p, Encoding.UTF8));
                var m = ParseManifest(raw);
                if (m != null)
                    return m;
            }
            catch
            {
                // ignore and try fallback folder
            }
        }
        return null;
    }

    public static ModMetadata LoadMetadata(string modRoot)
    {
        var defaults = new ModMetadata { Activated = true, SupportedPlusVersions = [] };
        var metaFolder = PickMetadataFolder(modRoot);
        if (metaFolder == null)
            return defaults;
        var metaPath = Path.Combine(metaFolder, Constants.MetadataFile);
        if (!File.Exists(metaPath))
            return defaults;
        try
        {
            var raw = JsonNode.Parse(File.ReadAllText(metaPath, Encoding.UTF8));
            if (raw == null) return defaults;
            return new ModMetadata
            {
                Activated = raw["activated"]?.GetValue<bool>() ?? true,
                SupportedPlusVersions = raw["supportedPlusVersions"] is JsonArray v
                    ? v.Select(x => x?.GetValue<string>() ?? "").Where(s => s.Length > 0).ToList()
                    : [],
                LastUpdateDate = raw["lastUpdateDate"]?.GetValue<string>(),
                InstallationUrl = raw["installationUrl"]?.GetValue<string>(),
                Thumbnail = raw["thumbnail"]?.GetValue<string>(),
                Path = raw["path"]?.GetValue<string>(),
                GamebananaSource = ParseGamebananaSource(raw["gamebananaSource"]),
                LastInstalledArchiveName = raw["lastInstalledArchiveName"]?.GetValue<string>()
            };
        }
        catch
        {
            return defaults;
        }
    }

    private static GamebananaSource? ParseGamebananaSource(JsonNode? node)
    {
        if (node == null) return null;
        return new GamebananaSource
        {
            SubmissionId = node["submissionId"]?.GetValue<int>() ?? 0,
            FileId = node["fileId"]?.GetValue<int>() ?? 0,
            FileName = node["fileName"]?.GetValue<string>() ?? "",
            Version = node["version"]?.GetValue<string>(),
            SubmissionName = node["submissionName"]?.GetValue<string>(),
            DateLinked = node["dateLinked"]?.GetValue<string>() ?? ""
        };
    }

    public static void SaveMetadata(string modRoot, ModMetadata metadata)
    {
        var metaFolder = PickMetadataFolder(modRoot);
        if (metaFolder == null)
            return;
        var metaPath = Path.Combine(metaFolder, Constants.MetadataFile);
        var node = new JsonObject
        {
            ["activated"] = metadata.Activated,
            ["supportedPlusVersions"] = new JsonArray(metadata.SupportedPlusVersions.Select(s => (JsonNode)s).ToArray()),
            ["lastUpdateDate"] = metadata.LastUpdateDate,
            ["installationUrl"] = metadata.InstallationUrl,
            ["thumbnail"] = metadata.Thumbnail,
            ["path"] = metadata.Path,
            ["lastInstalledArchiveName"] = metadata.LastInstalledArchiveName
        };
        if (metadata.GamebananaSource != null)
        {
            node["gamebananaSource"] = new JsonObject
            {
                ["submissionId"] = metadata.GamebananaSource.SubmissionId,
                ["fileId"] = metadata.GamebananaSource.FileId,
                ["fileName"] = metadata.GamebananaSource.FileName,
                ["version"] = metadata.GamebananaSource.Version,
                ["submissionName"] = metadata.GamebananaSource.SubmissionName,
                ["dateLinked"] = metadata.GamebananaSource.DateLinked
            };
        }
        File.WriteAllText(metaPath, node.ToJsonString(new JsonSerializerOptions { WriteIndented = true }), Encoding.UTF8);
    }

    public static bool MatchSupportedVersion(string modRoot, string? gameVersion)
    {
        if (string.IsNullOrEmpty(gameVersion))
            return true;
        var metaFolder = PickMetadataFolder(modRoot);
        if (metaFolder == null)
            return false;
        var versions = new List<string>();
        try
        {
            foreach (var f in Directory.GetFiles(metaFolder))
            {
                var name = Path.GetFileName(f);
                if (name.StartsWith(Constants.SupportedVersionPrefix))
                {
                    var rest = name[Constants.SupportedVersionPrefix.Length..];
                    versions.AddRange(rest.Split('_', StringSplitOptions.RemoveEmptyEntries));
                }
            }
        }
        catch
        {
            return false;
        }
        if (versions.Count == 0)
            return true;
        return versions.Contains(gameVersion);
    }

    /// <summary>True when a manifest.json with the required fields exists under one of the meta folders.</summary>
    public static bool HasManifest(string extractRoot)
    {
        foreach (var f in MetaFolders)
            if (File.Exists(Path.Combine(extractRoot, f, Constants.ManifestFile)))
                return true;
        return false;
    }
}
