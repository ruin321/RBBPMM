namespace RBBPMM.Models;

/// <summary>
/// 侧边栏导航项。Key 必须与 NavigationService 注册键一致。
/// </summary>
public sealed record NavItem(string Key, string Title, string Icon = "");
