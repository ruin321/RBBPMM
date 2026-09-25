using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using RBBPMM.Core;
using RBBPMM.Navigation;
using RBBPMM.Services;
using RBBPMM.ViewModels;
using RBBPMM.Views;
using System.Windows;

namespace RBBPMM;

public partial class App : Application
{
    private ServiceProvider? _provider;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _provider = BuildServices();

        var settings = _provider.GetRequiredService<UserSettings>();

        var theme = _provider.GetRequiredService<ThemeManager>();
        theme.Initialize(settings);

        var loc = _provider.GetRequiredService<LocalizationService>();
        loc.LoadFromDirectory(System.IO.Path.Combine(AppContext.BaseDirectory, "Resources"));
        LocalizationService.SetCurrent(loc);
        loc.Language = settings.Language;

        // 恢复上次记住的游戏目录；没有就静默试一次常见 Steam 路径。
        // 都失败也不报错 —— Mods 页会显示「选择游戏目录」引导卡。
        var game = _provider.GetRequiredService<GameFolderService>();
        if (!game.TryRestoreFromSettings())
            game.AutoDetect();

        var nav = _provider.GetRequiredService<NavigationService>();
        nav.Register("mods", () => _provider.GetRequiredService<ModsPageViewModel>());
        nav.Register("textures", () => _provider.GetRequiredService<TexturesPageViewModel>());
        nav.Register("levels", () => _provider.GetRequiredService<LevelsPageViewModel>());
        nav.Register("gamebanana", () => _provider.GetRequiredService<GameBananaPageViewModel>());
        nav.Register("settings", () => _provider.GetRequiredService<SettingsPageViewModel>());

        var mainVm = _provider.GetRequiredService<MainViewModel>();
        var window = new MainWindow { DataContext = mainVm };
        window.Show();
    }

    private static ServiceProvider BuildServices()
    {
        var services = new ServiceCollection();
        services.AddLogging();

        services.AddSingleton<UserSettings>(_ => UserSettings.Load());
        services.AddSingleton<ThemeManager>(sp =>
            new ThemeManager(Application.Current.Resources, log: sp.GetService<ILogger<ThemeManager>>()));
        services.AddSingleton<NavigationService>();
        services.AddSingleton<LocalizationService>();
        services.AddSingleton<GameFolderService>();

        // 彩蛋状态：页面写、外壳的彩蛋层读，所以必须是单例。
        services.AddSingleton<EggService>();

        // 无参构造会自建 HttpClient；这里显式给一个带超时的实例，避免默认 100s 卡住 UI。
        services.AddSingleton(_ => new GamebananaService(
            new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(30) }));

        services.AddSingleton<IFilePicker, WindowsFilePicker>();
        services.AddSingleton<ArchiveInstaller>();
        services.AddSingleton<RepositoryService>();
        services.AddSingleton<TexturePackRepository>();
        services.AddSingleton<CustomLevelRepository>();

        services.AddTransient<MainViewModel>();
        services.AddTransient<ModsPageViewModel>();
        services.AddTransient<TexturesPageViewModel>();
        services.AddTransient<LevelsPageViewModel>();
        services.AddTransient<GameBananaPageViewModel>();
        services.AddTransient<SettingsPageViewModel>();

        return services.BuildServiceProvider();
    }
}
