import fs from 'fs';
import path from 'path';
import { getSubmission, downloadMod } from './GamebananaService';
import { installModArchive, installUnmanaged } from './ModInstaller';
import { createTempDir, extractArchive } from './ModArchiveExtractor';
import { invalidateModScan } from './ModRepositoryScanner';
import { hasManifest } from './ModInstaller';
import { DEV_API_MOD_ID, resolveDevApiVersion, selectDevApiFile } from './CompatibilityTable';
import type { GamebananaFileDto } from '../../shared/types';
import type { InstallProgress, InstallResult, Result } from '../../shared/types';
function emitProgress(onProgress: ((p: InstallProgress) => void) | undefined, p: InstallProgress): void {
    onProgress?.(p);
}
export async function installDevApi(gameRoot: string, gameVersion: string | null | undefined, onProgress?: (p: InstallProgress) => void): Promise<Result<InstallResult>> {
    let tmpFile: string | null = null;
    let exTemp: string | null = null;
    try {
        emitProgress(onProgress, { stage: 'fetching', percent: 0, message: 'Fetching the BB+ Dev API...' });
        const submission = await getSubmission(DEV_API_MOD_ID);
        const allFiles: GamebananaFileDto[] = [...submission.files, ...(submission.archivedFiles ?? [])];
        const targetVersion = resolveDevApiVersion(gameVersion);
        const file = selectDevApiFile(allFiles, gameVersion, targetVersion);
        if (!file || !file.downloadUrl) {
            return { ok: false, error: 'The BB+ Dev API has no downloadable files.' };
        }
        tmpFile = await downloadMod(file.downloadUrl, (p) => {
            const percent = p.total ? Math.min(99, Math.round((p.received / p.total) * 100)) : undefined;
            emitProgress(onProgress, {
                stage: 'downloading',
                percent,
                message: `Downloading ${file.fileName}${p.total ? ` (${Math.round(p.received / 1024 / 1024)}/${Math.round(p.total / 1024 / 1024)} MB)` : ''}`
            });
        });
        emitProgress(onProgress, { stage: 'installing', message: 'Installing the BB+ Dev API...' });
        exTemp = createTempDir(gameRoot);
        const extractRoot = await extractArchive(tmpFile, exTemp);
        let result: InstallResult;
        if (hasManifest(extractRoot)) {
            result = await installModArchive(gameRoot, tmpFile, gameVersion ?? undefined, (p) => emitProgress(onProgress, p), () => false, extractRoot);
        }
        else {
            installUnmanaged(extractRoot, gameRoot, (p) => emitProgress(onProgress, p), () => false);
            result = { mod: undefined, warnings: [] };
        }
        invalidateModScan(gameRoot);
        emitProgress(onProgress, { stage: 'done', percent: 100, message: 'BB+ Dev API installed.' });
        return { ok: true, value: result };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Failed to install the BB+ Dev API: ${msg}` };
    }
    finally {
        if (exTemp) {
            try {
                fs.rmSync(exTemp, { recursive: true, force: true });
            }
            catch {
            }
        }
        if (tmpFile) {
            try {
                fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
            }
            catch {
            }
        }
    }
}
