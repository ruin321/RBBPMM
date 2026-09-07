import { app, BrowserWindow, shell, nativeTheme, nativeImage } from 'electron'
import path from 'path'
import { registerGameIpc } from './ipc/game.ipc'
import { registerModsIpc } from './ipc/mods.ipc'
import { registerBananaIpc } from './ipc/banana.ipc'
import { registerUiIpc } from './ipc/ui.ipc'
import { registerAppIpc, applyFontToRenderer, applyThemeToRenderer } from './ipc/app.ipc'
import { registerConfigsIpc } from './ipc/configs.ipc'
import { registerTexturesIpc } from './ipc/textures.ipc'
import { getStoredExePath, getTheme, getFontFamily } from './store'
import { isDarkTheme } from './constants'
import { resolveEnvironment } from './services/GameEnvironment'
import { runtimeState } from './store'


function syncNativeTheme(): void {
  nativeTheme.themeSource = isDarkTheme(getTheme()) ? 'dark' : 'light'
}

let mainWindow: BrowserWindow | null = null


function windowIcon(): Electron.NativeImage | undefined {
  const icoPath = path.join(app.getAppPath(), 'resources', 'apps.ico')
  const img = nativeImage.createFromPath(icoPath)
  return img.isEmpty() ? undefined : img
}

function createWindow(): void {
  syncNativeTheme()
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: "Ruin321's Baldi's Basics Plus Mod Manager",
    
    icon: windowIcon(),
    
    backgroundMaterial: 'mica',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  
  const icon = windowIcon()
  if (icon) {
    mainWindow.setIcon(icon)
    if (process.platform === 'win32') app.setAppUserModelId('Ruin321sBaldiModManager')
  }

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  
  const exe = getStoredExePath()
  if (exe) runtimeState.environment = resolveEnvironment(exe)

  registerGameIpc()
  registerModsIpc(() => mainWindow?.webContents ?? null)
  registerBananaIpc(() => mainWindow?.webContents ?? null)
  registerUiIpc()
  registerAppIpc()
  registerConfigsIpc()
  registerTexturesIpc()

  createWindow()
  mainWindow?.webContents.on('did-finish-load', () => {
    applyThemeToRenderer(mainWindow!.webContents, getTheme())
    applyFontToRenderer(mainWindow!.webContents, getFontFamily())
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})