import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import scareGif from '@/assets/scare-703263.gif'

/**
 * 彩蛋：突脸（submissionId 703263）。
 *
 * 页面左下角摆着一张 gif 小图（素材直接取自用户提供的 gif）：
 *  - 平时安静地待在左下角（场地框钉在内容区左下角，同 BaldiChase/MilkPage 套路）；
 *  - 点它 → **突脸**：黑幕盖住整屏，gif 从一个小点贴着屏幕疯狂放大直到糊脸，
 *    带轻微抖动；放大完成约 1.3s 后 —— **整个工具直接关闭**（window.api.window.close）。
 *
 * window.__scare 暴露 fire/rect/state 给无头探针做确定性验证。
 */

/** 挂点类名（页面根节点上那枚钩子，见 ModDetailPage） */
const MARKER = '.scare-703263'
/** 小图显示宽度 */
const BTN_W = 110
/** 贴左下角留白 */
const EDGE_PAD = 20
/** 突脸动画时长（ms），之后关窗 */
const SCARE_MS = 900
/** 从开始放大到关窗的总时长（ms） */
const CLOSE_MS = 1300

export function JumpScare(): React.JSX.Element | null {
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const field = fieldRef.current
    const btn = btnRef.current
    const marker = document.querySelector<HTMLElement>(MARKER)
    if (!field || !btn || !marker) return
    // 页面级滚动容器只有一个，见 App.tsx 的 <main className="flex-1 overflow-y-auto">
    const scroller = document.querySelector<HTMLElement>('main.flex-1.overflow-y-auto')
    if (!scroller) return

    let fired = false
    let closeTimer = 0

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
    let raf = 0
    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      syncField()
    }
    raf = requestAnimationFrame(tick)

    const fire = (): void => {
      if (fired) return
      fired = true

      // 黑幕 + gif 从小点放大糊脸
      const overlay = document.createElement('div')
      overlay.className = 'scare-overlay'
      overlay.style.cssText =
        'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483646;background:#000;overflow:hidden;pointer-events:auto'
      const img = document.createElement('img')
      img.src = scareGif
      img.alt = ''
      img.draggable = false
      img.style.cssText = [
        'position:absolute',
        'left:50%',
        'top:50%',
        'width:100vmax',
        'height:auto',
        'transform:translate(-50%,-50%) scale(0.06)',
        'transform-origin:center',
        `transition:transform ${SCARE_MS}ms cubic-bezier(0.55,0,1,0.45)`,
        'will-change:transform'
      ].join(';')
      overlay.appendChild(img)
      document.body.appendChild(overlay)

      // 双 rAF 确保初始 transform 已提交，再切到放大态
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          img.style.transform = 'translate(-50%,-50%) scale(1)'
        })
      })

      closeTimer = window.setTimeout(() => {
        void window.api.window.close()
      }, CLOSE_MS)

      ;(window as unknown as Record<string, unknown>).__scareOverlay = overlay
    }
    btn.addEventListener('click', fire)

    // 探针 / 调试钩子（无副作用，prod 也无害）
    ;(window as unknown as Record<string, unknown>).__scare = {
      fire,
      isFired: () => fired,
      rect: () => {
        const r = btn.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      },
      overlay: () => {
        const o = document.querySelector('.scare-overlay')
        if (!o) return null
        const img = o.querySelector('img')
        return {
          bg: getComputedStyle(o).backgroundColor,
          imgTransform: img ? getComputedStyle(img).transform : null
        }
      }
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', syncField)
      btn.removeEventListener('click', fire)
      if (closeTimer) window.clearTimeout(closeTimer)
      document.querySelector('.scare-overlay')?.remove()
      delete (window as unknown as Record<string, unknown>).__scare
      delete (window as unknown as Record<string, unknown>).__scareOverlay
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
        aria-label="scare"
        style={{
          position: 'absolute',
          left: EDGE_PAD,
          bottom: EDGE_PAD,
          width: BTN_W,
          pointerEvents: 'auto',
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer'
        }}
      >
        <img src={scareGif} alt="" draggable={false} style={{ width: '100%', display: 'block' }} />
      </button>
    </div>,
    document.body
  )
}
