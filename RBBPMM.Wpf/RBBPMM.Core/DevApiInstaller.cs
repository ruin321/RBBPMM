namespace RBBPMM.Core;

/// <summary>
/// Downloads and installs the "BB+ Dev API" GameBanana submission matching the installed game
/// version — the prerequisite most mods need.
/// Ported from src/main/services/DevApiSetup.ts.
/// </summary>
public sealed class DevApiInstaller(GamebananaService banana)
{
    private readonly GamebananaService _banana = banana;

    public async Task<Result<bool>> InstallDevApiAsync(
        string gameRoot,
        string? gameVersion,
        Action<InstallProgress>? onProgress = null,
        Func<bool>? isCancelled = null,
        CancellationToken ct = default)
    {
        string? downloadDir = null;
        string? exTemp = null;

        try
        {
            onProgress?.Invoke(new InstallProgress("fetching", 0, "Fetching the BB+ Dev API..."));

            var submission = await _banana.GetSubmission(CompatibilityTable.DevApiModId, ct);
            var allFiles = submission.Files.Concat(submission.ArchivedFiles).ToList();
            var targetVersion = CompatibilityTable.ResolveDevApiVersion(gameVersion);
            var file = CompatibilityTable.SelectDevApiFile(allFiles, gameVersion, targetVersion);

            if (file == null || string.IsNullOrEmpty(file.DownloadUrl))
                return Result<bool>.Fail("The BB+ Dev API has no downloadable files.");

            downloadDir = Path.Combine(Path.GetTempPath(), "rbbpmm-devapi-" + Guid.NewGuid().ToString("N")[..8]);
            var archivePath = await _banana.DownloadFileAsync(
                file.DownloadUrl,
                downloadDir,
                file.FileName,
                new Progress<(long Received, long? Total)>(p =>
                {
                    int? percent = p.Total is > 0 ? (int)Math.Min(99, p.Received * 100 / p.Total.Value) : null;
                    var sizeText = p.Total is > 0
                        ? $" ({p.Received / 1024 / 1024}/{p.Total.Value / 1024 / 1024} MB)"
                        : "";
                    onProgress?.Invoke(new InstallProgress("downloading", percent, $"Downloading {file.FileName}{sizeText}"));
                }),
                isCancelled);

            onProgress?.Invoke(new InstallProgress("installing", null, "Installing the BB+ Dev API..."));
            exTemp = ModArchiveExtractor.CreateTempDir(gameRoot);
            var extractRoot = await ModArchiveExtractor.ExtractArchiveAsync(archivePath, exTemp);

            if (ManifestLoader.HasManifest(extractRoot))
                ModInstaller.InstallModArchive(gameRoot, archivePath, gameVersion, isCancelled, extractRoot);
            else
                ModInstaller.InstallUnmanaged(extractRoot, gameRoot, isCancelled, onProgress);

            ModRepositoryScanner.InvalidateModScan(gameRoot);
            onProgress?.Invoke(new InstallProgress("done", 100, "BB+ Dev API installed."));
            return Result<bool>.Success(true);
        }
        catch (Exception ex)
        {
            return Result<bool>.Fail($"Failed to install the BB+ Dev API: {ex.Message}");
        }
        finally
        {
            if (exTemp != null)
                ModArchiveExtractor.RemoveDirIfInside(gameRoot, exTemp);
            try
            {
                if (downloadDir != null && Directory.Exists(downloadDir))
                    Directory.Delete(downloadDir, recursive: true);
            }
            catch
            {
                // best effort
            }
        }
    }
}
