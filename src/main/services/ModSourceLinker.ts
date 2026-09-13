import fs from 'fs';
import path from 'path';
import type { GamebananaFileDto, GamebananaSourceDto, GamebananaSubmissionDto, ModItemDto, ModManifestDto, ModMetadataDto, ModUpdateInfoDto } from '../../shared/types';
import { BALDI_COMMUNITY_CATEGORY_ID } from '../../shared/types';
import { loadMetadata, saveMetadata, loadModManifest } from './ManifestLoader';
import { getSubmission, searchMods, downloadMod } from './GamebananaService';
import { installModArchive } from './ModInstaller';
import { createTempDir, extractArchive } from './ModArchiveExtractor';
const GMP_METADATA_FOLDER = '.rbbpmm';
const GMP_FALLBACK_METADATA_FOLDER = '_rbbpmm';
const METADATA_FILE = '.metadata';
function normalizeName(n: string): string {
    return (n || '')
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[\s_\-()\[\]{}.,+]+/g, '')
        .trim();
}
function metadataFolderFor(modRoot: string): string | null {
    for (const f of [GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER]) {
        const p = path.join(modRoot, f);
        if (fs.existsSync(p))
            return p;
    }
    return null;
}
function canPersist(mod: ModItemDto): boolean {
    if (mod.loose)
        return false;
    const folder = metadataFolderFor(mod.installDir);
    if (folder)
        return true;
    try {
        fs.mkdirSync(path.join(mod.installDir, GMP_METADATA_FOLDER), { recursive: true });
        return true;
    }
    catch {
        return false;
    }
}
function persistSource(mod: ModItemDto, manifest: ModManifestDto, source: GamebananaSourceDto): void {
    if (!canPersist(mod))
        return;
    const meta = loadMetadata(mod.installDir, manifest);
    meta.gamebananaSource = source;
    meta.installationUrl = `https://gamebanana.com/mods/${source.submissionId}`;
    saveMetadata(mod.installDir, manifest, meta);
}
function persistArchiveName(modRoot: string, manifest: ModManifestDto, archiveName: string): void {
    const folder = metadataFolderFor(modRoot);
    if (!folder)
        return;
    const meta = loadMetadata(modRoot, manifest);
    meta.lastInstalledArchiveName = archiveName;
    saveMetadata(modRoot, manifest, meta);
}
export { persistArchiveName };
function readSource(modRoot: string, manifest: ModManifestDto): GamebananaSourceDto | undefined {
    return loadMetadata(modRoot, manifest).gamebananaSource;
}
export function findMetadataFile(modRoot: string): string | null {
    const folder = metadataFolderFor(modRoot);
    if (!folder)
        return null;
    const p = path.join(folder, METADATA_FILE);
    return fs.existsSync(p) ? p : null;
}
export { GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER };
function expectedNamesFor(mod: ModItemDto, manifest: ModManifestDto): string[] {
    const names: string[] = [];
    const meta = loadMetadata(mod.installDir, manifest);
    if (meta.lastInstalledArchiveName)
        names.push(meta.lastInstalledArchiveName);
    names.push(manifest.name);
    if (mod.directoryName)
        names.push(mod.directoryName);
    return names;
}
export async function searchCandidates(name: string): Promise<GamebananaSubmissionDto[]> {
    const res = await searchMods(1, name, BALDI_COMMUNITY_CATEGORY_ID);
    return (res.items ?? []).filter((i) => i.hasFiles);
}
export function matchFile(submission: GamebananaSubmissionDto, expectedNames: string[]): GamebananaFileDto | undefined {
    const all = [...(submission.files ?? []), ...(submission.archivedFiles ?? [])];
    if (all.length === 0)
        return undefined;
    const expected = expectedNames.map(normalizeName).filter(Boolean);
    let exact: GamebananaFileDto | undefined;
    for (const f of all) {
        if (!f.fileName)
            continue;
        const fn = normalizeName(f.fileName);
        if (expected.includes(fn)) {
            if (!exact || (f.dateAdded ?? 0) > (exact.dateAdded ?? 0))
                exact = f;
        }
    }
    if (exact)
        return exact;
    return [...all].sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0))[0];
}
export async function linkByLocalMod(mod: ModItemDto, manifest: ModManifestDto): Promise<{
    linked: boolean;
    submission?: GamebananaSubmissionDto;
    file?: GamebananaFileDto;
}> {
    const candidates = await searchCandidates(mod.name || manifest.name);
    for (const sub of candidates) {
        const file = matchFile(sub, expectedNamesFor(mod, manifest));
        if (!file)
            continue;
        const source: GamebananaSourceDto = {
            submissionId: sub.id,
            fileId: file.id,
            fileName: file.fileName,
            version: file.version,
            submissionName: sub.name,
            dateLinked: new Date().toISOString()
        };
        persistSource(mod, manifest, source);
        return { linked: true, submission: sub, file };
    }
    return { linked: false };
}
export async function linkKnownSubmission(mod: ModItemDto, manifest: ModManifestDto, submission: GamebananaSubmissionDto, file: GamebananaFileDto): Promise<void> {
    const source: GamebananaSourceDto = {
        submissionId: submission.id,
        fileId: file.id,
        fileName: file.fileName,
        version: file.version,
        submissionName: submission.name,
        dateLinked: new Date().toISOString()
    };
    persistSource(mod, manifest, source);
}
export async function checkForUpdate(mod: ModItemDto, manifest: ModManifestDto): Promise<ModUpdateInfoDto> {
    const source = readSource(mod.installDir, manifest);
    if (!source) {
        return {
            hasUpdate: false,
            submissionId: 0,
            fileId: 0,
            fileName: '',
            downloadUrl: ''
        };
    }
    const sub = await getSubmission(source.submissionId);
    const all = [...(sub.files ?? []), ...(sub.archivedFiles ?? [])];
    const current = all.find((f) => f.id === source.fileId) ?? all[0];
    if (!current) {
        return {
            hasUpdate: false,
            submissionId: sub.id,
            fileId: source.fileId,
            fileName: source.fileName,
            downloadUrl: ''
        };
    }
    const hasUpdate = current.id !== source.fileId || (current.version ?? '') !== (source.version ?? '');
    return {
        hasUpdate,
        submissionId: sub.id,
        fileId: current.id,
        fileName: current.fileName,
        version: current.version,
        publishedDate: current.dateAdded,
        downloadUrl: current.downloadUrl
    };
}
export interface UpdateOutcome {
    ok: boolean;
    error?: string;
}
export async function updateMod(gameRoot: string, mod: ModItemDto, manifest: ModManifestDto, onProgress: (p: {
    stage: string;
    percent?: number;
    message?: string;
}) => void, isCancelled?: () => boolean): Promise<UpdateOutcome> {
    const source = readSource(mod.installDir, manifest);
    if (!source)
        return { ok: false, error: 'No linked source' };
    const sub = await getSubmission(source.submissionId);
    const all = [...(sub.files ?? []), ...(sub.archivedFiles ?? [])];
    const file = all.find((f) => f.id === source.fileId) ?? all[0];
    if (!file || !file.downloadUrl)
        return { ok: false, error: 'No downloadable file' };
    onProgress({ stage: 'downloading', percent: 0, message: `Downloading ${file.fileName}` });
    const archivePath = await downloadMod(file.downloadUrl, (p) => {
        const percent = p.total ? Math.min(99, Math.round((p.received / p.total) * 100)) : undefined;
        onProgress({ stage: 'downloading', percent, message: `Downloading ${file.fileName}` });
    }, isCancelled);
    let exTemp: string | null = null;
    const dotOld = mod.installDir + '.old';
    try {
        exTemp = createTempDir(mod.installDir);
        onProgress({ stage: 'extracting', message: 'Extracting archive' });
        const extractRoot = await extractArchive(archivePath, exTemp);
        if (fs.existsSync(dotOld))
            fs.rmSync(dotOld, { recursive: true, force: true });
        fs.renameSync(mod.installDir, dotOld);
        try {
            const result = await installModArchive(gameRoot, archivePath, undefined, onProgress, isCancelled, extractRoot);
            fs.rmSync(dotOld, { recursive: true, force: true });
            const newSource: GamebananaSourceDto = {
                ...source,
                fileId: file.id,
                fileName: file.fileName,
                version: file.version,
                dateLinked: new Date().toISOString()
            };
            const newManifest = result.mod ? loadModManifest(result.mod.installDir) ?? manifest : manifest;
            persistSource(result.mod, newManifest, newSource);
            return { ok: true };
        }
        catch (err) {
            if (fs.existsSync(dotOld) && !fs.existsSync(mod.installDir)) {
                fs.renameSync(dotOld, mod.installDir);
            }
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    finally {
        if (exTemp) {
            try {
                fs.rmSync(exTemp, { recursive: true, force: true });
            }
            catch {
            }
        }
        try {
            fs.rmSync(path.dirname(archivePath), { recursive: true, force: true });
        }
        catch {
        }
    }
}
export function getModMetadata(modRoot: string, manifest: ModManifestDto): ModMetadataDto {
    return loadMetadata(modRoot, manifest);
}
