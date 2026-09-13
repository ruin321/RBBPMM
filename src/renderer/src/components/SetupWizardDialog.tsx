import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, FolderSearch, Loader2, MonitorCog, Wand2, XCircle } from 'lucide-react';
import type { GameEnvironment } from '@shared/types';
import type { InstallProgress } from '@shared/types';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    env: GameEnvironment | null;
}
type Phase = 'idle' | 'installing' | 'done' | 'error';
export function SetupWizardDialog({ open, onOpenChange, env }: Props): React.JSX.Element {
    const { t } = useI18n();
    const [hasBep, setHasBep] = useState<boolean | null>(null);
    const [bepPhase, setBepPhase] = useState<Phase>('idle');
    const [devPhase, setDevPhase] = useState<Phase>('idle');
    const [percent, setPercent] = useState<number | null>(null);
    const [message, setMessage] = useState<string>('');
    const [error, setError] = useState<string>('');
    const checkSeq = useRef(0);
    const check = useCallback(async (): Promise<void> => {
        if (!env)
            return;
        const seq = ++checkSeq.current;
        const r = await window.api.setup.status();
        if (seq !== checkSeq.current)
            return;
        setHasBep(r.ok ? (r.value?.hasBepInEx ?? false) : false);
    }, [env]);
    useEffect(() => {
        if (!open)
            return;
        setBepPhase('idle');
        setDevPhase('idle');
        setPercent(null);
        setMessage('');
        setError('');
        void check();
    }, [open, check]);
    useEffect(() => {
        return window.api.setup.onProgress((p: InstallProgress) => {
            setBepPhase('installing');
            if (typeof p.percent === 'number')
                setPercent(p.percent);
            if (p.message)
                setMessage(p.message);
        });
    }, []);
    useEffect(() => {
        return window.api.setup.onDevApiProgress((p: InstallProgress) => {
            setDevPhase('installing');
            if (typeof p.percent === 'number')
                setPercent(p.percent);
            if (p.message)
                setMessage(p.message);
        });
    }, []);
    useEffect(() => {
        return window.api.setup.onInstallAllProgress((p: InstallProgress) => {
            if (p.stage === 'bepinex')
                setBepPhase('installing');
            else if (p.stage === 'devapi')
                setDevPhase('installing');
            if (typeof p.percent === 'number')
                setPercent(p.percent);
            if (p.message)
                setMessage(p.message);
        });
    }, []);
    const runAll = async (): Promise<void> => {
        setError('');
        setPercent(0);
        setMessage('');
        setBepPhase('installing');
        const r = await window.api.setup.installAll();
        if (r.ok) {
            setBepPhase('done');
            setDevPhase('done');
            await check();
        }
        else {
            setBepPhase(hasBep ? 'done' : 'error');
            setDevPhase('error');
            setError(r.error);
        }
    };
    const installing = bepPhase === 'installing' || devPhase === 'installing';
    const busy = hasBep === null;
    const bepStatus = hasBep === true || bepPhase === 'done' ? 'ok' : bepPhase === 'error' ? 'bad' : bepPhase === 'installing' ? 'busy' : 'todo';
    return (<Dialog open={open} onOpenChange={(o) => !installing && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary"/>
            {t('setup.title')}
          </DialogTitle>
          <DialogDescription>
            {t('setup.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {busy ? (<div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin"/>
              {t('setup.statusCheck')}
            </div>) : (<>
              <StatusRow kind={bepStatus} label="BepInEx" note={bepStatus === 'ok' ? t('setup.hasBep') : undefined}/>
              <StatusRow kind={devPhase === 'done' ? 'ok' : devPhase === 'error' ? 'bad' : devPhase === 'installing' ? 'busy' : 'todo'} label={t('setup.devApi')} note={t('setup.devApiNote')}/>

              {(installing || devPhase !== 'idle') && (<div className="space-y-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent ?? 0}%` }}/>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{message}</p>
                </div>)}

              {error && (<p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>)}

              {env && (<Button variant="ghost" size="sm" onClick={() => void window.api.ui.openFolder(env.rootPath)}>
                  <FolderSearch className="mr-1 h-4 w-4"/>
                  {t('setup.openDir')}
                </Button>)}
            </>)}
        </div>

        <DialogFooter>
          {hasBep !== null && (<>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={installing}>
                {t('setup.later')}
              </Button>
              <Button onClick={() => void (bepStatus === 'ok' && devPhase === 'done' ? onOpenChange(false) : runAll())} disabled={installing || busy}>
                {installing ? (<>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin"/>
                    {t('setup.installing')}
                  </>) : devPhase === 'done' && bepStatus === 'ok' ? (t('dialog.close')) : (t('setup.installAll'))}
              </Button>
            </>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
function StatusRow({ kind, label, note }: {
    kind: 'ok' | 'bad' | 'busy' | 'todo';
    label: string;
    note?: string;
}): React.JSX.Element {
    return (<div className="flex items-start gap-2">
      {kind === 'ok' ? (<CheckCircle2 className="mt-0.5 h-5 w-5 text-green-500"/>) : kind === 'bad' ? (<XCircle className="mt-0.5 h-5 w-5 text-destructive"/>) : kind === 'busy' ? (<Loader2 className="mt-0.5 h-5 w-5 animate-spin text-muted-foreground"/>) : (<MonitorCog className="mt-0.5 h-5 w-5 text-muted-foreground"/>)}
      <div className="min-w-0">
        <span className="text-sm font-medium">{label}</span>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>);
}
