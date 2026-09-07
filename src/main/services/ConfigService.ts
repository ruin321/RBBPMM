import fs from 'fs'
import path from 'path'
import { BEPINEX_FOLDER, BEPINEX_CONFIG_FOLDER } from '../constants'
import type { ConfigFileDto, CfgEntryDto, CfgSectionDto } from '../../shared/types'


export function configDir(gameRoot: string): string {
  return path.join(gameRoot, BEPINEX_FOLDER, BEPINEX_CONFIG_FOLDER)
}


export function listCfgFiles(gameRoot: string): ConfigFileDto[] {
  const dir = configDir(gameRoot)
  let names: string[]
  try {
    names = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.cfg'))
  } catch {
    return []
  }
  const out: ConfigFileDto[] = []
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    const parsed = parseCfgFile(path.join(dir, name))
    if (parsed) out.push(parsed)
  }
  return out
}


export function setConfigValue(cfgPath: string, section: string, key: string, value: string): boolean {
  let text: string
  try {
    text = fs.readFileSync(cfgPath, 'utf8')
  } catch {
    return false
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  let inSection = false
  let changed = false
  const next = lines.map((line) => {
    if (/^\s*\[(.+)\]\s*$/.test(line)) {
      inSection = line.trimStart().trimEnd().slice(1, -1).trim() === section
      return line
    }
    if (!inSection) return line
    const idx = line.indexOf('=')
    if (idx <= 0) return line
    const leftKey = line.slice(0, idx).trim()
    if (leftKey === key) {
      changed = true
      const left = line.slice(0, idx).replace(/\s+$/, '')
      return `${left} = ${value}`
    }
    return line
  })
  if (!changed) return false
  try {
    fs.writeFileSync(cfgPath, next.join(eol), 'utf8')
    return true
  } catch {
    return false
  }
}


export function isSafeCfgPath(gameRoot: string, cfgPath: string): boolean {
  const root = configDir(gameRoot)
  const abs = path.resolve(cfgPath)
  const rel = path.relative(root, abs)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}


export function deleteConfigFile(gameRoot: string, cfgPath: string): boolean {
  if (!isSafeCfgPath(gameRoot, cfgPath)) return false
  try {
    if (!fs.existsSync(cfgPath)) return true
    fs.unlinkSync(cfgPath)
    return true
  } catch {
    return false
  }
}





interface PendingMeta {
  desc: string[]
  type?: string
  def?: string
  accept?: string[]
  min?: number
  max?: number
}

function controlFor(
  rawType: string | undefined,
  value: string,
  accept?: string[]
): { control: CfgEntryDto['control']; step?: number } {
  const t = (rawType ?? '').toLowerCase()
  
  if (/bool/.test(t) || (!rawType && /^(true|false)$/i.test(value))) {
    return { control: 'boolean' }
  }
  if (/^(s?byte|s?int|us?int|s?long|s?short|uint\d*|u?long\w*|int(8|16|32|64)|float|single|double|decimal)$/.test(t)) {
    return { control: 'number', step: /^(float|single|double|decimal)$/.test(t) ? 0.1 : 1 }
  }
  
  if (!rawType && /^-?\d+(\.\d+)?$/.test(value)) {
    return { control: 'number', step: value.includes('.') ? 0.1 : 1 }
  }
  
  if (accept && accept.length > 0 && !value.includes(',')) {
    return { control: 'select' }
  }
  return { control: 'text' }
}


export function parseCfgFile(cfgPath: string): ConfigFileDto | undefined {
  let text: string
  try {
    text = fs.readFileSync(cfgPath, 'utf8')
  } catch {
    return undefined
  }
  const rawLines = text.split(/(?<=\n)/)
  const strip = (l: string): string => l.replace(/\r?\n$/, '')

  const sections: CfgSectionDto[] = []
  let current: CfgSectionDto | undefined
  let pending: PendingMeta | null = null
  let fileHead: string | undefined

  for (const raw of rawLines) {
    const line = strip(raw)
    const t = line.trim()
    if (!t) {
      
      continue
    }

    const sectionMatch = /^\[(.+)\]$/.exec(t)
    if (sectionMatch) {
      const name = sectionMatch[1]
      const head = pending && pending.desc.length ? pending.desc.join('\n') : undefined
      if (!fileHead && pending && pending.desc.length) {
        fileHead = head 
      }
      current = { name, heading: fileHead ? undefined : head, entries: [] }
      sections.push(current)
      pending = null
      continue
    }

    
    const mType = /^#\s*Setting type:\s*(.*)$/i.exec(t)
    const mDef = /^#\s*Default value:\s*(.*)$/i.exec(t)
    const mAcc = /^#\s*Acceptable values:\s*(.*)$/i.exec(t)
    const mRange = /^#\s*Acceptable value range:\s*([\d.+\-eE]+)\s*(?:to|-)\s*([\d.+\-eE]+)/i.exec(t)
    const mMin = /^#\s*(?:min|minimum):\s*([\d.+\-eE]+)/i.exec(t)
    const mMax = /^#\s*(?:max|maximum):\s*([\d.+\-eE]+)/i.exec(t)
    if (mType || mDef || mAcc || mRange || mMin || mMax) {
      pending ??= { desc: [] }
      if (mType) pending.type = mType[1].trim()
      if (mDef) pending.def = mDef[1].trim()
      if (mAcc) pending.accept = mAcc[1].split(',').map((s) => s.trim()).filter(Boolean)
      if (mRange) {
        pending.min = Number(mRange[1])
        pending.max = Number(mRange[2])
      }
      if (mMin) pending.min = Number(mMin[1])
      if (mMax) pending.max = Number(mMax[1])
      continue
    }

    
    if (t.startsWith('#')) {
      let content = t
      if (content.startsWith('##')) content = content.slice(2)
      else content = content.slice(1)
      content = content.trim()
      if (content) {
        pending ??= { desc: [] }
        pending.desc.push(content)
      }
      continue
    }

    
    if (current && !line.startsWith('[')) {
      const eq = line.indexOf('=')
      if (eq > 0) {
        const key = line.slice(0, eq).trim()
        const value = line.slice(eq + 1).trim()
        const { control, step } = controlFor(pending?.type, value, pending?.accept)
        current.entries.push({
          key,
          value,
          control,
          rawType: pending?.type,
          description: pending?.desc.length ? pending.desc.join('\n') : undefined,
          defaultValue: pending?.def,
          acceptable: pending?.accept,
          min: pending?.min,
          max: pending?.max,
          step
        })
        pending = null
      }
    }
  }

  return { path: cfgPath, fileName: path.basename(cfgPath), heading: fileHead, sections }
}