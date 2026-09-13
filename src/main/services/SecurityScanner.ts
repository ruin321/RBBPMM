import fs from 'fs';
import path from 'path';
import type { ModManifestDto, SecurityWarning } from '../../shared/types';
import { isInside } from './PathGuard';
import { DISABLED_EXTENSION } from '../constants';
const EXECUTABLE_EXTS = new Set(['.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.sh', '.ps1', '.jar']);
const MN = Buffer.from([0x4d, 0x5a]);
const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
function looksExecutable(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (EXECUTABLE_EXTS.has(ext))
        return true;
    try {
        const buf = fs.readFileSync(filePath);
        const head = buf.subarray(0, 4);
        return buf.subarray(0, 2).equals(MN) || head.equals(ELF);
    }
    catch {
        return false;
    }
}
export function scanManifest(gameRoot: string, extractRoot: string, manifest: ModManifestDto): SecurityWarning[] {
    const warnings: SecurityWarning[] = [];
    const checkAsset = (localPath: string, destination: string | undefined, index: number): void => {
        if (destination) {
            const dest = path.resolve(gameRoot, destination);
            if (!isInside(gameRoot, dest)) {
                warnings.push({ field: `assets[${index}].Destination`, reason: 'path escapes game root' });
                return;
            }
            const localAbs = path.resolve(extractRoot, localPath);
            if (fs.existsSync(localAbs) && fs.statSync(localAbs).isFile() && looksExecutable(localAbs)) {
                warnings.push({ field: `assets[${index}].LocalPath`, reason: 'asset looks like an executable' });
            }
        }
    };
    manifest.assets.forEach((a, i) => checkAsset(a.localPath, a.destination, i));
    return warnings;
}
