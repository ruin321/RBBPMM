using System.IO;

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
}
