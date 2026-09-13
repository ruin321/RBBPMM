import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MilkPage } from '@/components/MilkPage'

/* Milk 探针：假详情页（标题栏 + main 滚动容器 + 挂点 + 内容两块）。 */

function Harness(): React.JSX.Element {
  useEffect(() => {
    ;(window as unknown as { __ready: boolean }).__ready = true
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ height: 40, flexShrink: 0, borderBottom: '1px solid #555' }}>titlebar</div>
      <main className="flex-1 overflow-y-auto" style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
        <div className="milk-708588" style={{ position: 'relative', padding: 24 }}>
          <p id="c1">content paragraph one</p>
          <div id="c2" style={{ height: 1600, border: '1px solid #888' }}>
            content block two
          </div>
        </div>
      </main>
      <MilkPage />
    </div>
  )
}

createRoot(document.getElementById('host')!).render(<Harness />)
