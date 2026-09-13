import crypto from 'crypto';
import type { ModManifestDto } from '../../shared/types';
export function getStableHash(manifest: Pick<ModManifestDto, 'guid' | 'name' | 'author'>): string {
    const input = `${manifest.guid}:${manifest.name}:${manifest.author}`;
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}
export function getModDirectoryName(manifest: Pick<ModManifestDto, 'guid' | 'name' | 'author'>): string {
    return `${manifest.name}_${getStableHash(manifest)}`;
}
