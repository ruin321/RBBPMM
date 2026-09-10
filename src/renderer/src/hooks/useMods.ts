import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { InstallProgress, ModInstallPlanDto, ModItemDto, ModUpdateInfoDto, ReadmeFileDto } from '@shared/types'
import { useI18n } from '@/i18n'

export type InstallState =
  | { status: 'idle' }
  | { status: 'running'; progress: InstallProgress }
  | { status: 'done'; modName?: string }
  | { status: 'error'; message: string }

export function useMods(): {
  mods: ModItemDto[]
  loading: boolean
  installState: InstallState
  pendingPlan: ModInstallPlanDto | null
  readmes: ReadmeFileDto[]
  updates: Record<string, ModUpdateInfoDto>
  updating: Record<string, boolean>
  refresh: () => Promise<void>
  startInstall: (archivePath: string) => Promise<'ok' | 'confirm' | 'error'>
  confirmUnmanaged: () => Promise<boolean>
  clearPendingPlan: () => void
  cancelInstall: () => Promise<void>
  toggle: (guid: string, activate: boolean) => Promise<boolean>
  uninstall: (guid: string) => Promise<boolean>
  updateMod: (guid: string) => Promise<boolean>
  clearReadmes: () => void
  pins: Record<string, true>
  setPinned: (guid: string, pinned: boolean) => void
} {
  const { t } = useI18n()
  const [mods, setMods] = useState<ModItemDto[]>([])
  const [loading, setLoading] = useState(false)
  const [installState, setInstallState] = useState<InstallState>({ status: 'idle' })
  const [pendingPlan, setPendingPlan] = useState<ModInstallPlanDto | null>(null)
  const [readmes, setReadmes] = useState<ReadmeFileDto[]>([])
  const [updates, setUpdates] = useState<Record<string, ModUpdateInfoDto>>({})
  const [updating, setUpdating] = useState<Record<string, boolean>>({})
  const PIN_KEY = 'rbbpmm.pinned'
  const [pins, setPins] = useState<Record<string, true>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(PIN_KEY) ?? '{}')
    } catch {
      return {}
    }
  })
  const pendingArchive = useRef<string | null>(null)
  const mounted = useRef(true)

  const checkUpdates = useCallback(async (list: ModItemDto[]): Promise<void> => {
    const sourced = list.filter((m) => m.gamebananaSource)
    if (sourced.length === 0) {
      setUpdates({})
      return
    }
    const map: Record<string, ModUpdateInfoDto> = {}
    for (const m of sourced) {
      const r = await window.api.mods.checkUpdate(m.guid)
      if (r.ok && r.value?.hasUpdate) map[m.guid] = r.value
    }
    if (mounted.current) setUpdates(map)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.api.mods.list()
      if (r.ok) {
        const list = r.value ?? []
        setMods(list)
        void checkUpdates(list)
      }
    } finally {
      setLoading(false)
    }
  }, [checkUpdates])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const off = window.api.app.onInstallProgress((p) => {
      if (mounted.current) setInstallState({ status: 'running', progress: p })
    })
    return () => {
      mounted.current = false
      off()
    }
  }, [refresh])

  const startInstall = useCallback(
    async (archivePath: string): Promise<'ok' | 'confirm' | 'error'> => {
      setInstallState({
        status: 'running',
        progress: { stage: 'start', percent: 0, message: t('detail.loading') }
      })
      const r = await window.api.mods.install(archivePath)
      if (!r.ok) {
        setInstallState({ status: 'error', message: r.error })
        return 'error'
      }
      if (!r.value) {
        setInstallState({ status: 'error', message: 'Failed to install' })
        return 'error'
      }
      const out = r.value
      
      if (out.mode === 'manifest' || out.mode === 'unmanaged') {
        const name = out.modName || t('mods.installedFallback')
        setInstallState({ status: 'done', modName: name })
        toast.success(t('mods.installedName', { name }))
        if ((out.readmes?.length ?? 0) > 0) setReadmes(out.readmes)
        await refresh()
        return 'ok'
      }
      
      pendingArchive.current = archivePath
      setPendingPlan(out.plan)
      setInstallState({ status: 'idle' })
      return 'confirm'
    },
    [refresh, t]
  )

  const confirmUnmanaged = useCallback(async (): Promise<boolean> => {
    const path = pendingArchive.current
    pendingArchive.current = null
    setPendingPlan(null)
    if (!path) return false
    setInstallState({ status: 'running', progress: { stage: 'start', percent: 0 } })
    const r = await window.api.mods.installUnmanaged(path)
    if (!r.ok) {
      setInstallState({ status: 'error', message: r.error })
      toast.error(r.error)
      return false
    }
    const out = r.value
    const name = out?.modName || t('mods.installedFallback')
    setInstallState({ status: 'done', modName: name })
    toast.success(t('mods.installedName', { name }))
    if ((out?.readmes?.length ?? 0) > 0 && out) setReadmes(out.readmes)
    await refresh()
    return true
  }, [refresh, t])

  const clearPendingPlan = useCallback(() => {
    pendingArchive.current = null
    setPendingPlan(null)
  }, [])

  const cancelInstall = useCallback(async () => {
    await window.api.mods.cancelInstall()
    setInstallState({ status: 'idle' })
  }, [])

  const clearReadmes = useCallback(() => {
    setReadmes([])
  }, [])

  const setPinned = useCallback((guid: string, pinned: boolean) => {
    setPins((prev) => {
      const next = { ...prev }
      if (pinned) next[guid] = true
      else delete next[guid]
      try {
        window.localStorage.setItem(PIN_KEY, JSON.stringify(next))
      } catch {
        /* ignore quota / serialization errors */
      }
      return next
    })
  }, [])

  const toggle = useCallback(
    async (guid: string, activate: boolean): Promise<boolean> => {
      const target = mods.find((m) => m.guid === guid)
      const r = await window.api.mods.toggle(guid, activate, target?.installDir)
      if (r.ok) {
        setMods((prev) => prev.map((m) => (m.guid === guid ? { ...m, activated: activate } : m)))
        return true
      }
      return false
    },
    [mods]
  )

  const uninstall = useCallback(
    async (guid: string): Promise<boolean> => {
      const r = await window.api.mods.uninstall(guid)
      if (r.ok) {
        await refresh()
        return true
      }
      return false
    },
    [refresh]
  )

  const updateMod = useCallback(
    async (guid: string): Promise<boolean> => {
      setUpdating((prev) => ({ ...prev, [guid]: true }))
      const r = await window.api.mods.update(guid)
      setUpdating((prev) => ({ ...prev, [guid]: false }))
      if (r.ok) {
        toast.success(t('mods.updateDone'), { description: t('mods.updateDoneDesc') })
        setUpdates((prev) => {
          const next = { ...prev }
          delete next[guid]
          return next
        })
        await refresh()
        return true
      }
      toast.error(t('mods.updateFail'), { description: r.error })
      return false
    },
    [refresh, t]
  )

  return {
    mods,
    loading,
    installState,
    pendingPlan,
    readmes,
    updates,
    updating,
    refresh,
    startInstall,
    confirmUnmanaged,
    clearPendingPlan,
    cancelInstall,
    toggle,
    uninstall,
    updateMod,
    clearReadmes,
    pins,
    setPinned
  }
}