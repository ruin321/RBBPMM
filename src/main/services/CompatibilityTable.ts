import type { GamebananaFileDto } from '../../shared/types'


export const DEV_API_MOD_ID = 383711


export interface CompatibilityEntry {
  gameVersion: string
  devApi: string | null
}


export const DEV_API_COMPATIBILITY: CompatibilityEntry[] = [
  { gameVersion: '0.14', devApi: '11.0.0.1' },
  { gameVersion: '0.13.1', devApi: '10.2.0.1' },
  { gameVersion: '0.13', devApi: '10.0.0.2' },
  { gameVersion: '0.12.2a', devApi: '9.1.0.0' },
  { gameVersion: '0.12.2', devApi: '9.1.0.0' },
  { gameVersion: '0.12.1', devApi: '9.1.0.0' },
  { gameVersion: '0.12', devApi: '9.0.0.0' },
  { gameVersion: '0.11', devApi: '8.2.1.0' },
  { gameVersion: '0.10.2', devApi: '7.1.0.0' },
  { gameVersion: '0.10.1', devApi: '7.1.0.0' },
  { gameVersion: '0.10', devApi: '7.1.0.0' },
  { gameVersion: '0.9a', devApi: '6.3.0.1' },
  { gameVersion: '0.9', devApi: '6.3.0.1' },
  { gameVersion: '0.8.1', devApi: '6.1.0.0' },
  { gameVersion: '0.8', devApi: '6.1.0.0' },
  { gameVersion: '0.7.1', devApi: '5.4.0.1' },
  { gameVersion: '0.7', devApi: '5.4.0.1' },
  { gameVersion: '0.6.2', devApi: '5.2.0.0' },
  { gameVersion: '0.6.1', devApi: '5.2.0.0' },
  { gameVersion: '0.6', devApi: '5.2.0.0' },
  { gameVersion: '0.5.2', devApi: '4.3.0.0' },
  { gameVersion: '0.5.1', devApi: '4.3.0.0' },
  { gameVersion: '0.5', devApi: '4.3.0.0' },
  { gameVersion: '0.4.2', devApi: '3.6.0.0' },
  { gameVersion: '0.4.1', devApi: '3.6.0.0' },
  { gameVersion: '0.4', devApi: '3.6.0.0' },
  { gameVersion: '0.3.8', devApi: '2.3.0.1' },
  { gameVersion: '0.3.7', devApi: '2.3.0.1' },
  { gameVersion: '0.3.6', devApi: '2.3.0.1' },
  { gameVersion: '0.3.5', devApi: '2.3.0.1' },
  { gameVersion: '0.3.4', devApi: '2.3.0.1' },
  { gameVersion: '0.3.3', devApi: '2.3.0.1' },
  { gameVersion: '0.3.2', devApi: '2.3.0.1' },
  { gameVersion: '0.3.1', devApi: '2.3.0.1' },
  { gameVersion: '0.3', devApi: '2.3.0.1' }
]


export function normalizeGameVersion(v: string | null | undefined): string | null {
  if (!v) return null
  const m = /(\d+(?:\.\d+)+)/.exec(v.trim().toLowerCase())
  return m ? m[1] : null
}


export function resolveDevApiVersion(gameVersion: string | null | undefined): string | null {
  const norm = normalizeGameVersion(gameVersion)
  if (!norm) return null
  for (const e of DEV_API_COMPATIBILITY) {
    if (normalizeGameVersion(e.gameVersion) === norm) return e.devApi
  }
  return null
}


export function normVersionPart(v: string | null | undefined): string | null {
  if (!v) return null
  const m = /(\d+(?:\.\d+)*)/.exec(v.replace(/[^0-9.a-z]/gi, ''))
  return m ? m[1].replace(/a$/i, '') : null
}


export function fileNameHasVersion(fileName: string, version: string | null | undefined): boolean {
  if (!version || !fileName) return false
  const target = normVersionPart(version)
  if (!target) return false
  return normVersionPartsOf(fileName).includes(target) || fileName.toLowerCase().includes(target)
}

function normVersionPartsOf(fileName: string): string[] {
  const m = fileName.match(/\d+(?:\.\d+)*/g)
  if (!m) return []
  return m
}


export function selectDevApiFile(
  files: GamebananaFileDto[],
  gameVersion: string | null | undefined,
  preferredVersion?: string | null
): GamebananaFileDto | null {
  if (files.length === 0) return null
  const target = preferredVersion ?? resolveDevApiVersion(gameVersion)
  if (target) {
    const byVersion = files.find((f) => f.version && normVersionPart(f.version) === normVersionPart(target))
    if (byVersion) return byVersion
    const byName = files.find((f) => fileNameHasVersion(f.fileName, target))
    if (byName) return byName
  }
  return [...files].sort((a, b) => b.id - a.id).find((f) => f.id > 0) ?? files[0]
}