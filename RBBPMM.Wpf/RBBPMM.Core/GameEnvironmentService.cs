using System.Text;
using System.Text.RegularExpressions;

namespace RBBPMM.Core;

/// <summary>
/// Detects a Baldi's Basics Plus install and reads its game version out of
/// <c>BALDI_Data/globalgamemanagers</c>.
/// Ported from src/main/services/GameEnvironment.ts.
/// </summary>
public static class GameEnvironmentService
{
    /// <summary>Offset of the version blob inside globalgamemanagers (Unity serialized header).</summary>
    public const int VersionOffset = 4500;
    public const int VersionLength = 500;

    private const string IdentityString = "Baldi's Basics in Education and Learningbasicallygames";
    private const string VersionStart = "category.games@";
    private const string VersionEnd = "ff@$";

    private static readonly Regex NonPrintable = new(@"[^\x20-\x7E\r\n]", RegexOptions.Compiled);

    /// <summary>
    /// Reads the version string from <paramref name="dataFolder"/>. Returns <c>null</c> when the
    /// file is missing or does not carry the expected identity/version markers.
    /// </summary>
    public static string? TryReadGameVersion(string dataFolder)
    {
        var filePath = Path.Combine(dataFolder, Constants.GameVersionFile);
        if (!File.Exists(filePath))
            return null;

        try
        {
            using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            if (fs.Length <= VersionOffset)
                return null;
            fs.Seek(VersionOffset, SeekOrigin.Begin);
            var buf = new byte[VersionLength];
            var read = fs.Read(buf, 0, VersionLength);
            if (read <= 0)
                return null;

            // latin1 keeps bytes 1:1 so the ASCII filter below mirrors Buffer#toString('ascii').
            var raw = Encoding.Latin1.GetString(buf, 0, read);
            var text = NonPrintable.Replace(raw, "");
            if (!text.Contains(IdentityString, StringComparison.Ordinal))
                return null;

            var start = text.IndexOf(VersionStart, StringComparison.Ordinal);
            if (start < 0)
                return null;
            var end = text.IndexOf(VersionEnd, start + VersionStart.Length, StringComparison.Ordinal);
            if (end < 0)
                return null;

            var version = text[(start + VersionStart.Length)..end];
            return version.Length > 0 ? version : null;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Resolves the exe path into a full <see cref="GameEnvironment"/>; <c>null</c> when the exe
    /// name, path, data folder, or version check fails.
    /// </summary>
    public static GameEnvironment? ResolveEnvironment(string exePath)
    {
        if (string.IsNullOrWhiteSpace(exePath))
            return null;

        string executablePath;
        try
        {
            executablePath = Path.GetFullPath(exePath);
        }
        catch
        {
            return null;
        }

        if (!Constants.IsGameExeName(Path.GetFileName(executablePath)))
            return null;
        if (!File.Exists(executablePath))
            return null;

        var rootPath = Path.GetDirectoryName(executablePath);
        if (string.IsNullOrEmpty(rootPath))
            return null;

        var dataFolder = Path.Combine(rootPath, Constants.GameDataFolder);
        if (!Directory.Exists(dataFolder))
            return null;

        var gameVersion = TryReadGameVersion(dataFolder);
        if (gameVersion == null)
            return null;

        return new GameEnvironment(rootPath, dataFolder, executablePath, gameVersion);
    }
}
