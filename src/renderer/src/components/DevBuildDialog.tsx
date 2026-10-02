import { useState } from 'react';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
const RELEASES_URL = 'https://github.com/ruin321/RBBPMM/releases/';
export function DevBuildDialog(): React.JSX.Element | null {
    const { t } = useI18n();
    const [open, setOpen] = useState(true);
    if (!__DEV_BUILD__)
        return null;
    return (<Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3 text-left">
            <span className="text-3xl leading-none" aria-hidden>🤔</span>
            <div className="space-y-1.5 pt-0.5">
              <DialogTitle className="text-base leading-snug">{t('dev.line1')}</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-0.5">
                  <p>{t('dev.line2')}</p>
                  <p>{t('dev.line3')}</p>
                </div>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button>{t('dev.confirm')}</Button>
          </DialogClose>
          <Button variant="outline" onClick={() => {
            void window.api.ui.openExternal(RELEASES_URL);
            void window.api.window.close();
        }}>{t('dev.exitRelease')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}