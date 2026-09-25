using RBBPMM.Core;

namespace RBBPMM.Core.Tests;

/// <summary>
/// 把 RunawayButtons 的物理忠实搬过来之后，这些用例负责锁住它的行为。
///
/// 这里刻意不碰任何 UI 类型：物理层只认「矩形的中心/半径」，所以能在无桌面环境里
/// 逐帧驱动。原始实现里两个最难查的坑都在下面有专门的用例。
/// </summary>
public class FleeEngineTests
{
    private const double Dt = 1.0 / 60.0;

    private static FleeBody Body(
        object element, double left, double top, double w = 100, double h = 40, double vx = 0, double vy = 0)
    {
        var body = new FleeBody
        {
            Element = element,
            Id = element is string s ? s : "?",
            Left = left,
            Top = top,
            Width = w,
            Height = h,
        };
        body.Vx = vx;
        body.Vy = vy;
        return body;
    }

    // ------------------------------------------------------------------ 纯函数

    [Theory]
    [InlineData(100, 40, 1000 * 600, true)]     // 正常尺寸
    [InlineData(11, 40, 1000 * 600, false)]     // 太窄
    [InlineData(100, 7, 1000 * 600, false)]     // 太矮
    [InlineData(900, 600, 1000 * 600, false)]   // 超过场地一半面积（整页容器，不能松脱）
    public void IsEligible_AppliesMinSizeAndAreaGate(double w, double h, double fieldArea, bool expected)
        => Assert.Equal(expected, FleeEngine.IsEligible(w, h, fieldArea));

    [Fact]
    public void DistanceToRect_IsZeroInsideAndMeasuresOutside()
    {
        // rect: 100,100 → 200,150
        Assert.Equal(0, FleeEngine.DistanceToRect(150, 120, 100, 100, 200, 150), 3);
        Assert.Equal(10, FleeEngine.DistanceToRect(90, 120, 100, 100, 200, 150), 3);
        Assert.Equal(5, FleeEngine.DistanceToRect(150, 155, 100, 100, 200, 150), 3);
        Assert.Equal(Math.Sqrt(50 * 50 + 50 * 50),
            FleeEngine.DistanceToRect(50, 50, 100, 100, 200, 150), 3);
    }

    [Fact]
    public void ClampDelta_CapsTheIntegrationStep()
    {
        Assert.Equal(FleeEngine.MaxDeltaSeconds, FleeEngine.ClampDelta(5), 6);
        Assert.Equal(Dt, FleeEngine.ClampDelta(Dt), 6);
    }

    // ------------------------------------------------------------------ 触碰解锁

    [Fact]
    public void TryTouchUnlock_KicksAwayFromTheCursor()
    {
        var engine = new FleeEngine();
        // 光标在方块正左方 10px（在 TOUCH_RADIUS 内）
        var candidate = Body("a", left: 200, top: 200);

        var hits = engine.TryTouchUnlock(180, 220, [candidate]);

        var hit = Assert.Single(hits);
        Assert.Same(candidate, hit.Body);
        Assert.Equal(FleeEngine.Kick > 0, hit.Vx > 0);   // 向右被踢开
        Assert.Equal(0, hit.Vy, 3);
    }

    [Fact]
    public void TryTouchUnlock_IgnoresCandidatesBeyondTheTouchRadius()
    {
        var engine = new FleeEngine();
        var candidate = Body("a", left: 200, top: 200);

        // 距离 100px，远大于 TOUCH_RADIUS(28)
        Assert.Empty(engine.TryTouchUnlock(100, 220, [candidate]));
    }

    [Fact]
    public void TryTouchUnlock_IgnoresTinyElements()
    {
        var engine = new FleeEngine();
        var tiny = Body("tiny", left: 200, top: 200, w: 5, h: 5);

        Assert.Empty(engine.TryTouchUnlock(200, 220, [tiny]));
    }

    [Fact]
    public void TryTouchUnlock_DoesNotReturnAlreadyLooseBodies()
    {
        var engine = new FleeEngine();
        var candidate = Body("a", left: 200, top: 200);
        engine.Add(candidate);

        Assert.Empty(engine.TryTouchUnlock(180, 220, [candidate]));
    }

    // ------------------------------------------------------------------ 指针推斥 / 摩擦

    [Fact]
    public void Step_PushesBodiesAwayFromTheCursorWithinThePushRadius()
    {
        var engine = new FleeEngine();
        var body = Body("a", left: 300, top: 300);
        engine.Add(body);

        // 光标在方块中心左侧 40px → 应获得向右的速度
        engine.Step(Dt, 290, 320, [], 1000, 600);

        Assert.True(body.Vx > 0, $"期望被推开，实际 Vx={body.Vx}");
        Assert.Equal(0, body.Vy, 3);
    }

    [Fact]
    public void Step_LeavesBodiesAloneBeyondThePushRadius()
    {
        var engine = new FleeEngine();
        var body = Body("a", left: 300, top: 300);
        engine.Add(body);

        engine.Step(Dt, 0, 0, [], 1000, 600);   // 远超 PUSH_RADIUS

        Assert.Equal(0, body.Vx, 6);
        Assert.Equal(0, body.Vy, 6);
        Assert.Equal(0, body.X, 6);
    }

    [Fact]
    public void Step_FrictionDecaysVelocityOverTime()
    {
        var engine = new FleeEngine();
        var body = Body("a", left: 400, top: 300, vx: 300);
        engine.Add(body);

        // 摩擦系数是 3.2/秒，1 秒只掉到 ~20%（300 → 60）。跑到 2 秒才看得出来。
        for (var i = 0; i < 120; i++)
            engine.Step(Dt, 0, 0, [], 4000, 4000);

        Assert.True(Math.Abs(body.Vx) < 1, $"速度应被摩擦吃掉，实际 Vx={body.Vx}");
    }

    // ------------------------------------------------------------------ 边界反弹

    [Fact]
    public void Step_BouncesOffTheFieldEdgeWithRestitution()
    {
        var engine = new FleeEngine();
        var body = Body("a", left: 0, top: 0, w: 100, h: 50, vx: 10_000);
        engine.Add(body);

        engine.Step(Dt, 0, 0, [], fieldWidth: 200, fieldHeight: 600);

        // maxX = 200 - EDGE_PAD(4) - 0 - 100 = 96
        Assert.Equal(96, body.X, 3);
        Assert.True(body.Vx < 0, $"撞右边界后应反向，实际 Vx={body.Vx}");
    }

    [Fact]
    public void Step_ClampsVerticalPositionToo()
    {
        var engine = new FleeEngine();
        var body = Body("a", left: 200, top: 0, w: 100, h: 50, vy: -10_000);
        engine.Add(body);

        engine.Step(Dt, 0, 0, [], fieldWidth: 600, fieldHeight: 400);

        // minY = EDGE_PAD(4) - 0 = 4
        Assert.Equal(4, body.Y, 3);
        Assert.True(body.Vy > 0, $"撞上边界后应向下反弹，实际 Vy={body.Vy}");
    }

    // ------------------------------------------------------------------ 碰撞连锁解锁

    [Fact]
    public void Step_UnlocksAnObstacleHitHardEnough()
    {
        var engine = new FleeEngine();
        var obstacleElement = new object();
        var obstacle = Body(obstacleElement, left: 165, top: 100);

        var moving = Body("moving", left: 100, top: 100, vx: 200);
        engine.Add(moving);

        var result = engine.Step(Dt, 0, 0, [obstacle], 2000, 2000);

        var unlocked = Assert.Single(result.Unlocked);
        Assert.Same(obstacleElement, unlocked.Body.Element);
        Assert.True(unlocked.Vx > 0, "被撞飞的障碍物应沿撞击方向飞出");
        Assert.True(engine.IsLoose(obstacleElement));
    }

    [Fact]
    public void Step_DoesNotUnlockOnAGentleTouch()
    {
        var engine = new FleeEngine();
        var obstacle = Body("obstacle", left: 165, top: 100);

        // 速度远低于 HIT_UNLOCK_SPEED(80)
        var moving = Body("moving", left: 100, top: 100, vx: 10);
        engine.Add(moving);

        var result = engine.Step(Dt, 0, 0, [obstacle], 2000, 2000);

        Assert.Empty(result.Unlocked);
        Assert.False(engine.IsLoose(obstacle.Element));
    }

    /// <summary>
    /// 回归用例：statics 只在「未达上限」时收集。这个条件写反的话不会报错——
    /// 只是碰撞链静默失效，画面上完全看不出来。原有实现踩过这个坑。
    /// </summary>
    [Fact]
    public void Step_StopsCollectingObstaclesOnceAtTheBodyCap()
    {
        var engine = new FleeEngine();
        for (var i = 0; i < FleeEngine.MaxBodies; i++)
            engine.Add(Body($"filler{i}", left: i * 3, top: 0, w: 2, h: 2));

        Assert.Equal(FleeEngine.MaxBodies, engine.Count);

        var result = engine.Step(Dt, 0, 0, [Body("obstacle", 500, 500)], 2000, 2000);

        Assert.Empty(result.Statics);
        Assert.Empty(result.Unlocked);
    }

    [Fact]
    public void Step_CollectsObstaclesWhileBelowTheCap()
    {
        var engine = new FleeEngine();
        var obstacle = Body("obstacle", left: 500, top: 500);

        var result = engine.Step(Dt, 0, 0, [obstacle], 2000, 2000);

        Assert.Single(result.Statics);
        Assert.Same(obstacle.Element, result.Statics[0]);
    }

    [Fact]
    public void Step_NeverExceedsTheBodyCap()
    {
        var engine = new FleeEngine();
        // 一堆重叠候选，全部满足触碰条件
        var candidates = new List<FleeBody>();
        for (var i = 0; i < FleeEngine.MaxBodies + 50; i++)
            candidates.Add(Body($"c{i}", left: 300 + i % 3, top: 300, w: 20, h: 20));

        for (var frame = 0; frame < 20; frame++)
        {
            var hits = engine.TryTouchUnlock(300, 310, candidates);
            engine.Step(Dt, 300, 310, candidates, 2000, 2000, hits);
        }

        Assert.True(engine.Count <= FleeEngine.MaxBodies, $"实际 {engine.Count}");
    }

    // ------------------------------------------------------------------ 祖先屏蔽

    [Fact]
    public void Step_SkipsElementsRidingInsideALooseBody()
    {
        var engine = new FleeEngine();
        var parent = new object();
        var child = new object();
        engine.Contains = (container, node) => ReferenceEquals(container, parent) && ReferenceEquals(node, child);

        engine.Add(Body(parent, left: 100, top: 100, w: 200, h: 100));
        var childBody = Body(child, left: 120, top: 120, w: 40, h: 20);

        var result = engine.Step(Dt, 0, 0, [childBody], 2000, 2000);

        Assert.Empty(result.Statics);
        Assert.Empty(result.Unlocked);
        Assert.False(engine.IsLoose(child));
    }

    [Fact]
    public void TryTouchUnlock_SkipsElementsRidingInsideALooseBody()
    {
        var engine = new FleeEngine();
        var parent = new object();
        var child = new object();
        engine.Contains = (container, node) => ReferenceEquals(container, parent) && ReferenceEquals(node, child);

        engine.Add(Body(parent, left: 100, top: 100, w: 200, h: 100));
        var childBody = Body(child, left: 120, top: 120, w: 40, h: 20);

        Assert.Empty(engine.TryTouchUnlock(100, 130, [childBody]));
    }

    // ------------------------------------------------------------------ 复位

    [Fact]
    public void Clear_ReleasesEverything()
    {
        var engine = new FleeEngine();
        engine.Add(Body("a", 0, 0));
        engine.Add(Body("b", 0, 0));

        engine.Clear();

        Assert.Equal(0, engine.Count);
        Assert.Empty(engine.Bodies);
    }

    /// <summary>
    /// 顺序用例：触碰解锁应发生在推斥/积分之前，否则第一帧的踢飞会被推斥抵消。
    /// </summary>
    [Fact]
    public void Step_AppliesTouchUnlocksBeforeIntegration()
    {
        var engine = new FleeEngine();
        var candidate = Body("a", left: 300, top: 300);
        var hits = engine.TryTouchUnlock(280, 320, [candidate]);

        engine.Step(Dt, 280, 320, [candidate], 2000, 2000, hits);

        Assert.True(engine.IsLoose(candidate.Element));
        // 踢飞向右 + 推斥也向右 → 净位移为正
        Assert.True(candidate.X > 0, $"实际 X={candidate.X}");
    }
}
