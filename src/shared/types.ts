


export const BALDI_COMMUNITY_CATEGORY_ID = 4609
export const TEXTURE_PACK_CATEGORY_ID = 28929

export interface GameEnvironment {
  rootPath: string
  dataFolder: string
  executablePath: string
  gameVersion: string
}


export interface ModManifestDto {
  guid: string
  name: string
  author: string
  version: string
  description?: string
  assets: { localPath: string; destination?: string }[]
  plugins: string[]
  patchers: string[]
}


export interface ModMetadataDto {
  activated: boolean
  supportedPlusVersions: string[]
  lastUpdateDate?: string
  installationUrl?: string
  thumbnail?: string
  path?: string
  
  gamebananaSource?: GamebananaSourceDto
  lastInstalledArchiveName?: string
}


export interface ModItemDto {
  guid: string
  name: string
  author: string
  version: string
  description?: string
  
  identifyName?: string
  
  installedAt?: number
  
  moddedFolder?: string
  directoryName: string
  installDir: string
  activated: boolean
  supportsCurrentVersion: boolean
  pluginFiles: string[]
  assetPaths: string[]
  
  dllFile?: string
  
  dllDirectory?: string
  
  loose: boolean
  
  configFile?: string

  gamebananaSource?: GamebananaSourceDto
}

export interface GamebananaSourceDto {
  submissionId: number
  fileId: number
  fileName: string
  version?: string
  submissionName?: string
  dateLinked: string
}

export interface ModUpdateInfoDto {
  hasUpdate: boolean
  submissionId: number
  fileId: number
  fileName: string
  version?: string
  publishedDate?: number
  downloadUrl: string
}

export interface InstallProgress {
  stage: string
  percent?: number
  message?: string
}

export type Result<T = void> = { ok: true; value?: T } | { ok: false; error: string }

export interface SecurityWarning {
  field: string
  reason: string
}

export interface InstallResult {
  mod?: ModItemDto
  warnings: SecurityWarning[]
  
  texturePacks?: TexturePackDto[]
  
  readmes?: ReadmeFileDto[]
}


export interface ModInstallPlanDto {
  
  modName: string
  
  needsConfirm: boolean
  
  modded: string[]
  
  plugins: string[]
}


export type ModInstallOutcome =
  | { mode: 'manifest'; modName: string; readmes: ReadmeFileDto[] }
  | { mode: 'unmanaged'; modName: string; readmes: ReadmeFileDto[] }
  | { mode: 'confirm'; plan: ModInstallPlanDto; readmes: ReadmeFileDto[] }

export interface ReadmeFileDto {
  name: string
  content: string
}




export interface GamebananaFileDto {
  id: number
  fileName: string
  fileSize: number
  downloadUrl: string
  
  description?: string
  
  version?: string
  
  dateAdded?: number
}


export interface GamebananaCommentDto {
  
  id: number
  author: string
  body: string
  date?: string
  
  replyCount?: number
}


export interface GamebananaRequirementDto {
  name: string
  url?: string
  
  status?: string
  
  required?: boolean
  
  gamebananaId?: number
}


export interface GamebananaAlternateSourceDto {
  url: string
  
  description?: string
  
  host?: string
}


export interface GamebananaSubmissionDto {
  id: number
  name: string
  description?: string
  version?: string
  authorName?: string
  hasFiles: boolean
  
  categoryId?: number
  thumbnailUrl?: string
  
  images?: string[]
  
  downloadCount?: number
  viewCount?: number
  
  dateAdded?: number
  
  dateUpdated?: number
  files: GamebananaFileDto[]
  
  archivedFiles?: GamebananaFileDto[]
  
  requirements?: GamebananaRequirementDto[]
  
  alternateFileSources?: GamebananaAlternateSourceDto[]
}


export interface GamebananaSearchResult {
  recordCount: number
  isComplete: boolean
  perPage: number
  items: GamebananaSubmissionDto[]
}




export interface CfgEntryDto {
  key: string
  value: string
  
  control: 'boolean' | 'number' | 'select' | 'text'
  
  rawType?: string
  description?: string
  defaultValue?: string
  
  acceptable?: string[]
  min?: number
  max?: number
  step?: number
}


export interface CfgSectionDto {
  name: string
  
  heading?: string
  entries: CfgEntryDto[]
}


export interface ConfigFileDto {
  path: string
  fileName: string
  
  heading?: string
  sections: CfgSectionDto[]
}




export interface TexturePackDto {
  
  folderName: string
  
  name: string
  author?: string
  version?: string
  description?: string
  
  protected?: boolean
}


export interface TexturePackInstallResult {
  installed: TexturePackDto[]
  
  installDir: string
  
  readmes: { name: string; content: string }[]
}


export interface TexturePackProgress {
  
  stage: 'extracting' | 'installing'
}


export interface TexturePackListResult {
  
  installDir: string
  packs: TexturePackDto[]
}