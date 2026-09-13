import { createRoot } from 'react-dom/client'
import { BaldiChase } from '@/components/BaldiChase'

/**
 * BaldiChase 的浏览器验证台。
 *
 * 挂的是**真实组件**（不是抄一份逻辑），页面骨架用真实构建产物的 CSS，
 * 骨架按 App.tsx 的真实结构搭：顶部 40px 的 TitleBar + 侧边栏 + 滚动容器。
 *
 * 关键手法：把 requestAnimationFrame 和 performance.now 换成自己控制的假时钟，
 * 想推几帧推几帧。无头 Chrome 在 --virtual-time-budget 下 rAF 的触发次数不可控，
 * 靠它跑动画会得到「只跑了一帧」的假结果 —— 必须先接管时钟，断言才可信。
 *
 * 断言：
 *   A 场地 = 滚动容器可视区，且出生在页面最上方
 *   B 滚出视口 → 朝鼠标挪，重新露头就定住，而且**一帧都不许画到标题栏上**
 *   C 滚回顶部 → 他回到页面里，继续定住
 *   D 被鼠标碰到 → 调 window.api.window.close()
 */

// ---- 假时钟：必须赶在组件挂载前装好 ----
let rafQueue: Array<(t: number) => void> = []
let vnow = 0
const T0 = 1000

window.requestAnimationFrame = ((cb: (t: number) => void): number => {
  rafQueue.push(cb)
  return rafQueue.length
}) as typeof window.requestAnimationFrame
window.cancelAnimationFrame = (): void => {}
Object.defineProperty(performance, 'now', { value: () => vnow + T0, configurable: true })

function pump(frames: number, dtMs = 16.7): void {
  for (let i = 0; i < frames; i++) {
    vnow += dtMs
    const q = rafQueue
    rafQueue = []
    for (const cb of q) cb(vnow + T0)
    samplePaint()
  }
}

// ---- window.api 桩：彩蛋靠它关窗 ----
const closeStub = { called: false }
;(window as unknown as { api: unknown }).api = {
  window: {
    close: () => {
      closeStub.called = true
      line('[PASS] window.api.window.close() 被调用 —— 工具会退出')
    }
  }
}

/** #phase=a / #phase=b … 跑到那一段就停下，用来单独截图；加 #clean 隐藏日志面板 */
const HASH = new URLSearchParams(location.hash.slice(1))
const HALT = HASH.get('phase') ?? ''

const lines: string[] = []
const logEl = document.getElementById('log')
if (HASH.has('clean') && logEl) logEl.style.display = 'none'
function line(s: string): void {
  lines.push(s)
  if (logEl) logEl.textContent = lines.join('\n')
}

const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms))

/** portal 根节点：新版是「场地」框，旧版就是精灵本身 */
function fieldEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('body > div[aria-hidden="true"]')
}

function spriteEl(): HTMLElement | null {
  const root = fieldEl()
  if (!root) return null
  const img = root.querySelector<HTMLElement>('img')
  // 旧版把 transform 写在 portal 根节点上、新版写在 img 上 —— 认那个真被摆位置的
  if (img && /translate3d|scale/.test(img.style.transform)) return img
  if (/translate3d|scale/.test(root.style.transform)) return root
  return img ?? root
}

function rectOf(el: Element | null): DOMRect | null {
  return el ? el.getBoundingClientRect() : null
}

interface Snap {
  x: number
  y: number
  w: number
  h: number
}

function snap(): Snap | null {
  const r = rectOf(spriteEl())
  // 保留小数：可见性判断恰好卡在边界上，四舍五入会把 483.97 变成 484 而误判成「看不见」
  return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
}

function fmt(s: Snap): string {
  return `${Math.round(s.x)},${Math.round(s.y)}`
}

/** 鼠标点（视口坐标）落在精灵身上吗 */
function touching(s: Snap, mx: number, my: number): boolean {
  return mx > s.x && mx < s.x + s.w && my > s.y && my < s.y + s.h
}

function move(x: number, y: number): void {
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))
}

/** 他在滚动容器的可视区里露着吗（视口坐标下的矩形相交） */
function inViewport(sr: DOMRect, s: Snap): boolean {
  return s.x < sr.right && s.x + s.w > sr.left && s.y < sr.bottom && s.y + s.h > sr.top
}

/**
 * 他**实际画出来**的区域 = 精灵矩形 ∩ 场地矩形。
 * 旧版没有场地（portal 根就是精灵本身），这里的 field 就等于精灵矩形，
 * 所以同一个算式对两个版本都成立 —— A/B 对照才诚实。
 */
function painted(s: Snap): { top: number; bottom: number; left: number; right: number } | null {
  const f = rectOf(fieldEl())
  if (!f) return null
  const top = Math.max(s.y, f.top)
  const bottom = Math.min(s.y + s.h, f.bottom)
  const left = Math.max(s.x, f.left)
  const right = Math.min(s.x + s.w, f.right)
  if (bottom - top <= 0 || right - left <= 0) return null // 完全没露出来
  return { top, bottom, left, right }
}

/** 禁区：App 那条标题栏（窗口按钮那一条）。他一帧都不许画进去。
 *  页面自己那条 sticky 导航属于页面，是他的家，不算禁区。 */
let forbiddenBottom = 0
let violations = 0
function samplePaint(): void {
  const s = snap()
  const p = s ? painted(s) : null
  if (p && p.top < forbiddenBottom - 0.5) violations++
}

/** #phase=a / #phase=b … 跑到那一段就停下，用来单独截图；加 #clean 隐藏日志面板 */
function finish(): void {
  const bad = lines.filter((l) => l.includes('[FAIL]')).length
  document.title = bad === 0 ? 'ALL PASS' : bad + ' FAILED'
  line(bad === 0 ? '==== ALL PASS ====' : `==== ${bad} FAILED ====`)
}

async function run(): Promise<void> {
  const scroller = document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto')
  if (!scroller) return line('[FAIL] 找不到 main.flex-1.overflow-y-auto')
  if (!spriteEl()) return line('[FAIL] 精灵没被挂到 body —— portal 失败')
  const titlebar = document.getElementById('titlebar')
  if (!titlebar) return line('[FAIL] 骨架里没有 #titlebar')

  const sr0 = scroller.getBoundingClientRect()
  const tb0 = titlebar.getBoundingClientRect()
  const head0 = rectOf(scroller.querySelector('header'))
  forbiddenBottom = tb0.bottom
  line(
    `[diag] 视口 ${Math.round(sr0.width)}×${Math.round(sr0.height)}  标题栏 0~${Math.round(tb0.bottom)}  页面头部 ${Math.round(head0 ? head0.top : 0)}~${Math.round(head0 ? head0.bottom : 0)}  滚动容器 ${Math.round(sr0.top)}~${Math.round(sr0.bottom)}  可滚 ${scroller.scrollHeight}`
  )
  if (scroller.scrollHeight <= scroller.clientHeight) line('[FAIL] 骨架没撑出滚动 —— B 段无效')

  // ---- A 场地 + 出生点 ----
  const f0 = rectOf(fieldEl())
  const fieldAligned =
    !!f0 &&
    Math.abs(f0.left - sr0.left) < 1 &&
    Math.abs(f0.top - sr0.top) < 1 &&
    Math.abs(f0.width - sr0.width) < 1 &&
    Math.abs(f0.height - sr0.height) < 1
  line(
    `${fieldAligned ? '[PASS]' : '[FAIL]'} A0 场地逐帧对齐滚动容器可视区（${f0 ? `${Math.round(f0.left)},${Math.round(f0.top)} ${Math.round(f0.width)}×${Math.round(f0.height)}` : '无'}）`
  )
  line(
    `${getComputedStyle(fieldEl() as Element).overflow === 'hidden' ? '[PASS]' : '[FAIL]'} A0b 场地把溢出裁掉（overflow: hidden）`
  )

  pump(1) // 第一帧：组件把自己摆到出生点
  move(400, 300)
  const a1 = snap()
  if (!a1) return line('[FAIL] A 读不到精灵')
  pump(90)
  const a2 = snap()
  if (!a2) return line('[FAIL] A 读不到精灵')
  line(`${inViewport(sr0, a1) ? '[PASS]' : '[FAIL]'} A1 出生就在页面里（${fmt(a1)}）`)
  line(
    `${Math.abs(a1.x - a2.x) < 0.5 && Math.abs(a1.y - a2.y) < 0.5 ? '[PASS]' : '[FAIL]'} A2 看得见时顶住不动（${fmt(a1)} → ${fmt(a2)}）`
  )
  line(
    `${a1.y > forbiddenBottom - 0.5 && a1.y < forbiddenBottom + 60 && a1.x + a1.w > sr0.right - 60 ? '[PASS]' : '[FAIL]'} A3 出生在页面最上方靠右、没压到标题栏（y=${Math.round(a1.y)}，标题栏底 ${Math.round(forbiddenBottom)}，右边缘距容器 ${Math.round(sr0.right - a1.x - a1.w)}px）`
  )
  line(`${closeStub.called ? '[FAIL]' : '[PASS]'} A4 全程没碰到他，窗口没关`)
  if (HALT === 'a') return finish()

  // ---- B 滚走 → 追鼠标；重新露头 → 立刻定住，且不许画到标题栏上 ----
  const SCROLL = 900
  scroller.scrollTop = SCROLL
  const realScroll = scroller.scrollTop
  const baseline = a1.y - realScroll // 只跟页面滚走、还没开始追时的位置
  line(`[diag] scrollTop 设 ${SCROLL} 实际 ${realScroll}`)
  move(420, 520)
  violations = 0
  pump(260)
  const b = snap()
  if (!b) return line('[FAIL] B 读不到精灵')
  const srB = scroller.getBoundingClientRect()
  line(
    `${b.y - baseline > 400 ? '[PASS]' : '[FAIL]'} B1 看不见时朝鼠标挪了（y ${Math.round(baseline)} → ${Math.round(b.y)}，鼠标在 520）`
  )
  line(
    `${inViewport(srB, b) ? '[PASS]' : '[FAIL]'} B2 重新露头就停住（y=${Math.round(b.y)}，视口 ${Math.round(srB.top)}~${Math.round(srB.bottom)}）`
  )
  const pB = painted(b)
  line(
    `${pB && pB.top >= forbiddenBottom - 0.5 ? '[PASS]' : '[FAIL]'} B3 停住时没压到标题栏（画出来的顶边 ${pB ? Math.round(pB.top) : '没露'}，标题栏底 ${Math.round(forbiddenBottom)}；旧规则会停在 y≈${Math.round(srB.top - 200)}）`
  )
  line(
    `${violations === 0 ? '[PASS]' : '[FAIL]'} B4 上面 260 帧里他一帧都没画进禁区（越界 ${violations} 帧）`
  )
  if (HALT === 'b') return finish()

  // ---- C 滚回顶部 ----
  const MOUSE_Y = 520
  scroller.scrollTop = 0
  violations = 0
  pump(120)
  const c1 = snap()
  pump(90)
  const c2 = snap()
  if (!c1 || !c2) return line('[FAIL] C 读不到精灵')
  const srC = scroller.getBoundingClientRect()
  line(`${inViewport(srC, c1) ? '[PASS]' : '[FAIL]'} C1 他回到页面里了（y=${Math.round(c1.y)}，视口 ${Math.round(srC.top)}~${Math.round(srC.bottom)}）`)
  line(
    `${Math.abs(c1.x - c2.x) < 0.5 && Math.abs(c1.y - c2.y) < 0.5 ? '[PASS]' : '[FAIL]'} C2 露头之后就不动了（${fmt(c1)} → ${fmt(c2)}）`
  )
  line(
    `${violations === 0 ? '[PASS]' : '[FAIL]'} C3 滚回来的过程也没画进禁区（越界 ${violations} 帧）`
  )
  line(
    `${!touching(c1, 420, MOUSE_Y) ? '[PASS]' : '[FAIL]'} C4 鼠标一直在页面上，他却始终没盖住鼠标点（鼠标 420,${MOUSE_Y}）`
  )
  if (HALT === 'c') return finish()

  // ---- D 碰到 → 关窗 ----
  // 只在他**实际露出来的那部分**上点，不然矮窗口里精灵大半在视口外，鼠标根本够不着
  const p = painted(c1)
  if (!p || p.right - p.left < 4 || p.bottom - p.top < 4) {
    return line('[SKIP] D 精灵露出的部分太小，够不着')
  }
  const hit = { x: Math.round((p.left + p.right) / 2), y: Math.round((p.top + p.bottom) / 2) }
  move(400, 300)
  pump(2)
  line(`${closeStub.called ? '[FAIL]' : '[PASS]'} D0 鼠标在别处时不会误触发`)
  move(hit.x, hit.y)
  pump(2)
  const snapped = spriteEl()?.style.transform ?? ''
  line(
    `${snapped.includes('scale(2.6)') ? '[PASS]' : '[FAIL]'} D1 碰到瞬间扑上来（transform: ${snapped.slice(0, 58)}）`
  )
  await sleep(400)
  line(
    `${closeStub.called ? '[PASS]' : '[FAIL]'} D2 随后调用关闭（鼠标 ${hit.x},${hit.y}，露出区 ${Math.round(p.right - p.left)}×${Math.round(p.bottom - p.top)}）`
  )

  finish()
}

const host = document.getElementById('host')
if (host) {
  createRoot(host).render(<BaldiChase />)
  window.setTimeout(() => void run(), 0)
} else {
  line('[FAIL] 缺少 #host')
}
