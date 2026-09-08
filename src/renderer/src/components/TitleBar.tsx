import { useEffect, useState } from 'react'
import { Copy, Minus, Package, Square, X } from 'lucide-react'
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
      className="titlebar-drag relative flex h-10 w-full shrink-0 select-none items-center justify-between overflow-hidden border-b bg-gradient-to-b from-card via-card to-muted/40"
      onDoubleClick={() => void window.api.window.toggleMaximize()}
    >
      <div className="relative inline-flex items-center gap-2.5 px-4">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/12 text-primary">
          <Package className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
        <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
          {t('about.name')}
        </span>
      </div>

      <div className="titlebar-no-drag relative flex h-full items-center gap-0.5 pr-1.5">
        <button
          type="button"
          className="group flex h-[26px] w-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-foreground/10 hover:text-foreground active:scale-90"
          onClick={() => void window.api.window.minimize()}
          aria-label="minimize"
        >
          <Minus className="h-4 w-4" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          className="group flex h-[26px] w-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-foreground/10 hover:text-foreground active:scale-90"
          onClick={() => void window.api.window.toggleMaximize()}
          aria-label="maximize"
        >
          {maximized ? (
            <Copy className="h-3.5 w-3.5" strokeWidth={2.2} />
          ) : (
            <Square className="h-3.5 w-3.5" strokeWidth={2.2} />
          )}
        </button>
        <button
          type="button"
          className="group flex h-[26px] w-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-destructive hover:text-destructive-foreground active:scale-90"
          onClick={() => void window.api.window.close()}
          aria-label="close"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}