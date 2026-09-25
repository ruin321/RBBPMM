using CommunityToolkit.Mvvm.ComponentModel;
using RBBPMM.Core;
using RBBPMM.Services;

namespace RBBPMM.ViewModels;

/// <summary>One row in the custom-levels list (enable state is mutable, hence the wrapper).</summary>
public sealed class CustomLevelRowViewModel : ObservableObject
{
    private bool _enabled;
    private bool _busy;

    public CustomLevelRowViewModel(CustomLevel level)
    {
        Level = level;
        _enabled = level.Enabled;

        LocalizationService.Current?.CultureChanged += (_, _) =>
        {
            OnPropertyChanged(nameof(ToggleLabel));
            OnPropertyChanged(nameof(StatusLabel));
        };
    }

    public CustomLevel Level { get; }

    public string FileName => Level.FileName;
    public string Name => string.IsNullOrEmpty(Level.Name) ? Level.FileName : Level.Name;
    public string Author => Level.Author;
    public string Type => Level.Type;
    public long Size => Level.Size;
    public string? Thumbnail => Level.Thumbnail;

    public bool HasThumbnail => !string.IsNullOrEmpty(Level.Thumbnail);
    public bool HasAuthor => !string.IsNullOrEmpty(Level.Author);
    public string SizeLabel => $"{Level.Size / 1024.0:0.#} KB";

    public bool Enabled
    {
        get => _enabled;
        set
        {
            if (SetProperty(ref _enabled, value))
            {
                OnPropertyChanged(nameof(ToggleLabel));
                OnPropertyChanged(nameof(StatusLabel));
            }
        }
    }

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

    // 两个都带英文兜底：Current 为 null（单测/极早期启动）或缺键时不至于把裸键名印到界面上。
    public string ToggleLabel => LocalizationService.T(
        Enabled ? "common.disable" : "common.enable",
        Enabled ? "Disable" : "Enable");

    public string StatusLabel => LocalizationService.T(
        Enabled ? "mods.status.enabled" : "mods.status.disabled",
        Enabled ? "Enabled" : "Disabled");
}
