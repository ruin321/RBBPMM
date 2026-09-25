using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
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

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<UserSettings>(_ => UserSettings.Load());
        services.AddSingleton<ThemeManager>(sp =>
            new ThemeManager(Application.Current.Resources, log: sp.GetService<ILogger<ThemeManager>>()));
        services.AddSingleton<NavigationService>();
        services.AddSingleton<LocalizationService>();
        services.AddTransient<MainViewModel>();
        services.AddTransient<ModsPageViewModel>();
        services.AddTransient<TexturesPageViewModel>();
        services.AddTransient<LevelsPageViewModel>();
        services.AddTransient<GameBananaPageViewModel>();
        services.AddTransient<SettingsPageViewModel>();

        _provider = services.BuildServiceProvider();

        var settings = _provider.GetRequiredService<UserSettings>();
        var theme = _provider.GetRequiredService<ThemeManager>();
        theme.Initialize(settings);

        var loc = _provider.GetRequiredService<LocalizationService>();
        loc.LoadFromDirectory(System.IO.Path.Combine(AppContext.BaseDirectory, "Resources"));
        LocalizationService.SetCurrent(loc);
        loc.Language = settings.Language;

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
}
