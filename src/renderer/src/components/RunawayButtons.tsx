import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/i18n'

/**
 * 彩蛋：按钮会跑（submissionId 714303）——全页面物理版。
 *
 * 规则：
 *  1. 页面右下角有一颗**原生 HTML 按钮**（场地框钉在内容区右下角，同 MilkPage 套路）；
 *  2. **点它** → 效果启用：不再是只有按钮会跑，**整个页面上的所有东西**
 *     （标题、段落、图片、按钮……）都成了物理体——鼠标**碰到**谁（贴近到接触
 *     半径内）谁就被踢一脚背离指针飞出去；指针靠近会持续**推开**已松脱的东西；
 *  3. **物理**：松脱物有速度与摩擦力，滑行减速；互相**碰撞**并交换动量
 *     （撞得够狠会把静止的也撞松，连锁反应）；撞到内容区边缘**反弹**；
 *  4. 谁都出不了整个滚动内容（含折叠线以下，按内容坐标夹取）；
 *  5. 再点一次按钮 → 全场复位、效果关闭（开关）。
 *
 * 实现：启用时把主内容树里可见的、互不嵌套的元素快照成候选列表（外层容器太大
 * 的跳过、已松脱元素的后代跳过，防止 transform 双重位移），rAF 里做积分/碰撞/
 * 边界，transform 内联写。window.__flee 暴露 trigger/isArmed/looseIds/offsets
 * 给无头探针做确定性验证。
 */

/** 挂点类名（页面根节点上那枚钩子，见 ModDetailPage） */
const MARKER = '.flee-714303'
/** 指针推斥力作用半径（到中心） */
const PUSH_RADIUS = 150
/** 多近算「碰到」（到矩形边缘）——碰到即解锁 */
const TOUCH_RADIUS = 28
/** 指针推斥加速度（零距离处，px/s²，随距离线性衰减到 PUSH_RADIUS 处为 0） */
const PUSH_ACC = 2600
/** 解锁瞬间的初速度，px/s */
const KICK = 520
/** 摩擦系数（指数衰减，v *= exp(-FRICTION·dt)） */
const FRICTION = 3.2
/** 反弹恢复系数 */
const RESTITUTION = 0.55
/** 撞击速度超过它才把被撞物撞松（px/s），太轻只是蹭一下 */
const HIT_UNLOCK_SPEED = 80
/** 推出内容区时留的贴边 */
const EDGE_PAD = 4
/** 候选/松脱物上限（防失控；页面元素再多也只取 DOM 序靠前的） */
const MAX_BODIES = 120
/** 太小的元素（图标、圆点）不值得当物理体 */
const MIN_W = 12
const MIN_H = 8
/** 比这还大的外层容器当「背景」跳过（整页根容器被踢走就什么都有了） */
const BIG_AREA_RATIO = 0.5

/** 指针到矩形边缘的最近距离（矩形外为正，内部为负） */
function distToRect(px: number, py: number, l: number, t: number, r: number, b: number): number {
  const dx = Math.max(l - px, 0, px - r)
  const dy = Math.max(t - py, 0, py - b)
  return Math.hypot(dx, dy)
}

/** 一个松脱的元素：leftC/topC 是解锁瞬间的**内容坐标系**矩形（相对滚动内容，
 *  不随滚动漂移）；位移记在 x/y 里（transform 天然是内容相对的） */
interface Body {
  el: HTMLElement
  leftC: number
  topC: number
  w: number
  h: number
  x: number
  y: number
  vx: number
  vy: number
}

export function RunawayButtons(): React.JSX.Element | null {
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  /** 按钮文案由 React 渲染（走 i18n，切语言即时刷新），不用命令式 textContent */
  const [armedUI, setArmedUI] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    const field = fieldRef.current
    const btn = btnRef.current
    const marker = document.querySelector(MARKER)
    if (!field || !btn || !marker) return
    const scope = marker.closest('main')
    if (!scope) return
    // 页面级滚动容器只有一个，见 App.tsx 的 <main className="flex-1 overflow-y-auto">
    const scroller = document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto')
    if (!scroller) return

    let armed = false
    let stopped = false
    /** 松脱的元素 */
    const bodies = new Map<HTMLElement, Body>()
    /** 启用瞬间的候选快照（DOM 序，互不嵌套的可见元素） */
    let candidates: HTMLElement[] = []
    const cursor = { x: 0, y: 0, has: false }

    const onMove = (e: MouseEvent): void => {
      cursor.x = e.clientX
      cursor.y = e.clientY
      cursor.has = true
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    /** 解锁一个元素，返回新 Body */
    const unlock = (el: HTMLElement, vx: number, vy: number): Body => {
      const r = el.getBoundingClientRect()
      const s = scope.getBoundingClientRect()
      const body: Body = {
        el,
        leftC: r.left - (s.left - scope.scrollLeft),
        topC: r.top - (s.top - scope.scrollTop),
        w: r.width,
        h: r.height,
        x: 0,
        y: 0,
        vx,
        vy
      }
      el.dataset.flee = '1'
      el.style.willChange = 'transform'
      bodies.set(el, body)
      // 探针/诊断：解锁事件流水（谁、在哪、指针当时在哪）
      const log = unlockLog as { id: string; cx: number; cy: number; px: number; py: number; t: number }[]
      log.push({
        id: el.id || el.textContent?.trim().slice(0, 10) || '?',
        cx: Math.round(r.left + r.width / 2),
        cy: Math.round(r.top + r.height / 2),
        px: Math.round(cursor.x),
        py: Math.round(cursor.y),
        t: Math.round(performance.now())
      })
      if (log.length > 30) log.shift()
      return body
    }
    const unlockLog: unknown[] = []

    const hasAncestorBody = (el: HTMLElement): boolean => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (bodies.has(p)) return true
      }
      return false
    }

    /** 收集候选：可见、不算太大（整页根容器跳过，继续看它的孩子）、
     *  之后碰撆/解锁时还要过「祖先未松脱」这道筛 */
    const collectCandidates = (): void => {
      const bigArea =
        scope.clientWidth * scope.clientHeight * BIG_AREA_RATIO
      const out: HTMLElement[] = []
      for (const el of scope.querySelectorAll<HTMLElement>('*')) {
        if (out.length >= MAX_BODIES * 2) break
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
        const r = el.getBoundingClientRect()
        if (r.width < MIN_W || r.height < MIN_H) continue
        if (r.width * r.height > bigArea) continue
        out.push(el)
      }
      candidates = out
    }

    /** 松脱祖先列表里查 el 的祖先（候选量小，直接线性扫） */
    const isInsideLoose = (el: HTMLElement): boolean => {
      for (const b of bodies.values()) {
        if (b.el !== el && b.el.contains(el)) return true
      }
      return false
    }

    /** 启用 / 复位（按钮开关） */
    const setArmed = (on: boolean): void => {
      if (on === armed) return
      armed = on
      setArmedUI(on)
      if (on) {
        collectCandidates()
      } else {
        for (const b of bodies.values()) {
          b.el.style.transform = ''
          b.el.style.willChange = ''
          delete b.el.dataset.flee
        }
        bodies.clear()
      }
    }
    btn.addEventListener('click', () => setArmed(!armed))

    // ---- 场地 = 滚动容器的可视区，逐帧对齐（同 BaldiChase / MilkPage）----
    const fieldRect = { left: 0, top: 0, w: 0, h: 0 }
    const syncField = (): void => {
      const r = scroller.getBoundingClientRect()
      const left = Math.round(r.left)
      const top = Math.round(r.top)
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      if (left === fieldRect.left && top === fieldRect.top && w === fieldRect.w && h === fieldRect.h) {
        return
      }
      fieldRect.left = left
      fieldRect.top = top
      fieldRect.w = w
      fieldRect.h = h
      field.style.left = `${left}px`
      field.style.top = `${top}px`
      field.style.width = `${w}px`
      field.style.height = `${h}px`
    }
    syncField()
    const ro = new ResizeObserver(syncField)
    ro.observe(scroller)
    window.addEventListener('resize', syncField)
    let rafField = 0
    const fieldTick = (): void => {
      rafField = requestAnimationFrame(fieldTick)
      syncField()
    }
    rafField = requestAnimationFrame(fieldTick)

    let last = performance.now()
    let raf = 0
    /** 探针诊断：最后一次 tick 的 statics id 快照 / 异常 */
    const dbg = { statics: [] as string[], error: '' }
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick)
      if (stopped) return
      try {
        tickBody(now)
      } catch (e) {
        dbg.error = e instanceof Error ? e.message : String(e)
      }
    }
    const tickBody = (now: number): void => {
      // 注意：rAF 只在 tick 里调度一次（tickBody 是 tick 的被调用方，
      // 再调度一次会让每帧 pending 回调数指数翻倍、渲染进程直接饱和悬挂）
      if (stopped) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (!armed || !cursor.has) return

      const scopeRect = scope.getBoundingClientRect()
      /** 本帧：内容坐标系原点在客户端坐标里的位置（随滚动变化） */
      const cl = scopeRect.left - scope.scrollLeft
      const ct = scopeRect.top - scope.scrollTop
      const centerOf = (b: Body): { cx: number; cy: number; r: number } => ({
        cx: b.leftC + cl + b.w / 2 + b.x,
        cy: b.topC + ct + b.h / 2 + b.y,
        r: (b.w + b.h) / 4
      })

      // 1) 碰到即解锁（获得一脚背离指针的初速度）——页面上的任何东西
      if (bodies.size < MAX_BODIES) {
        for (const el of candidates) {
          if (bodies.size >= MAX_BODIES) break
          if (bodies.has(el) || isInsideLoose(el)) continue
          const r = el.getBoundingClientRect()
          if (r.width < MIN_W || r.height < MIN_H) continue
          if (distToRect(cursor.x, cursor.y, r.left, r.top, r.right, r.bottom) <= TOUCH_RADIUS) {
            const cx = r.left + r.width / 2
            const cy = r.top + r.height / 2
            let dx = cx - cursor.x
            let dy = cy - cursor.y
            const d = Math.hypot(dx, dy)
            if (d < 1) {
              dx = 0
              dy = 1
            } else {
              dx /= d
              dy /= d
            }
            unlock(el, dx * KICK, dy * KICK)
          }
        }
      }

      // 2) 指针推斥力
      for (const b of bodies.values()) {
        const c = centerOf(b)
        const dx = c.cx - cursor.x
        const dy = c.cy - cursor.y
        const d = Math.hypot(dx, dy)
        if (d >= PUSH_RADIUS) continue
        const ux = d < 0.5 ? 0 : dx / d
        const uy = d < 0.5 ? 1 : dy / d
        const a = (1 - d / PUSH_RADIUS) * PUSH_ACC
        b.vx += ux * a * dt
        b.vy += uy * a * dt
      }

      // 3) 积分 + 摩擦
      const damp = Math.exp(-FRICTION * dt)
      for (const b of bodies.values()) {
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.vx *= damp
        b.vy *= damp
      }

      // 4) 碰撞（圆形近似 + 动量交换；撞松静止物 = 连锁）
      const pending: Array<{ el: HTMLElement; vx: number; vy: number }> = []
      const all = [...bodies.values()]
      const statics: HTMLElement[] = []
      if (bodies.size < MAX_BODIES) {
        for (const el of candidates) {
          // statics = 还没松脱的候选（且不在松脱物内部）——松脱物之间的
          // 碰撞由 4b 处理，这里只收「静止障碍物」，撞得狠就把它撞松
          if (!bodies.has(el) && !isInsideLoose(el)) statics.push(el)
        }
      }
      dbg.statics = statics.map((el) => el.id || el.tagName).slice(0, 20)
      for (let i = 0; i < all.length; i++) {
        const a = all[i]
        const ca = centerOf(a)
        // 4a. 撞静止物
        for (const el of statics) {
          const r = el.getBoundingClientRect()
          if (r.width < MIN_W || r.height < MIN_H) continue
          const cb = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: (r.width + r.height) / 4 }
          const dx = cb.cx - ca.cx
          const dy = cb.cy - ca.cy
          const d = Math.hypot(dx, dy)
          const minD = ca.r + cb.r
          if (d >= minD) continue
          const ux = d < 0.5 ? 0 : dx / d
          const uy = d < 0.5 ? -1 : dy / d
          const overlap = minD - d
          a.x -= ux * overlap
          a.y -= uy * overlap
          const vn = a.vx * ux + a.vy * uy
          if (vn > 0) {
            // 反弹
            a.vx -= (1 + RESTITUTION) * vn * ux
            a.vy -= (1 + RESTITUTION) * vn * uy
            // 撞得够狠 → 把对方撞松（动量传过去）
            if (vn > HIT_UNLOCK_SPEED) {
              pending.push({ el, vx: ux * vn * 0.7, vy: uy * vn * 0.7 })
            }
          }
        }
        // 4b. 撞其他松脱物
        for (let j = i + 1; j < all.length; j++) {
          const b = all[j]
          const cb = centerOf(b)
          const dx = cb.cx - ca.cx
          const dy = cb.cy - ca.cy
          const d = Math.hypot(dx, dy)
          const minD = ca.r + cb.r
          if (d >= minD || d < 0.001) continue
          const ux = dx / d
          const uy = dy / d
          const overlap = minD - d
          const ma = Math.max(a.w * a.h, 1)
          const mb = Math.max(b.w * b.h, 1)
          const sa = (mb / (ma + mb)) * overlap
          const sb = (ma / (ma + mb)) * overlap
          a.x -= ux * sa
          a.y -= uy * sa
          b.x += ux * sb
          b.y += uy * sb
          const vn = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy
          if (vn < 0) {
            const jj = (-(1 + RESTITUTION) * vn) / (1 / ma + 1 / mb)
            a.vx -= (jj / ma) * ux
            a.vy -= (jj / ma) * uy
            b.vx += (jj / mb) * ux
            b.vy += (jj / mb) * uy
          }
        }
      }
      for (const p of pending) {
        if (!bodies.has(p.el) && !isInsideLoose(p.el) && bodies.size < MAX_BODIES) {
          unlock(p.el, p.vx, p.vy)
        }
      }

      // 5) 内容坐标系边界：夹住 + 反弹（折叠线上下的整个内容都是活动范围）
      const cw = scope.scrollWidth
      const ch = scope.scrollHeight
      for (const b of bodies.values()) {
        const minX = EDGE_PAD - b.leftC
        const maxX = cw - EDGE_PAD - b.leftC - b.w
        const minY = EDGE_PAD - b.topC
        const maxY = ch - EDGE_PAD - b.topC - b.h
        if (b.x < minX) {
          b.x = minX
          if (b.vx < 0) b.vx = -b.vx * RESTITUTION
        } else if (b.x > maxX) {
          b.x = maxX
          if (b.vx > 0) b.vx = -b.vx * RESTITUTION
        }
        if (b.y < minY) {
          b.y = minY
          if (b.vy < 0) b.vy = -b.vy * RESTITUTION
        } else if (b.y > maxY) {
          b.y = maxY
          if (b.vy > 0) b.vy = -b.vy * RESTITUTION
        }
      }

      // 6) 落盘 transform
      for (const b of bodies.values()) {
        b.el.style.transform = `translate(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px)`
      }
    }
    raf = requestAnimationFrame(tick)

    // 探针 / 调试钩子（无副作用，prod 也无害）
    ;(window as unknown as Record<string, unknown>).__flee = {
      trigger: () => btn.click(),
      reset: () => setArmed(false),
      isArmed: () => armed,
      /** 探针专用：程序化解锁某元素（绕过指针接触） */
      unlockId: (id: string, vx: number, vy: number): boolean => {
        const el = candidates.find((c) => c.id === id)
        if (!el || bodies.has(el)) return false
        unlock(el, vx, vy)
        return true
      },
      /** 探针专用：把已松脱元素瞬移到指定内容坐标位移 */
      tp: (id: string, x: number, y: number): boolean => {
        const b = [...bodies.values()].find((bb) => bb.el.id === id)
        if (!b) return false
        b.x = x
        b.y = y
        return true
      },
      /** 探针专用：读某松脱元素的内容坐标矩形 */
      bodyRect: (id: string): { leftC: number; topC: number; w: number; h: number; x: number; y: number } | null => {
        const b = [...bodies.values()].find((bb) => bb.el.id === id)
        return b ? { leftC: b.leftC, topC: b.topC, w: b.w, h: b.h, x: b.x, y: b.y } : null
      },
      unlockLog: () => unlockLog,
      candidateIds: () => candidates.map((c) => c.id || c.tagName),
      dbg: () => dbg,
      looseCount: () => bodies.size,
      candidateCount: () => candidates.length,
      looseIds: () => [...bodies.keys()].map((el) => el.id || el.textContent?.trim() || '?'),
      offsets: () =>
        [...bodies.values()].map((b) => ({
          id: b.el.id,
          x: b.x,
          y: b.y,
          vx: b.vx,
          vy: b.vy
        }))
    }

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      cancelAnimationFrame(rafField)
      ro.disconnect()
      window.removeEventListener('resize', syncField)
      window.removeEventListener('mousemove', onMove)
      for (const b of bodies.values()) {
        b.el.style.transform = ''
        b.el.style.willChange = ''
        delete b.el.dataset.flee
      }
      bodies.clear()
      delete (window as unknown as Record<string, unknown>).__flee
    }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={fieldRef}
      aria-hidden="true"
      className="pointer-events-none fixed z-30 overflow-hidden"
      style={{ left: 0, top: 0, width: 0, height: 0 }}
    >
      <button
        ref={btnRef}
        type="button"
        style={{ position: 'absolute', right: 20, bottom: 20, pointerEvents: 'auto' }}
      >
        {armedUI ? t('egg.flee.armed') : t('egg.flee.arm')}
      </button>
    </div>,
    document.body
  )
}
