import fs from 'fs'
import path from 'path'
import type { ModInstallPlanDto } from '../../shared/types'
import { GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER, TEMP_FOLDER } from '../constants'

const PLUGIN_EXT = '.dll'


export interface InstallTargets {
  
  modded: { src: string; destRel: string }[]
  
  plugins: { src: string; destRel: string; extras: string[] }[]
}

function pluginsRootCandidates(extractRoot: string): string[] {
  return [path.join(extractRoot, 'BepInEx', 'plugins'), path.join(extractRoot, 'plugins')]
}

function moddedRootCandidates(extractRoot: string): string[] {
  return [
    path.join(extractRoot, 'BALDI_Data', 'StreamingAssets', 'Modded'),
    path.join(extractRoot, 'Modded')
  ]
}

function pluginTarget(absDll: string, rel: string): { src: string; destRel: string; extras: string[] } {
  const dir = path.dirname(absDll)
  const stem = path.basename(absDll, PLUGIN_EXT)
  const extras = [] as string[]
  for (const f of ['xml', 'pdb']) {
    const p = path.join(dir, `${stem}.${f}`)
    if (fs.existsSync(p)) extras.push(p)
  }
  return { src: absDll, destRel: rel, extras }
}

function walkDlls(dir: string, rel: string, into: { src: string; destRel: string; extras: string[] }[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      walkDlls(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name, into)
    } else if (e.name.toLowerCase().endsWith(PLUGIN_EXT)) {
      const r = rel ? `${rel}/${e.name}` : e.name
      into.push(pluginTarget(path.join(dir, e.name), r))
    }
  }
}







export function collectTargets(input: string): InstallTargets {
  
  
  let extractRoot = input
  for (let depth = 0; depth < 5; depth++) {
    const isWrapper = (n: string): boolean =>
      n !== GMP_METADATA_FOLDER && n !== GMP_FALLBACK_METADATA_FOLDER && n !== TEMP_FOLDER
    const dirs = fs
      .readdirSync(extractRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && isWrapper(e.name))
      .map((e) => e.name)
    if (dirs.length !== 1) break
    const child = path.join(extractRoot, dirs[0])
    const marked = [...pluginsRootCandidates(child), ...moddedRootCandidates(child)].some((p) =>
      fs.existsSync(p)
    )
    if (!marked) break
    extractRoot = child
  }

  const modded: InstallTargets['modded'] = []
  const plugins: InstallTargets['plugins'] = []

  const moddedRoots = moddedRootCandidates(extractRoot).filter((p) => fs.existsSync(p))
  for (const mr of moddedRoots) {
    for (const e of fs.readdirSync(mr, { withFileTypes: true })) {
      if (e.isDirectory() && !modded.some((x) => x.destRel === e.name)) {
        modded.push({ src: path.join(mr, e.name), destRel: e.name })
      }
    }
  }

  const pluginRoots = pluginsRootCandidates(extractRoot).filter((p) => fs.existsSync(p))
  for (const pr of pluginRoots) walkDlls(pr, '', plugins)

  const skipResolve = [
    ...moddedRoots.map((p) => path.resolve(p)),
    ...pluginRoots.map((p) => path.resolve(p))
  ]

  
  
  if (pluginRoots.length > 0 || moddedRoots.length > 0) {
    return { modded, plugins }
  }

  for (const e of fs.readdirSync(extractRoot, { withFileTypes: true })) {
    const abs = path.join(extractRoot, e.name)
    if (skipResolve.includes(path.resolve(abs))) continue
    if (e.name === GMP_METADATA_FOLDER || e.name === GMP_FALLBACK_METADATA_FOLDER) continue
    if (e.name === TEMP_FOLDER) continue
    if (e.isDirectory()) {
      if (!modded.some((x) => x.destRel === e.name))
        modded.push({ src: abs, destRel: e.name })
    } else if (e.name.toLowerCase().endsWith(PLUGIN_EXT)) {
      if (!plugins.some((x) => x.destRel === e.name))
        plugins.push(pluginTarget(abs, e.name))
    }
    
  }

  return { modded, plugins }
}

export function deriveModName(targets: InstallTargets): string {
  if (targets.plugins.length > 0) {
    const p = targets.plugins[0].destRel
    if (p.includes('/')) return p.split('/')[0]
    return p.slice(0, -PLUGIN_EXT.length)
  }
  if (targets.modded.length > 0) return targets.modded[0].destRel
  return 'Unknown Mod'
}


export function buildPlan(extractRoot: string): ModInstallPlanDto {
  const targets = collectTargets(extractRoot)
  const modded = [...new Set(targets.modded.map((x) => x.destRel))]
  const plugins = [...new Set(targets.plugins.map((x) => x.destRel))]
  const needsConfirm = !(targets.modded.length > 0 && targets.plugins.length > 0)
  return {
    modName: deriveModName(targets),
    needsConfirm,
    modded,
    plugins
  }
}