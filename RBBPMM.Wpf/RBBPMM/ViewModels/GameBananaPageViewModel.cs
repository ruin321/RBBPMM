using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using RBBPMM.Core;
using RBBPMM.Services;

namespace RBBPMM.ViewModels;

/// <summary>Selectable GameBanana category for the search.</summary>
public sealed record GamebananaCategory(string Code, string Label, int Id);

/// <summary>
/// GameBanana browser: search by category, inspect a submission (files / requirements / updates),
/// then download and install a file through the same archive router the Mods page uses.
/// </summary>
public sealed class GameBananaPageViewModel : ViewModelBase
{
    private readonly GamebananaService _banana;
    private readonly ArchiveInstaller _archives;
    private readonly ILogger<GameBananaPageViewModel>? _log;

    private string _query = "";
    private string _status = "";
    private bool _isBusy;
    private bool _isLoadingDetails;
    private int _page = 1;
    private GamebananaCategory _category;
    private GamebananaSubmission? _selected;
    private IReadOnlyList<GamebananaCategory> _categories = [];

    public GameBananaPageViewModel(
        GamebananaService banana,
        ArchiveInstaller archives,
        ILogger<GameBananaPageViewModel>? log = null)
    {
        _banana = banana;
        _archives = archives;
        _log = log;
        SetTitle("page.gamebanana.title", "Browse GameBanana");

        Categories =
        [
            new("mods", LocalizationService.T("nav.mods", "Mods"), CategoryIds.BaldiCommunity),
            new("textures", LocalizationService.T("nav.textures", "Texture Packs"), CategoryIds.TexturePack),
            new("levels", LocalizationService.T("nav.levels", "Custom Levels"), CategoryIds.LevelStudio)
        ];
        _category = Categories[0];

        SearchCommand = new AsyncRelayCommand(() => SearchAsync(1));
        NextPageCommand = new AsyncRelayCommand(NextPageAsync, () => CanGoNext);
        PrevPageCommand = new AsyncRelayCommand(PrevPageAsync, () => _page > 1);
        InstallFileCommand = new AsyncRelayCommand<GamebananaFile>(InstallFileAsync);
        OpenPageCommand = new RelayCommand<GamebananaSubmission>(OpenPage);
        ReloadDetailsCommand = new AsyncRelayCommand(() => LoadDetailsAsync(_selected));

        LocalizationService.Current?.CultureChanged += (_, _) => RefreshCategoryLabels();
    }

    // ---------------------------------------------------------------- state

    public ObservableCollection<GamebananaSubmission> Results { get; } = [];
    public ObservableCollection<GamebananaUpdate> Updates { get; } = [];

    /// <summary>
    /// 分类列表。必须是可替换属性而不是只读属性 —— 切语言时要整条换掉（标签是构造时
    /// 快照的），只读属性会让下拉框一直显示旧语言。
    /// </summary>
    public IReadOnlyList<GamebananaCategory> Categories
    {
        get => _categories;
        private set => SetProperty(ref _categories, value);
    }

    public GamebananaCategory Category
    {
        get => _category;
        set => SetProperty(ref _category, value);
    }

    public string Query
    {
        get => _query;
        set => SetProperty(ref _query, value);
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

    /// <summary>Detail pane is fetching files / updates.</summary>
    public bool IsLoadingDetails
    {
        get => _isLoadingDetails;
        private set => SetProperty(ref _isLoadingDetails, value);
    }

    public bool HasResults => Results.Count > 0;

    public bool CanGoNext => Results.Count > 0;

    public int Page
    {
        get => _page;
        private set
        {
            if (SetProperty(ref _page, value))
            {
                OnPropertyChanged(nameof(PageLabel));
                NextPageCommand.NotifyCanExecuteChanged();
                PrevPageCommand.NotifyCanExecuteChanged();
            }
        }
    }

    public string PageLabel => $"{LocalizationService.T("banana.page", "Page")} {_page}";

    /// <summary>Submission shown in the detail pane.</summary>
    public GamebananaSubmission? SelectedSubmission
    {
        get => _selected;
        set
        {
            if (SetProperty(ref _selected, value))
            {
                OnPropertyChanged(nameof(HasSelection));
                OnPropertyChanged(nameof(AllFiles));
                OnPropertyChanged(nameof(HasRequirements));
                _ = LoadDetailsAsync(value);
            }
        }
    }

    public bool HasSelection => _selected is not null;

    public bool HasRequirements => _selected?.Requirements.Count > 0;

    /// <summary>Current plus archived files, newest first.</summary>
    public List<GamebananaFile> AllFiles => _selected is null
        ? []
        : _selected.Files.Concat(_selected.ArchivedFiles)
            .Where(f => !string.IsNullOrEmpty(f.DownloadUrl))
            .OrderByDescending(f => f.DateAdded ?? 0)
            .ToList();

    public IAsyncRelayCommand SearchCommand { get; }
    public IAsyncRelayCommand NextPageCommand { get; }
    public IAsyncRelayCommand PrevPageCommand { get; }
    public IAsyncRelayCommand<GamebananaFile> InstallFileCommand { get; }
    public IRelayCommand<GamebananaSubmission> OpenPageCommand { get; }
    public IAsyncRelayCommand ReloadDetailsCommand { get; }

    // ---------------------------------------------------------------- search

    public async Task SearchAsync(int page)
    {
        IsBusy = true;
        try
        {
            Status = LocalizationService.T("status.searching", "Searching…");
            var result = await _banana.SearchMods(page, _query, _category.Id);

            Results.Clear();
            foreach (var item in result.Items)
                Results.Add(item);

            Page = page;
            OnPropertyChanged(nameof(HasResults));
            Status = $"{result.RecordCount} · {LocalizationService.T("banana.results", "results")}";

            SelectedSubmission = Results.FirstOrDefault();
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "GameBanana 搜索失败");
            Status = ex.Message;
        }
        finally
        {
            IsBusy = false;
        }
    }

    private Task NextPageAsync() => SearchAsync(_page + 1);

    private Task PrevPageAsync() => SearchAsync(Math.Max(1, _page - 1));

    private async Task LoadDetailsAsync(GamebananaSubmission? submission)
    {
        Updates.Clear();
        if (submission is null)
            return;

        IsLoadingDetails = true;
        try
        {
            var updates = await _banana.GetUpdates(submission.Id);
            foreach (var u in updates.Items)
                Updates.Add(u);
        }
        catch (Exception ex)
        {
            _log?.LogWarning(ex, "读取更新记录失败: {Id}", submission.Id);
        }
        finally
        {
            IsLoadingDetails = false;
        }
    }

    // ---------------------------------------------------------------- install

    private async Task InstallFileAsync(GamebananaFile? file)
    {
        if (file is null || string.IsNullOrEmpty(file.DownloadUrl))
            return;

        IsBusy = true;
        try
        {
            Status = LocalizationService.T("status.installing", "Installing…");
            var result = await _archives.InstallFromUrlAsync(
                file.DownloadUrl,
                file.FileName,
                p => Status = p.Message ?? p.Stage);

            Status = result.Ok
                ? $"{LocalizationService.T("status.installed", "Installed")}: {result.Value!.Detail}"
                : $"{LocalizationService.T("status.failed", "Failed")}: {result.Error}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    private void OpenPage(GamebananaSubmission? submission)
    {
        if (submission is null)
            return;
        try
        {
            Process.Start(new ProcessStartInfo($"https://gamebanana.com/mods/{submission.Id}")
            {
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            _log?.LogWarning(ex, "打开 GameBanana 页面失败");
            Status = ex.Message;
        }
    }

    private void RefreshCategoryLabels()
    {
        // 分类下拉的标签是构造时快照的，语言切换后整条重建一次。
        var rebuilt = _categories
            .Select(c => c.Code switch
            {
                "textures" => new GamebananaCategory(c.Code, LocalizationService.T("nav.textures", "Texture Packs"), c.Id),
                "levels" => new GamebananaCategory(c.Code, LocalizationService.T("nav.levels", "Custom Levels"), c.Id),
                _ => new GamebananaCategory(c.Code, LocalizationService.T("nav.mods", "Mods"), c.Id)
            })
            .ToList();

        var index = Math.Max(0, _categories.ToList().FindIndex(c => c.Code == _category.Code));
        Categories = rebuilt;
        Category = rebuilt[Math.Min(index, rebuilt.Count - 1)];
    }
}
