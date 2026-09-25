using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using RBBPMM.Core;
using RBBPMM.Services;

namespace RBBPMM.ViewModels;

/// <summary>
/// Mods page: repository list with search, enable/disable, uninstall, archive install, update
/// checks, plus the game-folder / BepInEx / Dev API setup actions.
/// </summary>
public sealed class ModsPageViewModel : ViewModelBase
{
    private readonly RepositoryService _repo;
    private readonly GameFolderService _game;
    private readonly IFilePicker _picker;
    private readonly ILogger<ModsPageViewModel>? _log;

    private string _searchText = "";
    private string _status = "";
    private bool _isBusy;
    private bool _bepinexDetected;
    private ModRowViewModel? _selected;

    public ModsPageViewModel(
        RepositoryService repo,
        GameFolderService game,
        IFilePicker picker,
        ILogger<ModsPageViewModel>? log = null)
    {
        _repo = repo;
        _game = game;
        _picker = picker;
        _log = log;
        SetTitle("page.mods.title", "Your Mods");

        RefreshCommand = new AsyncRelayCommand(() => RefreshAsync());
        InstallArchiveCommand = new AsyncRelayCommand(InstallArchiveAsync);
        ToggleCommand = new AsyncRelayCommand<ModRowViewModel>(ToggleAsync);
        UninstallCommand = new AsyncRelayCommand<ModRowViewModel>(UninstallAsync);
        CheckUpdateCommand = new AsyncRelayCommand<ModRowViewModel>(CheckUpdateAsync);
        UpdateCommand = new AsyncRelayCommand<ModRowViewModel>(UpdateAsync);
        CheckAllUpdatesCommand = new AsyncRelayCommand(CheckAllUpdatesAsync);
        OpenFolderCommand = new RelayCommand<ModRowViewModel>(OpenFolder);
        OpenConfigCommand = new RelayCommand<ModRowViewModel>(OpenConfig);
        OpenAssetsCommand = new RelayCommand<ModRowViewModel>(OpenAssets);
        LaunchGameCommand = new RelayCommand(LaunchGame, () => _game.IsReady);
        ChooseGameFolderCommand = new AsyncRelayCommand(ChooseGameFolderAsync);
        AutoDetectGameCommand = new AsyncRelayCommand(AutoDetectAsync);
        InstallBepInExCommand = new AsyncRelayCommand(InstallBepInExAsync);
        InstallDevApiCommand = new AsyncRelayCommand(InstallDevApiAsync);

        _repo.Mods.CollectionChanged += (_, _) => ApplyFilter();
        _game.EnvironmentChanged += (_, _) =>
        {
            OnGameChanged();
            _ = RefreshAsync();
        };

        ApplyFilter();
        RefreshEnvironmentState();
    }

    // ---------------------------------------------------------------- state

    /// <summary>Rows passing the current search filter.</summary>
    public ObservableCollection<ModRowViewModel> VisibleMods { get; } = [];

    public string SearchText
    {
        get => _searchText;
        set
        {
            if (SetProperty(ref _searchText, value))
                ApplyFilter();
        }
    }

    public string Status
    {
        get => _status;
        private set
        {
            if (SetProperty(ref _status, value))
                OnPropertyChanged(nameof(HasStatus));
        }
    }

    public bool HasStatus => !string.IsNullOrEmpty(_status);

    /// <summary>A long-running operation is in flight (scan / install / update).</summary>
    public bool IsBusy
    {
        get => _isBusy;
        private set
        {
            if (SetProperty(ref _isBusy, value))
                OnPropertyChanged(nameof(IsIdle));
        }
    }

    public bool IsIdle => !_isBusy;

    public ModRowViewModel? SelectedMod
    {
        get => _selected;
        set => SetProperty(ref _selected, value);
    }

    public bool HasMods => VisibleMods.Count > 0;

    public bool IsGameReady => _game.IsReady;

    public bool IsGameMissing => !_game.IsReady;

    public string GameRoot => _game.GameRoot ?? "";

    public string GameVersion => _game.GameVersion ?? "";

    public string GameVersionLabel => LocalizationService.T("game.version", "Game version");

    public bool BepInExDetected
    {
        get => _bepinexDetected;
        private set
        {
            if (SetProperty(ref _bepinexDetected, value))
                OnPropertyChanged(nameof(NeedsBepInEx));
        }
    }

    public bool NeedsBepInEx => _game.IsReady && !_bepinexDetected;

    // ---------------------------------------------------------------- commands

    public IAsyncRelayCommand RefreshCommand { get; }
    public IAsyncRelayCommand InstallArchiveCommand { get; }
    public IAsyncRelayCommand<ModRowViewModel> ToggleCommand { get; }
    public IAsyncRelayCommand<ModRowViewModel> UninstallCommand { get; }
    public IAsyncRelayCommand<ModRowViewModel> CheckUpdateCommand { get; }
    public IAsyncRelayCommand<ModRowViewModel> UpdateCommand { get; }
    public IAsyncRelayCommand CheckAllUpdatesCommand { get; }
    public IRelayCommand<ModRowViewModel> OpenFolderCommand { get; }
    public IRelayCommand<ModRowViewModel> OpenConfigCommand { get; }
    public IRelayCommand<ModRowViewModel> OpenAssetsCommand { get; }
    public IRelayCommand LaunchGameCommand { get; }
    public IAsyncRelayCommand ChooseGameFolderCommand { get; }
    public IAsyncRelayCommand AutoDetectGameCommand { get; }
    public IAsyncRelayCommand InstallBepInExCommand { get; }
    public IAsyncRelayCommand InstallDevApiCommand { get; }

    // ---------------------------------------------------------------- operations

    public async Task RefreshAsync()
    {
        if (!_game.IsReady)
        {
            ApplyFilter();
            return;
        }

        IsBusy = true;
        Status = LocalizationService.T("status.scanning", "Scanning…");
        try
        {
            await _repo.RefreshAsync();
            ApplyFilter();
            RefreshEnvironmentState();
            Status = $"{VisibleMods.Count} · {LocalizationService.T("status.ready", "Ready")}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    /// <summary>Fallback used when the constructor-time scan cannot run yet.</summary>
    public Task InitializeAsync() => RefreshAsync();

    private async Task InstallArchiveAsync()
    {
        if (!_game.IsReady)
        {
            Status = LocalizationService.T("mods.needGame", "Choose your game folder first.");
            return;
        }

        var path = _picker.PickArchive();
        if (string.IsNullOrEmpty(path))
            return;

        IsBusy = true;
        try
        {
            Status = LocalizationService.T("status.installing", "Installing…");
            var result = await _repo.InstallArchiveAsync(
                path,
                p => Status = p.Message ?? p.Stage);

            Status = result.Ok
                ? $"{LocalizationService.T("status.installed", "Installed")}: {result.Value!.Detail}"
                : $"{LocalizationService.T("status.failed", "Failed")}: {result.Error}";
            ApplyFilter();
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task ToggleAsync(ModRowViewModel? row)
    {
        if (row is null)
            return;
        var target = !row.Activated;
        var result = await _repo.SetActivatedAsync(row, target);
        Status = result.Ok
            ? $"{row.Name}: {LocalizationService.T(target ? "mods.status.enabled" : "mods.status.disabled", target ? "Enabled" : "Disabled")}"
            : result.Error ?? "";
    }

    private async Task UninstallAsync(ModRowViewModel? row)
    {
        if (row is null)
            return;

        var result = await _repo.UninstallAsync(row);
        Status = result.Ok
            ? $"{LocalizationService.T("status.uninstalled", "Removed")}: {row.Name}  ·  {row.InstallDir}"
            : result.Error ?? "";
        ApplyFilter();
    }

    private async Task CheckUpdateAsync(ModRowViewModel? row)
    {
        if (row is null)
            return;
        var result = await _repo.CheckUpdateAsync(row);
        Status = result.Ok
            ? $"{row.Name}: {(result.Value!.HasUpdate
                ? LocalizationService.T("mods.updateAvailable", "Update available")
                : LocalizationService.T("mods.upToDate", "Up to date"))}"
            : result.Error ?? "";
    }

    private async Task UpdateAsync(ModRowViewModel? row)
    {
        if (row is null)
            return;

        var result = await _repo.UpdateAsync(row, p => Status = p.Message ?? p.Stage);
        Status = result.Ok
            ? $"{LocalizationService.T("status.updated", "Updated")}: {row.Name}"
            : result.Error ?? "";
        ApplyFilter();
    }

    private async Task CheckAllUpdatesAsync()
    {
        IsBusy = true;
        try
        {
            Status = LocalizationService.T("status.checking", "Checking…");
            await _repo.CheckAllUpdatesAsync();
            var count = _repo.Mods.Count(m => m.HasUpdate);
            Status = $"{LocalizationService.T("mods.updateAvailable", "Update available")}: {count}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    private void OpenFolder(ModRowViewModel? row)
    {
        if (row is null)
            return;
        OpenInShell(row.InstallDir);
    }

    private void OpenConfig(ModRowViewModel? row)
    {
        if (row?.ConfigFile is not { } cfg)
            return;
        if (!File.Exists(cfg))
            return;
        OpenInShell(cfg);
    }

    private void OpenAssets(ModRowViewModel? row)
    {
        if (row?.ModdedFolder is { } dir)
            OpenInShell(dir);
    }

    private void LaunchGame()
    {
        if (_game.ExecutablePath is not { } exe)
            return;
        if (!File.Exists(exe))
            return;

        try
        {
            Process.Start(new ProcessStartInfo(exe)
            {
                WorkingDirectory = _game.GameRoot ?? Path.GetDirectoryName(exe) ?? "",
                UseShellExecute = true
            });
            Status = LocalizationService.T("game.launched", "Game launched");
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "启动游戏失败");
            Status = ex.Message;
        }
    }

    private async Task ChooseGameFolderAsync()
    {
        var picked = _picker.PickFolder(LocalizationService.T("game.folder", "Game folder"));
        if (string.IsNullOrEmpty(picked))
            return;

        if (!_game.TrySetFromPath(picked))
        {
            Status = LocalizationService.T("game.invalidFolder", "That is not a valid Baldi's Basics Plus folder.");
            return;
        }

        await RefreshAsync();
    }

    private async Task AutoDetectAsync()
    {
        IsBusy = true;
        try
        {
            Status = LocalizationService.T("game.detecting", "Detecting…");
            var found = _game.AutoDetect();
            Status = found is null
                ? LocalizationService.T("game.notFound", "Could not find the game automatically.")
                : found;
        }
        finally
        {
            IsBusy = false;
        }

        await RefreshAsync();
    }

    private async Task InstallBepInExAsync()
    {
        if (!_game.IsReady)
            return;

        IsBusy = true;
        try
        {
            var result = await _repo.InstallBepInExAsync(p => Status = p.Message ?? p.Stage);
            Status = result.Ok
                ? LocalizationService.T("status.installed", "Installed")
                : result.Error ?? "";
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task InstallDevApiAsync()
    {
        if (!_game.IsReady)
            return;

        IsBusy = true;
        try
        {
            var result = await _repo.InstallDevApiAsync(p => Status = p.Message ?? p.Stage);
            Status = result.Ok
                ? LocalizationService.T("status.installed", "Installed")
                : result.Error ?? "";
            ApplyFilter();
        }
        finally
        {
            IsBusy = false;
        }
    }

    // ---------------------------------------------------------------- helpers

    private void OnGameChanged()
    {
        RefreshEnvironmentState();
        OnPropertyChanged(nameof(GameRoot));
        OnPropertyChanged(nameof(GameVersion));
        OnPropertyChanged(nameof(IsGameReady));
        OnPropertyChanged(nameof(IsGameMissing));
    }

    private void RefreshEnvironmentState()
    {
        BepInExDetected = _repo.DetectBepInEx();
        LaunchGameCommand.NotifyCanExecuteChanged();
    }

    private void ApplyFilter()
    {
        var q = _searchText.Trim();

        VisibleMods.Clear();
        foreach (var row in _repo.Mods)
        {
            if (q.Length == 0 || Matches(row, q))
                VisibleMods.Add(row);
        }

        OnPropertyChanged(nameof(HasMods));
    }

    private static bool Matches(ModRowViewModel row, string q) =>
        row.Name.Contains(q, StringComparison.OrdinalIgnoreCase)
        || row.Author.Contains(q, StringComparison.OrdinalIgnoreCase)
        || row.Guid.Contains(q, StringComparison.OrdinalIgnoreCase)
        || row.Version.Contains(q, StringComparison.OrdinalIgnoreCase);

    private void OpenInShell(string path)
    {
        try
        {
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            _log?.LogWarning(ex, "打开路径失败: {Path}", path);
            Status = ex.Message;
        }
    }
}
