using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace RBBPMM.Core;

/// <summary>Texture-pack discovery, install and removal. Ported from src/main/services/TexturePackService.ts.</summary>
public static class TexturePackService
{
    public static bool IsProtectedTexturePack(string folderName)
        => Constants.ProtectedTexturePackFolders.Contains(folderName.ToLowerInvariant());

    public static List<TexturePack> ListTexturePacks(string gameRoot)
    {
        var dir = Constants.TexturePacksDir(gameRoot);
        if (!Directory.Exists(dir))
            return [];
        var outList = new List<TexturePack>();
        foreach (var entry in Directory.GetFileSystemEntries(dir))
        {
            if (!Directory.Exists(entry)) continue;
            var name = Path.GetFileName(entry);
            var meta = ReadPackJson(entry);
            outList.Add(new TexturePack
            {
                FolderName = name,
                Name = meta?.Name ?? name,
                Author = meta?.Author,
                Version = meta?.Version,
                Description = meta?.Description,
                Protected = IsProtectedTexturePack(name)
            });
        }
        outList.Sort((a, b) => string.Compare(a.Name, b.Name, StringComparison.Ordinal));
        return outList;
    }

    public static async Task<TexturePackInstallResult> InstallTexturePack(
        string gameRoot, string archivePath, Action<string>? progress = null)
    {
        if (!File.Exists(archivePath))
            throw new FileNotFoundException("Archive not found", archivePath);
        var tempRoot = ModArchiveExtractor.CreateTempDir(gameRoot);
        try
        {
            progress?.Invoke("extracting");
            await ModArchiveExtractor.ExtractArchiveAsync(archivePath, tempRoot);
            var fallbackName = Path.GetFileName(archivePath)
                .Replace(Regex.Match(Path.GetFileName(archivePath), @"\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar)$", RegexOptions.IgnoreCase).Value, "");
            progress?.Invoke("installing");
            return await InstallTexturePacksFromRoot(gameRoot, tempRoot, fallbackName);
        }
        finally
        {
            if (Directory.Exists(tempRoot))
                ModArchiveExtractor.RemoveDirIfInside(gameRoot, tempRoot);
        }
    }

    public static async Task<bool> ProbeTexturePackArchive(string archivePath)
    {
        if (!File.Exists(archivePath)) return false;
        var tempRoot = Path.Combine(Path.GetTempPath(), $"bbp-probe-{Guid.NewGuid():N}");
        try
        {
            await ModArchiveExtractor.ExtractArchiveAsync(archivePath, tempRoot);
            if (HasModStructureInRoot(tempRoot)) return false;
            return FindPackDirs(tempRoot).Count > 0;
        }
        catch
        {
            return false;
        }
        finally
        {
            try { Directory.Delete(tempRoot, recursive: true); } catch { /* best effort */ }
        }
    }

    public static async Task<TexturePackInstallResult> InstallTexturePacksFromRoot(
        string gameRoot, string extractRoot, string fallbackName)
    {
        var targetRoot = Constants.TexturePacksDir(gameRoot);
        var readmes = CollectReadmes(extractRoot, 8);
        var packDirs = FindPackDirs(extractRoot);
        if (packDirs.Count == 0)
        {
            var dst = Path.Combine(targetRoot, fallbackName);
            Directory.CreateDirectory(targetRoot);
            await CopyDirContents(extractRoot, dst);
            var meta = ReadPackJson(dst);
            return new TexturePackInstallResult([PackDto(dst, fallbackName, meta)], targetRoot, readmes);
        }
        Directory.CreateDirectory(targetRoot);
        var installed = new List<TexturePack>();
        foreach (var src in packDirs)
        {
            var folderName = Path.GetFileName(src);
            var dst = Path.Combine(targetRoot, folderName);
            await CopyDirContents(src, dst);
            installed.Add(PackDto(dst, folderName, ReadPackJson(dst)));
        }
        return new TexturePackInstallResult(installed, targetRoot, readmes);
    }

    public static void UninstallTexturePack(string gameRoot, string folderName)
    {
        if (IsProtectedTexturePack(folderName))
            throw new InvalidOperationException($"This is a protected folder and cannot be deleted: {folderName}");
        var dir = Constants.TexturePacksDir(gameRoot);
        var target = Path.Combine(dir, folderName);
        if (!PathGuard.IsInside(dir, target))
            throw new InvalidOperationException($"refusing to remove path outside texture packs: {folderName}");
        if (Directory.Exists(target))
            Directory.Delete(target, recursive: true);
    }

    public static bool HasModStructureInRoot(string root) => Directory.Exists(Path.Combine(root, "BepInEx", "plugins"))
        || Directory.Exists(Path.Combine(root, Constants.GameDataFolder, "StreamingAssets", "Modded"))
        || Directory.Exists(Path.Combine(root, "Mod", "BepInEx"))
        || Directory.Exists(Path.Combine(root, "Mod", Constants.GameDataFolder));

    public static List<string> FindPackDirs(string root)
    {
        var found = new List<string>();
        WalkForPack(root, found);
        return found;
    }

    private static void WalkForPack(string dir, List<string> found)
    {
        try
        {
            var entries = Directory.GetFileSystemEntries(dir);
            var hasPack = false;
            var hasSubDir = false;
            foreach (var e in entries)
            {
                if (Directory.Exists(e)) hasSubDir = true;
                else if (Path.GetFileName(e).Equals(Constants.TexturePackManifest, StringComparison.OrdinalIgnoreCase))
                    hasPack = true;
            }
            if (hasPack)
            {
                found.Add(dir);
                return;
            }
            if (hasSubDir)
                foreach (var e in entries)
                    if (Directory.Exists(e))
                        WalkForPack(e, found);
        }
        catch
        {
            // ignore inaccessible dirs
        }
    }

    private sealed record PackMeta(string? Name, string? Author, string? Version, string? Description);

    private static PackMeta? ReadPackJson(string dir)
    {
        var p = Path.Combine(dir, Constants.TexturePackManifest);
        if (!File.Exists(p)) return null;
        try
        {
            var node = JsonNode.Parse(File.ReadAllText(p, System.Text.Encoding.UTF8));
            if (node == null) return null;
            return new PackMeta(
                node["Name"]?.GetValue<string>(),
                node["Author"]?.GetValue<string>(),
                node["Version"]?.GetValue<string>(),
                node["Description"]?.GetValue<string>());
        }
        catch
        {
            return null;
        }
    }

    private static TexturePack PackDto(string dir, string folderName, PackMeta? meta) => new()
    {
        FolderName = folderName,
        Name = meta?.Name ?? folderName,
        Author = meta?.Author,
        Version = meta?.Version,
        Description = meta?.Description
    };

    private static async Task CopyDirContents(string src, string dst)
    {
        Directory.CreateDirectory(dst);
        foreach (var entry in Directory.GetFileSystemEntries(src))
        {
            var to = Path.Combine(dst, Path.GetFileName(entry));
            if (Directory.Exists(entry))
                await CopyDirContents(entry, to);
            else
            {
                Directory.CreateDirectory(Path.GetDirectoryName(to)!);
                await Task.Run(() => File.Copy(entry, to, overwrite: true));
            }
        }
    }

    public static List<ReadmeFile> CollectReadmes(string root, int maxDepth)
    {
        var outList = new List<ReadmeFile>();
        CollectReadmes(root, outList, 0, maxDepth);
        return outList;
    }

    private static void CollectReadmes(string dir, List<ReadmeFile> outList, int depth, int maxDepth)
    {
        if (depth > maxDepth) return;
        try
        {
            foreach (var e in Directory.GetFileSystemEntries(dir))
            {
                if (Directory.Exists(e))
                {
                    CollectReadmes(e, outList, depth + 1, maxDepth);
                }
                else if (Regex.IsMatch(Path.GetFileName(e), Constants.TexturePackReadmePattern, RegexOptions.IgnoreCase))
                {
                    try { outList.Add(new ReadmeFile(Path.GetFileName(e), File.ReadAllText(e, System.Text.Encoding.UTF8))); }
                    catch { /* best effort */ }
                }
            }
        }
        catch
        {
            // ignore inaccessible dirs
        }
    }
}
