namespace RBBPMM.Core;

/// <summary>Which hidden page a submission unlocks.</summary>
public enum EasterEggKind
{
    None,
    Flee,
    Scare,
}

/// <summary>
/// GameBanana submission ids that unlock hidden pages. Mirrors the Electron build's
/// per-component constants (each egg hardcodes its own id at the top of the file);
/// they live together here so the ids stay greppable in one place.
///
/// Only the two eggs ported so far are listed — the rest of the Electron eggs are
/// still Phase-6+ work and are deliberately absent rather than half-wired.
/// </summary>
public static class EasterEggCatalog
{
    /// <summary>Runaway buttons: everything on the page becomes a physics body.</summary>
    public const int Flee = 714303;

    /// <summary>Jump scare: corner gif blows up full screen, then the app closes.</summary>
    public const int Scare = 703263;

    public static EasterEggKind KindFor(int submissionId) => submissionId switch
    {
        Flee => EasterEggKind.Flee,
        Scare => EasterEggKind.Scare,
        _ => EasterEggKind.None,
    };

    /// <summary>GameBanana ids arrive as JSON numbers, so they can be wider than <see cref="int"/>.</summary>
    public static EasterEggKind KindFor(long submissionId)
        => submissionId is < int.MinValue or > int.MaxValue
            ? EasterEggKind.None
            : KindFor((int)submissionId);
}
