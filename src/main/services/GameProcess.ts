import { execFile } from 'child_process';
import { GAME_EXE_NAME } from '../constants';
function run(cmd: string, args: string[]): Promise<{
    ok: boolean;
    out: string;
}> {
    return new Promise((resolve) => {
        execFile(cmd, args, { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve(err ? { ok: false, out: '' } : { ok: true, out: stdout }));
    });
}
function taskkill(args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
        execFile('taskkill.exe', args, { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (err) => resolve(!err));
    });
}
// A game process that has terminated can linger in the task list until every
// open handle to it is released, and such a "zombie" still shows up in
// tasklist (with 0 threads and no window). Counting threads is the only
// reliable, locale-independent way to tell a live process from a dead record.
async function listLiveGamePids(): Promise<number[] | null> {
    const script = 'Get-CimInstance Win32_Process -Filter "Name=\'' + GAME_EXE_NAME + '\'" ' +
        '| ForEach-Object { "$($_.ProcessId):$($_.ThreadCount)" }';
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    if (!r.ok)
        return null;
    const pids: number[] = [];
    for (const line of r.out.split(/\r?\n/)) {
        const m = /^(\d+):(\d+)$/.exec(line.trim());
        if (m && Number(m[2]) > 0)
            pids.push(Number(m[1]));
    }
    return pids;
}
export async function isGameRunning(): Promise<boolean> {
    const pids = await listLiveGamePids();
    if (pids)
        return pids.length > 0;
    // PowerShell unavailable: fall back to a plain task list scan.
    const r = await run('tasklist.exe', ['/FI', `IMAGENAME eq ${GAME_EXE_NAME}`, '/FO', 'CSV', '/NH']);
    return r.ok && r.out.toLowerCase().includes(GAME_EXE_NAME.toLowerCase());
}
export async function stopGame(gamePid: number | null): Promise<boolean> {
    if (gamePid) {
        const r = await run('tasklist.exe', ['/FI', `PID eq ${gamePid}`, '/FO', 'CSV', '/NH']);
        if (r.ok && r.out.includes(`${gamePid}`)) {
            const killed = await taskkill(['/PID', String(gamePid), '/T', '/F']);
            if (killed)
                return true;
        }
    }
    return taskkill(['/IM', GAME_EXE_NAME, '/T', '/F']);
}