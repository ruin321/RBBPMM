import { ipcMain, WebContents } from 'electron'
import fs from 'fs'
import { spawn } from 'child_process'
import { detectBepInEx, installBepInEx } from '../services/BepInExSetup'
import { installDevApi } from '../services/DevApiSetup'
import { stopGame } from '../services/GameProcess'
import { resolveLaunchScript } from '../services/GameEnvironment'
import { bepinexPluginsDir } from '../constants'
import { runtimeState } from '../store'
import type { InstallProgress, InstallResult, Result } from '../../shared/types'

function requireEnv(): { ok: true; value: string } | { ok: false; error: string } {
  if (!runtimeState.environment) {
    return { ok: false, error: 'Game directory not configured' }
  }
  return { ok: true, value: runtimeState.environment.rootPath }
}

const FIRST_RUN_WAIT_MS = 30000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function registerSetupIpc(getWebContents: () => WebContents | null): void {
  ipcMain.handle('setup:status', async (): Promise<Result<{ hasBepInEx: boolean }>> => {
    const env = requireEnv()
    if (!env.ok) return env
    return { ok: true, value: { hasBepInEx: detectBepInEx(env.value) } }
  })

  ipcMain.handle('setup:bepinex', async (): Promise<Result<boolean>> => {
    const env = requireEnv()
    if (!env.ok) return env
    const emit = (p: InstallProgress): void => {
      getWebContents()?.send('setup:bepinex-progress', p)
    }
    return installBepInEx(env.value, emit)
  })

  ipcMain.handle('setup:install-dev-api', async (): Promise<Result<InstallResult>> => {
    const env = requireEnv()
    if (!env.ok) return env
    const emit = (p: InstallProgress): void => {
      getWebContents()?.send('setup:devapi-progress', p)
    }
    return installDevApi(env.value, runtimeState.environment?.gameVersion, emit)
  })

  ipcMain.handle('setup:install-all', async (): Promise<Result<InstallResult>> => {
    const env = requireEnv()
    if (!env.ok) return env
    const send = (p: InstallProgress): void => {
      getWebContents()?.send('setup:install-all-progress', p)
    }
    const gameRoot = env.value
    const gameVersion = runtimeState.environment?.gameVersion
    const pluginsDir = bepinexPluginsDir(gameRoot)
    const pluginsReady = (): boolean => fs.existsSync(pluginsDir)

    try {
      
      if (!detectBepInEx(gameRoot)) {
        send({ stage: 'bepinex', percent: 5, message: 'Installing BepInEx...' })
        const br = await installBepInEx(gameRoot, (p) => send(p))
        if (!br.ok) return br
      }

      
      if (!pluginsReady()) {
        send({ stage: 'launch', percent: 15, message: 'Launching the game once to initialize BepInEx...' })
        const exe = runtimeState.environment?.executablePath
        if (!exe) return { ok: false, error: 'Game directory not configured' }
        const launchScript = process.platform !== 'win32' ? resolveLaunchScript(gameRoot) : null
        const child = launchScript
          ? spawn('/bin/sh', [launchScript], { cwd: gameRoot, detached: true, stdio: 'ignore' })
          : spawn(exe, [], {
              cwd: gameRoot,
              detached: true,
              stdio: 'ignore',
              windowsHide: false
            })
        child.on('error', () => {
        })
        child.unref()
        const pid = child.pid ?? null
        runtimeState.gamePid = pid

        send({ stage: 'wait', percent: 25, message: 'Waiting for first run (30s)...' })
        await delay(FIRST_RUN_WAIT_MS)

        send({ stage: 'stop', percent: 85, message: 'Stopping the game...' })
        await stopGame(pid)
        send({ stage: 'check', percent: 90, message: 'Checking plugins folder...' })
        if (!pluginsReady()) {
          return {
            ok: false,
            error:
              'DevApi installation failed: the game did not generate a BepInEx plugins folder after first launch. Please launch the game once manually, then retry.'
          }
        }
      }

      
      send({ stage: 'devapi', percent: 92, message: 'Installing the BB+ Dev API...' })
      return await installDevApi(gameRoot, gameVersion, (p) => send(p))
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}