import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { app } from 'electron'
import AdmZip from 'adm-zip'
import { path7za } from '7zip-bin'
import { GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER, TEMP_FOLDER } from '../constants'
import { isInside, safeZipEntryPath } from './PathGuard'
import { debugLog } from '../logger'


function isZipFormat(archivePath: string): boolean {
  const lower = archivePath.toLowerCase()
  if (
    lower.endsWith('.zip') ||
    lower.endsWith('.jar') ||
    lower.endsWith('.apk') ||
    lower.endsWith('.bbmod') ||
    lower.endsWith('.gmp')
  ) {
    return true
  }
  return startsWithZipMagic(archivePath)
}

function startsWithZipMagic(archivePath: string): boolean {
  try {
    const fd = fs.openSync(archivePath, 'r')
    const buf = Buffer.alloc(4)
    let n = 0
    try {
      n = fs.readSync(fd, buf, 0, 4, 0)
    } finally {
      fs.closeSync(fd)
    }
    return n >= 2 && buf[0] === 0x50 && buf[1] === 0x4b
  } catch {
    return false
  }
}









function resolve7za(): string {
  const arch = process.arch === 'ia32' ? 'ia32' : process.arch === 'arm64' ? 'arm64' : 'x64'
  const candidates: string[] = []

  if (process.platform === 'win32') {
    const bundled7z = app.isPackaged
      ? path.join(process.resourcesPath, '7z', '7z.exe')
      : path.join(app.getAppPath(), 'resources', '7z', '7z.exe')
    if (fs.existsSync(bundled7z)) candidates.push(bundled7z)
    const localAppData = process.env['LOCALAPPDATA'] || ''
    const programFiles = process.env['ProgramFiles'] || ''
    const programFilesX86 = process.env['ProgramFiles(x86)'] || ''
    candidates.push(
      path.join(localAppData, 'Microsoft', 'WindowsApps', '7z.exe'),
      path.join(programFiles, '7-Zip', '7z.exe'),
      path.join(programFilesX86, '7-Zip', '7z.exe')
    )
  }

  if (app.isPackaged) candidates.unshift(path.join(process.resourcesPath, '7zip-bin', platformSubdir(process.platform, arch)))
  candidates.push(path7za)
  candidates.push(path.join(app.getAppPath(), 'node_modules', '7zip-bin', platformSubdir(process.platform, arch)))
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return path7za
}

function platformSubdir(platform: NodeJS.Platform, arch: string): string {
  const os = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux'
  const a = arch === 'x64' ? 'x64' : 'x86'
  const bin = platform === 'win32' ? '7za.exe' : '7za'
  return path.join(os, a, bin)
}







export async function extractArchive(archivePath: string, extractRoot: string): Promise<string> {
  debugLog('extractArchive:', archivePath, '->', extractRoot)
  if (isZipFormat(archivePath)) {
    extractZipSync(archivePath, extractRoot)
  } else {
    await extractWith7z(archivePath, extractRoot)
  }
  const root = locateGmpRoot(extractRoot)
  debugLog('extractArchive done, gmp root =', root)
  return root
}





export async function extractArchiveAsync(archivePath: string, extractRoot: string): Promise<string> {
  debugLog('extractArchiveAsync:', archivePath, '->', extractRoot)
  if (isZipFormat(archivePath)) {
    fs.mkdirSync(extractRoot, { recursive: true })
    extractZipSync(archivePath, extractRoot)
  } else {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(resolve7za(), ['x', archivePath, `-o${extractRoot}`, '-y'], {
        windowsHide: true,
        stdio: 'ignore'
      })
      child.on('error', (err) => reject(new Error(`7za failed to start: ${err.message}`)))
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Extract failed (7za exit ${code}): ${archivePath}`))
      })
    })
  }
  verifyInsideRoot(extractRoot)
  const root = locateGmpRoot(extractRoot)
  debugLog('extractArchiveAsync done, gmp root =', root)
  return root
}

function extractZipSync(archivePath: string, extractRoot: string): void {
  const zip = new AdmZip(archivePath)
  const entries = zip.getEntries()
  for (const entry of entries) {
    const target = safeZipEntryPath(extractRoot, entry.entryName)
    if (entry.isDirectory) {
      fs.mkdirSync(target, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, entry.getData())
    }
  }
}

async function extractWith7z(archivePath: string, extractRoot: string): Promise<void> {
  fs.mkdirSync(extractRoot, { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const child = spawn(resolve7za(), ['x', archivePath, `-o${extractRoot}`, '-y'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    child.on('error', (err) => reject(new Error(`7za failed to start: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Extract failed (7za exit ${code}): ${archivePath}`))
    })
  })
  
  verifyInsideRoot(extractRoot)
}


function verifyInsideRoot(root: string): void {
  const walk = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (!isInside(root, full)) {
        fs.rmSync(root, { recursive: true, force: true })
        throw new Error(`Unsafe archive entry (outside root): ${full}`)
      }
      if (e.isDirectory()) walk(full)
    }
  }
  walk(root)
}





function locateGmpRoot(extractRoot: string): string {
  const candidates: string[] = []
  const walk = (dir: string): void => {
    let found = false
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      if (name === GMP_METADATA_FOLDER || name === GMP_FALLBACK_METADATA_FOLDER) {
        candidates.push(dir)
        found = true
      }
      if (fs.statSync(p).isDirectory() && !found) {
        walk(p)
      }
    }
  }
  walk(extractRoot)

  
  if (candidates.includes(extractRoot)) return extractRoot
  if (candidates.length === 0) return extractRoot

  
  const sorted = [...candidates].sort((a, b) => a.split(path.sep).length - b.split(path.sep).length)
  const inner = sorted[0]
  if (inner === extractRoot) return extractRoot
  pivotUp(inner, extractRoot)
  return extractRoot
}

function pivotUp(inner: string, extractRoot: string): void {
  
  for (const name of fs.readdirSync(inner)) {
    if (name === GMP_METADATA_FOLDER || name === GMP_FALLBACK_METADATA_FOLDER) continue
    const src = path.join(inner, name)
    const dst = path.join(extractRoot, name)
    fs.renameSync(src, dst)
  }
}


export function createTempDir(gameRoot: string): string {
  const tempBase = path.join(gameRoot, GMP_METADATA_FOLDER, TEMP_FOLDER)
  const dir = path.join(tempBase, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function removeDirIfInside(root: string, target: string): void {
  if (!isInside(root, target)) {
    throw new Error(`refusing to remove path outside root: ${target}`)
  }
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true })
  }
}