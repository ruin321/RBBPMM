import path from 'path'


export const GAME_EXE_NAME = 'BALDI.exe'
export const GAME_DATA_FOLDER = 'BALDI_Data'
export const GAME_VERSION_FILE = 'globalgamemanagers'

export const BEPINEX_FOLDER = 'BepInEx'
export const PLUGINS_FOLDER = 'plugins'
export const PATCHER_FOLDER = 'patchers'
export const BEPINEX_CONFIG_FOLDER = 'config'


export const TEXTURE_PACKS_RELATIVE = ['BALDI_Data', 'StreamingAssets', 'Texture Packs'] as const

export const TEXTURE_PACK_MANIFEST = 'pack.json'

export const TEXTURE_PACK_README_PATTERN = /^readme.*\.txt$/i

export const PROTECTED_TEXTURE_PACK_FOLDERS = new Set(['core'])


export const GMP_METADATA_FOLDER = '.gmp'
export const GMP_FALLBACK_METADATA_FOLDER = '_gmp'

export const MANIFEST_FILE = 'manifest.json'
export const METADATA_FILE = '.metadata'
export const SCRIPT_FILE = 'script.txt'

export const DISABLED_EXTENSION = 'disabled'

export const TEMP_FOLDER = 'temp'
export const SUPPORTED_VERSION_PREFIX = 'supVer_'

export const THEME_DEFAULT = 'dark'


export const DARK_THEME_IDS = new Set([
  'dark',
  'baldi-black',
  'purple-black',
  'ocean-black',
  'forest-black',
  'rose-black'
])
export function isDarkTheme(id: string): boolean {
  return DARK_THEME_IDS.has(id)
}

export const FONT_DEFAULT = 'Comic Sans MS'
export const LOCALE_DEFAULT = 'en'

export function bepinexPluginsDir(gameRoot: string): string {
  return path.join(gameRoot, BEPINEX_FOLDER, PLUGINS_FOLDER)
}

export function bepinexPatchersDir(gameRoot: string): string {
  return path.join(gameRoot, BEPINEX_FOLDER, PATCHER_FOLDER)
}


export function texturePacksDir(gameRoot: string): string {
  return path.join(gameRoot, ...TEXTURE_PACKS_RELATIVE)
}