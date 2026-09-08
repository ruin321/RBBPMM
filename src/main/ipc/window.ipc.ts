import { ipcMain, type BrowserWindow } from 'electron'


export function registerWindowIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('window:minimize', () => getWindow()?.minimize())

  ipcMain.handle('window:toggle-maximize', () => {
    const w = getWindow()
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })

  ipcMain.handle('window:close', () => getWindow()?.close())

  ipcMain.handle('window:is-maximized', () => getWindow()?.isMaximized() ?? false)

  ipcMain.handle('window:register-maximize-events', () => {
    const w = getWindow()
    if (!w) return
    w.on('maximize', () => w.webContents.send('window:maximized-changed', true))
    w.on('unmaximize', () => w.webContents.send('window:maximized-changed', false))
  })
}