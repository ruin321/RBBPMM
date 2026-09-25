using System.IO;
using System.Xml.Linq;
using RBBPMM.Core;

namespace RBBPMM.Wpf.Tests;

/// <summary>
/// 打包配置守卫。
///
/// 运行时依赖（7z、BepInEx 包）与图标、版本号只活在 csproj 里，没有任何编译期引用指向它们 ——
/// 被误删的话编译、测试全绿，装 BepInEx 或装 rar 包时才在用户机器上炸。所以在这里把
/// 「必须随包发布」这件事钉住。
/// </summary>
public class PackagingTests
{
    private static XDocument Project()
        => XDocument.Load(Path.Combine(TestFs.AppProjectDir(), "RBBPMM.csproj"));

    /// <summary>按元素名匹配，忽略命名空间 —— SDK 风格工程通常不声明 xmlns。</summary>
    private static IEnumerable<XElement> Elements(XContainer doc, string localName)
        => doc.Descendants().Where(e => e.Name.LocalName == localName);

    /// <summary>归属到输出/发布目录的 Content 项，按 Link（落点）索引。</summary>
    private static Dictionary<string, XElement> ShippedContent()
    {
        var shipped = new Dictionary<string, XElement>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in Elements(Project(), "Content"))
        {
            var link = (string?)item.Attribute("Link") ?? (string?)item.Attribute("Include") ?? "";
            if (link.Length > 0)
                shipped[link.Replace('\\', '/')] = item;
        }

        return shipped;
    }

    /// <summary>项目文件里所有 PropertyGroup 的键值（后者覆盖前者）。</summary>
    private static Dictionary<string, string> Properties()
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var group in Elements(Project(), "PropertyGroup"))
            foreach (var property in group.Elements())
                values[property.Name.LocalName] = property.Value;

        return values;
    }

    [Theory]
    // 落点必须和 Core 里 ResolveSevenZip / ResolveBepInExArchive 的默认查找路径一致
    [InlineData("7z/7z.exe")]
    [InlineData("7z/7z.dll")]
    [InlineData("BepInEx.zip")]
    public void RuntimeDependency_IsPublishedNextToTheExecutable(string link)
    {
        var shipped = ShippedContent();

        Assert.True(shipped.ContainsKey(link),
            $"csproj 没有把 {link} 作为 Content 发布；装 BepInEx / 装 rar 包会在运行时失败。" +
            $"\n当前声明的落点：{string.Join(", ", shipped.Keys.Order())}");

        var item = shipped[link];
        Assert.Equal("PreserveNewest", (string?)item.Attribute("CopyToOutputDirectory"));
        Assert.Equal("PreserveNewest", (string?)item.Attribute("CopyToPublishDirectory"));
    }

    [Fact]
    public void RuntimeDependency_FilesExistOnDisk()
    {
        // TestFs.RepoRoot() 是含 RBBPMM.slnx 的目录，也就是 RBBPMM.Wpf/ 本身
        var resources = Path.Combine(TestFs.RepoRoot(), "resources");

        foreach (var rel in new[] { "7z/7z.exe", "7z/7z.dll", "BepInEx.zip" })
        {
            var path = Path.Combine(resources, rel.Replace('/', Path.DirectorySeparatorChar));
            Assert.True(File.Exists(path), $"打包源文件不存在：{path}");
        }
    }

    /// <summary>
    /// 把「csproj 声明的落点」和「Core 实际去哪找」绑在一起。上一条只证明文件在磁盘上；
    /// 这一条证明它真的落到了 Core 会看的位置 —— 两边任何一边改了名字或路径，这里立刻红。
    /// </summary>
    [Fact]
    public void Core_ResolvesTheRuntimeDependencies_FromItsBaseDirectory()
    {
        var sevenZip = ModArchiveExtractor.ResolveSevenZip();

        Assert.True(File.Exists(sevenZip),
            $"Core 解析出的 7z 不存在：{sevenZip}（说明打包落点和查找路径对不上）");
        Assert.StartsWith(
            AppContext.BaseDirectory, sevenZip, StringComparison.OrdinalIgnoreCase);

        var bepinex = BepInExSetup.ResolveBepInExArchive();
        Assert.NotNull(bepinex);
        Assert.StartsWith(AppContext.BaseDirectory, bepinex, StringComparison.OrdinalIgnoreCase);

        // 「存在但不是个能用的包」同样会让用户在装 BepInEx 时炸，所以顺手验一下是 zip
        using var zip = System.IO.Compression.ZipFile.OpenRead(bepinex!);
        Assert.NotEmpty(zip.Entries);
    }

    [Fact]
    public void LanguageResources_ArePublished()
    {
        var shipped = ShippedContent();
        Assert.Contains("Resources/*.json", shipped.Keys);

        var files = Directory.EnumerateFiles(TestFs.ResourcesDir(), "*.json")
            .Select(Path.GetFileNameWithoutExtension)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var code in new[]
                 {
                     "en", "zh-CN", "zh-TW", "ja", "ko", "es",
                     "pt", "fr", "de", "ru", "ydyy", "fish",
                 })
        {
            Assert.Contains(code, files);
        }
    }

    [Fact]
    public void ExecutableMetadata_IsSet()
    {
        var property = Properties();

        Assert.Equal("Assets\\apps.ico", property["ApplicationIcon"]);
        Assert.True(File.Exists(Path.Combine(TestFs.AppProjectDir(), "Assets", "apps.ico")));

        // 版本要和 Electron 版对齐，否则两个壳子发出来的包版本号会对不上
        Assert.Equal("0.1.4", property["Version"]);
        Assert.Equal("RBBPMM", property["AssemblyTitle"]);
    }

    [Fact]
    public void EasterEggAsset_IsEmbeddedNotJustCopied()
    {
        // gif 走 Resource（打进程序集）而不是 Content：突脸要能在任何工作目录下放出来
        var embedded = Elements(Project(), "Resource")
            .Select(e => ((string?)e.Attribute("Include") ?? "").Replace('\\', '/'))
            .ToList();

        Assert.Contains("Assets/*.gif", embedded);

        var shipped = ShippedContent();
        Assert.DoesNotContain("Assets/scare-703263.gif", shipped.Keys);
    }

    private static string PublishScript()
        => Path.Combine(TestFs.RepoRoot(), "build", "publish.ps1");

    /// <summary>
    /// 发布脚本必须是「UTF-8 带 BOM」。
    ///
    /// Windows PowerShell 5.1 读无 BOM 的脚本会按系统 ANSI 代码页解码。中文注释被拆成
    /// 乱码后，某个字节会吃掉后面的引号/括号，PowerShell 判成语法错误 —— 而它的表现是
    /// 「脚本一句输出都没有就退出」，非常难查（这个坑真的踩过一次）。
    /// </summary>
    [Fact]
    public void PublishScript_HasUtf8Bom_SoPowerShell51ReadsItCorrectly()
    {
        var path = PublishScript();
        Assert.True(File.Exists(path), $"发布脚本不存在：{path}");

        var head = File.ReadAllBytes(path).Take(3).ToArray();

        Assert.True(head.Length == 3 && head[0] == 0xEF && head[1] == 0xBB && head[2] == 0xBF,
            "build/publish.ps1 缺少 UTF-8 BOM。Windows PowerShell 5.1 会把无 BOM 的文件按 " +
            "ANSI 解码，中文注释会拆坏脚本的语法，症状是脚本零输出直接退出。" +
            "用 `printf '\\xEF\\xBB\\xBF' | cat - file > tmp && mv tmp file` 补上。");
    }

    /// <summary>
    /// 脚本要用 Write-Output，不用 Write-Host。
    /// Write-Host 在 PS 5.1 里写的是宿主而不是成功流，`*>&1`、`Out-File`、`Tee-Object`
    /// 全都捕获不到 —— 上面那个 BOM 坑之所以难查，一半原因是日志文件是空的。
    /// </summary>
    [Fact]
    public void PublishScript_UsesWriteOutput_SoItsLogCanBeCaptured()
    {
        var text = File.ReadAllText(PublishScript());
        var lines = text.Split('\n');

        var stray = lines
            .Select((line, index) => (line: line.Trim(), number: index + 1))
            .Where(t => t.line.StartsWith("Write-Host", StringComparison.OrdinalIgnoreCase))
            .Select(t => t.number)
            .ToList();

        Assert.True(stray.Count == 0,
            "build/publish.ps1 里还有 Write-Host（行 " + string.Join(", ", stray) +
            "）。PS 5.1 的 Write-Host 无法被重定向/落盘，出问题时留不下日志；改用 Write-Output。");
    }
}
