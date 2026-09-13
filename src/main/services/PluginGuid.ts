import fs from 'fs';
import path from 'path';
const TOKEN_RE = /[A-Za-z][A-Za-z0-9_]{1,40}(?:\.[A-Za-z][A-Za-z0-9_]{0,40}){2,6}/g;
const UTF16_RUN_RE = /(?:[A-Za-z0-9_.]\x00){3,}/g;
const STOP_SEGMENTS = new Set([
    'system',
    'unity',
    'unityengine',
    'microsoft',
    'mscorlib',
    'mono',
    'monomod',
    'newtonsoft',
    'bepinex',
    'csharp',
    'assembly',
    'js',
    'native',
    'dotnet'
]);
const STOP_TAIL = /\.(patches|ui|optionsapi|assettools|configuration|logging|bootstrap|api|tool|editor|handler|objectpool|extensions|manager|debug|state|core)$/i;
const STOP_MID = new Set([
    'ui',
    'editor',
    'tools',
    'extensions',
    'handlers',
    'objectpool',
    'manager',
    'debug',
    'state',
    'core',
    'patches',
    'api'
]);
function scanTokens(text: string): {
    utf16: string[];
    ascii: string[];
} {
    const ascii = text.match(TOKEN_RE) || [];
    const utf16 = (text.match(UTF16_RUN_RE) || []).map((run) => run.replace(/\x00/g, ''));
    const plausible = (raw: string[]): string[] => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const rawTok of raw) {
            const segs = rawTok.split('.').filter(Boolean);
            const len = segs.length;
            if (len < 3 || len > 7)
                continue;
            if (segs.some((s) => STOP_SEGMENTS.has(s.toLowerCase())))
                continue;
            if (segs.some((s) => /^\d+$/.test(s)))
                continue;
            const tok = segs.join('.');
            if (seen.has(tok))
                continue;
            if (STOP_TAIL.test(tok))
                continue;
            const mid = segs.slice(1, -1).map((s) => s.toLowerCase());
            if (mid.some((s) => STOP_MID.has(s)))
                continue;
            seen.add(tok);
            out.push(tok);
        }
        return out;
    };
    const utf = plausible(utf16).sort((a, b) => a.split('.').length - b.split('.').length);
    const asciiOut = plausible(ascii)
        .sort((a, b) => a.split('.').length - b.split('.').length)
        .filter((a) => !utf.includes(a));
    return { utf16: utf, ascii: asciiOut };
}
const CANDIDATE_CACHE = new Map<string, string[]>();
const CANDIDATE_CACHE_MAX = 1024;
function cacheKeyFor(dllPath: string): string | null {
    try {
        const st = fs.statSync(dllPath);
        if (!st.isFile())
            return null;
        const dir = path.dirname(dllPath).toLowerCase();
        return `${dir}\u0000${path.basename(dllPath).toLowerCase()}\u0000${st.size}\u0000${st.mtimeMs}`;
    }
    catch {
        return null;
    }
}
function computeCandidates(dllPath: string): string[] {
    let text: string;
    try {
        text = fs.readFileSync(dllPath).toString('latin1');
    }
    catch {
        return [];
    }
    const { utf16, ascii } = scanTokens(text);
    return [...utf16, ...ascii];
}
export function extractPluginCandidates(dllPath: string): string[] {
    if (!fs.existsSync(dllPath))
        return [];
    const key = cacheKeyFor(dllPath);
    if (!key)
        return [];
    const cached = CANDIDATE_CACHE.get(key);
    if (cached)
        return cached.slice();
    const value = computeCandidates(dllPath);
    if (CANDIDATE_CACHE.size >= CANDIDATE_CACHE_MAX) {
        const oldest = CANDIDATE_CACHE.keys().next().value;
        if (oldest !== undefined)
            CANDIDATE_CACHE.delete(oldest);
    }
    CANDIDATE_CACHE.set(key, value);
    return value.slice();
}
export function extractPluginGuid(dllPath: string): string | undefined {
    return extractPluginCandidates(dllPath)[0];
}
