import { useCallback, useEffect, useState } from 'react'

export function useBaldiRetro(): {
  enabled: boolean
  setEnabled: (v: boolean) => void
  loaded: boolean
} {
  const [enabled, setEnabledState] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void window.api.app.getBaldiRetro().then((v) => {
      if (!active) return
      setEnabledState(v)
      setLoaded(true)
      document.documentElement.classList.toggle('baldi-art', v)
    })
    return () => {
      active = false
    }
  }, [])

  const setEnabled = useCallback((v: boolean): void => {
    setEnabledState(v)
    document.documentElement.classList.toggle('baldi-art', v)
    void window.api.app.setBaldiRetro(v)
  }, [])

  return { enabled, setEnabled, loaded }
}