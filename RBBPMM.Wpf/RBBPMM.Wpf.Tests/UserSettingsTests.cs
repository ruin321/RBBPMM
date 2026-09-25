using System.IO;
using RBBPMM.Services;

namespace RBBPMM.Wpf.Tests;

public class UserSettingsTests
{
    private static string TempPath()
        => Path.Combine(Path.GetTempPath(), $"rbbpmm_settings_{Guid.NewGuid():N}.json");

    [Fact]
    public void Save_ThenLoad_RoundTripsValues()
    {
        var path = TempPath();
        try
        {
            var original = new UserSettings(path) { Theme = "Dark", Language = "zh-CN" };
            original.Save();

            var loaded = UserSettings.Load(path);

            Assert.Equal("Dark", loaded.Theme);
            Assert.Equal("zh-CN", loaded.Language);
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
        }
    }

    [Fact]
    public void Load_WhenFileMissing_ReturnsDefaults()
    {
        var path = Path.Combine(Path.GetTempPath(), $"rbbpmm_missing_{Guid.NewGuid():N}.json");

        var loaded = UserSettings.Load(path);

        Assert.Equal("Light", loaded.Theme);
        Assert.Equal("en", loaded.Language);
    }

    [Fact]
    public void Load_WhenFileCorrupt_ReturnsDefaultsWithoutThrowing()
    {
        var path = TempPath();
        try
        {
            File.WriteAllText(path, "{ this is not valid json");

            var loaded = UserSettings.Load(path);

            Assert.Equal("Light", loaded.Theme);
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
        }
    }
}
