import { execFile } from 'child_process'
import { ipcMain, BrowserWindow, nativeTheme } from 'electron'
import { getFontFamily, getLocale, getTheme, setFontFamily, setLocale, setTheme, resetAllSettings, getSplashEnabled, setSplashEnabled, getDebugLogging, setDebugLogging, getNavOpen, setNavOpen } from '../store'
import { isDarkTheme } from '../constants'

function syncNativeTheme(): void {
  nativeTheme.themeSource = isDarkTheme(getTheme()) ? 'dark' : 'light'
}


const COMMON_CJK_FONTS = [
  'Comic Sans MS',
  'Segoe UI Variable',
  'Microsoft YaHei',
  'Microsoft YaHei UI',
  'SimSun',
  'SimHei',
  'KaiTi',
  'FangSong',
  'DengXian',
  'YouYuan',
  'Microsoft JhengHei',
  'STXihei',
  'STKaiti',
  'Noto Sans SC',
  'Noto Serif SC',
  'Source Han Sans SC',
  'Source Han Serif SC'
]


let fontCache: string[] | null = null
export async function listSystemFonts(): Promise<string[]> {
  if (fontCache) return fontCache
  if (process.platform !== 'win32') {
    fontCache = [...COMMON_CJK_FONTS].sort()
    return fontCache
  }
  try {
    const out = await new Promise<string>((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | Select-Object -ExpandProperty Name'
        ],
        { windowsHide: true, timeout: 20000, maxBuffer: 16 * 1024 * 1024 },
        (err, stdout) => (err ? reject(err) : resolve(stdout))
      )
    })
    const found = new Set(
      out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
    for (const f of COMMON_CJK_FONTS) found.add(f)
    fontCache = [...found].sort()
  } catch {
    fontCache = [...COMMON_CJK_FONTS]
  }
  return fontCache
}

export function registerAppIpc(): void {
  ipcMain.handle('app:get-theme', async (): Promise<string> => getTheme())

  ipcMain.handle('app:set-theme', async (_e, { theme }: { theme: string }): Promise<void> => {
    setTheme(theme)
    syncNativeTheme()
    
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('app:theme-changed', theme)
    }
  })

  ipcMain.handle('app:get-font', async (): Promise<string> => getFontFamily())

  ipcMain.handle('app:set-font', async (_e, { font }: { font: string }): Promise<void> => {
    setFontFamily(font)
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('app:font-changed', font)
    }
  })

  ipcMain.handle('app:list-fonts', async (): Promise<string[]> => listSystemFonts())

  ipcMain.handle('app:get-locale', async (): Promise<string> => getLocale())

  ipcMain.handle('app:set-locale', async (_e, { locale }: { locale: string }): Promise<void> => {
    setLocale(locale)
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('app:locale-changed', locale)
    }
  })

  ipcMain.handle('app:get-splash', async (): Promise<boolean> => getSplashEnabled())

  ipcMain.handle('app:set-splash', async (_e, { enabled }: { enabled: boolean }): Promise<void> => {
    setSplashEnabled(enabled)
  })

  ipcMain.handle('app:get-debug-logging', async (): Promise<boolean> => getDebugLogging())

  ipcMain.handle('app:set-debug-logging', async (_e, { enabled }: { enabled: boolean }): Promise<void> => {
    setDebugLogging(enabled)
  })

  ipcMain.handle('app:get-nav-open', async (): Promise<boolean> => getNavOpen())

  ipcMain.handle('app:set-nav-open', async (_e, { open }: { open: boolean }): Promise<void> => {
    setNavOpen(open)
  })

  ipcMain.handle('app:reset-settings', async (): Promise<void> => {
    const defaults = resetAllSettings()
    syncNativeTheme()
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('app:theme-changed', defaults.theme)
      win.webContents.send('app:font-changed', defaults.fontFamily)
      win.webContents.send('app:locale-changed', defaults.locale)
      
      win.webContents.send('game:cleared')
    }
  })
}


export function applyThemeToRenderer(webContents: Electron.WebContents, theme: string): void {
  webContents.send('app:theme-changed', theme)
}


export function applyFontToRenderer(webContents: Electron.WebContents, font: string): void {
  webContents.send('app:font-changed', font)
}