import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  Download,
  Eye,
  ImageIcon,
  Loader2,
  Package,
  Search,
  Store,
  X
} from 'lucide-react'
import type { GamebananaSubmissionDto } from '@shared/types'
import { BALDI_COMMUNITY_CATEGORY_ID, TEXTURE_PACK_CATEGORY_ID } from '@shared/types'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { ModDetailPage } from '@/components/ModDetailPage'
import { RichText } from '@/components/RichText'
import { PageHeader } from '@/components/PageHeader'

interface Props {
  
  onInstalled?: (isTexturePack: boolean) => void
}


const ITEMS_PER_MILESTONE = 114

function fmtCount(n?: number): string {
  if (n === undefined || n === null) return ''
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}


function fmtDate(ts?: number): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return ''
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function BananaPage({ onInstalled }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<number>(BALDI_COMMUNITY_CATEGORY_ID)
  const [page, setPage] = useState(1)
  const [recordCount, setRecordCount] = useState(0)
  const [items, setItems] = useState<GamebananaSubmissionDto[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [milestone, setMilestone] = useState(1)
  const [paused, setPaused] = useState(false)
  
  const [needTextureDep, setNeedTextureDep] = useState(false)
  
  const [preview, setPreview] = useState<string | null>(null)
  
  type NavEntry = { id: number; fallback: GamebananaSubmissionDto }
  const [entries, setEntries] = useState<NavEntry[]>([])
  const current = entries.length > 0 ? entries[entries.length - 1] : null

  
  const listScrollRef = useRef(0) 
  const levelScrollRef = useRef<number[]>([]) 
  const restoreTargetLevel = useRef<number | null>(null) 
  const mainEl = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto')

  const hasMore = recordCount > 0 && items.length < recordCount

  
  const inflightSearchRef = useRef<string | null>(null)
  
  const searchSeqRef = useRef(0)

  
  const runSearch = async (term = query, cat = category): Promise<void> => {
    const t = term.trim()
    
    if (/errant\s*chaotic/i.test(t)) {
      setLoading(false)
      setError(null)
      setItems([])
      setRecordCount(0)
      setPaused(false)
      setMilestone(1)
      inflightSearchRef.current = null
      return
    }
    const key = `${cat}:${t}`
    if (inflightSearchRef.current === key) return
    const seq = ++searchSeqRef.current
    inflightSearchRef.current = key
    setLoading(true)
    setError(null)
    setPaused(false)
    setMilestone(1)
    try {
      const r = await window.api.banana.search(1, t || undefined, cat)
      if (seq !== searchSeqRef.current) return 
      if (!r.ok) {
        setError(r.error)
        setItems([])
        setRecordCount(0)
      } else if (r.value) {
        setItems(r.value.items)
        setRecordCount(r.value.recordCount)
        setPage(1)
        setCategory(cat)
      }
    } catch (e) {
      if (seq !== searchSeqRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (inflightSearchRef.current === key) inflightSearchRef.current = null
      if (seq === searchSeqRef.current) setLoading(false)
    }
  }

  
  const loadMore = async (): Promise<void> => {
    if (loading || loadingMore || !hasMore || paused) return
    setLoadingMore(true)
    try {
      const r = await window.api.banana.search(page + 1, query || undefined, category)
      if (r.ok && r.value) {
        const pageData = r.value
        setItems((prev) => [...prev, ...pageData.items])
        setRecordCount(pageData.recordCount)
        setPage(page + 1)
      } else if (!r.ok) {
        setError(r.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingMore(false)
    }
  }

  
  
  const sentinelRef = useRef<HTMLDivElement>(null)
  const maybeLoad = (): void => {
    if (loading || loadingMore || paused || !hasMore) return
    const nextMilestone = Math.ceil(items.length / ITEMS_PER_MILESTONE)
    if (items.length >= nextMilestone * ITEMS_PER_MILESTONE) {
      setPaused(true)
    } else {
      void loadMore()
    }
  }
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) maybeLoad()
      },
      { rootMargin: '300px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
    
    
  }, [items.length, hasMore, loading, loadingMore, paused])

  useEffect(() => {
    void runSearch('')
    
  }, [])

  
  const openFromList = (sub: GamebananaSubmissionDto): void => {
    listScrollRef.current = mainEl()?.scrollTop ?? 0
    levelScrollRef.current[0] = listScrollRef.current
    setEntries([{ id: sub.id, fallback: sub }])
  }

  
  const openSubmission = (id: number): void => {
    const L = entries.length
    levelScrollRef.current[L] = mainEl()?.scrollTop ?? 0
    setEntries((p) => [...p, { id, fallback: { id, name: '…', hasFiles: false, files: [] } }])
  }

  
  const selectCategory = async (cat: number): Promise<void> => {
    if (cat === TEXTURE_PACK_CATEGORY_ID) {
      let installed = false
      const r = await window.api.mods.list()
      if (r.ok && r.value) installed = r.value.some((m) => /balditexturepacks/i.test(m.name))
      if (!installed) {
        setNeedTextureDep(true)
        return
      }
    }
    void runSearch('', cat)
  }

  
  const onBackLevel = (level: number): void => {
    restoreTargetLevel.current = level
    setEntries((p) => p.slice(0, level + 1))
  }

  
  const onContentReady = (): void => {
    const lv = restoreTargetLevel.current
    if (lv === null) return
    restoreTargetLevel.current = null
    const target = levelScrollRef.current[lv] ?? 0
    requestAnimationFrame(() => mainEl()?.scrollTo({ top: target, left: 0, behavior: 'auto' }))
  }

  
  useEffect(() => {
    if (current !== null) return
    const target = listScrollRef.current
    const id = window.setTimeout(() => {
      if (current === null) mainEl()?.scrollTo({ top: target, left: 0, behavior: 'auto' })
    }, 320)
    return () => window.clearTimeout(id)
    
  }, [current === null])

  return (
    <div className="mx-auto w-full max-w-5xl overflow-x-hidden">
      {}
      <div
        className="flex items-start transition-transform duration-300 ease-out"
        style={{ transform: current ? 'translateX(-100%)' : 'translateX(0)' }}
      >
        {}
        <section className={`w-full shrink-0 space-y-6 ${current ? 'h-0 overflow-hidden' : ''}`}>
          <PageHeader icon={<Store className="h-6 w-6" />} title={t('banana.title')} />

          {}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void runSearch(query)
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('banana.placeholder')}
                className="w-full rounded-md border bg-background py-2 pl-9 pr-8 text-sm outline-none focus:border-primary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    void runSearch('')
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={t('banana.clear')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}
              {t('banana.search')}
            </Button>
          </form>

          {}
          <div className="flex items-center gap-2">
            <Select
              value={String(category)}
              onChange={(v) => {
                void selectCategory(Number(v))
              }}
              className="w-44"
              ariaLabel={t('banana.catFilter')}
              options={[
                { value: String(BALDI_COMMUNITY_CATEGORY_ID), label: t('banana.catMods') },
                { value: String(TEXTURE_PACK_CATEGORY_ID), label: t('banana.catTextures') }
              ]}
            />
          </div>

          {}
          {error && (
            <Card>
              <CardContent className="py-6 text-sm text-destructive">
                {t('banana.reachError', { error })}
              </CardContent>
            </Card>
          )}

          {}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 w-full" />
              ))}
            </div>
          ) : items.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((sub) => (
                <Card
                  key={sub.id}
                  className="group flex cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-md"
                  onClick={() => openFromList(sub)}
                >
                  <div className="relative aspect-video w-full bg-muted">
                    {sub.thumbnailUrl ? (
                      <img
                        src={sub.thumbnailUrl}
                        alt={sub.name}
                        loading="lazy"
                        className="h-full w-full cursor-zoom-in object-cover"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPreview(sub.thumbnailUrl ?? null)
                        }}
                        title={t('banana.preview')}
                        onError={(e) => {
                          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Package className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 min-h-0 flex-1 text-sm font-semibold leading-tight">
                        <RichText text={sub.name} />
                      </h3>
                      <Badge variant="secondary" className="shrink-0">
                        {sub.version || 'v'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('banana.by')} {sub.authorName || t('banana.unknown')}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {fmtDate(sub.dateAdded) && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {t('banana.uploaded')} {fmtDate(sub.dateAdded)}
                        </span>
                      )}
                      {fmtDate(sub.dateUpdated) && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {t('banana.updated')} {fmtDate(sub.dateUpdated)}
                        </span>
                      )}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        {fmtCount(sub.viewCount) || '–'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Download className="h-3.5 w-3.5" />
                        {fmtCount(sub.downloadCount) || '–'}
                      </span>
                      <span>{sub.hasFiles ? t('banana.ready') : t('banana.noFiles')}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            !loading && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {error ? '' : t('banana.noMods')}
                </CardContent>
              </Card>
            )
          )}

          {}
          {items.length > 0 && (
            <>
              <div ref={sentinelRef} className="h-px w-full" aria-hidden />
              {}
              <div className="flex min-h-14 flex-col items-center justify-center gap-2">
              {loadingMore ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('banana.loadMoreLoading')}
                </div>
              ) : paused && hasMore ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPaused(false)
                    void loadMore()
                  }}
                >
                  {t('banana.loadMore', { count: Math.min(ITEMS_PER_MILESTONE, recordCount - items.length) })}
                </Button>
              ) : !hasMore ? (
                <span className="text-sm text-muted-foreground">{t('banana.noMore')}</span>
              ) : null}
              </div>
            </>
          )}

          {!error && !loading && items.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">{t('banana.noMods')}</p>
            </div>
          )}
        </section>

        {}
        <section className="w-full shrink-0">
          {current && (
            <ModDetailPage
              submissionId={current.id}
              fallback={current.fallback}
              onBack={() => setEntries([])}
              onInstalled={onInstalled}
              onOpenSubmission={openSubmission}
              historyDepth={entries.length}
              level={entries.length - 1}
              onBackLevel={onBackLevel}
              scrollOnSubmit={restoreTargetLevel.current === null}
              onContentReady={onContentReady}
            />
          )}
        </section>
      </div>

      {}
      <Dialog open={needTextureDep} onOpenChange={setNeedTextureDep}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {t('textureDep.title')}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="pt-2">
                <p className="text-sm text-foreground">{t('textureDep.desc')}</p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">BaldiTexturePacks</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t('dialog.close')}</Button>
            </DialogClose>
            <Button
              onClick={() => {
                setNeedTextureDep(false)
                openSubmission(482089)
              }}
            >
              {t('textureDep.go')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="galaxy-bg max-w-4xl border-primary/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              {t('banana.preview')}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <img
              src={preview}
              alt=""
              className="preview-zoom w-full rounded-lg border bg-black/40 object-contain shadow-2xl"
            />
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t('dialog.close')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}