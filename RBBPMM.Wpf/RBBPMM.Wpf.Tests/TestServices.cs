using System.IO;
using System.Net.Http;
using RBBPMM.Core;
using RBBPMM.Services;
using RBBPMM.ViewModels;

namespace RBBPMM.Wpf.Tests;

/// <summary>
/// 页面 ViewModel 的测试工厂。Phase 5 之后这些 VM 都需要真实依赖（仓储 / 游戏目录 / 文件选择器），
/// 逐个 new 会让测试变得又长又脆，所以集中在这里。
///
/// 一律构造「未选游戏目录」的 <see cref="GameFolderService"/>：单测不碰真实磁盘，
/// 同时顺带覆盖了「未选目录时页面不崩」这条路径。
/// </summary>
internal static class TestServices
{
    public static UserSettings Settings()
        => new(Path.Combine(TestFs.TempDir(), "settings.json"));

    public static GameFolderService Game(UserSettings? settings = null)
        => new(settings ?? Settings());

    /// <summary>永不弹窗的选择器：一律返回 null（= 用户取消）。</summary>
    public static IFilePicker Picker() => new NullPicker();

    public static GamebananaService Banana()
        => new(new HttpClient { Timeout = TimeSpan.FromSeconds(5) });

    public static ArchiveInstaller Archives(GameFolderService game)
        => new(game, Banana());

    public static RepositoryService Repository(GameFolderService game)
        => new(game, Banana(), Archives(game));

    public static TexturePackRepository Textures(GameFolderService game)
        => new(game);

    public static CustomLevelRepository Levels() => new();

    // ---------------------------------------------------------------- 页面 VM

    public static ModsPageViewModel ModsVm()
    {
        var game = Game();
        return new ModsPageViewModel(Repository(game), game, Picker());
    }

    public static TexturesPageViewModel TexturesVm()
    {
        var game = Game();
        return new TexturesPageViewModel(Textures(game), game, Picker());
    }

    public static LevelsPageViewModel LevelsVm()
    {
        var game = Game();
        return new LevelsPageViewModel(Levels(), game, Picker());
    }

    public static GameBananaPageViewModel BananaVm()
    {
        var game = Game();
        return new GameBananaPageViewModel(Banana(), Archives(game));
    }

    private sealed class NullPicker : IFilePicker
    {
        public string? PickArchive() => null;
        public string? PickFolder(string? title = null) => null;
    }
}
