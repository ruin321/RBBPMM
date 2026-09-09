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
  submissionId: number
  fileId?: number
  onDone: () => void
}

export function DeepLinkInstallDialog({ submissionId, fileId, onDone }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const [sub, setSub] = useState<GamebananaSubmissionDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    let mounted = true
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
    const r = await window.api.banana.install(submissionId, fileId)
    if (r.ok) toast.success(t('banana.installedToast', { name: sub?.name ?? String(submissionId) }))
    else toast.error(r.error || t('banana.failInstall'))
    onDone()
  }

  const percent = typeof progress?.percent === 'number' ? Math.round(progress.percent) : undefined

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
              <Button onClick={() => void install()} disabled={!sub || !!error}>
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