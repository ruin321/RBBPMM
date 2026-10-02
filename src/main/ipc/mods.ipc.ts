import fs from 'fs';
import { ipcMain, WebContents } from 'electron';
import { loadModManifest } from '../services/ManifestLoader';
import { scanRepositoryCached, invalidateModScan, patchModScanEntry } from '../services/ModRepositoryScanner';
import { installModArchive, installUnmanaged, hasManifest } from '../services/ModInstaller';
import { createTempDir, extractArchive, removeDirIfInside } from '../services/ModArchiveExtractor';
import { buildPlan } from '../services/ModArchivePlanner';
import { collectReadmes, ReadmeFile } from '../services/ReadmeCollector';
import { toggleActivation, toggleLegacyPlugin } from '../services/ModActivator';
import { deleteMod, deleteLegacyPlugin } from '../services/ModUnInstaller';
import { checkForUpdate, persistArchiveName, updateMod } from '../services/ModSourceLinker';
import { isInside } from '../services/PathGuard';
import { BEPINEX_FOLDER, PLUGINS_FOLDER } from '../constants';
import path from 'path';
import { runtimeState } from '../store';
import { downloadManager } from '../services/DownloadManager';
import type { InstallProgress, ModInstallOutcome, ModItemDto, ModUpdateInfoDto, Result } from '../../shared/types';
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
function findMod(gameRoot: string, guid: string): {
    mod: ModItemDto;
    manifest: NonNullable<ReturnType<typeof loadModManifest>>;
} | {
    ok: false;
    error: string;
} {
    const list = scanRepositoryCached(gameRoot, runtimeState.environment?.gameVersion);
    const mod = list.find((m) => m.guid === guid);
    if (!mod)
        return { ok: false, error: 'Mod not found: ' + guid };
    if (mod.guid.startsWith('legacy:'))
        return { ok: false, error: 'Legacy mods cannot be updated' };
    const manifest = loadModManifest(mod.installDir);
    if (!manifest)
        return { ok: false, error: 'Cannot read manifest for mod' };
    return { mod, manifest };
}
let progressSink: ((p: InstallProgress) => void) | null = null;
export function registerModsIpc(getWebContents: () => WebContents | null): void {
    const emit = (p: InstallProgress): void => {
        progressSink?.(p);
        getWebContents()?.send('mods:install-progress', p);
    };
    ipcMain.handle('mods:list', async (): Promise<Result<ModItemDto[]>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        const mods = scanRepositoryCached(env.value, runtimeState.environment?.gameVersion);
        return { ok: true, value: mods };
    });
    ipcMain.handle('mods:install', async (_e, { archivePath }: {
        archivePath: string;
    }): Promise<Result<ModInstallOutcome>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        try {
            const jobName = `Mod: ${path.basename(archivePath)}`;
            let resolveResult!: (v: ModInstallOutcome) => void;
            let rejectResult!: (e: unknown) => void;
            const resultPromise = new Promise<ModInstallOutcome>((resolve, reject) => {
                resolveResult = resolve;
                rejectResult = reject;
            });
            downloadManager.submit(jobName, async (controller, onProgress) => {
                runtimeState.cancelController = controller.signal.aborted ? null : new AbortController();
                const signal = runtimeState.cancelController?.signal ?? new AbortController().signal;
                progressSink = (p) => {
                    if (p.stage === 'start' || p.stage === 'extracting')
                        onProgress({ stage: 'extracting', percent: p.percent, message: p.message });
                    else
                        onProgress({ stage: 'installing', percent: p.percent, message: p.message });
                    const wc = _e.sender;
                    if (!wc.isDestroyed())
                        wc.send('mods:install-progress', p);
                };
                const tempRoot = createTempDir(env.value);
                try {
                    emit({ stage: 'start', percent: 0, message: 'Starting install' });
                    emit({ stage: 'extracting', message: 'Extracting archive' });
                    const extractRoot = await extractArchive(archivePath, tempRoot);
                    const readmes: ReadmeFile[] = [];
                    collectReadmes(extractRoot, readmes, 8);
                    if (hasManifest(extractRoot)) {
                        const result = await installModArchive(env.value, archivePath, runtimeState.environment?.gameVersion, (p) => emit(p), () => signal.aborted, extractRoot);
                        if (result.mod) {
                            const mm = loadModManifest(result.mod.installDir);
                            if (mm)
                                persistArchiveName(result.mod.installDir, mm, path.basename(archivePath));
                        }
                        invalidateModScan(env.value);
                        onProgress({ stage: 'done', percent: 100, message: 'Install complete' });
                        resolveResult({ mode: 'manifest', modName: result.mod?.name ?? '', readmes });
                        return;
                    }
                    const plan = buildPlan(extractRoot);
                    if (plan.needsConfirm) {
                        // No actual install performed — just return the plan
                        progressSink = null;
                        runtimeState.cancelController = null;
                        if (fs.existsSync(tempRoot))
                            removeDirIfInside(env.value, tempRoot);
                        resolveResult({ mode: 'confirm', plan, readmes });
                        return;
                    }
                    const modName = installUnmanaged(extractRoot, env.value, (p) => emit(p), () => signal.aborted);
                    invalidateModScan(env.value);
                    onProgress({ stage: 'done', percent: 100, message: 'Install complete' });
                    resolveResult({ mode: 'unmanaged', modName, readmes });
                } finally {
                    if (fs.existsSync(tempRoot))
                        removeDirIfInside(env.value, tempRoot);
                    progressSink = null;
                    runtimeState.cancelController = null;
                }
            });
            const value = await resultPromise;
            return { ok: true, value };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('mods:install-unmanaged', async (_e, { archivePath }: {
        archivePath: string;
    }): Promise<Result<{
        modName: string;
        readmes: ReadmeFile[];
    }>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        try {
            const jobName = `Mod (unmanaged): ${path.basename(archivePath)}`;
            let resolveResult!: (v: { modName: string; readmes: ReadmeFile[] }) => void;
            let rejectResult!: (e: unknown) => void;
            const resultPromise = new Promise<{ modName: string; readmes: ReadmeFile[] }>((resolve, reject) => {
                resolveResult = resolve;
                rejectResult = reject;
            });
            downloadManager.submit(jobName, async (controller, onProgress) => {
                runtimeState.cancelController = new AbortController();
                const signal = runtimeState.cancelController.signal;
                progressSink = (p) => {
                    if (p.stage === 'start' || p.stage === 'extracting')
                        onProgress({ stage: 'extracting', percent: p.percent, message: p.message });
                    else
                        onProgress({ stage: 'installing', percent: p.percent, message: p.message });
                    const wc = _e.sender;
                    if (!wc.isDestroyed())
                        wc.send('mods:install-progress', p);
                };
                const tempRoot = createTempDir(env.value);
                try {
                    emit({ stage: 'start', percent: 0, message: 'Starting install' });
                    emit({ stage: 'extracting', message: 'Extracting archive' });
                    const extractRoot = await extractArchive(archivePath, tempRoot);
                    const readmes: ReadmeFile[] = [];
                    collectReadmes(extractRoot, readmes, 8);
                    const modName = installUnmanaged(extractRoot, env.value, (p) => emit(p), () => signal.aborted);
                    invalidateModScan(env.value);
                    onProgress({ stage: 'done', percent: 100, message: 'Install complete' });
                    resolveResult({ modName, readmes });
                } finally {
                    if (fs.existsSync(tempRoot))
                        removeDirIfInside(env.value, tempRoot);
                    progressSink = null;
                    runtimeState.cancelController = null;
                }
            });
            const value = await resultPromise;
            return { ok: true, value };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('mods:install-cancel', async (): Promise<void> => {
        runtimeState.cancelController?.abort();
    });
    ipcMain.handle('mods:toggle', async (_e, { guid, activate, installDir }: {
        guid: string;
        activate: boolean;
        installDir?: string;
    }): Promise<Result<{
        activated: boolean;
    }>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        const isLegacy = guid.startsWith('legacy:');
        const pluginsDir = path.join(env.value, BEPINEX_FOLDER, PLUGINS_FOLDER);
        const directDir = !isLegacy &&
            installDir &&
            isInside(pluginsDir, path.resolve(installDir)) &&
            fs.existsSync(installDir);
        if (directDir) {
            const manifest = loadModManifest(installDir);
            if (!manifest)
                return { ok: false, error: 'Cannot read manifest for mod' };
            const res = toggleActivation(env.value, installDir, manifest, activate);
            patchModScanEntry(env.value, guid, (m) => {
                m.activated = res.activated;
            });
            return { ok: true, value: res };
        }
        const list = scanRepositoryCached(env.value, runtimeState.environment?.gameVersion);
        const mod = list.find((m) => m.guid === guid);
        if (!mod)
            return { ok: false, error: 'Mod not found: ' + guid };
        if (mod.guid.startsWith('legacy:')) {
            const res = toggleLegacyPlugin(mod.installDir, mod.pluginFiles, activate);
            patchModScanEntry(env.value, guid, (m) => {
                m.activated = res.activated;
                m.pluginFiles = res.pluginFiles;
            });
            return { ok: true, value: { activated: res.activated } };
        }
        const manifest = loadModManifest(mod.installDir);
        if (!manifest)
            return { ok: false, error: 'Cannot read manifest for mod' };
        const res = toggleActivation(env.value, mod.installDir, manifest, activate);
        patchModScanEntry(env.value, guid, (m) => {
            m.activated = res.activated;
        });
        return { ok: true, value: res };
    });
    ipcMain.handle('mods:uninstall', async (_e, { guid }: {
        guid: string;
    }): Promise<Result> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        const list = scanRepositoryCached(env.value, runtimeState.environment?.gameVersion);
        const mod = list.find((m) => m.guid === guid);
        if (!mod)
            return { ok: false, error: 'Mod not found: ' + guid };
        if (mod.guid.startsWith('legacy:')) {
            deleteLegacyPlugin(env.value, mod.installDir, mod.pluginFiles);
            invalidateModScan(env.value);
            return { ok: true };
        }
        const manifest = loadModManifest(mod.installDir);
        if (!manifest)
            return { ok: false, error: 'Cannot read manifest for mod' };
        deleteMod(env.value, mod.installDir, manifest);
        invalidateModScan(env.value);
        return { ok: true };
    });
    ipcMain.handle('mods:check-update', async (_e, { guid }: {
        guid: string;
    }): Promise<Result<ModUpdateInfoDto>> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        const found = findMod(env.value, guid);
        if ('ok' in found)
            return found;
        try {
            const info = await checkForUpdate(found.mod, found.manifest);
            return { ok: true, value: info };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    ipcMain.handle('mods:update', async (_e, { guid }: {
        guid: string;
    }): Promise<Result> => {
        const env = requireEnv();
        if (!env.ok)
            return env;
        const found = findMod(env.value, guid);
        if ('ok' in found)
            return found;
        runtimeState.cancelController = new AbortController();
        const signal = runtimeState.cancelController.signal;
        try {
            const outcome = await updateMod(env.value, found.mod, found.manifest, (p) => emit(p), () => signal.aborted);
            if (!outcome.ok)
                return { ok: false, error: outcome.error ?? 'Update failed' };
            invalidateModScan(env.value);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
        finally {
            runtimeState.cancelController = null;
        }
    });
}
