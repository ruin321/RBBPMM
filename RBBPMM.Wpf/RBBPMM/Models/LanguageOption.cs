namespace RBBPMM.Models;

/// <summary>
/// 语言选项（Phase 4 真正接入 i18n 资源；此处先持久化选择）。
/// </summary>
public sealed record LanguageOption(string Code, string Label);
