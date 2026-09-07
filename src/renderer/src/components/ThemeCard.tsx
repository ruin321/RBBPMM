import { Palette } from 'lucide-react'
import { THEMES, findTheme } from '@/theme'
import { useI18n } from '@/i18n'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Props {
  themeId: string
  onChange: (id: string) => void
}

export function ThemeCard({ themeId, onChange }: Props): React.JSX.Element {
  const { t } = useI18n()
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-muted-foreground" />
          {t('theme.title')}
        </CardTitle>
        <CardDescription>{t('theme.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEMES.map((th) => {
            const active = th.id === themeId
            const swatch = th.vars?.['--primary'] ?? (th.dark ? '240 5.9% 10%' : '240 5.9% 90%')
            return (
              <button
                key={th.id}
                type="button"
                onClick={() => onChange(th.id)}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 text-left transition',
                  active
                    ? 'border-ring bg-accent/60 ring-1 ring-ring'
                    : 'border-input hover:bg-accent/40'
                )}
              >
                <span
                  className="h-8 w-8 shrink-0 rounded-full border border-black/10"
                  style={{ background: `hsl(${swatch})` }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{th.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {findTheme(th.id).dark ? t('theme.dark') : t('theme.light')}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}