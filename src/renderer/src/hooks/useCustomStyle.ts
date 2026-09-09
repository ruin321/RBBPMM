import { useEffect, useRef } from 'react'

const STYLE_ID = 'custom-css-inject'

function apply(bg: string | undefined, css: string | undefined): void {
  document.documentElement.classList.toggle('custom-bg', !!bg)
  if (bg) {
    document.documentElement.style.setProperty('--custom-bg', `url("${bg}")`)
  } else {
    document.documentElement.style.removeProperty('--custom-bg')
  }
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (css) {
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = css
  } else if (style) {
    style.remove()
  }
}

export function useCustomStyle(): {
  setBg: (dataUrl: string) => void
  clearBg: () => void
  setCss: (css: string) => void
} {
  const bgRef = useRef<string | undefined>(undefined)
  const cssRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    void Promise.all([window.api.app.getCustomBg(), window.api.app.getCustomCss()]).then(([bg, css]) => {
      if (!active) return
      bgRef.current = bg
      cssRef.current = css
      apply(bg, css)
    })
    return () => {
      active = false
    }
  }, [])

  return {
    setBg: (dataUrl: string): void => {
      bgRef.current = dataUrl
      apply(dataUrl, cssRef.current)
      void window.api.app.setCustomBg(dataUrl)
    },
    clearBg: (): void => {
      bgRef.current = undefined
      apply(undefined, cssRef.current)
      void window.api.app.clearCustomBg()
    },
    setCss: (css: string): void => {
      cssRef.current = css
      apply(bgRef.current, css)
      void window.api.app.setCustomCss(css)
    }
  }
}