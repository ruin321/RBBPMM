using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.Extensions.Logging;
using RBBPMM.Core;

namespace RBBPMM.Services;

/// <summary>Shared texture-pack list state (install / uninstall / README preview).</summary>
public sealed class TexturePackRepository(GameFolderService game, ILogger<TexturePackRepository>? log = null)
    : ObservableObject
{
    private readonly GameFolderService _game = game;
    private readonly ILogger<TexturePackRepository>? _log = log;

    private bool _isScanning;
    private string? _lastError;

    public ObservableCollection<TexturePack> Packs { get; } = [];

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

    public async Task RefreshAsync(CancellationToken ct = default)
    {
        if (_game.GameRoot is not { } root)
        {
            Packs.Clear();
            return;
        }

        IsScanning = true;
        try
        {
            var packs = await Task.Run(() => TexturePackService.ListTexturePacks(root), ct);
            Packs.Clear();
            foreach (var p in packs)
                Packs.Add(p);
            LastError = null;
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            _log?.LogError(ex, "读取材质包失败");
        }
        finally
        {
            IsScanning = false;
        }
    }

    /// <summary>Installs a texture-pack archive (or any archive whose payload is a pack folder).</summary>
    public async Task<Result<TexturePackInstallResult>> InstallAsync(
        string archivePath, Action<string>? progress = null, CancellationToken ct = default)
    {
        if (_game.GameRoot is not { } root)
            return Result<TexturePackInstallResult>.Fail("Game folder is not set");

        try
        {
            var result = await TexturePackService.InstallTexturePack(root, archivePath, progress);
            await RefreshAsync(ct);
            return Result<TexturePackInstallResult>.Success(result);
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "安装材质包失败");
            LastError = ex.Message;
            return Result<TexturePackInstallResult>.Fail(ex.Message);
        }
    }

    public async Task<Result<bool>> UninstallAsync(string folderName, CancellationToken ct = default)
    {
        if (_game.GameRoot is not { } root)
            return Result<bool>.Fail("Game folder is not set");

        try
        {
            await Task.Run(() => TexturePackService.UninstallTexturePack(root, folderName), ct);
            await RefreshAsync(ct);
            return Result<bool>.Success(true);
        }
        catch (Exception ex)
        {
            _log?.LogError(ex, "卸载材质包失败: {Folder}", folderName);
            LastError = ex.Message;
            return Result<bool>.Fail(ex.Message);
        }
    }

    /// <summary>Reads the readme files shipped inside one pack folder.</summary>
    public Task<List<ReadmeFile>> ReadReadmesAsync(string folderName, CancellationToken ct = default)
    {
        if (_game.GameRoot is not { } root)
            return Task.FromResult(new List<ReadmeFile>());

        return Task.Run(() =>
        {
            var packDir = Path.Combine(Constants.TexturePacksDir(root), folderName);
            return Directory.Exists(packDir)
                ? TexturePackService.CollectReadmes(packDir, 3)
                : [];
        }, ct);
    }
}
