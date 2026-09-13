import fs from 'fs'
import path from 'path'
import type { ModManifestDto } from '../../shared/types'
import {
  bepinexPatchersDir,
  BEPINEX_CONFIG_FOLDER,
  GMP_METADATA_FOLDER,
  TEMP_FOLDER
} from '../constants'
import { isInside } from './PathGuard'

function removeSafe(target: string, root: string): void {
  if (fs.existsSync(target)) {
    if (!isInside(root, target)) {
      throw new Error(`refusing to modify path outside root: ${target}`)
    }
    fs.rmSync(target, { recursive: true, force: true })
  }
}

function removeFileIfExists(target: string, root: string): void {
  if (fs.existsSync(target)) {
    if (!isInside(root, target)) {
      throw new Error(`refusing to modify path outside root: ${target}`)
    }
    if (fs.statSync(target).isFile()) fs.rmSync(target, { force: true })
  }
}


function dllStem(nameOrPath: string): string {
  const base = path.basename(nameOrPath)
  let s = base
  let lc = s.toLowerCase()
  if (lc.endsWith('.disabled')) s = s.slice(0, -9)
  else if (lc.endsWith('.disable')) s = s.slice(0, -8)
  lc = s.toLowerCase()
  const backup = /^(.*)\.dll\.\d+$/i.exec(s)
  if (backup) return backup[1]
  if (lc.endsWith('.dll')) return s.slice(0, -4)
  return s
}


function cfgFiles(gameRoot: string, names: string[]): string[] {
  const configDir = path.join(gameRoot, 'BepInEx', BEPINEX_CONFIG_FOLDER)
  const out: string[] = []
  for (const n of names) {
    const stem = dllStem(n)
    if (stem && !out.includes(`${stem}.cfg`)) out.push(path.join(configDir, `${stem}.cfg`))
  }
  return out
}

interface Backup {
  src: string
  rel: string
}

function backupTargets(
  gameRoot: string,
  backupRoot: string,
  targets: string[]
): Backup[] {
  const backedUp: Backup[] = []
  for (const src of targets) {
    if (fs.existsSync(src)) {
      const rel = path.relative(gameRoot, src)
      const dst = path.join(backupRoot, rel)
      fs.cpSync(src, dst, { recursive: true, force: true })
      backedUp.push({ src, rel })
    }
  }
  return backedUp
}

function restoreBackups(gameRoot: string, backupRoot: string, backedUp: Backup[]): void {
  for (const b of backedUp.reverse()) {
    try {
      const orig = path.join(gameRoot, b.rel)
      if (fs.existsSync(b.src)) fs.rmSync(b.src, { recursive: true, force: true })
      if (fs.existsSync(orig)) fs.rmSync(orig, { recursive: true, force: true })
      fs.mkdirSync(path.dirname(orig), { recursive: true })
      fs.cpSync(path.join(backupRoot, b.rel), orig, { recursive: true, force: true })
    } catch {
      
    }
  }
}






export function deleteMod(gameRoot: string, installDir: string, manifest: ModManifestDto): void {
  const backupRoot = path.join(gameRoot, GMP_METADATA_FOLDER, TEMP_FOLDER, `backup_${Date.now()}`)
  fs.mkdirSync(backupRoot, { recursive: true })

  const pluginNames = [...manifest.plugins]
  const patcherNames = [...manifest.patchers]
  const patchersDir = bepinexPatchersDir(gameRoot)

  let backedUp: Backup[] = []
  try {
    
    const targets: string[] = [installDir]
    for (const a of manifest.assets) {
      if (a.destination) targets.push(path.resolve(gameRoot, a.destination))
    }
    for (const p of patcherNames) {
      targets.push(path.join(patchersDir, path.basename(p)))
    }
    targets.push(...cfgFiles(gameRoot, [...pluginNames, ...patcherNames]))
    backedUp = backupTargets(gameRoot, backupRoot, [...new Set(targets)])

    
    removeSafe(installDir, gameRoot)

    
    for (const p of patcherNames) {
      const abs = path.join(patchersDir, path.basename(p))
      removeSafe(abs, gameRoot)
      removeFileIfExists(abs.replace(/\.dll$/i, '.disabled'), gameRoot)
    }

    
    for (const a of manifest.assets) {
      if (!a.destination) continue
      const dest = path.resolve(gameRoot, a.destination)
      if (isInside(gameRoot, dest)) removeSafe(dest, gameRoot)
    }

    
    for (const c of cfgFiles(gameRoot, [...pluginNames, ...patcherNames])) {
      removeFileIfExists(c, gameRoot)
    }

    
    fs.rmSync(backupRoot, { recursive: true, force: true })
  } catch (e) {
    restoreBackups(gameRoot, backupRoot, backedUp)
    throw e
  }
}






export function deleteLegacyPlugin(
  gameRoot: string,
  installDir: string,
  pluginFiles: string[]
): void {
  const pluginsDir = path.join(gameRoot, 'BepInEx', 'plugins')
  const backupRoot = path.join(gameRoot, GMP_METADATA_FOLDER, TEMP_FOLDER, `backup_${Date.now()}`)
  fs.mkdirSync(backupRoot, { recursive: true })

  const stems = pluginFiles.map(dllStem)
  const lookups: string[] = []

  
  for (const pf of pluginFiles) {
    const abs = path.resolve(installDir, pf)
    if (isInside(installDir, abs) && isInside(gameRoot, abs)) lookups.push(abs)
  }
  
  const scanRoot =
    installDir !== pluginsDir && isInside(pluginsDir, installDir) && fs.existsSync(installDir)
      ? installDir
      : pluginsDir
  if (fs.existsSync(scanRoot)) {
    for (const e of fs.readdirSync(scanRoot, { withFileTypes: true })) {
      const stem = dllStem(e.name)
      if (stems.includes(stem)) {
        const abs = path.resolve(scanRoot, e.name)
        if (isInside(gameRoot, abs) && isInside(pluginsDir, abs)) lookups.push(abs)
      }
    }
  }

  const targets = [...new Set(lookups)]
  targets.push(...cfgFiles(gameRoot, stems))

  let backedUp: Backup[] = []
  try {
    backedUp = backupTargets(gameRoot, backupRoot, targets)
    for (const t of targets) {
      if (!fs.existsSync(t)) continue
      if (!isInside(gameRoot, t)) throw new Error(`refusing to modify path outside root: ${t}`)
      if (fs.statSync(t).isFile()) fs.rmSync(t, { force: true })
      else removeSafe(t, gameRoot)
    }
    
    if (
      installDir !== pluginsDir &&
      isInside(pluginsDir, installDir) &&
      fs.existsSync(installDir) &&
      fs.readdirSync(installDir).length === 0
    ) {
      fs.rmdirSync(installDir)
    }
    fs.rmSync(backupRoot, { recursive: true, force: true })
  } catch (e) {
    restoreBackups(gameRoot, backupRoot, backedUp)
    throw e
  }
}