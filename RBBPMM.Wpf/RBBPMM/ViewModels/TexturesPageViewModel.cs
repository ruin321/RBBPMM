using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using RBBPMM.Core;
using RBBPMM.Services;

namespace RBBPMM.ViewModels;

/// <summary>Texture pack page: list, install from archive, uninstall, README preview.</summary>
public sealed class TexturesPageViewModel : ViewModelBase
{
    private readonly TexturePackRepository _repo;
    private readonly GameFolderService _game;
    private readonly IFilePicker _picker;
    private readonly ILogger<TexturesPageViewModel>? _log;

    private string _searchText = "";
    private string _status = "";
    private bool _isBusy;
    private TexturePackRowViewModel? _selected;
    private string _readme = "";

    public TexturesPageViewModel(
        TexturePackRepository repo,
        GameFolderService game,
        IFilePicker picker,
        ILogger<TexturesPageViewModel>? log = null)
    {
        _repo = repo;
        _game = game;
        _picker = picker;
        _log = log;
        SetTitle("page.textures.title", "Texture Packs");

        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
        InstallCommand = new AsyncRelayCommand(InstallAsync);
        UninstallCommand = new AsyncRelayCommand<TexturePackRowViewModel>(UninstallAsync);
        OpenFolderCommand = new RelayCommand<TexturePackRowViewModel>(OpenFolder);
        OpenPacksRootCommand = new RelayCommand(OpenPacksRoot);

        _repo.Packs.CollectionChanged += (_, _) => ApplyFilter();
        ApplyFilter();
    }

    public ObservableCollection<TexturePackRowViewModel> VisiblePacks { get; } = [];

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

    public bool IsGameMissing => !_game.IsReady;

    public bool HasPacks => VisiblePacks.Count > 0;

    /// <summary>Currently inspected pack; drives the README panel.</summary>
    public TexturePackRowViewModel? SelectedPack
    {
        get => _selected;
        set
        {
            if (SetProperty(ref _selected, value))
                _ = LoadReadmeAsync();
        }
    }

    public string Readme
    {
        get => _readme;
        private set
        {
            if (SetProperty(ref _readme, value))
                OnPropertyChanged(nameof(HasReadme));
        }
    }

    public bool HasReadme => !string.IsNullOrEmpty(_readme);

    public IAsyncRelayCommand RefreshCommand { get; }
    public IAsyncRelayCommand InstallCommand { get; }
    public IAsyncRelayCommand<TexturePackRowViewModel> UninstallCommand { get; }
    public IRelayCommand<TexturePackRowViewModel> OpenFolderCommand { get; }
    public IRelayCommand OpenPacksRootCommand { get; }

    public async Task RefreshAsync()
    {
        IsBusy = true;
        try
        {
            await _repo.RefreshAsync();
            ApplyFilter();
            Status = $"{VisiblePacks.Count} · {LocalizationService.T("status.ready", "Ready")}";
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
            var result = await _repo.InstallAsync(path, stage => Status = stage);
            Status = result.Ok
                ? $"{LocalizationService.T("status.installed", "Installed")}: {result.Value!.Installed.Count}"
                : $"{LocalizationService.T("status.failed", "Failed")}: {result.Error}";
            ApplyFilter();
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task UninstallAsync(TexturePackRowViewModel? row)
    {
        if (row is null)
            return;
        if (row.Protected)
        {
            Status = LocalizationService.T("textures.protected", "This pack is protected and cannot be removed.");
            return;
        }

        var result = await _repo.UninstallAsync(row.FolderName);
        Status = result.Ok
            ? $"{LocalizationService.T("status.uninstalled", "Removed")}: {row.Name}"
            : result.Error ?? "";
        ApplyFilter();
    }

    private async Task LoadReadmeAsync()
    {
        if (_selected is null)
        {
            Readme = "";
            return;
        }

        var readmes = await _repo.ReadReadmesAsync(_selected.FolderName);
        Readme = readmes.Count == 0
            ? ""
            : string.Join("\n\n", readmes.Select(r => $"── {r.Name} ──\n{r.Content}"));
    }

    private void OpenFolder(TexturePackRowViewModel? row)
    {
        if (row is null || _game.GameRoot is not { } root)
            return;
        OpenInShell(Path.Combine(Constants.TexturePacksDir(root), row.FolderName));
    }

    private void OpenPacksRoot()
    {
        if (_game.GameRoot is { } root)
            OpenInShell(Constants.TexturePacksDir(root));
    }

    private void ApplyFilter()
    {
        var q = _searchText.Trim();
        VisiblePacks.Clear();
        foreach (var p in _repo.Packs)
        {
            if (q.Length == 0
                || (p.Name ?? "").Contains(q, StringComparison.OrdinalIgnoreCase)
                || (p.Author ?? "").Contains(q, StringComparison.OrdinalIgnoreCase)
                || (p.FolderName ?? "").Contains(q, StringComparison.OrdinalIgnoreCase))
            {
                VisiblePacks.Add(new TexturePackRowViewModel(p));
            }
        }
        OnPropertyChanged(nameof(HasPacks));
        OnPropertyChanged(nameof(IsGameMissing));
    }

    private void OpenInShell(string path)
    {
        try
        {
            if (Directory.Exists(path))
                Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            _log?.LogWarning(ex, "打开路径失败: {Path}", path);
            Status = ex.Message;
        }
    }
}
