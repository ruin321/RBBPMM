import { useCallback, useEffect, useState } from 'react'
import type { GameEnvironment, Result } from '@shared/types'

const POLL_MS = 2500

export function useGame(): {
  env: GameEnvironment | null
  loading: boolean
  load: () => Promise<void>
  select: () => Promise<boolean>
  launch: () => Promise<Result<{ pid?: number }>>
  launchSteam: () => Promise<Result<{ launched: boolean }>>
  running: boolean
  stop: () => Promise<Result<{ stopped: boolean }>>
} {
  const [env, setEnv] = useState<GameEnvironment | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)

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

  const refreshRunning = useCallback(async () => {
    const r = await window.api.game.isRunning()
    setRunning(!!(r.ok && r.value?.running))
  }, [])

  const launch = useCallback(async () => {
    const r = await window.api.game.launch()
    if (r.ok) void refreshRunning()
    return r
  }, [refreshRunning])

  const launchSteam = useCallback(async () => {
    const r = await window.api.game.launchSteam()
    if (r.ok) void refreshRunning()
    return r
  }, [refreshRunning])

  const stop = useCallback(async () => {
    const r = await window.api.game.stop()
    if (r.ok && r.value?.stopped) setRunning(false)
    return r
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void refreshRunning()
    const id = window.setInterval(() => void refreshRunning(), POLL_MS)
    return () => window.clearInterval(id)
  }, [refreshRunning])

  useEffect(() => {
    const unsub = window.api.app.onGameCleared(() => setEnv(null))
    return unsub
  }, [])

  return { env, loading, load, select, launch, launchSteam, running, stop }
}