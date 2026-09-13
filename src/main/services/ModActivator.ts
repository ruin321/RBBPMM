import fs from 'fs';
import path from 'path';
import type { ModManifestDto, ModMetadataDto } from '../../shared/types';
import { DISABLED_EXTENSION, bepinexPatchersDir } from '../constants';
import { loadMetadata, saveMetadata } from './ManifestLoader';
const pluginExt = '.dll';
const DISABLED_SUFFIX = `.${DISABLED_EXTENSION}`;
function dllStem(relative: string): string {
    let s = relative;
    let lc = s.toLowerCase();
    if (lc.endsWith('.disabled'))
        s = s.slice(0, -9);
    else if (lc.endsWith('.disable'))
        s = s.slice(0, -8);
    lc = s.toLowerCase();
    const backup = /^(.*)\.dll\.\d+$/i.exec(s);
    if (backup)
        return backup[1];
    if (lc.endsWith('.dll'))
        return s.slice(0, -4);
    return s;
}
function disabledCandidates(base: string): string[] {
    const stem = path.basename(base);
    return [
        `${stem}${DISABLED_SUFFIX}`,
        `${stem}.disable`,
        `${stem}.dll${DISABLED_SUFFIX}`,
        `${stem}.dll.disable`,
        `${stem}.dll.1`
    ];
}
function detectStemFromName(name: string): string | null {
    if (!name || name[0] === '.')
        return null;
    const lc = name.toLowerCase();
    if (lc.endsWith(DISABLED_SUFFIX)) {
        const raw = name.slice(0, -DISABLED_SUFFIX.length);
        return raw.toLowerCase().endsWith('.dll') ? raw.slice(0, -4) : raw;
    }
    if (lc.endsWith('.disable')) {
        const raw = name.slice(0, -8);
        return raw.toLowerCase().endsWith('.dll') ? raw.slice(0, -4) : raw;
    }
    if (lc === '')
        return null;
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : null;
}
function findDisabledFile(dir: string, base: string): string | null {
    const stem = path.basename(base).toLowerCase();
    let found: string | null = null;
    for (const f of fs.readdirSync(dir)) {
        if (f.toLowerCase() === `${stem}.dll`)
            continue;
        const detected = detectStemFromName(f);
        if (detected && detected.toLowerCase() === stem) {
            if (found)
                return null;
            found = f;
        }
    }
    return found;
}
function renameDll(dir: string, base: string, activate: boolean): boolean {
    const active = path.join(dir, `${path.basename(base)}.dll`);
    if (activate) {
        if (fs.existsSync(active))
            return true;
        for (const cand of disabledCandidates(base)) {
            const src = path.join(dir, cand);
            if (fs.existsSync(src) && fs.statSync(src).isFile()) {
                fs.renameSync(src, active);
                return true;
            }
        }
        const stemName = path.basename(base).toLowerCase();
        for (const f of fs.readdirSync(dir)) {
            if (/\.dll\.\d+$/i.test(f) && f.toLowerCase().startsWith(`${stemName}.dll.`)) {
                fs.renameSync(path.join(dir, f), active);
                return true;
            }
        }
        const loose = findDisabledFile(dir, base);
        if (loose && loose.toLowerCase() !== `${path.basename(base)}.dll`) {
            fs.renameSync(path.join(dir, loose), active);
            return true;
        }
        return false;
    }
    if (fs.existsSync(active)) {
        fs.renameSync(active, path.join(dir, `${path.basename(base)}${DISABLED_SUFFIX}`));
        return true;
    }
    return true;
}
export function toggleActivation(gameRoot: string, modRoot: string, manifest: ModManifestDto, activate: boolean): {
    activated: boolean;
} {
    for (const p of manifest.plugins) {
        const pluginPath = path.resolve(modRoot, p.startsWith('..') ? path.join('..', p) : p);
        const dir = path.dirname(pluginPath);
        const base = path.basename(pluginPath, pluginExt);
        if (fs.existsSync(dir))
            renameDll(dir, base, activate);
    }
    const patchersDir = bepinexPatchersDir(gameRoot);
    for (const p of manifest.patchers) {
        const base = path.basename(p, pluginExt);
        if (fs.existsSync(patchersDir))
            renameDll(patchersDir, base, activate);
    }
    const meta: ModMetadataDto = { ...loadMetadata(modRoot, manifest), activated: activate };
    saveMetadata(modRoot, manifest, meta);
    return { activated: activate };
}
export function toggleLegacyPlugin(installDir: string, pluginFiles: string[], activate: boolean): {
    activated: boolean;
    pluginFiles: string[];
} {
    const nextPluginFiles: string[] = [];
    for (const pf of pluginFiles) {
        const dir = path.dirname(path.resolve(installDir, pf));
        renameDll(dir, dllStem(pf), activate);
        const logical = `${path.basename(dllStem(pf))}${pluginExt}`;
        const prefix = path.dirname(pf);
        nextPluginFiles.push(prefix === '.' ? logical : path.join(prefix, logical));
    }
    return { activated: activate, pluginFiles: nextPluginFiles };
}
