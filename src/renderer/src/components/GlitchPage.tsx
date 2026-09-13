import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { de } from '@/i18n/locales/de'
import { ja } from '@/i18n/locales/ja'
import { ko } from '@/i18n/locales/ko'
import { ru } from '@/i18n/locales/ru'

/**
 * 彩蛋：Baldi's basics BUG（submissionId 713697，ruin321 本人的「把修好的
 * bug 全放回去」mod）。这一页**开门就是坏的**：一进详情页立刻随机长出
 * 1~3 个 bug —— 贴图错乱、贴图互换、文本撑爆、某块突然没 CSS、文案串语言、
 * 字符烂掉、布局漂移、凭空 undefined、整页闪屏、整块倒立、镜像、糊掉、
 * 隐身、颜色通道炸了、蚂蚁字、[object Object]、乱码方块。
 * 打开期间**不会自愈**，坏就坏了；退出详情页时全部复原，
 * 再进来重新随机摇一组（每扇门后面的坏法都不一样）。
 *
 * 实现套路：mount 时从 bug 池里洗牌抽 1~3 种，各挑一个目标一次性下毒，
 * 每个毒带一个 undo 闭包；卸载时统一 undo。同一个元素同时只许中一种毒
 * （data-glitch 标记），避免互相覆盖恢复错乱。
 * window.__glitchPage 暴露 force/healAll/reroll，给无头探针做确定性验证用。
 */

/** 挂点类名（页面根节点上那枚钩子，见 ModDetailPage） */
const MARKER = '.glitch-713697'
/** 开门随机的 bug 数量区间 */
const BUG_COUNT: [number, number] = [1, 3]
/** 开场弹假报错的概率 & 延迟 */
const TOAST_CHANCE = 0.4
const TOAST_DELAY_MS = 1200

const FOREIGN_LOCALES: Array<Record<string, string>> = [
  de as unknown as Record<string, string>,
  ja as unknown as Record<string, string>,
  ko as unknown as Record<string, string>,
  ru as unknown as Record<string, string>
]

const BUG_TOASTS = [
  'texture_atlas_corrupted (0x8007139F)',
  'Failed to load resource: net::ERR_UNDEFINED',
  "[i18n] missing key: 'detail.desc' — fallback: 何でもいい",
  'GL_INVALID_OPERATION while rendering sprites ┌∩┐(▀̿Ĺ̯▀̿ ̿)┌∩┐',
  'settings may go off the screen — это intentional btw'
]

const randInt = (lo: number, hi: number): number => lo + Math.floor(Math.random() * (hi - lo + 1))
const pick = <T,>(arr: T[]): T | null => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : null)
const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 给文本加烂字符（组合附加符号），像编码炸了 */
const zalgo = (s: string): string => {
  let out = ''
  for (const ch of s) {
    out += ch
    if (Math.random() < 0.4) {
      const n = randInt(1, 3)
      for (let i = 0; i < n; i++) out += String.fromCharCode(0x0300 + randInt(0, 0x6f))
    }
  }
  return out
}

/** 把文本换成 ▓▒░ 方块，像字库表没加载 */
const GARBLE_CHARS = '▓▒░█▄▀▐▌'
const garble = (s: string): string =>
  [...s]
    .map((ch) =>
      ch === ' ' ? ch : Math.random() < 0.55 ? GARBLE_CHARS[randInt(0, GARBLE_CHARS.length - 1)] : ch
    )
    .join('')

interface Bug {
  el: Element
  undo: () => void
}

export function GlitchPage(): React.JSX.Element | null {
  const bootedRef = useRef(false)

  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true

    // 活动范围 = 挂点所在的页面内容区（App.tsx 那个唯一的页面级滚动容器）
    let scope: Element | null = null
    const findScope = (): void => {
      const marker = document.querySelector(MARKER)
      scope = marker ? (marker.closest('main') ?? marker) : null
    }
    findScope()

    const active = new Set<Bug>()
    let toastTimer = 0
    let stopped = false
    let spawnCount = 0

    const heal = (bug: Bug): void => {
      active.delete(bug)
      if (bug.el.isConnected) bug.undo()
      if (bug.el instanceof HTMLElement) delete bug.el.dataset.glitch
    }
    const healAll = (): void => {
      for (const bug of [...active]) heal(bug)
    }

    const register = (el: Element, apply: () => void, undo: () => void): void => {
      if (!(el instanceof HTMLElement)) return
      if (el.dataset.glitch) return
      el.dataset.glitch = '1'
      apply()
      active.add({ el, undo: () => undo() })
    }

    // ---- 目标池 ----

    const imgs = (): HTMLImageElement[] =>
      Array.from(scope?.querySelectorAll<HTMLImageElement>('img') ?? []).filter(
        (im) => !im.dataset.glitch && im.src
      )

    /** 只有纯文本的元素（没有子元素 ⇒ 不会误伤 svg 图标） */
    const textEls = (): HTMLElement[] =>
      Array.from(
        scope?.querySelectorAll<HTMLElement>('p, h1, h2, h3, span, label, summary, li, a, button') ?? []
      ).filter((el) => {
        if (el.dataset.glitch || el.children.length > 0) return false
        const t = (el.textContent ?? '').trim()
        return t.length >= 2 && t.length <= 80
      })

    const blocks = (): HTMLElement[] =>
      Array.from(scope?.querySelectorAll<HTMLElement>('section, header, ul, details, div') ?? []).filter(
        (el) => {
          if (el.dataset.glitch) return false
          const r = el.getBoundingClientRect()
          return r.height >= 60 && r.height <= 1400 && r.width >= 120
        }
      )

    // ---- 各种 bug ----

    type BugType =
      | 'texrgb'
      | 'texswap'
      | 'overflow'
      | 'nocss'
      | 'lang'
      | 'zalgo'
      | 'shift'
      | 'undef'
      | 'flicker'
      | 'upside'
      | 'mirror'
      | 'blur'
      | 'ghost'
      | 'hue'
      | 'tiny'
      | 'objobj'
      | 'garble'

    const ALL_TYPES: BugType[] = [
      'texrgb',
      'texswap',
      'overflow',
      'nocss',
      'lang',
      'zalgo',
      'shift',
      'undef',
      'flicker',
      'upside',
      'mirror',
      'blur',
      'ghost',
      'hue',
      'tiny',
      'objobj',
      'garble'
    ]

    const spawnBug = (force?: BugType): BugType | 'skip' => {
      if (stopped || !scope) return 'skip'
      const type = force ?? (pick(ALL_TYPES) as BugType)

      try {
        switch (type) {
          case 'texrgb': {
            const im = pick(imgs())
            if (!im) return 'skip'
            register(
              im,
              () => im.classList.add('glitch-rgb'),
              () => im.classList.remove('glitch-rgb')
            )
            break
          }
          case 'texswap': {
            const pool = imgs()
            if (pool.length < 2) return 'skip'
            const a = pick(pool)!
            const b = pick(pool.filter((x) => x !== a))
            if (!b) return 'skip'
            const sa = a.src
            const sb = b.src
            register(
              a,
              () => {
                a.src = sb
                b.src = sa
              },
              () => {
                if (a.isConnected) a.src = sa
                if (b.isConnected) b.src = sb
                if (b instanceof HTMLElement) delete b.dataset.glitch
              }
            )
            b.dataset.glitch = '1' // b 跟着 a 一起复原
            break
          }
          case 'overflow': {
            const el = pick(textEls())
            if (!el) return 'skip'
            const t = el.textContent ?? ''
            register(
              el,
              () => {
                el.classList.add('glitch-nowrap')
                el.textContent = t + t
              },
              () => {
                el.classList.remove('glitch-nowrap')
                el.textContent = t
              }
            )
            break
          }
          case 'nocss': {
            const el = pick(blocks())
            if (!el) return 'skip'
            register(
              el,
              () => el.classList.add('glitch-nocss'),
              () => el.classList.remove('glitch-nocss')
            )
            break
          }
          case 'lang': {
            const el = pick(textEls())
            const locale = pick(FOREIGN_LOCALES)
            if (!el || !locale) return 'skip'
            const t = el.textContent ?? ''
            register(
              el,
              () => {
                el.textContent = pick(Object.values(locale)) ?? t
              },
              () => {
                el.textContent = t
              }
            )
            break
          }
          case 'zalgo': {
            const el = pick(textEls())
            if (!el) return 'skip'
            const t = el.textContent ?? ''
            register(
              el,
              () => {
                el.textContent = zalgo(t)
              },
              () => {
                el.textContent = t
              }
            )
            break
          }
          case 'shift': {
            const el = pick([...blocks(), ...Array.from(scope.querySelectorAll<HTMLElement>('h1, h2'))])
            if (!el) return 'skip'
            register(
              el,
              () => el.classList.add('glitch-shift'),
              () => el.classList.remove('glitch-shift')
            )
            break
          }
          case 'undef': {
            const el = pick(textEls())
            if (!el) return 'skip'
            const span = document.createElement('span')
            span.className = 'glitch-undef'
            span.textContent = 'undefined'
            register(
              el,
              () => el.appendChild(span),
              () => span.remove()
            )
            break
          }
          case 'flicker': {
            const marker = document.querySelector(MARKER)
            if (!marker) return 'skip'
            register(
              marker,
              () => marker.classList.add('glitch-flicker'),
              () => marker.classList.remove('glitch-flicker')
            )
            break
          }
          case 'upside': {
            const el = pick(blocks())
            if (!el) return 'skip'
            register(
              el,
              () => el.classList.add('glitch-upside'),
              () => el.classList.remove('glitch-upside')
            )
            break
          }
          case 'mirror': {
            const el = pick(blocks())
            if (!el) return 'skip'
            register(
              el,
              () => el.classList.add('glitch-mirror'),
              () => el.classList.remove('glitch-mirror')
            )
            break
          }
          case 'blur': {
            const el = pick([...imgs(), ...blocks()])
            if (!el) return 'skip'
            register(
              el,
              () => el.classList.add('glitch-blur'),
              () => el.classList.remove('glitch-blur')
            )
            break
          }
          case 'ghost': {
            const el = pick(blocks())
            if (!el) return 'skip'
            register(
              el,
              () => el.classList.add('glitch-ghost'),
              () => el.classList.remove('glitch-ghost')
            )
            break
          }
          case 'hue': {
            const im = pick(imgs())
            if (!im) return 'skip'
            register(
              im,
              () => im.classList.add('glitch-hue'),
              () => im.classList.remove('glitch-hue')
            )
            break
          }
          case 'tiny': {
            const el = pick(textEls())
            if (!el) return 'skip'
            register(
              el,
              () => el.classList.add('glitch-tiny'),
              () => el.classList.remove('glitch-tiny')
            )
            break
          }
          case 'objobj': {
            const el = pick(textEls())
            if (!el) return 'skip'
            const t = el.textContent ?? ''
            register(
              el,
              () => {
                el.textContent = '[object Object]'
              },
              () => {
                el.textContent = t
              }
            )
            break
          }
          case 'garble': {
            const el = pick(textEls())
            if (!el) return 'skip'
            const t = el.textContent ?? ''
            register(
              el,
              () => {
                el.textContent = garble(t)
              },
              () => {
                el.textContent = t
              }
            )
            break
          }
        }
      } catch {
        return 'skip'
      }
      spawnCount += 1
      return type
    }

    /** 开门即坏：洗牌抽 1~3 种，各下一次毒（目标缺货的类型跳过，接着抽） */
    const applyInitial = (): number => {
      const want = randInt(...BUG_COUNT)
      let applied = 0
      for (const t of shuffle(ALL_TYPES)) {
        if (applied >= want) break
        if (spawnBug(t) !== 'skip') applied += 1
      }
      return applied
    }
    applyInitial()

    if (Math.random() < TOAST_CHANCE) {
      toastTimer = window.setTimeout(() => {
        if (!stopped) toast.error(pick(BUG_TOASTS) ?? BUG_TOASTS[0], { duration: 4000 })
      }, TOAST_DELAY_MS)
    }

    // 探针 / 调试钩子（无副作用，prod 也无害）
    ;(window as unknown as Record<string, unknown>).__glitchPage = {
      force: (t?: BugType) => spawnBug(t),
      healAll,
      /** 模拟「退出再进」：复原后重摇一组 */
      reroll: () => {
        healAll()
        return applyInitial()
      },
      stop: () => {
        stopped = true
        window.clearTimeout(toastTimer)
      },
      spawnCount: () => spawnCount,
      appliedTypes: () => active.size,
      appliedEls: () => [...active].map((b) => b.el)
    }

    return () => {
      stopped = true
      window.clearTimeout(toastTimer)
      healAll()
      delete (window as unknown as Record<string, unknown>).__glitchPage
      bootedRef.current = false
    }
  }, [])

  if (typeof document === 'undefined') return null
  return null
}
