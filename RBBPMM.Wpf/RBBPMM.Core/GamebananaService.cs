using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace RBBPMM.Core;

/// <summary>
/// GameBanana apiv12 client. Ported from src/main/services/GamebananaService.ts.
/// The HttpClient is injectable so the parsing/path logic can be unit-tested without the network.
/// </summary>
public sealed class GamebananaService
{
    public const string ApiBase = "https://gamebanana.com/apiv12/";
    public const string SiteBase = "https://gamebanana.com";
    public const int PageSize = 50;
    public const string UserAgent = "GottaManageDev/0.1.0 (mod manager for Baldi's Basics Plus; dotnet)";

    private static readonly HashSet<int> BlockedModIds = [675111];

    private static readonly Regex[] IdPatterns =
    [
        new(@"/(?:mods|wip|m)/0*(\d+)", RegexOptions.IgnoreCase),
        new(@"/details/(?:[^/]+\/)*0*(\d+)", RegexOptions.IgnoreCase),
        new(@"[?&](?:id|modsid|submissionid)=(\d+)", RegexOptions.IgnoreCase),
    ];

    private readonly HttpClient _http;

    public GamebananaService(HttpClient? httpClient = null)
    {
        _http = httpClient ?? new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        if (_http.DefaultRequestHeaders.UserAgent.Count == 0)
            _http.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
    }

    // ---- low-level req ----

    public async Task<JsonNode> GetJsonAsync(string url, CancellationToken ct = default)
    {
        using var resp = await _http.GetAsync(url, ct);
        if (!resp.IsSuccessStatusCode)
            throw new HttpRequestException($"GameBanana API {(int)resp.StatusCode}: {resp.ReasonPhrase}");
        var body = await resp.Content.ReadAsStringAsync(ct);
        return JsonNode.Parse(body) ?? throw new InvalidOperationException("Empty GameBanana response");
    }

    public async Task<string> DownloadFileAsync(string downloadUrl, string destDir, string? fileName = null,
        IProgress<(long Received, long? Total)>? progress = null, Func<bool>? isCancelled = null)
    {
        using var resp = await _http.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead);
        if (!resp.IsSuccessStatusCode || resp.Content == null)
            throw new HttpRequestException($"Download failed {(int)resp.StatusCode}: {resp.ReasonPhrase}");
        var total = resp.Content.Headers.ContentLength;
        var cd = resp.Content.Headers.ContentDisposition?.FileName
                 ?? resp.Content.Headers.ContentDisposition?.FileNameStar;
        var baseName = fileName
            ?? ExtractFilenameFromCd(resp.Content.Headers.ContentDisposition?.ToString())
            ?? Path.GetFileName(new Uri(downloadUrl).LocalPath);
        if (string.IsNullOrEmpty(baseName)) baseName = "mod";
        baseName = SanitizeFileName(baseName);
        Directory.CreateDirectory(destDir);
        var dest = Path.Combine(destDir, baseName);
        await using var outStream = File.Create(dest);
        await using var inStream = await resp.Content.ReadAsStreamAsync();
        var buffer = new byte[8192];
        long received = 0;
        int read;
        while ((read = await inStream.ReadAsync(buffer, 0, buffer.Length, default)) > 0)
        {
            if (isCancelled?.Invoke() == true) throw new OperationCanceledException("Download cancelled");
            await outStream.WriteAsync(buffer.AsMemory(0, read));
            received += read;
            progress?.Report((received, total));
        }
        return dest;
    }

    // ---- endpoints ----

    public async Task<GamebananaSearchResult> SearchMods(int page, string? query = null, int? category = null,
        CancellationToken ct = default)
    {
        var q = query?.Trim() ?? "";
        var categoryId = category is > 0 ? category.Value : CategoryIds.BaldiCommunity;
        var filters = new List<string> { $"_aFilters[Generic_Category]={categoryId}" };
        if (!string.IsNullOrEmpty(q))
            filters.Add($"_aFilters[Generic_Name]=contains,{Uri.EscapeDataString(q)}");
        var url = $"{ApiBase}Mod/Index?_nPerpage={PageSize}&{string.Join("&", filters)}&_nPage={Math.Max(1, page)}";
        var doc = await GetJsonAsync(url, ct);
        var records = doc["_aRecords"];
        var items = new List<GamebananaSubmission>();
        if (records is JsonArray arr)
        {
            foreach (var r in arr)
            {
                if (r is not JsonObject o) continue;
                var id = AsNum(o["_idRow"]);
                if (BlockedModIds.Contains((int)id)) continue;
                var preview = o["_aPreviewMedia"];
                var submitter = o["_aSubmitter"] as JsonObject;
                var categoryNode = o["_aCategory"] as JsonObject;
                items.Add(new GamebananaSubmission
                {
                    Id = (int)id,
                    Name = AsStr(o["_sName"]),
                    Version = AsStr(o["_sVersion"]),
                    AuthorName = submitter?["_sName"]?.GetValue<string>(),
                    HasFiles = o["_bHasFiles"]?.GetValue<bool>() ?? false,
                    CategoryId = categoryNode?["_idRow"]?.GetValue<int>(),
                    ThumbnailUrl = ParseThumb(preview),
                    ViewCount = AsNumNullable(o["_nViewCount"]),
                    DateAdded = AsNumNullable(o["_tsDateAdded"]),
                    DateUpdated = AsNumNullable(o["_tsDateModified"]) ?? AsNumNullable(o["_tsDateUpdated"]),
                    Files = []
                });
            }
        }
        await Task.WhenAll(items.Select(async it =>
        {
            try
            {
                var d = await GetJsonAsync($"{ApiBase}Mod/{it.Id}/ProfilePage", ct);
                it.DownloadCount = AsNumNullable(d["_nDownloadCount"]);
            }
            catch { /* best effort */ }
        }));
        var meta = doc["_aMetadata"] as JsonObject;
        var recordCount = meta?["_nRecordCount"]?.GetValue<long>() ?? items.Count;
        var isComplete = meta?["_bIsComplete"]?.GetValue<bool>() ?? (items.Count < PageSize);
        var perPage = meta?["_nPerpage"]?.GetValue<int>() ?? PageSize;
        return new GamebananaSearchResult(recordCount, isComplete, perPage, items);
    }

    public async Task<GamebananaSubmission> GetSubmission(int id, CancellationToken ct = default)
    {
        if (id <= 0) throw new ArgumentException("Invalid submission id", nameof(id));
        var doc = await GetJsonAsync($"{ApiBase}Mod/{id}/ProfilePage", ct);
        var files = ParseFiles(doc["_aFiles"]);
        var archivedFiles = ParseFiles(doc["_aArchivedFiles"]);
        var submitter = doc["_aSubmitter"] as JsonObject;
        var primaryDl = AbsoluteUrl(AsStr(doc["_sDownloadUrl"]));
        if (!string.IsNullOrEmpty(primaryDl) && !files.Any(f => f.DownloadUrl == primaryDl))
            files.Insert(0, new GamebananaFile(-1, AsStr(doc["_sName"]) + ".zip", 0, primaryDl));
        var images = ParseAllImages(doc["_aPreviewMedia"]);
        var category = doc["_aCategory"] as JsonObject;
        return new GamebananaSubmission
        {
            Id = doc["_idRow"]?.GetValue<int>() ?? id,
            Name = AsStr(doc["_sName"]),
            Description = AsStr(doc["_sText"]) ?? AsStr(doc["_sDescription"]),
            Version = AsStr(doc["_sVersion"]),
            AuthorName = submitter?["_sName"]?.GetValue<string>(),
            HasFiles = files.Count > 0 || archivedFiles.Count > 0,
            CategoryId = category?["_idRow"]?.GetValue<int>(),
            ThumbnailUrl = images.Count > 0 ? images[0] : ParseThumb(doc["_aPreviewMedia"]),
            Images = images,
            DownloadCount = AsNumNullable(doc["_nDownloadCount"]),
            ViewCount = AsNumNullable(doc["_nViewCount"]),
            DateAdded = AsNumNullable(doc["_tsDateAdded"]),
            DateUpdated = AsNumNullable(doc["_tsDateModified"]) ?? AsNumNullable(doc["_tsDateUpdated"]),
            Files = files,
            ArchivedFiles = archivedFiles,
            Requirements = ParseRequirements(doc["_aRequirements"]),
            AlternateFileSources = ParseAlternateFileSources(doc["_aAlternateFileSources"])
        };
    }

    public async Task<GamebananaUpdates> GetUpdates(int submissionId, CancellationToken ct = default)
    {
        if (submissionId <= 0) return new GamebananaUpdates(0, []);
        try
        {
            var doc = await GetJsonAsync($"{ApiBase}Mod/{submissionId}/Updates?_nPerpage={PageSize}&_nPage=1", ct);
            var records = doc["_aRecords"];
            var meta = doc["_aMetadata"] as JsonObject;
            var items = new List<GamebananaUpdate>();
            if (records is JsonArray arr)
                foreach (var r in arr)
                {
                    var u = ParseUpdate(r);
                    if (u != null) items.Add(u);
                }
            var total = meta?["_nRecordCount"]?.GetValue<long>() ?? items.Count;
            return new GamebananaUpdates(total, items);
        }
        catch { return new GamebananaUpdates(0, []); }
    }

    public async Task<GamebananaComments> GetComments(int submissionId, CancellationToken ct = default)
    {
        if (submissionId <= 0) return new GamebananaComments(0, []);
        try
        {
            var doc = await GetJsonAsync($"{ApiBase}Mod/{submissionId}/Posts", ct);
            var records = doc["_aRecords"];
            var meta = doc["_aMetadata"] as JsonObject;
            var total = meta?["_nRecordCount"]?.GetValue<long>() ?? 0;
            var items = new List<GamebananaComment>();
            if (records is JsonArray arr)
                foreach (var r in arr)
                {
                    var c = ParseComment(r);
                    if (c != null) items.Add(c);
                }
            return new GamebananaComments(total, items);
        }
        catch { return new GamebananaComments(0, []); }
    }

    public async Task<List<GamebananaComment>> GetPostReplies(int postId, CancellationToken ct = default)
    {
        if (postId <= 0) return [];
        try
        {
            var doc = await GetJsonAsync($"{ApiBase}Post/{postId}/Posts?_nPage=1&_nPerpage=20", ct);
            var records = doc["_aRecords"];
            if (records is not JsonArray arr) return [];
            var outList = new List<GamebananaComment>();
            foreach (var r in arr)
            {
                var c = ParseComment(r);
                if (c != null) outList.Add(c);
            }
            outList.Reverse();
            return outList;
        }
        catch { return []; }
    }

    // ---- pure parse helpers (exposed for unit tests) ----

    public static int? ExtractGamebananaId(string? u)
    {
        if (string.IsNullOrEmpty(u)) return null;
        var real = ResolveLink(u);
        var baseUrl = real.Split('?', '#')[0];
        foreach (var p in IdPatterns)
        {
            var hay = p.ToString().Contains('?') ? real : baseUrl;
            var m = p.Match(hay);
            if (!m.Success) continue;
            if (int.TryParse(m.Groups[m.Groups.Count - 1].Value, out var id) && id > 0)
                return id;
        }
        return null;
    }

    public static string AbsoluteUrl(string u)
    {
        if (string.IsNullOrEmpty(u)) return u;
        return u.StartsWith("http") ? u : u.StartsWith('/') ? SiteBase + u : u;
    }

    public static string ResolveLink(string cloaked)
    {
        if (string.IsNullOrEmpty(cloaked)) return cloaked;
        if (Regex.IsMatch(cloaked, @"//gamebanana\.com/linkfilter", RegexOptions.IgnoreCase))
        {
            try
            {
                var q = new Uri(cloaked).Query;
                var idx = q.IndexOf("url=", StringComparison.OrdinalIgnoreCase);
                if (idx >= 0)
                {
                    var v = q[(idx + 4)..];
                    var amp = v.IndexOf('&');
                    if (amp >= 0) v = v[..amp];
                    var decoded = Uri.UnescapeDataString(v);
                    if (!string.IsNullOrEmpty(decoded)) return decoded;
                }
            }
            catch { /* ignore */ }
        }
        return cloaked;
    }

    public static List<GamebananaFile> ParseFiles(JsonNode? node)
    {
        var outList = new List<GamebananaFile>();
        if (node is not JsonArray arr) return outList;
        foreach (var it in arr)
        {
            if (it is not JsonObject o) continue;
            var desc = AsStr(o["_sDescription"]);
            outList.Add(new GamebananaFile(
                (int)AsNum(o["_idRow"]),
                AsStr(o["_sFile"]),
                AsNum(o["_nFilesize"]),
                AbsoluteUrl(AsStr(o["_sDownloadUrl"])),
                string.IsNullOrEmpty(desc) ? null : desc,
                ParseFileVersion(desc),
                AsNumNullable(o["_tsDateAdded"])));
        }
        return outList.Where(f => !string.IsNullOrEmpty(f.DownloadUrl)).ToList();
    }

    public static GamebananaUpdate? ParseUpdate(JsonNode? node)
    {
        if (node is not JsonObject r) return null;
        if (r["_bIsTrashed"]?.GetValue<bool>() == true || r["_bIsPrivate"]?.GetValue<bool>() == true)
            return null;
        var changeLog = new List<GamebananaUpdateChange>();
        if (r["_aChangeLog"] is JsonArray log)
            foreach (var e in log)
            {
                if (e is not JsonObject o) continue;
                var changeText = AsStr(o["text"]).Trim();
                if (string.IsNullOrEmpty(changeText)) continue;
                changeLog.Add(new GamebananaUpdateChange(changeText, AsStr(o["cat"]).Trim()));
            }
        var fileNames = new List<string>();
        if (r["_aFiles"] is JsonArray files)
            foreach (var f in files)
            {
                if (f is not JsonObject o) continue;
                var name = AsStr(o["_sFile"]).Trim();
                if (!string.IsNullOrEmpty(name) && !fileNames.Contains(name)) fileNames.Add(name);
            }
        var submitter = r["_aSubmitter"] as JsonObject;
        var text = AsStr(r["_sText"]).Trim();
        return new GamebananaUpdate(
            (int)AsNum(r["_idRow"]),
            AsStr(r["_sName"]).Trim(),
            AbsoluteUrl(AsStr(r["_sProfileUrl"])),
            AsNumNullable(r["_tsDateAdded"]),
            AsStr(r["_sVersion"]).Trim(),
            string.IsNullOrEmpty(text) ? null : text,
            submitter?["_sName"]?.GetValue<string>()?.Trim(),
            changeLog,
            fileNames);
    }

    public static GamebananaComment? ParseComment(JsonNode? node)
    {
        if (node is not JsonObject r) return null;
        var poster = r["_aPoster"] as JsonObject;
        var ts = AsNumNullable(r["_tsDateAdded"]);
        return new GamebananaComment(
            (int)AsNum(r["_idRow"]),
            poster?["_sName"]?.GetValue<string>() ?? "Unknown",
            AsStr(r["_sText"]),
            ts.HasValue ? DateTimeOffset.FromUnixTimeSeconds(ts.Value).ToLocalTime().ToString() : null,
            (int?)AsNumNullable(r["_nReplyCount"]));
    }

    public static string? ParseFileVersion(string desc)
    {
        if (string.IsNullOrEmpty(desc)) return null;
        var m = Regex.Match(desc, @"\(([^)]+)\)\s*$") != Match.Empty
            ? Regex.Match(desc, @"\(([^)]+)\)\s*$")
            : Regex.Match(desc, @"\(([^)]+)\)");
        if (!m.Success) return null;
        var v = m.Groups[1].Value.Trim();
        return string.IsNullOrEmpty(v) ? null : v;
    }

    public static string? ExtractFilenameFromCd(string? cd)
    {
        if (string.IsNullOrEmpty(cd)) return null;
        var utf8 = Regex.Match(cd, @"filename\*=UTF-8''([^;]+)", RegexOptions.IgnoreCase);
        if (utf8.Success)
        {
            try { return Uri.UnescapeDataString(utf8.Groups[1].Value.Trim().Trim('"')); }
            catch { /* ignore */ }
        }
        var plain = Regex.Match(cd, @"filename=""([^""]+)""", RegexOptions.IgnoreCase);
        if (!plain.Success) plain = Regex.Match(cd, @"filename=([^;]+)", RegexOptions.IgnoreCase);
        return plain.Success ? plain.Groups[1].Value.Trim().Trim('"') : null;
    }

    private static string? ParseThumb(JsonNode? media)
    {
        var imgs = ParseAllImages(media);
        return imgs.Count > 0 ? imgs[0] : null;
    }

    private static List<string> ParseAllImages(JsonNode? media)
    {
        var outList = new List<string>();
        if (media is not JsonObject o) return outList;
        if (o["_aImages"] is not JsonArray imgs) return outList;
        foreach (var img in imgs)
        {
            var u = SingleImageUrl(img);
            if (u != null && !outList.Contains(u)) outList.Add(u);
        }
        return outList;
    }

    private static string? SingleImageUrl(JsonNode? img)
    {
        if (img is not JsonObject o) return null;
        var baseUrl = AsStr(o["_sBaseUrl"]).TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl)) return null;
        var fileName = AsStr(o["_sFile530"]) ?? AsStr(o["_sFile"]) ?? AsStr(o["_sFile100"]);
        return string.IsNullOrEmpty(fileName) ? null : $"{baseUrl}/{fileName}";
    }

    private static List<GamebananaRequirement> ParseRequirements(JsonNode? raw)
    {
        var outList = new List<GamebananaRequirement>();
        if (raw is not JsonArray arr) return outList;
        foreach (var item in arr)
        {
            JsonArray? entry = item as JsonArray;
            if (item is JsonObject o && o["value"] is JsonArray v) entry = v;
            if (entry == null || entry.Count == 0) continue;
            var name = AsStr(entry[0]);
            if (string.IsNullOrEmpty(name)) continue;
            var origUrl = entry.Count > 1 ? AsStr(entry[1]) : null;
            var url = string.IsNullOrEmpty(origUrl) ? null : AbsoluteUrl(ResolveLink(origUrl));
            var status = entry.Count > 2 ? AsStr(entry[2]) : null;
            var reqLevel = entry.Count > 4 ? AsStr(entry[4]) : "";
            outList.Add(new GamebananaRequirement(name, url, status, Regex.IsMatch(reqLevel ?? "", "required", RegexOptions.IgnoreCase), ExtractGamebananaId(origUrl)));
        }
        return outList;
    }

    private static List<GamebananaAlternateSource> ParseAlternateFileSources(JsonNode? raw)
    {
        var outList = new List<GamebananaAlternateSource>();
        if (raw is not JsonArray arr) return outList;
        foreach (var src in arr)
        {
            if (src is not JsonObject o) continue;
            var origUrl = AsStr(o["url"]);
            if (string.IsNullOrEmpty(origUrl)) continue;
            var real = ResolveLink(origUrl);
            outList.Add(new GamebananaAlternateSource(AbsoluteUrl(real), AsStr(o["description"]), HostOf(real)));
        }
        return outList;
    }

    private static string? HostOf(string u)
    {
        try { return new Uri(u).Host.Replace("www.", ""); }
        catch { return ""; }
    }

    // ---- scalar coercion ----

    public static string AsStr(JsonNode? node, string fallback = "")
        => node == null || node.GetValueKind() == JsonValueKind.Null ? fallback : node.ToString() ?? fallback;

    public static long AsNum(JsonNode? node, long fallback = 0)
    {
        if (node == null) return fallback;
        if (node is JsonValue v)
        {
            if (v.TryGetValue<long>(out var l)) return l;
            if (v.TryGetValue<double>(out var d) && double.IsFinite(d)) return (long)d;
        }
        return fallback;
    }

    public static long? AsNumNullable(JsonNode? node)
    {
        if (node == null || node.GetValueKind() == JsonValueKind.Null) return null;
        if (node is JsonValue v)
        {
            if (v.TryGetValue<long>(out var l)) return l;
            if (v.TryGetValue<double>(out var d) && double.IsFinite(d)) return (long)d;
        }
        return null;
    }

    private static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var sb = new System.Text.StringBuilder(name.Length);
        foreach (var c in name)
            sb.Append(invalid.Contains(c) ? '_' : c);
        return sb.ToString();
    }
}
