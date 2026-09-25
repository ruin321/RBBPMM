using CommunityToolkit.Mvvm.ComponentModel;
using RBBPMM.Core;

namespace RBBPMM.Services;

/// <summary>
/// Which hidden page (if any) the user is currently looking at. Pages report the GameBanana
/// submission they are showing; the shell listens and reveals the matching egg.
///
/// Kept as a shared service rather than page state because both eggs have to be drawn *around*
/// the page content (corner buttons inside the content field, the scare scrim over the whole
/// window) — the shell owns that layer, the page only decides what is active.
/// </summary>
public sealed class EggService : ObservableObject
{
    private EasterEggKind _active = EasterEggKind.None;

    public EasterEggKind Active
    {
        get => _active;
        private set => SetProperty(ref _active, value);
    }

    /// <summary>Call with the submission currently on screen; <c>0</c>/unknown clears the egg.</summary>
    public void SetFromSubmission(long submissionId) => Active = EasterEggCatalog.KindFor(submissionId);

    public void Clear() => Active = EasterEggKind.None;
}
