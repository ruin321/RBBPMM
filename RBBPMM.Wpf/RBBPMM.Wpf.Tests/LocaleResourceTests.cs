using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RBBPMM.Wpf.Tests;

/// <summary>
/// 语言包守卫测试 —— 替代 Electron 版靠 TypeScript <c>Required&lt;Messages&gt;</c>
/// 在编译期强制「所有语言键必须一致」的机制。
///
/// 三条硬约束：
///   1. 12 份语言包必须同时存在，且键集与 en 完全一致（无缺键 / 无多键）；
///   2. 源码里用到的每个 loc 键（XAML 的 Key=、VM 的 SetTitle/Get）必须已定义；
///   3. 已定义的键必须都被用到（避免资源腐烂）。
/// </summary>
public class LocaleResourceTests
{
    private const string SourceLang = "en";

    private static readonly string[] ExpectedLanguages =
    [
        "en", "zh-CN", "zh-TW", "ja", "ko", "es", "pt", "fr", "de", "ru", "ydyy", "fish",
    ];

    // 资源文件里的键前缀白名单，用于从源码中筛出「疑似 loc 键」的字面量
    private static readonly string[] KeyPrefixes =
    [
        "app", "nav", "page", "shell", "settings", "theme", "mods", "textures", "levels", "gamebanana",
        // Phase 5 功能页新增的命名空间
        "common", "game", "status", "banana",
    ];

    private static string ResourcesDir => TestFs.ResourcesDir();

    private static Dictionary<string, string> LoadLang(string lang)
        => JsonSerializer.Deserialize<Dictionary<string, string>>(
               File.ReadAllText(Path.Combine(ResourcesDir, lang + ".json")))
           ?? new Dictionary<string, string>();

    private static string[] EnKeys => LoadLang(SourceLang).Keys.OrderBy(k => k).ToArray();

    [Fact]
    public void AllExpectedLanguageFilesExist()
    {
        var actual = Directory.GetFiles(ResourcesDir, "*.json")
            .Select(Path.GetFileNameWithoutExtension)
            .OrderBy(x => x)
            .ToArray();

        Assert.Equal(ExpectedLanguages.OrderBy(x => x), actual);
    }

    [Theory]
    [InlineData("zh-CN")]
    [InlineData("zh-TW")]
    [InlineData("ja")]
    [InlineData("ko")]
    [InlineData("es")]
    [InlineData("pt")]
    [InlineData("fr")]
    [InlineData("de")]
    [InlineData("ru")]
    [InlineData("ydyy")]
    [InlineData("fish")]
    public void EveryLanguageHasExactlyTheSameKeysAsEnglish(string lang)
    {
        var en = LoadLang(SourceLang);
        var other = LoadLang(lang);

        var missing = en.Keys.Except(other.Keys).OrderBy(k => k).ToArray();
        var extra = other.Keys.Except(en.Keys).OrderBy(k => k).ToArray();

        Assert.True(missing.Length == 0, $"{lang} 缺键: {string.Join(", ", missing)}");
        Assert.True(extra.Length == 0, $"{lang} 多键: {string.Join(", ", extra)}");
    }

    [Theory]
    [InlineData("en")]
    [InlineData("zh-CN")]
    [InlineData("zh-TW")]
    [InlineData("ja")]
    [InlineData("ko")]
    [InlineData("es")]
    [InlineData("pt")]
    [InlineData("fr")]
    [InlineData("de")]
    [InlineData("ru")]
    [InlineData("ydyy")]
    public void NoLanguageHasBlankTranslations(string lang)
    {
        var blanks = LoadLang(lang)
            .Where(kv => string.IsNullOrWhiteSpace(kv.Value))
            .Select(kv => kv.Key)
            .ToArray();

        Assert.True(blanks.Length == 0, $"{lang} 存在空译文: {string.Join(", ", blanks)}");
    }

    [Fact]
    public void FishLanguage_IsAllFISH_AsInElectron()
    {
        // Electron: Object.fromEntries(Object.keys(en).map(k => [k, 'FISH']))
        Assert.All(LoadLang("fish"), kv => Assert.Equal("FISH", kv.Value));
    }

    [Fact]
    public void LanguageCodesInSettingsViewModel_MatchShippedResources()
    {
        // 设置页下拉里的语言（fish 是彩蛋，不出现在下拉里）
        var dropdown = new RBBPMM.ViewModels.SettingsPageViewModel(
                new RBBPMM.Services.UserSettings(),
                new RBBPMM.Services.ThemeManager(new System.Windows.ResourceDictionary()))
            .Languages.Select(l => l.Code).ToArray();

        var shipped = ExpectedLanguages.Where(x => x != "fish").ToArray();

        Assert.Equal(shipped.OrderBy(x => x), dropdown.OrderBy(x => x));
    }

    [Fact]
    public void EveryKeyUsedInSource_IsDefined()
    {
        var defined = EnKeys.ToHashSet();
        var used = CollectUsedKeys();

        var unknown = used.Keys.Where(k => !defined.Contains(k)).OrderBy(k => k).ToArray();

        Assert.True(unknown.Length == 0,
            "源码引用了未定义的 loc 键:\n" +
            string.Join("\n", unknown.Select(k => $"  {k}  <- {string.Join(", ", used[k])}")));
    }

    [Fact]
    public void EveryDefinedKey_IsUsedInSource()
    {
        var used = CollectUsedKeys().Keys.ToHashSet();
        var unused = EnKeys.Where(k => !used.Contains(k)).ToArray();

        Assert.True(unused.Length == 0,
            "语言包中定义了但源码未使用的键（资源腐烂）:\n  " + string.Join("\n  ", unused));
    }

    // ------------------------------------------------------------------
    // 扫描：XAML 的 {loc:Loc Key=xxx} + C# 里的 dotted-lowercase 字符串字面量
    // ------------------------------------------------------------------
    private static Dictionary<string, List<string>> CollectUsedKeys()
    {
        var appDir = TestFs.AppProjectDir();
        var found = new Dictionary<string, List<string>>();

        void Add(string key, string where)
        {
            if (!found.TryGetValue(key, out var list))
                found[key] = list = [];
            if (!list.Contains(where))
                list.Add(where);
        }

        // 只扫手写源码，跳过 obj/ 与 bin/ 里的生成文件
        static IEnumerable<string> Sources(string dir, string pattern)
            => Directory.EnumerateFiles(dir, pattern, SearchOption.AllDirectories)
                .Where(p => !p.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")
                         && !p.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"));

        // 1) XAML: Key=app.title
        foreach (var file in Sources(appDir, "*.xaml"))
        {
            var rel = Path.GetFileName(file);
            foreach (Match m in Regex.Matches(File.ReadAllText(file), @"Key=([A-Za-z][A-Za-z0-9_.]*)"))
                Add(m.Groups[1].Value, rel);
        }

        // 2) C#: "nav.mods" / "page.mods.title" / "settings.theme.toLight" 等
        var literal = new Regex("\"([A-Za-z][A-Za-z0-9]*(?:\\.[A-Za-z0-9]+)+)\"");
        foreach (var file in Sources(appDir, "*.cs"))
        {
            var text = File.ReadAllText(file);
            foreach (Match m in literal.Matches(text))
            {
                var candidate = m.Groups[1].Value;
                if (candidate.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                    continue; // 文件名，不是 loc 键
                if (!KeyPrefixes.Contains(candidate.Split('.')[0]))
                    continue;

                Add(candidate, Path.GetFileName(file));
            }
        }

        return found;
    }
}
