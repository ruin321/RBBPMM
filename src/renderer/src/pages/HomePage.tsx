import { useEffect, useState } from 'react';
import { Gamepad2, Package, Palette, Play, Puzzle, Settings, Sparkles, Square, Store } from 'lucide-react';
import type { GameEnvironment } from '@shared/types';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
type NavPage = 'mods' | 'browse' | 'textures' | 'settings' | 'config';
interface Props {
    env: GameEnvironment | null;
    running: boolean;
    onLaunch: () => Promise<{
        ok: boolean;
        error?: string;
    }>;
    onLaunchSteam: () => Promise<{
        ok: boolean;
        error?: string;
    }>;
    onStop: () => Promise<{
        ok: boolean;
        error?: string;
    }>;
    onSelectDir: () => Promise<boolean>;
    onNavigate: (page: NavPage) => void;
}
const FEATURES: {
    page: NavPage;
    icon: React.ReactNode;
    titleKey: 'mods.title' | 'banana.title' | 'textures.title' | 'settings.title';
    descKey: 'home.modsDesc' | 'home.browseDesc' | 'home.texturesDesc' | 'home.settingsDesc';
}[] = [
    { page: 'mods', icon: <Package className="h-5 w-5"/>, titleKey: 'mods.title', descKey: 'home.modsDesc' },
    { page: 'browse', icon: <Store className="h-5 w-5"/>, titleKey: 'banana.title', descKey: 'home.browseDesc' },
    { page: 'textures', icon: <Palette className="h-5 w-5"/>, titleKey: 'textures.title', descKey: 'home.texturesDesc' },
    { page: 'settings', icon: <Settings className="h-5 w-5"/>, titleKey: 'settings.title', descKey: 'home.settingsDesc' }
];
export function HomePage({ env, running, onLaunch, onLaunchSteam, onStop, onSelectDir, onNavigate }: Props): React.JSX.Element {
    const { t } = useI18n();
    const [modsCount, setModsCount] = useState(0);
    const [texCount, setTexCount] = useState(0);
    useEffect(() => {
        void window.api.mods.list().then((r) => setModsCount(r.ok ? (r.value?.length ?? 0) : 0));
        void window.api.textures.list().then((r) => setTexCount(r.ok ? (r.value?.packs.length ?? 0) : 0));
    }, []);
    const launch = async (): Promise<void> => {
        await onLaunch();
    };
    const launchSteam = async (): Promise<void> => {
        await onLaunchSteam();
    };
    const stop = async (): Promise<void> => {
        await onStop();
    };
    return (<div className="mx-auto w-full max-w-4xl space-y-6">
      
      <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/25 via-background to-primary/5 p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl"/>
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl"/>
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 flex-1">
            <Badge className="mb-3 gap-1">
              <Sparkles className="h-3 w-3"/>
              Baldi&apos;s Basics Plus
            </Badge>
            <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              Ruin321&apos;s Mod Manager
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">{t('home.subtitle')}</p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {env ? (running ? (<Button variant="outline" onClick={() => void stop()}>
                    <Square className="mr-2 h-4 w-4"/>
                    {t('mods.stop')}
                  </Button>) : (<>
                    <Button onClick={() => void launch()}>
                      <Play className="mr-2 h-4 w-4"/>
                      {t('mods.launch')}
                    </Button>
                    <Button variant="outline" onClick={() => void launchSteam()}>
                      <Gamepad2 className="mr-2 h-4 w-4"/>
                      {t('mods.launchSteam')}
                    </Button>
                  </>)) : (<Button onClick={() => void onSelectDir()}>
                  <Puzzle className="mr-2 h-4 w-4"/>
                  {t('home.configure')}
                </Button>)}
            </div>
          </div>

          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-inner">
            <Package className="h-12 w-12"/>
          </div>
        </div>
      </div>

      
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-primary"/>
              {t('mods.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{modsCount}</p>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Palette className="h-4 w-4 text-primary"/>
              {t('textures.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{texCount}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gamepad2 className="h-4 w-4 text-primary"/>
              {t('dir.version')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {env?.gameVersion && env.gameVersion.trim() ? env.gameVersion : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (<button key={f.page} type="button" onClick={() => onNavigate(f.page)} className="group rounded-2xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                {f.icon}
              </div>
            </CardHeader>
            <CardContent>
              <CardTitle className="text-sm">{t(f.titleKey)}</CardTitle>
              <CardDescription className="mt-1 text-xs">{t(f.descKey)}</CardDescription>
            </CardContent>
          </button>))}
      </div>
    </div>);
}
