import { execFile } from 'child_process'
import { GAME_EXE_NAME } from '../constants'
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

function pidAlive(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('tasklist.exe', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      resolve(!err && stdout.includes(`${pid}`))
    })
  })
}

function kill(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('taskkill.exe', args, { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (err) => resolve(!err))
  })
}


export async function isGameRunning(): Promise<boolean> {
  if (process.platform !== 'win32') {
    debugLog('GameProcess: non-Windows, process detection disabled')
    return false
  }
  const r = await run(['/FI', `IMAGENAME eq ${GAME_EXE_NAME}`, '/FO', 'CSV', '/NH'])
  return r.ok && r.out.toLowerCase().includes(GAME_EXE_NAME.toLowerCase())
}


export async function stopGame(gamePid: number | null): Promise<boolean> {
  if (process.platform !== 'win32') {
    debugLog('GameProcess: non-Windows, stop disabled')
    return false
  }
  if (gamePid) {
    const alive = await pidAlive(gamePid)
    if (alive && (await kill(['/PID', String(gamePid), '/T', '/F']))) return true
  }
  return kill(['/IM', GAME_EXE_NAME, '/T', '/F'])
}