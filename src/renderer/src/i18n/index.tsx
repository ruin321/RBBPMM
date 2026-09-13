import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type React from 'react'
import { en } from './locales/en'
import { zhCN } from './locales/zh-CN'
import { zhTW } from './locales/zh-TW'
import { ja } from './locales/ja'
import { ko } from './locales/ko'
import { fr } from './locales/fr'
import { de } from './locales/de'
import { es } from './locales/es'
import { pt } from './locales/pt'
import { ru } from './locales/ru'
import { ydyy } from './locales/ydyy'
import type { Messages } from './messages'

export type { Messages }

export type Locale = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'pt' | 'ru' | 'ydyy' | 'fish'

export interface LocaleDef {
  id: Locale
  name: string
  native: string
}

export const LOCALES: LocaleDef[] = [
  { id: 'en', name: 'English', native: 'English' },
  { id: 'zh-CN', name: 'Chinese (Simplified)', native: '简体中文' },
  { id: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文' },
  { id: 'ja', name: 'Japanese', native: '日本語' },
  { id: 'ko', name: 'Korean', native: '한국어' },
  { id: 'fr', name: 'French', native: 'Français' },
  { id: 'de', name: 'German', native: 'Deutsch' },
  { id: 'es', name: 'Spanish', native: 'Español' },
  { id: 'pt', name: 'Portuguese', native: 'Português' },
  { id: 'ru', name: 'Russian', native: 'Русский' },
  { id: 'ydyy', name: 'Yadengyue', native: '亚等约语' }
]


export const fish: Messages = Object.fromEntries(
  Object.keys(en).map((k) => [k, 'FISH'])
) as Messages

export const messages: Record<Locale, Messages> = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
  ko,
  fr,
  de,
  es,
  pt,
  ru,
  ydyy,
  fish
}



export type MessageKey = keyof Messages

interface I18nValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: MessageKey, params?: Record<string, string | number>) => string
  locales: LocaleDef[]
}

const I18nContext = createContext<I18nValue>({
  locale: 'en',
  setLocale: () => undefined,
  t: (k) => en[k],
  locales: LOCALES
})

export function I18nProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    let active = true
    void window.api.app.getLocale().then((l) => {
      if (!active) return
      const v = l === 'fish' ? 'fish' : LOCALES.some((x) => x.id === l) ? l : null
      if (v) {
        setLocaleState(v as Locale)
        document.documentElement.lang = l
      }
    })
    const unsub = window.api.app.onLocaleChanged((l) => {
      if (!active) return
      setLocaleState(l as Locale)
      document.documentElement.lang = l
    })
    return () => {
      active = false
      unsub()
    }
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    document.documentElement.lang = l
    void window.api.app.setLocale(l)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('fish-mode', locale === 'fish')
  }, [locale])

  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>): string => {
      if (locale === 'fish') return 'FISH'
      let text = messages[locale][key] ?? en[key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v))
        }
      }
      return text
    },
    [locale]
  )

  const value: I18nValue = { locale, setLocale, t, locales: LOCALES }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}