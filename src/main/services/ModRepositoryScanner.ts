import fs from 'fs'
import path from 'path'
import type { ModItemDto, ModManifestDto } from '../../shared/types'
import { bepinexPluginsDir, DISABLED_EXTENSION } from '../constants'
import { loadMetadata, loadModManifest, matchSupportedVersion } from './ManifestLoader'
import { extractPluginCandidates } from './PluginGuid'
import { MOD_GUID_OVERRIDES } from './ModGuidTable'


function moddedRoot(gameRoot: string): string {
  return path.join(gameRoot, 'BALDI_Data', 'StreamingAssets', 'Modded')
}


function dirInstalledAt(abs: string): number | undefined {
  try {
    const st = fs.statSync(abs)
    
    const b = st.birthtimeMs
    if (Number.isFinite(b) && b > 0) return Math.round(b)
    if (Number.isFinite(st.mtimeMs)) return Math.round(st.mtimeMs)
  } catch {
    
  }
  return undefined
}


function moddedFolderMap(gameRoot: string): Map<string, string> | undefined {
  const root = moddedRoot(gameRoot)
  if (!fs.existsSync(root)) return undefined
  const map = new Map<string, string>()
  try {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (e.isDirectory()) map.set(e.name.toLowerCase(), path.join(root, e.name))
    }
  } catch {
    
  }
  return map
}


function findModdedFolder(gameRoot: string, names: (string | undefined)[]): string | undefined {
  const dirs = moddedFolderMap(gameRoot)
  if (!dirs) return undefined
  for (const n of names) {
    if (!n) continue
    const abs = dirs.get(String(n).toLowerCase())
    if (abs) return abs
  }
  return undefined
}


function pluginDiskPath(pluginDir: string, rel: string): string {
  const direct = path.join(pluginDir, rel)
  if (fs.existsSync(direct)) return direct
  for (const ext of ['.disabled', '.disable']) {
    const alt = direct + ext
    if (fs.existsSync(alt)) return alt
  }
  return direct
}


function collectCandidates(pluginDir: string, pluginFiles: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const rel of pluginFiles.slice(0, 16)) {
    for (const c of extractPluginCandidates(pluginDiskPath(pluginDir, rel))) {
      if (!seen.has(c)) {
        seen.add(c)
        out.push(c)
      }
    }
  }
  return out
}

function resolveIdentifyName(
  title: string,
  pluginDir: string,
  pluginFiles: string[]
): string | undefined {
  if (MOD_GUID_OVERRIDES[title]) return MOD_GUID_OVERRIDES[title]
  return collectCandidates(pluginDir, pluginFiles)[0]
}

const DISABLED = `.${DISABLED_EXTENSION}` 


function titleMatchScore(title: string | undefined, guid: string | undefined): number {
  if (!title || !guid) return 0
  const t = title.toLowerCase()
  const g = guid.toLowerCase()
  const last = g.split('.').pop() ?? ''
  if (t === last || t === g) return 3
  if (last.includes(t) || t.includes(last)) return 2
  const tJ = t.replace(/[^a-z0-9]/g, '')
  const gJ = g.replace(/[^a-z0-9]/g, '')
  if (gJ.includes(tJ) || tJ.includes(gJ)) return 1
  return 0
}


export function buildModItem(
  gameRoot: string,
  modRoot: string,
  manifest: ModManifestDto,
  supports: boolean
): ModItemDto {
  const dirName = path.basename(modRoot)
  const meta = loadMetadata(modRoot, manifest)
  return {
    guid: manifest.guid,
    name: manifest.name,
    author: manifest.author,
    version: manifest.version,
    description: manifest.description,
    identifyName: manifest.guid,
    installedAt: dirInstalledAt(modRoot),
    moddedFolder: findModdedFolder(gameRoot, [dirName, manifest.name, manifest.guid]),
    directoryName: dirName,
    installDir: modRoot,
    activated: meta.activated !== false,
    supportsCurrentVersion: supports,
    pluginFiles: manifest.plugins,
    assetPaths: manifest.assets.map((a) => a.destination || a.localPath),
    loose: false
  }
}








function parsePluginEntry(name: string): { stem: string; file: string; disabled: boolean } | null {
  if (!name || name[0] === '.') return null
  const lc = name.toLowerCase()
  if (lc.endsWith('.disabled') || lc.endsWith('.disable')) {
    const raw = lc.endsWith('.disabled') ? name.slice(0, -9) : name.slice(0, -7)
    if (raw.toLowerCase().endsWith('.dll'))
      return { stem: raw.slice(0, -4), file: raw, disabled: true }
    return null
  }
  if (lc.endsWith('.dll')) return { stem: name.slice(0, -4), file: name, disabled: false }
  const backup = /^(.*\.dll)\.\d+$/i.exec(name)
  if (backup) return { stem: backup[1].slice(0, -4), file: name, disabled: true }
  return null
}


function collectPlugins(
  dir: string,
  prefix = '',
  out: { file: string; disabled: boolean }[] = []
): { file: string; disabled: boolean }[] {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? path.join(prefix, f.name) : f.name
    if (f.isFile()) {
      const norm = parsePluginEntry(f.name)
      if (norm) out.push({ file: norm.file === f.name ? rel : path.join(prefix, norm.file), disabled: norm.disabled })
    } else if (f.isDirectory()) {
      collectPlugins(path.join(dir, f.name), rel, out)
    }
  }
  return out
}


function buildLegacyItem(
  installDir: string,
  title: string,
  plugins: string[],
  activated: boolean,
  identifyName?: string
): ModItemDto {
  return {
    guid: `legacy:${title}`,
    name: title,
    author: 'BepInEx plugin',
    version: '',
    description: undefined,
    identifyName,
    installedAt: dirInstalledAt(installDir),
    moddedFolder: undefined,
    directoryName: path.basename(installDir),
    installDir,
    activated,
    supportsCurrentVersion: true,
    pluginFiles: plugins,
    assetPaths: [],
    loose: false
  }
}







export function scanRepository(gameRoot: string, gameVersion?: string): ModItemDto[] {
  const pluginsDir = bepinexPluginsDir(gameRoot)
  if (!fs.existsSync(pluginsDir)) return []
  const mods: ModItemDto[] = []
  const coveredStems = new Set<string>()
  const legacyMetas: { item: ModItemDto; candidates: string[] }[] = []

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })

  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const modRoot = path.join(pluginsDir, entry.name)
    const manifest = loadModManifest(modRoot)
    if (manifest) {
      const supports = matchSupportedVersion(modRoot, gameVersion)
      mods.push(buildModItem(gameRoot, modRoot, manifest, supports))
      for (const p of manifest.plugins) {
        const norm = parsePluginEntry(path.basename(p))
        if (norm) coveredStems.add(norm.stem.toLowerCase())
      }
      continue
    }
    const plugins = collectPlugins(modRoot)
    if (plugins.length === 0) continue
    const activeFiles = plugins.filter((x) => !x.disabled).map((x) => x.file)
    const activated = activeFiles.length > 0
    
    const pluginFiles = activeFiles.length ? activeFiles : plugins.map((x) => x.file)
    const item = buildLegacyItem(
      modRoot,
      entry.name,
      pluginFiles,
      activated,
      resolveIdentifyName(entry.name, modRoot, pluginFiles)
    )
    mods.push(item)
    legacyMetas.push({ item, candidates: collectCandidates(modRoot, pluginFiles) })
    for (const p of plugins) {
      coveredStems.add(path.basename(p.file).toLowerCase())
    }
  }

  
  const roots: Array<{ title: string; active: string[]; disabled: string[] }> = []
  const rootIndex = new Map<string, { title: string; active: string[]; disabled: string[] }>()
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const norm = parsePluginEntry(entry.name)
    if (!norm) continue
    const stem = norm.stem.toLowerCase()
    if (coveredStems.has(stem)) continue
    let group = rootIndex.get(stem)
    if (!group) {
      group = { title: norm.stem, active: [], disabled: [] }
      rootIndex.set(stem, group)
      roots.push(group)
    }
    if (norm.disabled) group.disabled.push(norm.file)
    else group.active.push(norm.file)
  }
  for (const g of roots) {
    if (g.active.length > 0) {
      const item = buildLegacyItem(
        pluginsDir,
        g.title,
        g.active,
        true,
        resolveIdentifyName(g.title, pluginsDir, g.active)
      )
      mods.push(item)
      legacyMetas.push({ item, candidates: collectCandidates(pluginsDir, g.active) })
    } else if (g.disabled.length > 0) {
      const item = buildLegacyItem(
        pluginsDir,
        g.title,
        [g.disabled[0]],
        false,
        resolveIdentifyName(g.title, pluginsDir, [g.disabled[0]])
      )
      mods.push(item)
      legacyMetas.push({ item, candidates: collectCandidates(pluginsDir, [g.disabled[0]]) })
    }
  }

  
  const dirs = moddedFolderMap(gameRoot)
  if (dirs && legacyMetas.length > 0) {
    
    const identFreq = new Map<string, number>()
    for (const le of legacyMetas) {
      const idn = le.item.identifyName
      if (idn) {
        const k = String(idn).toLowerCase()
        identFreq.set(k, (identFreq.get(k) ?? 0) + 1)
      }
    }

    const claimed = new Set<string>()
    
    for (const m of mods) {
      if (m.moddedFolder) claimed.add(path.basename(m.moddedFolder).toLowerCase())
    }
    
    for (const le of legacyMetas) {
      const abs = le.item.identifyName ? dirs.get(String(le.item.identifyName).toLowerCase()) : undefined
      if (abs) claimed.add(path.basename(abs).toLowerCase())
    }
    
    const identOwners = new Map<string, { le: { item: ModItemDto }; score: number }[]>()
    for (const le of legacyMetas) {
      const idn = le.item.identifyName
      if (!idn) continue
      const abs = dirs.get(String(idn).toLowerCase())
      if (!abs) continue
      const k = path.basename(abs).toLowerCase()
      const score = Math.max(titleMatchScore(le.item.name, idn), identFreq.get(k) === 1 ? 1 : 0)
      const arr = identOwners.get(k) ?? []
      arr.push({ le, score })
      identOwners.set(k, arr)
    }
    for (const [k, owners] of identOwners) {
      
      const scored = owners.filter((o) => o.score > 0)
      const pool = scored.length ? scored : owners
      const best = pool.reduce((a, b) => (b.score > a.score ? b : a), pool[0])
      if (pool.length !== 1 && best.score === 0) continue 
      best.le.item.moddedFolder = dirs.get(k)
      claimed.add(k)
    }
    
    for (const le of legacyMetas) {
      if (le.item.moddedFolder) continue
      for (const c of le.candidates) {
        const abs = c ? dirs.get(c.toLowerCase()) : undefined
        if (abs && !claimed.has(path.basename(abs).toLowerCase())) {
          le.item.moddedFolder = abs
          claimed.add(path.basename(abs).toLowerCase())
          break
        }
      }
      if (!le.item.moddedFolder) {
        const tf = findModdedFolder(gameRoot, [le.item.name])
        if (tf && !claimed.has(path.basename(tf).toLowerCase())) le.item.moddedFolder = tf
      }
    }
  }

  
  const configDir = path.join(path.dirname(pluginsDir), 'config')
  for (const m of mods) {
    
    const active =
      m.pluginFiles.find((p) => /\.dll$/i.test(p) && !/\.(disabled|disable|\.\d+)$/i.test(p)) ??
      m.pluginFiles[0]
    if (active) {
      const abs = path.isAbsolute(active) ? active : path.join(m.installDir, active)
      m.dllFile = abs
      m.dllDirectory = path.dirname(abs)
      m.loose = samePath(m.dllDirectory, pluginsDir)
    } else {
      m.loose = samePath(m.installDir, pluginsDir)
    }
    m.configFile = findConfigFile(configDir, m)
  }

  return mods
}


function samePath(a: string, b: string): boolean {
  return a.toLowerCase().replace(/[\\/]+$/, '') === b.toLowerCase().replace(/[\\/]+$/, '')
}


function findConfigFile(
  configDir: string,
  m: ModItemDto
): string | undefined {
  let cfgFiles: string[]
  try {
    if (!fs.existsSync(configDir)) return undefined
    cfgFiles = fs.readdirSync(configDir).filter((f) => /\.cfg$/i.test(f))
  } catch {
    return undefined
  }
  if (!cfgFiles.length) return undefined

  
  const stems = (m.pluginFiles || []).map((p) => path.basename(p).replace(/\.dll$/i, '').toLowerCase())
  for (const stem of stems) {
    if (!stem) continue
    const hit = cfgFiles.find((f) => {
      const s = f.toLowerCase().replace(/\.cfg$/i, '')
      return s === stem || s.startsWith(stem) || stem.startsWith(s)
    })
    if (hit) return path.join(configDir, hit)
  }

  
  const idn = (m.identifyName || '').toLowerCase()
  if (idn) {
    const byGuid = cfgFiles.find((f) => {
      const s = f.toLowerCase().replace(/\.cfg$/i, '')
      return s.includes(idn) || idn.includes(s)
    })
    if (byGuid) return path.join(configDir, byGuid)
  }

  return undefined
}