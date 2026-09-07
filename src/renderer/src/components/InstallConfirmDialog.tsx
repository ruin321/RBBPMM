import type { ModInstallPlanDto } from '@shared/types'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
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
  plan: ModInstallPlanDto | null
  busy: boolean
  onOpenChange: (o: boolean) => void
  onConfirm: () => Promise<void>
}


export function InstallConfirmDialog({
  open,
  plan,
  busy,
  onOpenChange,
  onConfirm
}: Props): React.JSX.Element {
  const { t } = useI18n()
  if (!plan) return <></>

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('mods.confirmTitle')}</DialogTitle>
          <DialogDescription>{t('mods.confirmDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {plan.modded.length === 0 && plan.plugins.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('mods.confirmNone')}</p>
          )}

          {plan.modded.length > 0 && (
            <div>
              <div className="mb-1 text-sm font-semibold">{t('mods.confirmToModded')}</div>
              <ul className="space-y-1">
                {plan.modded.map((name) => (
                  <li key={name} className="text-xs text-muted-foreground">
                    <code className="rounded bg-muted px-1 py-0.5">
                      BALDI_Data/StreamingAssets/Modded/{name}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.plugins.length > 0 && (
            <div>
              <div className="mb-1 text-sm font-semibold">{t('mods.confirmToPlugins')}</div>
              <ul className="space-y-1">
                {plan.plugins.map((rel) => (
                  <li key={rel} className="text-xs text-muted-foreground">
                    <code className="rounded bg-muted px-1 py-0.5">BepInEx/plugins/{rel}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('mods.confirmCancel')}
          </Button>
          <Button disabled={busy} onClick={() => void onConfirm()}>
            {busy ? t('dialog.installing') : t('mods.confirmInstall')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}