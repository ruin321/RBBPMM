import fs from 'fs';
import type { CustomLevelDto } from '../../shared/types';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GUID_RUN = /^[\w-]{8}-[\w-]{4}-[\w-]{4}-[\w-]{4}-[\w-]{12}$/i;
function isPrintableAscii(b: number): boolean {
    return b >= 32 && b <= 126;
}
function collectStrings(buf: Buffer, end: number): string[] {
    const out: string[] = [];
    let i = 0;
    while (i + 1 <= end && i < buf.length) {
        const len = buf[i];
        if (len >= 3 && len <= 64 && i + 1 + len <= end && i + 1 + len <= buf.length) {
            let printable = true;
            for (let k = 0; k < len; k++) {
                if (!isPrintableAscii(buf[i + 1 + k])) {
                    printable = false;
                    break;
                }
            }
            if (printable) {
                out.push(buf.toString('latin1', i + 1, i + 1 + len));
                i += 1 + len;
                continue;
            }
        }
        i++;
    }
    return out;
}
export function readCustomLevel(pbplPath: string, size: number): CustomLevelDto | null {
    let buf: Buffer;
    let statSize = size;
    try {
        buf = fs.readFileSync(pbplPath);
        if (statSize <= 0)
            statSize = buf.length;
    }
    catch {
        return null;
    }
    const pngStart = buf.indexOf(PNG_MAGIC);
    const metaEnd = pngStart >= 0 ? pngStart : buf.length;
    const raw = collectStrings(buf, metaEnd);
    const strings = raw.filter((s) => s.length >= 3 && !GUID_RUN.test(s));
    const pool = strings.length > 0 ? strings : raw;
    let name = '';
    let author = '';
    let type = '';
    if (pool.length > 0)
        name = pool[0];
    if (pool.length > 1)
        author = pool[1];
    const knownType = pool.find((s) => /^standard$/i.test(s));
    type = knownType || '';
    if (!type) {
        const t = pool.find((s) => s.length <= 24 && /^[a-z][a-z0-9._-]*$/i.test(s) && s !== name && s !== author);
        type = t || '';
    }
    if (!name)
        name = '';
    let thumbnail: string | undefined;
    if (pngStart >= 0) {
        const iend = buf.indexOf(Buffer.from('IEND'), pngStart);
        if (iend >= 0) {
            const png = buf.slice(pngStart, iend + 8);
            if (png.length > PNG_MAGIC.length) {
                thumbnail = `data:image/png;base64,${png.toString('base64')}`;
            }
        }
    }
    return {
        fileName: '',
        name: name || '',
        author,
        type: type || '',
        size: statSize,
        enabled: true,
        thumbnail
    };
}
