import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { useI18n } from '@/i18n'


export function TitleBar(): JSX.Element {
  const { t } = useI18n()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api.window.isMaximized().then(setMaximized)
    void window.api.window.registerMaximizeEvents()
    const unsub = window.api.window.onMaximizedChanged(setMaximized)
    return unsub
  }, [])

  return (
    <div
      className="titlebar-drag flex h-9 w-full shrink-0 items-center justify-between border-b bg-transparent select-none"
      onDoubleClick={() => void window.api.window.toggleMaximize()}
    >
      <span className="truncate px-3 text-sm font-semibold text-foreground">{t('about.name')}</span>

      <div className="titlebar-no-drag flex h-full items-center">
        <button
          type="button"
          className="flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => void window.api.window.minimize()}
          aria-label="minimize"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => void window.api.window.toggleMaximize()}
          aria-label="maximize"
        >
          {maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3 w-3" />}
        </button>
        <button
          type="button"
          className="flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => void window.api.window.close()}
          aria-label="close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}