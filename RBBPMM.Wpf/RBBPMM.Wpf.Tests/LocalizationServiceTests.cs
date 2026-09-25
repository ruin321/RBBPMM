using System.Collections.Generic;
using System.IO;
using RBBPMM.Services;

namespace RBBPMM.Wpf.Tests;

public class LocalizationServiceTests
{
    private static LocalizationService NewService() => new();

    [Fact]
    public void Get_ReturnsValueForCurrentLanguage()
    {
        var loc = NewService();
        loc.Load("en", new Dictionary<string, string> { ["greet"] = "Hello" });
        loc.Load("zh-CN", new Dictionary<string, string> { ["greet"] = "你好" });

        loc.Language = "zh-CN";
        Assert.Equal("你好", loc.Get("greet"));

        loc.Language = "en";
        Assert.Equal("Hello", loc.Get("greet"));
    }

    [Fact]
    public void Get_FallsBackToEnglish_WhenKeyMissingInCurrentLanguage()
    {
        var loc = NewService();
        loc.Load("en", new Dictionary<string, string> { ["only.en"] = "EN only" });
        loc.Load("fr", new Dictionary<string, string>());

        loc.Language = "fr";

        Assert.Equal("EN only", loc.Get("only.en"));
    }

    [Fact]
    public void Get_FallsBackToKeyName_WhenMissingEverywhere()
    {
        var loc = NewService();
        loc.Load("en", new Dictionary<string, string>());

        loc.Language = "en";

        Assert.Equal("missing.key", loc.Get("missing.key"));
    }

    [Fact]
    public void Get_TreatsEmptyStringAsMissing()
    {
        var loc = NewService();
        loc.Load("en", new Dictionary<string, string> { ["k"] = "EN" });
        loc.Load("de", new Dictionary<string, string> { ["k"] = "" });

        loc.Language = "de";

        Assert.Equal("EN", loc.Get("k"));
    }

    [Fact]
    public void Language_IsCaseInsensitive()
    {
        var loc = NewService();
        loc.Load("zh-CN", new Dictionary<string, string> { ["k"] = "中文" });

        loc.Language = "ZH-cn";

        Assert.Equal("中文", loc.Get("k"));
    }

    [Fact]
    public void SettingSameLanguage_DoesNotRaiseCultureChanged()
    {
        var loc = NewService();
        loc.Language = "en";

        var fired = 0;
        loc.CultureChanged += (_, _) => fired++;

        loc.Language = "en";
        Assert.Equal(0, fired);

        loc.Language = "ja";
        Assert.Equal(1, fired);
    }

    [Fact]
    public void CultureChanged_AlsoRaisesPropertyChangedForItemIndexer()
    {
        var loc = NewService();
        loc.Language = "en";

        var props = new List<string?>();
        loc.PropertyChanged += (_, e) => props.Add(e.PropertyName);

        loc.Language = "de";

        Assert.Contains("Item[]", props);
    }

    [Fact]
    public void LoadFromJson_ParsesDictionary()
    {
        var loc = NewService();
        loc.LoadFromJson("en", """{"a":"A","b":"B"}""");

        loc.Language = "en";

        Assert.Equal("A", loc.Get("a"));
        Assert.Equal("B", loc.Get("b"));
    }

    [Fact]
    public void LoadFromJson_InvalidJson_DoesNotThrow()
    {
        var loc = NewService();

        // \u975e\u6cd5 JSON \u4e0d\u5e94\u5d29\u6e83\uff0c\u800c\u662f\u5f97\u5230\u7a7a\u5b57\u5178
        loc.LoadFromJson("en", "{ this is not json");

        loc.Language = "en";

        Assert.Equal("a", loc.Get("a"));
    }

    [Fact]
    public void LoadFromDirectory_ReadsEachJsonByFileName()
    {
        var dir = TestFs.TempDir();
        try
        {
            File.WriteAllText(Path.Combine(dir, "en.json"), """{"k":"Hello"}""", System.Text.Encoding.UTF8);
            File.WriteAllText(Path.Combine(dir, "ja.json"), """{"k":"こんにちは"}""", System.Text.Encoding.UTF8);

            var loc = NewService();
            loc.LoadFromDirectory(dir);

            Assert.Equal("Hello", loc.Get("k"));
            loc.Language = "ja";
            Assert.Equal("こんにちは", loc.Get("k"));
            Assert.Contains("en", loc.AvailableLanguages);
            Assert.Contains("ja", loc.AvailableLanguages);
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    [Fact]
    public void LoadFromDirectory_MissingDirectory_IsNoOp()
    {
        var loc = NewService();

        loc.LoadFromDirectory(Path.Combine(Path.GetTempPath(), "rbbpmm-does-not-exist-" + Guid.NewGuid()));

        Assert.Empty(loc.AvailableLanguages);
    }
}
