import fs from 'fs'
import os from 'os'
import path from 'path'
import { TEXTURE_PACK_MANIFEST, texturePacksDir, PROTECTED_TEXTURE_PACK_FOLDERS } from '../constants'
import { isInside } from './PathGuard'
import { createTempDir, extractArchiveAsync, removeDirIfInside } from './ModArchiveExtractor'
import { collectReadmes, ReadmeFile } from './ReadmeCollector'
import { debugLog } from '../logger'
import type { TexturePackDto, TexturePackInstallResult } from '../../shared/types'


function readPackJson(dir: string): { name?: string; author?: string; version?: string; description?: string } | null {
  const p = path.join(dir, TEXTURE_PACK_MANIFEST)
  if (!fs.existsSync(p)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    return {
      name: typeof raw['Name'] === 'string' ? raw['Name'] : undefined,
      author: typeof raw['Author'] === 'string' ? raw['Author'] : undefined,
      version: raw['Version'] !== undefined ? String(raw['Version']) : undefined,
      description: typeof raw['Description'] === 'string' ? raw['Description'] : undefined
    }
  } catch {
    return null
  }
}


export function isProtectedTexturePack(folderName: string): boolean {
  return PROTECTED_TEXTURE_PACK_FOLDERS.has(String(folderName).toLowerCase())
}


export function listTexturePacks(gameRoot: string): TexturePackDto[] {
  const dir = texturePacksDir(gameRoot)
  if (!fs.existsSync(dir)) return []
  const out: TexturePackDto[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const full = path.join(dir, entry.name)
    const meta = readPackJson(full)
    out.push({
      folderName: entry.name,
      name: meta?.name || entry.name,
      author: meta?.author,
      version: meta?.version,
      description: meta?.description,
      protected: isProtectedTexturePack(entry.name)
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}







export async function installTexturePack(
  gameRoot: string,
  archivePath: string,
  progress?: (stage: 'extracting' | 'installing') => void
): Promise<TexturePackInstallResult> {
  if (!fs.existsSync(archivePath)) throw new Error('Archive not found')
  const tempRoot = createTempDir(gameRoot)
  try {
    progress?.('extracting')
    await extractArchiveAsync(archivePath, tempRoot)
    const fallbackName = path.basename(archivePath).replace(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar)$/i, '')
    progress?.('installing')
    return await installTexturePacksFromRoot(gameRoot, tempRoot, fallbackName)
  } finally {
    if (fs.existsSync(tempRoot)) removeDirIfInside(gameRoot, tempRoot)
  }
}





export async function probeTexturePackArchive(archivePath: string): Promise<boolean> {
  if (!fs.existsSync(archivePath)) return false
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbp-probe-'))
  try {
    await extractArchiveAsync(archivePath, tempRoot)
    const packDirs = findPackDirs(tempRoot)
    debugLog('probeTexturePackArchive packDirs =', packDirs.length)
    return packDirs.length > 0
  } catch {
    
    return false
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    } catch {
      
    }
  }
}







export async function installTexturePacksFromRoot(
  gameRoot: string,
  extractRoot: string,
  fallbackName: string
): Promise<TexturePackInstallResult> {
  const targetRoot = texturePacksDir(gameRoot)
  debugLog('installTexturePacksFromRoot target =', targetRoot, 'fallback =', fallbackName)

  
  const readmes: ReadmeFile[] = []
  collectReadmes(extractRoot, readmes, 8)

  
  const packDirs = findPackDirs(extractRoot)
  debugLog('installTexturePacksFromRoot packDirs =', packDirs.length, packDirs.map((d) => path.basename(d)).join(', '))
  if (packDirs.length === 0) {
    
    const dst = path.join(targetRoot, fallbackName)
    await copyDirContents(extractRoot, dst)
    fs.mkdirSync(targetRoot, { recursive: true })
    const meta = readPackJson(dst)
    return {
      installed: [packDto(dst, fallbackName, meta)],
      installDir: targetRoot,
      readmes
    }
  }

  fs.mkdirSync(targetRoot, { recursive: true })
  const installed: TexturePackDto[] = []
  for (const src of packDirs) {
    const folderName = path.basename(src)
    const dst = path.join(targetRoot, folderName)
    await copyDirContents(src, dst)
    installed.push(packDto(dst, folderName, readPackJson(dst)))
  }
  return { installed, installDir: targetRoot, readmes }
}


export function uninstallTexturePack(gameRoot: string, folderName: string): void {
  if (isProtectedTexturePack(folderName)) {
    throw new Error(`This is a protected folder and cannot be deleted: ${folderName}`)
  }
  const dir = texturePacksDir(gameRoot)
  if (!isInside(dir, path.join(dir, folderName))) {
    throw new Error(`refusing to remove path outside texture packs: ${folderName}`)
  }
  const target = path.join(dir, folderName)
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true })
  }
}



function packDto(dir: string, folderName: string, meta: ReturnType<typeof readPackJson>): TexturePackDto {
  return {
    folderName,
    name: meta?.name || folderName,
    author: meta?.author,
    version: meta?.version,
    description: meta?.description
  }
}


export function findPackDirs(root: string): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    let hasPack = false
    let hasSubDir = false
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        hasSubDir = true
      } else if (entry.name.toLowerCase() === TEXTURE_PACK_MANIFEST) {
        hasPack = true
      }
    }
    if (hasPack) {
      found.push(dir)
      return 
    }
    if (hasSubDir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name))
      }
    }
  }
  walk(root)
  return found
}


async function copyDirContents(src: string, dst: string): Promise<void> {
  await fs.promises.mkdir(dst, { recursive: true })
  const entries = await fs.promises.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const from = path.join(src, entry.name)
    const to = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      await copyDirContents(from, to)
    } else {
      await fs.promises.mkdir(path.dirname(to), { recursive: true })
      await fs.promises.copyFile(from, to)
    }
  }
}
