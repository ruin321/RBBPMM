import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi } from '../shared/api'

const api: AppApi = {
  game: {
    selectDir: () => ipcRenderer.invoke('game:select-dir'),
    setDir: (exePath) => ipcRenderer.invoke('game:set-dir', { exePath }),
    get: () => ipcRenderer.invoke('game:get'),
    launch: () => ipcRenderer.invoke('game:launch'),
    launchSteam: () => ipcRenderer.invoke('game:launch-steam')
  },
  mods: {
    list: () => ipcRenderer.invoke('mods:list'),
    install: (archivePath) => ipcRenderer.invoke('mods:install', { archivePath }),
    installUnmanaged: (archivePath) => ipcRenderer.invoke('mods:install-unmanaged', { archivePath }),
    cancelInstall: () => ipcRenderer.invoke('mods:install-cancel'),
    uninstall: (guid) => ipcRenderer.invoke('mods:uninstall', { guid }),
    toggle: (guid, activate) => ipcRenderer.invoke('mods:toggle', { guid, activate })
  },
  banana: {
    search: (page, query, category) =>
      ipcRenderer.invoke('banana:search', { page, query, category }),
    get: (submissionId) => ipcRenderer.invoke('banana:get', { submissionId }),
    install: (submissionId, fileId) => ipcRenderer.invoke('banana:install', { submissionId, fileId }),
    getComments: (submissionId) => ipcRenderer.invoke('banana:get-comments', { submissionId }),
    getPostReplies: (postId) => ipcRenderer.invoke('banana:get-post-replies', { postId })
  },
  ui: {
    pickZip: () => ipcRenderer.invoke('ui:pick-zip'),
    openFolder: (p) => ipcRenderer.invoke('ui:open-folder', { path: p }),
    revealFile: (p) => ipcRenderer.invoke('ui:reveal-file', { path: p })
  },
  configs: {
    list: () => ipcRenderer.invoke('configs:list'),
    set: (cfgPath, section, key, value) =>
      ipcRenderer.invoke('configs:set', { cfgPath, section, key, value }),
    delete: (cfgPath) => ipcRenderer.invoke('configs:delete', { cfgPath })
  },
  textures: {
    list: () => ipcRenderer.invoke('textures:list'),
    install: (archivePath) => ipcRenderer.invoke('textures:install', { archivePath }),
    uninstall: (folderName) => ipcRenderer.invoke('textures:uninstall', { folderName }),
    probe: (archivePath) => ipcRenderer.invoke('textures:probe', { archivePath })
  },
  app: {
    getTheme: () => ipcRenderer.invoke('app:get-theme'),
    setTheme: (theme) => ipcRenderer.invoke('app:set-theme', { theme }),
    getFont: () => ipcRenderer.invoke('app:get-font'),
    setFont: (font) => ipcRenderer.invoke('app:set-font', { font }),
    listFonts: () => ipcRenderer.invoke('app:list-fonts'),
    getLocale: () => ipcRenderer.invoke('app:get-locale'),
    setLocale: (locale) => ipcRenderer.invoke('app:set-locale', { locale }),
    getSplash: () => ipcRenderer.invoke('app:get-splash'),
    setSplash: (enabled) => ipcRenderer.invoke('app:set-splash', { enabled }),
    getDebugLogging: () => ipcRenderer.invoke('app:get-debug-logging'),
    setDebugLogging: (enabled) => ipcRenderer.invoke('app:set-debug-logging', { enabled }),
    getNavOpen: () => ipcRenderer.invoke('app:get-nav-open'),
    setNavOpen: (open) => ipcRenderer.invoke('app:set-nav-open', { open }),
    resetSettings: () => ipcRenderer.invoke('app:reset-settings'),
    onThemeChanged: (cb) => {
      const handler = (_e: unknown, theme: unknown): void => cb(theme as string)
      ipcRenderer.on('app:theme-changed', handler)
      return () => ipcRenderer.removeListener('app:theme-changed', handler)
    },
    onFontChanged: (cb) => {
      const handler = (_e: unknown, font: unknown): void => cb(font as string)
      ipcRenderer.on('app:font-changed', handler)
      return () => ipcRenderer.removeListener('app:font-changed', handler)
    },
    onLocaleChanged: (cb) => {
      const handler = (_e: unknown, locale: unknown): void => cb(locale as string)
      ipcRenderer.on('app:locale-changed', handler)
      return () => ipcRenderer.removeListener('app:locale-changed', handler)
    },
    onGameCleared: (cb) => {
      const handler = (): void => cb()
      ipcRenderer.on('game:cleared', handler)
      return () => ipcRenderer.removeListener('game:cleared', handler)
    },
    onInstallProgress: (cb) => {
      const handler = (_e: unknown, p: unknown): void => cb(p as never)
      ipcRenderer.on('mods:install-progress', handler)
      return () => ipcRenderer.removeListener('mods:install-progress', handler)
    },
    onTexturePackProgress: (cb) => {
      const handler = (_e: unknown, p: unknown): void => cb(p as never)
      ipcRenderer.on('textures:install-progress', handler)
      return () => ipcRenderer.removeListener('textures:install-progress', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)