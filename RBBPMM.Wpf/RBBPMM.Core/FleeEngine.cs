namespace RBBPMM.Core;

/// <summary>
/// One element that has been "unlocked" into a physics body. Coordinates are in the
/// content field's space: <see cref="Left"/>/<see cref="Top"/> are the element's position
/// when it was unlocked, and <see cref="X"/>/<see cref="Y"/> are how far it has since drifted.
/// </summary>
public sealed class FleeBody
{
    /// <summary>The element this body moves. Identity is by reference.</summary>
    public required object Element { get; init; }

    /// <summary>Diagnostic label (element name, or a snippet of text).</summary>
    public string Id { get; init; } = "?";

    public double Left { get; init; }
    public double Top { get; init; }
    public double Width { get; init; }
    public double Height { get; init; }

    public double X;
    public double Y;
    public double Vx;
    public double Vy;

    public double CenterX => Left + Width / 2 + X;
    public double CenterY => Top + Height / 2 + Y;

    /// <summary>Collision radius, derived from the box (same cheap approximation as the original).</summary>
    public double Radius => (Width + Height) / 4;

    /// <summary>A fresh measurement of the same still-attached element, for the next frame's candidate pass.</summary>
    public FleeBody Moved(double left, double top, double width, double height) => new()
    {
        Element = Element,
        Id = Id,
        Left = left,
        Top = top,
        Width = width,
        Height = height,
    };
}

/// <summary>
/// A still-attached obstacle, described as a circle for the collision pass. Carries the candidate
/// body so that a hard enough hit can hand it straight back as the body to unlock.
/// </summary>
public readonly record struct FleeObstacle(FleeBody Body, double CenterX, double CenterY, double Radius)
{
    public object Element => Body.Element;
}

/// <summary>A body that came loose, plus its launch velocity.</summary>
public readonly record struct FleeUnlock(FleeBody Body, double Vx, double Vy);

/// <summary>What one <see cref="FleeEngine.Step"/> call produced.</summary>
public sealed class FleeStepResult
{
    /// <summary>Bodies to detach from the layout by a hard collision (in hit order).</summary>
    public List<FleeUnlock> Unlocked { get; } = [];

    /// <summary>Obstacles that were considered this frame — kept for diagnostics and tests.</summary>
    public List<object> Statics { get; } = [];
}

/// <summary>
/// The runaway-buttons physics, ported one-to-one from the Electron build's <c>tickBody</c>.
///
/// Deliberately free of any UI types so it can be driven headlessly: the caller supplies
/// live candidate rects each frame and writes back transforms from <see cref="Bodies"/>.
/// That matters because the original's two nastiest failure modes were both invisible in a
/// moving picture:
///
/// 1. the step must be driven from exactly ONE place per frame — the original called it once
///    from <c>tick</c> and once more from <c>tickBody</c>, doubling the integrated time every
///    frame (2ⁿ), which saturated the renderer and looked like a hang;
/// 2. the obstacle list is only populated while below <see cref="MaxBodies"/>, so inverting
///    that condition silently kills the whole unlock chain — nothing errors, collisions just
///    stop happening.
/// </summary>
public sealed class FleeEngine
{
    public const double PushRadius = 150;
    public const double TouchRadius = 28;
    public const double PushAcceleration = 2600;
    public const double Kick = 520;
    public const double Friction = 3.2;
    public const double Restitution = 0.55;
    public const double HitUnlockSpeed = 80;
    public const double EdgePad = 4;
    public const int MaxBodies = 120;
    public const double MinWidth = 12;
    public const double MinHeight = 8;
    public const double BigAreaRatio = 0.5;

    /// <summary>Per-frame integration cap, so a paused window doesn't fling everything.</summary>
    public const double MaxDeltaSeconds = 0.05;

    private readonly List<FleeBody> _bodies = [];

    public IReadOnlyList<FleeBody> Bodies => _bodies;

    public int Count => _bodies.Count;

    /// <summary>
    /// Descendant test: <c>Contains(container, node)</c> → true when <paramref name="node"/> sits
    /// inside <paramref name="container"/>. Only needed to skip elements already riding inside a
    /// loose body. Defaults to "nothing contains anything", which is what headless tests want.
    /// </summary>
    public Func<object, object, bool> Contains { get; set; } = static (_, _) => false;

    public bool IsLoose(object element) => _bodies.Any(b => ReferenceEquals(b.Element, element));

    public void Add(FleeBody body)
    {
        if (!IsLoose(body.Element))
            _bodies.Add(body);
    }

    public void Clear() => _bodies.Clear();

    /// <summary>Aspect-and-size gate applied to every candidate, exactly as the original.</summary>
    public static bool IsEligible(double width, double height, double fieldArea)
        => width >= MinWidth
           && height >= MinHeight
           && width * height <= fieldArea * BigAreaRatio;

    /// <summary>Shortest distance from a point to an axis-aligned rect (0 when inside).</summary>
    public static double DistanceToRect(
        double px, double py, double left, double top, double right, double bottom)
    {
        var dx = Math.Max(Math.Max(left - px, 0), px - right);
        var dy = Math.Max(Math.Max(top - py, 0), py - bottom);
        return Math.Sqrt(dx * dx + dy * dy);
    }

    public static double ClampDelta(double seconds) => Math.Min(seconds, MaxDeltaSeconds);

    /// <summary>
    /// Touch-to-unlock pass: anything the cursor came within <see cref="TouchRadius"/> of comes
    /// loose and gets kicked away from the cursor. Call before <see cref="Step"/> and hand the
    /// result to it, so touches resolve before the push integration (the original's ordering).
    /// </summary>
    public List<FleeUnlock> TryTouchUnlock(
        double cursorX, double cursorY, IReadOnlyList<FleeBody> candidates)
    {
        var hits = new List<FleeUnlock>();

        // The original mutated `bodies` as it went, so its in-loop `size >= MAX` check held the
        // cap. Here the unlock is deferred to Step, so the budget has to be counted explicitly —
        // without this the touch pass hands back the entire candidate list in one frame.
        var budget = MaxBodies - _bodies.Count;
        if (budget <= 0)
            return hits;

        foreach (var candidate in candidates)
        {
            if (hits.Count >= budget)
                break;
            if (IsLoose(candidate.Element) || IsInsideLoose(candidate.Element))
                continue;
            if (candidate.Width < MinWidth || candidate.Height < MinHeight)
                continue;

            var left = candidate.Left;
            var top = candidate.Top;
            var distance = DistanceToRect(
                cursorX, cursorY, left, top, left + candidate.Width, top + candidate.Height);
            if (distance > TouchRadius)
                continue;

            var cx = left + candidate.Width / 2;
            var cy = top + candidate.Height / 2;
            var dx = cx - cursorX;
            var dy = cy - cursorY;
            var d = Math.Sqrt(dx * dx + dy * dy);
            if (d < 1)
            {
                dx = 0;
                dy = 1;
            }
            else
            {
                dx /= d;
                dy /= d;
            }

            hits.Add(new FleeUnlock(candidate, dx * Kick, dy * Kick));
        }

        return hits;
    }

    /// <summary>
    /// Advance one frame.
    /// </summary>
    /// <param name="deltaSeconds">Elapsed time — pass an already-clamped value (see <see cref="ClampDelta"/>).</param>
    /// <param name="cursorX">Cursor position in field space.</param>
    /// <param name="cursorY">Cursor position in field space.</param>
    /// <param name="candidates">
    /// Every element eligible to come loose this frame, with fresh rects. Bodies already loose may
    /// be included; they are skipped.
    /// </param>
    /// <param name="fieldWidth">Width of the content field the bodies bounce inside.</param>
    /// <param name="fieldHeight">Height of the content field.</param>
    /// <param name="unlockedByTouch">Result of <see cref="TryTouchUnlock"/> for this frame.</param>
    public FleeStepResult Step(
        double deltaSeconds,
        double cursorX,
        double cursorY,
        IReadOnlyList<FleeBody> candidates,
        double fieldWidth,
        double fieldHeight,
        IReadOnlyList<FleeUnlock>? unlockedByTouch = null)
    {
        var result = new FleeStepResult();

        if (unlockedByTouch is { Count: > 0 })
        {
            foreach (var hit in unlockedByTouch)
            {
                if (_bodies.Count >= MaxBodies)
                    break;
                Add(hit.Body);
            }
        }

        // Obstacles are only collected while we still have room for more bodies. This gate is
        // load-bearing: without it the chain keeps unlocking past the cap.
        var statics = new List<FleeObstacle>();
        if (_bodies.Count < MaxBodies)
        {
            foreach (var candidate in candidates)
            {
                if (IsLoose(candidate.Element) || IsInsideLoose(candidate.Element))
                    continue;
                statics.Add(new FleeObstacle(
                    candidate, candidate.CenterX, candidate.CenterY, candidate.Radius));
                result.Statics.Add(candidate.Element);
            }
        }

        // --- cursor repulsion -------------------------------------------------
        foreach (var body in _bodies)
        {
            var dx = body.CenterX - cursorX;
            var dy = body.CenterY - cursorY;
            var d = Math.Sqrt(dx * dx + dy * dy);
            if (d >= PushRadius)
                continue;

            var ux = d < 0.5 ? 0 : dx / d;
            var uy = d < 0.5 ? 1 : dy / d;
            var a = (1 - d / PushRadius) * PushAcceleration;
            body.Vx += ux * a * deltaSeconds;
            body.Vy += uy * a * deltaSeconds;
        }

        // --- friction + integration ------------------------------------------
        var damp = Math.Exp(-Friction * deltaSeconds);
        foreach (var body in _bodies)
        {
            body.X += body.Vx * deltaSeconds;
            body.Y += body.Vy * deltaSeconds;
            body.Vx *= damp;
            body.Vy *= damp;
        }

        // --- collisions -------------------------------------------------------
        var all = _bodies.ToArray();
        var pending = new List<FleeUnlock>();

        for (var i = 0; i < all.Length; i++)
        {
            var a = all[i];

            // vs. still-attached obstacles
            foreach (var obstacle in statics)
            {
                var dx = obstacle.CenterX - a.CenterX;
                var dy = obstacle.CenterY - a.CenterY;
                var d = Math.Sqrt(dx * dx + dy * dy);
                var minD = a.Radius + obstacle.Radius;
                if (d >= minD)
                    continue;

                var ux = d < 0.5 ? 0 : dx / d;
                var uy = d < 0.5 ? -1 : dy / d;
                var overlap = minD - d;
                a.X -= ux * overlap;
                a.Y -= uy * overlap;

                var vn = a.Vx * ux + a.Vy * uy;
                if (vn <= 0)
                    continue;

                a.Vx -= (1 + Restitution) * vn * ux;
                a.Vy -= (1 + Restitution) * vn * uy;
                if (vn > HitUnlockSpeed)
                    pending.Add(new FleeUnlock(obstacle.Body, ux * vn * 0.7, uy * vn * 0.7));
            }

            // vs. other loose bodies
            for (var j = i + 1; j < all.Length; j++)
            {
                var b = all[j];
                var dx = b.CenterX - a.CenterX;
                var dy = b.CenterY - a.CenterY;
                var d = Math.Sqrt(dx * dx + dy * dy);
                var minD = a.Radius + b.Radius;
                if (d >= minD || d < 0.001)
                    continue;

                var ux = dx / d;
                var uy = dy / d;
                var overlap = minD - d;
                var ma = Math.Max(a.Width * a.Height, 1);
                var mb = Math.Max(b.Width * b.Height, 1);
                var sa = mb / (ma + mb) * overlap;
                var sb = ma / (ma + mb) * overlap;
                a.X -= ux * sa;
                a.Y -= uy * sa;
                b.X += ux * sb;
                b.Y += uy * sb;

                var vn = (b.Vx - a.Vx) * ux + (b.Vy - a.Vy) * uy;
                if (vn >= 0)
                    continue;

                var impulse = -(1 + Restitution) * vn / (1 / ma + 1 / mb);
                a.Vx -= impulse / ma * ux;
                a.Vy -= impulse / ma * uy;
                b.Vx += impulse / mb * ux;
                b.Vy += impulse / mb * uy;
            }
        }

        // Bodies knocked loose by a hard hit join only if there is still room; the element they
        // report is the *obstacle*, and the velocity is the one it was struck with.
        foreach (var hit in pending)
        {
            if (IsLoose(hit.Body.Element)
                || IsInsideLoose(hit.Body.Element)
                || _bodies.Count >= MaxBodies)
            {
                continue;
            }

            Add(hit.Body);
            result.Unlocked.Add(hit);
        }

        // --- keep inside the field -------------------------------------------
        foreach (var body in _bodies)
        {
            var minX = EdgePad - body.Left;
            var maxX = fieldWidth - EdgePad - body.Left - body.Width;
            var minY = EdgePad - body.Top;
            var maxY = fieldHeight - EdgePad - body.Top - body.Height;

            if (body.X < minX)
            {
                body.X = minX;
                if (body.Vx < 0)
                    body.Vx = -body.Vx * Restitution;
            }
            else if (body.X > maxX)
            {
                body.X = maxX;
                if (body.Vx > 0)
                    body.Vx = -body.Vx * Restitution;
            }

            if (body.Y < minY)
            {
                body.Y = minY;
                if (body.Vy < 0)
                    body.Vy = -body.Vy * Restitution;
            }
            else if (body.Y > maxY)
            {
                body.Y = maxY;
                if (body.Vy > 0)
                    body.Vy = -body.Vy * Restitution;
            }
        }

        return result;
    }

    private bool IsInsideLoose(object element)
    {
        foreach (var body in _bodies)
        {
            if (!ReferenceEquals(body.Element, element) && Contains(body.Element, element))
                return true;
        }

        return false;
    }
}
