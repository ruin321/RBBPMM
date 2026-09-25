using CommunityToolkit.Mvvm.ComponentModel;
using RBBPMM.Core;

namespace RBBPMM.ViewModels;

/// <summary>
/// 材质包列表的一行。与 <see cref="ModRowViewModel"/> / <see cref="CustomLevelRowViewModel"/> 同理：
/// Core 的 <see cref="TexturePack"/> 是纯数据，界面需要的「作者/版本是否缺失」「能否卸载」
/// 这类判断放在这里，免得往 Core 模型里塞 UI 概念、也免得在 XAML 里堆转换器。
/// </summary>
public sealed class TexturePackRowViewModel : ObservableObject
{
    public TexturePackRowViewModel(TexturePack pack) => Pack = pack;

    public TexturePack Pack { get; }

    public string Name => Pack.Name;
    public string FolderName => Pack.FolderName;
    public string? Author => Pack.Author;
    public string? Version => Pack.Version;
    public bool Protected => Pack.Protected;

    /// <summary>
    /// 作者与版本都缺失时整行隐藏。少了这个判断，界面上会剩下一个孤零零的「·」
    /// （pack.json 的键是 PascalCase，写小写的包很常见）。
    /// </summary>
    public bool HasMeta =>
        !string.IsNullOrWhiteSpace(Pack.Author) || !string.IsNullOrWhiteSpace(Pack.Version);

    /// <summary>受保护的包不能卸载；给正向布尔，省掉 XAML 里的取反转换器。</summary>
    public bool CanUninstall => !Pack.Protected;
}
