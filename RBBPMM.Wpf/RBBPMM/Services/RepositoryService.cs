using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.Extensions.Logging;
using RBBPMM.Core;
using RBBPMM.ViewModels;

namespace RBBPMM.Services;

/// <summary>
/// Shared mod-list state. Owns the scanned repository (as UI rows) and performs the mutating
/// operations, re-using the Core scan cache so a toggle never triggers a full disk rescan.
/// Registered as a singleton so the Mods and GameBanana pages agree on one list.
/// </summary>
public sealed class RepositoryService : ObservableObject
{
    private readonly GameFolderService _game;
    private readonly GamebananaService _banana;
    private readonly ModSourceLinker _linker;
    private readonly ArchiveInstaller _archives;
    private readonly ILogger<RepositoryService>? _log;

    private bool _isScanning;
    private string? _lastError;

    public RepositoryService(
        GameFolderService game,
        GamebananaService banana,
        ArchiveInstaller archives,
        ILogger<RepositoryService>? log = null)
    {
        _game = game;
        _banana = banana;
        _archives = archives;
        _log = log;
        _linker = new ModSourceLinker(banana);
    }

    public ObservableCollection<ModRowViewModel> Mods { get; } = [];

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

    /// <summary>
    /// Re-reads the repository from disk off the UI thread. Cheap after the first call: the Core
    /// scan cache serves the previous result unless something invalidated it.
    /// </summary>
    public async Task RefreshAsync(CancellationToken ct = default)
    {
        if (_game.GameRoot is not { } root)
        {
            Mods.Clear();
            return;
        }

        IsScanning = true;
        try
        {
            var version = _game.GameVersion;
            var items = await Task.Run(() => ModRepositoryScanner.ScanRepository(root, version), ct);

            Mods.Clear();
            foreach (var item in items)
                Mods.Add(new ModRowViewModel(item));

            LastError = null;
            _log?.LogInformation("仓库扫描完成：{Count} 个条目", Mods.Count);
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            _log?.LogError(ex, "仓库扫描失败");
        }
        finally
        {
            IsScanning = false;
        }
    }

    /// <summary>Toggles on-disk activation, then patches the cached entry in place.</summary>
    public async Task<Result<bool>> SetActivatedAsync(ModRowViewModel row, bool activate, CancellationToken ct = default)
    {
        if (_game.GameRoot is not { } root)
            return Result<bool>.Fail("Game folder is not set");

        row.Busy = true;
        try
        {
            var result = await Task.Run(() =>
            {
                var manifest = ManifestLoader.LoadModManifest(row.InstallDir);
                if (manifest is not null)
                {
                    ModActivator.ToggleActivation(root, row.InstallDir, manifest, activate);
                }
                else
                {
                    var (activated, pluginFiles) = ModActivator.ToggleLegacyPlugin(
                        row.InstallDir, row.Model.PluginFiles, activate);
                    _ = activated;
                    row.Model.PluginFiles = pluginFiles;
                }

                ModRepositoryScanner.PatchModScanEntry(root, row.Guid, m => m with { Activated = activate });
                return true;
            }, ct);

            row.Activated = activate;
            return Result<bool>.Success(result);
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "启停失败: {Name}", row.Name);
            return Result<bool>.Fail(ex.Message);
        }
        finally
        {
            row.Busy = false;
        }
    }

    /// <summary>
    /// Removes a mod. Managed mods go through the backup/restore-aware uninstaller; legacy plugins
    /// just lose their dlls. The linked <c>Modded</c> asset folder is intentionally left alone.
    /// </summary>
    public async Task<Result<bool>> UninstallAsync(ModRowViewModel row, CancellationToken ct = default)
    {
        if (_game.GameRoot is not { } root)
            return Result<bool>.Fail("Game folder is not set");

        row.Busy = true;
        try
        {
            await Task.Run(() =>
            {
                var manifest = ManifestLoader.LoadModManifest(row.InstallDir);
                if (manifest is not null)
                    ModUnInstaller.DeleteMod(root, row.InstallDir, manifest);
                else
                    ModUnInstaller.DeleteLegacyPlugin(root, row.InstallDir, row.Model.PluginFiles);

                ModRepositoryScanner.InvalidateModScan(root);
            }, ct);

            Mods.Remove(row);
            return Result<bool>.Success(true);
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "卸载失败: {Name}", row.Name);
            return Result<bool>.Fail(ex.Message);
        }
        finally
        {
            row.Busy = false;
        }
    }

    /// <summary>Installs a local archive, routing by content kind, then rescans.</summary>
    public async Task<Result<ArchiveInstallOutcome>> InstallArchiveAsync(
        string archivePath,
        Action<InstallProgress>? onProgress = null,
        CancellationToken ct = default)
    {
        var result = await _archives.InstallAsync(archivePath, onProgress, null, ct);
        if (result.Ok)
            await RefreshAsync(ct);
        else
            LastError = result.Error;
        return result;
    }

    /// <summary>Compares a mod against its linked GameBanana file and flags the row.</summary>
    public async Task<Result<ModUpdateInfo>> CheckUpdateAsync(ModRowViewModel row, CancellationToken ct = default)
    {
        row.Busy = true;
        try
        {
            var info = await _linker.CheckForUpdateAsync(row.Model, ct);
            row.HasUpdate = info.HasUpdate;
            return Result<ModUpdateInfo>.Success(info);
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "检查更新失败: {Name}", row.Name);
            return Result<ModUpdateInfo>.Fail(ex.Message);
        }
        finally
        {
            row.Busy = false;
        }
    }

    /// <summary>Flags every row that has a linked source (no per-row spinner).</summary>
    public async Task CheckAllUpdatesAsync(CancellationToken ct = default)
    {
        foreach (var row in Mods.Where(m => m.HasLinkedSource).ToList())
        {
            if (ct.IsCancellationRequested)
                return;
            await CheckUpdateAsync(row, ct);
        }
    }

    /// <summary>Reinstalls a mod from its linked source, then rescans.</summary>
    public async Task<Result<bool>> UpdateAsync(
        ModRowViewModel row,
        Action<InstallProgress>? onProgress = null,
        CancellationToken ct = default)
    {
        if (_game.GameRoot is not { } root)
            return Result<bool>.Fail("Game folder is not set");

        row.Busy = true;
        try
        {
            var result = await Task.Run(
                () => _linker.UpdateModAsync(root, row.Model, onProgress, null, ct), ct);

            if (result.Ok)
            {
                row.HasUpdate = false;
                ModRepositoryScanner.InvalidateModScan(root);
                await RefreshAsync(ct);
            }
            else
            {
                LastError = result.Error;
            }

            return result;
        }
        finally
        {
            row.Busy = false;
        }
    }

    /// <summary>Installs the BB+ Dev API build matching the current game version.</summary>
    public async Task<Result<bool>> InstallDevApiAsync(
        Action<InstallProgress>? onProgress = null,
        CancellationToken ct = default)
    {
        if (_game.GameRoot is not { } root)
            return Result<bool>.Fail("Game folder is not set");

        var installer = new DevApiInstaller(_banana);
        var result = await installer.InstallDevApiAsync(root, _game.GameVersion, onProgress, null, ct);
        if (result.Ok)
            await RefreshAsync(ct);
        else
            LastError = result.Error;
        return result;
    }

    /// <summary>Installs BepInEx itself (requires the bundled archive).</summary>
    public async Task<Result<bool>> InstallBepInExAsync(
        Action<InstallProgress>? onProgress = null,
        CancellationToken ct = default)
    {
        if (_game.GameRoot is not { } root)
            return Result<bool>.Fail("Game folder is not set");

        var result = await BepInExSetup.InstallBepInEx(root, onProgress);
        if (result.Ok)
            await RefreshAsync(ct);
        else
            LastError = result.Error;
        return result;
    }

    public bool DetectBepInEx() => _game.GameRoot is { } root && BepInExSetup.DetectBepInEx(root);

    public void ClearError() => LastError = null;
}
