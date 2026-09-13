import fs from 'fs';
import path from 'path';
import { isInside } from './PathGuard';
import { levelStudioPlayablesPath } from './LevelStudioInstaller';
import { readCustomLevel } from './CustomLevelParser';
import type { CustomLevelDto } from '../../shared/types';
const DISABLED_SUFFIX = '.disabled';
function stripDisabled(name: string): string {
    return name.endsWith(DISABLED_SUFFIX) ? name.slice(0, -DISABLED_SUFFIX.length) : name;
}
function isPbpl(name: string): boolean {
    const lower = name.toLowerCase();
    return lower.endsWith('.pbpl');
}
export function listCustomLevels(): CustomLevelDto[] {
    const playables = levelStudioPlayablesPath();
    const out: CustomLevelDto[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(playables, { withFileTypes: true });
    }
    catch {
        return out;
    }
    for (const entry of entries) {
        if (!entry.isFile())
            continue;
        const name = entry.name;
        if (name.endsWith(DISABLED_SUFFIX)) {
            if (!isPbpl(stripDisabled(name)))
                continue;
        }
        else if (!isPbpl(name)) {
            continue;
        }
        const base = stripDisabled(name);
        const enabled = !name.endsWith(DISABLED_SUFFIX);
        const full = path.join(playables, name);
        let size = 0;
        try {
            size = fs.statSync(full).size;
        }
        catch {
        }
        const parsed = readCustomLevel(full, size);
        if (parsed) {
            out.push({ ...parsed, fileName: base, enabled });
        }
        else {
            out.push({ fileName: base, name: base, author: '', type: '', size, enabled });
        }
    }
    return out;
}
export function toggleCustomLevel(fileName: string, enable: boolean): void {
    const playables = levelStudioPlayablesPath();
    const base = stripDisabled(fileName);
    const targetName = base + (enable ? '' : DISABLED_SUFFIX);
    const targetAbs = path.join(playables, targetName);
    if (!isInside(playables, targetAbs)) {
        throw new Error(`invalid custom level path: ${fileName}`);
    }
    const oppositeName = base + (enable ? DISABLED_SUFFIX : '');
    const oppositeAbs = path.join(playables, oppositeName);
    if (fs.existsSync(oppositeAbs) && isInside(playables, oppositeAbs)) {
        fs.renameSync(oppositeAbs, targetAbs);
        return;
    }
    if (fs.existsSync(targetAbs))
        return;
    throw new Error(`custom level not found: ${fileName}`);
}
export function deleteCustomLevel(fileName: string): void {
    const playables = levelStudioPlayablesPath();
    const base = stripDisabled(fileName);
    let deleted = false;
    for (const nm of [base, base + DISABLED_SUFFIX]) {
        const abs = path.join(playables, nm);
        if (!isInside(playables, abs))
            continue;
        if (fs.existsSync(abs)) {
            fs.rmSync(abs, { force: true });
            deleted = true;
        }
    }
    if (!deleted) {
        throw new Error(`custom level not found: ${fileName}`);
    }
}
