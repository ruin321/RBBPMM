namespace RBBPMM.Core.Tests;

public class PathGuardTests
{
    [Fact]
    public void IsInside_TrueForChild_FalseForRootItself()
    {
        var root = TestHelpers.Tmp("pg");
        var child = Path.Combine(root, "sub");
        Assert.True(PathGuard.IsInside(root, child));
        Assert.False(PathGuard.IsInside(root, root));
        Assert.False(PathGuard.IsInside(root, Path.GetFullPath("C:/elsewhere")));
    }

    [Fact]
    public void SearchAbsolutePath_ThrowsOnEscape()
    {
        var root = TestHelpers.Tmp("pg2");
        Assert.Throws<InvalidOperationException>(() => PathGuard.SearchAbsolutePath(root, "..", "evil.txt"));
        var ok = PathGuard.SearchAbsolutePath(root, "a", "b.txt");
        Assert.True(PathGuard.IsInside(root, ok));
    }

    [Fact]
    public void SafeZipEntryPath_RejectsTraversalAndAbsolute()
    {
        var root = TestHelpers.Tmp("pg3");
        Assert.Throws<InvalidOperationException>(() => PathGuard.SafeZipEntryPath(root, "../escape.txt"));
        Assert.Throws<InvalidOperationException>(() => PathGuard.SafeZipEntryPath(root, "a/../../escape.txt"));
        Assert.Throws<InvalidOperationException>(() => PathGuard.SafeZipEntryPath(root, "C:/windows/evil.txt"));
        Assert.Throws<InvalidOperationException>(() => PathGuard.SafeZipEntryPath(root, "/abs.txt"));
        var ok = PathGuard.SafeZipEntryPath(root, "a/b.txt");
        Assert.True(PathGuard.IsInside(root, ok));
    }

    [Fact]
    public void IsPathSafetyValid_WrapsException()
    {
        var root = TestHelpers.Tmp("pg4");
        Assert.False(PathGuard.IsPathSafetyValid(root, "..", "x"));
        Assert.True(PathGuard.IsPathSafetyValid(root, "ok"));
    }
}
