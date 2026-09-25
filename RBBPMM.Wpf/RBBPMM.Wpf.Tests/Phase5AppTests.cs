using System.IO;
using RBBPMM.Core;
using RBBPMM.Services;
using RBBPMM.ViewModels;

namespace RBBPMM.Wpf.Tests;

/// <summary>
/// Phase 5 应用层（游戏目录 / 仓储 / 压缩包路由 / 各行 VM 文案）的测试。
///
/// 这些类是 Core 与界面之间的粘合层，最容易出的错是「未选游戏目录时不崩」和
/// 「文案不随语言切换刷新」，所以两类都覆盖。
/// </summary>
public class Phase5AppTests
{
    private static LocalizationService InstallResources()
    {
        var loc = new LocalizationService();
        loc.LoadFromDirectory(TestFs.ResourcesDir());
        loc.Language = "en";
        LocalizationService.SetCurrent(loc);
        return loc;
    }

    // ---------------------------------------------------------------- 游戏目录

    [Fact]
    public void TrySetFromPath_RejectsFolderThatIsNotAGameInstall()
    {
        var game = TestServices.Game();

        Assert.False(game.TrySetFromPath(TestFs.TempDir()));
        Assert.False(game.IsReady);
        Assert.Null(game.GameRoot);
    }

    [Fact]
    public void TrySetFromPath_AcceptsAFolderContainingTheGame_AndPersistsIt()
    {
        var settings = TestServices.Settings();
        var game = new GameFolderService(settings);

        Assert.True(game.TrySetFromPath(TestFs.MakeGameInstall("0.9.1")));

        Assert.True(game.IsReady);
        Assert.Equal("0.9.1", game.GameVersion);
        Assert.Equal(Path.Combine(game.GameRoot!, Constants.GameExeName), game.ExecutablePath);
        // 记住路径，下次启动能自动恢复
        Assert.Equal(game.ExecutablePath, settings.GamePath);
    }

    [Fact]
    public void TrySetFromPath_AcceptsTheExeDirectly_AndStepsUpOneNestedFolder()
    {
        var root = TestFs.MakeGameInstall();
        var game = TestServices.Game();

        // 直接给 exe
        Assert.True(game.TrySetFromPath(Path.Combine(root, Constants.GameExeName)));

        // Steam 有时把路径指到再下一层，Resolve 会往下找一层
        var nested = TestFs.TempDir();
        var inner = Path.Combine(nested, "Baldi's Basics Plus");
        Directory.CreateDirectory(inner);
        foreach (var file in Directory.GetFiles(root, "*", SearchOption.AllDirectories))
        {
            var target = Path.Combine(inner, Path.GetRelativePath(root, file));
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(file, target);
        }

        Assert.True(TestServices.Game().TrySetFromPath(nested));
    }

    [Fact]
    public void TryRestoreFromSettings_ReturnsFalseWhenNothingSaved()
    {
        var game = TestServices.Game();

        Assert.False(game.TryRestoreFromSettings());
    }

    [Fact]
    public void TryRestoreFromSettings_ResolvesTheSavedPath()
    {
        var path = Path.Combine(TestFs.TempDir(), "settings.json");
        new GameFolderService(new UserSettings(path))
            .TrySetFromPath(TestFs.MakeGameInstall("0.8.4"));

        // 模拟新进程：只有 settings.json 里记着的路径
        var restored = new GameFolderService(UserSettings.Load(path));

        Assert.True(restored.TryRestoreFromSettings());
        Assert.Equal("0.8.4", restored.GameVersion);
    }

    // ---------------------------------------------------------------- 仓储

    [Fact]
    public async Task Repository_WithoutGameFolder_RefreshesToEmptyWithoutThrowing()
    {
        var repo = TestServices.Repository(TestServices.Game());

        await repo.RefreshAsync();

        Assert.Empty(repo.Mods);
        Assert.False(repo.HasError);
        Assert.False(repo.DetectBepInEx());
    }

    [Fact]
    public async Task Repository_WithGameFolderButNoMods_ScansToEmpty()
    {
        var game = TestServices.Game();
        game.TrySetFromPath(TestFs.MakeGameInstall());
        var repo = TestServices.Repository(game);

        await repo.RefreshAsync();

        Assert.Empty(repo.Mods);
        Assert.False(repo.DetectBepInEx());
    }

    // ---------------------------------------------------------------- 压缩包路由

    [Fact]
    public async Task ArchiveInstaller_ReportsMissingArchive_InsteadOfThrowing()
    {
        var game = TestServices.Game();
        game.TrySetFromPath(TestFs.MakeGameInstall());
        var archives = TestServices.Archives(game);

        var result = await archives.InstallAsync(Path.Combine(TestFs.TempDir(), "nope.zip"));

        Assert.False(result.Ok);
        Assert.Contains("not found", result.Error!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ArchiveInstaller_WithoutGameFolder_FailsFast()
    {
        var archives = TestServices.Archives(TestServices.Game());

        var result = await archives.InstallAsync(TestFs.MakeZip(new() { ["a.txt"] = "hi" }));

        Assert.False(result.Ok);
        Assert.Contains("Game folder", result.Error!);
    }

    [Fact]
    public async Task ArchiveInstaller_RoutesPackJsonArchivesToTheTexturePackService()
    {
        var game = TestServices.Game();
        game.TrySetFromPath(TestFs.MakeGameInstall());
        var archives = TestServices.Archives(game);

        var zip = TestFs.MakeZip(new()
        {
            ["My Pack/pack.json"] = """{"name":"My Pack","author":"me"}""",
            ["My Pack/texture.png"] = "fake",
        });

        var result = await archives.InstallAsync(zip);

        Assert.True(result.Ok, result.Error);
        Assert.Equal(ArchiveKind.TexturePack, result.Value!.Kind);
        Assert.True(Directory.Exists(Path.Combine(Constants.TexturePacksDir(game.GameRoot!), "My Pack")));
    }

    [Fact]
    public async Task ArchiveInstaller_RoutesBepInExLayoutArchivesToTheModInstaller()
    {
        var game = TestServices.Game();
        game.TrySetFromPath(TestFs.MakeGameInstall());
        var archives = TestServices.Archives(game);

        var zip = TestFs.MakeZip(new()
        {
            ["BepInEx/plugins/CoolMod/CoolMod.dll"] = "MZ fake",
        });

        var result = await archives.InstallAsync(zip);

        Assert.True(result.Ok, result.Error);
        Assert.Equal(ArchiveKind.Mod, result.Value!.Kind);
    }

    [Fact]
    public async Task ArchiveInstaller_RoutesGmpManifestArchivesToTheModInstaller()
    {
        var game = TestServices.Game();
        game.TrySetFromPath(TestFs.MakeGameInstall());
        var archives = TestServices.Archives(game);

        var zip = TestFs.MakeZip(new()
        {
            // GMP 的清单住在 .rbbpmm/ 里，不是包根
            [".rbbpmm/manifest.json"] =
                """{"guid":"com.example.cool","name":"Cool Mod","author":"me","version":"1.0.0","plugins":["CoolMod.dll"]}""",
            ["CoolMod.dll"] = "MZ fake",
        });

        var result = await archives.InstallAsync(zip);

        Assert.True(result.Ok, result.Error);
        Assert.Equal(ArchiveKind.Mod, result.Value!.Kind);
        Assert.Equal("Cool Mod", result.Value!.Detail);
    }

    // ---------------------------------------------------------------- 自定义关卡仓储

    [Fact]
    public async Task CustomLevelRepository_ListsTogglesAndDeletes_AgainstTheOverriddenPlayablesFolder()
    {
        var original = CustomLevelService.PlayablesPathOverride;
        var playables = TestFs.TempDir();
        CustomLevelService.PlayablesPathOverride = playables;

        try
        {
            File.WriteAllBytes(Path.Combine(playables, "alpha.pbpl"), [1, 2, 3, 4]);
            File.WriteAllBytes(Path.Combine(playables, "beta.pbpl.disabled"), [5, 6, 7, 8]);

            var repo = TestServices.Levels();
            await repo.RefreshAsync();

            // FileName 带扩展名（沿用 Electron 的语义：只剥 .disabled）
            Assert.Equal(2, repo.Levels.Count);
            Assert.True(repo.Levels.Single(l => l.FileName == "alpha.pbpl").Enabled);
            Assert.False(repo.Levels.Single(l => l.FileName == "beta.pbpl").Enabled);

            var alpha = repo.Levels.Single(l => l.FileName == "alpha.pbpl");
            var toggled = await repo.ToggleAsync(alpha, enable: false);

            Assert.True(toggled.Ok, toggled.Error);
            Assert.False(alpha.Enabled);
            Assert.True(File.Exists(Path.Combine(playables, "alpha.pbpl.disabled")));

            var deleted = await repo.DeleteAsync(alpha);

            Assert.True(deleted.Ok, deleted.Error);
            Assert.False(File.Exists(Path.Combine(playables, "alpha.pbpl.disabled")));
            Assert.Single(repo.Levels);
        }
        finally
        {
            CustomLevelService.PlayablesPathOverride = original;
        }
    }

    // ---------------------------------------------------------------- 行 VM 文案

    [Fact]
    public void ModRow_LabelsFollowActivationAndLanguage()
    {
        var loc = InstallResources();
        try
        {
            var row = new ModRowViewModel(new ModItem
            {
                Guid = "com.example.a",
                Name = "A",
                Activated = true,
                SupportsCurrentVersion = true,
            });

            Assert.Equal("Disable", row.ToggleLabel);
            Assert.Equal("Enabled", row.StatusLabel);

            row.Activated = false;
            Assert.Equal("Enable", row.ToggleLabel);
            Assert.Equal("Disabled", row.StatusLabel);

            loc.Language = "zh-CN";
            Assert.Equal("启用", row.ToggleLabel);
            Assert.Equal("已停用", row.StatusLabel);
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }

    [Fact]
    public void ModRow_LegacyEntry_IsFlaggedAndUsesLegacyBadgeWhenVersionIsBlank()
    {
        var loc = InstallResources();
        try
        {
            var row = new ModRowViewModel(new ModItem
            {
                Guid = "legacy:coolmod",
                Name = "Cool",
                Version = "",
            });

            Assert.True(row.IsLegacy);
            Assert.Equal("Legacy", row.VersionBadge);
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }

    [Fact]
    public void CustomLevelRow_ToggleLabelFollowsEnabledAndLanguage()
    {
        var loc = InstallResources();
        try
        {
            var row = new CustomLevelRowViewModel(
                new CustomLevel("a.pbpl", "Level A", "me", "Playable", 2048, Enabled: true));

            Assert.Equal("Disable", row.ToggleLabel);
            Assert.Equal("2 KB", row.SizeLabel);

            row.Enabled = false;

            loc.Language = "ja";
            Assert.Equal("有効化", row.ToggleLabel);
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }

    // ---------------------------------------------------------------- 页面 VM

    [Fact]
    public void GameBananaVm_PageLabelAndCategoriesFollowLanguage()
    {
        var loc = InstallResources();
        try
        {
            var vm = TestServices.BananaVm();

            Assert.Equal("Page 1", vm.PageLabel);
            Assert.Equal(["Mods", "Texture Packs", "Custom Levels"], vm.Categories.Select(c => c.Label));

            loc.Language = "zh-CN";

            Assert.Equal("页码 1", vm.PageLabel);
            Assert.Equal(["模组", "材质包", "自定义关卡"], vm.Categories.Select(c => c.Label));
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }

    [Fact]
    public void GameBananaVm_PrevPageIsDisabledOnTheFirstPage()
    {
        var vm = TestServices.BananaVm();

        Assert.False(vm.PrevPageCommand.CanExecute(null));
        Assert.False(vm.HasSelection);
        Assert.Empty(vm.AllFiles);
    }

    [Fact]
    public void ModsVm_WithoutGameFolder_FlagsItAndDoesNotThrow()
    {
        var vm = TestServices.ModsVm();

        Assert.True(vm.IsGameMissing);
        Assert.False(vm.IsGameReady);
        Assert.Equal("", vm.GameVersion);
        Assert.Empty(vm.VisibleMods);
        Assert.True(vm.IsIdle);
    }

    [Fact]
    public void TexturesVm_WithoutGameFolder_ShowsTheGuidanceState()
    {
        var vm = TestServices.TexturesVm();

        Assert.True(vm.IsGameMissing);
        Assert.False(vm.HasPacks);
        Assert.False(vm.HasReadme);
    }

    [Fact]
    public void LevelsVm_ExposesThePlayablesPath_AndStartsEmpty()
    {
        var vm = TestServices.LevelsVm();

        Assert.Contains("Playables", vm.PlayablesPath);
        Assert.False(vm.HasLevels);
    }
}
