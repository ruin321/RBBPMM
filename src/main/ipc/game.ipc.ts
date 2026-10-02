import { ipcMain, dialog, BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import { resolveEnvironment } from '../services/GameEnvironment';
import { isGameRunning, stopGame } from '../services/GameProcess';
import { getStoredExePath, setStoredExePath, runtimeState } from '../store';
import type { GameEnvironment, Result } from '../../shared/types';
const STEAM_APPID = '1275890';
function envResult(env: GameEnvironment | null): Result<GameEnvironment> {
    if (!env)
        return { ok: false, error: 'Not a valid Baldi\'s Basics Plus installation (missing the game executable or BALDI_Data folder)' };
    return { ok: true, value: env };
}
function loadCurrentEnv(): GameEnvironment | null {
    if (runtimeState.environment)
        return runtimeState.environment;
    const exe = getStoredExePath();
    if (!exe)
        return null;
    const env = resolveEnvironment(exe);
    if (env)
        runtimeState.environment = env;
    return env;
}
function minimizeMainWindow(): void {
    const w = BrowserWindow.getAllWindows()[0];
    if (w)
        w.minimize();
}
// Tell the renderer the game stopped as soon as the process we spawned exits,
// instead of waiting for the next poll.
async function broadcastRunning(): Promise<void> {
    const running = await isGameRunning();
    for (const w of BrowserWindow.getAllWindows())
        w.webContents.send('game:running-changed', running);
}
function watchForExit(child: ChildProcess): void {
    const pid = child.pid;
    child.on('exit', () => {
        if (runtimeState.gamePid === pid)
            runtimeState.gamePid = null;
        // Re-check instead of blindly reporting false so that a game process
        // which re-launched itself is not mistaken for a finished one.
        void broadcastRunning();
    });
}
export function registerGameIpc(): void {
    ipcMain.handle('game:get', async (): Promise<Result<GameEnvironment>> => {
        return envResult(loadCurrentEnv());
    });
    ipcMain.handle('game:select-dir', async (): Promise<Result<GameEnvironment>> => {
        const res = await dialog.showOpenDialog({
            title: 'Select the Baldi\'s Basics Plus executable',
            properties: ['openFile'],
            filters: [{ name: 'Executable', extensions: ['exe'] }]
        });
        if (res.canceled || res.filePaths.length === 0) {
            return { ok: false, error: 'cancelled' };
        }
        const env = resolveEnvironment(res.filePaths[0]);
        if (!env)
            return envResult(null);
        runtimeState.environment = env;
        setStoredExePath(env.executablePath);
        return envResult(env);
    });
    ipcMain.handle('game:set-dir', async (_e, { exePath }: {
        exePath: string;
    }): Promise<Result<GameEnvironment>> => {
        const env = resolveEnvironment(exePath);
        if (!env)
            return envResult(null);
        runtimeState.environment = env;
        setStoredExePath(env.executablePath);
        return envResult(env);
    });
    ipcMain.handle('game:launch', async (): Promise<Result<{
        pid?: number;
    }>> => {
        const env = loadCurrentEnv();
        if (!env)
            return { ok: false, error: 'Game directory not configured' };
        return new Promise((resolve) => {
            try {
                const child = spawn(env.executablePath, [], {
                    cwd: env.rootPath,
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: false
                });
                child.on('error', (err) => {
                    resolve({ ok: false, error: err.message });
                });
                child.unref();
                runtimeState.gamePid = child.pid ?? null;
                watchForExit(child);
                minimizeMainWindow();
                resolve({ ok: true, value: { pid: child.pid } });
            }
            catch (err) {
                resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
            }
        });
    });
    ipcMain.handle('game:launch-steam', async (): Promise<Result<{
        launched: boolean;
    }>> => {
        const env = loadCurrentEnv();
        if (!env)
            return { ok: false, error: 'Game directory not configured' };
        return new Promise((resolve) => {
            try {
                // Launch the user-selected baldi.exe inside Steam's context:
                // injecting the app id makes the Steam overlay and playtime
                // tracking attach to this run.
                const child = spawn(env.executablePath, [], {
                    cwd: env.rootPath,
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: false,
                    env: {
                        ...process.env,
                        SteamAppId: STEAM_APPID,
                        SteamGameId: STEAM_APPID,
                        SteamOverlayGameId: STEAM_APPID
                    }
                });
                child.on('error', (err) => {
                    resolve({ ok: false, error: err.message });
                });
                child.unref();
                runtimeState.gamePid = child.pid ?? null;
                watchForExit(child);
                minimizeMainWindow();
                resolve({ ok: true, value: { launched: true } });
            }
            catch (err) {
                resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
            }
        });
    });
    ipcMain.handle('game:is-running', async (): Promise<Result<{
        running: boolean;
    }>> => {
        return { ok: true, value: { running: await isGameRunning() } };
    });
    ipcMain.handle('game:stop', async (): Promise<Result<{
        stopped: boolean;
    }>> => {
        const stopped = await stopGame(runtimeState.gamePid);
        if (stopped)
            runtimeState.gamePid = null;
        return { ok: true, value: { stopped } };
    });
}
