using CommunityToolkit.Mvvm.ComponentModel;
using RBBPMM.Core;
using RBBPMM.Services;

namespace RBBPMM.ViewModels;

/// <summary>
/// One row in the Mods list. Wraps the immutable-ish Core <see cref="ModItem"/> with the mutable
/// UI state the list needs (active toggle, busy flag, update badge).
/// </summary>
public sealed class ModRowViewModel : ObservableObject
{
    private bool _activated;
    private bool _busy;
    private bool _hasUpdate;
    private bool _supportsCurrentVersion;

    public ModRowViewModel(ModItem model)
    {
        Model = model;
        _activated = model.Activated;
        _supportsCurrentVersion = model.SupportsCurrentVersion;

        // 按钮文案随语言切换刷新（Setter.Value 里放不了 Binding，故由 VM 提供文案）
        LocalizationService.Current?.CultureChanged += (_, _) =>
        {
            OnPropertyChanged(nameof(ToggleLabel));
            OnPropertyChanged(nameof(StatusLabel));
        };
    }

    public ModItem Model { get; private set; }

    public string Name => Model.Name;
    public string Author => Model.Author;
    public string Version => Model.Version;
    public string Guid => Model.Guid;
    public string? Description => Model.Description;
    public string? ModdedFolder => Model.ModdedFolder;
    public string? ConfigFile => Model.ConfigFile;
    public string? DllFile => Model.DllFile;
    public string DirectoryName => Model.DirectoryName;
    public string InstallDir => Model.InstallDir;

    /// <summary>Legacy entries are raw BepInEx plugins with no GMP manifest.</summary>
    public bool IsLegacy => Model.Guid.StartsWith("legacy:", StringComparison.Ordinal);

    /// <summary>Plugins dropped straight into <c>BepInEx/plugins</c> rather than a subfolder.</summary>
    public bool IsLoose => Model.Loose;

    public bool HasModdedFolder => !string.IsNullOrEmpty(Model.ModdedFolder);

    public bool Activated
    {
        get => _activated;
        set => SetProperty(ref _activated, value);
    }

    public bool SupportsCurrentVersion
    {
        get => _supportsCurrentVersion;
        set => SetProperty(ref _supportsCurrentVersion, value);
    }

    /// <summary>True while a long-running operation owns this row (commands are disabled).</summary>
    public bool Busy
    {
        get => _busy;
        set
        {
            if (SetProperty(ref _busy, value))
                OnPropertyChanged(nameof(Idle));
        }
    }

    public bool Idle => !_busy;

    /// <summary>Set when a linked GameBanana source has a newer file.</summary>
    public bool HasUpdate
    {
        get => _hasUpdate;
        set => SetProperty(ref _hasUpdate, value);
    }

    /// <summary>Enable/Disable button caption, localized.</summary>
    public string ToggleLabel => LocalizationService.T(Activated ? "common.disable" : "common.enable");

    /// <summary>Enabled/Disabled state caption, localized.</summary>
    public string StatusLabel => LocalizationService.T(
        Activated ? "mods.status.enabled" : "mods.status.disabled",
        Activated ? "Enabled" : "Disabled");

    /// <summary>Shown in the "not compatible" corner when the mod lacks the current game version.</summary>
    public string VersionBadge => string.IsNullOrEmpty(Version)
        ? LocalizationService.T("mods.legacy", "Legacy")
        : Version;

    public bool HasLinkedSource => Model.GamebananaSource is not null;

    /// <summary>Swaps in a re-scanned model and re-raises the properties that read from it.</summary>
    public void UpdateFromModel(ModItem model)
    {
        Model = model;
        Activated = model.Activated;
        SupportsCurrentVersion = model.SupportsCurrentVersion;
        OnPropertyChanged(nameof(Name));
        OnPropertyChanged(nameof(Author));
        OnPropertyChanged(nameof(Version));
        OnPropertyChanged(nameof(Guid));
        OnPropertyChanged(nameof(Description));
        OnPropertyChanged(nameof(ModdedFolder));
        OnPropertyChanged(nameof(HasModdedFolder));
        OnPropertyChanged(nameof(ConfigFile));
        OnPropertyChanged(nameof(DllFile));
        OnPropertyChanged(nameof(IsLegacy));
        OnPropertyChanged(nameof(IsLoose));
    }
}
