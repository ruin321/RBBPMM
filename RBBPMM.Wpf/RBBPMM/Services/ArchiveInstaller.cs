using Microsoft.Extensions.Logging;
using RBBPMM.Core;

namespace RBBPMM.Services;

/// <summary>What a dropped/selected archive turned out to be.</summary>
public enum ArchiveKind
{
    Mod,
    TexturePack,
    LevelStudio,
    Unknown
}

public sealed record ArchiveInstallOutcome(ArchiveKind Kind, string Detail);

/// <summary>
/// Single entry point for "install this archive": extracts once, works out whether it is a mod, a
/// texture pack or a Level Studio playable, and dispatches to the matching Core service.
/// </summary>
public sealed class ArchiveInstaller(GameFolderService game, GamebananaService banana, ILogger<ArchiveInstaller>? log = null)
{
    private readonly GameFolderService _game = game;
    private readonly GamebananaService _banana = banana;
    private readonly ILogger<ArchiveInstaller>? _log = log;

    /// <summary>Downloads a GameBanana file (into a temp dir) and installs it.</summary>
    public async Task<Result<ArchiveInstallOutcome>> InstallFromUrlAsync(
        string downloadUrl,
        string? fileName = null,
        Action<InstallProgress>? progress = null,
        Func<bool>? isCancelled = null,
        CancellationToken ct = default)
    {
        var dir = Path.Combine(Path.GetTempPath(), "rbbpmm-dl-" + Guid.NewGuid().ToString("N")[..8]);
        try
        {
            progress?.Invoke(new InstallProgress("downloading", 0, fileName ?? downloadUrl));
            var path = await _banana.DownloadFileAsync(
                downloadUrl,
                dir,
                fileName,
                new Progress<(long Received, long? Total)>(p =>
                {
                    int? percent = p.Total is > 0 ? (int)Math.Min(99, p.Received * 100 / p.Total.Value) : null;
                    progress?.Invoke(new InstallProgress("downloading", percent, fileName ?? downloadUrl));
                }),
                isCancelled);

            return await InstallAsync(path, progress, isCancelled, ct);
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "下载/安装失败: {Url}", downloadUrl);
            return Result<ArchiveInstallOutcome>.Fail(ex.Message);
        }
        finally
        {
            try
            {
                if (Directory.Exists(dir))
                    Directory.Delete(dir, recursive: true);
            }
            catch
            {
                // best effort
            }
        }
    }

    public async Task<Result<ArchiveInstallOutcome>> InstallAsync(
        string archivePath,
        Action<InstallProgress>? progress = null,
        Func<bool>? isCancelled = null,
        CancellationToken ct = default)
    {
        if (_game.GameRoot is not { } gameRoot)
            return Result<ArchiveInstallOutcome>.Fail("Game folder is not set");
        if (!File.Exists(archivePath))
            return Result<ArchiveInstallOutcome>.Fail($"Archive not found: {archivePath}");

        var tempRoot = ModArchiveExtractor.CreateTempDir(gameRoot);
        try
        {
            await Task.Run(() => ModArchiveExtractor.ExtractArchive(archivePath, tempRoot), ct);
            var extractRoot = ModArchiveExtractor.LocateGmpRoot(tempRoot);

            // 1) A packaged GMP mod always wins — it ships an explicit manifest.
            if (ManifestLoader.HasManifest(extractRoot))
            {
                progress?.Invoke(new InstallProgress("installing", null, "Installing mod"));
                var result = ModInstaller.InstallModArchive(gameRoot, archivePath, _game.GameVersion, isCancelled, extractRoot);
                ModRepositoryScanner.InvalidateModScan(gameRoot);
                progress?.Invoke(new InstallProgress("done", 100, result.Manifest.Name));
                return Result<ArchiveInstallOutcome>.Success(
                    new ArchiveInstallOutcome(ArchiveKind.Mod, result.Manifest.Name));
            }

            // 2) Texture packs announce themselves with pack.json directories.
            if (!TexturePackService.HasModStructureInRoot(extractRoot) &&
                TexturePackService.FindPackDirs(extractRoot).Count > 0)
            {
                progress?.Invoke(new InstallProgress("installing", null, "Installing texture pack"));
                var fallbackName = Path.GetFileNameWithoutExtension(archivePath);
                var result = await TexturePackService.InstallTexturePacksFromRoot(gameRoot, extractRoot, fallbackName);
                progress?.Invoke(new InstallProgress("done", 100, fallbackName));
                return Result<ArchiveInstallOutcome>.Success(
                    new ArchiveInstallOutcome(ArchiveKind.TexturePack, $"{result.Installed.Count} pack(s)"));
            }

            // 3) Level Studio playables are .pbpl files (or a folder containing them).
            var pbpl = new List<string>();
            LevelStudioInstaller.FindPbplFiles(extractRoot, pbpl);
            if (pbpl.Count > 0)
            {
                progress?.Invoke(new InstallProgress("installing", null, "Installing custom levels"));
                var result = await LevelStudioInstaller.InstallLevelStudioPlayableAsync(extractRoot);
                progress?.Invoke(new InstallProgress("done", 100, $"{result.Playables.Count} level(s)"));
                return Result<ArchiveInstallOutcome>.Success(
                    new ArchiveInstallOutcome(ArchiveKind.LevelStudio, $"{result.Playables.Count} level(s)"));
            }

            // 4) Fall back to the heuristic (BBMM-style) mod install.
            progress?.Invoke(new InstallProgress("installing", null, "Installing"));
            var modName = ModInstaller.InstallUnmanaged(extractRoot, gameRoot, isCancelled, progress);
            ModRepositoryScanner.InvalidateModScan(gameRoot);
            progress?.Invoke(new InstallProgress("done", 100, modName));
            return Result<ArchiveInstallOutcome>.Success(new ArchiveInstallOutcome(ArchiveKind.Mod, modName));
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "安装压缩包失败: {Path}", archivePath);
            return Result<ArchiveInstallOutcome>.Fail(ex.Message);
        }
        finally
        {
            if (Directory.Exists(tempRoot))
                ModArchiveExtractor.RemoveDirIfInside(gameRoot, tempRoot);
        }
    }
}
