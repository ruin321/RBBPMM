import { useCallback, useEffect, useState } from 'react'
import { Map as MapIcon, RefreshCw, Trash2, FileQuestion } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n'
import type { CustomLevelDto } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/PageHeader'

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

export function CustomLevelsPage({ modInstalled }: { modInstalled: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const [levels, setLevels] = useState<CustomLevelDto[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<CustomLevelDto | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    const r = await window.api.customLevel.list()
    if (r.ok && r.value) {
      const sorted = [...r.value].sort((a, b) => a.fileName.localeCompare(b.fileName))
      setLevels(sorted)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (modInstalled) void load()
  }, [load, modInstalled])

  const onToggle = async (lvl: CustomLevelDto, enabled: boolean): Promise<void> => {
    const r = await window.api.customLevel.toggle(lvl.fileName, enabled)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    setLevels((prev) => prev.map((m) => (m.fileName === lvl.fileName ? { ...m, enabled } : m)))
  }

  const onDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    setBusy(true)
    const r = await window.api.customLevel.delete(deleteTarget.fileName)
    setBusy(false)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    setLevels((prev) => prev.filter((m) => m.fileName !== deleteTarget.fileName))
    toast.success(t('maps.deleted'))
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={<MapIcon className="h-5 w-5" />} title={t('maps.title')} desc={t('maps.desc')}>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('maps.refresh')}
        </Button>
      </PageHeader>

      {!modInstalled ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <MapIcon className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('maps.notInstalled')}</p>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : levels.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <MapIcon className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('maps.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {levels.map((lvl) => (
            <Card key={lvl.fileName} className={!lvl.enabled ? 'opacity-60' : ''}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {lvl.thumbnail ? (
                    <img src={lvl.thumbnail} alt={lvl.name} className="h-full w-full object-cover" />
                  ) : (
                    <FileQuestion className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{lvl.name}</p>
                    {!lvl.enabled && <Badge variant="outline">{t('maps.disabledBadge')}</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {lvl.author ? `${lvl.author}` : t('maps.unknownAuthor')}
                    {lvl.type ? ` · ${lvl.type}` : ''}
                    <span className="mx-1">·</span>
                    {formatBytes(lvl.size)}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground/70">{lvl.fileName}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Switch checked={lvl.enabled} onCheckedChange={(v) => void onToggle(lvl, v)} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={() => setDeleteTarget(lvl)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('maps.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription asChild>
              <div className="pt-1">
                <p className="text-sm text-foreground">
                  {t('maps.deleteConfirm')}{' '}
                  <span className="font-semibold">{deleteTarget && deleteTarget.fileName}</span>
                </p>
                <p className="mt-2 text-xs text-red-500">{t('maps.deleteWarn')}</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t('dialog.cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void onDelete()} disabled={busy}>
              <Trash2 className="mr-1 h-4 w-4" />
              {t('maps.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}