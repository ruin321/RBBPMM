import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { InstallProgress } from '@shared/types'
import { useI18n, type MessageKey } from '@/i18n'
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

const STAGE_KEY: Record<string, MessageKey> = {
  start: 'dialog.workingMsg',
  downloading: 'banana.downloading',
  extracting: 'textures.installingExtract',
  installing: 'banana.installing',
  install: 'banana.installing',
  done: 'dialog.installDone'
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

  const handleOpenChange = (o: boolean): void => {
    if (!o && status === 'running') {
      setBusy(true)
      void onCancel().finally(() => {
        setBusy(false)
        onOpenChange(false)
      })
      return
    }
    onOpenChange(o)
  }

  const stageText = (p: InstallProgress): string => {
    const key = STAGE_KEY[p.stage]
    const stageName = key ? t(key) : p.stage
    if (typeof p.percent === 'number') return `${stageName} · ${p.percent}%`
    return stageName
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            {status === 'running' && (progress ? stageText(progress) : t('dialog.workingMsg'))}
            {status === 'done' && (modName ? `${t('dialog.installedEnabled')} · ${modName}` : t('dialog.installedEnabled'))}
            {status === 'error' && errorMessage}
          </DialogDescription>
        </DialogHeader>
        {status === 'running' && progress && (
          <div className="space-y-2">
            {}
            <Progress value={progress.percent} indeterminate={progress.percent === undefined} />
            <p className="text-xs text-muted-foreground">
              {stageText(progress)}
            </p>
          </div>
        )}
        <DialogFooter>
          {status === 'running' ? (
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
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