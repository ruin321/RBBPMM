import { createRoot } from 'react-dom/client'
import { I18nProvider } from '@/i18n'
import { BananaPage } from './_BananaPage.old'
import thumb from '@/assets/baldi.png'

// 真实组件 + 假 IPC。规模由 location.hash 决定：#total=400&target=400
const cfg = new URLSearchParams(location.hash.replace(/^#/, ''))
const TOTAL = Number(cfg.get('total') ?? 400)
const PAGE_SIZE = 50

interface FakeItem {
  id: number
  name: string
  hasFiles: boolean
  files: unknown[]
  authorName: string
  version: string
  viewCount: number
  downloadCount: number
  dateAdded: number
  dateUpdated: number
  thumbnailUrl: string
}

function makeItem(n: number): FakeItem {
  return {
    id: 900000 + n,
    name: `Mod #${n} — a fairly long submission name for layout`,
    hasFiles: true,
    files: [],
    authorName: `author${n % 37}`,
    version: `1.${n % 10}`,
    viewCount: 1000 + n,
    downloadCount: 100 + n,
    dateAdded: 1700000000 - n * 3600,
    dateUpdated: 1710000000 - n * 3600,
    thumbnailUrl: thumb
  }
}

const ok = (value: unknown): Promise<{ ok: true; value: unknown }> =>
  Promise.resolve({ ok: true, value })
const noSub = (): (() => void) => () => undefined

const api = {
  app: {
    getLocale: () => Promise.resolve('zh-CN'),
    setLocale: () => ok(null),
    onLocaleChanged: noSub,
    onInstallProgress: noSub
  },
  banana: {
    search: (page: number) =>
      ok({
        items: Array.from({ length: PAGE_SIZE }, (_, k) => makeItem((page - 1) * PAGE_SIZE + k)).filter(
          (it) => it.id - 900000 < TOTAL
        ),
        recordCount: TOTAL
      }),
    get: (id: number) =>
      ok({
        id,
        name: `Mod #${id - 900000}`,
        hasFiles: true,
        files: [{ id: 1, fileName: 'a.zip', fileSize: 1234 }],
        images: [],
        description: 'desc',
        categoryId: 0,
        authorName: 'author',
        version: '1.0'
      }),
    getComments: () => ok({ total: 0, items: [] }),
    getUpdates: () => ok({ total: 0, items: [] }),
    install: () => ok(null),
    getPostReplies: () => ok([]),
    levelStudioPrereq: () => ok([])
  },
  mods: { list: () => ok([]) },
  window: { close: () => undefined }
}

Object.defineProperty(window, 'api', { value: api, configurable: true })

createRoot(document.getElementById('host') as HTMLElement).render(
  <I18nProvider>
    {/* 外壳全部内联样式：Tailwind 只扫 src/，探针入口用的类不在构建 CSS 里 */}
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ height: 40, flexShrink: 0 }} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside style={{ width: 192, flexShrink: 0 }} />
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 32 }}>
          <BananaPage />
        </main>
      </div>
    </div>
  </I18nProvider>
)
