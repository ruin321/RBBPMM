import { ipcMain } from 'electron';
import { deleteCustomLevel, listCustomLevels, toggleCustomLevel } from '../services/CustomLevelService';
import { findPbplFiles, installLevelStudioPlayable } from '../services/LevelStudioInstaller';
import { extractArchive } from '../services/ModArchiveExtractor';
import { logInfo, logWarn } from '../logger';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CustomLevelDto, LevelStudioInstallResult, Result } from '../../shared/types';
export function registerCustomLevelIpc(): void {
    ipcMain.handle('customLevel:list', async (): Promise<Result<CustomLevelDto[]>> => {
        try {
            return { ok: true, value: listCustomLevels() };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('customLevel:probe', async (_e, { archivePath }: {
        archivePath: string;
    }): Promise<Result<boolean>> => {
        if (!archivePath || typeof archivePath !== 'string') {
            return { ok: false, error: 'invalid archive path' };
        }
        if (!fs.existsSync(archivePath)) {
            return { ok: false, error: `file not found: ${archivePath}` };
        }
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-probe-'));
        try {
            const extractRoot = await extractArchive(archivePath, tmpRoot);
            const pbpl: string[] = [];
            findPbplFiles(extractRoot, pbpl);
            logInfo('customLevel:probe labelled level =', pbpl.length > 0, archivePath);
            return { ok: true, value: pbpl.length > 0 };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logWarn('customLevel:probe failed =', msg);
            return { ok: false, error: msg };
        }
        finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
    ipcMain.handle('customLevel:install', async (_e, { archivePath }: {
        archivePath: string;
    }): Promise<Result<LevelStudioInstallResult>> => {
        if (!archivePath || typeof archivePath !== 'string') {
            return { ok: false, error: 'invalid archive path' };
        }
        if (!fs.existsSync(archivePath)) {
            return { ok: false, error: `file not found: ${archivePath}` };
        }
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-install-'));
        try {
            logInfo('customLevel:install extract =', archivePath);
            const extractRoot = await extractArchive(archivePath, tmpRoot);
            const result = await installLevelStudioPlayable(extractRoot);
            logInfo('customLevel:install installed =', result.playables.length, result.playables);
            return { ok: true, value: result };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logWarn('customLevel:install failed =', msg);
            return { ok: false, error: msg };
        }
        finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
    ipcMain.handle('customLevel:toggle', async (_e, { fileName, enabled }: {
        fileName: string;
        enabled: boolean;
    }): Promise<Result> => {
        try {
            toggleCustomLevel(fileName, Boolean(enabled));
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('customLevel:delete', async (_e, { fileName }: {
        fileName: string;
    }): Promise<Result> => {
        try {
            deleteCustomLevel(fileName);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
}
