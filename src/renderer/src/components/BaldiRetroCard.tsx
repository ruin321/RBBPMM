import { useState } from 'react'
import { Paintbrush } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useBaldiRetro } from '@/hooks/useBaldiRetro'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'


export function BaldiRetroCard(): React.JSX.Element {
  const { t } = useI18n()
  const { enabled, setEnabled, loaded } = useBaldiRetro()
  const [busy, setBusy] = useState(false)

  const onToggle = (v: boolean): void => {
    setBusy(true)
    setEnabled(v)
    setTimeout(() => setBusy(false), 300)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paintbrush className="h-5 w-5 text-muted-foreground" />
          {t('baldiRetro.title')}
        </CardTitle>
        <CardDescription>{t('baldiRetro.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t('baldiRetro.enable')}</span>
          <Switch disabled={!loaded || busy} checked={enabled} onCheckedChange={onToggle} />
        </div>
      </CardContent>
    </Card>
  )
}