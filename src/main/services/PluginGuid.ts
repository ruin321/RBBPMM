import fs from 'fs'













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
])

const STOP_TAIL = /\.(patches|ui|optionsapi|assettools|configuration|logging|bootstrap|api|tool|editor|handler|objectpool|extensions|manager|debug|state|core)$/i


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
])


function scanTokens(text: string): { utf16: string[]; ascii: string[] } {
  const ascii =
    text.match(/[A-Za-z][A-Za-z0-9_]{1,40}(?:\.[A-Za-z][A-Za-z0-9_]{0,40}){2,6}/g) || []
  const utf16: string[] = []
  const n = text.length
  let i = 0
  while (i < n) {
    if (text[i] === '\x00') {
      i++
      continue
    }
    if (!/[A-Za-z0-9_.]/.test(text[i])) {
      i++
      continue
    }
    let w = ''
    while (i < n && text[i + 1] === '\x00' && /[A-Za-z0-9_.]/.test(text[i])) {
      w += text[i]
      i += 2
    }
    if (w.length >= 3) utf16.push(w)
    i++
  }

  const plausible = (raw: string[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const rawTok of raw) {
      const segs = rawTok.split('.').filter(Boolean)
      const len = segs.length
      if (len < 3 || len > 7) continue
      if (segs.some((s) => STOP_SEGMENTS.has(s.toLowerCase()))) continue
      if (segs.some((s) => /^\d+$/.test(s))) continue
      const tok = segs.join('.')
      if (seen.has(tok)) continue
      if (STOP_TAIL.test(tok)) continue
      const mid = segs.slice(1, -1).map((s) => s.toLowerCase())
      if (mid.some((s) => STOP_MID.has(s))) continue
      seen.add(tok)
      out.push(tok)
    }
    return out
  }

  const utf = plausible(utf16).sort((a, b) => a.split('.').length - b.split('.').length)
  const asciiOut = plausible(ascii)
    .sort((a, b) => a.split('.').length - b.split('.').length)
    .filter((a) => !utf.includes(a)) 
  return { utf16: utf, ascii: asciiOut }
}





export function extractPluginCandidates(dllPath: string): string[] {
  if (!fs.existsSync(dllPath)) return []
  let text: string
  try {
    
    text = fs.readFileSync(dllPath).toString('latin1')
  } catch {
    return []
  }
  const { utf16, ascii } = scanTokens(text)
  return [...utf16, ...ascii]
}


export function extractPluginGuid(dllPath: string): string | undefined {
  return extractPluginCandidates(dllPath)[0]
}