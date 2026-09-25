using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using RBBPMM.Services;

namespace RBBPMM.ViewModels;

/// <summary>
/// Custom level page. Levels live in the per-user Level Studio "Playables" folder, so this page
/// works without a game folder; installing still needs one (temp dir + archive extraction).
/// </summary>
public sealed class LevelsPageViewModel : ViewModelBase
{
    private readonly CustomLevelRepository _repo;
    private readonly GameFolderService _game;
    private readonly IFilePicker _picker;
    private readonly ILogger<LevelsPageViewModel>? _log;

    private string _searchText = "";
    private string _status = "";
    private bool _isBusy;

    public LevelsPageViewModel(
        CustomLevelRepository repo,
        GameFolderService game,
        IFilePicker picker,
        ILogger<LevelsPageViewModel>? log = null)
    {
        _repo = repo;
        _game = game;
        _picker = picker;
        _log = log;
        SetTitle("page.levels.title", "Custom Levels");

        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
        InstallCommand = new AsyncRelayCommand(InstallAsync);
        ToggleCommand = new AsyncRelayCommand<CustomLevelRowViewModel>(ToggleAsync);
        DeleteCommand = new AsyncRelayCommand<CustomLevelRowViewModel>(DeleteAsync);
        OpenFolderCommand = new RelayCommand(OpenFolder);

        _repo.Levels.CollectionChanged += (_, _) => ApplyFilter();
        ApplyFilter();
    }

    public ObservableCollection<CustomLevelRowViewModel> VisibleLevels { get; } = [];

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

    public bool IsBusy
    {
        get => _isBusy;
        private set => SetProperty(ref _isBusy, value);
    }

    public bool HasLevels => VisibleLevels.Count > 0;

    public string PlayablesPath => CustomLevelRepository.PlayablesPath;

    public IAsyncRelayCommand RefreshCommand { get; }
    public IAsyncRelayCommand InstallCommand { get; }
    public IAsyncRelayCommand<CustomLevelRowViewModel> ToggleCommand { get; }
    public IAsyncRelayCommand<CustomLevelRowViewModel> DeleteCommand { get; }
    public IRelayCommand OpenFolderCommand { get; }

    public async Task RefreshAsync()
    {
        IsBusy = true;
        try
        {
            await _repo.RefreshAsync();
            ApplyFilter();
            Status = $"{VisibleLevels.Count} · {LocalizationService.T("status.ready", "Ready")}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task InstallAsync()
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
            var result = await _repo.InstallAsync(path);
            Status = result.Ok
                ? $"{LocalizationService.T("status.installed", "Installed")}: {result.Value!.Playables.Count}"
                : $"{LocalizationService.T("status.failed", "Failed")}: {result.Error}";
            ApplyFilter();
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task ToggleAsync(CustomLevelRowViewModel? row)
    {
        if (row is null)
            return;

        var target = !row.Enabled;
        var result = await _repo.ToggleAsync(row, target);
        Status = result.Ok
            ? $"{row.Name}: {LocalizationService.T(target ? "mods.status.enabled" : "mods.status.disabled", target ? "Enabled" : "Disabled")}"
            : result.Error ?? "";
    }

    private async Task DeleteAsync(CustomLevelRowViewModel? row)
    {
        if (row is null)
            return;

        var result = await _repo.DeleteAsync(row);
        Status = result.Ok
            ? $"{LocalizationService.T("status.uninstalled", "Removed")}: {row.Name}"
            : result.Error ?? "";
        ApplyFilter();
    }

    private void OpenFolder()
    {
        try
        {
            var path = CustomLevelRepository.PlayablesPath;
            Directory.CreateDirectory(path);
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            _log?.LogWarning(ex, "打开 Playables 目录失败");
            Status = ex.Message;
        }
    }

    private void ApplyFilter()
    {
        var q = _searchText.Trim();
        VisibleLevels.Clear();
        foreach (var l in _repo.Levels)
        {
            if (q.Length == 0
                || l.Name.Contains(q, StringComparison.OrdinalIgnoreCase)
                || l.Author.Contains(q, StringComparison.OrdinalIgnoreCase)
                || l.FileName.Contains(q, StringComparison.OrdinalIgnoreCase))
            {
                VisibleLevels.Add(l);
            }
        }
        OnPropertyChanged(nameof(HasLevels));
    }
}
