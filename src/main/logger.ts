import fs from 'fs'
import path from 'path'
import { getDebugLogging } from './store'


let logDir = ''
let logPrefix = 'rbbpmm'

export function initLogFile(dir: string, prefix = 'rbbpmm'): void {
  logDir = dir
  logPrefix = prefix
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    logDir = ''
  }
}

export function logFilePath(): string {
  return logDir ? path.join(logDir, `${logPrefix}.log`) : ''
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function append(level: string, args: unknown[]): void {
  if (getDebugLogging()) {
    console[level === 'ERROR' ? 'error' : 'log'](
      `[${new Date().toISOString()}] [${level}]`,
      ...args
    )
  }
  if (!logDir) return
  try {
    const ts = new Date().toISOString()
    const body = args
      .map((a) =>
        typeof a === 'string'
          ? a
          : a instanceof Error
            ? a.stack || a.message
            : safeStringify(a)
      )
      .join(' ')
    fs.appendFileSync(path.join(logDir, `${logPrefix}.log`), `[${ts}] [${level}] ${body}\n`)
  } catch {
    // ignore write failures
  }
}

export function debugLog(...args: unknown[]): void {
  append('DEBUG', args)
}

export function debugError(...args: unknown[]): void {
  append('ERROR', args)
}

export function logInfo(...args: unknown[]): void {
  append('INFO', args)
}

export function logWarn(...args: unknown[]): void {
  append('WARN', args)
}

export function logError(...args: unknown[]): void {
  append('ERROR', args)
}