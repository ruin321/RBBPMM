import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GlitchPage } from '@/components/GlitchPage'

/* GlitchPage 探针：假详情页，目标池齐备（2 图 / 3 纯文本块 / 2 大块 / 挂点）。
   __remount() 模拟「退出再进详情页」：key 变更触发真实卸载（cleanup 复原）+ 重挂载（重摇 bug）。 */

const RED =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const BLUE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function Harness(): React.JSX.Element {
  const [gen, setGen] = useState(0)

  useEffect(() => {
    ;(window as unknown as { __ready: boolean }).__ready = true
    ;(window as unknown as { __remount: () => void }).__remount = () => setGen((g) => g + 1)
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <main style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
        <div className="glitch-713697" style={{ position: 'relative', padding: 24 }}>
          <h3 id="t3">Section heading</h3>
          <p id="t1">A short paragraph for text bugs.</p>
          <span id="t2">span text</span>
          <div style={{ display: 'flex', gap: 12 }}>
            <img id="im1" src={RED} width={120} height={90} alt="" />
            <img id="im2" src={BLUE} width={120} height={90} alt="" />
          </div>
          <div
            id="blk1"
            style={{ height: 300, border: '1px solid #888', margin: '12px 0', padding: 8 }}
          >
            block one
          </div>
          <section id="blk2" style={{ height: 200, border: '1px solid #888', padding: 8 }}>
            block two
          </section>
        </div>
      </main>
      <GlitchPage key={gen} />
    </div>
  )
}

createRoot(document.getElementById('host')!).render(<Harness />)
