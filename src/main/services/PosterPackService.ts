import fs from 'fs';
import os from 'os';
import path from 'path';
import { POSTER_IMAGE_EXT, TEXTURE_PACK_MANIFEST, customPostersDir, customPostersDisabledDir } from '../constants';
import { isInside } from './PathGuard';
import { createTempDir, extractArchiveAsync, removeDirIfInside } from './ModArchiveExtractor';
import { collectReadmes, ReadmeFile } from './ReadmeCollector';
import { hasModStructureInRoot } from './TexturePackService';
import { debugLog } from '../logger';
import type { PosterPackDto, PosterPackInstallResult } from '../../shared/types';
const THUMBNAIL_MAX_BYTES = 4 * 1024 * 1024;
function isOverlayImage(name: string): boolean {
    return /_overlay\.(png|jpe?g)$/i.test(name);
}
function listImageFiles(dir: string, recursive: boolean): string[] {
    const out: string[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return out;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (recursive)
                out.push(...listImageFiles(full, true));
        }
        else if (POSTER_IMAGE_EXT.test(entry.name) && !isOverlayImage(entry.name)) {
            out.push(full);
        }
    }
    return out;
}
function countPosters(dir: string): number {
    return listImageFiles(dir, true).length;
}
function makeThumbnail(file: string): string | undefined {
    try {
        const stat = fs.statSync(file);
        if (stat.size > THUMBNAIL_MAX_BYTES)
            return undefined;
        const mime = /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png';
        return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
    }
    catch {
        return undefined;
    }
}
function packDto(dir: string, folderName: string, enabled: boolean): PosterPackDto {
    const images = listImageFiles(dir, true);
    return {
        folderName,
        name: folderName,
        posterCount: images.length,
        enabled,
        thumbnail: images.length > 0 ? makeThumbnail(images[0]) : undefined
    };
}
function listPackDirs(root: string): fs.Dirent[] {
    try {
        return fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
    }
    catch {
        return [];
    }
}
export function listPosterPacks(gameRoot: string): PosterPackDto[] {
    const out: PosterPackDto[] = [];
    for (const entry of listPackDirs(customPostersDir(gameRoot))) {
        out.push(packDto(path.join(customPostersDir(gameRoot), entry.name), entry.name, true));
    }
    for (const entry of listPackDirs(customPostersDisabledDir(gameRoot))) {
        out.push(packDto(path.join(customPostersDisabledDir(gameRoot), entry.name), entry.name, false));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}
export async function probePosterPackArchive(archivePath: string): Promise<boolean> {
    if (!fs.existsSync(archivePath))
        return false;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbp-poster-probe-'));
    try {
        await extractArchiveAsync(archivePath, tempRoot);
        if (hasModStructureInRoot(tempRoot))
            return false;
        if (fs.existsSync(path.join(tempRoot, TEXTURE_PACK_MANIFEST)))
            return false;
        const images = listImageFiles(tempRoot, true);
        if (images.length === 0)
            return false;
        const hasDefinition = images.some((img) => fs.existsSync(`${img}.json`));
        const hasSubdirImage = images.some((img) => path.dirname(img) !== tempRoot);
        const looksLikePack = hasDefinition || hasSubdirImage;
        debugLog('probePosterPackArchive images =', images.length, 'looksLikePack =', looksLikePack);
        return looksLikePack;
    }
    catch {
        return false;
    }
    finally {
        try {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
        catch {
        }
    }
}
export async function installPosterPack(gameRoot: string, archivePath: string, progress?: (stage: 'extracting' | 'installing') => void): Promise<PosterPackInstallResult> {
    if (!fs.existsSync(archivePath))
        throw new Error('Archive not found');
    const tempRoot = createTempDir(gameRoot);
    try {
        progress?.('extracting');
        await extractArchiveAsync(archivePath, tempRoot);
        const fallbackName = path.basename(archivePath).replace(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar)$/i, '');
        progress?.('installing');
        return await installPosterPacksFromRoot(gameRoot, tempRoot, fallbackName);
    }
    finally {
        if (fs.existsSync(tempRoot))
            removeDirIfInside(gameRoot, tempRoot);
    }
}
export async function installPosterPacksFromRoot(gameRoot: string, extractRoot: string, fallbackName: string): Promise<PosterPackInstallResult> {
    const targetRoot = customPostersDir(gameRoot);
    fs.mkdirSync(targetRoot, { recursive: true });
    const readmes: ReadmeFile[] = [];
    collectReadmes(extractRoot, readmes, 8);
    const rootImages = listImageFiles(extractRoot, false);
    const installed: PosterPackDto[] = [];
    if (rootImages.length > 0) {
        const dst = path.join(targetRoot, fallbackName);
        await copyDirContents(extractRoot, dst);
        installed.push(packDto(dst, fallbackName, true));
    }
    else {
        for (const entry of listPackDirs(extractRoot)) {
            const src = path.join(extractRoot, entry.name);
            if (listImageFiles(src, true).length === 0)
                continue;
            const dst = path.join(targetRoot, entry.name);
            await copyDirContents(src, dst);
            installed.push(packDto(dst, entry.name, true));
        }
    }
    if (installed.length === 0) {
        const dst = path.join(targetRoot, fallbackName);
        await copyDirContents(extractRoot, dst);
        installed.push(packDto(dst, fallbackName, true));
    }
    debugLog('installPosterPacksFromRoot installed =', installed.map((p) => p.folderName).join(', '));
    return { installed, installDir: targetRoot, readmes };
}
export function uninstallPosterPack(gameRoot: string, folderName: string): void {
    let removed = false;
    for (const base of [customPostersDir(gameRoot), customPostersDisabledDir(gameRoot)]) {
        const target = path.join(base, folderName);
        if (!isInside(base, target))
            continue;
        if (fs.existsSync(target)) {
            fs.rmSync(target, { recursive: true, force: true });
            removed = true;
        }
    }
    if (!removed)
        throw new Error(`poster pack not found: ${folderName}`);
}
export function setPosterPackEnabled(gameRoot: string, folderName: string, enabled: boolean): void {
    const activeRoot = customPostersDir(gameRoot);
    const disabledRoot = customPostersDisabledDir(gameRoot);
    const from = path.join(enabled ? disabledRoot : activeRoot, folderName);
    const to = path.join(enabled ? activeRoot : disabledRoot, folderName);
    if (!isInside(enabled ? disabledRoot : activeRoot, from))
        throw new Error(`invalid poster pack path: ${folderName}`);
    if (!fs.existsSync(from)) {
        if (fs.existsSync(to))
            return;
        throw new Error(`poster pack not found: ${folderName}`);
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (fs.existsSync(to))
        throw new Error(`a poster pack named "${folderName}" already exists`);
    fs.renameSync(from, to);
}
async function copyDirContents(src: string, dst: string): Promise<void> {
    await fs.promises.mkdir(dst, { recursive: true });
    const entries = await fs.promises.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const from = path.join(src, entry.name);
        const to = path.join(dst, entry.name);
        if (entry.isDirectory()) {
            await copyDirContents(from, to);
        }
        else {
            await fs.promises.mkdir(path.dirname(to), { recursive: true });
            await fs.promises.copyFile(from, to);
        }
    }
}