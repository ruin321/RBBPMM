import { useEffect, useState } from 'react'
import { ImagePlus, Palette, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useCustomStyle } from '@/hooks/useCustomStyle'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'


export function CustomStyleCard(): React.JSX.Element {
  const { t } = useI18n()
  const { setBg, clearBg, setCss } = useCustomStyle()
  const [cssText, setCssText] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void window.api.app.getCustomCss().then((css) => {
      if (active) {
        setCssText(css ?? '')
        setLoaded(true)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const pickBg = async (): Promise<void> => {
    const res = await window.api.ui.pickImage()
    if (res.ok && res.value) setBg(res.value.dataUrl)
  }

  const onCssChange = (v: string): void => {
    setCssText(v)
    setCss(v)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-muted-foreground" />
          {t('customStyle.title')}
        </CardTitle>
        <CardDescription>{t('customStyle.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('customStyle.bgLabel')}</span>
          <Button type="button" size="sm" onClick={() => void pickBg()}>
            <ImagePlus className="h-4 w-4" />
            {t('customStyle.pickBg')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={clearBg}>
            <Trash2 className="h-4 w-4" />
            {t('customStyle.clearBg')}
          </Button>
        </div>
        <div>
          <span className="text-sm text-muted-foreground">{t('customStyle.cssLabel')}</span>
          <textarea
            disabled={!loaded}
            value={cssText}
            onChange={(e) => onCssChange(e.target.value)}
            spellCheck={false}
            className="mt-1 h-32 w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            placeholder={t('customStyle.cssPlaceholder')}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('customStyle.cssHint')}</p>
        </div>
      </CardContent>
    </Card>
  )
}