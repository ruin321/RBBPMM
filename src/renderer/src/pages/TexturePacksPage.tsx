import { useCallback, useEffect, useState } from 'react'
import { Download, FolderOpen, Loader2, Palette, PackageX, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { GameEnvironment, TexturePackDto, TexturePackInstallResult } from '@shared/types'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { RichText } from '@/components/RichText'
import { PageHeader } from '@/components/PageHeader'
import { ReadmeDialog } from '@/components/ReadmeDialog'
import { Progress } from '@/components/ui/progress'

interface Props {
  env: GameEnvironment | null
  
  dropPath?: string | null
  onDropConsumed?: () => void
}

export function TexturePacksPage({ env, dropPath, onDropConsumed }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [packs, setPacks] = useState<TexturePackDto[]>([])
  const [installDir, setInstallDir] = useState('')
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [stage, setStage] = useState<'extracting' | 'installing'>('installing')
  const [readmes, setReadmes] = useState<{ name: string; content: string }[]>([])
  const [readmeDir, setReadmeDir] = useState('')

  
  useEffect(() => window.api.app.onTexturePackProgress((p) => setStage(p.stage)), [])

  const load = useCallback(async (): Promise<void> => {
    if (!env) return
    setLoading(true)
    try {
      const r = await window.api.textures.list()
      if (r.ok && r.value) {
        setPacks(r.value.packs)
        setInstallDir(r.value.installDir)
      }
    } finally {
      setLoading(false)
    }
  }, [env])

  useEffect(() => {
    void load()
  }, [load])

  const installFrom = async (path: string): Promise<void> => {
    setInstalling(true)
    setStage('extracting')
    try {
      const r = await window.api.textures.install(path)
      if (!r.ok) {
        toast.error(t('textures.failInstall'), { description: r.error })
        return
      }
      const result = r.value as TexturePackInstallResult
      const n = result.installed.length
      toast.success(<RichText text={t('textures.installedToast', { n })} />)
      if (result.readmes.length > 0) {
        setReadmes(result.readmes)
        setReadmeDir(result.installDir)
      }
      await load()
    } finally {
      setInstalling(false)
    }
  }

  const pickAndInstall = async (): Promise<void> => {
    if (!env) {
      toast.error(t('mods.notConfigured'))
      return
    }
    const picked = await window.api.ui.pickZip()
    if (!picked.ok || !picked.value) return
    await installFrom(picked.value.path)
  }

  
  useEffect(() => {
    if (!dropPath) return
    if (!env) {
      toast.error(t('mods.notConfigured'))
      onDropConsumed?.()
      return
    }
    void installFrom(dropPath)
    onDropConsumed?.()
    
  }, [dropPath, env])

  const uninstall = async (pack: TexturePackDto): Promise<void> => {
    const r = await window.api.textures.uninstall(pack.folderName)
    if (!r.ok) {
      toast.error(t('textures.failUninstall'), { description: r.error })
      return
    }
    toast.success(<RichText text={t('textures.uninstalledToast', { name: pack.name })} />)
    await load()
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        icon={<Palette className="h-6 w-6" />}
        title={t('textures.title')}
        desc={t('textures.countInstalled', { n: packs.length })}
      >
        <Button onClick={() => void pickAndInstall()} disabled={installing || !env}>
          {installing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {t('textures.install')}
        </Button>
      </PageHeader>

      {!env ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <PackageX className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">{t('mods.notConfigured')}</p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : packs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('textures.emptyTitle')}</CardTitle>
            <CardDescription>{t('textures.emptyDesc')}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {packs.map((p) => (
            <Card key={p.folderName}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <RichText text={p.name} className="truncate font-medium" />
                    {p.version ? <Badge variant="outline">v{p.version}</Badge> : null}
                  </div>
                  {p.author && (
                    <div className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                      <span>{t('textures.author', { author: '' })}</span>
                      <RichText text={p.author} className="inline text-xs text-muted-foreground" />
                    </div>
                  )}
                  {p.description && (
                    <RichText
                      text={p.description}
                      className="line-clamp-2 block text-sm text-muted-foreground"
                    />
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void window.api.ui.openFolder(installDir + '\\' + p.folderName)}
                  >
                    <FolderOpen className="mr-1 h-3.5 w-3.5" />
                    {t('textures.openFolder')}
                  </Button>
                  {p.protected ? (
                    <span
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground"
                      title={t('textures.protected')}
                    >
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      {t('textures.protected')}
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void uninstall(p)}
                      title={t('textures.uninstall')}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {}
      {installing && (
        <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex w-80 flex-col items-center gap-5 rounded-2xl border bg-card p-8 shadow-lg">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium">
              {stage === 'extracting' ? t('textures.installingExtract') : t('textures.installingCopy')}
            </p>
            <Progress indeterminate className="h-1.5 w-full" />
          </div>
        </div>
      )}

      {readmes.length > 0 && (
        <ReadmeDialog
          kind="texture"
          readmes={readmes}
          installDir={readmeDir}
          onOpenChange={(open) => {
            if (!open) setReadmes([])
          }}
        />
      )}
    </div>
  )
}
