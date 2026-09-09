import { useCallback, useEffect, useState } from 'react'
import type React from 'react'
import {
  Package,
  Moon,
  Sun,
  Settings,
  Store,
  Info,
  FileArchive,
  SlidersHorizontal,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Home,
  Wrench,
  PackageX,
  Wand2,
  Loader2
} from 'lucide-react'
import { Toaster } from 'sonner'
import { useGame } from '@/hooks/useGame'
import { useTheme } from '@/hooks/useTheme'
import { useFont } from '@/hooks/useFont'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { HomePage } from '@/pages/HomePage'
import { ModsPage } from '@/pages/ModsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { BananaPage } from '@/pages/BananaPage'
import { ConfigsPage } from '@/pages/ConfigsPage'
import { TexturePacksPage } from '@/pages/TexturePacksPage'
import { ToolboxPage } from '@/pages/ToolboxPage'
import { AboutDialog } from '@/components/AboutDialog'
import { SplashScreen } from '@/components/SplashScreen'
import { TitleBar } from '@/components/TitleBar'
import { FishSplash } from '@/components/FishSplash'
import { SetupWizardDialog } from '@/components/SetupWizardDialog'
import { cn } from '@/lib/utils'

type Page = 'home' | 'mods' | 'browse' | 'textures' | 'settings' | 'config' | 'toolbox'


interface ConfigRequest {
  cfgPath?: string
  search?: string
}


const ARCHIVE_EXT = /\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar|bbmod|gmp)$/i

export function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('home')
  const [splashOn, setSplashOn] = useState<boolean | null>(null)
  const { isDark, toggle, themeId, setThemeId } = useTheme()
  const { env, loading, select, launch, launchSteam, running, stop } = useGame()
  const { font, fonts, setFont } = useFont()
  const { t } = useI18n()
  const [aboutOpen, setAboutOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dropPath, setDropPath] = useState<string | null>(null)
  const [textureDropPath, setTextureDropPath] = useState<string | null>(null)
  const [navOpen, setNavOpen] = useState(true)
  const [cfgRequest, setCfgRequest] = useState<ConfigRequest | null>(null)
  const [deepLinkId, setDeepLinkId] = useState<number | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [bepReady, setBepReady] = useState<boolean | null>(null)

  const checkSetup = useCallback(async (): Promise<void> => {
    const r = await window.api.setup.status()
    if (r.ok) setBepReady(r.value?.hasBepInEx ?? false)
  }, [])

  const requestSetupIfNeeded = useCallback(async (): Promise<void> => {
    const r = await window.api.setup.status()
    if (r.ok) {
      setBepReady(r.value?.hasBepInEx ?? false)
      if (r.value && !r.value.hasBepInEx) setSetupOpen(true)
    }
  }, [])

  
  const [navPrefLoaded, setNavPrefLoaded] = useState(false)
  if (!navPrefLoaded) {
    void window.api.app.getNavOpen().then((v) => {
      setNavOpen(v)
      setNavPrefLoaded(true)
    })
  }
  const toggleNav = (): void => {
    setNavOpen((o) => {
      void window.api.app.setNavOpen(!o)
      return !o
    })
  }

  
  if (splashOn === null) {
    void window.api.app.getSplash().then((v) => setSplashOn(v))
  }

  
  useEffect(() => {
    const onFocus = (): void => document.documentElement.classList.remove('window-inactive')
    const onBlur = (): void => document.documentElement.classList.add('window-inactive')
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    const applyMax = (m: boolean): void => {
      document.documentElement.classList.toggle('self-maximized', m)
    }
    void window.api.window.isMaximized().then(applyMax)
    return window.api.window.onMaximizedChanged(applyMax)
  }, [])

  useEffect(() => {
    return window.api.app.onOpenUrl((payload) => {
      if (payload.action === 'install' && payload.id) {
        setDeepLinkId(payload.id)
        setPage('browse')
      }
    })
  }, [])

  useEffect(() => {
    void checkSetup()
  }, [checkSetup])

  useEffect(() => {
    if (page === 'browse') void checkSetup()
  }, [page, checkSetup])

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    const file = Array.from(e.dataTransfer.files).find((f) => ARCHIVE_EXT.test(f.name))
    if (file) {
      const path = (file as File & { path?: string }).path
      if (path) {
        
        void window.api.textures.probe(path).then((r) => {
          
          if (r.ok && r.value) {
            setTextureDropPath(path)
            setPage('textures')
          } else {
            setDropPath(path)
            setPage('mods')
          }
        })
      }
    }
  }

  return (
    <div className="app-root flex h-full flex-col overflow-hidden">
      <TitleBar />
      <div
        className="relative flex flex-1 select-none overflow-hidden"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
      <Toaster theme={isDark ? 'dark' : 'light'} position="bottom-right" />
      {}
      <aside
        className={
          'flex flex-col gap-1 overflow-hidden border-r bg-muted/40 py-4 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width] ' +
          (navOpen ? 'w-48' : 'w-16')
        }
      >
        <div className={navOpen ? 'flex items-center justify-between gap-1 px-3' : 'flex flex-col items-center gap-2'}>
          <Package className={'shrink-0 text-primary transition-transform duration-200 ' + (navOpen ? 'h-7 w-7' : 'h-6 w-6')} />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleNav}
            title={navOpen ? t('nav.collapse') : t('nav.expand')}
            className="h-9 w-9 shrink-0"
          >
            <span className="transition-transform duration-200 ease-out">
              {navOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
            </span>
          </Button>
        </div>

        <div className={navOpen ? 'mt-2 space-y-1' : 'mt-2 flex flex-col items-center gap-1'}>
          <NavButton active={page === 'home'} onClick={() => setPage('home')} label={t('nav.home')} open={navOpen}>
            <Home className="h-5 w-5" />
          </NavButton>
          <NavButton active={page === 'mods'} onClick={() => setPage('mods')} label={t('nav.mods')} open={navOpen}>
            <Package className="h-5 w-5" />
          </NavButton>
          <NavButton active={page === 'browse'} onClick={() => setPage('browse')} label={t('nav.browse')} open={navOpen}>
            <Store className="h-5 w-5" />
          </NavButton>
          <NavButton active={page === 'textures'} onClick={() => setPage('textures')} label={t('nav.textures')} open={navOpen}>
            <Palette className="h-5 w-5" />
          </NavButton>
          <NavButton active={page === 'config'} onClick={() => setPage('config')} label={t('nav.config')} open={navOpen}>
            <SlidersHorizontal className="h-5 w-5" />
          </NavButton>
          <NavButton active={page === 'settings'} onClick={() => setPage('settings')} label={t('nav.settings')} open={navOpen}>
            <Settings className="h-5 w-5" />
          </NavButton>
          <NavButton active={page === 'toolbox'} onClick={() => setPage('toolbox')} label={t('nav.toolbox')} open={navOpen}>
            <Wrench className="h-5 w-5" />
          </NavButton>
        </div>

        <div className="flex-1" />
        <div className={navOpen ? 'space-y-1' : 'flex flex-col items-center gap-1'}>
          <NavButton onClick={toggle} label={isDark ? t('nav.light') : t('nav.dark')} open={navOpen}>
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </NavButton>
          <NavButton onClick={() => setAboutOpen(true)} label={t('nav.about')} open={navOpen}>
            <Info className="h-5 w-5" />
          </NavButton>
        </div>
      </aside>

      {}
      <main className="flex-1 overflow-y-auto p-8">
        {page === 'home' ? (
          <HomePage
            env={env}
            running={running}
            onLaunch={launch}
            onLaunchSteam={launchSteam}
            onStop={stop}
            onSelectDir={async () => {
              const ok = await select()
              if (ok) {
                setPage('mods')
                void requestSetupIfNeeded()
              }
              return ok
            }}
            onNavigate={setPage}
          />
        ) : page === 'mods' ? (
          <ModsPage
            env={env}
            onLaunch={launch}
            onLaunchSteam={launchSteam}
            running={running}
            onStop={stop}
            dropPath={dropPath}
            onDropConsumed={() => setDropPath(null)}
            onEditConfig={(configFile, search) => {
              setCfgRequest(configFile ? { cfgPath: configFile } : { search })
              setPage('config')
            }}
          />
        ) : page === 'browse' ? (
          bepReady === null ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : bepReady === false ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <PackageX className="h-12 w-12 text-muted-foreground" />
              <div className="max-w-md space-y-2">
                <h2 className="text-xl font-semibold">{t('banana.notReadyTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('banana.notReadyDesc')}</p>
              </div>
              <Button onClick={() => setSetupOpen(true)}>
                <Wand2 className="mr-1 h-4 w-4" />
                {t('banana.notReadyInstall')}
              </Button>
            </div>
          ) : (
            <BananaPage
              onInstalled={() => {
                
              }}
              initialSubmissionId={deepLinkId}
              onInitialConsumed={() => setDeepLinkId(null)}
            />
          )
        ) : page === 'textures' ? (
          <TexturePacksPage
            env={env}
            dropPath={textureDropPath}
            onDropConsumed={() => setTextureDropPath(null)}
          />
        ) : page === 'toolbox' ? (
          <ToolboxPage onSetup={() => setSetupOpen(true)} env={env} />
        ) : page === 'config' ? (
          <ConfigsPage
            externalCfgPath={cfgRequest?.cfgPath}
            externalSearch={cfgRequest?.search}
            onExternalConsumed={() => setCfgRequest(null)}
          />
        ) : (
          <SettingsPage
            env={env}
            loading={loading}
            onSelect={select}
            font={font}
            fonts={fonts}
            onSelectFont={setFont}
            themeId={themeId}
            onSelectTheme={setThemeId}
            onSetup={() => setSetupOpen(true)}
          />
        )}
      </main>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-card/80 px-12 py-10">
            <FileArchive className="h-12 w-12 text-primary" />
            <span className="text-lg font-semibold">{t('mods.dropHint')}</span>
          </div>
        </div>
      )}

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <SetupWizardDialog
        open={setupOpen}
        onOpenChange={(o) => {
          setSetupOpen(o)
          if (!o) void checkSetup()
        }}
        env={env}
      />

      {}
      {splashOn ? <SplashScreen onDone={() => setSplashOn(false)} /> : null}
      <FishSplash />
    </div>
    </div>
  )
}

function NavButton({
  active,
  label,
  onClick,
  children,
  open,
  disabled
}: {
  active?: boolean
  label?: string
  onClick?: () => void
  children: React.ReactNode
  open?: boolean
  disabled?: boolean
}): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'h-9 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        open ? 'w-full justify-start gap-2 px-2' : 'w-9 justify-center gap-0',
        active && 'bg-primary/15 text-primary'
      )}
    >
      <span className="inline-flex shrink-0">{children}</span>
      <span
        className={cn(
          'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          open ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0'
        )}
      >
        <span className="block truncate text-sm">{label}</span>
      </span>
    </Button>
  )
}