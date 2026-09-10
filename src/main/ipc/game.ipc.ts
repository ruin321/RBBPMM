import { ipcMain, dialog, shell } from 'electron'
import { spawn } from 'child_process'
import { resolveEnvironment, resolveEnvironmentFromAny, resolveLaunchScript } from '../services/GameEnvironment'
import { isGameRunning, stopGame } from '../services/GameProcess'
import { getStoredExePath, getStoredLaunchScript, setStoredExePath, setStoredLaunchScript, runtimeState } from '../store'
import type { GameEnvironment, Result } from '../../shared/types'


const STEAM_APPID = '1275890'

function envResult(env: GameEnvironment | null): Result<GameEnvironment> {
  if (!env) return { ok: false, error: 'Not a valid Baldi\'s Basics Plus installation (missing the game executable or BALDI_Data folder)' }
  return { ok: true, value: env }
}

function loadCurrentEnv(): GameEnvironment | null {
  if (runtimeState.environment) return runtimeState.environment
  const exe = getStoredExePath()
  if (!exe) return null
  const storedScript = getStoredLaunchScript()
  const env = process.platform === 'win32'
    ? resolveEnvironment(exe)
    : resolveEnvironmentFromAny(exe, storedScript)
  if (env) runtimeState.environment = env
  return env
}

export function registerGameIpc(): void {
  ipcMain.handle('game:get', async (): Promise<Result<GameEnvironment>> => {
    return envResult(loadCurrentEnv())
  })

  ipcMain.handle('game:select-dir', async (): Promise<Result<GameEnvironment>> => {
    const isWin = process.platform === 'win32'
    const res = await dialog.showOpenDialog({
      title: isWin
        ? "Select the Baldi's Basics Plus executable"
        : "Select the Baldi's Basics Plus launch script (.sh) or the game folder",
      properties: isWin ? ['openFile'] : ['openFile', 'openDirectory'],
      filters: isWin
        ? [{ name: 'Executable', extensions: ['exe'] }]
        : [{ name: 'Launch script', extensions: ['sh'] }]
    })
    if (res.canceled || res.filePaths.length === 0) {
      return { ok: false, error: 'cancelled' }
    }
    const picked = res.filePaths[0]
    const isScript = !isWin && picked.toLowerCase().endsWith('.sh')
    const env = isWin
      ? resolveEnvironment(picked)
      : resolveEnvironmentFromAny(picked, isScript ? picked : undefined)
    if (!env) return envResult(null)
    runtimeState.environment = env
    setStoredExePath(env.executablePath)
    setStoredLaunchScript(env.launchScript)
    return envResult(env)
  })

  ipcMain.handle('game:set-dir', async (_e, { exePath }: { exePath: string }): Promise<Result<GameEnvironment>> => {
    const isWin = process.platform === 'win32'
    const isScript = !isWin && exePath.toLowerCase().endsWith('.sh')
    const env = isWin
      ? resolveEnvironment(exePath)
      : resolveEnvironmentFromAny(exePath, isScript ? exePath : undefined)
    if (!env) return envResult(null)
    runtimeState.environment = env
    setStoredExePath(env.executablePath)
    setStoredLaunchScript(env.launchScript)
    return envResult(env)
  })

  ipcMain.handle('game:launch', async (): Promise<Result<{ pid?: number }>> => {
    const env = loadCurrentEnv()
    if (!env) return { ok: false, error: 'Game directory not configured' }
    return new Promise((resolve) => {
      try {
        const isWin = process.platform === 'win32'
        const launchScript = !isWin
          ? env.launchScript ?? resolveLaunchScript(env.rootPath)
          : null
        const child = launchScript
          ? spawn('/bin/sh', [launchScript], {
              cwd: env.rootPath,
              detached: true,
              stdio: 'ignore'
            })
          : spawn(env.executablePath, [], {
              cwd: env.rootPath,
              detached: true,
              stdio: 'ignore',
              windowsHide: false
            })
        child.on('error', (err) => {
          resolve({ ok: false, error: err.message })
        })
        child.unref()
        runtimeState.gamePid = child.pid ?? null
        resolve({ ok: true, value: { pid: child.pid } })
      } catch (err) {
        resolve({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    })
  })

  ipcMain.handle('game:launch-steam', async (): Promise<Result<{ launched: boolean }>> => {
    try {
      await shell.openExternal(`steam://rungameid/${STEAM_APPID}`)
      runtimeState.gamePid = null
      return { ok: true, value: { launched: true } }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('game:is-running', async (): Promise<Result<{ running: boolean }>> => {
    return { ok: true, value: { running: await isGameRunning() } }
  })

  ipcMain.handle('game:stop', async (): Promise<Result<{ stopped: boolean }>> => {
    const stopped = await stopGame(runtimeState.gamePid)
    if (stopped) runtimeState.gamePid = null
    return { ok: true, value: { stopped } }
  })
}