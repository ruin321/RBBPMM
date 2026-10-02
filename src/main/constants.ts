import os from 'os';
import path from 'path';
export const GAME_EXE_NAME = 'BALDI.exe';
export function isGameExeName(name: string): boolean {
    return name.toLowerCase() === GAME_EXE_NAME.toLowerCase();
}
export const GAME_DATA_FOLDER = 'BALDI_Data';
export const GAME_VERSION_FILE = 'globalgamemanagers';
export const BEPINEX_FOLDER = 'BepInEx';
export const PLUGINS_FOLDER = 'plugins';
export const PATCHER_FOLDER = 'patchers';
export const MODINFO_FOLDER = 'modInfo';
export const BEPINEX_CONFIG_FOLDER = 'config';
export const TEXTURE_PACKS_RELATIVE = ['BALDI_Data', 'StreamingAssets', 'Texture Packs'] as const;
export const TEXTURE_PACK_MANIFEST = 'pack.json';
export const TEXTURE_PACK_README_PATTERN = /^readme.*\.txt$/i;
export const PROTECTED_TEXTURE_PACK_FOLDERS = new Set(['core']);
export const GMP_METADATA_FOLDER = '.rbbpmm';
export const GMP_FALLBACK_METADATA_FOLDER = '_rbbpmm';
export const MANIFEST_FILE = 'manifest.json';
export const METADATA_FILE = '.metadata';
export const SCRIPT_FILE = 'script.txt';
export const DISABLED_EXTENSION = 'disabled';
export const TEMP_FOLDER = 'temp';
export const SUPPORTED_VERSION_PREFIX = 'supVer_';
export const THEME_DEFAULT = 'windows';
export const DARK_THEME_IDS = new Set([
    'dark',
    'baldi-black',
    'purple-black',
    'ocean-black',
    'forest-black',
    'rose-black'
]);
export function isDarkTheme(id: string): boolean {
    return DARK_THEME_IDS.has(id);
}
export const FONT_DEFAULT = 'Comic Sans MS';
export const LOCALE_DEFAULT = 'en';
export function inferSystemLocale(systemLocale: string): string {
    if (!systemLocale)
        return LOCALE_DEFAULT;
    const full = systemLocale.toLowerCase();
    const base = full.replace(/[_-].*$/, '');
    if (base === 'zh') {
        if (full.includes('tw') || full.includes('hk') || full.includes('mo'))
            return 'zh-TW';
        return 'zh-CN';
    }
    if (base === 'ja')
        return 'ja';
    if (base === 'ko')
        return 'ko';
    if (base === 'fr')
        return 'fr';
    if (base === 'de')
        return 'de';
    if (base === 'es')
        return 'es';
    if (base === 'pt')
        return 'pt';
    if (base === 'ru')
        return 'ru';
    return LOCALE_DEFAULT;
}
export function bepinexPluginsDir(gameRoot: string): string {
    return path.join(gameRoot, BEPINEX_FOLDER, PLUGINS_FOLDER);
}
export function bepinexPatchersDir(gameRoot: string): string {
    return path.join(gameRoot, BEPINEX_FOLDER, PATCHER_FOLDER);
}
export function bepinexModInfoDir(gameRoot: string): string {
    return path.join(gameRoot, BEPINEX_FOLDER, MODINFO_FOLDER);
}
export function texturePacksDir(gameRoot: string): string {
    return path.join(gameRoot, ...TEXTURE_PACKS_RELATIVE);
}
// Custom Posters (io.github.uncertainluei.baldiplus.customposters) reads every
// sub-folder of its Posters directory as a poster pack.
export const CUSTOM_POSTERS_GUID = 'io.github.uncertainluei.baldiplus.customposters';
export const CUSTOM_POSTERS_DLL = 'UncertainLuei.CustomPosters.dll';
export const CUSTOM_POSTERS_DISABLED_FOLDER = 'DisabledPosters';
export const POSTER_IMAGE_EXT = /\.(png|jpe?g)$/i;
export function customPostersDir(gameRoot: string): string {
    return path.join(gameRoot, 'BALDI_Data', 'StreamingAssets', 'Modded', CUSTOM_POSTERS_GUID, 'Posters');
}
export function customPostersDisabledDir(gameRoot: string): string {
    return path.join(gameRoot, 'BALDI_Data', 'StreamingAssets', 'Modded', CUSTOM_POSTERS_GUID, CUSTOM_POSTERS_DISABLED_FOLDER);
}
export const GAME_SAVE_COMPANY = 'Basically Games';
export const GAME_SAVE_PRODUCT = "Baldi's Basics Plus";
export const GAME_MODDED_SAVES_FOLDER = 'Modded';
export const TEXTURE_PACK_SAVE_GUID = 'mtm101.rulerp.baldiplus.texturepacks';
export const TEXTURE_PACK_STATE_FILE = 'packs.txt';
export function gameModdedSavesDir(): string {
    return path.join(os.homedir(), 'AppData', 'LocalLow', GAME_SAVE_COMPANY, GAME_SAVE_PRODUCT, GAME_MODDED_SAVES_FOLDER);
}
export function texturePackStateFile(profile: string): string {
    return path.join(gameModdedSavesDir(), profile, TEXTURE_PACK_SAVE_GUID, TEXTURE_PACK_STATE_FILE);
}
