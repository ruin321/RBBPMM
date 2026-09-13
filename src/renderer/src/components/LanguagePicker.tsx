import { Languages } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** 亚等约语（Eilmetion 供稿）：选中时右下角弹致谢 */
const CREDIT_LOCALE = 'ydyy'
const CREDIT_TEXT = 'By Eilmetion'

export function LanguagePicker(): React.JSX.Element {
  const { locale, setLocale, locales, t } = useI18n()

  const pick = (id: string): void => {
    setLocale(id as Parameters<typeof setLocale>[0])
    if (id === CREDIT_LOCALE) toast(CREDIT_TEXT)
  }

  if (locale === 'fish') {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-muted-foreground" />
            FISH
          </CardTitle>
          <CardDescription>IM FISH</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">FISH FISH FISH</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5 text-muted-foreground" />
          {t('language.title')}
        </CardTitle>
        <CardDescription>{t('language.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {locales.map((l) => {
            const active = l.id === locale
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => pick(l.id)}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition',
                  active
                    ? 'border-ring bg-accent/60 ring-1 ring-ring'
                    : 'border-input hover:bg-accent/40'
                )}
              >
                <span className="text-sm font-medium">{l.native}</span>
                <span className="text-xs text-muted-foreground">{l.name}</span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}