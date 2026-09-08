import { useEffect, useRef, useState } from 'react'
import { useI18n, type Locale } from '@/i18n'

export function FishSplash(): React.JSX.Element {
  const { locale } = useI18n()
  const [show, setShow] = useState(false)
  const prev = useRef<Locale>(locale)

  useEffect(() => {
    if (locale === 'fish' && prev.current !== 'fish') setShow(true)
    prev.current = locale
  }, [locale])

  if (!show) return <></>

  return (
    <div
      className="fixed inset-0 z-[200] flex cursor-pointer flex-col items-center justify-center overflow-hidden"
      onClick={() => setShow(false)}
      style={{ backgroundImage: 'url(/fish.gif)', backgroundSize: '120px 120px' }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <span className="relative text-8xl font-black tracking-[0.2em] text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] sm:text-9xl">
        FISH
      </span>
      <span className="relative mt-4 text-lg font-semibold text-white/80 drop-shadow">
        IM FISH
      </span>
      <span className="relative mt-8 rounded-md bg-white/15 px-3 py-1 text-xs text-white/70 backdrop-blur">
        click anywhere to swim
      </span>
    </div>
  )
}