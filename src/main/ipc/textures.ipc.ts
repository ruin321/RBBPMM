import { ipcMain } from 'electron';
import { installTexturePack, listTexturePacks, probeTexturePackArchive, setTexturePackEnabled, uninstallTexturePack } from '../services/TexturePackService';
import { texturePacksDir } from '../constants';
import { runtimeState } from '../store';
import { installTracker } from '../services/InstallTracker';
import path from 'path';
import type { Result, TexturePackInstallResult, TexturePackListResult, TexturePackProgress } from '../../shared/types';
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
export function registerTexturesIpc(): void {
    ipcMain.handle('textures:list', async (): Promise<Result<TexturePackListResult>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        try {
            return {
                ok: true,
                value: { installDir: texturePacksDir(env.value), packs: listTexturePacks(env.value) }
            };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('textures:probe', async (_e, { archivePath }: {
        archivePath: string;
    }): Promise<Result<boolean>> => {
        try {
            return { ok: true, value: await probeTexturePackArchive(archivePath) };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('textures:install', async (_e, { archivePath }: {
        archivePath: string;
    }): Promise<Result<TexturePackInstallResult>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        const instId = installTracker.begin(path.basename(archivePath));
        try {
            const emit = (p: TexturePackProgress): void => {
                const wc = _e.sender;
                if (!wc.isDestroyed())
                    wc.send('textures:install-progress', p);
                installTracker.progress(instId, p);
            };
            const value = await installTexturePack(env.value, archivePath, (stage) => {
                emit({ stage });
            });
            installTracker.done(instId);
            return { ok: true, value };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            installTracker.fail(instId, msg);
            return { ok: false, error: msg };
        }
    });
    ipcMain.handle('textures:uninstall', async (_e, { folderName }: {
        folderName: string;
    }): Promise<Result> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        try {
            uninstallTexturePack(env.value, folderName);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('textures:toggle-enabled', async (_e, { folderName, enabled }: {
        folderName: string;
        enabled: boolean;
    }): Promise<Result> => {
        try {
            setTexturePackEnabled(folderName, enabled);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
}
