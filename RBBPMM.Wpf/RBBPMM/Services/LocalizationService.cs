using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace RBBPMM.Services;

/// <summary>
/// 轻量 i18n：每语言一份 JSON 词典（key→text），对应 Electron 的 locales/&lt;id&gt;.ts。
/// 切语言只改 Language 并广播 CultureChanged，所有 loc:Loc 绑定即时刷新。
/// 缺键回退顺序：当前语言 → en → 键名（保证永不崩）。
/// </summary>
public sealed class LocalizationService : INotifyPropertyChanged
{
    public static LocalizationService? Current { get; private set; }

    /// <summary>设置全局实例；传 null 可复位（单测收尾用）。</summary>
    public static void SetCurrent(LocalizationService? svc) => Current = svc;

    /// <summary>
    /// 静态取值：ViewModel 里拼状态/错误文案用。无服务或未翻译时回退
    /// <paramref name="fallback"/>，再否则返回键名。
    /// </summary>
    public static string T(string key, string? fallback = null)
    {
        var svc = Current;
        if (svc is not null)
        {
            var v = svc.Get(key);
            if (!string.Equals(v, key, System.StringComparison.Ordinal))
                return v;
        }
        return string.IsNullOrEmpty(fallback) ? key : fallback!;
    }

    private readonly Dictionary<string, Dictionary<string, string>> _resources = new();
    private string _language = "en";

    public string Language
    {
        get => _language;
        set
        {
            // 归一化到词典里登记的规范写法（"ZH-cn" -> "zh-CN"），
            // 否则大小写不同会查不到、静默回退到 en。
            var canonical = Canonicalize(value);
            if (!string.Equals(_language, canonical, System.StringComparison.Ordinal))
            {
                _language = canonical;
                OnCultureChanged();
            }
        }
    }

    /// <summary>把语言代码映射到已登记词典的键；未登记则原样返回。</summary>
    private string Canonicalize(string code)
    {
        foreach (var registered in _resources.Keys)
        {
            if (string.Equals(registered, code, System.StringComparison.OrdinalIgnoreCase))
                return registered;
        }
        return code;
    }

    public IReadOnlyCollection<string> AvailableLanguages => _resources.Keys.ToList();

    public void Load(string lang, Dictionary<string, string> strings)
        => _resources[Canonicalize(lang)] = strings;

    public void LoadFromJson(string lang, string json)
    {
        Dictionary<string, string>? parsed = null;
        try
        {
            parsed = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
        }
        catch (JsonException)
        {
            // 坏词典不致命：留空表，Get() 会回退到 en 或键名
        }
        Load(lang, parsed ?? new Dictionary<string, string>());
    }

    public void LoadFromDirectory(string dir)
    {
        if (!Directory.Exists(dir)) return;
        foreach (var file in Directory.GetFiles(dir, "*.json"))
        {
            var code = Path.GetFileNameWithoutExtension(file);
            LoadFromJson(code, File.ReadAllText(file));
        }
    }

    public string Get(string key)
    {
        if (_resources.TryGetValue(_language, out var dict) &&
            dict.TryGetValue(key, out var v) && !string.IsNullOrEmpty(v))
            return v;
        if (_resources.TryGetValue("en", out var en) &&
            en.TryGetValue(key, out var ev) && !string.IsNullOrEmpty(ev))
            return ev;
        return key;
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    public event EventHandler? CultureChanged;

    private void OnCultureChanged()
    {
        CultureChanged?.Invoke(this, System.EventArgs.Empty);
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs("Item[]"));
    }
}
