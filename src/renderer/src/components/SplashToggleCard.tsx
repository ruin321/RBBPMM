import { useEffect, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'


export function SplashToggleCard(): React.JSX.Element {
  const { t } = useI18n()
  const [enabled, setEnabled] = useState(true)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void window.api.app.getSplash().then((v) => {
      if (active) {
        setEnabled(v)
        setLoaded(true)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const onToggle = (v: boolean): void => {
    setEnabled(v)
    void window.api.app.setSplash(v)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-muted-foreground" />
          {t('splash.title')}
        </CardTitle>
        <CardDescription>{t('splash.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t('splash.show')}</span>
          <Switch disabled={!loaded} checked={enabled} onCheckedChange={onToggle} />
        </div>
      </CardContent>
    </Card>
  )
}