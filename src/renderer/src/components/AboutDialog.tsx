import { useState } from 'react'
import { ExternalLink, ImageIcon, Package } from 'lucide-react'
import splashUrl from '@/assets/splash.png'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

const APP_VERSION = '0.1.3'

const SOURCE_URL = 'https://github.com/ruin321/RBBPMM'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
}

export function AboutDialog({ open, onOpenChange }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [showImage, setShowImage] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {t('about.title')}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowImage(true)}
                className="group block overflow-hidden rounded-lg border"
                title={t('about.imageHint')}
              >
                <img
                  src={splashUrl}
                  alt={t('about.imageHint')}
                  className="h-28 w-full object-cover transition group-hover:opacity-90"
                />
              </button>
              <p className="mt-2 font-semibold text-foreground">{t('about.name')}</p>
              <p className="mt-1 text-sm">
                {t('about.version')} <span className="font-mono">{APP_VERSION}</span>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <p className="max-h-64 overflow-y-auto whitespace-pre-line text-sm text-muted-foreground">
          {t('about.desc')}
        </p>
        <button
          type="button"
          onClick={() => void window.api.ui.openExternal(SOURCE_URL)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-left text-sm hover:bg-muted/80"
          title={SOURCE_URL}
        >
          <span className="truncate text-muted-foreground">{t('about.source')}</span>
          <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
        </button>
        <DialogFooter>
          <DialogClose asChild>
            <Button>{t('about.close')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>

      {}
      <Dialog open={showImage} onOpenChange={setShowImage}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              {t('about.title')}
            </DialogTitle>
          </DialogHeader>
          <img src={splashUrl} alt={t('about.imageHint')} className="w-full rounded-lg border" />
          <DialogFooter>
            <DialogClose asChild>
              <Button>{t('about.close')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}