import fs from 'fs';
import path from 'path';
import type { InstallProgress, ModManifestDto, ModMetadataDto, ModItemDto, SecurityWarning } from '../../shared/types';
import { GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER, TEMP_FOLDER, bepinexPatchersDir, bepinexPluginsDir, bepinexModInfoDir } from '../constants';
import { createTempDir, extractArchive, removeDirIfInside } from './ModArchiveExtractor';
import { matchSupportedVersion } from './ManifestLoader';
import { getModDirectoryName } from './StableHash';
import { isInside } from './PathGuard';
import { scanManifest } from './SecurityScanner';
import { buildModItem } from './ModRepositoryScanner';
import { collectTargets, deriveModName, type InstallTargets } from './ModArchivePlanner';
const MODDED_REL = path.join('BALDI_Data', 'StreamingAssets', 'Modded');
export interface ProgressCb {
    (progress: InstallProgress): void;
}
function gmpFolderName(): string {
    return GMP_METADATA_FOLDER;
}
const pluginExt = '.dll';
function relatedFiles(dir: string, base: string): string[] {
    const out: string[] = [];
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
        if (f === `${base}.dll` || f === `${base}.xml` || f === `${base}.pdb`)
            out.push(f);
    }
    return out;
}
export async function installModArchive(gameRoot: string, archivePath: string, gameVersion: string | undefined, onProgress?: ProgressCb, isCancelled?: () => boolean, preExtractedRoot?: string): Promise<{
    mod: ModItemDto;
    warnings: SecurityWarning[];
}> {
    const tick = (): Promise<void> => new Promise((r) => setImmediate(r));
    const report = async (stage: string, percent?: number, message?: string): Promise<void> => {
        if (isCancelled?.())
            throw new Error('install cancelled');
        onProgress?.({ stage, percent, message });
        await tick();
    };
    const ownsTemp = !preExtractedRoot;
    const tempRoot = preExtractedRoot ?? createTempDir(gameRoot);
    const moved: {
        from: string;
        to: string;
    }[] = [];
    const rollback = (): void => {
        for (const m of moved.reverse()) {
            try {
                if (fs.existsSync(m.to))
                    fs.rmSync(m.to, { recursive: true, force: true });
            }
            catch {
            }
        }
    };
    let extractRoot!: string;
    let manifest!: ModManifestDto;
    let modRoot!: string;
    let pluginDir!: string;
    try {
        await report('extract', 5, 'Extracting archive');
        extractRoot = preExtractedRoot ?? (await extractArchive(archivePath, tempRoot));
        await report('read-manifest', 15, 'Reading manifest');
        const parsed = loadManifestCompat(extractRoot);
        if (!parsed)
            throw new Error('No valid manifest.json found in archive');
        manifest = parsed;
        const warnings: SecurityWarning[] = scanManifest(gameRoot, extractRoot, manifest);
        const dirName = getModDirectoryName(manifest);
        pluginDir = path.join(bepinexPluginsDir(gameRoot), dirName);
        modRoot = pluginDir;
        if (fs.existsSync(pluginDir)) {
            throw new Error(`Mod already installed: ${manifest.name}`);
        }
        await report('install', 40, 'Installing resources');
        fs.mkdirSync(pluginDir, { recursive: true });
        const installedPlugins: string[] = [];
        for (const p of manifest.plugins) {
            const srcRel = normalizeRel(p);
            const src = path.resolve(extractRoot, srcRel);
            if (!isInside(extractRoot, src))
                throw new Error(`Plugin escapes temp: ${p}`);
            if (!fs.existsSync(src))
                continue;
            const base = path.basename(src, pluginExt);
            for (const rel of relatedFiles(path.dirname(src), base)) {
                const from = path.join(path.dirname(src), rel);
                const to = path.join(pluginDir, rel);
                if (fs.existsSync(from)) {
                    fs.renameSync(from, to);
                    moved.push({ from, to });
                }
            }
            installedPlugins.push(`${base}${pluginExt}`);
            if (isCancelled?.())
                throw new Error('install cancelled');
        }
        manifest.plugins = installedPlugins;
        const patchersDir = bepinexPatchersDir(gameRoot);
        const installedPatchers: string[] = [];
        for (const p of manifest.patchers) {
            const src = path.resolve(extractRoot, normalizeRel(p));
            if (!isInside(extractRoot, src))
                throw new Error(`Patcher escapes temp: ${p}`);
            if (!fs.existsSync(src))
                continue;
            fs.mkdirSync(patchersDir, { recursive: true });
            const to = path.join(patchersDir, path.basename(src));
            fs.renameSync(src, to);
            moved.push({ from: src, to });
            installedPatchers.push(path.basename(src));
            if (isCancelled?.())
                throw new Error('install cancelled');
        }
        manifest.patchers = installedPatchers;
        for (let i = 0; i < manifest.assets.length; i++) {
            const asset = manifest.assets[i];
            if (!asset.destination)
                continue;
            const dest = path.resolve(gameRoot, asset.destination);
            if (!isInside(gameRoot, dest))
                throw new Error(`Asset destination escapes game root: ${dest}`);
            const src = path.resolve(extractRoot, normalizeRel(asset.localPath));
            if (!isInside(extractRoot, src))
                continue;
            if (!fs.existsSync(src))
                continue;
            fs.mkdirSync(dest, { recursive: true });
            copyDirContents(src, dest, moved);
            if (isCancelled?.())
                throw new Error('install cancelled');
        }
        const srcGmp = findGmpDir(extractRoot);
        if (srcGmp) {
            const dstGmp = path.join(pluginDir, gmpFolderName());
            fs.renameSync(srcGmp, dstGmp);
            moved.push({ from: srcGmp, to: dstGmp });
            fs.writeFileSync(path.join(dstGmp, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
        }
        await report('metadata', 90, 'Writing metadata');
        const meta: ModMetadataDto = {
            activated: true,
            supportedPlusVersions: [],
            lastUpdateDate: new Date().toISOString().slice(0, 10)
        };
        const metaFolder = path.join(pluginDir, gmpFolderName());
        fs.writeFileSync(path.join(metaFolder, '.metadata'), JSON.stringify(meta, null, 2), 'utf-8');
        const supports = matchSupportedVersion(pluginDir, gameVersion);
        const mod = buildModItem(gameRoot, pluginDir, manifest, supports);
        await report('done', 100, 'Done');
        return { mod, warnings };
    }
    catch (e) {
        rollback();
        if (fs.existsSync(pluginDir) && fs.existsSync(modRoot)) {
            try {
                fs.rmSync(pluginDir, { recursive: true, force: true });
            }
            catch {
            }
        }
        throw e;
    }
    finally {
        if (ownsTemp) {
            try {
                if (fs.existsSync(gameRoot) && isInside(gameRoot, tempRoot))
                    removeDirIfInside(gameRoot, tempRoot);
            }
            catch {
            }
        }
    }
}
export function hasManifest(extractRoot: string): boolean {
    for (const f of [GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER]) {
        if (fs.existsSync(path.join(extractRoot, f, 'manifest.json')))
            return true;
    }
    return false;
}
function normalizeRel(p: string): string {
    const n = p.replace(/\\/g, '/');
    return n.startsWith('/') ? n.slice(1) : n;
}
function copyDirContents(srcDir: string, destDir: string, moved: {
    from: string;
    to: string;
}[]): void {
    for (const name of fs.readdirSync(srcDir)) {
        const from = path.join(srcDir, name);
        const to = path.join(destDir, name);
        const st = fs.statSync(from);
        if (st.isDirectory()) {
            fs.mkdirSync(to, { recursive: true });
            copyDirContents(from, to, moved);
        }
        else {
            fs.renameSync(from, to);
            moved.push({ from, to });
        }
    }
}
function findGmpDir(extractRoot: string): string | null {
    for (const f of [GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER]) {
        const p = path.join(extractRoot, f);
        if (fs.existsSync(p))
            return p;
    }
    return null;
}
function loadManifestCompat(extractRoot: string): ModManifestDto | null {
    for (const f of [GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER]) {
        const p = path.join(extractRoot, f, 'manifest.json');
        if (fs.existsSync(p)) {
            try {
                const m = JSON.parse(fs.readFileSync(p, 'utf-8'));
                if (!m?.guid || !m?.name || !m?.author || m?.version === undefined)
                    continue;
                m.plugins = m.plugins || [];
                m.patchers = m.patchers || [];
                m.assets = m.assets || [];
                return m as ModManifestDto;
            }
            catch {
                continue;
            }
        }
    }
    return null;
}
function copyTreeContents(srcDir: string, destDir: string): void {
    fs.mkdirSync(destDir, { recursive: true });
    for (const name of fs.readdirSync(srcDir)) {
        const from = path.join(srcDir, name);
        const to = path.join(destDir, name);
        if (fs.statSync(from).isDirectory())
            copyTreeContents(from, to);
        else
            fs.copyFileSync(from, to);
    }
}
export function installUnmanaged(extractRoot: string, gameRoot: string, onProgress?: ProgressCb, isCancelled?: () => boolean): string {
    const targets: InstallTargets = collectTargets(extractRoot);
    if (targets.modded.length === 0 && targets.plugins.length === 0 && targets.patchers.length === 0) {
        throw new Error('No installable files found in archive');
    }
    const modName = deriveModName(targets);
    const moddedRoot = path.resolve(gameRoot, MODDED_REL);
    const pluginsRoot = path.resolve(bepinexPluginsDir(gameRoot));
    const patchersRoot = path.resolve(bepinexPatchersDir(gameRoot));
    const created: string[] = [];
    const rollback = (): void => {
        for (const c of created.reverse()) {
            try {
                if (fs.existsSync(c))
                    fs.rmSync(c, { recursive: true, force: true });
            }
            catch {
            }
        }
    };
    try {
        for (const item of targets.modded) {
            if (isCancelled?.())
                throw new Error('install cancelled');
            const dest = path.resolve(moddedRoot, item.destRel);
            if (!isInside(moddedRoot, dest))
                throw new Error(`Modded dest escapes: ${dest}`);
            if (!isInside(gameRoot, dest))
                throw new Error(`dest outside game root: ${dest}`);
            const existed = fs.existsSync(dest);
            copyTreeContents(item.src, dest);
            if (!existed)
                created.push(dest);
            onProgress?.({ stage: 'install', percent: 50, message: modName });
        }
        for (const plugin of targets.plugins) {
            if (isCancelled?.())
                throw new Error('install cancelled');
            const destRel = plugin.destRel.includes('/')
                ? path.join(...plugin.destRel.split('/'))
                : plugin.destRel;
            const dest = path.resolve(pluginsRoot, destRel);
            if (!isInside(pluginsRoot, dest))
                throw new Error(`plugin dest escapes: ${dest}`);
            if (!isInside(gameRoot, dest))
                throw new Error(`dest outside game root: ${dest}`);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            const existed = fs.existsSync(dest);
            fs.copyFileSync(plugin.src, dest);
            if (!existed)
                created.push(dest);
            for (const extra of plugin.extras) {
                if (!fs.existsSync(extra))
                    continue;
                const extraDest = path.join(path.dirname(dest), path.basename(extra));
                const existedExtra = fs.existsSync(extraDest);
                fs.copyFileSync(extra, extraDest);
                if (!existedExtra)
                    created.push(extraDest);
            }
        }
        for (const patcher of targets.patchers) {
            if (isCancelled?.())
                throw new Error('install cancelled');
            const destRel = patcher.destRel.includes('/')
                ? path.join(...patcher.destRel.split('/'))
                : patcher.destRel;
            const dest = path.resolve(patchersRoot, destRel);
            if (!isInside(patchersRoot, dest))
                throw new Error(`patcher dest escapes: ${dest}`);
            if (!isInside(gameRoot, dest))
                throw new Error(`dest outside game root: ${dest}`);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            const existed = fs.existsSync(dest);
            fs.copyFileSync(patcher.src, dest);
            if (!existed)
                created.push(dest);
        }
        if (targets.modInfo.length > 0) {
            const modInfoRoot = path.resolve(bepinexModInfoDir(gameRoot));
            fs.mkdirSync(modInfoRoot, { recursive: true });
            for (const item of targets.modInfo) {
                if (isCancelled?.())
                    throw new Error('install cancelled');
                const dest = path.resolve(modInfoRoot, item.destRel);
                if (!isInside(modInfoRoot, dest))
                    throw new Error(`modInfo dest escapes: ${dest}`);
                if (!isInside(gameRoot, dest))
                    throw new Error(`dest outside game root: ${dest}`);
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                const existed = fs.existsSync(dest);
                fs.copyFileSync(item.src, dest);
                if (!existed)
                    created.push(dest);
            }
        }
        onProgress?.({ stage: 'done', percent: 100, message: modName });
        return modName;
    }
    catch (e) {
        rollback();
        throw e;
    }
}
export function cleanupInstallCancelled(gameRoot: string): void {
    try {
        const tempBase = path.join(gameRoot, GMP_METADATA_FOLDER, TEMP_FOLDER);
        if (fs.existsSync(tempBase))
            fs.rmSync(tempBase, { recursive: true, force: true });
    }
    catch {
    }
}
