import fs from 'fs'
import path from 'path'
import {
  GAME_EXE_NAME,
  GAME_DATA_FOLDER,
  GAME_VERSION_FILE
} from '../constants'
import type { GameEnvironment } from '../../shared/types'

const VERSION_OFFSET = 4500
const VERSION_LENGTH = 500
const IDENTITY_STRING = "Baldi's Basics in Education and Learningbasicallygames"
const VERSION_START = 'category.games@'
const VERSION_END = 'ff@$'







export function tryReadGameVersion(dataFolder: string): string | null {
  const filePath = path.join(dataFolder, GAME_VERSION_FILE)
  if (!fs.existsSync(filePath)) return null
  let fd: number | null = null
  try {
    fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(VERSION_LENGTH)
    const bytesRead = fs.readSync(fd, buf, 0, VERSION_LENGTH, VERSION_OFFSET)
    if (bytesRead <= 0) return null
    const text = buf.toString('ascii', 0, bytesRead).replace(/[^\x20-\x7E\r\n]/g, '')
    if (!text.includes(IDENTITY_STRING)) return null
    const start = text.indexOf(VERSION_START)
    const end = text.indexOf(VERSION_END, start + VERSION_START.length)
    if (start < 0 || end < 0) return null
    const version = text.slice(start + VERSION_START.length, end)
    return version.length > 0 ? version : null
  } catch {
    return null
  } finally {
    if (fd !== null) fs.closeSync(fd)
  }
}


export function resolveEnvironment(exePath: string): GameEnvironment | null {
  const executablePath = path.resolve(exePath)
  const name = path.basename(executablePath)
  if (name.toLowerCase() !== GAME_EXE_NAME.toLowerCase()) return null
  if (!fs.existsSync(executablePath)) return null
  const rootPath = path.dirname(executablePath)
  const dataFolder = path.join(rootPath, GAME_DATA_FOLDER)
  if (!fs.existsSync(dataFolder)) return null
  const gameVersion = tryReadGameVersion(dataFolder)
  if (gameVersion === null) return null
  return { rootPath, dataFolder, executablePath, gameVersion }
}