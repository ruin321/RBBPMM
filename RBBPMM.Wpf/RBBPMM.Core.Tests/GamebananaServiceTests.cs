using System.Net;
using System.Text;
using System.Text.Json.Nodes;

namespace RBBPMM.Core.Tests;

public class GamebananaServiceTests
{
    private sealed class FakeHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _respond;
        public FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) => _respond = respond;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            => Task.FromResult(_respond(request));
    }

    [Theory]
    [InlineData("https://gamebanana.com/mods/12345", 12345)]
    [InlineData("https://gamebanana.com/mods/00042", 42)]
    [InlineData("https://gamebanana.com/mods/1/details", 1)]
    [InlineData("https://gamebanana.com/linkfilter?url=https://gamebanana.com/mods/777", 777)]
    [InlineData("https://gamebanana.com/wip/9", 9)]
    public void ExtractGamebananaId_ParsesVariousUrls(string url, int expected)
        => Assert.Equal(expected, GamebananaService.ExtractGamebananaId(url));

    [Fact]
    public void ExtractGamebananaId_ReturnsNullForGarbage()
        => Assert.Null(GamebananaService.ExtractGamebananaId("https://example.com/foo"));

    [Fact]
    public void ResolveLink_UnwrapsLinkfilter()
        => Assert.Equal("https://gamebanana.com/mods/555",
            GamebananaService.ResolveLink("https://gamebanana.com/linkfilter?url=https://gamebanana.com/mods/555"));

    [Fact]
    public void AbsoluteUrl_PrefixesSiteBase()
        => Assert.Equal("https://gamebanana.com/dl/x", GamebananaService.AbsoluteUrl("/dl/x"));

    [Theory]
    [InlineData("Some Mod (1.2.3)", "1.2.3")]
    [InlineData("No version here", null)]
    [InlineData("Build (v9)", "v9")]
    public void ParseFileVersion_ExtractsTrailingParen(string desc, string? expected)
        => Assert.Equal(expected, GamebananaService.ParseFileVersion(desc));

    [Fact]
    public void ParseFiles_RequiresDownloadUrl()
    {
        var node = JsonNode.Parse("""[{"_idRow":1,"_sFile":"A.dll","_sDownloadUrl":"https://x/A.dll","_nFilesize":10,"_sDescription":"A (1.0)"},{"_idRow":2,"_sFile":"B.dll","_nFilesize":20}]""");
        var files = GamebananaService.ParseFiles(node);
        Assert.Single(files);
        Assert.Equal("https://x/A.dll", files[0].DownloadUrl);
        Assert.Equal("1.0", files[0].Version);
    }

    [Fact]
    public void ParseUpdate_SkipsTrashed()
    {
        var ok = JsonNode.Parse("""{"_idRow":5,"_sName":"Update","_sText":"notes","_aChangeLog":[{"text":"Fixed bug"}],"_aFiles":[{"_sFile":"u.zip"}]}""");
        var trashed = JsonNode.Parse("""{"_bIsTrashed":true,"_idRow":6,"_sName":"X"}""");
        Assert.NotNull(GamebananaService.ParseUpdate(ok));
        Assert.Equal(1, GamebananaService.ParseUpdate(ok)!.ChangeLog.Count);
        Assert.Null(GamebananaService.ParseUpdate(trashed));
    }

    [Fact]
    public async Task SearchMods_ParsesRecords()
    {
        var handler = new FakeHandler(req =>
        {
            var url = req.RequestUri!.ToString();
            var body = url.Contains("ProfilePage")
                ? """{"_nDownloadCount":7}"""
                : """{"_aRecords":[{"_idRow":100,"_sName":"Cool Mod","_sVersion":"2.0"}],"_aMetadata":{"_nRecordCount":1,"_bIsComplete":true,"_nPerpage":50}}""";
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };
        });
        using var client = new HttpClient(handler);
        var svc = new GamebananaService(client);
        var result = await svc.SearchMods(1, "cool");
        Assert.True(result.RecordCount == 1);
        Assert.Single(result.Items);
        Assert.Equal(100, result.Items[0].Id);
        Assert.Equal("Cool Mod", result.Items[0].Name);
    }

    [Fact]
    public async Task GetSubmission_ParsesFilesAndRequirements()
    {
        var body = """{"_idRow":50,"_sName":"Big Mod","_sVersion":"3.1","_aFiles":[{"_idRow":1,"_sFile":"Big.zip","_sDownloadUrl":"https://x/Big.zip","_nFilesize":100,"_sDescription":"Big (3.1)"}],"_aRequirements":[["BepInEx","https://gamebanana.com/mods/100","","","Required"]],"_aPreviewMedia":{"_aImages":[{"_sBaseUrl":"https://img/","_sFile530":"t.png"}]}}""";
        var handler = new FakeHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        });
        using var client = new HttpClient(handler);
        var svc = new GamebananaService(client);
        var sub = await svc.GetSubmission(50);
        Assert.Equal("Big Mod", sub.Name);
        Assert.Single(sub.Files);
        Assert.Equal("https://x/Big.zip", sub.Files[0].DownloadUrl);
        Assert.Equal("3.1", sub.Files[0].Version);
        Assert.Single(sub.Requirements);
        Assert.True(sub.Requirements[0].Required);
        Assert.Equal("https://img/t.png", sub.ThumbnailUrl);
    }
}
