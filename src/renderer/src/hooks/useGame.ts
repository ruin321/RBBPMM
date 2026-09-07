import { useCallback, useEffect, useState } from 'react'
import type { GameEnvironment, Result } from '@shared/types'

export function useGame(): {
  env: GameEnvironment | null
  loading: boolean
  load: () => Promise<void>
  select: () => Promise<boolean>
  launch: () => Promise<Result<{ pid?: number }>>
  launchSteam: () => Promise<Result<{ launched: boolean }>>
} {
  const [env, setEnv] = useState<GameEnvironment | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.api.game.get()
      setEnv(r.ok ? (r.value ?? null) : null)
    } finally {
      setLoading(false)
    }
  }, [])

  const select = useCallback(async () => {
    const r = await window.api.game.selectDir()
    if (r.ok && r.value) {
      setEnv(r.value)
      return true
    }
    return false
  }, [])

  const launch = useCallback(async () => window.api.game.launch(), [])

  const launchSteam = useCallback(async () => window.api.game.launchSteam(), [])

  useEffect(() => {
    void load()
  }, [load])

  
  useEffect(() => {
    const unsub = window.api.app.onGameCleared(() => setEnv(null))
    return unsub
  }, [])

  return { env, loading, load, select, launch, launchSteam }
}