import path from 'path';
export function searchAbsolutePath(gameRoot: string, ...parts: string[]): string {
    const root = path.resolve(gameRoot);
    const formed = path.join(root, ...parts);
    if (formed !== root && !isInside(root, formed)) {
        throw new Error(`Path escapes game root: ${parts.join('/')}`);
    }
    return formed;
}
export function isInside(root: string, target: string): boolean {
    const r = path.resolve(root).toLowerCase();
    const t = path.resolve(target).toLowerCase();
    return t !== r && (t.startsWith(r + path.sep) || t.startsWith(r + '/'));
}
export function isPathSafetyValid(gameRoot: string, ...parts: string[]): boolean {
    try {
        searchAbsolutePath(gameRoot, ...parts);
        return true;
    }
    catch {
        return false;
    }
}
export function safeZipEntryPath(extractRoot: string, entryName: string): string {
    const normalized = entryName.replace(/\\/g, '/');
    if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
        throw new Error(`Unsafe zip entry (absolute): ${entryName}`);
    }
    if (normalized.split('/').includes('..')) {
        throw new Error(`Unsafe zip entry (path traversal): ${entryName}`);
    }
    const target = path.resolve(extractRoot, entryName);
    if (!isInside(extractRoot, target) && target !== path.resolve(extractRoot)) {
        throw new Error(`Unsafe zip entry (outside root): ${entryName}`);
    }
    return target;
}
