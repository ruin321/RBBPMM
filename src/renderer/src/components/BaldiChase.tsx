import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import baldiPng from '@/assets/baldi.png'

/**
 * 彩蛋：Baldi 站在 mod 页面最上方（submissionId 694067）。
 *
 * 规则（跟「眨眼天使」一个套路）：
 *  1. 他在视口里 = 你看得见他，他**顶住不动**；
 *  2. 滚动把他带出视口（看不见了）= 他悄悄往鼠标那边挪；
 *  3. 鼠标碰到他 = 工具直接关掉。
 *
 * **场地模型**：他的活动范围是「页面滚动容器的可视区」，不是整扇窗口。
 * 外层那个 fixed + overflow:hidden 的框就是这块场地，逐帧跟滚动容器对齐，坐标全部相对它。
 * 于是窗口顶部那条标题栏、左边那条侧边栏都不属于他的场地 —— 溢出部分直接裁掉，
 * 他既站不上去也穿不过去（之前只按视口坐标算，滚下去之后他会停在「只有半个身子
 * 够到内容区」的位置，剩下的部分正好压在标题栏上）。
 *
 * 用 portal 挂到 body：避开页面根节点的 `space-y-6`（相邻兄弟会被塞 margin-top），
 * 也避免被祖先的 transform / backdrop-filter 变成 fixed 的包含块。
 */

/** 显示高度；宽度按源图 67×147 的原始比例推出来，别让角色被拉横 */
const SPRITE_H = 200
const SPRITE_W = Math.round((SPRITE_H * 67) / 147)

/** 追击速度，px/s。慢一点才吓人 */
const MOVE_SPEED = 300
/** 刚打开页面时的免死时间，免得鼠标正好压在出生点上开局就关窗 */
const GRACE_MS = 1600
/** 贴边留白，也用来把追击目标夹进场地里 */
const EDGE_PAD = 16
/** 判定「碰到」时往里收一点，给玩家留点余量 */
const HIT_INSET = 4
/** 碰到之后扑上来那一帧的停顿，然后关窗 */
const SNAP_MS = 180

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi)
}

export function BaldiChase(): React.JSX.Element | null {
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const spriteRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const field = fieldRef.current
    const sprite = spriteRef.current
    if (!field || !sprite) return
    // 页面级滚动容器只有一个，见 App.tsx 的 <main className="flex-1 overflow-y-auto">
    const scroller = document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto')
    if (!scroller) return

    // ---- 场地 = 滚动容器的可视区，逐帧对齐 ----
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

    // 出生点：页面最上方、靠右
    const pos = { x: fieldRect.w - SPRITE_W - EDGE_PAD, y: 6 }
    let lastScroll = scroller.scrollTop
    let facing = 1
    let caught = false
    let hasMouse = false
    let placed = false
    /** 鼠标位置，场地坐标（标题栏/侧边栏上是负数，clamp 会兜住） */
    const mouse = { x: 0, y: 0 }
    const startedAt = performance.now()
    let prev = startedAt
    let raf = 0

    const ro = new ResizeObserver(syncField)
    ro.observe(scroller)
    window.addEventListener('resize', syncField)

    const onMove = (e: MouseEvent): void => {
      mouse.x = e.clientX - fieldRect.left
      mouse.y = e.clientY - fieldRect.top
      hasMouse = true
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick)
      // 已经扑上去了就别再接管 transform —— 否则下一帧会把扑击姿势覆盖掉，
      // 关窗前那 180ms 就白给了
      if (caught) return
      const dt = Math.min((now - prev) / 1000, 0.05)
      prev = now

      syncField()
      const W = fieldRect.w
      const H = fieldRect.h

      // 跟随页面滚动 —— 场地坐标里减掉滚过去的距离，等于钉在文档上
      const st = scroller.scrollTop
      pos.y -= st - lastScroll
      lastScroll = st

      // 「看得见」= 他和场地有交集。上下两条边都会让他「只露一丝」就定住，
      // 从上缘回来时那半截身子会被场地裁掉（以前不裁，就直接压到标题栏上去了）。
      const seen = pos.x < W && pos.x + SPRITE_W > 0 && pos.y < H && pos.y + SPRITE_H > 0

      // 看不见才动
      if (!seen && hasMouse) {
        // 目标也夹进场地：鼠标停在标题栏/侧边栏上时，他不许往那儿去
        const tx = clamp(mouse.x - SPRITE_W / 2, EDGE_PAD, Math.max(EDGE_PAD, W - SPRITE_W - EDGE_PAD))
        const ty = clamp(mouse.y - SPRITE_H / 2, EDGE_PAD, Math.max(EDGE_PAD, H - SPRITE_H - EDGE_PAD))
        const dx = tx - pos.x
        const dy = ty - pos.y
        const dist = Math.hypot(dx, dy)
        if (dist > 1) {
          const step = Math.min(dist, MOVE_SPEED * dt)
          pos.x += (dx / dist) * step
          pos.y += (dy / dist) * step
          facing = dx < 0 ? -1 : 1
        }
      }

      if (!placed) {
        placed = true
        sprite.style.opacity = '1'
      }

      // 被看见时定住；碰到就再也跑不掉
      if (
        seen &&
        !caught &&
        hasMouse &&
        now - startedAt > GRACE_MS &&
        mouse.x > pos.x + HIT_INSET &&
        mouse.x < pos.x + SPRITE_W - HIT_INSET &&
        mouse.y > pos.y + HIT_INSET &&
        mouse.y < pos.y + SPRITE_H - HIT_INSET
      ) {
        caught = true
        sprite.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scale(2.6)`
        window.setTimeout(() => {
          void window.api.window.close()
        }, SNAP_MS)
        return
      }

      sprite.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scaleX(${facing})`
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', syncField)
      window.removeEventListener('mousemove', onMove)
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
      <img
        ref={spriteRef}
        src={baldiPng}
        alt=""
        draggable={false}
        className="absolute left-0 top-0 select-none opacity-0"
        style={{ width: SPRITE_W, height: SPRITE_H, willChange: 'transform' }}
      />
    </div>,
    document.body
  )
}
