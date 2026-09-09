import { app, BrowserWindow, shell, nativeTheme, nativeImage } from 'electron'
import os from 'os'
import path from 'path'
import { registerWindowIpc } from './ipc/window.ipc'
import { registerGameIpc } from './ipc/game.ipc'
import { registerModsIpc } from './ipc/mods.ipc'
import { registerBananaIpc } from './ipc/banana.ipc'
import { registerUiIpc } from './ipc/ui.ipc'
import { registerToolboxIpc } from './ipc/toolbox.ipc'
import { registerAppIpc, applyFontToRenderer, applyThemeToRenderer } from './ipc/app.ipc'
import { registerConfigsIpc } from './ipc/configs.ipc'
import { registerTexturesIpc } from './ipc/textures.ipc'
import { registerSetupIpc } from './ipc/setup.ipc'
import { getStoredExePath, getTheme, getFontFamily } from './store'
import { isDarkTheme } from './constants'
import { resolveEnvironment } from './services/GameEnvironment'
import { runtimeState } from './store'
import type { OpenUrlPayload } from '../shared/types'


const PROTOCOL = 'rbbpmm'

let rendererReady = false
let pendingUrl: OpenUrlPayload | null = null

function parseProtocolUrl(url: string): OpenUrlPayload | null {
  const clean = url.trim()
  if (!clean.toLowerCase().startsWith(`${PROTOCOL}://`)) return null
  let rest = clean.slice(PROTOCOL.length + 3)
  rest = rest.split('?')[0].replace(/\/+$/, '')
  const [action = '', idRaw] = rest.split('/')
  const id = idRaw && /^\d+$/.test(idRaw) ? Number(idRaw) : undefined
  return { action, id, raw: clean }
}

function pushOpenUrl(payload: OpenUrlPayload): void {
  const wc = mainWindow?.webContents
  if (!wc || !rendererReady) {
    pendingUrl = payload
    return
  }
  wc.send('app:open-url', payload)
}

function handleSecondInstance(argv: string[]): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
  const url = argv.find((a) => a.toLowerCase().startsWith(`${PROTOCOL}://`))
  if (!url) return
  const parsed = parseProtocolUrl(url)
  if (parsed) pushOpenUrl(parsed)
}


function syncNativeTheme(): void {
  nativeTheme.themeSource = isDarkTheme(getTheme()) ? 'dark' : 'light'
}

let mainWindow: BrowserWindow | null = null


function windowIcon(): Electron.NativeImage | undefined {
  if (process.platform !== 'win32') {
    const pngPath = path.join(app.getAppPath(), 'resources', 'app-icon.png')
    const png = nativeImage.createFromPath(pngPath)
    if (!png.isEmpty()) return png
    const empty = nativeImage.createEmpty()
    return empty
  }
  const icoPath = path.join(app.getAppPath(), 'resources', 'apps.ico')
  const img = nativeImage.createFromPath(icoPath)
  return img.isEmpty() ? undefined : img
}

function createWindow(): void {
  syncNativeTheme()
  const isWin11 =
    process.platform === 'win32' && Number((os.release().split('.')[2] ?? '0')) >= 22000
  const useMica = process.platform === 'win32' && isWin11
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    title: "Ruin321's Baldi's Basics Plus Mod Manager",
    
    icon: windowIcon(),
    
    backgroundMaterial: useMica ? 'mica' : undefined,
    backgroundColor: '#00000000',
    transparent: !useMica && process.platform === 'win32',
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

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)

  app.on('second-instance', (_e, argv) => handleSecondInstance(argv))

  app.on('open-url', (e, url) => {
    e.preventDefault()
    const parsed = parseProtocolUrl(url)
    if (parsed) pushOpenUrl(parsed)
  })

  app.whenReady().then(() => {
    
    const exe = getStoredExePath()
    if (exe) runtimeState.environment = resolveEnvironment(exe)

    registerGameIpc()
    registerWindowIpc(() => mainWindow)
    registerModsIpc(() => mainWindow?.webContents ?? null)
    registerBananaIpc(() => mainWindow?.webContents ?? null)
    registerUiIpc()
    registerToolboxIpc()
    registerAppIpc()
    registerConfigsIpc()
    registerTexturesIpc()
    registerSetupIpc(() => mainWindow?.webContents ?? null)

    createWindow()
    mainWindow?.webContents.on('did-finish-load', () => {
      applyThemeToRenderer(mainWindow!.webContents, getTheme())
      applyFontToRenderer(mainWindow!.webContents, getFontFamily())
      if (process.platform === 'win32' && Number((os.release().split('.')[2] ?? '0')) < 22000) {
        void mainWindow?.webContents.executeJavaScript(
          `document.documentElement.classList.add('self-rounded')`
        )
      }
      rendererReady = true
      if (pendingUrl) {
        const p = pendingUrl
        pendingUrl = null
        mainWindow?.webContents.send('app:open-url', p)
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  const initialUrl = process.argv.find((a) => a.toLowerCase().startsWith(`${PROTOCOL}://`))
  if (initialUrl) {
    const parsed = parseProtocolUrl(initialUrl)
    if (parsed) pushOpenUrl(parsed)
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})