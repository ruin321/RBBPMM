using System.Diagnostics;
using System.IO.Compression;

namespace RBBPMM.Core;

/// <summary>
/// Archive extraction with path-traversal protection. Mirrors
/// src/main/services/ModArchiveExtractor.ts (zip via System.IO.Compression, everything else via 7z).
/// </summary>
public static class ModArchiveExtractor
{
    /// <summary>Override the 7z executable location (defaults to common install paths + PATH).</summary>
    public static string? SevenZipExecutable { get; set; }

    private static readonly string[] ZipExtensions = [".zip", ".jar", ".apk", ".bbmod", ".gmp"];

    public static bool IsZipFormat(string archivePath)
    {
        var lower = archivePath.ToLowerInvariant();
        if (ZipExtensions.Any(lower.EndsWith))
            return true;
        return StartsWithZipMagic(archivePath);
    }

    public static bool StartsWithZipMagic(string archivePath)
    {
        try
        {
            using var fs = new FileStream(archivePath, FileMode.Open, FileAccess.Read);
            Span<byte> buf = stackalloc byte[4];
            var n = fs.Read(buf);
            return n >= 2 && buf[0] == 0x50 && buf[1] == 0x4B;
        }
        catch
        {
            return false;
        }
    }

    private static string ResolveSevenZip()
    {
        if (!string.IsNullOrEmpty(SevenZipExecutable) && File.Exists(SevenZipExecutable))
            return SevenZipExecutable;
        var candidates = new List<string>
        {
            Path.Combine(AppContext.BaseDirectory, "7z", "7z.exe"),
            Path.Combine(AppContext.BaseDirectory, "resources", "7z", "7z.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Microsoft", "WindowsApps", "7z.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "7-Zip", "7z.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "7-Zip", "7z.exe"),
        };
        foreach (var c in candidates)
            if (!string.IsNullOrEmpty(c) && File.Exists(c))
                return c;
        return "7z";
    }

    public static async Task<string> ExtractArchiveAsync(string archivePath, string extractRoot)
    {
        if (IsZipFormat(archivePath))
        {
            ExtractZip(archivePath, extractRoot);
        }
        else
        {
            await RunSevenZipAsync(archivePath, extractRoot);
        }
        var root = LocateGmpRoot(extractRoot);
        return root;
    }

    public static string ExtractArchive(string archivePath, string extractRoot)
        => ExtractArchiveAsync(archivePath, extractRoot).GetAwaiter().GetResult();

    public static void ExtractZip(string archivePath, string extractRoot)
    {
        Directory.CreateDirectory(extractRoot);
        using var archive = ZipFile.OpenRead(archivePath);
        foreach (var entry in archive.Entries)
        {
            var target = PathGuard.SafeZipEntryPath(extractRoot, entry.FullName);
            if (entry.FullName.EndsWith('/') || entry.FullName.EndsWith('\\'))
            {
                Directory.CreateDirectory(target);
                continue;
            }
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            entry.ExtractToFile(target, overwrite: true);
        }
        VerifyInsideRoot(extractRoot);
    }

    private static async Task RunSevenZipAsync(string archivePath, string extractRoot)
    {
        Directory.CreateDirectory(extractRoot);
        var psi = new ProcessStartInfo
        {
            FileName = ResolveSevenZip(),
            Arguments = $"x \"{archivePath}\" -o\"{extractRoot}\" -y",
            WindowStyle = ProcessWindowStyle.Hidden,
            CreateNoWindow = true,
            UseShellExecute = false,
            RedirectStandardOutput = false,
            RedirectStandardError = false
        };
        using var proc = Process.Start(psi)
            ?? throw new InvalidOperationException("Failed to start 7z");
        await proc.WaitForExitAsync();
        if (proc.ExitCode != 0)
            throw new InvalidOperationException($"Extract failed (7z exit {proc.ExitCode}): {archivePath}");
        VerifyInsideRoot(extractRoot);
    }

    private static void VerifyInsideRoot(string root)
    {
        var rootFull = Path.GetFullPath(root);
        foreach (var file in Directory.EnumerateFileSystemEntries(root, "*", SearchOption.AllDirectories))
        {
            if (!PathGuard.IsInside(rootFull, Path.GetFullPath(file)))
            {
                try { Directory.Delete(rootFull, recursive: true); } catch { /* best effort */ }
                throw new InvalidOperationException($"Unsafe archive entry (outside root): {file}");
            }
        }
    }

    private static string LocateGmpRoot(string extractRoot)
    {
        var rootFull = Path.GetFullPath(extractRoot);
        var candidates = new List<string>();
        CollectGmpCandidateDirs(rootFull, candidates);
        if (candidates.Contains(rootFull))
            return rootFull;
        if (candidates.Count == 0)
            return rootFull;
        var sorted = candidates
            .OrderBy(c => c.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Length)
            .ToList();
        var inner = sorted[0];
        if (inner == rootFull)
            return rootFull;
        PivotUp(inner, rootFull);
        return rootFull;
    }

    private static void CollectGmpCandidateDirs(string dir, List<string> outDirs)
    {
        try
        {
            foreach (var name in Directory.GetFileSystemEntries(dir))
            {
                var isDir = Directory.Exists(name);
                var baseName = Path.GetFileName(name);
                if (baseName == Constants.GmpMetadataFolder || baseName == Constants.GmpFallbackMetadataFolder)
                {
                    outDirs.Add(dir);
                    continue;
                }
                if (isDir)
                    CollectGmpCandidateDirs(name, outDirs);
            }
        }
        catch
        {
            // ignore inaccessible entries
        }
    }

    private static void PivotUp(string inner, string extractRoot)
    {
        foreach (var name in Directory.GetFileSystemEntries(inner))
        {
            var baseName = Path.GetFileName(name);
            if (baseName == Constants.GmpMetadataFolder || baseName == Constants.GmpFallbackMetadataFolder)
                continue;
            var dst = Path.Combine(extractRoot, baseName);
            Directory.Move(name, dst);
        }
    }

    public static string CreateTempDir(string gameRoot)
    {
        var tempBase = Path.Combine(gameRoot, Constants.GmpMetadataFolder, Constants.TempFolder);
        var dir = Path.Combine(tempBase, $"{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{Guid.NewGuid():N}");
        Directory.CreateDirectory(dir);
        return dir;
    }

    public static void RemoveDirIfInside(string root, string target)
    {
        if (!PathGuard.IsInside(Path.GetFullPath(root), Path.GetFullPath(target)))
            throw new InvalidOperationException($"refusing to remove path outside root: {target}");
        if (Directory.Exists(target))
            Directory.Delete(target, recursive: true);
    }
}
