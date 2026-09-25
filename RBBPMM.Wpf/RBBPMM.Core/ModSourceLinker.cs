using System.Text.Json;

namespace RBBPMM.Core;

/// <summary>
/// Ties a locally installed mod to its GameBanana submission: links a source, checks for a newer
/// file, and performs an in-place update with a <c>.old</c> safety net.
/// Ported from src/main/services/ModSourceLinker.ts.
/// </summary>
public sealed class ModSourceLinker(GamebananaService banana)
{
    private readonly GamebananaService _banana = banana;

    public static string NormalizeName(string n) =>
        System.Text.RegularExpressions.Regex
            .Replace(
                System.Text.RegularExpressions.Regex.Replace((n ?? "").ToLowerInvariant(), @"\.[a-z0-9]+$", ""),
                @"[\s_\-()\[\]{}.,+]+", "")
            .Trim();

    private static string? MetadataFolderFor(string modRoot)
    {
        foreach (var f in new[] { Constants.GmpMetadataFolder, Constants.GmpFallbackMetadataFolder })
        {
            var p = Path.Combine(modRoot, f);
            if (Directory.Exists(p))
                return p;
        }
        return null;
    }

    public static string? FindMetadataFile(string modRoot)
    {
        var folder = MetadataFolderFor(modRoot);
        if (folder == null)
            return null;
        var p = Path.Combine(folder, Constants.MetadataFile);
        return File.Exists(p) ? p : null;
    }

    private static bool CanPersist(ModItem mod)
    {
        if (mod.Loose)
            return false;
        if (MetadataFolderFor(mod.InstallDir) != null)
            return true;
        try
        {
            Directory.CreateDirectory(Path.Combine(mod.InstallDir, Constants.GmpMetadataFolder));
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static void PersistSource(ModItem mod, GamebananaSource source)
    {
        if (!CanPersist(mod))
            return;
        var meta = ManifestLoader.LoadMetadata(mod.InstallDir);
        meta.GamebananaSource = source;
        meta.InstallationUrl = $"https://gamebanana.com/mods/{source.SubmissionId}";
        ManifestLoader.SaveMetadata(mod.InstallDir, meta);
    }

    public static void PersistArchiveName(string modRoot, string archiveName)
    {
        if (MetadataFolderFor(modRoot) == null)
            return;
        var meta = ManifestLoader.LoadMetadata(modRoot);
        meta.LastInstalledArchiveName = archiveName;
        ManifestLoader.SaveMetadata(modRoot, meta);
    }

    public static GamebananaSource? ReadSource(string modRoot) =>
        ManifestLoader.LoadMetadata(modRoot).GamebananaSource;

    public static ModMetadata GetModMetadata(string modRoot) => ManifestLoader.LoadMetadata(modRoot);

    private static List<string> ExpectedNamesFor(ModItem mod)
    {
        var names = new List<string>();
        var meta = ManifestLoader.LoadMetadata(mod.InstallDir);
        if (!string.IsNullOrEmpty(meta.LastInstalledArchiveName))
            names.Add(meta.LastInstalledArchiveName!);
        names.Add(mod.Name);
        if (!string.IsNullOrEmpty(mod.DirectoryName))
            names.Add(mod.DirectoryName);
        return names;
    }

    public async Task<List<GamebananaSubmission>> SearchCandidatesAsync(string name, CancellationToken ct = default)
    {
        var res = await _banana.SearchMods(1, name, CategoryIds.BaldiCommunity, ct);
        return res.Items.Where(i => i.HasFiles).ToList();
    }

    /// <summary>Prefers a file whose name matches a known archive name, else the newest file.</summary>
    public static GamebananaFile? MatchFile(GamebananaSubmission submission, IReadOnlyList<string> expectedNames)
    {
        var all = submission.Files.Concat(submission.ArchivedFiles).ToList();
        if (all.Count == 0)
            return null;

        var expected = expectedNames.Select(NormalizeName).Where(n => n.Length > 0).ToList();

        GamebananaFile? exact = null;
        foreach (var f in all)
        {
            if (string.IsNullOrEmpty(f.FileName))
                continue;
            if (!expected.Contains(NormalizeName(f.FileName)))
                continue;
            if (exact == null || (f.DateAdded ?? 0) > (exact.DateAdded ?? 0))
                exact = f;
        }

        return exact ?? all.OrderByDescending(f => f.DateAdded ?? 0).First();
    }

    public sealed record LinkResult(bool Linked, GamebananaSubmission? Submission = null, GamebananaFile? File = null);

    /// <summary>Fuzzy-matches a local mod against GameBanana search results and persists the link.</summary>
    public async Task<LinkResult> LinkByLocalModAsync(ModItem mod, CancellationToken ct = default)
    {
        var candidates = await SearchCandidatesAsync(string.IsNullOrEmpty(mod.Name) ? mod.Name : mod.Name, ct);
        foreach (var sub in candidates)
        {
            var file = MatchFile(sub, ExpectedNamesFor(mod));
            if (file == null)
                continue;

            PersistSource(mod, new GamebananaSource
            {
                SubmissionId = sub.Id,
                FileId = file.Id,
                FileName = file.FileName,
                Version = file.Version,
                SubmissionName = sub.Name,
                DateLinked = DateTime.UtcNow.ToString("o")
            });
            return new LinkResult(true, sub, file);
        }

        return new LinkResult(false);
    }

    public Task LinkKnownSubmissionAsync(ModItem mod, GamebananaSubmission submission, GamebananaFile file)
    {
        PersistSource(mod, new GamebananaSource
        {
            SubmissionId = submission.Id,
            FileId = file.Id,
            FileName = file.FileName,
            Version = file.Version,
            SubmissionName = submission.Name,
            DateLinked = DateTime.UtcNow.ToString("o")
        });
        return Task.CompletedTask;
    }

    public async Task<ModUpdateInfo> CheckForUpdateAsync(ModItem mod, CancellationToken ct = default)
    {
        var source = ReadSource(mod.InstallDir);
        if (source == null)
            return new ModUpdateInfo(false, 0, 0, "", "");

        var sub = await _banana.GetSubmission(source.SubmissionId, ct);
        var all = sub.Files.Concat(sub.ArchivedFiles).ToList();
        var current = all.FirstOrDefault(f => f.Id == source.FileId) ?? all.FirstOrDefault();

        if (current == null)
            return new ModUpdateInfo(false, sub.Id, source.FileId, source.FileName, "");

        var hasUpdate = current.Id != source.FileId || (current.Version ?? "") != (source.Version ?? "");
        return new ModUpdateInfo(hasUpdate, sub.Id, current.Id, current.FileName, current.DownloadUrl)
        {
            Version = current.Version,
            PublishedDate = current.DateAdded
        };
    }

    /// <summary>
    /// Downloads the linked file over the installed mod. The old folder is parked at
    /// <c>&lt;installDir&gt;.old</c> and restored if the install throws.
    /// </summary>
    public async Task<Result<bool>> UpdateModAsync(
        string gameRoot,
        ModItem mod,
        Action<InstallProgress>? onProgress = null,
        Func<bool>? isCancelled = null,
        CancellationToken ct = default)
    {
        var source = ReadSource(mod.InstallDir);
        if (source == null)
            return Result<bool>.Fail("No linked source");

        var sub = await _banana.GetSubmission(source.SubmissionId, ct);
        var all = sub.Files.Concat(sub.ArchivedFiles).ToList();
        var file = all.FirstOrDefault(f => f.Id == source.FileId) ?? all.FirstOrDefault();
        if (file == null || string.IsNullOrEmpty(file.DownloadUrl))
            return Result<bool>.Fail("No downloadable file");

        onProgress?.Invoke(new InstallProgress("downloading", 0, $"Downloading {file.FileName}"));

        var downloadDir = Path.Combine(Path.GetTempPath(), "rbbpmm-update-" + Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(downloadDir);

        var archivePath = await _banana.DownloadFileAsync(
            file.DownloadUrl,
            downloadDir,
            file.FileName,
            new Progress<(long Received, long? Total)>(p =>
            {
                int? percent = p.Total is > 0 ? (int)Math.Min(99, p.Received * 100 / p.Total.Value) : null;
                onProgress?.Invoke(new InstallProgress("downloading", percent, $"Downloading {file.FileName}"));
            }),
            isCancelled);

        string? exTemp = null;
        var dotOld = mod.InstallDir + ".old";

        try
        {
            exTemp = ModArchiveExtractor.CreateTempDir(gameRoot);
            onProgress?.Invoke(new InstallProgress("extracting", null, "Extracting archive"));
            var extractRoot = await ModArchiveExtractor.ExtractArchiveAsync(archivePath, exTemp);

            if (Directory.Exists(dotOld))
                Directory.Delete(dotOld, recursive: true);
            Directory.Move(mod.InstallDir, dotOld);

            try
            {
                var result = ModInstaller.InstallModArchive(gameRoot, archivePath, null, isCancelled, extractRoot);
                Directory.Delete(dotOld, recursive: true);

                var newManifest = ManifestLoader.LoadModManifest(result.InstallDir);
                PersistSource(
                    new ModItem { InstallDir = result.InstallDir, Name = mod.Name, DirectoryName = mod.DirectoryName, Loose = false },
                    new GamebananaSource
                    {
                        SubmissionId = source.SubmissionId,
                        FileId = file.Id,
                        FileName = file.FileName,
                        Version = file.Version,
                        SubmissionName = source.SubmissionName,
                        DateLinked = DateTime.UtcNow.ToString("o")
                    });

                _ = newManifest;
                onProgress?.Invoke(new InstallProgress("done", 100, "Update installed"));
                return Result<bool>.Success(true);
            }
            catch (Exception ex)
            {
                if (Directory.Exists(dotOld) && !Directory.Exists(mod.InstallDir))
                    Directory.Move(dotOld, mod.InstallDir);
                return Result<bool>.Fail(ex.Message);
            }
        }
        catch (Exception ex)
        {
            return Result<bool>.Fail(ex.Message);
        }
        finally
        {
            if (exTemp != null)
                ModArchiveExtractor.RemoveDirIfInside(gameRoot, exTemp);
            try
            {
                if (Directory.Exists(downloadDir))
                    Directory.Delete(downloadDir, recursive: true);
            }
            catch
            {
                // best effort
            }
        }
    }
}
