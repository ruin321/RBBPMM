import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useAnimations } from '@/hooks/useAnimations'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

export function AnimationToggleCard(): React.JSX.Element {
  const { t } = useI18n()
  const { enabled, setEnabled } = useAnimations()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(true)
  }, [])

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          {t('anim.title')}
        </CardTitle>
        <CardDescription>{t('anim.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t('anim.enabled')}</span>
          <Switch disabled={!loaded} checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </CardContent>
    </Card>
  )
}