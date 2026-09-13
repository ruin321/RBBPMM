import { useEffect, useState } from 'react'
import type React from 'react'
import { FolderOpen, Wrench, ScrollText, Trash2, AlertTriangle, Link2, Package, Settings2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import type { GameEnvironment, ToolboxDirDto } from '@shared/types'
import { useI18n, type MessageKey } from '@/i18n'
import { Button } from '@/components/ui/button'
import { WithTooltip } from '@/components/ui/tooltip'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'

interface Props {
  onSetup: () => void
  env: GameEnvironment | null
}

const DIR_LABEL: Record<string, MessageKey> = {
  root: 'toolbox.dirRoot',
  bepinex: 'toolbox.dirBepinex',
  plugins: 'toolbox.dirPlugins',
  config: 'toolbox.dirConfig',
  modded: 'toolbox.dirModded'
}

const DIR_ICON: Record<string, React.ReactNode> = {
  root: <FolderOpen className="h-4 w-4" />,
  bepinex: <FolderOpen className="h-4 w-4" />,
  plugins: <Package className="h-4 w-4" />,
  config: <Settings2 className="h-4 w-4" />,
  modded: <FolderOpen className="h-4 w-4" />
}

export function ToolboxPage({ onSetup, env }: Props): React.JSX.Element {
  const { t, locale } = useI18n()
  const [dirs, setDirs] = useState<ToolboxDirDto[] | null>(null)
  const [log, setLog] = useState<string | null>(null)
  const [pranking, setPranking] = useState(false)
  const [overlay, setOverlay] = useState<'gibberish' | 'crash' | null>(null)
  const [gibText, setGibText] = useState('')

  useEffect(() => {
    void window.api.toolbox.dirs().then((r) => setDirs(r.ok ? (r.value ?? []) : []))
  }, [])

  const GIB = [
    'Ã', 'ƒ', 'Â', '€', '„', '¤', '¥', '¦', '§', '¨', '©', 'ª', '«', '¬', '®', '¯',
    '°', '±', '²', '³', 'µ', '¶', '·', 'ð', 'ø', 'þ', 'ÿ', '©', '±', '¹', '¼', '½'
  ]
  const gib = (n: number): string => {
    let s = ''
    for (let i = 0; i < n; i++) s += GIB[Math.floor(Math.random() * GIB.length)]
    return s
  }

  const flash = (cls: string, ms: number): void => {
    document.documentElement.classList.remove(cls)
    void document.documentElement.offsetWidth
    document.documentElement.classList.add(cls)
    window.setTimeout(() => document.documentElement.classList.remove(cls), ms)
  }

  const rampage = (): void => {
    const lines = [
      gib(16),
      t('toolbox.prankToast'),
      `(ﾉﾟ∀ﾟ)ﾉ ${gib(8)} ヽ(ﾟ∀ﾟヽ)`,
      gib(22),
      'SYSTEM IS FINE. TRUST ME (´∀`)',
      gib(28)
    ]
    lines.forEach((ln, i) => window.setTimeout(() => toast(ln), i * 240))
  }

  const gibStorm = (): void => {
    const rows = 46
    const cols = 132
    const pieces: string[] = []
    for (let r = 0; r < rows; r++) pieces.push(gib(cols))
    setGibText(pieces.join('\n'))
    setOverlay('gibberish')
    window.setTimeout(() => setOverlay(null), 1800)
  }

  const fakeCrash = (): void => setOverlay('crash')

  const soulSwitch = (): void => {
    flash('prank-invert', 260)
    window.setTimeout(() => flash('prank-rotate', 300), 320)
    window.setTimeout(() => flash('prank-flip', 300), 700)
    window.setTimeout(() => flash('prank-invert', 260), 1080)
    window.setTimeout(() => {
      document.documentElement.classList.add('prank-wobble')
      window.setTimeout(() => document.documentElement.classList.remove('prank-wobble'), 2900)
    }, 1400)
  }

  const prankEffect = (): void => {
    if (pranking) return
    setPranking(true)
    const effects: Array<() => void> = [
      () => {
        void window.api.window.jiggle()
        flash('prank-redflash', 900)
      },
      () => {
        void window.api.window.skew()
        flash('prank-jelly', 1300)
      },
      () => {
        void window.api.window.prankSize()
        flash('prank-wobble', 700)
      },
      gibStorm,
      fakeCrash,
      rampage,
      soulSwitch,
      () => flash('prank-rainbow', 1600)
    ]
    effects[Math.floor(Math.random() * effects.length)]()
    if (Math.random() < 0.35) {
      window.setTimeout(() => {
        const bonus: Array<() => void> = [
          () => flash('prank-flip', 320),
          () => void window.api.window.jiggle(),
          () => toast(gib(14)),
          () => flash('prank-invert', 260),
          () => toast('(・∀・)')
        ]
        bonus[Math.floor(Math.random() * bonus.length)]()
      }, 700)
    }
    window.setTimeout(() => setPranking(false), 3200)
  }

  const openUrlEasterEgg = (): void => {
    const isZh = locale.startsWith('zh')
    void window.api.ui.openExternal(
      isZh
        ? 'https://www.bilibili.com/video/BV1GJ411x7h7'
        : 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    )
  }

  const readLog = async (): Promise<void> => {
    const r = await window.api.toolbox.readLog()
    if (!r.ok) {
      toast.error(t('toolbox.logFail'), { description: r.error })
      return
    }
    setLog(r.value?.text ?? '')
  }

  const cleanup = async (): Promise<void> => {
    const r = await window.api.toolbox.cleanup()
    if (!r.ok) {
      toast.error(t('toolbox.cleanupFail'), { description: r.error })
      return
    }
    const n = r.value?.removed ?? 0
    if (n === 0) toast.info(t('toolbox.cleanupNone'))
    else toast.success(t('toolbox.cleanupDone', { n: String(n) }))
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        icon={<Wrench className="h-6 w-6" />}
        title={t('toolbox.title')}
        desc={t('toolbox.desc')}
      />

      {dirs !== null && (
        <Card>
          <CardHeader>
            <CardTitle>{t('toolbox.dirsHeader')}</CardTitle>
            <CardDescription>{t('toolbox.dirsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {dirs.map((d) => (
              <Button
                key={d.key}
                variant="outline"
                onClick={() => void window.api.toolbox.openDir(d.path)}
              >
                {DIR_ICON[d.key] ?? <FolderOpen className="h-4 w-4" />}
                {t(DIR_LABEL[d.key] ?? 'toolbox.dirOther')}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('toolbox.setupHeader')}</CardTitle>
          <CardDescription>{t('toolbox.setupDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={onSetup} disabled={env === null}>
            <Wand2 className="mr-2 h-4 w-4" />
            {t('settings.setup')}
          </Button>
          {env === null && (
            <p className="mt-2 text-xs text-muted-foreground">{t('toolbox.setupNoGame')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('toolbox.logsHeader')}</CardTitle>
          <CardDescription>{t('toolbox.logsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={() => void readLog()}>
            <ScrollText className="mr-2 h-4 w-4" />
            {t('toolbox.readLog')}
          </Button>
          {log !== null && (
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
              {log.length > 0 ? log : t('toolbox.logEmpty')}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('toolbox.cleanupHeader')}</CardTitle>
          <CardDescription>{t('toolbox.cleanupDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={() => void cleanup()}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('toolbox.cleanup')}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">{t('toolbox.easterHeader')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <WithTooltip title={t('toolbox.easterDoNot')}>
            <Button
              variant="destructive"
              onClick={() => prankEffect()}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              {t('toolbox.easterDoNot')}
            </Button>
          </WithTooltip>
          <Button variant="outline" onClick={() => openUrlEasterEgg()}>
            <Link2 className="mr-2 h-4 w-4" />
            {t('toolbox.easterUrl')}
          </Button>
        </CardContent>
      </Card>

      {overlay === 'gibberish' && (
        <div
          className="prank-veil fixed inset-0 z-50 cursor-pointer overflow-hidden"
          onClick={() => setOverlay(null)}
        >
          <pre className="pointer-events-none select-none break-all whitespace-pre-wrap p-2 text-[10px] leading-tight prank-gib-text">
            {gibText}
          </pre>
        </div>
      )}

      {overlay === 'crash' && (
        <div
          className="fixed inset-0 z-50 cursor-pointer bg-[#083bf5] px-10 py-8 text-white"
          onClick={() => setOverlay(null)}
        >
          <div className="font-mono text-sm leading-relaxed" style={{ maxWidth: 680 }}>
            <div className="flex items-center gap-3">
              <span className="text-[3rem] font-bold">:{`(`}</span>
              <span className="text-[3rem] font-bold">{gib(4)}</span>
            </div>
            <p className="mt-4 text-base">You just got pranked. Your app was never in danger.</p>
            <p className="mt-1 opacity-90">Yes, the whole point was this exact moment.</p>
            <div className="mt-6 rounded bg-black/30 p-3 text-xs opacity-90 whitespace-pre-wrap">
              {gib(300)}
            </div>
            <p className="mt-6 text-xs opacity-70">
              collecting error data... DO NOT PANIC (;_;) ... just kidding. Click to go back.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}