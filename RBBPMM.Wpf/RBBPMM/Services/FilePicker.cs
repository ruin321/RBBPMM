namespace RBBPMM.Services;

/// <summary>
/// File/folder picker seam. Kept as an interface so ViewModels stay unit-testable without opening
/// real Win32 dialogs (which need a desktop session).
/// </summary>
public interface IFilePicker
{
    /// <summary>Returns the chosen archive path, or null when the user cancels.</summary>
    string? PickArchive();

    /// <summary>Returns the chosen folder path, or null when the user cancels.</summary>
    string? PickFolder(string? title = null);
}

/// <summary>Win32 implementation backed by the WPF-era common dialogs.</summary>
public sealed class WindowsFilePicker : IFilePicker
{
    private const string ArchiveFilter =
        "Archives|*.zip;*.7z;*.rar;*.tar;*.gz;*.tgz;*.bz2;*.xz;*.jar|All files|*.*";

    public string? PickArchive()
    {
        var dialog = new Microsoft.Win32.OpenFileDialog
        {
            Title = "Select an archive",
            Filter = ArchiveFilter,
            CheckFileExists = true,
            Multiselect = false
        };
        return dialog.ShowDialog() == true ? dialog.FileName : null;
    }

    public string? PickFolder(string? title = null)
    {
        var dialog = new Microsoft.Win32.OpenFolderDialog
        {
            Title = title ?? "Select a folder",
            Multiselect = false
        };
        return dialog.ShowDialog() == true ? dialog.FolderName : null;
    }
}
