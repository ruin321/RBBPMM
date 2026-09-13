import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import milkPng from '@/assets/milk-708588.png'
import drinkUrl from '@/assets/drink-708588.wav'
import drinkRevUrl from '@/assets/drink-708588-rev.wav'

/**
 * 彩蛋：牛奶（submissionId 708588，com.milk.item）。
 *
 * 页面右下角摆着一盒牛奶（素材直接取自该 mod 本体）：
 *  - 点一下 → 播放 `Drink.wav`，**牛奶瓶倒转**（按钮里的图片 rotate 180°），
 *    同时页面内容「变成空气」（全部隐没，只剩这盒牛奶还看得见）；
 *  - 再点一下 → 播放**反转音频**的 `Drink.wav`，牛奶瓶回正、内容恢复。
 *  （注意：页面本身不倒转，倒转的只是牛奶瓶——页面只负责变空气。）
 *
 * 实现套路：翻转/隐没是纯 CSS（挂点根节点加 `.is-milk-flipped`，见 globals.css），
 * 本组件只负责右下角那颗牛奶按钮 —— 用 BaldiChase 同款「场地框」：
 * portal 到 body、逐帧对齐页面滚动容器可视区，保证按钮永远钉在内容区右下角
 * 而不会跑到标题栏/侧边栏上；倒转时按钮跟着场地走、自身不翻转，随时能点回来。
 * window.__milk 暴露 click/rect 给无头探针做确定性验证。
 */

/** 挂点类名（页面根节点上那枚钩子，见 ModDetailPage） */
const MARKER = '.milk-708588'
/** 按钮显示宽度（源图按比例缩放） */
const BTN_W = 76
/** 贴右下角留白 */
const EDGE_PAD = 20

export function MilkPage(): React.JSX.Element | null {
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

    let flipped = false
    let lastAction: 'drink' | 'rev' | null = null
    const drink = new Audio(drinkUrl)
    const drinkRev = new Audio(drinkRevUrl)

    // ---- 场地 = 滚动容器的可视区，逐帧对齐（同 BaldiChase）----
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

    const onClick = (): void => {
      flipped = !flipped
      if (flipped) {
        // 挂点类只管「变空气」；牛奶瓶自己的倒转挂在按钮上
        marker.classList.add('is-milk-flipped')
        btn.classList.add('milk-flipped')
        lastAction = 'drink'
        drink.currentTime = 0
        void drink.play().catch(() => {})
      } else {
        marker.classList.remove('is-milk-flipped')
        btn.classList.remove('milk-flipped')
        lastAction = 'rev'
        drinkRev.currentTime = 0
        void drinkRev.play().catch(() => {})
      }
    }
    btn.addEventListener('click', onClick)

    // 探针 / 调试钩子（无副作用，prod 也无害）
    ;(window as unknown as Record<string, unknown>).__milk = {
      click: () => btn.click(),
      isFlipped: () => flipped,
      /** 正在放哪段音频：null / 'drink' / 'rev' */
      playing: () => (!drink.paused ? 'drink' : !drinkRev.paused ? 'rev' : null),
      lastAction: () => lastAction,
      rect: () => {
        const r = btn.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      }
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', syncField)
      btn.removeEventListener('click', onClick)
      drink.pause()
      drinkRev.pause()
      marker.classList.remove('is-milk-flipped')
      delete (window as unknown as Record<string, unknown>).__milk
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
        aria-label="milk"
        className="milk-btn absolute select-none"
        style={{ right: EDGE_PAD, bottom: EDGE_PAD, width: BTN_W, pointerEvents: 'auto' }}
      >
        <img
          src={milkPng}
          alt=""
          draggable={false}
          className="w-full"
          style={{ imageRendering: 'pixelated' }}
        />
      </button>
    </div>,
    document.body
  )
}
