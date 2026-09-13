import fs from 'fs';
import path from 'path';
import type { ModInstallPlanDto } from '../../shared/types';
import { GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER, TEMP_FOLDER } from '../constants';
const PLUGIN_EXT = '.dll';
export interface InstallTargets {
    modded: {
        src: string;
        destRel: string;
    }[];
    plugins: {
        src: string;
        destRel: string;
        extras: string[];
    }[];
    patchers: {
        src: string;
        destRel: string;
    }[];
    modInfo: {
        src: string;
        destRel: string;
    }[];
}
function pluginsRootCandidates(extractRoot: string): string[] {
    return [path.join(extractRoot, 'BepInEx', 'plugins'), path.join(extractRoot, 'plugins')];
}
function moddedRootCandidates(extractRoot: string): string[] {
    return [
        path.join(extractRoot, 'BALDI_Data', 'StreamingAssets', 'Modded'),
        path.join(extractRoot, 'Modded')
    ];
}
function patchersRootCandidates(extractRoot: string): string[] {
    return [path.join(extractRoot, 'BepInEx', 'patchers'), path.join(extractRoot, 'patchers')];
}
function pluginTarget(absDll: string, rel: string): {
    src: string;
    destRel: string;
    extras: string[];
} {
    const dir = path.dirname(absDll);
    const stem = path.basename(absDll, PLUGIN_EXT);
    const extras = [] as string[];
    for (const f of ['xml', 'pdb']) {
        const p = path.join(dir, `${stem}.${f}`);
        if (fs.existsSync(p))
            extras.push(p);
    }
    return { src: absDll, destRel: rel, extras };
}
function walkDlls(dir: string, rel: string, into: {
    src: string;
    destRel: string;
    extras: string[];
}[]): void {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            walkDlls(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name, into);
        }
        else if (e.name.toLowerCase().endsWith(PLUGIN_EXT)) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            into.push(pluginTarget(path.join(dir, e.name), r));
        }
    }
}
function walkPatchers(dir: string, rel: string, into: {
    src: string;
    destRel: string;
}[]): void {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            walkPatchers(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name, into);
        }
        else if (e.name.toLowerCase().endsWith(PLUGIN_EXT)) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            into.push({ src: path.join(dir, e.name), destRel: r });
        }
    }
}
export function isValidGuidFolderName(input: string): boolean {
    if (!input)
        return false;
    if (!/^[a-z0-9.]+$/.test(input))
        return false;
    const segs = input.split('.');
    return segs.length >= 2 && segs.length <= 5;
}
export function isTemplateFolderName(input: string): boolean {
    const n = input.toLowerCase();
    return n.includes('template') || n.includes('example');
}
function relDirOf(rel: string): string {
    const i = rel.lastIndexOf('/');
    return i === -1 ? '' : rel.slice(0, i);
}
function stemOf(rel: string): string {
    const base = path.basename(rel);
    const dot = base.lastIndexOf('.');
    return dot === -1 ? base : base.slice(0, dot);
}
function findPluginEntry(plugins: InstallTargets['plugins'], rel: string, stem: string): {
    src: string;
    destRel: string;
    extras: string[];
} | undefined {
    const dir = relDirOf(rel);
    return (plugins.find((p) => relDirOf(p.destRel) === dir && stemOf(p.destRel).toLowerCase() === stem) ??
        plugins.find((p) => stemOf(p.destRel).toLowerCase() === stem));
}
function walkHeuristic(extractRoot: string, targets: InstallTargets): void {
    const skipNames = new Set([GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER, TEMP_FOLDER]);
    const modded = targets.modded;
    const plugins = targets.plugins;
    const patchers = targets.patchers;
    const modInfo = targets.modInfo;
    const pendingDirs: {
        abs: string;
        rel: string;
    }[] = [{ abs: extractRoot, rel: '' }];
    const files: {
        abs: string;
        rel: string;
    }[] = [];
    while (pendingDirs.length > 0) {
        const { abs, rel } = pendingDirs.pop()!;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(abs, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const e of entries) {
            const childAbs = path.join(abs, e.name);
            const childRel = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) {
                if (skipNames.has(e.name))
                    continue;
                if (isTemplateFolderName(e.name))
                    continue;
                if (isValidGuidFolderName(e.name)) {
                    if (!modded.some((m) => m.destRel === e.name)) {
                        modded.push({ src: childAbs, destRel: e.name });
                    }
                    continue;
                }
                pendingDirs.push({ abs: childAbs, rel: childRel });
            }
            else {
                files.push({ abs: childAbs, rel: childRel });
            }
        }
    }
    const dllStems = new Set<string>();
    for (const f of files) {
        if (f.rel.toLowerCase().endsWith(PLUGIN_EXT))
            dllStems.add(stemOf(f.rel).toLowerCase());
    }
    for (const f of files) {
        const lower = f.rel.toLowerCase();
        if (!lower.endsWith(PLUGIN_EXT))
            continue;
        if (f.rel.split('/').some((seg) => seg.toLowerCase() === 'patchers')) {
            patchers.push({ src: f.abs, destRel: path.basename(f.rel) });
        }
        else {
            plugins.push({ src: f.abs, destRel: f.rel, extras: [] });
        }
    }
    for (const f of files) {
        const lower = f.rel.toLowerCase();
        const stem = stemOf(f.rel).toLowerCase();
        if (lower.endsWith('.pdb') || lower.endsWith('.xml')) {
            const owner = findPluginEntry(plugins, f.rel, stem);
            owner?.extras.push(f.abs);
            continue;
        }
        if (lower.endsWith('.json')) {
            let stem = lower.slice(0, -'.json'.length);
            const isDeps = stem.endsWith('.deps');
            if (isDeps)
                stem = stem.slice(0, -'.deps'.length);
            if (!dllStems.has(stem))
                continue;
            if (isDeps) {
                const owner = findPluginEntry(plugins, f.rel, stem);
                owner?.extras.push(f.abs);
            }
            else {
                modInfo.push({ src: f.abs, destRel: path.basename(f.rel) });
            }
        }
    }
}
export function collectTargets(input: string): InstallTargets {
    let extractRoot = input;
    const modWrap = path.join(extractRoot, 'Mod');
    if (path.resolve(modWrap) !== path.resolve(extractRoot) &&
        (fs.existsSync(path.join(modWrap, 'BepInEx')) || fs.existsSync(path.join(modWrap, 'BALDI_Data')))) {
        extractRoot = modWrap;
    }
    for (let depth = 0; depth < 5; depth++) {
        const isWrapper = (n: string): boolean => n !== GMP_METADATA_FOLDER && n !== GMP_FALLBACK_METADATA_FOLDER && n !== TEMP_FOLDER;
        const dirs = fs
            .readdirSync(extractRoot, { withFileTypes: true })
            .filter((e) => e.isDirectory() && isWrapper(e.name))
            .map((e) => e.name);
        if (dirs.length !== 1)
            break;
        const child = path.join(extractRoot, dirs[0]);
        const marked = [...pluginsRootCandidates(child), ...moddedRootCandidates(child)].some((p) => fs.existsSync(p));
        if (!marked)
            break;
        extractRoot = child;
    }
    const modded: InstallTargets['modded'] = [];
    const plugins: InstallTargets['plugins'] = [];
    const patchers: InstallTargets['patchers'] = [];
    const modInfo: InstallTargets['modInfo'] = [];
    const moddedRoots = moddedRootCandidates(extractRoot).filter((p) => fs.existsSync(p));
    for (const mr of moddedRoots) {
        for (const e of fs.readdirSync(mr, { withFileTypes: true })) {
            if (e.isDirectory() && !modded.some((x) => x.destRel === e.name)) {
                modded.push({ src: path.join(mr, e.name), destRel: e.name });
            }
        }
    }
    const pluginRoots = pluginsRootCandidates(extractRoot).filter((p) => fs.existsSync(p));
    for (const pr of pluginRoots)
        walkDlls(pr, '', plugins);
    const patchersRoots = patchersRootCandidates(extractRoot).filter((p) => fs.existsSync(p));
    for (const pr of patchersRoots)
        walkPatchers(pr, '', patchers);
    if (pluginRoots.length > 0 || moddedRoots.length > 0 || patchersRoots.length > 0) {
        return { modded, plugins, patchers, modInfo };
    }
    walkHeuristic(extractRoot, { modded, plugins, patchers, modInfo });
    return { modded, plugins, patchers, modInfo };
}
export function deriveModName(targets: InstallTargets): string {
    if (targets.plugins.length > 0) {
        const p = targets.plugins[0].destRel;
        if (p.includes('/'))
            return p.split('/')[0];
        return p.slice(0, -PLUGIN_EXT.length);
    }
    if (targets.modded.length > 0)
        return targets.modded[0].destRel;
    return 'Unknown Mod';
}
export function buildPlan(extractRoot: string): ModInstallPlanDto {
    const targets = collectTargets(extractRoot);
    const modded = [...new Set(targets.modded.map((x) => x.destRel))];
    const plugins = [...new Set(targets.plugins.map((x) => x.destRel))];
    const needsConfirm = !(targets.modded.length > 0 && targets.plugins.length > 0);
    return {
        modName: deriveModName(targets),
        needsConfirm,
        modded,
        plugins
    };
}
