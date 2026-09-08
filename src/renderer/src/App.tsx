import { useEffect, useState } from 'react'
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
  PanelLeftOpen
} from 'lucide-react'
import { Toaster } from 'sonner'
import { useGame } from '@/hooks/useGame'
import { useTheme } from '@/hooks/useTheme'
import { useFont } from '@/hooks/useFont'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { ModsPage } from '@/pages/ModsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { BananaPage } from '@/pages/BananaPage'
import { ConfigsPage } from '@/pages/ConfigsPage'
import { TexturePacksPage } from '@/pages/TexturePacksPage'
import { AboutDialog } from '@/components/AboutDialog'
import { SplashScreen } from '@/components/SplashScreen'
import { cn } from '@/lib/utils'

type Page = 'mods' | 'browse' | 'textures' | 'settings' | 'config'


interface ConfigRequest {
  cfgPath?: string
  search?: string
}


const ARCHIVE_EXT = /\.(zip|rar|7z|tar|gz|bz2|xz|tgz|jar|bbmod|gmp)$/i

export function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('mods')
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
    <div
      className="relative flex h-full select-none overflow-hidden"
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
          'flex flex-col gap-1 border-r bg-muted/40 py-4 transition-[width] duration-200 ease-out ' +
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
        {page === 'mods' ? (
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
          <BananaPage onInstalled={(isTexture) => setPage(isTexture ? 'textures' : 'mods')} />
        ) : page === 'textures' ? (
          <TexturePacksPage
            env={env}
            dropPath={textureDropPath}
            onDropConsumed={() => setTextureDropPath(null)}
          />
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

      {}
      {splashOn ? <SplashScreen onDone={() => setSplashOn(false)} /> : null}
    </div>
  )
}

function NavButton({
  active,
  label,
  onClick,
  children,
  open
}: {
  active?: boolean
  label?: string
  onClick?: () => void
  children: React.ReactNode
  open?: boolean
}): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'h-9 overflow-hidden transition-all duration-200 ease-out',
        open ? 'w-full justify-start gap-2 px-2' : 'w-9 justify-center',
        active && 'bg-primary/15 text-primary'
      )}
    >
      <span className="inline-flex shrink-0">{children}</span>
      <span
        className={cn(
          'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-out',
          open ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0'
        )}
      >
        <span className="block truncate text-sm">{label}</span>
      </span>
    </Button>
  )
}