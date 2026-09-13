/**
 * 验证台：更新记录区块的横向溢出。
 *
 * 跑的是**真实的 ModDetailPage 组件**（不是抄一份排版），喂的是病态数据 ——
 * 一行里塞一条超长、没有任何断点的串（长 URL / 长文件名），看它会不会冲出卡片、
 * 压到右边的图片栏上。浏览器里跑，用的是 `out/renderer/assets/*.css` 真实构建产物。
 *
 * 断言文本写进 <pre id="log">，用 --dump-dom 取，比看截图靠谱。
 */
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '@/i18n'
import { ModDetailPage } from '@/components/ModDetailPage'
import type { GamebananaSubmissionDto, GamebananaUpdatesDto } from '@shared/types'

// ---------------------------------------------------------------- 病态数据

/** 没有任何可断点的一行 —— 长 URL 是最常见的形态 */
const URL_LONG =
  'https://gamebanana.com/mods/download/694067/GottaManageDev_some_extremely_long_unbreakable_identifier_that_has_no_spaces_at_all_v1.2.3.zip'

/** 长文件名：同样是纯标识符，故意长到一行绝对放不下，逼胶囊内部换行 */
const FILE_LONG =
  'TSOTSQ_' + 'unbreakable_segment_without_any_spaces_'.repeat(5) + 'v1.2.3.zip'

const updates: GamebananaUpdatesDto = {
  total: 3,
  items: [
    {
      id: 101,
      title: URL_LONG,
      url: 'https://gamebanana.com/mods/694067',
      dateAdded: 1757000000,
      version: '1.1.0',
      body: `<p>正文里的长链接：${URL_LONG}</p><p>再来个列表：</p><ul><li>${URL_LONG}</li></ul><pre>${URL_LONG}</pre>`,
      changeLog: [
        { text: URL_LONG, category: 'Bugfix' },
        { text: '短条目，用来对照：这一条本来就应该正常换行', category: 'Addition' },
        { text: URL_LONG + URL_LONG, category: 'Adjustment' }
      ],
      fileNames: [FILE_LONG, 'ok.zip']
    },
    {
      id: 102,
      title: FILE_LONG,
      url: 'https://gamebanana.com/mods/694067',
      dateAdded: 1756000000,
      version: '1.0.1',
      changeLog: [{ text: URL_LONG, category: 'Improvement' }],
      fileNames: [FILE_LONG]
    },
    {
      id: 103,
      title: '1.0.0',
      dateAdded: 1755000000,
      version: '1.0.0',
      changeLog: [{ text: 'Initial release', category: 'Addition' }],
      fileNames: []
    }
  ]
}

/** #short：换成「正常长度」的数据，用来确认修完以后平时的样子没被带歪 */
const SHORT = new URLSearchParams(location.hash.slice(1)).has('short')

// 函数声明会提升，所以这里能写在 submission 前面 —— 但**调用**必须等 submission 初始化完，
// 不然就是 TDZ，整个模块直接抛（esbuild 不做类型检查，构建照样绿）
function applyShort(): void {
  updates.items = [
    {
      id: 201,
      title: '1.1.0 — 修了一堆东西',
      url: 'https://gamebanana.com/mods/694067',
      dateAdded: 1757000000,
      version: '1.1.0',
      body: '<p>这次主要是把 TSOTSQ 那几个功能接回 0.14.X 的接口上，顺手补了文档。</p>',
      changeLog: [
        { text: 'Fixed the notebook questions not spawning in floor 3', category: 'Bugfix' },
        { text: 'Added a new TSOTSQ feature flag', category: 'Addition' },
        { text: 'Adjusted the spawn weights for the Principal', category: 'Adjustment' }
      ],
      fileNames: ['TSOTSQ_v1.1.0.zip']
    },
    {
      id: 202,
      title: '1.0.1',
      url: 'https://gamebanana.com/mods/694067',
      dateAdded: 1756000000,
      version: '1.0.1',
      changeLog: [{ text: 'Improved compatibility with 0.13.2', category: 'Improvement' }],
      fileNames: ['TSOTSQ_v1.0.1.zip']
    },
    {
      id: 203,
      title: '1.0.0',
      url: 'https://gamebanana.com/mods/694067',
      dateAdded: 1755000000,
      version: '1.0.0',
      changeLog: [{ text: 'Initial release', category: 'Addition' }],
      fileNames: ['TSOTSQ_v1.0.0.zip']
    }
  ]
  Object.assign(submission as unknown as Record<string, unknown>, {
    name: '(0.14.X) Some TSOTSQ Feature In BB+',
    description:
      '<p>把 TSOTSQ 的那些功能搬进 Baldi\'s Basics Plus，包含新的教室事件与道具。</p><p>随便点开一两条更新看看排版。</p>'
  })
  submission.files = [
    { id: 1, fileName: 'TSOTSQ_v1.1.0.zip', fileSize: 1234567, downloadUrl: 'https://example.com/a.zip' }
  ]
  updates.total = 3
}

const submission: GamebananaSubmissionDto = {
  id: 694067,
  name: URL_LONG,
  description: `<p>${URL_LONG}</p>`,
  authorName: 'Ruin321',
  hasFiles: true,
  categoryId: 4609,
  images: [
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect width='640' height='360' fill='%23334155'/><text x='24' y='64' fill='%23e2e8f0' font-size='30'>screenshot</text></svg>"
  ],
  downloadCount: 1234,
  viewCount: 5678,
  dateAdded: 1755000000,
  dateUpdated: 1757000000,
  files: [
    {
      id: 1,
      fileName: FILE_LONG,
      fileSize: 1234567,
      downloadUrl: 'https://example.com/a.zip'
    }
  ],
  archivedFiles: [],
  requirements: [],
  alternateFileSources: []
}

// submission 到这里才初始化完，SHORT 的覆盖要放在这之后
if (SHORT) applyShort()

// ---------------------------------------------------------------- window.api 桩

const noop = (): (() => void) => () => undefined

const api: Record<string, Record<string, (...a: unknown[]) => unknown>> = {
  app: {
    getLocale: () => Promise.resolve('en'),
    setLocale: () => Promise.resolve(),
    onLocaleChanged: noop,
    onInstallProgress: noop
  },
  window: {
    isMaximized: () => Promise.resolve(false),
    registerMaximizeEvents: () => Promise.resolve(),
    onMaximizedChanged: noop,
    minimize: () => Promise.resolve(),
    toggleMaximize: () => Promise.resolve(),
    close: () => Promise.resolve()
  },
  banana: {
    get: () => Promise.resolve({ ok: true, value: submission }),
    getComments: () => Promise.resolve({ ok: true, value: { total: 0, items: [] } }),
    getUpdates: () => Promise.resolve({ ok: true, value: updates })
  }
}

Object.assign(window, { api })

// ---------------------------------------------------------------- 断言

const lines: string[] = []
const logEl = document.getElementById('log')
function line(s: string): void {
  lines.push(s)
  if (logEl) logEl.textContent = lines.join('\n')
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Rect {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

function rect(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
}

/** 找「更新记录」那个 section：它的 h2 里含 Updates 字样 */
function updatesSection(): HTMLElement | null {
  for (const s of Array.from(document.querySelectorAll<HTMLElement>('section'))) {
    const h = s.querySelector('h2')
    if (h && /update/i.test(h.textContent ?? '')) return s
  }
  return null
}

function describe(el: HTMLElement): string {
  const cls = (el.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
  const txt = (el.textContent ?? '').trim().slice(0, 26)
  return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} «${txt}»`
}

interface Leak {
  el: HTMLElement
  right: number
}

/** 收集所有「右边缘越出参考框」的后代元素 */
function leaksOut(root: HTMLElement, bound: Rect): Leak[] {
  const out: Leak[] = []
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return // 没有盒子，跳过
    if (r.right > bound.right + 1) out.push({ el, right: r.right })
  })
  return out
}

function report(leaks: Leak[], bound: Rect, label: string): void {
  if (leaks.length === 0) {
    line(`[PASS] ${label}：没有元素越界（参考框右边缘 ${Math.round(bound.right)}）`)
    return
  }
  leaks.sort((a, b) => b.right - a.right)
  line(`[FAIL] ${label}：${leaks.length} 个元素越界，最远超出 ${Math.round(leaks[0].right - bound.right)}px`)
  leaks.slice(0, 4).forEach((l) => {
    line(`        · 超出 ${String(Math.round(l.right - bound.right)).padStart(4)}px  ${describe(l.el)}`)
  })
}

async function run(): Promise<void> {
  await sleep(250)

  // 折叠的三条全展开 —— 关着的 <details> 里元素没有盒子，量不出来
  document.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => {
    d.open = true
  })
  await sleep(120)

  const scroller = document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto')
  if (!scroller) return line('[FAIL] 找不到 main.flex-1.overflow-y-auto')

  const section = updatesSection()
  if (!section) return line('[FAIL] 页面上没有「更新记录」区块 —— 数据没喂进去？')

  const list = section.querySelector<HTMLElement>('ul')
  if (!list) return line('[FAIL] 更新记录区块里没有 <ul>')

  const listRect = rect(list)
  const secRect = rect(section)
  const srRect = rect(scroller)
  line(
    `[diag] 滚动容器 ${Math.round(srRect.width)}×${Math.round(srRect.height)}  区块 ${Math.round(secRect.width)}  列表 ${Math.round(listRect.width)}  条目数 ${list.children.length}`
  )

  // ---- 1. 卡片自身能不能横滚 / 内容有没有超出去 ----
  line(
    `${list.scrollWidth <= list.clientWidth + 1 ? '[PASS]' : '[FAIL]'} 1 卡片没有产生横向滚动（scrollWidth ${list.scrollWidth} vs clientWidth ${list.clientWidth}）`
  )

  const leaksIn = leaksOut(list, listRect)
  report(leaksIn, listRect, '2 卡片内的元素都没越出卡片')

  // ---- 3. 别压到右边那栏图片 ----
  const grid = document.querySelector<HTMLElement>('.lg\\:col-span-2')
  const rightCol = grid?.parentElement?.querySelector<HTMLElement>(':scope > aside')
  if (rightCol) {
    const rr = rect(rightCol)
    const crossed = leaksIn.filter((l) => l.right > rr.left)
    line(
      `${crossed.length === 0 ? '[PASS]' : '[FAIL]'} 3 没有压到右侧图片栏（栏左边缘 ${Math.round(rr.left)}${crossed.length ? `，最远压进 ${Math.round(crossed[0].right - rr.left)}px` : ''}）`
    )
  } else {
    line('[warn] 没找到右侧图片栏 —— lg 断点没生效？')
  }

  // ---- 4. 整页不该出现横向滚动条 ----
  const docW = document.documentElement.scrollWidth
  line(
    `${docW <= window.innerWidth + 1 ? '[PASS]' : '[FAIL]'} 4 整页没有横向滚动（${docW} vs ${window.innerWidth}）`
  )
  line(
    `${srRect.right <= window.innerWidth + 1 ? '[PASS]' : '[FAIL]'} 5 主滚动容器没被撑宽（右边缘 ${Math.round(srRect.right)}，窗口 ${window.innerWidth}）`
  )

  // ---- 6. 长串真的换行了，而不是被裁掉 ----
  const longLi = list.querySelectorAll<HTMLElement>('li.flex.items-start > span:last-child')
  const body0 = Array.from(longLi).find((el) => (el.textContent ?? '').length > 100)
  if (!body0) {
    line('[warn] 没找到那条超长 changelog 文本')
  } else {
    const r = body0.getBoundingClientRect()
    const lh = parseFloat(getComputedStyle(body0).lineHeight) || 20
    const rows = r.height / lh
    line(
      `${rows > 1.5 ? '[PASS]' : '[FAIL]'} 6 超长 changelog 换成了多行（高 ${Math.round(r.height)}px ≈ ${rows.toFixed(1)} 行，宽 ${Math.round(r.width)}）`
    )
    line(
      `${r.right <= listRect.right + 1 ? '[PASS]' : '[FAIL]'} 7 换行后的文本右边缘没越出卡片（${Math.round(r.right)} vs ${Math.round(listRect.right)}）`
    )
  }

  // ---- 8. 文件名胶囊 ----
  // 认准胶囊自己（含 Package 图标的那个 inline-flex），别被标题行里同名的 span 抢走 ——
  // 第一版用「文本里含 xxx」找，结果先撞上 summary 里的标题 span，断言名不副实
  const chip = Array.from(list.querySelectorAll<HTMLElement>('span')).find(
    (el) => el.className.includes('inline-flex') && el.querySelector('svg') !== null
  )
  if (!chip) {
    line('[warn] 没找到文件名胶囊')
  } else {
    const r = rect(chip)
    const inner = chip.lastElementChild as HTMLElement | null
    const ir = inner ? rect(inner) : r
    const lh = inner ? parseFloat(getComputedStyle(inner).lineHeight) || 16 : 16
    const rows = ir.height / lh
    line(
      `${r.right <= listRect.right + 1 ? '[PASS]' : '[FAIL]'} 8 长文件名胶囊没越出卡片（右边缘 ${Math.round(r.right)} vs ${Math.round(listRect.right)}，宽 ${Math.round(r.width)}）`
    )
    line(
      `${rows > 1.5 ? '[PASS]' : '[FAIL]'} 8b 文件名在胶囊内部换行了（高 ${Math.round(ir.height)}px ≈ ${rows.toFixed(1)} 行，名字长 ${FILE_LONG.length} 字符）`
    )
  }

  // ---- 9. 折叠标题行（summary）里的长串 ----
  // 注意量的是「他实际画出来的区域」= summary 自己跟它所有后代的并集。
  // 只量 summary 那个盒子是量不出来的：它是宽度撑满的块，溢出去的是里面的 span。
  const sum = list.querySelector<HTMLElement>('summary')
  if (sum) {
    let drawn = rect(sum).right
    let worst: HTMLElement = sum
    sum.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.right > drawn) {
        drawn = r.right
        worst = el
      }
    })
    line(
      `${drawn <= listRect.right + 1 ? '[PASS]' : '[FAIL]'} 9 折叠标题行实际画出来没越界（${Math.round(drawn)} vs ${Math.round(listRect.right)}${drawn > listRect.right + 1 ? `，来自 ${describe(worst)}` : ''}）`
    )
  }

  const bad = lines.filter((l) => l.includes('[FAIL]')).length
  line(bad === 0 ? '==== ALL PASS ====' : `==== ${bad} FAILED ====`)
}

// ---------------------------------------------------------------- 挂载

const host = document.getElementById('host')
if (!host) {
  line('[FAIL] 没有 #host')
} else {
  createRoot(host).render(
    <I18nProvider>
      <ModDetailPage
        submissionId={694067}
        fallback={submission}
        onBack={() => undefined}
        historyDepth={0}
        level={0}
        onBackLevel={() => undefined}
      />
    </I18nProvider>
  )
  void run()
}
