import fs from 'fs';
import os from 'os';
import path from 'path';
import { isInside } from './PathGuard';
import { logInfo, logWarn } from '../logger';
import type { LevelStudioInstallResult, ReadmeFileDto } from '../../shared/types';
const PBPL_EXT = '.pbpl';
const README_PATTERN = /readme.*\.(md|txt)$/i;
const README_MAX_BYTES = 256 * 1024;
export function levelStudioPlayablesPath(): string {
    return path.join(os.homedir(), 'AppData', 'LocalLow', 'Basically Games', "Baldi's Basics Plus", 'Level Studio', 'Playables');
}
function entriesList(dir: string): fs.Dirent[] {
    try {
        return fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return [];
    }
}
export function findPbplFiles(root: string, out: string[]): void {
    for (const entry of entriesList(root)) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '__MACOSX')
                findPbplFiles(full, out);
        }
        else if (path.extname(entry.name).toLowerCase() === PBPL_EXT) {
            out.push(full);
        }
    }
}
function collectLevelStudioReadmes(root: string, out: ReadmeFileDto[]): void {
    for (const entry of entriesList(root)) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '__MACOSX')
                collectLevelStudioReadmes(full, out);
            continue;
        }
        if (!README_PATTERN.test(entry.name))
            continue;
        let content: string;
        try {
            const st = fs.statSync(full);
            if (st.size > README_MAX_BYTES)
                continue;
            content = fs.readFileSync(full, 'utf8');
        }
        catch {
            continue;
        }
        out.push({ name: path.relative(root, full).split(path.sep).join('/'), content });
    }
}
async function copyEntry(src: string, dst: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(dst), { recursive: true });
    const st = await fs.promises.stat(src);
    if (st.isDirectory()) {
        await fs.promises.mkdir(dst, { recursive: true });
        for (const entry of await fs.promises.readdir(src, { withFileTypes: true })) {
            await copyEntry(path.join(src, entry.name), path.join(dst, entry.name));
        }
    }
    else {
        await fs.promises.copyFile(src, dst);
    }
}
async function isNestedSingleDir(root: string): Promise<string | null> {
    const entries = entriesList(root).filter((e) => e.name !== '__MACOSX');
    if (entries.length !== 1 || !entries[0].isDirectory())
        return null;
    return entries[0].name;
}
export async function installLevelStudioPlayable(extractRoot: string): Promise<LevelStudioInstallResult> {
    const playables = levelStudioPlayablesPath();
    await fs.promises.mkdir(playables, { recursive: true });
    logInfo('level studio install: playables dir =', playables);
    const readmes: ReadmeFileDto[] = [];
    collectLevelStudioReadmes(extractRoot, readmes);
    logInfo('level studio install: readmes found =', readmes.length, readmes.map((r) => r.name));
    const pbplFiles: string[] = [];
    findPbplFiles(extractRoot, pbplFiles);
    logInfo('level studio install: pbpl found =', pbplFiles.map((f) => path.basename(f)));
    const installed: string[] = [];
    if (pbplFiles.length > 0) {
        for (const src of pbplFiles) {
            const dst = path.join(playables, path.basename(src));
            if (!isInside(playables, dst)) {
                logWarn('level studio install: refusing outside Playables', path.basename(src));
                throw new Error(`refusing to install outside Level Studio Playables: ${path.basename(src)}`);
            }
            if (fs.existsSync(dst)) {
                try {
                    fs.rmSync(dst, { recursive: true, force: true });
                }
                catch {
                }
            }
            await copyEntry(src, dst);
            installed.push(path.basename(src));
        }
        logInfo('level studio install: installed pbpl =', installed);
        return { playables: installed, readmes };
    }
    const nested = await isNestedSingleDir(extractRoot);
    const srcRoot = nested ? path.join(extractRoot, nested) : extractRoot;
    logInfo('level studio install: no pbpl, copying contents from root =', srcRoot);
    for (const entry of entriesList(srcRoot)) {
        if (entry.name === '__MACOSX')
            continue;
        if (README_PATTERN.test(entry.name))
            continue;
        const src = path.join(srcRoot, entry.name);
        const dst = path.join(playables, entry.name);
        if (!isInside(playables, dst)) {
            throw new Error(`refusing to install outside Level Studio Playables: ${entry.name}`);
        }
        if (fs.existsSync(dst)) {
            try {
                fs.rmSync(dst, { recursive: true, force: true });
            }
            catch {
            }
        }
        await copyEntry(src, dst);
        installed.push(entry.name);
    }
    return { playables: installed, readmes };
}
