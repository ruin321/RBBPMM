using System.IO;
using System.Text.Json;

namespace RBBPMM.Services;

/// <summary>
/// 用户级设置，持久化到 %LocalAppData%/RBBPMM/settings.json。
/// 主题与语言选择在此落盘；Phase 4 再把语言真正接到 i18n 资源。
/// </summary>
public sealed class UserSettings
{
    public string Theme { get; set; } = "Light";
    public string Language { get; set; } = "en";

    private static string DefaultPath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "RBBPMM",
            "settings.json");

    private readonly string _filePath;

    public UserSettings(string? filePath = null)
    {
        _filePath = filePath ?? DefaultPath;
    }

    // 供 System.Text.Json 反序列化使用，避免只认带参构造导致属性不被赋值。
    public UserSettings() : this(null)
    {
    }

    public static UserSettings Load(string? filePath = null)
    {
        var settings = new UserSettings(filePath);
        try
        {
            if (File.Exists(settings._filePath))
            {
                var json = File.ReadAllText(settings._filePath);
                var loaded = JsonSerializer.Deserialize<UserSettings>(json);
                if (loaded is not null)
                    return loaded;
            }
        }
        catch
        {
            // 损坏或不可读时回退默认，不抛出——UI 不该因配置坏掉而崩。
        }

        return settings;
    }

    public void Save()
    {
        try
        {
            var dir = Path.GetDirectoryName(_filePath);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);
            var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_filePath, json);
        }
        catch
        {
            // 保存失败静默忽略（无写入权限等情况），不影响会话。
        }
    }
}
