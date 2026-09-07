import fs from 'fs'
import { ipcMain, WebContents } from 'electron'
import { loadModManifest } from '../services/ManifestLoader'
import { scanRepository } from '../services/ModRepositoryScanner'
import { installModArchive, installUnmanaged, hasManifest } from '../services/ModInstaller'
import { createTempDir, extractArchive, removeDirIfInside } from '../services/ModArchiveExtractor'
import { buildPlan } from '../services/ModArchivePlanner'
import { collectReadmes, ReadmeFile } from '../services/ReadmeCollector'
import { toggleActivation, toggleLegacyPlugin } from '../services/ModActivator'
import { deleteMod, deleteLegacyPlugin } from '../services/ModUnInstaller'
import { runtimeState } from '../store'
import type {
  InstallProgress,
  InstallResult,
  ModInstallOutcome,
  ModItemDto,
  Result
} from '../../shared/types'

function requireEnv(): { ok: true; value: string } | { ok: false; error: string } {
  if (!runtimeState.environment) {
    return { ok: false, error: 'Game directory not configured' }
  }
  return { ok: true, value: runtimeState.environment.rootPath }
}

let progressSink: ((p: InstallProgress) => void) | null = null

export function registerModsIpc(getWebContents: () => WebContents | null): void {
  const emit = (p: InstallProgress): void => {
    progressSink?.(p)
    getWebContents()?.send('mods:install-progress', p)
  }

  ipcMain.handle('mods:list', async (): Promise<Result<ModItemDto[]>> => {
    const env = requireEnv()
    if (!env.ok) return env
    const mods = scanRepository(env.value, runtimeState.environment?.gameVersion)
    return { ok: true, value: mods }
  })

  ipcMain.handle(
    'mods:install',
    async (_e, { archivePath }: { archivePath: string }): Promise<Result<ModInstallOutcome>> => {
      const env = requireEnv()
      if (!env.ok) return env

      
      runtimeState.cancelController = new AbortController()
      const signal = runtimeState.cancelController.signal
      progressSink = () => {}
      const tempRoot = createTempDir(env.value)
      try {
        emit({ stage: 'start', percent: 0, message: 'Starting install' })
        
        emit({ stage: 'extracting', message: 'Extracting archive' })
        const extractRoot = await extractArchive(archivePath, tempRoot)
        
        const readmes: ReadmeFile[] = []
        collectReadmes(extractRoot, readmes, 8)

        if (hasManifest(extractRoot)) {
          const result = await installModArchive(
            env.value,
            archivePath,
            runtimeState.environment?.gameVersion,
            (p) => emit(p),
            () => signal.aborted,
            extractRoot
          )
          return { ok: true, value: { mode: 'manifest', modName: result.mod?.name ?? '', readmes } }
        }

        
        const plan = buildPlan(extractRoot)
        if (plan.needsConfirm) {
          return { ok: true, value: { mode: 'confirm', plan, readmes } }
        }
        const modName = installUnmanaged(extractRoot, env.value, (p) => emit(p), () => signal.aborted)
        return { ok: true, value: { mode: 'unmanaged', modName, readmes } }
      } finally {
        if (fs.existsSync(tempRoot)) removeDirIfInside(env.value, tempRoot)
        progressSink = null
        runtimeState.cancelController = null
      }
    }
  )

  ipcMain.handle(
    'mods:install-unmanaged',
    async (_e, { archivePath }: { archivePath: string }): Promise<Result<{ modName: string; readmes: ReadmeFile[] }>> => {
      const env = requireEnv()
      if (!env.ok) return env
      runtimeState.cancelController = new AbortController()
      const signal = runtimeState.cancelController.signal
      progressSink = () => {}
      const tempRoot = createTempDir(env.value)
      try {
        emit({ stage: 'start', percent: 0, message: 'Starting install' })
        
        emit({ stage: 'extracting', message: 'Extracting archive' })
        const extractRoot = await extractArchive(archivePath, tempRoot)
        const readmes: ReadmeFile[] = []
        collectReadmes(extractRoot, readmes, 8)
        const modName = installUnmanaged(extractRoot, env.value, (p) => emit(p), () => signal.aborted)
        return { ok: true, value: { modName, readmes } }
      } finally {
        if (fs.existsSync(tempRoot)) removeDirIfInside(env.value, tempRoot)
        progressSink = null
        runtimeState.cancelController = null
      }
    }
  )

  ipcMain.handle('mods:install-cancel', async (): Promise<void> => {
    runtimeState.cancelController?.abort()
  })

  ipcMain.handle('mods:toggle', async (_e, { guid, activate }: { guid: string; activate: boolean }): Promise<Result<{ activated: boolean }>> => {
    const env = requireEnv()
    if (!env.ok) return env
    const list = scanRepository(env.value, runtimeState.environment?.gameVersion)
    const mod = list.find((m) => m.guid === guid)
    if (!mod) return { ok: false, error: 'Mod not found: ' + guid }
    
    if (mod.guid.startsWith('legacy:')) {
      return { ok: true, value: toggleLegacyPlugin(mod.installDir, mod.pluginFiles, activate) }
    }
    const manifest = loadModManifest(mod.installDir)
    if (!manifest) return { ok: false, error: 'Cannot read manifest for mod' }
    const res = toggleActivation(env.value, mod.installDir, manifest, activate)
    return { ok: true, value: res }
  })

  ipcMain.handle('mods:uninstall', async (_e, { guid }: { guid: string }): Promise<Result> => {
    const env = requireEnv()
    if (!env.ok) return env
    const list = scanRepository(env.value, runtimeState.environment?.gameVersion)
    const mod = list.find((m) => m.guid === guid)
    if (!mod) return { ok: false, error: 'Mod not found: ' + guid }
    
    if (mod.guid.startsWith('legacy:')) {
      deleteLegacyPlugin(env.value, mod.installDir, mod.pluginFiles)
      return { ok: true }
    }
    const manifest = loadModManifest(mod.installDir)
    if (!manifest) return { ok: false, error: 'Cannot read manifest for mod' }
    deleteMod(env.value, mod.installDir, manifest)
    return { ok: true }
  })
}