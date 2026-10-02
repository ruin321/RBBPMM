import { useCallback, useEffect, useState } from 'react';
import { Download, FolderOpen, Image as ImageIcon, Loader2, PackageX, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { GameEnvironment, PosterPackDto, PosterPackInstallResult } from '@shared/types';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { WithTooltip } from '@/components/ui/tooltip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RichText } from '@/components/RichText';
import { PageHeader } from '@/components/PageHeader';
import { ReadmeDialog } from '@/components/ReadmeDialog';
import { Progress } from '@/components/ui/progress';
interface Props {
    env: GameEnvironment | null;
    dropPath?: string | null;
    onDropConsumed?: () => void;
    modInstalled: boolean;
}
export function PostersPage({ env, dropPath, onDropConsumed, modInstalled }: Props): React.JSX.Element {
    const { t } = useI18n();
    const [packs, setPacks] = useState<PosterPackDto[]>([]);
    const [installDir, setInstallDir] = useState('');
    const [loading, setLoading] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [stage, setStage] = useState<'extracting' | 'installing'>('installing');
    const [readmes, setReadmes] = useState<{
        name: string;
        content: string;
    }[]>([]);
    const [readmeDir, setReadmeDir] = useState('');
    useEffect(() => window.api.app.onPosterPackProgress((p) => setStage(p.stage)), []);
    const load = useCallback(async (): Promise<void> => {
        if (!env)
            return;
        setLoading(true);
        try {
            const r = await window.api.posters.list();
            if (r.ok && r.value) {
                setPacks(r.value.packs);
                setInstallDir(r.value.installDir);
            }
        }
        finally {
            setLoading(false);
        }
    }, [env]);
    useEffect(() => {
        void load();
    }, [load]);
    const installFrom = async (path: string): Promise<void> => {
        setInstalling(true);
        setStage('extracting');
        try {
            const r = await window.api.posters.install(path);
            if (!r.ok) {
                toast.error(t('posters.failInstall'), { description: r.error });
                return;
            }
            const result = r.value as PosterPackInstallResult;
            const n = result.installed.length;
            toast.success(<RichText text={t('posters.installedToast', { n })}/>);
            if (result.readmes.length > 0) {
                setReadmes(result.readmes);
                setReadmeDir(result.installDir);
            }
            await load();
        }
        finally {
            setInstalling(false);
        }
    };
    const pickAndInstall = async (): Promise<void> => {
        if (!env) {
            toast.error(t('mods.notConfigured'));
            return;
        }
        const picked = await window.api.ui.pickZip();
        if (!picked.ok || !picked.value)
            return;
        await installFrom(picked.value.path);
    };
    useEffect(() => {
        if (!dropPath)
            return;
        if (!env) {
            toast.error(t('mods.notConfigured'));
            onDropConsumed?.();
            return;
        }
        void installFrom(dropPath);
        onDropConsumed?.();
    }, [dropPath, env]);
    const toggleEnabled = async (pack: PosterPackDto, enabled: boolean): Promise<void> => {
        const r = await window.api.posters.toggleEnabled(pack.folderName, enabled);
        if (!r.ok) {
            toast.error(enabled ? t('list.failEnable') : t('list.failDisable'), { description: r.error });
            return;
        }
        setPacks((prev) => prev.map((p) => (p.folderName === pack.folderName ? { ...p, enabled } : p)));
    };
    const uninstall = async (pack: PosterPackDto): Promise<void> => {
        const r = await window.api.posters.uninstall(pack.folderName);
        if (!r.ok) {
            toast.error(t('posters.failUninstall'), { description: r.error });
            return;
        }
        toast.success(<RichText text={t('posters.uninstalledToast', { name: pack.name })}/>);
        await load();
    };
    if (!modInstalled) {
        return (<div className="mx-auto w-full max-w-3xl space-y-6">
          <PageHeader icon={<ImageIcon className="h-6 w-6"/>} title={t('posters.title')} desc={t('posters.desc', { n: packs.length })}/>
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground"/>
            <p className="text-sm text-muted-foreground">{t('posters.notInstalled')}</p>
            <Button variant="outline" size="sm" onClick={() => void window.api.ui.openExternal('https://gamebanana.com/mods/498780')}>
              {t('posters.getMod')}
            </Button>
          </div>
        </div>);
    }
    return (<div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader icon={<ImageIcon className="h-6 w-6"/>} title={t('posters.title')} desc={t('posters.desc', { n: packs.length })}>
        <Button onClick={() => void pickAndInstall()} disabled={installing || !env}>
          {installing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>}
          {t('posters.install')}
        </Button>
      </PageHeader>

      {installing && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-primary"/>
            <span className="text-sm text-muted-foreground">
              {stage === 'extracting' ? 'Extracting archive...' : 'Installing posters...'}
            </span>
            <Progress indeterminate className="ml-auto h-1.5 w-32"/>
          </div>
      )}

      {!env ? (<Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <PackageX className="h-10 w-10 text-muted-foreground"/>
            <p className="text-muted-foreground">{t('mods.notConfigured')}</p>
          </CardContent>
        </Card>) : loading ? (<div className="space-y-3">
          {[0, 1, 2].map((i) => (<Skeleton key={i} className="h-20 w-full"/>))}
        </div>) : packs.length === 0 ? (<Card>
          <CardHeader>
            <CardTitle>{t('posters.emptyTitle')}</CardTitle>
            <CardDescription>{t('posters.emptyDesc')}</CardDescription>
          </CardHeader>
        </Card>) : (<div className="space-y-3">
          {packs.map((p) => (<Card key={p.folderName} className={p.enabled ? '' : 'opacity-60'}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {p.thumbnail ? (<img src={p.thumbnail} alt={p.name} className="h-full w-full object-cover"/>) : (<ImageIcon className="h-6 w-6 text-muted-foreground"/>)}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <RichText text={p.name} className="truncate font-medium"/>
                      <Badge variant="outline">{t('posters.postersCount', { n: p.posterCount })}</Badge>
                      {p.enabled ? null : <Badge variant="outline">{t('textures.disabledBadge')}</Badge>}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground/70">{p.folderName}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <WithTooltip title={p.enabled ? t('textures.disable') : t('textures.enable')}>
                    <span className="flex items-center">
                      <Switch checked={p.enabled} onCheckedChange={(v) => void toggleEnabled(p, v)} aria-label={p.name}/>
                    </span>
                  </WithTooltip>
                  <Button variant="outline" size="sm" onClick={() => void window.api.ui.openFolder(installDir + '\\' + p.folderName)}>
                    <FolderOpen className="mr-1 h-3.5 w-3.5"/>
                    {t('textures.openFolder')}
                  </Button>
                  <WithTooltip title={t('textures.uninstall')}>
                    <Button variant="ghost" size="sm" onClick={() => void uninstall(p)}>
                      <Trash2 className="h-4 w-4 text-destructive"/>
                    </Button>
                  </WithTooltip>
                </div>
              </CardContent>
            </Card>))}
        </div>)}

      {readmes.length > 0 && (<ReadmeDialog kind="mod" readmes={readmes} installDir={readmeDir} onOpenChange={(open) => {
                if (!open)
                    setReadmes([]);
            }}/>)}
    </div>);
}