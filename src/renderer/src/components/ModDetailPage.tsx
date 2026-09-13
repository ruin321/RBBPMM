import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  Download,
  ExternalLink,
  Eye,
  Files,
  Gift,
  History,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Package
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  GamebananaCommentDto,
  GamebananaCommentsDto,
  GamebananaFileDto,
  GamebananaRequirementDto,
  GamebananaSubmissionDto,
  GamebananaUpdatesDto,
  InstallProgress,
  ReadmeFileDto
} from '@shared/types'
import { TEXTURE_PACK_CATEGORY_ID } from '@shared/types'
import { useI18n } from '@/i18n'
import fishGif from '@/assets/fish.gif'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RichText } from '@/components/RichText'
import { ReadmeDialog } from '@/components/ReadmeDialog'
import { AsciiScrollbar } from '@/components/AsciiScrollbar'
import { BaldiChase } from '@/components/BaldiChase'
import { MagneticCursor } from '@/components/MagneticCursor'
import { GlitchPage } from '@/components/GlitchPage'
import { RunawayButtons } from '@/components/RunawayButtons'
import { MilkPage } from '@/components/MilkPage'
import { JumpScare } from '@/components/JumpScare'

const FISH_SUBMISSION_ID = 713948

  
const RETRO_SUBMISSION_ID = 716127

  
const BALDI_SUBMISSION_ID = 694067


const CURSOR_SUBMISSION_ID = 710488

const MAGNET_SUBMISSION_ID = 715561

const GLITCH_SUBMISSION_ID = 713697

const FLEE_SUBMISSION_ID = 714303

const MILK_SUBMISSION_ID = 708588

const JUMPSCARE_SUBMISSION_ID = 703263

interface Props {
  submissionId: number
  fallback: GamebananaSubmissionDto
  onBack: () => void
  onInstalled?: (isTexturePack: boolean) => void
  
  onOpenSubmission?: (id: number) => void
  
  historyDepth: number
  
  level: number
  
  onBackLevel: (level: number) => void
  
  scrollOnSubmit?: boolean
  
  onContentReady?: () => void
}


function stripHtml(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<div id="__gb">${html}</div>`, 'text/html')
  const node = doc.getElementById('__gb')
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
}


function commentText(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<div id="__cm">${html}</div>`, 'text/html')
  const node = doc.getElementById('__cm')
  if (!node) return ''
  node.querySelectorAll('br').forEach((b) => b.replaceWith('\n'))
  node.querySelectorAll('p, div, li, tr, blockquote').forEach((el) => el.append('\n'))
  return (node.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function fmtSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function fmtCount(n?: number): string {
  if (n === undefined || n === null) return '–'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function fmtDate(ts?: number): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString()
}


function isInstalled(status?: string): boolean {
  if (!status) return false
  return /installed|up to date|ok|卸?载?/i.test(status)

}


function CommentItem({ comment }: { comment: GamebananaCommentDto }): React.JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [replies, setReplies] = useState<GamebananaCommentDto[]>([])

  const replyCount = comment.replyCount ?? 0

  const toggle = (): void => {
    if (!open && replies.length === 0 && replyCount > 0) {
      setLoading(true)
      void window.api.banana.getPostReplies(comment.id).then((r) => {
        setReplies(r.ok ? (r.value ?? []) : [])
        setLoading(false)
        setOpen(true)
      })
    } else {
      setOpen(!open)
    }
  }

  return (
    <div className="min-w-0 break-words rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate font-medium text-foreground">{comment.author}</span>
        {comment.date && <span className="shrink-0">{comment.date}</span>}
      </div>
      <p className="mt-1 whitespace-pre-line break-words text-sm">{commentText(comment.body)}</p>
      {replyCount > 0 && (
        <button
          type="button"
          onClick={toggle}
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CornerDownRight className="h-3 w-3" />
          )}
          {loading ? t('detail.loadingReplies') : t('detail.replies', { n: replyCount })}
        </button>
      )}
      {open && (
        <div className="mt-2 space-y-2 border-l pl-3">
          {replies.map((r) => (
            <CommentItem key={r.id} comment={r} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ModDetailPage({
  submissionId,
  fallback,
  onBack,
  onInstalled,
  onOpenSubmission,
  historyDepth,
  level,
  onBackLevel,
  scrollOnSubmit = true,
  onContentReady
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const [sub, setSub] = useState<GamebananaSubmissionDto | null>(null)
  const [comments, setComments] = useState<GamebananaCommentsDto | null>(null)
  const [updates, setUpdates] = useState<GamebananaUpdatesDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [imgIndex, setImgIndex] = useState(0)
  
  const [activeFileId, setActiveFileId] = useState<number | undefined>(undefined)
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  
  const [readmes, setReadmes] = useState<ReadmeFileDto[]>([])
  const { setLocale } = useI18n()

  const isFishPage = submissionId === FISH_SUBMISSION_ID
  const isRetroPage = submissionId === RETRO_SUBMISSION_ID
  const isBaldiPage = submissionId === BALDI_SUBMISSION_ID
  const isCursorPage = submissionId === CURSOR_SUBMISSION_ID
  const isMagnetPage = submissionId === MAGNET_SUBMISSION_ID
  const isGlitchPage = submissionId === GLITCH_SUBMISSION_ID
  const isFleePage = submissionId === FLEE_SUBMISSION_ID
  const isMilkPage = submissionId === MILK_SUBMISSION_ID
  const isJumpscarePage = submissionId === JUMPSCARE_SUBMISSION_ID

  const installingRef = useRef(false)
  installingRef.current = activeFileId !== undefined

  useEffect(() => {
    let active = true
    setLoading(true)
    setSub(null)
    setComments(null)
    setUpdates(null)
    setImgIndex(0)
    setProgress(null)

    void window.api.banana.get(submissionId).then((r) => {
      if (!active) return
      setLoading(false)
      if (r.ok && r.value) setSub(r.value)
      
      onContentReady?.()
    })
    void window.api.banana.getComments(submissionId).then((r) => {
      if (!active) return
      setComments(r.ok && r.value ? r.value : { total: 0, items: [] })
    })
    void window.api.banana.getUpdates(submissionId).then((r) => {
      if (!active) return
      setUpdates(r.ok && r.value ? r.value : { total: 0, items: [] })
    })
    const off = window.api.app.onInstallProgress((p) => {
      if (installingRef.current) setProgress(p)
    })
    return () => {
      active = false
      off()
    }
    
  }, [submissionId])

  useEffect(() => {
    setImgIndex(0)
  }, [sub])

  
  
  const prevIdRef = useRef<number | null>(null)
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto')
    if (prevIdRef.current !== submissionId) {
      prevIdRef.current = submissionId
      if (scrollOnSubmit) scroller?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
    
  }, [submissionId])

  const display = sub ?? fallback
  const files: GamebananaFileDto[] = sub?.files ?? []
  const visibleFiles = files.filter((f) => f.id > 0)
  const archivedFiles: GamebananaFileDto[] = sub?.archivedFiles ?? []
  const requirements: GamebananaRequirementDto[] = sub?.requirements ?? []
  const images = sub?.images?.length ? sub.images : fallback.thumbnailUrl ? [fallback.thumbnailUrl] : []
  const hero = images[imgIndex] ?? sub?.thumbnailUrl ?? fallback.thumbnailUrl
  const installing = activeFileId !== undefined
  const totalFiles = visibleFiles.length + archivedFiles.filter((f) => f.id > 0).length

  const install = async (fileId?: number): Promise<void> => {
    if (installing) {
      toast.error(t('detail.busy'))
      return
    }
    setActiveFileId(fileId ?? visibleFiles[0]?.id ?? files[0]?.id)
    setProgress(null)
    try {
      const r = await window.api.banana.install(submissionId, fileId)
      if (r.ok) {
        toast.success(t('banana.installedToast', { name: display.name }))
        onInstalled?.(display.categoryId === TEXTURE_PACK_CATEGORY_ID)
        
        const readmeList = r.value?.readmes ?? []
        if (readmeList.length > 0) setReadmes(readmeList)
      } else {
        toast.error(r.error || t('banana.failInstall'))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setActiveFileId(undefined)
      setProgress(null)
    }
  }

  
  const openRequirement = (req: GamebananaRequirementDto): void => {
    if (req.gamebananaId && onOpenSubmission) {
      onOpenSubmission(req.gamebananaId)
    } else if (req.url) {
      window.open(req.url, '_blank', 'noreferrer')
    }
  }

  return (
    <div
      className={[
        'space-y-6',
        isRetroPage ? 'retro-page' : '',
        // 这个类只是一枚挂点：真正的 cursor 规则写在 globals.css 的 main:has(.cursor-710488) 上
        isCursorPage ? 'cursor-710488' : '',
        // 同上，挂点而已：cursor:none 规则写在 globals.css 的 main:has(.magnet-715561) 上
        isMagnetPage ? 'magnet-715561' : '',
        // 挂点：GlitchPage 拿它找活动范围
        isGlitchPage ? 'glitch-713697' : '',
        // 挂点：RunawayButtons 拿它找活动范围（按钮逃跑）
        isFleePage ? 'flee-714303' : '',
        // 挂点：MilkPage 拿它翻转整页 + 找活动范围（牛奶）
        isMilkPage ? 'milk-708588' : '',
        // 挂点：JumpScare 找活动范围（突脸）
        isJumpscarePage ? 'scare-703263' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {}
      <header className="sticky top-0 z-20 flex items-center gap-2 rounded-lg border bg-background/90 px-2 py-1.5 backdrop-blur">
        {historyDepth > 1 && level >= 1 && (
          <button
            type="button"
            onClick={() => onBackLevel(level - 1)}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-border hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('detail.backUp')}
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-border hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('detail.back')}
        </button>
        <span className="truncate pl-1 text-xs text-muted-foreground">
          {display.name}
        </span>
      </header>

      {}
      <div className="relative overflow-hidden rounded-lg border bg-muted">
        {hero ? (
          <img
            src={hero}
            alt={display.name}
            className="h-56 w-full object-cover sm:h-72"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="flex h-56 w-full items-center justify-center text-muted-foreground">
            <Package className="h-12 w-12" />
          </div>
        )}
      </div>

      {}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-words text-2xl font-bold leading-tight">
            <RichText text={display.name} />
          </h1>
          {display.version && <Badge variant="secondary">v{display.version}</Badge>}
          {Number.isFinite(display.id) && display.id > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(`https://gamebanana.com/mods/${display.id}`, '_blank', 'noreferrer')
              }
            >
              <ExternalLink className="h-4 w-4" />
              {t('detail.browse')}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Files className="h-3.5 w-3.5" />
            {t('banana.by')} {display.authorName || t('banana.unknown')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {fmtCount(display.viewCount)} {t('detail.views')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Download className="h-3.5 w-3.5" />
            {fmtCount(display.downloadCount)} {t('detail.downloads')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Package className="h-3.5 w-3.5" />
            {totalFiles} {t('detail.files')}
          </span>
        </div>
      </div>

      {loading && !sub ? (
        <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('detail.loading')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {}
          <div className="space-y-6 lg:col-span-2">
            {}
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Download className="h-4 w-4 text-primary" />
                {t('detail.files')}
              </h2>
              {visibleFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('detail.noVersions')}</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {visibleFiles.map((f) => {
                    const running = activeFileId === f.id || (visibleFiles.length === 1 && installing)
                    return (
                      <li key={f.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 truncate text-sm font-medium">
                            <span className="truncate">{f.fileName}</span>
                            {f.version && (
                              <Badge variant="outline" className="shrink-0">
                                {f.version}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {f.fileSize ? <span className="shrink-0">{fmtSize(f.fileSize)}</span> : null}
                            {f.description ? (
                              <span
                                className="line-clamp-2"
                                title={stripHtml(f.description)}
                              >
                                {stripHtml(f.description)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          disabled={installing}
                          onClick={() => void install(f.id)}
                          className="shrink-0"
                        >
                          {running ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="mr-1 h-3.5 w-3.5" />
                          )}
                          {running && progress?.stage === 'downloading'
                            ? `${t('banana.downloading')}${typeof progress.percent === 'number' ? ` ${progress.percent}%` : ''}`
                            : running
                              ? t('banana.installing')
                              : t('detail.install')}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {archivedFiles.length > 0 && (
              <section className="space-y-2">
                <details className="group rounded-lg border">
                  <summary className="flex cursor-pointer items-center gap-2 p-3 text-sm font-medium">
                    {t('detail.archivedFiles')}
                    <span className="text-xs text-muted-foreground">({archivedFiles.length})</span>
                  </summary>
                  <ul className="divide-y border-t">
                    {archivedFiles.map((f) => {
                      const running = activeFileId === f.id
                      return (
                        <li key={f.id} className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 truncate text-sm font-medium">
                              <span className="truncate">{f.fileName}</span>
                              {f.version && (
                                <Badge variant="outline" className="shrink-0">
                                  {f.version}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {f.fileSize ? <span className="shrink-0">{fmtSize(f.fileSize)}</span> : null}
                              {f.dateAdded ? (
                                <span className="shrink-0">
                                  {new Date(f.dateAdded * 1000).toLocaleDateString()}
                                </span>
                              ) : null}
                              {f.description ? (
                                <span className="line-clamp-2" title={stripHtml(f.description)}>
                                  {stripHtml(f.description)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={installing}
                            onClick={() => void install(f.id)}
                            className="shrink-0"
                          >
                            {running ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="mr-1 h-3.5 w-3.5" />
                            )}
                            {t('detail.install')}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              </section>
            )}

            {requirements.length > 0 && (
              <section className="space-y-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Gift className="h-4 w-4 text-primary" />
                  {t('detail.requirements')}
                </h2>
                <ul className="divide-y rounded-lg border">
                  {requirements.map((req, i) => {
                    const installed = isInstalled(req.status)
                    return (
                      <li key={i} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{req.name}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {req.required && (
                              <span className="text-destructive">{t('detail.prereqRequired')}</span>
                            )}
                            <span className={installed ? 'text-emerald-500' : 'text-muted-foreground'}>
                              {installed
                                ? t('detail.prereqInstalled')
                                : req.gamebananaId
                                  ? t('detail.prereqMissing')
                                  : ''}
                            </span>
                          </div>
                        </div>
                        {req.gamebananaId && onOpenSubmission ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openRequirement(req)}
                            className="shrink-0"
                          >
                            <Files className="mr-1 h-3.5 w-3.5" />
                            {t('detail.openInApp')}
                          </Button>
                        ) : (
                          req.url && (
                            <a
                              href={req.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {t('detail.openPage')}
                            </a>
                          )
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {sub?.alternateFileSources && sub.alternateFileSources.length > 0 && (
              <section className="space-y-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <ExternalLink className="h-4 w-4 text-primary" />
                  {t('detail.alternateSources')}
                </h2>
                <ul className="divide-y rounded-lg border">
                  {sub.alternateFileSources.map((src, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {src.description || src.host || src.url}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {src.host ? `(${src.host})` : ''}
                        </div>
                      </div>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t('detail.openPage')}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <ImageIcon className="h-4 w-4 text-primary" />
                {t('detail.description')}
              </h2>
              <div className="min-w-0 break-words text-sm leading-relaxed text-muted-foreground">
                {sub?.description ? (
                  <RichText text={sub.description} />
                ) : (
                  t('detail.noDescription')
                )}
              </div>
            </section>

            {updates !== null && updates.items.length > 0 && (
              <section className="space-y-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <History className="h-4 w-4 text-primary" />
                  {t('detail.updates')} ({updates.total})
                </h2>
                <ul className="divide-y rounded-lg border">
                  {updates.items.map((u, idx) => (
                    <li key={u.id}>
                      {/* 只有最新一条默认展开，其余折叠（open 是首帧值，用户手动展开后 React 不会回弹） */}
                      <details className="group" open={idx === 0}>
                        <summary className="flex min-w-0 cursor-pointer list-none flex-wrap items-center gap-2 p-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                          {}
                          <span className="min-w-0 break-words">
                            {u.title || t('detail.untitledUpdate')}
                          </span>
                          {u.version && <Badge variant="outline">{u.version}</Badge>}
                          {u.dateAdded ? (
                            <span className="text-xs font-normal text-muted-foreground">
                              {fmtDate(u.dateAdded)}
                            </span>
                          ) : null}
                        </summary>
                        <div className="min-w-0 space-y-2 border-t p-3">
                          {u.changeLog.length > 0 && (
                            <ul className="space-y-1">
                              {u.changeLog.map((c, i) => (
                                <li key={i} className="flex min-w-0 items-start gap-2 text-xs">
                                  {c.category ? (
                                    <span className="shrink-0 rounded border px-1 text-[10px] uppercase leading-5 text-muted-foreground">
                                      {c.category}
                                    </span>
                                  ) : null}
                                  {}
                                  <span className="min-w-0 flex-1 break-words leading-5 text-muted-foreground">
                                    {c.text}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {u.body && (
                            <div className="min-w-0 break-words text-sm leading-relaxed text-muted-foreground">
                              <RichText text={u.body} />
                            </div>
                          )}
                          {u.fileNames.length > 0 && (
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              {u.fileNames.map((n) => (
                                <span
                                  key={n}
                                  className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-muted-foreground"
                                >
                                  <Package className="h-3 w-3 shrink-0" />
                                  {}
                                  <span className="min-w-0 break-all">{n}</span>
                                </span>
                              ))}
                            </div>
                          )}
                          {u.url && (
                            <button
                              type="button"
                              onClick={() => window.open(u.url, '_blank', 'noreferrer')}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {t('detail.openPage')}
                            </button>
                          )}
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <MessageSquare className="h-4 w-4 text-primary" />
                {t('detail.comments')} ({comments === null ? '…' : comments.total})
              </h2>
              {comments === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('detail.loadingComments')}
                </div>
              ) : comments.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('detail.noComments')}</p>
              ) : (
                <div className="space-y-3">
                  {comments.items.map((c) => (
                    <CommentItem key={c.id} comment={c} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {images.length > 0 && (
            <aside className="space-y-3">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
                <img
                  src={images[imgIndex]}
                  alt={display.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Prev"
                      onClick={() => setImgIndex((i) => (i - 1 + images.length) % images.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1.5 ring-1 ring-border hover:bg-background"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next"
                      onClick={() => setImgIndex((i) => (i + 1) % images.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1.5 ring-1 ring-border hover:bg-background"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((u, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setImgIndex(i)}
                      className={`h-12 w-20 shrink-0 overflow-hidden rounded-md ring-2 ${
                        i === imgIndex ? 'ring-primary' : 'ring-transparent'
                      }`}
                    >
                      <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      {readmes.length > 0 && (
        <ReadmeDialog
          kind="texture"
          readmes={readmes}
          onOpenChange={(open) => {
            if (!open) setReadmes([])
          }}
        />
      )}
      {isRetroPage && <AsciiScrollbar />}
      {isBaldiPage && <BaldiChase />}
      {isMagnetPage && <MagneticCursor />}
      {isGlitchPage && <GlitchPage />}
      {isFleePage && <RunawayButtons />}
      {isMilkPage && <MilkPage />}
      {isJumpscarePage && <JumpScare />}
      {isFishPage && (
        <button
          type="button"
          onClick={() => {
            setLocale('fish')
          }}
          className="group fixed bottom-5 right-5 z-40"
          aria-label="IM FISH"
        >
          <img src={fishGif} alt="IM FISH" className="h-20 w-20 rounded-full object-cover shadow-lg ring-2 ring-white/30" />
          <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-bold text-background opacity-0 shadow transition-opacity group-hover:opacity-100">
            IM FISH
          </span>
        </button>
      )}
    </div>
  )
}