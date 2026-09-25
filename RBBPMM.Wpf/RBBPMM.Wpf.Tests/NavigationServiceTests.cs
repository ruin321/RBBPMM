using RBBPMM.Navigation;
using RBBPMM.ViewModels;

namespace RBBPMM.Wpf.Tests;

public class NavigationServiceTests
{
    [Fact]
    public void Register_ThenNavigate_SetsCurrentPageAndKey()
    {
        var nav = new NavigationService();
        nav.Register("mods", () => new ModsPageViewModel());

        var ok = nav.Navigate("mods");

        Assert.True(ok);
        Assert.Equal("mods", nav.CurrentKey);
        Assert.IsType<ModsPageViewModel>(nav.CurrentPage);
    }

    [Fact]
    public void Navigate_UnknownKey_ReturnsFalseAndLeavesState()
    {
        var nav = new NavigationService();
        nav.Register("mods", () => new ModsPageViewModel());
        nav.Navigate("mods");

        var ok = nav.Navigate("nope");

        Assert.False(ok);
        Assert.Equal("mods", nav.CurrentKey);
        Assert.IsType<ModsPageViewModel>(nav.CurrentPage);
    }

    [Fact]
    public void Navigate_ReplacesCurrentPage()
    {
        var nav = new NavigationService();
        nav.Register("a", () => new ModsPageViewModel());
        nav.Register("b", () => new TexturesPageViewModel());

        nav.Navigate("a");
        nav.Navigate("b");

        Assert.Equal("b", nav.CurrentKey);
        Assert.IsType<TexturesPageViewModel>(nav.CurrentPage);
    }

    [Fact]
    public void Contains_ReflectsRegistrations()
    {
        var nav = new NavigationService();
        nav.Register("mods", () => new ModsPageViewModel());

        Assert.True(nav.Contains("mods"));
        Assert.False(nav.Contains("settings"));
        Assert.Contains("mods", nav.Keys);
    }
}
