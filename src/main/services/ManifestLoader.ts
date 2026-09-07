import fs from 'fs'
import path from 'path'
import {
  GMP_METADATA_FOLDER,
  GMP_FALLBACK_METADATA_FOLDER,
  MANIFEST_FILE,
  METADATA_FILE,
  SUPPORTED_VERSION_PREFIX
} from '../constants'
import type { ModManifestDto, ModMetadataDto } from '../../shared/types'

function pickMetadataFolder(modRoot: string): string | null {
  for (const f of [GMP_METADATA_FOLDER, GMP_FALLBACK_METADATA_FOLDER]) {
    const p = path.join(modRoot, f)
    if (fs.existsSync(p)) return p
  }
  return null
}


export function loadModManifest(modRoot: string, gameVersion?: string): ModManifestDto | null {
  const metaFolder = pickMetadataFolder(modRoot)
  if (!metaFolder) return null

  const manifestPath = path.join(metaFolder, MANIFEST_FILE)
  if (!fs.existsSync(manifestPath)) return null

  let manifest: ModManifestDto
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch {
    return null
  }
  if (!manifest?.guid || !manifest?.name || !manifest?.author || manifest?.version === undefined) {
    return null
  }
  manifest.plugins = manifest.plugins || []
  manifest.patchers = manifest.patchers || []
  manifest.assets = manifest.assets || []
  return manifest
}

export function loadMetadata(modRoot: string, manifest: ModManifestDto): ModMetadataDto {
  const metaFolder = pickMetadataFolder(modRoot)
  const defaults: ModMetadataDto = { activated: true, supportedPlusVersions: [] }
  if (!metaFolder) return defaults
  const metaPath = path.join(metaFolder, METADATA_FILE)
  if (!fs.existsSync(metaPath)) return defaults
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    return {
      activated: raw.activated !== undefined ? !!raw.activated : true,
      supportedPlusVersions: raw.supportedPlusVersions || [],
      lastUpdateDate: raw.lastUpdateDate,
      installationUrl: raw.installationUrl,
      thumbnail: raw.thumbnail,
      path: raw.path
    }
  } catch {
    return defaults
  }
}

export function saveMetadata(modRoot: string, manifest: ModManifestDto, metadata: ModMetadataDto): void {
  const metaFolder = pickMetadataFolder(modRoot)
  if (!metaFolder) return
  const metaPath = path.join(metaFolder, METADATA_FILE)
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8')
}


export function matchSupportedVersion(modRoot: string, gameVersion?: string): boolean {
  if (!gameVersion) return true
  const metaFolder = pickMetadataFolder(modRoot)
  if (!metaFolder) return false
  let versions: string[] = []
  try {
    for (const f of fs.readdirSync(metaFolder)) {
      if (f.startsWith(SUPPORTED_VERSION_PREFIX)) {
        const rest = f.slice(SUPPORTED_VERSION_PREFIX.length)
        versions.push(...rest.split('_').filter(Boolean))
      }
    }
  } catch {
    return false
  }
  if (versions.length === 0) return true
  return versions.includes(gameVersion)
}