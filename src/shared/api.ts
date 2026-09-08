import type {
  ConfigFileDto,
  GamebananaCommentDto,
  GameEnvironment,
  GamebananaSearchResult,
  GamebananaSubmissionDto,
  InstallProgress,
  InstallResult,
  ModInstallOutcome,
  ModItemDto,
  ReadmeFileDto,
  Result,
  TexturePackInstallResult,
  TexturePackListResult,
  TexturePackProgress
} from './types'

export interface AppApi {
  game: {
    selectDir: () => Promise<Result<GameEnvironment>>
    setDir: (exePath: string) => Promise<Result<GameEnvironment>>
    get: () => Promise<Result<GameEnvironment>>
    launch: () => Promise<Result<{ pid?: number }>>
    launchSteam: () => Promise<Result<{ launched: boolean }>>
    isRunning: () => Promise<Result<{ running: boolean }>>
    stop: () => Promise<Result<{ stopped: boolean }>>
  }
  mods: {
    list: () => Promise<Result<ModItemDto[]>>
    install: (archivePath: string) => Promise<Result<ModInstallOutcome>>
    installUnmanaged: (archivePath: string) =>
      Promise<Result<{ modName: string; readmes: ReadmeFileDto[] }>>
    cancelInstall: () => Promise<void>
    uninstall: (guid: string) => Promise<Result>
    toggle: (guid: string, activate: boolean) => Promise<Result<{ activated: boolean }>>
  }
  banana: {
    search: (page: number, query?: string, category?: number) =>
      Promise<Result<GamebananaSearchResult>>,
    install: (submissionId: number, fileId?: number) => Promise<Result<InstallResult>>
    get: (submissionId: number) => Promise<Result<GamebananaSubmissionDto>>
    getComments: (submissionId: number) => Promise<Result<GamebananaCommentDto[]>>
    getPostReplies: (postId: number) => Promise<Result<GamebananaCommentDto[]>>
  }
  ui: {
    pickZip: () => Promise<Result<{ path: string }>>
    openFolder: (path: string) => Promise<void>
    revealFile: (path: string) => Promise<void>
    openExternal: (url: string) => Promise<void>
  }
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    registerMaximizeEvents: () => Promise<void>
    onMaximizedChanged: (cb: (maximized: boolean) => void) => () => void
  }
  configs: {
    list: () => Promise<Result<ConfigFileDto[]>>
    set: (cfgPath: string, section: string, key: string, value: string) => Promise<Result>
    delete: (cfgPath: string) => Promise<Result>
  }
  textures: {
    list: () => Promise<Result<TexturePackListResult>>
    install: (archivePath: string) => Promise<Result<TexturePackInstallResult>>
    uninstall: (folderName: string) => Promise<Result>
    probe: (archivePath: string) => Promise<Result<boolean>>
  }
  app: {
    getTheme: () => Promise<string>
    setTheme: (theme: string) => Promise<void>
    getFont: () => Promise<string>
    setFont: (font: string) => Promise<void>
    listFonts: () => Promise<string[]>
    getLocale: () => Promise<string>
    setLocale: (locale: string) => Promise<void>
    getSplash: () => Promise<boolean>
    setSplash: (enabled: boolean) => Promise<void>
    getDebugLogging: () => Promise<boolean>
    setDebugLogging: (enabled: boolean) => Promise<void>
    getNavOpen: () => Promise<boolean>
    setNavOpen: (open: boolean) => Promise<void>
    resetSettings: () => Promise<void>
    onThemeChanged: (cb: (theme: string) => void) => () => void
    onFontChanged: (cb: (font: string) => void) => () => void
    onLocaleChanged: (cb: (locale: string) => void) => () => void
    onGameCleared: (cb: () => void) => () => void
    onInstallProgress: (cb: (p: InstallProgress) => void) => () => void
    onTexturePackProgress: (cb: (p: TexturePackProgress) => void) => () => void
  }
}