using RBBPMM.Core;
using RBBPMM.Services;
using RBBPMM.ViewModels;

namespace RBBPMM.Wpf.Tests;

/// <summary>
/// 列表行 ViewModel 的纯逻辑测试。这些包装类存在的意义就是把「作者/版本缺失」「能否卸载」
/// 「启用/停用文案」这类判断从 XAML 里搬出来——所以它们自己必须被锁住，
/// 否则退回 XAML 里堆转换器等于白拆。
/// </summary>
public class RowViewModelTests
{
    private static LocalizationService InstallRealResources()
    {
        var loc = new LocalizationService();
        loc.LoadFromDirectory(TestFs.ResourcesDir());
        loc.Language = "en";
        LocalizationService.SetCurrent(loc);
        return loc;
    }

    // ------------------------------------------------------------ 材质包行

    [Theory]
    [InlineData("me", "1.0", true)]
    [InlineData("me", null, true)]
    [InlineData(null, "1.0", true)]
    [InlineData(null, null, false)]
    [InlineData("   ", "  ", false)]
    public void TexturePackRow_HasMeta_OnlyWhenAuthorOrVersionPresent(string? author, string? version, bool expected)
    {
        var row = new TexturePackRowViewModel(new TexturePack
        {
            FolderName = "pack",
            Name = "Pack",
            Author = author,
            Version = version,
        });

        Assert.Equal(expected, row.HasMeta);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void TexturePackRow_CanUninstall_IsInverseOfProtected(bool prot, bool expected)
    {
        var row = new TexturePackRowViewModel(new TexturePack { FolderName = "p", Name = "P", Protected = prot });

        Assert.Equal(expected, row.CanUninstall);
    }

    // ------------------------------------------------------------ 自定义关卡行

    [Fact]
    public void CustomLevelRow_Name_FallsBackToFileName()
    {
        var named = new CustomLevelRowViewModel(new CustomLevel("a.pbpl", "Alpha", "me", "level", 2048, true));
        var unnamed = new CustomLevelRowViewModel(new CustomLevel("b.pbpl", "", "me", "level", 2048, true));

        Assert.Equal("Alpha", named.Name);
        Assert.Equal("b.pbpl", unnamed.Name);
    }

    [Fact]
    public void CustomLevelRow_SizeLabel_UsesKilobytes()
    {
        var row = new CustomLevelRowViewModel(new CustomLevel("a.pbpl", "A", "", "level", 2048, true));

        Assert.Equal("2 KB", row.SizeLabel);
    }

    [Fact]
    public void CustomLevelRow_ToggleAndStatusLabels_FollowEnabled()
    {
        LocalizationService.SetCurrent(null);
        try
        {
            var row = new CustomLevelRowViewModel(new CustomLevel("a.pbpl", "A", "", "level", 1, true));

            // 无资源时走 T(key, fallback) 的英文兜底
            Assert.Equal("Disable", row.ToggleLabel);
            Assert.Equal("Enabled", row.StatusLabel);

            row.Enabled = false;
            Assert.Equal("Enable", row.ToggleLabel);
            Assert.Equal("Disabled", row.StatusLabel);
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }

    [Fact]
    public void CustomLevelRow_Labels_FollowLanguageSwitch()
    {
        var loc = InstallRealResources();
        try
        {
            var row = new CustomLevelRowViewModel(new CustomLevel("a.pbpl", "A", "", "level", 1, true));
            Assert.Equal("Disable", row.ToggleLabel);

            loc.Language = "zh-CN";
            Assert.Equal("停用", row.ToggleLabel);
            Assert.Equal("已启用", row.StatusLabel);

            row.Enabled = false;
            Assert.Equal("启用", row.ToggleLabel);
            Assert.Equal("已停用", row.StatusLabel);
        }
        finally
        {
            LocalizationService.SetCurrent(null);
        }
    }

    [Fact]
    public void CustomLevelRow_Busy_FlipsIdle()
    {
        var row = new CustomLevelRowViewModel(new CustomLevel("a.pbpl", "A", "", "level", 1, true));
        Assert.True(row.Idle);

        row.Busy = true;
        Assert.False(row.Idle);
    }
}
