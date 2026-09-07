import { useCallback, useEffect, useState } from 'react'
import { applyThemeToDom, findTheme } from '@/theme'

export function useTheme(): {
  themeId: string
  setThemeId: (id: string) => void
  isDark: boolean
  toggle: () => void
} {
  const [themeId, setThemeIdState] = useState('dark')

  const apply = useCallback((id: string): void => {
    setThemeIdState(id)
    applyThemeToDom(id)
  }, [])

  useEffect(() => {
    let active = true
    void window.api.app.getTheme().then((id) => {
      if (active) apply(id || 'dark')
    })
    const unsub = window.api.app.onThemeChanged((id) => {
      if (active) apply(id || 'dark')
    })
    return () => {
      active = false
      unsub()
    }
  }, [apply])

  const setThemeId = useCallback(
    (id: string) => {
      apply(id)
      void window.api.app.setTheme(id)
    },
    [apply]
  )

  const toggle = useCallback(() => {
    const currentDark = document.documentElement.classList.contains('dark')
    const next = currentDark ? 'light' : 'dark'
    apply(next)
    void window.api.app.setTheme(next)
  }, [apply])

  return { themeId, setThemeId, isDark: findTheme(themeId).dark, toggle }
}