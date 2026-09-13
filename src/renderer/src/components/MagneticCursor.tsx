import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import cursorPng from '@/assets/cursor-710488.png'

/**
 * 彩蛋：Dynamic Cursor（submissionId 715561）。
 *
 * 游戏里这个 mod 把指针「实体化」——指针自己跑到可点击的东西上。网页版复刻：
 * 这一页的指针皮肤沿用 cursor-710488.png（原 mod 自称与 Custom Cursor Mod
 * 兼容，干脆连皮肤一起兼容），并且会**平滑吸附**到最近的按钮上，不是瞬移。
 *
 * 实现要点：
 *  - 网页拿不到 OS 光标控制权（藏不掉也移不动真指针），所以整页 cursor:none
 *    （见 globals.css 的 main:has(.magnet-715561)），画一个「假指针」缓动跟随，
 *    点击被劫持转发给吸附中的按钮 —— 玩家点哪儿，生效的都是假指针指着的东西。
 *  - 假指针 portal 到 body，坐标全是视口坐标；活动范围与 710488 换肤同一个
 *    挂点套路（.magnet-715561 挂在页面根节点上，规则写 main:has(...)），
 *    标题栏 / 侧边栏 / 其它页面不受影响。
 *  - 只劫持可信事件（真实输入链路），程序自己 dispatch 的 click 不碰。
 */

/** 吸附半径：可点元素的矩形离真指针小于这个距离才算「最近的按钮」（px） */
const SNAP_RADIUS = 96
/** 指数缓动速率，帧率无关。12 ≈ 半秒走完九成路程，观感是「嗖地吸过去」 */
const EASE_RATE = 12
/** 指尖热点：64×64 画布四周全透明，可见形状只占 x19-44 / y16-47（同 710488） */
const HOTSPOT = { x: 23, y: 16 }
/** 什么算「按钮」。输入框/下拉不吸 —— 吸走指针就没法正常打字了 */
const TARGET_SELECTOR = 'button, a[href], [role="button"], summary'

export function MagneticCursor(): React.JSX.Element {
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const img = imgRef.current
    if (!img) return

    // 活动范围 = 挂点所在的页面内容区（App.tsx 那个唯一的页面级滚动容器）
    let scope: Element | null = null
    const findScope = (): void => {
      const marker = document.querySelector('.magnet-715561')
      scope = marker ? (marker.closest('main') ?? marker) : null
    }
    findScope()

    const mouse = { x: 0, y: 0, has: false }
    const pos = { x: 0, y: 0 }
    let placed = false
    let visible = false
    let snapped: HTMLElement | null = null
    let inWindow = false
    let raf = 0
    let prev = performance.now()
    let pressTimer = 0

    const setHighlight = (el: HTMLElement | null): void => {
      if (snapped === el) return
      snapped?.classList.remove('magnet-target')
      el?.classList.add('magnet-target')
      snapped = el
    }

    /** 按下去的那一下，假指针缩一缩给个反馈 */
    const press = (): void => {
      img.classList.add('magnet-press')
      window.clearTimeout(pressTimer)
      pressTimer = window.setTimeout(() => img.classList.remove('magnet-press'), 110)
    }

    /** 半径内离指针最近的可点元素；返回 null 表示没有 */
    const nearestTarget = (mx: number, my: number) => {
      if (!scope) return null
      let best: HTMLElement | null = null
      let bestDist = SNAP_RADIUS
      let bcx = 0
      let bcy = 0
      for (const el of scope.querySelectorAll<HTMLElement>(TARGET_SELECTOR)) {
        if (el.closest('[disabled], [aria-disabled="true"]')) continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) continue
        const px = Math.min(Math.max(mx, r.left), r.right)
        const py = Math.min(Math.max(my, r.top), r.bottom)
        const d = Math.hypot(mx - px, my - py)
        if (d < bestDist) {
          bestDist = d
          best = el
          bcx = r.left + r.width / 2
          bcy = r.top + r.height / 2
        }
      }
      return best ? { el: best, cx: bcx, cy: bcy } : null
    }

    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min((now - prev) / 1000, 0.05)
      prev = now

      if (!scope || !scope.isConnected) findScope()

      // 真指针得在活动范围里假指针才出现（标题栏/侧边栏/别的页面不管）
      let inScope = false
      if (mouse.has && scope) {
        const r = scope.getBoundingClientRect()
        inScope = mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom
      }
      visible = inScope && inWindow

      let tx = mouse.x
      let ty = mouse.y
      if (visible) {
        const hit = nearestTarget(mouse.x, mouse.y)
        if (hit) {
          tx = hit.cx
          ty = hit.cy
          setHighlight(hit.el)
        } else {
          setHighlight(null)
        }
        if (!placed) {
          // 第一次出现直接落在鼠标上，别从 (0,0) 飞过来
          placed = true
          pos.x = mouse.x
          pos.y = mouse.y
        }
        const k = 1 - Math.exp(-dt * EASE_RATE)
        pos.x += (tx - pos.x) * k
        pos.y += (ty - pos.y) * k
      } else {
        setHighlight(null)
      }

      img.style.opacity = visible ? '1' : '0'
      img.style.transform = `translate3d(${(pos.x - HOTSPOT.x).toFixed(2)}px, ${(pos.y - HOTSPOT.y).toFixed(2)}px, 0)`
    }

    const onMove = (e: MouseEvent): void => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.has = true
      inWindow = true
    }
    const onLeave = (): void => {
      inWindow = false
    }

    /** 该劫持吗？吸附中、且真实落点不在吸附目标上 → 返回要转发的目标 */
    const hijackTarget = (e: MouseEvent): HTMLElement | null => {
      if (!e.isTrusted || !visible || !snapped) return null
      const r = snapped.getBoundingClientRect()
      const over =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      return over ? null : snapped
    }

    const onMouseDown = (e: MouseEvent): void => {
      if (!visible) return
      press()
      if (hijackTarget(e)) {
        // 吃掉 mousedown：别让真实落点上的元素抢焦点 / 出 active 态
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const onClick = (e: MouseEvent): void => {
      const target = hijackTarget(e)
      if (target) {
        e.preventDefault()
        e.stopPropagation()
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      }
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    window.addEventListener('mousedown', onMouseDown, { capture: true })
    window.addEventListener('click', onClick, { capture: true })
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(pressTimer)
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('mousedown', onMouseDown, { capture: true })
      window.removeEventListener('click', onClick, { capture: true })
      setHighlight(null)
    }
  }, [])

  return createPortal(
    <img
      ref={imgRef}
      src={cursorPng}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="magnet-fake-cursor select-none"
      width={64}
      height={64}
    />,
    document.body
  )
}
