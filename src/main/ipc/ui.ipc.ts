import { ipcMain, dialog, shell } from 'electron'
import { readFile } from 'fs/promises'
import { extname } from 'path'
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

  ipcMain.handle('ui:pick-image', async (): Promise<Result<{ dataUrl: string }>> => {
    const res = await dialog.showOpenDialog({
      title: 'Select a background image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (res.canceled || res.filePaths.length === 0) {
      return { ok: false, error: 'cancelled' }
    }
    const path = res.filePaths[0]
    try {
      const buf = await readFile(path)
      const ext = (extname(path) || '').toLowerCase().replace('.', '') || 'png'
      const mime = ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext
      const dataUrl = `data:image/${mime};base64,${buf.toString('base64')}`
      return { ok: true, value: { dataUrl } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('ui:open-folder', async (_e, { path: p }: { path: string }): Promise<void> => {
    if (p) shell.openPath(p)
  })

  ipcMain.handle('ui:reveal-file', async (_e, { path: p }: { path: string }): Promise<void> => {
    if (p) shell.showItemInFolder(p)
  })

  ipcMain.handle('ui:open-external', async (_e, { url }: { url: string }): Promise<void> => {
    if (url && /^https?:\/\//.test(url)) shell.openExternal(url)
  })
}