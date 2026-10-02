import fs from 'fs';
import os from 'os';
import path from 'path';
import { TEXTURE_PACK_MANIFEST, texturePacksDir, PROTECTED_TEXTURE_PACK_FOLDERS, gameModdedSavesDir, texturePackStateFile } from '../constants';
import { isInside } from './PathGuard';
import { createTempDir, extractArchiveAsync, removeDirIfInside } from './ModArchiveExtractor';
import { collectReadmes, ReadmeFile } from './ReadmeCollector';
import { debugLog } from '../logger';
import type { TexturePackDto, TexturePackInstallResult } from '../../shared/types';
function readPackJson(dir: string): {
    name?: string;
    author?: string;
    version?: string;
    description?: string;
} | null {
    const p = path.join(dir, TEXTURE_PACK_MANIFEST);
    if (!fs.existsSync(p))
        return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        return {
            name: typeof raw['Name'] === 'string' ? raw['Name'] : undefined,
            author: typeof raw['Author'] === 'string' ? raw['Author'] : undefined,
            version: raw['Version'] !== undefined ? String(raw['Version']) : undefined,
            description: typeof raw['Description'] === 'string' ? raw['Description'] : undefined
        };
    }
    catch {
        return null;
    }
}
export function isProtectedTexturePack(folderName: string): boolean {
    return PROTECTED_TEXTURE_PACK_FOLDERS.has(String(folderName).toLowerCase());
}
// The texture pack mod keys its per-profile enable list (packs.txt) by the
// pack folder name without its extension.
function packStateId(folderName: string): string {
    return path.parse(folderName).name;
}
function listSaveProfiles(): string[] {
    const dir = gameModdedSavesDir();
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
    }
    catch {
        return [];
    }
}
function readProfilePackStates(profile: string): Map<string, boolean> {
    const states = new Map<string, boolean>();
    const file = texturePackStateFile(profile);
    if (!fs.existsSync(file))
        return states;
    try {
        for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
            const sep = line.indexOf(':');
            if (sep <= 0)
                continue;
            states.set(line.slice(0, sep), line.slice(sep + 1).trim() === 'enabled');
        }
    }
    catch {
    }
    return states;
}
// A pack counts as enabled when any player profile has it enabled; the toggle
// writes the same state to every profile since the active one is unknown here.
function readEnabledPackIds(): Set<string> {
    const enabled = new Set<string>();
    for (const profile of listSaveProfiles()) {
        for (const [id, on] of readProfilePackStates(profile)) {
            if (on)
                enabled.add(id);
        }
    }
    return enabled;
}
export function setTexturePackEnabled(folderName: string, enabled: boolean): void {
    if (isProtectedTexturePack(folderName)) {
        throw new Error(`This is a protected folder and cannot be toggled: ${folderName}`);
    }
    const id = packStateId(folderName);
    const line = `${id}:${enabled ? 'enabled' : 'disabled'}`;
    const profiles = listSaveProfiles();
    if (profiles.length === 0)
        profiles.push('!UnassignedFile');
    for (const profile of profiles) {
        const file = texturePackStateFile(profile);
        const lines: string[] = [];
        if (fs.existsSync(file)) {
            for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
                if (raw.length === 0)
                    continue;
                const sep = raw.indexOf(':');
                if (sep > 0 && raw.slice(0, sep) === id)
                    continue;
                lines.push(raw);
            }
        }
        lines.push(line);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, lines.join('\r\n') + '\r\n');
    }
}
export function listTexturePacks(gameRoot: string): TexturePackDto[] {
    const dir = texturePacksDir(gameRoot);
    if (!fs.existsSync(dir))
        return [];
    const enabledIds = readEnabledPackIds();
    const out: TexturePackDto[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const full = path.join(dir, entry.name);
        const meta = readPackJson(full);
        const protectedPack = isProtectedTexturePack(entry.name);
        out.push({
            folderName: entry.name,
            name: meta?.name || entry.name,
            author: meta?.author,
            version: meta?.version,
            description: meta?.description,
            protected: protectedPack,
            enabled: protectedPack || enabledIds.has(packStateId(entry.name))
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}
export async function installTexturePack(gameRoot: string, archivePath: string, progress?: (stage: 'extracting' | 'installing') => void): Promise<TexturePackInstallResult> {
    if (!fs.existsSync(archivePath))
        throw new Error('Archive not found');
    const tempRoot = createTempDir(gameRoot);
    try {
        progress?.('extracting');
        await extractArchiveAsync(archivePath, tempRoot);
        const fallbackName = path.basename(archivePath).replace(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar)$/i, '');
        progress?.('installing');
        return await installTexturePacksFromRoot(gameRoot, tempRoot, fallbackName);
    }
    finally {
        if (fs.existsSync(tempRoot))
            removeDirIfInside(gameRoot, tempRoot);
    }
}
export async function probeTexturePackArchive(archivePath: string): Promise<boolean> {
    if (!fs.existsSync(archivePath))
        return false;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbp-probe-'));
    try {
        await extractArchiveAsync(archivePath, tempRoot);
        if (hasModStructureInRoot(tempRoot))
            return false;
        const packDirs = findPackDirs(tempRoot);
        debugLog('probeTexturePackArchive packDirs =', packDirs.length);
        return packDirs.length > 0;
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
export async function installTexturePacksFromRoot(gameRoot: string, extractRoot: string, fallbackName: string): Promise<TexturePackInstallResult> {
    const targetRoot = texturePacksDir(gameRoot);
    debugLog('installTexturePacksFromRoot target =', targetRoot, 'fallback =', fallbackName);
    const readmes: ReadmeFile[] = [];
    collectReadmes(extractRoot, readmes, 8);
    const packDirs = findPackDirs(extractRoot);
    debugLog('installTexturePacksFromRoot packDirs =', packDirs.length, packDirs.map((d) => path.basename(d)).join(', '));
    if (packDirs.length === 0) {
        const dst = path.join(targetRoot, fallbackName);
        await copyDirContents(extractRoot, dst);
        fs.mkdirSync(targetRoot, { recursive: true });
        const meta = readPackJson(dst);
        return {
            installed: [packDto(dst, fallbackName, meta)],
            installDir: targetRoot,
            readmes
        };
    }
    fs.mkdirSync(targetRoot, { recursive: true });
    const installed: TexturePackDto[] = [];
    for (const src of packDirs) {
        const folderName = path.basename(src);
        const dst = path.join(targetRoot, folderName);
        await copyDirContents(src, dst);
        installed.push(packDto(dst, folderName, readPackJson(dst)));
    }
    return { installed, installDir: targetRoot, readmes };
}
export function uninstallTexturePack(gameRoot: string, folderName: string): void {
    if (isProtectedTexturePack(folderName)) {
        throw new Error(`This is a protected folder and cannot be deleted: ${folderName}`);
    }
    const dir = texturePacksDir(gameRoot);
    if (!isInside(dir, path.join(dir, folderName))) {
        throw new Error(`refusing to remove path outside texture packs: ${folderName}`);
    }
    const target = path.join(dir, folderName);
    if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
    }
}
function packDto(dir: string, folderName: string, meta: ReturnType<typeof readPackJson>): TexturePackDto {
    return {
        folderName,
        name: meta?.name || folderName,
        author: meta?.author,
        version: meta?.version,
        description: meta?.description,
        enabled: false
    };
}
export function hasModStructureInRoot(root: string): boolean {
    return (fs.existsSync(path.join(root, 'BepInEx', 'plugins')) ||
        fs.existsSync(path.join(root, 'BALDI_Data', 'StreamingAssets', 'Modded')) ||
        fs.existsSync(path.join(root, 'Mod', 'BepInEx')) ||
        fs.existsSync(path.join(root, 'Mod', 'BALDI_Data')));
}
export function findPackDirs(root: string): string[] {
    const found: string[] = [];
    const walk = (dir: string): void => {
        let hasPack = false;
        let hasSubDir = false;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                hasSubDir = true;
            }
            else if (entry.name.toLowerCase() === TEXTURE_PACK_MANIFEST) {
                hasPack = true;
            }
        }
        if (hasPack) {
            found.push(dir);
            return;
        }
        if (hasSubDir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory())
                    walk(path.join(dir, entry.name));
            }
        }
    };
    walk(root);
    return found;
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
