import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { ReadmeFileDto } from '@shared/types';
import { useI18n } from '@/i18n';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
export function ReadmeDialog({ kind, readmes, installDir, onOpenChange }: {
    kind: 'texture' | 'mod';
    readmes: ReadmeFileDto[];
    installDir?: string;
    onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
    const { t } = useI18n();
    const [tab, setTab] = useState(0);
    const current = readmes[tab] ?? readmes[0];
    const title = t(kind === 'texture' ? 'textures.readmeTitle' : 'mods.readmeTitle');
    const hint = t(kind === 'texture' ? 'textures.readmeHint' : 'mods.readmeHint');
    return (<Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {hint}
            {installDir ? (<button type="button" onClick={() => void window.api.ui.openFolder(installDir)} className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                <FolderOpen className="h-3.5 w-3.5"/>
                {t('textures.openFolder')}
              </button>) : null}
          </DialogDescription>
        </DialogHeader>

        {readmes.length > 1 && (<div className="flex flex-wrap gap-1.5">
            {readmes.map((r, i) => (<button key={r.name} type="button" onClick={() => setTab(i)} className={'rounded-md border px-2 py-1 text-xs ' +
                    (i === tab
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground')}>
                {r.name}
              </button>))}
          </div>)}

        {current ? (<pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm leading-relaxed">
            {current.content}
          </pre>) : (<p className="text-sm text-muted-foreground">{t('textures.noReadme')}</p>)}
      </DialogContent>
    </Dialog>);
}
