import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { InstallProgress, ModInstallPlanDto, ModItemDto, ReadmeFileDto } from '@shared/types'
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
  refresh: () => Promise<void>
  startInstall: (archivePath: string) => Promise<'ok' | 'confirm' | 'error'>
  confirmUnmanaged: () => Promise<boolean>
  clearPendingPlan: () => void
  cancelInstall: () => Promise<void>
  toggle: (guid: string, activate: boolean) => Promise<boolean>
  uninstall: (guid: string) => Promise<boolean>
  clearReadmes: () => void
} {
  const { t } = useI18n()
  const [mods, setMods] = useState<ModItemDto[]>([])
  const [loading, setLoading] = useState(false)
  const [installState, setInstallState] = useState<InstallState>({ status: 'idle' })
  const [pendingPlan, setPendingPlan] = useState<ModInstallPlanDto | null>(null)
  const [readmes, setReadmes] = useState<ReadmeFileDto[]>([])
  const pendingArchive = useRef<string | null>(null)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.api.mods.list()
      if (r.ok) setMods(r.value ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

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
  }, [])

  const clearReadmes = useCallback(() => {
    setReadmes([])
  }, [])

  const toggle = useCallback(
    async (guid: string, activate: boolean): Promise<boolean> => {
      const r = await window.api.mods.toggle(guid, activate)
      if (r.ok) {
        await refresh()
        return true
      }
      return false
    },
    [refresh]
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

  return {
    mods,
    loading,
    installState,
    pendingPlan,
    readmes,
    refresh,
    startInstall,
    confirmUnmanaged,
    clearPendingPlan,
    cancelInstall,
    toggle,
    uninstall,
    clearReadmes
  }
}