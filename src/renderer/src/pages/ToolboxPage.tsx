import { useEffect, useState } from 'react';
import type React from 'react';
import { FolderOpen, Wrench, ScrollText, Trash2, Package, Settings2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { GameEnvironment, ToolboxDirDto } from '@shared/types';
import { useI18n, type MessageKey } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
interface Props {
    onSetup: () => void;
    env: GameEnvironment | null;
}
const DIR_LABEL: Record<string, MessageKey> = {
    root: 'toolbox.dirRoot',
    bepinex: 'toolbox.dirBepinex',
    plugins: 'toolbox.dirPlugins',
    config: 'toolbox.dirConfig',
    modded: 'toolbox.dirModded'
};
const DIR_ICON: Record<string, React.ReactNode> = {
    root: <FolderOpen className="h-4 w-4"/>,
    bepinex: <FolderOpen className="h-4 w-4"/>,
    plugins: <Package className="h-4 w-4"/>,
    config: <Settings2 className="h-4 w-4"/>,
    modded: <FolderOpen className="h-4 w-4"/>
};
export function ToolboxPage({ onSetup, env }: Props): React.JSX.Element {
    const { t } = useI18n();
    const [dirs, setDirs] = useState<ToolboxDirDto[] | null>(null);
    const [log, setLog] = useState<string | null>(null);
    useEffect(() => {
        void window.api.toolbox.dirs().then((r) => setDirs(r.ok ? (r.value ?? []) : []));
    }, []);
    const readLog = async (): Promise<void> => {
        const r = await window.api.toolbox.readLog();
        if (!r.ok) {
            toast.error(t('toolbox.logFail'), { description: r.error });
            return;
        }
        setLog(r.value?.text ?? '');
    };
    const cleanup = async (): Promise<void> => {
        const r = await window.api.toolbox.cleanup();
        if (!r.ok) {
            toast.error(t('toolbox.cleanupFail'), { description: r.error });
            return;
        }
        const n = r.value?.removed ?? 0;
        if (n === 0)
            toast.info(t('toolbox.cleanupNone'));
        else
            toast.success(t('toolbox.cleanupDone', { n: String(n) }));
    };
    return (<div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader icon={<Wrench className="h-6 w-6"/>} title={t('toolbox.title')} desc={t('toolbox.desc')}/>
      {dirs !== null && (<Card>
          <CardHeader>
            <CardTitle>{t('toolbox.dirsHeader')}</CardTitle>
            <CardDescription>{t('toolbox.dirsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {dirs.map((d) => (<Button key={d.key} variant="outline" onClick={() => void window.api.toolbox.openDir(d.path)}>
                {DIR_ICON[d.key] ?? <FolderOpen className="h-4 w-4"/>}
                {t(DIR_LABEL[d.key] ?? 'toolbox.dirOther')}
              </Button>))}
          </CardContent>
        </Card>)}
      <Card>
        <CardHeader>
          <CardTitle>{t('toolbox.setupHeader')}</CardTitle>
          <CardDescription>{t('toolbox.setupDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={onSetup} disabled={env === null}>
            <Wand2 className="mr-2 h-4 w-4"/>
            {t('settings.setup')}
          </Button>
          {env === null && (<p className="mt-2 text-xs text-muted-foreground">{t('toolbox.setupNoGame')}</p>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('toolbox.logsHeader')}</CardTitle>
          <CardDescription>{t('toolbox.logsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={() => void readLog()}>
            <ScrollText className="mr-2 h-4 w-4"/>
            {t('toolbox.readLog')}
          </Button>
          {log !== null && (<pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
              {log.length > 0 ? log : t('toolbox.logEmpty')}
            </pre>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('toolbox.cleanupHeader')}</CardTitle>
          <CardDescription>{t('toolbox.cleanupDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={() => void cleanup()}>
            <Trash2 className="mr-2 h-4 w-4"/>
            {t('toolbox.cleanup')}
          </Button>
        </CardContent>
      </Card>
    </div>);
}
