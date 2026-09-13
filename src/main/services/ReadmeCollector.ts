import fs from 'fs';
import path from 'path';
import { TEXTURE_PACK_README_PATTERN } from '../constants';
export interface ReadmeFile {
    name: string;
    content: string;
}
export function collectReadmes(root: string, out: ReadmeFile[], maxDepth: number, depth = 0): void {
    if (depth > maxDepth || !fs.existsSync(root))
        return;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            collectReadmes(path.join(root, entry.name), out, maxDepth, depth + 1);
            continue;
        }
        if (!TEXTURE_PACK_README_PATTERN.test(entry.name))
            continue;
        const full = path.join(root, entry.name);
        let content: string;
        try {
            const st = fs.statSync(full);
            if (st.size > 256 * 1024)
                continue;
            content = fs.readFileSync(full, 'utf8');
        }
        catch {
            continue;
        }
        out.push({ name: path.relative(root, full).split(path.sep).join('/'), content });
    }
}
