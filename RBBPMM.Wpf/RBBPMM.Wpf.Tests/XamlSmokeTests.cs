using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Markup;

namespace RBBPMM.Wpf.Tests;

/// <summary>
/// 无需图形界面的 XAML 冒烟测试。
///
/// 主题字典与全局样式只有在窗口打开时才会被 WPF 解析，编译期最多查语法；
/// 这里直接把 .xaml 从源码目录读进来交给 XamlReader，用来兜住：
///   · 主题令牌在 Light/Dark 之间漂移（加了一个忘了另一个）；
///   · 控件样式引用了不存在的 StaticResource；
///   · 文件里残留非法 XML（例如注释里出现 "--"）。
/// </summary>
public class XamlSmokeTests
{
    /// <summary>两个主题都必须提供的令牌——控件里 DynamicResource 引用的全集。</summary>
    private static readonly string[] RequiredThemeTokens =
    [
        "__ThemeTag__",
        "BgBrush", "SurfaceBrush", "SurfaceAltBrush", "BorderBrush",
        "TextBrush", "TextMutedBrush",
        "PrimaryBrush", "PrimaryHoverBrush", "PrimaryTextBrush",
        "DangerBrush", "SuccessBrush", "NavActiveBrush",
        "Radius", "RadiusSm", "RadiusLg", "Pad", "UiFont",
    ];

    private static readonly string[] RequiredControlStyles =
    [
        "BaseButton", "PrimaryButton", "DangerButton", "Card",
    ];

    private static string ThemesDir => Path.Combine(TestFs.AppProjectDir(), "Themes");
    private static string StylesDir => Path.Combine(TestFs.AppProjectDir(), "Styles");

    private static ResourceDictionary LoadDictionary(string path)
    {
        using var stream = File.OpenRead(path);
        var loaded = XamlReader.Load(stream);
        return Assert.IsType<ResourceDictionary>(loaded);
    }

    private static ResourceDictionary LoadTheme(string name)
        => LoadDictionary(Path.Combine(ThemesDir, name + "Theme.xaml"));

    [Fact]
    public void LightTheme_Loads_AndCarriesItsTag()
    {
        var dict = LoadTheme("Light");

        Assert.Equal("Light", dict["__ThemeTag__"]);
    }

    [Fact]
    public void DarkTheme_Loads_AndCarriesItsTag()
    {
        var dict = LoadTheme("Dark");

        Assert.Equal("Dark", dict["__ThemeTag__"]);
    }

    [Theory]
    [InlineData("Light")]
    [InlineData("Dark")]
    public void Theme_HasEveryRequiredToken(string name)
    {
        var keys = LoadTheme(name).Keys.Cast<object>().Select(k => k.ToString()!).ToHashSet();

        var missing = RequiredThemeTokens.Where(k => !keys.Contains(k)).ToArray();

        Assert.True(missing.Length == 0, $"{name}Theme 缺少令牌: {string.Join(", ", missing)}");
    }

    [Fact]
    public void LightAndDark_DefineExactlyTheSameTokens()
    {
        var light = LoadTheme("Light").Keys.Cast<object>().Select(k => k.ToString()!).ToHashSet();
        var dark = LoadTheme("Dark").Keys.Cast<object>().Select(k => k.ToString()!).ToHashSet();

        Assert.True(light.SetEquals(dark),
            "两个主题的令牌不一致。\n" +
            $"  仅 Light 有: {string.Join(", ", light.Except(dark))}\n" +
            $"  仅 Dark 有: {string.Join(", ", dark.Except(light))}");
    }

    [Fact]
    public void ControlsDictionary_Loads_AndDefinesGlobalStyles()
    {
        var dict = LoadDictionary(Path.Combine(StylesDir, "Controls.xaml"));
        var keys = dict.Keys.Cast<object>().Select(k => k.ToString()!).ToHashSet();

        var missing = RequiredControlStyles.Where(k => !keys.Contains(k)).ToArray();

        Assert.True(missing.Length == 0, $"Controls.xaml 缺少样式: {string.Join(", ", missing)}");
    }

    [Fact]
    public void ControlsDictionary_HasNoDanglingLocalStaticResource()
    {
        var path = Path.Combine(StylesDir, "Controls.xaml");
        var dict = LoadDictionary(path);
        var defined = dict.Keys.Cast<object>().Select(k => k.ToString()!).ToHashSet();

        var referenced = Regex
            .Matches(File.ReadAllText(path), @"\{StaticResource\s+([A-Za-z_][A-Za-z0-9_]*)\}")
            .Select(m => m.Groups[1].Value)
            .Distinct()
            .ToArray();

        var dangling = referenced.Where(k => !defined.Contains(k)).ToArray();

        Assert.True(dangling.Length == 0,
            "Controls.xaml 引用了自身未定义的 StaticResource: " + string.Join(", ", dangling));
    }

    [Theory]
    [InlineData("Light")]
    [InlineData("Dark")]
    public void ThemeDictionary_HasNoDanglingLocalStaticResource(string name)
    {
        var path = Path.Combine(ThemesDir, name + "Theme.xaml");
        var dict = LoadDictionary(path);
        var defined = dict.Keys.Cast<object>().Select(k => k.ToString()!).ToHashSet();

        var referenced = Regex
            .Matches(File.ReadAllText(path), @"\{StaticResource\s+([A-Za-z_][A-Za-z0-9_]*)\}")
            .Select(m => m.Groups[1].Value)
            .Distinct()
            .ToArray();

        var dangling = referenced.Where(k => !defined.Contains(k)).ToArray();

        Assert.True(dangling.Length == 0,
            $"{name}Theme.xaml 引用了自身未定义的 StaticResource: " + string.Join(", ", dangling));
    }
}
