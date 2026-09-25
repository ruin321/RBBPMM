using System.IO.Compression;

namespace RBBPMM.Core.Tests;

public static class TestHelpers
{
    public static string Tmp(string tag)
    {
        var dir = Path.Combine(Path.GetTempPath(), $"rbbpmm_test_{tag}_{Guid.NewGuid():N}");
        Directory.CreateDirectory(dir);
        return dir;
    }

    public static void WriteFile(string path, string content = "x")
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
    }

    public static void Tree(string root, Dictionary<string, string[]> layout)
    {
        foreach (var (dir, files) in layout)
        {
            var full = Path.Combine(root, dir);
            Directory.CreateDirectory(full);
            foreach (var f in files)
                WriteFile(Path.Combine(full, f));
        }
    }

    public static string MakeZip(string path, Dictionary<string, string> entries)
    {
        using var zip = ZipFile.Open(path, ZipArchiveMode.Create);
        foreach (var (name, content) in entries)
        {
            var entry = zip.CreateEntry(name);
            using var w = new StreamWriter(entry.Open());
            w.Write(content);
        }
        return path;
    }
}
