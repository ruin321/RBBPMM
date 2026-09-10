import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Gamepad2, PackageX, Play, Search, SlidersHorizontal, Package, Square } from 'lucide-react'
import { toast } from 'sonner'
import type { GameEnvironment } from '@shared/types'
import { useI18n } from '@/i18n'
import { useMods } from '@/hooks/useMods'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ModListItem } from '@/components/ModListItem'
import { PageHeader } from '@/components/PageHeader'
import { InstallModDialog } from '@/components/InstallModDialog'
import { InstallConfirmDialog } from '@/components/InstallConfirmDialog'
import { ReadmeDialog } from '@/components/ReadmeDialog'

type TimeFilter = 'all' | 'today' | 'week' | 'month'
type SortKey = 'recent' | 'name'


const PAGE_SIZE = 30


function isTrashed(m: { name: string }): boolean {
  return /\[(trashed|deleted|removed|delisted|垃圾)\]/i.test(m.name)
}

interface Props {
  env: GameEnvironment | null
  onLaunch: () => Promise<{ ok: boolean; error?: string }>
  onLaunchSteam: () => Promise<{ ok: boolean; error?: string }>
  running: boolean
  onStop: () => Promise<{ ok: boolean; error?: string }>
  dropPath: string | null
  onDropConsumed: () => void
  
  onEditConfig?: (configFile?: string, search?: string) => void
}

export function ModsPage({
  env,
  onLaunch,
  onLaunchSteam,
  running,
  onStop,
  dropPath,
  onDropConsumed,
  onEditConfig
}: Props): React.JSX.Element {
  const {
    mods,
    loading,
    installState,
    pendingPlan,
    readmes,
    updates,
    updating,
    startInstall,
    confirmUnmanaged,
    clearPendingPlan,
    cancelInstall,
    clearReadmes,
    toggle,
    uninstall,
    updateMod,
    pins,
    setPinned
  } = useMods()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('recent')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const { t } = useI18n()

  
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [mods, search, timeFilter, sortKey])

  
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    const threshold =
      timeFilter === 'today'
        ? now - day
        : timeFilter === 'week'
          ? now - 7 * day
          : timeFilter === 'month'
            ? now - 30 * day
            : 0

    const list = mods.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q) && !(m.author || '').toLowerCase().includes(q)) {
        return false
      }
      if (timeFilter === 'all') return true
      const at = m.installedAt ?? 0
      if (!at) return true 
      return at >= threshold
    })

    return list.sort((a, b) => {
      const ta = isTrashed(a) ? 1 : 0
      const tb = isTrashed(b) ? 1 : 0
      if (ta !== tb) return ta - tb
      const pa = pins[a.guid] ? 1 : 0
      const pb = pins[b.guid] ? 1 : 0
      if (pa !== pb) return pb - pa
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      const at = (b.installedAt ?? 0) - (a.installedAt ?? 0)
      if (at !== 0) return at
      return a.name.localeCompare(b.name)
    })
  }, [mods, search, timeFilter, sortKey, pins])

  
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMore = (): void => {
    setVisibleCount((c) => (c >= filtered.length ? c : c + PAGE_SIZE))
  }
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore()
      },
      { rootMargin: '300px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
    
    
    
  }, [filtered.length, visibleCount])

  const runInstall = async (path: string): Promise<void> => {
    setDialogOpen(true)
    const res = await startInstall(path)
    if (res === 'confirm') {
      setDialogOpen(false)
      setConfirmOpen(true)
    }
  }

  const pickAndInstall = async (): Promise<void> => {
    if (!env) {
      toast.error(t('mods.notConfigured'))
      return
    }
    const picked = await window.api.ui.pickZip()
    if (!picked.ok || !picked.value) return
    await runInstall(picked.value.path)
  }

  
  useEffect(() => {
    if (!dropPath) return
    if (!env) {
      toast.error(t('mods.notConfigured'))
      onDropConsumed()
      return
    }
    void runInstall(dropPath)
    onDropConsumed()
    
  }, [dropPath, env])

  const confirmInstall = async (): Promise<void> => {
    setConfirmOpen(false)
    setDialogOpen(true)
    await confirmUnmanaged()
  }

  const cancelConfirm = (): void => {
    clearPendingPlan()
    setConfirmOpen(false)
  }

  const launch = async (): Promise<void> => {
    const r = await onLaunch()
    if (!r.ok) toast.error(t('mods.launchFail'), { description: r.error })
  }

  const launchSteam = async (): Promise<void> => {
    const r = await onLaunchSteam()
    if (!r.ok) toast.error(t('mods.launchSteamFail'), { description: r.error })
  }

  const stop = async (): Promise<void> => {
    const r = await onStop()
    if (!r.ok) toast.error(t('mods.stopFail'), { description: r.error })
  }

  const status: 'running' | 'done' | 'error' =
    installState.status === 'running'
      ? 'running'
      : installState.status === 'error'
        ? 'error'
        : 'done'

  return (
    <>
      <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        icon={<Package className="h-6 w-6" />}
        title={t('mods.title')}
        desc={t('mods.countInstalled', { n: filtered.length })}
      >
        {running ? (
          <Button variant="outline" onClick={() => void stop()} title={t('mods.stop')}>
            <Square className="mr-2 h-4 w-4" />
            {t('mods.stop')}
          </Button>
        ) : (
          <>
            <Button variant="outline" disabled={!env} onClick={() => void launch()} title={t('mods.launch')}>
              <Play className="mr-2 h-4 w-4" />
              {t('mods.launch')}
            </Button>
            <Button variant="outline" disabled={!env} onClick={() => void launchSteam()} title={t('mods.launchSteam')}>
              <Gamepad2 className="mr-2 h-4 w-4" />
              {t('mods.launchSteam')}
            </Button>
          </>
        )}
        <Button onClick={() => void pickAndInstall()}>
          <Download className="mr-2 h-4 w-4" />
          {t('mods.install')}
        </Button>
      </PageHeader>

      {env && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('filter.search')}
              className="pl-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                {timeFilter === 'all' ? t('filter.timeAll') : t(`filter.time_${timeFilter}`)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTimeFilter('all')}>{t('filter.timeAll')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeFilter('today')}>{t('filter.time_today')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeFilter('week')}>{t('filter.time_week')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeFilter('month')}>{t('filter.time_month')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSortKey('recent')}>
                {sortKey === 'recent' ? '✓ ' : ''}
                {t('filter.sortRecent')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortKey('name')}>
                {sortKey === 'name' ? '✓ ' : ''}
                {t('filter.sortName')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {!env ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <PackageX className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">{t('mods.notConfigured')}</p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : mods.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('mods.emptyTitle')}</CardTitle>
            <CardDescription>{t('mods.emptyDesc')}</CardDescription>
          </CardHeader>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">{t('mods.searchEmpty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, visibleCount).map((m) => (
            <ModListItem
              key={m.guid}
              mod={m}
              updateInfo={updates[m.guid]}
              updating={updating[m.guid] ?? false}
              onUpdate={() => void updateMod(m.guid)}
              onToggle={toggle}
              onUninstall={uninstall}
              onSetPinned={(v) => setPinned(m.guid, v)}
              pinned={!!pins[m.guid]}
              onEditConfig={onEditConfig}
            />
          ))}
          {}
          {filtered.length > visibleCount && (
            <div ref={sentinelRef} className="h-px w-full" />
          )}
        </div>
      )}

      <InstallModDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        progress={installState.status === 'running' ? installState.progress : null}
        status={status}
        modName={installState.status === 'done' ? installState.modName : undefined}
        errorMessage={installState.status === 'error' ? installState.message : ''}
        onCancel={cancelInstall}
      />

      <InstallConfirmDialog
        open={confirmOpen && pendingPlan !== null}
        plan={pendingPlan}
        busy={false}
        onOpenChange={(o) => {
          if (!o) cancelConfirm()
        }}
        onConfirm={confirmInstall}
      />

      {readmes.length > 0 && (
        <ReadmeDialog
          kind="mod"
          readmes={readmes}
          onOpenChange={(open) => {
            if (!open) clearReadmes()
          }}
        />
      )}
      </div>
    </>
  )
}