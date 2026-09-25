using RBBPMM.Core;

namespace RBBPMM.Core.Tests;

public class GameEnvironmentServiceTests
{
    private const string Identity = "Baldi's Basics in Education and Learningbasicallygames";

    /// <summary>Builds a globalgamemanagers whose version blob sits at the expected offset.</summary>
    private static void WriteManagers(string dataFolder, string version, bool withIdentity = true)
    {
        var buf = new byte[GameEnvironmentService.VersionOffset + GameEnvironmentService.VersionLength];
        for (var i = 0; i < buf.Length; i++)
            buf[i] = 0x00;

        var blob = (withIdentity ? Identity : "SomethingElse")
                   + "category.games@" + version + "ff@$";
        var bytes = System.Text.Encoding.ASCII.GetBytes(blob);
        Array.Copy(bytes, 0, buf, GameEnvironmentService.VersionOffset, bytes.Length);

        Directory.CreateDirectory(dataFolder);
        File.WriteAllBytes(Path.Combine(dataFolder, Constants.GameVersionFile), buf);
    }

    [Fact]
    public void TryReadGameVersion_ReadsBlobAtFixedOffset()
    {
        var root = TestHelpers.Tmp("gem");
        WriteManagers(root, "0.14");

        Assert.Equal("0.14", GameEnvironmentService.TryReadGameVersion(root));
    }

    [Fact]
    public void TryReadGameVersion_ReturnsNullWithoutIdentityString()
    {
        var root = TestHelpers.Tmp("gem");
        WriteManagers(root, "0.14", withIdentity: false);

        Assert.Null(GameEnvironmentService.TryReadGameVersion(root));
    }

    [Fact]
    public void TryReadGameVersion_ReturnsNullWhenFileMissing()
    {
        var root = TestHelpers.Tmp("gem");

        Assert.Null(GameEnvironmentService.TryReadGameVersion(root));
    }

    [Fact]
    public void TryReadGameVersion_ReturnsNullWhenTooShort()
    {
        var root = TestHelpers.Tmp("gem");
        Directory.CreateDirectory(root);
        File.WriteAllBytes(Path.Combine(root, Constants.GameVersionFile), new byte[16]);

        Assert.Null(GameEnvironmentService.TryReadGameVersion(root));
    }

    [Fact]
    public void ResolveEnvironment_AcceptsValidInstall()
    {
        var root = TestHelpers.Tmp("gem");
        TestHelpers.WriteFile(Path.Combine(root, Constants.GameExeName), "exe");
        WriteManagers(Path.Combine(root, Constants.GameDataFolder), "0.13.1");

        var env = GameEnvironmentService.ResolveEnvironment(Path.Combine(root, Constants.GameExeName));

        Assert.NotNull(env);
        Assert.Equal(root, env!.RootPath);
        Assert.Equal("0.13.1", env.GameVersion);
    }

    [Fact]
    public void ResolveEnvironment_RejectsWrongExeName()
    {
        var root = TestHelpers.Tmp("gem");
        TestHelpers.WriteFile(Path.Combine(root, "other.exe"), "exe");
        WriteManagers(Path.Combine(root, Constants.GameDataFolder), "0.13.1");

        Assert.Null(GameEnvironmentService.ResolveEnvironment(Path.Combine(root, "other.exe")));
    }

    [Fact]
    public void ResolveEnvironment_RejectsMissingDataFolder()
    {
        var root = TestHelpers.Tmp("gem");
        TestHelpers.WriteFile(Path.Combine(root, Constants.GameExeName), "exe");

        Assert.Null(GameEnvironmentService.ResolveEnvironment(Path.Combine(root, Constants.GameExeName)));
    }

    [Fact]
    public void ResolveEnvironment_IsCaseInsensitiveAboutExeName()
    {
        var root = TestHelpers.Tmp("gem");
        TestHelpers.WriteFile(Path.Combine(root, "baldi.EXE"), "exe");
        WriteManagers(Path.Combine(root, Constants.GameDataFolder), "0.12");

        Assert.NotNull(GameEnvironmentService.ResolveEnvironment(Path.Combine(root, "baldi.EXE")));
    }
}
