import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { InstallProgress } from '@shared/types'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  progress: InstallProgress | null
  status: 'running' | 'done' | 'error'
  
  modName?: string
  errorMessage: string
  onCancel: () => Promise<void>
}

export function InstallModDialog({
  open,
  onOpenChange,
  progress,
  status,
  modName,
  errorMessage,
  onCancel
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  const cancel = async (): Promise<void> => {
    setBusy(true)
    await onCancel()
    setBusy(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (status === 'running') e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            {status === 'error'
              ? t('dialog.installFailed')
              : status === 'done'
                ? t('dialog.installDone')
                : t('dialog.installing')}
          </DialogTitle>
          <DialogDescription>
            {status === 'running' && (progress?.message ?? t('dialog.workingMsg'))}
            {status === 'done' && (modName ? `${t('dialog.installedEnabled')} · ${modName}` : t('dialog.installedEnabled'))}
            {status === 'error' && errorMessage}
          </DialogDescription>
        </DialogHeader>
        {status === 'running' && progress && (
          <div className="space-y-2">
            {}
            <Progress value={progress.percent} indeterminate={progress.percent === undefined} />
            <p className="text-xs text-muted-foreground">
              {progress.stage} · {progress.percent === undefined ? '…' : `${progress.percent}%`}
            </p>
          </div>
        )}
        <DialogFooter>
          {status === 'running' ? (
            <Button variant="outline" onClick={() => void cancel()} disabled={busy}>
              {t('dialog.cancel')}
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>{t('dialog.close')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}