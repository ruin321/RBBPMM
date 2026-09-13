import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'rbbpmm.animations'

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

function syncDomClass(enabled: boolean): void {
  document.documentElement.classList.toggle('no-anims', !enabled)
}

export function initAnimations(): void {
  syncDomClass(readStored())
}

export function useAnimations(): { enabled: boolean; setEnabled: (v: boolean) => void } {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    initAnimations()
    setEnabledState(readStored())
  }, [])

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value)
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch {
      /* ignore */
    }
    syncDomClass(value)
  }, [])

  return { enabled, setEnabled }
}