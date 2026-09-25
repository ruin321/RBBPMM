using System.IO;
using RBBPMM.Core;

namespace RBBPMM.Wpf.Tests;

/// <summary>
/// 测试用的临时目录助手（WPF 测试工程自己的小工具，与 Core 测试的 TestHelpers 分开）。
/// </summary>
internal static class TestFs
{
    public static string TempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "rbbpmm-wpftests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    /// <summary>
    /// 从测试程序集所在目录向上找含 RBBPMM.slnx 的仓库根，便于读取真实资源/源文件。
    /// </summary>
    public static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "RBBPMM.slnx")))
            dir = dir.Parent;

        if (dir is null)
            throw new InvalidOperationException("未找到 RBBPMM.slnx，无法定位仓库根目录");
        return dir.FullName;
    }

    public static string ResourcesDir() => Path.Combine(RepoRoot(), "RBBPMM", "Resources");

    public static string AppProjectDir() => Path.Combine(RepoRoot(), "RBBPMM");

    /// <summary>把 <paramref name="entries"/>（相对路径 → 内容）打成一个 zip。</summary>
    public static string MakeZip(Dictionary<string, string> entries)
    {
        var path = Path.Combine(TempDir(), "archive.zip");
        using var fs = File.Create(path);
        using var zip = new System.IO.Compression.ZipArchive(fs, System.IO.Compression.ZipArchiveMode.Create);
        foreach (var (name, content) in entries)
        {
            var entry = zip.CreateEntry(name);
            using var writer = new StreamWriter(entry.Open());
            writer.Write(content);
        }
        return path;
    }

    /// <summary>
    /// 造一个「看起来像真的」Baldi's Basics Plus 安装：exe + BALDI_Data/globalgamemanagers，
    /// 并在 GameEnvironmentService 认的偏移处塞进身份串与版本号。
    /// </summary>
    public static string MakeGameInstall(string version = "0.9.1")
    {
        var root = TempDir();
        File.WriteAllBytes(Path.Combine(root, "BALDI.exe"), [0x4D, 0x5A]);

        var data = Path.Combine(root, "BALDI_Data");
        Directory.CreateDirectory(data);

        var blob = new byte[GameEnvironmentService.VersionOffset + GameEnvironmentService.VersionLength + 64];
        var payload = System.Text.Encoding.ASCII.GetBytes(
            "Baldi's Basics in Education and Learningbasicallygames" +
            "category.games@" + version + "ff@$");
        Array.Copy(payload, 0, blob, GameEnvironmentService.VersionOffset, payload.Length);

        File.WriteAllBytes(Path.Combine(data, Constants.GameVersionFile), blob);
        return root;
    }
}
