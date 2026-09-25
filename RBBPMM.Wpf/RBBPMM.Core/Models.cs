namespace RBBPMM.Core;

/// <summary>GameBanana / Baldi community category ids (mirrors shared/types.ts).</summary>
public static class CategoryIds
{
    public const int BaldiCommunity = 4609;
    public const int TexturePack = 28929;
    public const int LevelStudio = 28926;
}

/// <summary>Discriminated-result wrapper used by all Core operations.</summary>
public sealed record Result<T>
{
    public bool Ok { get; init; }
    public T? Value { get; init; }
    public string? Error { get; init; }

    public static Result<T> Success(T value) => new() { Ok = true, Value = value };
    public static Result<T> Fail(string error) => new() { Ok = false, Error = error };
}

public sealed record GameEnvironment(
    string RootPath,
    string DataFolder,
    string ExecutablePath,
    string GameVersion);

public sealed record InstallProgress(string Stage, int? Percent = null, string? Message = null);

public sealed record SecurityWarning(string Field, string Reason);

public sealed class ModAsset
{
    public string LocalPath { get; set; } = "";
    public string? Destination { get; set; }
}

public sealed class ModManifest
{
    public string Guid { get; set; } = "";
    public string Name { get; set; } = "";
    public string Author { get; set; } = "";
    public string Version { get; set; } = "";
    public string? Description { get; set; }
    public List<ModAsset> Assets { get; set; } = [];
    public List<string> Plugins { get; set; } = [];
    public List<string> Patchers { get; set; } = [];
}

public sealed class GamebananaSource
{
    public int SubmissionId { get; set; }
    public int FileId { get; set; }
    public string FileName { get; set; } = "";
    public string? Version { get; set; }
    public string? SubmissionName { get; set; }
    public string DateLinked { get; set; } = "";
}

public sealed class ModMetadata
{
    public bool Activated { get; set; } = true;
    public List<string> SupportedPlusVersions { get; set; } = [];
    public string? LastUpdateDate { get; set; }
    public string? InstallationUrl { get; set; }
    public string? Thumbnail { get; set; }
    public string? Path { get; set; }
    public GamebananaSource? GamebananaSource { get; set; }
    public string? LastInstalledArchiveName { get; set; }
}

public sealed record ModItem(
    string Guid,
    string Name,
    string Author,
    string Version,
    string DirectoryName,
    string InstallDir,
    bool Activated,
    bool SupportsCurrentVersion,
    List<string> PluginFiles,
    List<string> AssetPaths,
    bool Loose)
{
    public string? Description { get; init; }
    public string? IdentifyName { get; init; }
    public long? InstalledAt { get; init; }
    public string? ModdedFolder { get; init; }
    public string? DllFile { get; init; }
    public string? DllDirectory { get; init; }
    public string? ConfigFile { get; init; }
    public GamebananaSource? GamebananaSource { get; init; }
    public string? Group { get; init; }
}

public sealed record ReadmeFile(string Name, string Content);

public sealed class TexturePack
{
    public string FolderName { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Author { get; set; }
    public string? Version { get; set; }
    public string? Description { get; set; }
    public bool Protected { get; set; }
}

public sealed record TexturePackInstallResult(
    List<TexturePack> Installed,
    string InstallDir,
    List<ReadmeFile> Readmes);

public sealed record GamebananaFile(
    int Id,
    string FileName,
    long FileSize,
    string DownloadUrl,
    string? Description = null,
    string? Version = null,
    long? DateAdded = null);

public sealed record GamebananaComment(
    int Id,
    string Author,
    string Body,
    string? Date = null,
    int? ReplyCount = null);

public sealed record GamebananaComments(long Total, List<GamebananaComment> Items);

public sealed record GamebananaUpdateChange(string Text, string? Category = null);

public sealed record GamebananaUpdate(
    int Id,
    string Title,
    string? Url = null,
    long? DateAdded = null,
    string? Version = null,
    string? Body = null,
    string? AuthorName = null,
    List<GamebananaUpdateChange> ChangeLog = default!,
    List<string> FileNames = default!)
{
    public GamebananaUpdate() : this(0, "")
    {
        ChangeLog = [];
        FileNames = [];
    }
}

public sealed record GamebananaUpdates(long Total, List<GamebananaUpdate> Items);

public sealed record GamebananaRequirement(
    string Name,
    string? Url = null,
    string? Status = null,
    bool Required = false,
    int? GamebananaId = null);

public sealed record GamebananaAlternateSource(string Url, string? Description = null, string? Host = null);

public sealed class GamebananaSubmission
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? Version { get; set; }
    public string? AuthorName { get; set; }
    public bool HasFiles { get; set; }
    public int? CategoryId { get; set; }
    public string? ThumbnailUrl { get; set; }
    public List<string> Images { get; set; } = [];
    public long? DownloadCount { get; set; }
    public long? ViewCount { get; set; }
    public long? DateAdded { get; set; }
    public long? DateUpdated { get; set; }
    public List<GamebananaFile> Files { get; set; } = [];
    public List<GamebananaFile> ArchivedFiles { get; set; } = [];
    public List<GamebananaRequirement> Requirements { get; set; } = [];
    public List<GamebananaAlternateSource> AlternateFileSources { get; set; } = [];
}

public sealed record GamebananaSearchResult(
    long RecordCount,
    bool IsComplete,
    int PerPage,
    List<GamebananaSubmission> Items);
