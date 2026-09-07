import { ipcMain, dialog, shell } from 'electron'
import type { Result } from '../../shared/types'

export function registerUiIpc(): void {
  ipcMain.handle('ui:pick-zip', async (): Promise<Result<{ path: string }>> => {
    const res = await dialog.showOpenDialog({
      title: 'Select a Mod archive (.zip / .rar / .7z / .tar / .gz / ...)',
      properties: ['openFile'],
      filters: [
        { name: 'Archives', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'jar', 'bbmod', 'gmp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (res.canceled || res.filePaths.length === 0) {
      return { ok: false, error: 'cancelled' }
    }
    return { ok: true, value: { path: res.filePaths[0] } }
  })

  ipcMain.handle('ui:open-folder', async (_e, { path: p }: { path: string }): Promise<void> => {
    if (p) shell.openPath(p)
  })

  ipcMain.handle('ui:reveal-file', async (_e, { path: p }: { path: string }): Promise<void> => {
    if (p) shell.showItemInFolder(p)
  })
}