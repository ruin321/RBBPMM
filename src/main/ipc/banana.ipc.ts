import { ipcMain, WebContents } from 'electron';
import fs from 'fs';
import path from 'path';
import { installModArchive, installUnmanaged, hasManifest } from '../services/ModInstaller';
import { createTempDir, extractArchive } from '../services/ModArchiveExtractor';
import { installTexturePacksFromRoot, findPackDirs, hasModStructureInRoot } from '../services/TexturePackService';
import { installLevelStudioPlayable } from '../services/LevelStudioInstaller';
import { downloadMod, getComments, getPostReplies, getSubmission, getUpdates, searchMods } from '../services/GamebananaService';
import { runtimeState } from '../store';
import { debugLog, debugError } from '../logger';
import { linkKnownSubmission } from '../services/ModSourceLinker';
import { loadModManifest } from '../services/ManifestLoader';
import { invalidateModScan, scanRepositoryCached } from '../services/ModRepositoryScanner';
import { LEVEL_STUDIO_CATEGORY_ID, TEXTURE_PACK_CATEGORY_ID } from '../../shared/types';
import type { GamebananaCommentDto, GamebananaCommentsDto, GamebananaSearchResult, GamebananaSubmissionDto, GamebananaUpdatesDto, InstallProgress, InstallResult, LevelStudioPrereqItem, Result } from '../../shared/types';
function requireEnv(): {
    ok: true;
    value: string;
} | {
    ok: false;
    error: string;
} {
    if (!runtimeState.environment) {
        return { ok: false, error: 'Game directory not configured. Go to Settings first.' };
    }
    return { ok: true, value: runtimeState.environment.rootPath };
}
let busy = false;
export function registerBananaIpc(getWebContents: () => WebContents | null): void {
    const emit = (p: InstallProgress): void => {
        getWebContents()?.send('mods:install-progress', p);
    };
    ipcMain.handle('banana:search', async (_e, { page, query, category }: {
        page: number;
        query?: string;
        category?: number;
    }): Promise<Result<GamebananaSearchResult>> => {
        try {
            const value = await searchMods(page, query, category);
            return { ok: true, value };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('banana:get', async (_e, { submissionId }: {
        submissionId: number;
    }): Promise<Result<GamebananaSubmissionDto>> => {
        try {
            const value = await getSubmission(submissionId);
            return { ok: true, value };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('banana:get-comments', async (_e, { submissionId }: {
        submissionId: number;
    }): Promise<Result<GamebananaCommentsDto>> => {
        const value = await getComments(submissionId);
        return { ok: true, value };
    });
    ipcMain.handle('banana:get-updates', async (_e, { submissionId }: {
        submissionId: number;
    }): Promise<Result<GamebananaUpdatesDto>> => {
        const value = await getUpdates(submissionId);
        return { ok: true, value };
    });
    ipcMain.handle('banana:get-post-replies', async (_e, { postId }: {
        postId: number;
    }): Promise<Result<GamebananaCommentDto[]>> => {
        const value = await getPostReplies(postId);
        return { ok: true, value };
    });
    const LEVEL_STUDIO_PREREQS: {
        modId: number;
        nameKey: string;
        patterns: RegExp[];
    }[] = [
        { modId: 383711, nameKey: 'devApi', patterns: [/mtm101baldapi/i] },
        { modId: 617565, nameKey: 'loader', patterns: [/plusstudiolevelloader/i] },
        { modId: 617567, nameKey: 'levelStudio', patterns: [/pluslevelstudio/i, /levelstudio/i] }
    ];
    function matchInstalled(target: string | undefined, patterns: RegExp[]): boolean {
        if (!target)
            return false;
        return patterns.some((p) => p.test(target));
    }
    function checkLevelStudioPrereq(gameRoot: string): LevelStudioPrereqItem[] {
        const mods = scanRepositoryCached(gameRoot, runtimeState.environment?.gameVersion);
        return LEVEL_STUDIO_PREREQS.map(({ modId, nameKey, patterns }) => {
            const installed = mods.some((m) => {
                const names = [m.name, m.identifyName, m.dllFile, m.dllDirectory, ...(m.pluginFiles ?? [])];
                return names.some((n) => matchInstalled(n, patterns));
            });
            return { modId, nameKey, installed };
        });
    }
    ipcMain.handle('banana:levelstudio-prereq', async (): Promise<Result<LevelStudioPrereqItem[]>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        try {
            return { ok: true, value: checkLevelStudioPrereq(env.value) };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('banana:install', async (_e, { submissionId, fileId }: {
        submissionId: number;
        fileId?: number;
    }): Promise<Result<InstallResult>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        if (busy)
            return { ok: false, error: 'Another download/install is already running' };
        busy = true;
        let tmpFile: string | null = null;
        try {
            const submission = await getSubmission(submissionId);
            debugLog('banana:install submissionId =', submissionId, 'name =', submission.name, 'categoryId =', submission.categoryId);
            const allFiles = [...submission.files, ...(submission.archivedFiles ?? [])];
            if (!submission.hasFiles || allFiles.length === 0) {
                return { ok: false, error: 'This mod has no downloadable files' };
            }
            const realFiles = allFiles.filter((f) => f.id > 0 && !!f.downloadUrl);
            const file = (fileId && fileId > 0 ? realFiles.find((f) => f.id === fileId) : undefined) ??
                [...realFiles].sort((a, b) => b.id - a.id)[0] ??
                allFiles.find((f) => f.id > 0) ??
                allFiles[0];
            runtimeState.cancelController = new AbortController();
            const signal = runtimeState.cancelController.signal;
            emit({ stage: 'downloading', percent: 0, message: `Downloading ${file.fileName}` });
            const url = file.downloadUrl;
            tmpFile = await downloadMod(url, (p) => {
                const percent = p.total ? Math.min(99, Math.round((p.received / p.total) * 100)) : undefined;
                emit({
                    stage: 'downloading',
                    percent,
                    message: `Downloading ${file.fileName}${p.total ? ` (${Math.round(p.received / 1024 / 1024)}/${Math.round(p.total / 1024 / 1024)} MB)` : ''}`
                });
            }, () => signal.aborted);
            emit({ stage: 'installing', message: 'Installing...' });
            let result: InstallResult;
            const exTemp = createTempDir(env.value);
            try {
                emit({ stage: 'extracting', message: 'Extracting archive' });
                const extractRoot = await extractArchive(tmpFile, exTemp);
                const packDirs = findPackDirs(extractRoot);
                const modStructure = hasModStructureInRoot(extractRoot);
                debugLog('banana:install detected packDirs =', packDirs.length, 'categoryId =', submission.categoryId, 'modStructure =', modStructure);
                if (submission.categoryId === LEVEL_STUDIO_CATEGORY_ID) {
                    debugLog('banana:install routing to Level Studio Playables install');
                    const lsResult = await installLevelStudioPlayable(extractRoot);
                    result = {
                        mod: undefined,
                        warnings: [],
                        readmes: lsResult.readmes,
                        levelStudio: lsResult
                    };
                }
                else if (modStructure) {
                    if (hasManifest(extractRoot)) {
                        result = await installModArchive(env.value, tmpFile, runtimeState.environment?.gameVersion, (p) => emit(p), () => signal.aborted, extractRoot);
                        if (result.mod) {
                            const mm = loadModManifest(result.mod.installDir);
                            if (mm) {
                                try {
                                    await linkKnownSubmission(result.mod, mm, submission, file);
                                }
                                catch {
                                }
                            }
                        }
                    }
                    else {
                        installUnmanaged(extractRoot, env.value, (p) => emit(p), () => signal.aborted);
                        result = { mod: undefined, warnings: [] };
                    }
                    invalidateModScan(env.value);
                }
                else if (submission.categoryId === TEXTURE_PACK_CATEGORY_ID || packDirs.length > 0) {
                    debugLog('banana:install routing to Texture Packs install');
                    const packResult = await installTexturePacksFromRoot(env.value, extractRoot, path.basename(tmpFile).replace(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar)$/i, ''));
                    result = {
                        mod: undefined,
                        warnings: [],
                        texturePacks: packResult.installed,
                        readmes: packResult.readmes
                    };
                }
                else {
                    installUnmanaged(extractRoot, env.value, (p) => emit(p), () => signal.aborted);
                    invalidateModScan(env.value);
                    result = { mod: undefined, warnings: [] };
                }
            }
            finally {
                try {
                    fs.rmSync(exTemp, { recursive: true, force: true });
                }
                catch {
                }
            }
            return { ok: true, value: result };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            debugError('banana:install failed:', msg);
            if (runtimeState.cancelController?.signal.aborted)
                return { ok: false, error: 'Cancelled' };
            return { ok: false, error: msg };
        }
        finally {
            if (tmpFile) {
                try {
                    fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
                }
                catch {
                }
            }
            runtimeState.cancelController = null;
            busy = false;
        }
    });
    ipcMain.handle('banana:cancel', async (): Promise<void> => {
        runtimeState.cancelController?.abort();
    });
    ipcMain.handle('banana:install-url', async (_e, { url, modType, modId }: {
        url: string;
        modType?: string;
        modId?: number;
    }): Promise<Result<InstallResult>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        if (!url || typeof url !== 'string')
            return { ok: false, error: 'Missing archive URL' };
        if (busy)
            return { ok: false, error: 'Another download/install is already running' };
        busy = true;
        let tmpFile: string | null = null;
        try {
            runtimeState.cancelController = new AbortController();
            const signal = runtimeState.cancelController.signal;
            emit({ stage: 'downloading', percent: 0, message: `Downloading ${url}` });
            tmpFile = await downloadMod(url, (p) => {
                const percent = p.total ? Math.min(99, Math.round((p.received / p.total) * 100)) : undefined;
                emit({
                    stage: 'downloading',
                    percent,
                    message: `Downloading (...)${p.total ? ` (${Math.round(p.received / 1024 / 1024)}/${Math.round(p.total / 1024 / 1024)} MB)` : ''}`
                });
            }, () => signal.aborted);
            emit({ stage: 'installing', message: 'Installing...' });
            let result: InstallResult;
            const exTemp = createTempDir(env.value);
            try {
                emit({ stage: 'extracting', message: 'Extracting archive' });
                const extractRoot = await extractArchive(tmpFile, exTemp);
                const mt = (modType || '').toLowerCase();
                debugLog('banana:install-url modType =', mt, 'modId =', modId);
                if (mt.includes('level') || mt.includes('map')) {
                    debugLog('banana:install-url routing to Level Studio Playables install');
                    const lsResult = await installLevelStudioPlayable(extractRoot);
                    result = {
                        mod: undefined,
                        warnings: [],
                        readmes: lsResult.readmes,
                        levelStudio: lsResult
                    };
                }
                else if (mt.includes('texture')) {
                    debugLog('banana:install-url routing to Texture Packs install');
                    const packResult = await installTexturePacksFromRoot(env.value, extractRoot, path.basename(tmpFile).replace(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar)$/i, ''));
                    result = {
                        mod: undefined,
                        warnings: [],
                        texturePacks: packResult.installed,
                        readmes: packResult.readmes
                    };
                }
                else {
                    debugLog('banana:install-url routing to Mod install');
                    if (hasManifest(extractRoot)) {
                        result = await installModArchive(env.value, tmpFile, runtimeState.environment?.gameVersion, (p) => emit(p), () => signal.aborted, extractRoot);
                    }
                    else {
                        installUnmanaged(extractRoot, env.value, (p) => emit(p), () => signal.aborted);
                        result = { mod: undefined, warnings: [] };
                    }
                    invalidateModScan(env.value);
                }
            }
            finally {
                try {
                    fs.rmSync(exTemp, { recursive: true, force: true });
                }
                catch {
                }
            }
            return { ok: true, value: result };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            debugError('banana:install-url failed:', msg);
            if (runtimeState.cancelController?.signal.aborted)
                return { ok: false, error: 'Cancelled' };
            return { ok: false, error: msg };
        }
        finally {
            if (tmpFile) {
                try {
                    fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
                }
                catch {
                }
            }
            runtimeState.cancelController = null;
            busy = false;
        }
    });
}
