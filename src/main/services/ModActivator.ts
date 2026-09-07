import fs from 'fs'
import path from 'path'
import type { ModManifestDto, ModMetadataDto } from '../../shared/types'
import { DISABLED_EXTENSION, bepinexPatchersDir } from '../constants'
import { loadMetadata, saveMetadata } from './ManifestLoader'

const pluginExt = '.dll'


function dllStem(relative: string): string {
  let s = relative
  let lc = s.toLowerCase()
  if (lc.endsWith('.disabled')) s = s.slice(0, -9)
  else if (lc.endsWith('.disable')) s = s.slice(0, -7)
  lc = s.toLowerCase()
  const backup = /^(.*)\.dll\.\d+$/i.exec(s)
  if (backup) return backup[1]
  if (lc.endsWith('.dll')) return s.slice(0, -4)
  return s
}


function renameDll(dir: string, base: string, activate: boolean): boolean {
  const active = path.join(dir, `${base}.dll`)
  const disabled = path.join(dir, `${base}.dll.${DISABLED_EXTENSION}`)
  if (activate) {
    if (fs.existsSync(active)) return true 
    
    const baseDir = path.dirname(active)
    const stemName = path.basename(base)
    for (const f of fs.readdirSync(baseDir)) {
      if (f.toLowerCase().startsWith(`${stemName.toLowerCase()}.dll.`)) {
        const src = path.join(baseDir, f)
        if (fs.statSync(src).isFile()) {
          fs.renameSync(src, active)
          return true
        }
      }
    }
    return false
  }
  if (fs.existsSync(active)) {
    fs.renameSync(active, disabled)
    return true
  }
  return true 
}


export function toggleActivation(
  gameRoot: string,
  modRoot: string,
  manifest: ModManifestDto,
  activate: boolean
): { activated: boolean } {
  for (const p of manifest.plugins) {
    
    
    const pluginPath = path.resolve(modRoot, p.startsWith('..') ? path.join('..', p) : p)
    const dir = path.dirname(pluginPath)
    const base = path.basename(pluginPath, pluginExt)
    if (fs.existsSync(dir)) renameDll(dir, base, activate)
  }

  const patchersDir = bepinexPatchersDir(gameRoot)
  for (const p of manifest.patchers) {
    const base = path.basename(p, pluginExt)
    if (fs.existsSync(patchersDir)) renameDll(patchersDir, base, activate)
  }

  const meta: ModMetadataDto = { ...loadMetadata(modRoot, manifest), activated: activate }
  saveMetadata(modRoot, manifest, meta)
  return { activated: activate }
}





export function toggleLegacyPlugin(
  installDir: string,
  pluginFiles: string[],
  activate: boolean
): { activated: boolean } {
  for (const pf of pluginFiles) {
    
    renameDll(installDir, dllStem(pf), activate)
  }
  return { activated: activate }
}