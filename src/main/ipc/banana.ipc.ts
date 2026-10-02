import { ipcMain, WebContents } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { installModArchive, installUnmanaged, hasManifest } from '../services/ModInstaller';
import { createTempDir, extractArchive } from '../services/ModArchiveExtractor';
import { installTexturePacksFromRoot, findPackDirs, hasModStructureInRoot } from '../services/TexturePackService';
import { installLevelStudioPlayable } from '../services/LevelStudioInstaller';
import { installPosterPacksFromRoot } from '../services/PosterPackService';
import { downloadMod, getComments, getPostReplies, getSubmission, getUpdates, searchMods } from '../services/GamebananaService';
import { runtimeState, getAutoInstallAfterDownload } from '../store';
import { debugLog, debugError } from '../logger';
import { linkKnownSubmission } from '../services/ModSourceLinker';
import { loadModManifest } from '../services/ManifestLoader';
import { invalidateModScan, scanRepositoryCached } from '../services/ModRepositoryScanner';
import { LEVEL_STUDIO_CATEGORY_ID, POSTER_PACK_CATEGORY_ID, TEXTURE_PACK_CATEGORY_ID } from '../../shared/types';
import type { GamebananaCommentDto, GamebananaCommentsDto, GamebananaSearchResult, GamebananaSubmissionDto, GamebananaUpdatesDto, InstallResult, JobProgress, LevelStudioPrereqItem, Result } from '../../shared/types';
import { downloadManager } from '../services/DownloadManager';
import { installTracker } from '../services/InstallTracker';
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
const choiceResolvers = new Map<string, (shouldInstall: boolean) => void>();
export function registerBananaIpc(getWebContents: () => WebContents | null): void {
    downloadManager.subscribe((p) => {
        getWebContents()?.send('banana:job-progress', p);
    });

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
    }): Promise<{ ok: true; value: { jobId: string } } | { ok: false; error: string }> => {
        const env = requireEnv();
        if (!env.ok)
            return { ok: false, error: env.error };
        try {
            const submission = await getSubmission(submissionId);
            debugLog('banana:install submissionId =', submissionId, 'name =', submission.name);
            const allFiles = [...submission.files, ...(submission.archivedFiles ?? [])];
            if (!submission.hasFiles || allFiles.length === 0)
                return { ok: false, error: 'This mod has no downloadable files' };
            const realFiles = allFiles.filter((f) => f.id > 0 && !!f.downloadUrl);
            const file = (fileId && fileId > 0 ? realFiles.find((f) => f.id === fileId) : undefined) ??
                [...realFiles].sort((a, b) => b.id - a.id)[0] ??
                allFiles.find((f) => f.id > 0) ??
                allFiles[0];

            const url = file.downloadUrl;
            const jobName = submission.name;

            const jobId = downloadManager.submit(jobName, async (controller, onProgress) => {
                let tmpFile: string | null = null;
                let instId: string | null = null;
                const track = (p: Parameters<typeof onProgress>[0]): void => {
                    onProgress(p);
                    if (instId)
                        installTracker.progress(instId, p);
                };
                try {
                    onProgress({ stage: 'downloading', percent: 0, message: `Downloading ${file.fileName}` });
                    tmpFile = await downloadMod(url, (p) => {
                        const percent = p.total ? Math.min(99, Math.round((p.received / p.total) * 100)) : undefined;
                        onProgress({
                            stage: 'downloading',
                            percent,
                            message: `Downloading ${file.fileName}${p.total ? ` (${Math.round(p.received / 1024 / 1024)}/${Math.round(p.total / 1024 / 1024)} MB)` : ''}`
                        });
                    }, () => controller.signal.aborted);

                    const dlDir = path.join(os.homedir(), 'Downloads', 'BaldiMods');
                    try { fs.mkdirSync(dlDir, { recursive: true }); } catch {  }
                    const savedPath = path.join(dlDir, path.basename(tmpFile));
                    try { fs.copyFileSync(tmpFile, savedPath); } catch {  }

                    const shouldInstall = getAutoInstallAfterDownload()
                        ? await new Promise<boolean>((resolve) => {
                            getWebContents()?.send('banana:need-install-choice', { jobId, savedPath, submissionName: submission.name });
                            choiceResolvers.set(jobId, resolve);
                        })
                        : true;

                    if (!shouldInstall) {
                        onProgress({ stage: 'done', percent: 100, message: `Saved to ${savedPath}` });
                        return;
                    }

                    instId = installTracker.begin(submission.name);
                    track({ stage: 'installing', message: 'Installing...' });
                    const exTemp = createTempDir(env.value);
                    try {
                        track({ stage: 'extracting', message: 'Extracting archive' });
                        const extractRoot = await extractArchive(tmpFile, exTemp);
                        const packDirs = findPackDirs(extractRoot);
                        const modStructure = hasModStructureInRoot(extractRoot);

                        if (submission.categoryId === LEVEL_STUDIO_CATEGORY_ID) {
                            await installLevelStudioPlayable(extractRoot);
                        } else if (submission.categoryId === POSTER_PACK_CATEGORY_ID) {
                            await installPosterPacksFromRoot(env.value, extractRoot, path.basename(tmpFile).replace(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar)$/i, ''));
                        } else if (modStructure) {
                            if (hasManifest(extractRoot)) {
                                const result = await installModArchive(env.value, tmpFile, runtimeState.environment?.gameVersion,
                                    (p) => track({ stage: p.stage as 'extracting' | 'installing', percent: p.percent, message: p.message }),
                                    () => controller.signal.aborted, extractRoot);
                                if (result.mod) {
                                    const mm = loadModManifest(result.mod.installDir);
                                    if (mm) {
                                        try { await linkKnownSubmission(result.mod, mm, submission, file); } catch {  }
                                    }
                                }
                            } else {
                                installUnmanaged(extractRoot, env.value,
                                    (p) => track({ stage: p.stage as 'extracting' | 'installing', percent: p.percent, message: p.message }),
                                    () => controller.signal.aborted);
                            }
                            invalidateModScan(env.value);
                        } else if (submission.categoryId === TEXTURE_PACK_CATEGORY_ID || packDirs.length > 0) {
                            await installTexturePacksFromRoot(env.value, extractRoot, path.basename(tmpFile).replace(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar)$/i, ''));
                        } else {
                            installUnmanaged(extractRoot, env.value,
                                (p) => track({ stage: p.stage as 'extracting' | 'installing', percent: p.percent, message: p.message }),
                                () => controller.signal.aborted);
                            invalidateModScan(env.value);
                        }
                        track({ stage: 'done', percent: 100, message: 'Install complete' });
                        if (instId)
                            installTracker.done(instId, 'Install complete');
                    } finally {
                        try { fs.rmSync(exTemp, { recursive: true, force: true }); } catch {  }
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    debugError('banana:install job failed:', msg);
                    if (instId)
                        installTracker.fail(instId, msg);
                    throw err;
                } finally {
                    if (tmpFile) {
                        try { fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true }); } catch {  }
                    }
                }
            });

            return { ok: true, value: { jobId } };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('banana:cancel', async (_e, { jobId }: { jobId?: string }): Promise<void> => {
        if (jobId) {
            downloadManager.cancel(jobId);
        } else {
            const running = downloadManager.getAll().filter((j) => j.status === 'downloading' || j.status === 'extracting' || j.status === 'installing');
            if (running.length > 0) downloadManager.cancel(running[0].id);
        }
    });
    ipcMain.handle('banana:cancel-job', async (_e, { jobId }: { jobId: string }): Promise<void> => {
        downloadManager.cancel(jobId);
    });
    ipcMain.handle('banana:clear-job', async (_e, { jobId }: { jobId: string }): Promise<void> => {
        downloadManager.remove(jobId);
    });
    ipcMain.handle('banana:clear-completed', async (): Promise<void> => {
        downloadManager.clearCompleted();
    });
    ipcMain.handle('banana:get-jobs', async (): Promise<JobProgress[]> => {
        return downloadManager.getAll().map((j) => ({
            id: j.id,
            name: j.name,
            kind: j.kind,
            stage: j.status,
            percent: j.percent,
            message: j.message,
            error: j.error
        }));
    });
    ipcMain.handle('banana:install-url', async (_e, { url, modType, modId }: {
        url: string;
        modType?: string;
        modId?: number;
    }): Promise<{ ok: true; value: { jobId: string } } | { ok: false; error: string }> => {
        const env = requireEnv();
        if (!env.ok)
            return { ok: false, error: env.error };
        if (!url || typeof url !== 'string')
            return { ok: false, error: 'Missing archive URL' };

        const jobName = path.basename(url.split('?')[0]) || 'mod';

        const jobId = downloadManager.submit(jobName, async (controller, onProgress) => {
            let tmpFile: string | null = null;
            let instId: string | null = null;
            const track = (p: Parameters<typeof onProgress>[0]): void => {
                onProgress(p);
                if (instId)
                    installTracker.progress(instId, p);
            };
            try {
                onProgress({ stage: 'downloading', percent: 0, message: `Downloading...` });
                tmpFile = await downloadMod(url, (p) => {
                    const percent = p.total ? Math.min(99, Math.round((p.received / p.total) * 100)) : undefined;
                    onProgress({
                        stage: 'downloading',
                        percent,
                        message: `Downloading (...)${p.total ? ` (${Math.round(p.received / 1024 / 1024)}/${Math.round(p.total / 1024 / 1024)} MB)` : ''}`
                    });
                }, () => controller.signal.aborted);

                const dlDir = path.join(os.homedir(), 'Downloads', 'BaldiMods');
                try { fs.mkdirSync(dlDir, { recursive: true }); } catch {  }
                const savedPath = path.join(dlDir, path.basename(tmpFile));
                try { fs.copyFileSync(tmpFile, savedPath); } catch {  }

                const shouldInstall = getAutoInstallAfterDownload()
                    ? await new Promise<boolean>((resolve) => {
                        getWebContents()?.send('banana:need-install-choice', { jobId, savedPath, submissionName: path.basename(url.split('?')[0]) || 'mod' });
                        choiceResolvers.set(jobId, resolve);
                    })
                    : true;

                if (!shouldInstall) {
                    onProgress({ stage: 'done', percent: 100, message: `Saved to ${savedPath}` });
                    return;
                }

                instId = installTracker.begin(jobName);
                track({ stage: 'installing', message: 'Installing...' });
                const exTemp = createTempDir(env.value);
                try {
                    track({ stage: 'extracting', message: 'Extracting archive' });
                    const extractRoot = await extractArchive(tmpFile, exTemp);
                    const mt = (modType || '').toLowerCase();
                    if (mt.includes('level') || mt.includes('map')) {
                        await installLevelStudioPlayable(extractRoot);
                    } else if (mt.includes('texture')) {
                        await installTexturePacksFromRoot(env.value, extractRoot, path.basename(tmpFile).replace(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar)$/i, ''));
                    } else {
                        if (hasManifest(extractRoot)) {
                            await installModArchive(env.value, tmpFile, runtimeState.environment?.gameVersion,
                                (p) => track({ stage: p.stage as 'extracting' | 'installing', percent: p.percent, message: p.message }),
                                () => controller.signal.aborted, extractRoot);
                        } else {
                            installUnmanaged(extractRoot, env.value,
                                (p) => track({ stage: p.stage as 'extracting' | 'installing', percent: p.percent, message: p.message }),
                                () => controller.signal.aborted);
                        }
                        invalidateModScan(env.value);
                    }
                    track({ stage: 'done', percent: 100, message: 'Install complete' });
                    if (instId)
                        installTracker.done(instId, 'Install complete');
                } finally {
                    try { fs.rmSync(exTemp, { recursive: true, force: true }); } catch {  }
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                debugError('banana:install-url job failed:', msg);
                if (instId)
                    installTracker.fail(instId, msg);
                throw err;
            } finally {
                if (tmpFile) {
                    try { fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true }); } catch {  }
                }
            }
        });

        return { ok: true, value: { jobId } };
    });
    ipcMain.handle('banana:confirm-install-choice', (_e, { jobId, shouldInstall }: { jobId: string; shouldInstall: boolean }): void => {
        const r = choiceResolvers.get(jobId);
        if (r) {
            choiceResolvers.delete(jobId);
            r(!!shouldInstall);
        }
    });
}
