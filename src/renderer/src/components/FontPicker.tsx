import { useMemo, useState } from 'react'
import { Type } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'

interface Props {
  font: string
  fonts: string[]
  onSelect: (font: string) => void
}

export function FontPicker({ font, fonts, onSelect }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? fonts.filter((f) => f.toLowerCase().includes(q)) : fonts
  }, [fonts, query])

  const choose = (f: string): void => {
    onSelect(f)
    setOpen(false)
    setQuery('')
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5 text-muted-foreground" />
            {t('font.title')}
          </CardTitle>
          <CardDescription>{t('font.desc')}</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="max-w-40 truncate" style={{ fontFamily: font }}>
              {t('font.change')}
            </Button>
          </DialogTrigger>
          <DialogContent className="flex h-[28rem] max-w-md flex-col">
            <DialogHeader>
              <DialogTitle>{t('font.change')}</DialogTitle>
            </DialogHeader>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('font.search')}
              className="mb-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus-visible:ring-2"
            />
            <div className="flex-1 space-y-1 overflow-y-auto pr-1">
              {filtered.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => choose(f)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="truncate" style={{ fontFamily: f }}>
                    {f}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">Aa</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('font.empty')}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg bg-muted/50 px-3 py-3" style={{ fontFamily: font }}>
          <p className="text-base">{font || t('font.system')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The quick brown fox jumps over the lazy dog. 0123456789
          </p>
        </div>
      </CardContent>
    </Card>
  )
}