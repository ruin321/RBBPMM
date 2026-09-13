import { execFile } from 'child_process'
import { GAME_EXE_NAME } from '../constants'


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
  const r = await run(['/FI', `IMAGENAME eq ${GAME_EXE_NAME}`, '/FO', 'CSV', '/NH'])
  return r.ok && r.out.toLowerCase().includes(GAME_EXE_NAME.toLowerCase())
}

export async function stopGame(gamePid: number | null): Promise<boolean> {
  if (gamePid) {
    const r = await run(['/FI', `PID eq ${gamePid}`, '/FO', 'CSV', '/NH'])
    if (r.ok && r.out.includes(`${gamePid}`)) {
      const killed = await taskkill(['/PID', String(gamePid), '/T', '/F'])
      if (killed) return true
    }
  }
  return taskkill(['/IM', GAME_EXE_NAME, '/T', '/F'])
}
