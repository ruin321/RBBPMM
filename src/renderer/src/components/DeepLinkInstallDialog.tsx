import { useEffect, useState } from 'react'
import { Download, Loader2, Package } from 'lucide-react'
import { toast } from 'sonner'
import type { GamebananaSubmissionDto, InstallProgress } from '@shared/types'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

interface Props {
  submissionId?: number
  fileId?: number
  url?: string
  modType?: string
  modId?: number
  onDone: () => void
}

export function DeepLinkInstallDialog({
  submissionId,
  fileId,
  url,
  modType,
  modId,
  onDone
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const [sub, setSub] = useState<GamebananaSubmissionDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    let mounted = true
    if (!submissionId) return
    void window.api.banana.get(submissionId).then((r) => {
      if (!mounted) return
      if (r.ok && r.value) setSub(r.value)
      else if (!r.ok) setError(r.error || String(submissionId))
    })
    return () => {
      mounted = false
    }
  }, [submissionId])

  useEffect(() => {
    return window.api.app.onInstallProgress((p) => setProgress(p))
  }, [])

  const install = async (): Promise<void> => {
    setInstalling(true)
    setProgress(null)
    const displayName = sub?.name ?? (modId ? String(modId) : t('mods.installedFallback'))
    const r = url
      ? await window.api.banana.installUrl(url, modType, modId)
      : await window.api.banana.install(submissionId!, fileId)
    if (r.ok) toast.success(t('banana.installedToast', { name: displayName }))
    else toast.error(r.error || t('banana.failInstall'))
    onDone()
  }

  const percent = typeof progress?.percent === 'number' ? Math.round(progress.percent) : undefined

  const isUrlMode = !!url
  const ready = isUrlMode || !!sub

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDone() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {t('detail.deeplinkTitle')}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="pt-2 text-sm">
              {error ? (
                <p className="text-destructive">{t('banana.failInstall')} ({error})</p>
              ) : isUrlMode ? (
                <p className="break-all text-foreground">
                  {url}
                  {modType ? `\n${modType}${modId ? `\n${modId}` : ''}` : ''}
                </p>
              ) : sub ? (
                <p className="text-foreground">{t('detail.deeplinkBody', { name: sub.name })}</p>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {installing ? (
            <div className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress?.message ?? t('detail.install')}
              {percent !== undefined ? ` ${percent}%` : ''}
            </div>
          ) : (
            <>
              <DialogClose asChild>
                <Button variant="ghost">{t('dialog.close')}</Button>
              </DialogClose>
              <Button onClick={() => void install()} disabled={!ready || !!error}>
                <Download className="mr-1 h-4 w-4" />
                {t('detail.install')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}