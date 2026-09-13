import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MagneticCursor } from '@/components/MagneticCursor'

/* 磁吸光标探针：真实 MagneticCursor + 确定性几何的假详情页。
   坐标全部按「aside 200px + main 占满余下」的视口布局硬编码：
   - b1   视口 x 260-380, y 120-160，中心 (320,140)
   - overlayDiv 视口 x 380-460, y 100-180（非交互，P1 落点在这里）
   - bdis 禁用按钮，视口 x 260-380, y 300-340
   - sum  summary，视口 x 260-420, y 420-444
   - b2   远处的普通按钮，视口 x 840-980, y 480-520                */

function Harness(): React.JSX.Element {
  useEffect(() => {
    const clicks: Record<string, number> = { b1: 0, container: 0, asideB: 0, sum: 0, overlay: 0 }
    ;(window as unknown as { __clicks: Record<string, number> }).__clicks = clicks
    for (const id of ['b1', 'container', 'asideB', 'sum', 'overlay']) {
      document.getElementById(id)?.addEventListener('click', () => {
        clicks[id] += 1
      })
    }
    ;(window as unknown as { __ready: boolean }).__ready = true
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside style={{ width: 200, flexShrink: 0, position: 'relative' }}>
        <button
          id="asideB"
          className="cursor-pointer"
          style={{ position: 'absolute', left: 40, top: 430, width: 120, height: 40 }}
        >
          aside
        </button>
      </aside>
      <main style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
        <div id="container" className="magnet-715561" style={{ position: 'relative', height: 1200 }}>
          <div
            id="overlay"
            style={{ position: 'absolute', left: 180, top: 100, width: 80, height: 80 }}
          />
          <button
            id="b1"
            className="cursor-pointer"
            style={{ position: 'absolute', left: 60, top: 120, width: 120, height: 40 }}
          >
            B1
          </button>
          <button
            id="bdis"
            disabled
            className="cursor-not-allowed"
            style={{ position: 'absolute', left: 60, top: 300, width: 120, height: 40 }}
          >
            disabled
          </button>
          <details id="det" style={{ position: 'absolute', left: 60, top: 420, width: 160 }}>
            <summary id="sum" style={{ width: 160, height: 24 }}>
              summary
            </summary>
          </details>
          <button id="b2" style={{ position: 'absolute', left: 640, top: 480, width: 140, height: 40 }}>
            B2
          </button>
        </div>
      </main>
      <MagneticCursor />
    </div>
  )
}

createRoot(document.getElementById('host')!).render(<Harness />)
