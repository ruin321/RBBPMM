import { execFile } from 'child_process'
import { GAME_EXE_NAME, isGameExeName } from '../constants'
import { runtimeState } from '../store'
import { debugLog } from '../logger'


function run(args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(
      'tasklist.exe',
      args,
      { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 },
      (err, stdout) => resolve(err ? { ok: false, out: '' } : { ok: true, out: stdout })
    )
  })
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function taskkill(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'taskkill.exe',
      args,
      { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 },
      (err) => resolve(!err)
    )
  })
}

export async function isGameRunning(): Promise<boolean> {
  if (process.platform === 'win32') {
    const r = await run(['/FI', `IMAGENAME eq ${GAME_EXE_NAME}`, '/FO', 'CSV', '/NH'])
    return r.ok && r.out.toLowerCase().includes(GAME_EXE_NAME.toLowerCase())
  }
  const pid = runtimeState.gamePid
  if (pid == null) {
    debugLog('GameProcess: non-Windows, no tracked pid')
    return false
  }
  return pidAlive(pid)
}

export async function stopGame(gamePid: number | null): Promise<boolean> {
  if (process.platform === 'win32') {
    if (gamePid) {
      const r = await run(['/FI', `PID eq ${gamePid}`, '/FO', 'CSV', '/NH'])
      if (r.ok && r.out.includes(`${gamePid}`)) {
        const killed = await taskkill(['/PID', String(gamePid), '/T', '/F'])
        if (killed) return true
      }
    }
    return taskkill(['/IM', GAME_EXE_NAME, '/T', '/F'])
  }
  const target = gamePid ?? runtimeState.gamePid
  if (target == null) return false
  try {
    process.kill(target)
  } catch {
    try {
      process.kill(target, 'SIGKILL')
    } catch {
      return false
    }
  }
  return true
}