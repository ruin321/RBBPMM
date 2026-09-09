import Store from 'electron-store'
import { app } from 'electron'
import { FONT_DEFAULT, THEME_DEFAULT, inferSystemLocale } from './constants'
import type { GameEnvironment } from '../shared/types'

interface StoreSchema {
  gameExePath?: string
  theme: string
  fontFamily?: string
  locale?: string
  fishPrevLocale?: string
  splashEnabled?: boolean
  debugLogging?: boolean
  baldiRetro?: boolean
  customBg?: string
  customCss?: string
  navOpen?: boolean
}

const store = new Store<StoreSchema>({
  defaults: {
    theme: THEME_DEFAULT,
    fontFamily: FONT_DEFAULT,
    splashEnabled: true,
    debugLogging: false,
    baldiRetro: false,
    customBg: undefined,
    customCss: undefined,
    navOpen: true
  }
})

export function getStoredExePath(): string | undefined {
  return store.get('gameExePath')
}

export function setStoredExePath(p: string | undefined): void {
  if (p === undefined) store.delete('gameExePath')
  else store.set('gameExePath', p)
}

export function getTheme(): string {
  return store.get('theme', THEME_DEFAULT)
}

export function setTheme(t: string): void {
  store.set('theme', t)
}

export function getFontFamily(): string {
  return store.get('fontFamily', FONT_DEFAULT)
}

export function setFontFamily(f: string): void {
  store.set('fontFamily', f)
}

export function getLocale(): string {
  const saved = store.get('locale')
  if (saved === 'fish') return store.get('fishPrevLocale') || inferSystemLocale(app.getLocale())
  if (saved) return saved
  return inferSystemLocale(app.getLocale())
}

export function setLocale(l: string): void {
  if (l === 'fish') {
    const current = store.get('locale') || inferSystemLocale(app.getLocale())
    if (current && current !== 'fish') store.set('fishPrevLocale', current)
  } else {
    store.delete('fishPrevLocale')
  }
  store.set('locale', l)
}

export function getSplashEnabled(): boolean {
  return store.get('splashEnabled', true)
}

export function setSplashEnabled(v: boolean): void {
  store.set('splashEnabled', v)
}

export function getDebugLogging(): boolean {
  return store.get('debugLogging', false)
}

export function setDebugLogging(v: boolean): void {
  store.set('debugLogging', v)
}

export function getBaldiRetro(): boolean {
  return store.get('baldiRetro', false)
}

export function setBaldiRetro(v: boolean): void {
  store.set('baldiRetro', v)
}

export function getCustomBg(): string | undefined {
  return store.get('customBg')
}

export function setCustomBg(v: string | undefined): void {
  if (v === undefined) store.delete('customBg')
  else store.set('customBg', v)
}

export function getCustomCss(): string | undefined {
  return store.get('customCss')
}

export function setCustomCss(v: string | undefined): void {
  if (v === undefined) store.delete('customCss')
  else store.set('customCss', v)
}

export function getNavOpen(): boolean {
  return store.get('navOpen', true)
}

export function setNavOpen(v: boolean): void {
  store.set('navOpen', v)
}


export function resetAllSettings(): {
  theme: string
  fontFamily: string
  locale: string
  splashEnabled: boolean
  debugLogging: boolean
  baldiRetro: boolean
} {
  setTheme(THEME_DEFAULT)
  setFontFamily(FONT_DEFAULT)
  store.delete('locale')
  setSplashEnabled(true)
  setDebugLogging(false)
  setBaldiRetro(false)
  setCustomBg(undefined)
  setCustomCss(undefined)
  setStoredExePath(undefined)
  runtimeState.environment = null
  return {
    theme: THEME_DEFAULT,
    fontFamily: FONT_DEFAULT,
    locale: inferSystemLocale(app.getLocale()),
    splashEnabled: true,
    debugLogging: false,
    baldiRetro: false
  }
}


export const runtimeState: {
  environment: GameEnvironment | null
  cancelController: AbortController | null
  gamePid: number | null
} = {
  environment: null,
  cancelController: null,
  gamePid: null
}