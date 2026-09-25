using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.Extensions.Logging;
using RBBPMM.Core;
using RBBPMM.ViewModels;

namespace RBBPMM.Services;

/// <summary>
/// Shared custom-level list state. Levels live in the per-user Level Studio "Playables" folder,
/// not the game install, so this works even before a game folder is chosen.
/// </summary>
public sealed class CustomLevelRepository(ILogger<CustomLevelRepository>? log = null) : ObservableObject
{
    private readonly ILogger<CustomLevelRepository>? _log = log;

    private bool _isScanning;
    private string? _lastError;

    public ObservableCollection<CustomLevelRowViewModel> Levels { get; } = [];

    public bool IsScanning
    {
        get => _isScanning;
        private set => SetProperty(ref _isScanning, value);
    }

    public string? LastError
    {
        get => _lastError;
        private set
        {
            if (SetProperty(ref _lastError, value))
                OnPropertyChanged(nameof(HasError));
        }
    }

    public bool HasError => !string.IsNullOrEmpty(_lastError);

    /// <summary>Absolute path of the Playables folder, for the "open folder" action.</summary>
    public static string PlayablesPath => LevelStudioInstaller.LevelStudioPlayablesPath();

    public async Task RefreshAsync(CancellationToken ct = default)
    {
        IsScanning = true;
        try
        {
            var levels = await Task.Run(CustomLevelService.ListCustomLevels, ct);
            Levels.Clear();
            foreach (var l in levels)
                Levels.Add(new CustomLevelRowViewModel(l));
            LastError = null;
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            _log?.LogError(ex, "读取自定义关卡失败");
        }
        finally
        {
            IsScanning = false;
        }
    }

    public async Task<Result<bool>> ToggleAsync(CustomLevelRowViewModel row, bool enable, CancellationToken ct = default)
    {
        row.Busy = true;
        try
        {
            await Task.Run(() => CustomLevelService.ToggleCustomLevel(row.FileName, enable), ct);
            row.Enabled = enable;
            return Result<bool>.Success(true);
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "启停关卡失败: {File}", row.FileName);
            return Result<bool>.Fail(ex.Message);
        }
        finally
        {
            row.Busy = false;
        }
    }

    public async Task<Result<bool>> DeleteAsync(CustomLevelRowViewModel row, CancellationToken ct = default)
    {
        row.Busy = true;
        try
        {
            await Task.Run(() => CustomLevelService.DeleteCustomLevel(row.FileName), ct);
            Levels.Remove(row);
            return Result<bool>.Success(true);
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "删除关卡失败: {File}", row.FileName);
            return Result<bool>.Fail(ex.Message);
        }
        finally
        {
            row.Busy = false;
        }
    }

    /// <summary>Installs <c>.pbpl</c> files (or a folder of them) from an archive.</summary>
    public async Task<Result<LevelStudioInstallResult>> InstallAsync(
        string archivePath, CancellationToken ct = default)
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "rbbpmm-levels-" + Guid.NewGuid().ToString("N")[..8]);
        try
        {
            Directory.CreateDirectory(tempRoot);
            await Task.Run(() => ModArchiveExtractor.ExtractArchive(archivePath, tempRoot), ct);
            var result = await LevelStudioInstaller.InstallLevelStudioPlayableAsync(tempRoot);
            await RefreshAsync(ct);
            return Result<LevelStudioInstallResult>.Success(result);
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "安装关卡失败: {Path}", archivePath);
            LastError = ex.Message;
            return Result<LevelStudioInstallResult>.Fail(ex.Message);
        }
        finally
        {
            try
            {
                if (Directory.Exists(tempRoot))
                    Directory.Delete(tempRoot, recursive: true);
            }
            catch
            {
                // best effort
            }
        }
    }
}
