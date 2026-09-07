import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'


export function ResetSettingsCard(): React.JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const doReset = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.app.resetSettings()
      setOpen(false)
      toast.success(t('settings.resetDone'))
    } catch {
      toast.error(t('settings.resetFail'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-muted-foreground" />
          {t('settings.reset')}
        </CardTitle>
        <CardDescription>{t('settings.resetDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={() => setOpen(true)}>
          <RotateCcw className="h-4 w-4" />
          {t('settings.reset')}
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('settings.resetConfirmTitle')}</DialogTitle>
              <DialogDescription>{t('settings.resetConfirmBody')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                {t('dialog.cancel')}
              </Button>
              <Button variant="destructive" disabled={busy} onClick={doReset}>
                <RotateCcw className="h-4 w-4" />
                {t('settings.reset')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}