using System.Text;
using System.Text.RegularExpressions;

namespace RBBPMM.Core;

/// <summary>
/// Installs custom levels into the game's Level Studio "Playables" folder (a per-user path under
/// <c>%UserProfile%\AppData\LocalLow</c>, not the game install).
/// Ported from src/main/services/LevelStudioInstaller.ts.
/// </summary>
public static class LevelStudioInstaller
{
    public const string PbplExtension = ".pbpl";

    private static readonly Regex ReadmePattern = new(@"readme.*\.(md|txt)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private const long ReadmeMaxBytes = 256 * 1024;

    /// <summary>Test seam: overrides the resolved Playables directory.</summary>
    public static string? PlayablesPathOverride { get; set; }

    public static string LevelStudioPlayablesPath()
    {
        if (!string.IsNullOrEmpty(PlayablesPathOverride))
            return PlayablesPathOverride;

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "AppData", "LocalLow", "Basically Games", "Baldi's Basics Plus",
            "Level Studio", "Playables");
    }

    private static FileSystemInfo[] EntriesList(string dir)
    {
        try
        {
            return new DirectoryInfo(dir).GetFileSystemInfos();
        }
        catch
        {
            return [];
        }
    }

    public static void FindPbplFiles(string root, List<string> outList)
    {
        foreach (var entry in EntriesList(root))
        {
            if (entry is DirectoryInfo di)
            {
                if (di.Name != "__MACOSX")
                    FindPbplFiles(di.FullName, outList);
            }
            else if (Path.GetExtension(entry.Name).Equals(PbplExtension, StringComparison.OrdinalIgnoreCase))
            {
                outList.Add(entry.FullName);
            }
        }
    }

    public static void CollectLevelStudioReadmes(string root, List<ReadmeFile> outList)
    {
        foreach (var entry in EntriesList(root))
        {
            if (entry is DirectoryInfo di)
            {
                if (di.Name != "__MACOSX")
                    CollectLevelStudioReadmes(di.FullName, outList);
                continue;
            }

            if (!ReadmePattern.IsMatch(entry.Name))
                continue;

            try
            {
                var fi = new FileInfo(entry.FullName);
                if (fi.Length > ReadmeMaxBytes)
                    continue;
                var content = File.ReadAllText(entry.FullName, Encoding.UTF8);
                var rel = Path.GetRelativePath(root, entry.FullName).Replace('\\', '/');
                outList.Add(new ReadmeFile(rel, content));
            }
            catch
            {
                // unreadable readme — skip
            }
        }
    }

    private static async Task CopyEntryAsync(string src, string dst)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(dst)!);

        if (Directory.Exists(src))
        {
            Directory.CreateDirectory(dst);
            foreach (var entry in EntriesList(src))
                await CopyEntryAsync(entry.FullName, Path.Combine(dst, entry.Name));
        }
        else if (File.Exists(src))
        {
            File.Copy(src, dst, overwrite: true);
        }
    }

    private static string? NestedSingleDir(string root)
    {
        var entries = EntriesList(root).Where(e => e.Name != "__MACOSX").ToList();
        if (entries.Count != 1 || entries[0] is not DirectoryInfo di)
            return null;
        return di.Name;
    }

    private static void RemoveIfExists(string path)
    {
        try
        {
            if (Directory.Exists(path))
                Directory.Delete(path, recursive: true);
            else if (File.Exists(path))
                File.Delete(path);
        }
        catch
        {
            // best effort — the copy below overwrites anyway
        }
    }

    /// <summary>
    /// Copies <c>.pbpl</c> files (or, when the archive only ships a folder, its contents) into Playables.
    /// Throws when a destination would land outside Playables.
    /// </summary>
    public static async Task<LevelStudioInstallResult> InstallLevelStudioPlayableAsync(string extractRoot)
    {
        var playables = LevelStudioPlayablesPath();
        Directory.CreateDirectory(playables);

        var readmes = new List<ReadmeFile>();
        CollectLevelStudioReadmes(extractRoot, readmes);

        var pbplFiles = new List<string>();
        FindPbplFiles(extractRoot, pbplFiles);

        var installed = new List<string>();

        if (pbplFiles.Count > 0)
        {
            foreach (var src in pbplFiles)
            {
                var baseName = Path.GetFileName(src);
                var dst = Path.Combine(playables, baseName);
                if (!PathGuard.IsInside(playables, dst))
                    throw new InvalidOperationException($"refusing to install outside Level Studio Playables: {baseName}");

                RemoveIfExists(dst);
                await CopyEntryAsync(src, dst);
                installed.Add(baseName);
            }
            return new LevelStudioInstallResult(installed, readmes);
        }

        var nested = NestedSingleDir(extractRoot);
        var srcRoot = nested != null ? Path.Combine(extractRoot, nested) : extractRoot;

        foreach (var entry in EntriesList(srcRoot))
        {
            if (entry.Name == "__MACOSX")
                continue;
            if (ReadmePattern.IsMatch(entry.Name))
                continue;

            var dst = Path.Combine(playables, entry.Name);
            if (!PathGuard.IsInside(playables, dst))
                throw new InvalidOperationException($"refusing to install outside Level Studio Playables: {entry.Name}");

            RemoveIfExists(dst);
            await CopyEntryAsync(entry.FullName, dst);
            installed.Add(entry.Name);
        }

        return new LevelStudioInstallResult(installed, readmes);
    }
}
