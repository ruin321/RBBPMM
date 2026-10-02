import { ipcMain } from 'electron';
import { installPosterPack, listPosterPacks, probePosterPackArchive, setPosterPackEnabled, uninstallPosterPack } from '../services/PosterPackService';
import { customPostersDir } from '../constants';
import { runtimeState } from '../store';
import type { PosterPackInstallResult, PosterPackListResult, PosterPackProgress, Result } from '../../shared/types';
function requireEnv(): {
    ok: true;
    value: string;
} | {
    ok: false;
    error: string;
} {
    if (!runtimeState.environment) {
        return { ok: false, error: 'Game directory not configured' };
    }
    return { ok: true, value: runtimeState.environment.rootPath };
}
export function registerPostersIpc(): void {
    ipcMain.handle('posters:list', async (): Promise<Result<PosterPackListResult>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        try {
            return {
                ok: true,
                value: { installDir: customPostersDir(env.value), packs: listPosterPacks(env.value) }
            };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('posters:probe', async (_e, { archivePath }: {
        archivePath: string;
    }): Promise<Result<boolean>> => {
        try {
            return { ok: true, value: await probePosterPackArchive(archivePath) };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('posters:install', async (_e, { archivePath }: {
        archivePath: string;
    }): Promise<Result<PosterPackInstallResult>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        try {
            const value = await installPosterPack(env.value, archivePath, (stage) => {
                const wc = _e.sender;
                if (!wc.isDestroyed()) {
                    const p: PosterPackProgress = { stage };
                    wc.send('posters:install-progress', p);
                }
            });
            return { ok: true, value };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('posters:uninstall', async (_e, { folderName }: {
        folderName: string;
    }): Promise<Result> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        try {
            uninstallPosterPack(env.value, folderName);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('posters:toggle-enabled', async (_e, { folderName, enabled }: {
        folderName: string;
        enabled: boolean;
    }): Promise<Result> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        try {
            setPosterPackEnabled(env.value, folderName, enabled);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
}
