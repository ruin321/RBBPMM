import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { BEPINEX_FOLDER } from '../constants'
import { createTempDir, extractArchiveAsync, removeDirIfInside } from './ModArchiveExtractor'
import type { InstallProgress, Result } from '../../shared/types'


export function bepinexRoot(gameRoot: string): string {
  return path.join(gameRoot, BEPINEX_FOLDER)
}


export function detectBepInEx(gameRoot: string): boolean {
  
  const root = bepinexRoot(gameRoot)
  if (fs.existsSync(path.join(root, 'config', 'BepInEx.cfg'))) return true
  if (fs.existsSync(path.join(root, 'core', 'BepInEx.Core.dll'))) return true
  return fs.existsSync(path.join(root, 'BepInEx.dll'))
}


export function bepinexArchivePath(): string | null {
  const candidates: string[] = []
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'BepInEx.zip'))
  } else {
    candidates.push(path.join(app.getAppPath(), 'resources', 'BepInEx.zip'))
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}


export async function installBepInEx(
  gameRoot: string,
  onProgress?: (p: InstallProgress) => void
): Promise<Result<boolean>> {
  if (process.platform === 'win32') {
    return installBepInExWin32(gameRoot, onProgress)
  }
  return {
    ok: false,
    error: 'Automatic BepInEx installation is not supported on this platform. Please drop the BepInEx folder into the game directory manually.'
  }
}


function emit(onProgress: ((p: InstallProgress) => void) | undefined, message: string, percent = 0): void {
  onProgress?.({ stage: 'setup-bepinex', percent, message })
}


function moveChildren(srcDir: string, dstDir: string): void {
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name)
    const dst = path.join(dstDir, name)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    try {
      fs.renameSync(src, dst)
    } catch {
      fs.cpSync(src, dst, { recursive: true })
      fs.rmSync(src, { recursive: true, force: true })
    }
  }
}


function moveToGameRoot(tempRoot: string, gameRoot: string): void {
  const top = fs.readdirSync(tempRoot, { withFileTypes: true })
  if (top.length === 1 && top[0].isDirectory() && top[0].name !== BEPINEX_FOLDER) {
    moveChildren(path.join(tempRoot, top[0].name), gameRoot)
    return
  }
  moveChildren(tempRoot, gameRoot)
}


async function installBepInExWin32(
  gameRoot: string,
  onProgress?: (p: InstallProgress) => void
): Promise<Result<boolean>> {
  const archive = bepinexArchivePath()
  if (!archive) {
    return { ok: false, error: 'BepInEx package is missing from the application bundle.' }
  }
  const tempRoot = createTempDir(gameRoot)
  try {
    emit(onProgress, 'Extracting BepInEx...', 10)
    await extractArchiveAsync(archive, tempRoot)
    emit(onProgress, 'Moving into game folder...', 60)
    moveToGameRoot(tempRoot, path.resolve(gameRoot))
    emit(onProgress, 'BepInEx installed.', 100)
    return { ok: true, value: detectBepInEx(gameRoot) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    removeDirIfInside(gameRoot, tempRoot)
  }
}