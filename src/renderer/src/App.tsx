import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import { Package, Moon, Sun, Settings, Store, Info, FileArchive, SlidersHorizontal, Palette, Map as MapIcon, Image as ImageIcon, PanelLeftClose, PanelLeftOpen, Home, Wrench, PackageX, Wand2, Loader2 } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useGame } from '@/hooks/useGame';
import { useTheme } from '@/hooks/useTheme';
import { useFont } from '@/hooks/useFont';
import { useI18n } from '@/i18n';
import { initAnimations } from '@/hooks/useAnimations';
import { TooltipProvider, WithTooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HomePage } from '@/pages/HomePage';
import { ModsPage } from '@/pages/ModsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { BananaPage } from '@/pages/BananaPage';
import { ConfigsPage } from '@/pages/ConfigsPage';
import { TexturePacksPage } from '@/pages/TexturePacksPage';
import { ToolboxPage } from '@/pages/ToolboxPage';
import { AboutDialog } from '@/components/AboutDialog';
import { DevBuildDialog } from '@/components/DevBuildDialog';
import { SplashScreen } from '@/components/SplashScreen';
import { DownloadsPanel } from '@/components/DownloadsPanel';
import { TitleBar } from '@/components/TitleBar';
import { FishSplash } from '@/components/FishSplash';
import { SetupWizardDialog } from '@/components/SetupWizardDialog';
import { DeepLinkInstallDialog } from '@/components/DeepLinkInstallDialog';
import { CustomLevelsPage } from '@/pages/CustomLevelsPage';
import { PostersPage } from '@/pages/PostersPage';
import { cn } from '@/lib/utils';
type Page = 'home' | 'mods' | 'browse' | 'textures' | 'posters' | 'maps' | 'settings' | 'config' | 'toolbox';
interface ConfigRequest {
    cfgPath?: string;
    search?: string;
}
const ARCHIVE_EXT = /\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar|bbmod|gmp)$/i;
export function App(): React.JSX.Element {
    const [page, setPage] = useState<Page>('home');
    const [splashOn, setSplashOn] = useState<boolean | null>(null);
    const { isDark, toggle, themeId, setThemeId } = useTheme();
    const { env, loading, select, launch, launchSteam, running, stop } = useGame();
    const { font, fonts, setFont } = useFont();
    const { t } = useI18n();
    const [aboutOpen, setAboutOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [dropPath, setDropPath] = useState<string | null>(null);
    const [textureDropPath, setTextureDropPath] = useState<string | null>(null);
    const [posterDropPath, setPosterDropPath] = useState<string | null>(null);
    const [navOpen, setNavOpen] = useState(true);
    const [cfgRequest, setCfgRequest] = useState<ConfigRequest | null>(null);
    const [deepLinkInstall, setDeepLinkInstall] = useState<{
        submissionId: number;
        fileId?: number;
    } | {
        url: string;
        modType?: string;
        modId?: number;
    } | null>(null);
    const [setupOpen, setSetupOpen] = useState(false);
    const [bepReady, setBepReady] = useState<boolean | null>(null);
    const [installedMods, setInstalledMods] = useState<{
        name: string;
    }[]>([]);
    const [installChoice, setInstallChoice] = useState<{
        jobId: string;
        savedPath: string;
        submissionName: string;
    } | null>(null);
    useEffect(() => {
        initAnimations();
    }, []);
    const checkSetup = useCallback(async (): Promise<void> => {
        const r = await window.api.setup.status();
        if (r.ok)
            setBepReady(r.value?.hasBepInEx ?? false);
    }, []);
    const requestSetupIfNeeded = useCallback(async (): Promise<void> => {
        const r = await window.api.setup.status();
        if (r.ok) {
            setBepReady(r.value?.hasBepInEx ?? false);
            if (r.value && !r.value.hasBepInEx)
                setSetupOpen(true);
        }
    }, []);
    const [navPrefLoaded, setNavPrefLoaded] = useState(false);
    if (!navPrefLoaded) {
        void window.api.app.getNavOpen().then((v) => {
            setNavOpen(v);
            setNavPrefLoaded(true);
        });
    }
    const [verticalLayout, setVerticalLayout] = useState(false);
    const [vertPrefLoaded, setVertPrefLoaded] = useState(false);
    if (!vertPrefLoaded) {
        void window.api.app.getVerticalLayout().then((v) => {
            setVerticalLayout(v);
            setVertPrefLoaded(true);
        });
    }
    const toggleNav = (): void => {
        setNavOpen((o) => {
            void window.api.app.setNavOpen(!o);
            return !o;
        });
    };
    if (splashOn === null) {
        void window.api.app.getSplash().then((v) => setSplashOn(v));
    }
    useEffect(() => {
        const onFocus = (): void => document.documentElement.classList.remove('window-inactive');
        const onBlur = (): void => document.documentElement.classList.add('window-inactive');
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
        };
    }, []);
    useEffect(() => {
        const applyMax = (m: boolean): void => {
            document.documentElement.classList.toggle('self-maximized', m);
        };
        void window.api.window.isMaximized().then(applyMax);
        return window.api.window.onMaximizedChanged(applyMax);
    }, []);
    useEffect(() => {
        return window.api.app.onOpenUrl((payload) => {
            if (payload.action === 'install' && payload.id) {
                setDeepLinkInstall({ submissionId: payload.id, fileId: payload.fileId });
            }
            else if (payload.action === 'install-url' && payload.url) {
                setDeepLinkInstall({
                    url: payload.url,
                    modType: payload.modType,
                    modId: payload.modId
                });
            }
        });
    }, []);
    useEffect(() => {
        return window.api.app.onNeedInstallChoice((p) => {
            setInstallChoice(p);
        });
    }, []);
    useEffect(() => {
        void checkSetup();
    }, [checkSetup]);
    useEffect(() => {
        if (page === 'browse')
            void checkSetup();
    }, [page, checkSetup]);
    useEffect(() => {
        void window.api.mods.list().then((r) => {
            if (r.ok && r.value)
                setInstalledMods(r.value);
        });
    }, [page]);
    const mapTabVisible = installedMods.some((m) => {
        const n = (m.name || '').toLowerCase();
        return (n.includes('level studio') ||
            n.includes('pluslevelstudio') ||
            n.includes('plusstudylevel'));
    });
    const texturesTabVisible = installedMods.some((m) => (m.name || '').toLowerCase().includes('balditexturepacks'));
    const postersTabVisible = installedMods.some((m) => {
        const n = (m.name || '').toLowerCase();
        return n.includes('customposters') || n.includes('custom posters');
    });
    useEffect(() => {
        if ((page === 'textures' && !texturesTabVisible) ||
            (page === 'posters' && !postersTabVisible) ||
            (page === 'maps' && !mapTabVisible)) {
            setPage('mods');
        }
    }, [page, texturesTabVisible, postersTabVisible, mapTabVisible]);
    const handleDrop = (e: React.DragEvent): void => {
        e.preventDefault();
        setDragging(false);
        const allFiles = Array.from(e.dataTransfer.files);
        const LOose_EXT = /\.(dll|plugin)$/i;
        const archives = allFiles.filter((f) => ARCHIVE_EXT.test(f.name));
        const looseDlls = allFiles.filter((f) => LOose_EXT.test(f.name));

        // Each archive handled independently (parallel)
        for (const file of archives) {
            const f = file as File & { path?: string };
            const path = f.path;
            if (!path) continue;
            void (async () => {
                const probes: Promise<any>[] = [window.api.textures.probe(path)];
                if (postersTabVisible) probes.push(window.api.posters.probe(path));
                if (mapTabVisible) probes.push(window.api.customLevel.probe(path));
                const results = await Promise.allSettled(probes);
                const texturesHit = results[0].status === 'fulfilled' && results[0].value.ok && results[0].value.value;
                const postersHit = postersTabVisible && results[1]?.status === 'fulfilled' && results[1].value.ok && results[1].value.value;
                const mapsHit = mapTabVisible && results[probes.length - 1]?.status === 'fulfilled' && results[probes.length - 1].value.ok && results[probes.length - 1].value.value;
                if (texturesHit) {
                    setTextureDropPath(path);
                    setPage('textures');
                    void window.api.textures.install(path);
                } else if (postersHit) {
                    setPosterDropPath(path);
                    setPage('posters');
                    void window.api.posters.install(path);
                } else if (mapsHit) {
                    setPage('maps');
                    void window.api.customLevel.install(path).then((ir) => {
                        if (ir.ok)
                            toast.success(t('maps.installedToast'));
                        else
                            toast.error(`Install failed: ${ir.error}`);
                    });
                } else {
                    setDropPath(path);
                    setPage('mods');
                    void window.api.mods.installUnmanaged(path);
                }
            })();
        }

        // Loose DLLs / plugin files — install directly
        for (const file of looseDlls) {
            const f = file as File & { path?: string };
            const path = f.path;
            if (!path) continue;
            void (async () => {
                setPage('mods');
                void window.api.mods.installUnmanaged(path);
            })();
        }
    };
    return (<TooltipProvider delayDuration={220}>
    <div className="app-root flex h-full flex-col overflow-hidden">
      <TitleBar />
      <div className={'relative flex flex-1 select-none overflow-hidden' + (verticalLayout ? ' flex-col' : '')} onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                setDragging(true);
            }
        }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
      <Toaster theme={isDark ? 'dark' : 'light'} position="bottom-right"/>

      <aside className={
            (verticalLayout
              ? 'order-1 shrink-0 flex-row items-center gap-1 overflow-x-auto border-t bg-muted/40 px-2 py-1.5'
              : 'flex h-full flex-col gap-1 overflow-hidden border-r bg-muted/40 py-4 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ' +
                (navOpen ? 'w-48' : 'w-16'))
          }>
        <div className={
              verticalLayout
                ? 'flex shrink-0 flex-row items-center gap-2'
                : navOpen
                  ? 'flex items-center justify-between gap-1 px-3'
                  : 'flex flex-col items-center gap-2'
            }>
          <Package className={'shrink-0 text-primary transition-transform duration-200 ' +
              (verticalLayout ? 'h-5 w-5' : navOpen ? 'h-7 w-7' : 'h-6 w-6')}/>
          <WithTooltip title={navOpen ? t('nav.collapse') : t('nav.expand')}>
          <Button variant="ghost" size="icon" onClick={toggleNav} className="h-9 w-9 shrink-0">
            <span className="transition-transform duration-200 ease-out">
              {navOpen ? <PanelLeftClose className="h-5 w-5"/> : <PanelLeftOpen className="h-5 w-5"/>}
            </span>
          </Button>
          </WithTooltip>
        </div>

        <div className={
              verticalLayout
                ? 'flex flex-1 flex-row items-center gap-1 overflow-x-auto'
                : navOpen
                  ? 'mt-2 space-y-1'
                  : 'mt-2 flex flex-col items-center gap-1'
            }>
          <NavButton active={page === 'home'} onClick={() => setPage('home')} label={t('nav.home')} open={navOpen} horizontal={verticalLayout}>
            <Home className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/>
          </NavButton>
          <NavButton active={page === 'mods'} onClick={() => setPage('mods')} label={t('nav.mods')} open={navOpen} horizontal={verticalLayout}>
            <Package className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/>
          </NavButton>
          <NavButton active={page === 'browse'} onClick={() => setPage('browse')} label={t('nav.browse')} open={navOpen} horizontal={verticalLayout}>
            <Store className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/>
          </NavButton>
          {texturesTabVisible ? (<NavButton active={page === 'textures'} onClick={() => setPage('textures')} label={t('nav.textures')} open={navOpen} horizontal={verticalLayout}>
              <Palette className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/>
            </NavButton>) : null}
          {postersTabVisible ? (<NavButton active={page === 'posters'} onClick={() => setPage('posters')} label={t('nav.posters')} open={navOpen} horizontal={verticalLayout}>
              <ImageIcon className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/>
            </NavButton>) : null}
          {mapTabVisible ? (<NavButton active={page === 'maps'} onClick={() => setPage('maps')} label={t('nav.maps')} open={navOpen} horizontal={verticalLayout}>
              <MapIcon className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/>
            </NavButton>) : null}
          <NavButton active={page === 'config'} onClick={() => setPage('config')} label={t('nav.config')} open={navOpen} horizontal={verticalLayout}>
            <SlidersHorizontal className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/>
          </NavButton>
          <NavButton active={page === 'settings'} onClick={() => setPage('settings')} label={t('nav.settings')} open={navOpen} horizontal={verticalLayout}>
            <Settings className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/>
          </NavButton>
          <NavButton active={page === 'toolbox'} onClick={() => setPage('toolbox')} label={t('nav.toolbox')} open={navOpen} horizontal={verticalLayout}>
            <Wrench className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/>
          </NavButton>
        </div>

        <div className={
              verticalLayout
                ? 'ml-auto flex shrink-0 flex-row items-center gap-1'
                : 'flex-1'
            }/>
        <div className={
              verticalLayout
                ? 'flex shrink-0 flex-row items-center gap-1'
                : navOpen
                  ? 'space-y-1'
                  : 'flex flex-col items-center gap-1'
            }>
          <NavButton onClick={toggle} label={isDark ? t('nav.light') : t('nav.dark')} open={navOpen} horizontal={verticalLayout}>
            {isDark ? <Sun className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/> : <Moon className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/>}
          </NavButton>
          <NavButton onClick={() => setAboutOpen(true)} label={t('nav.about')} open={navOpen} horizontal={verticalLayout}>
            <Info className={verticalLayout ? 'h-4 w-4' : 'h-5 w-5'}/>
          </NavButton>
        </div>
      </aside>

      
      <main className="flex-1 overflow-y-auto p-8">
        {page === 'home' ? (<HomePage env={env} running={running} onLaunch={launch} onLaunchSteam={launchSteam} onStop={stop} onSelectDir={async () => {
                const ok = await select();
                if (ok) {
                    setPage('mods');
                    void requestSetupIfNeeded();
                }
                return ok;
            }} onNavigate={setPage}/>) : page === 'mods' ? (<ModsPage env={env} onLaunch={launch} onLaunchSteam={launchSteam} running={running} onStop={stop} dropPath={dropPath} onDropConsumed={() => setDropPath(null)} onEditConfig={(configFile, search) => {
                setCfgRequest(configFile ? { cfgPath: configFile } : { search });
                setPage('config');
            }}/>) : page === 'browse' ? (bepReady === null ? (<div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin"/>
            </div>) : bepReady === false ? (<div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <PackageX className="h-12 w-12 text-muted-foreground"/>
              <div className="max-w-md space-y-2">
                <h2 className="text-xl font-semibold">{t('banana.notReadyTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('banana.notReadyDesc')}</p>
              </div>
              <Button onClick={() => setSetupOpen(true)}>
                <Wand2 className="mr-1 h-4 w-4"/>
                {t('banana.notReadyInstall')}
              </Button>
            </div>) : (<BananaPage onInstalled={() => {
            }}/>)) : page === 'maps' ? (<CustomLevelsPage modInstalled={mapTabVisible}/>) : page === 'textures' ? (<TexturePacksPage env={env} dropPath={textureDropPath} onDropConsumed={() => setTextureDropPath(null)}/>) : page === 'posters' ? (<PostersPage env={env} dropPath={posterDropPath} onDropConsumed={() => setPosterDropPath(null)} modInstalled={postersTabVisible}/>) : page === 'toolbox' ? (<ToolboxPage onSetup={() => setSetupOpen(true)} env={env}/>) : page === 'config' ? (<ConfigsPage externalCfgPath={cfgRequest?.cfgPath} externalSearch={cfgRequest?.search} onExternalConsumed={() => setCfgRequest(null)}/>) : (<SettingsPage env={env} loading={loading} onSelect={select} font={font} fonts={fonts} onSelectFont={setFont} themeId={themeId} onSelectTheme={setThemeId} onSetup={() => setSetupOpen(true)}/>)}
      </main>

      {dragging && (<div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-card/80 px-12 py-10">
            <FileArchive className="h-12 w-12 text-primary"/>
            <span className="text-lg font-semibold">{t('mods.dropHint')}</span>
          </div>
        </div>)}

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen}/>
      <DevBuildDialog />
      <SetupWizardDialog open={setupOpen} onOpenChange={(o) => {
            setSetupOpen(o);
            if (!o)
                void checkSetup();
        }} env={env}/>
      {deepLinkInstall && (<DeepLinkInstallDialog key={'url' in deepLinkInstall
                ? deepLinkInstall.url
                : `${deepLinkInstall.submissionId}:${deepLinkInstall.fileId ?? ''}`} submissionId={'submissionId' in deepLinkInstall ? deepLinkInstall.submissionId : undefined} fileId={'fileId' in deepLinkInstall ? deepLinkInstall.fileId : undefined} url={'url' in deepLinkInstall ? deepLinkInstall.url : undefined} modType={'modType' in deepLinkInstall ? deepLinkInstall.modType : undefined} modId={'modId' in deepLinkInstall ? deepLinkInstall.modId : undefined} onDone={() => setDeepLinkInstall(null)}/>)}

      {installChoice && (<Dialog open={!!installChoice} onOpenChange={(o) => {
            if (!o && installChoice) {
                void window.api.banana.confirmInstallChoice(installChoice.jobId, false);
                setInstallChoice(null);
            }
        }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('banana.installChoice.title')}</DialogTitle>
            <DialogDescription>{t('banana.installChoice.desc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
                    void window.api.banana.confirmInstallChoice(installChoice.jobId, false);
                    setInstallChoice(null);
                }}>
              {t('banana.installChoice.no')}
            </Button>
            <Button variant="default" onClick={() => {
                    void window.api.banana.confirmInstallChoice(installChoice.jobId, true);
                    setInstallChoice(null);
                }}>
              {t('banana.installChoice.yes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>)}

      
      {splashOn ? <SplashScreen onDone={() => setSplashOn(false)}/> : null}
      <DownloadsPanel />
      <FishSplash />
    </div>
    </div>
    </TooltipProvider>);
}
function NavButton({ active, label, onClick, children, open, disabled, horizontal }: {
    active?: boolean;
    label?: string;
    onClick?: () => void;
    children: React.ReactNode;
    open?: boolean;
    disabled?: boolean;
    horizontal?: boolean;
}): React.JSX.Element {
    if (horizontal) {
        return (<WithTooltip title={label}>
        <Button variant="ghost" size="icon" onClick={onClick} aria-label={label} disabled={disabled} className={cn('flex h-9 items-center gap-2 overflow-hidden rounded-md px-3 transition-colors', 'w-auto justify-start', active && 'bg-primary/15 text-primary')}>
          <span className="inline-flex shrink-0">{children}</span>
          <span className="whitespace-nowrap text-sm">{label}</span>
        </Button>
        </WithTooltip>);
    }
    return (<WithTooltip title={label}>
    <Button variant="ghost" size="icon" onClick={onClick} aria-label={label} disabled={disabled} className={cn('flex h-9 items-center overflow-hidden rounded-md transition-[width,padding,gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]', open ? 'w-full justify-start gap-2 px-2' : 'w-9 justify-center gap-0 px-0', active && 'bg-primary/15 text-primary')}>
      <span className="inline-flex shrink-0">{children}</span>
      <span className={cn('overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]', open ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0')}>
        <span className="block truncate text-sm">{label}</span>
      </span>
    </Button>
    </WithTooltip>);
}
