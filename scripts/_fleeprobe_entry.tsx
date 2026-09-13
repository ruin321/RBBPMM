import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { RunawayButtons } from '@/components/RunawayButtons'

/* Flee 探针：假详情页（标题栏 40px + main 滚动容器 + 挂点 + 按钮/普通元素混合）。
   布局全内联样式（Tailwind 不扫 scripts/）。
   新版行为：右下角原生按钮点击启用；启用后**页面上所有元素**都能被碰走，
   不只是 button。所以外壳里故意放了纯 div / p / img 等非按钮元素。 */

function Harness(): React.JSX.Element {
  useEffect(() => {
    ;(window as unknown as { __ready: boolean }).__ready = true
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ height: 40, flexShrink: 0, borderBottom: '1px solid #555' }}>titlebar</div>
      <main className="flex-1 overflow-y-auto" style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
        <div className="flee-714303" style={{ position: 'relative', padding: 24 }}>
          <h1 id="h1" style={{ fontSize: 24, margin: '16px 0' }}>
            Heading One
          </h1>
          <p id="p1" style={{ width: 320, margin: '16px 0' }}>
            A plain paragraph that is not a button at all.
          </p>
          <button id="b1" type="button" style={{ display: 'block', width: 120, height: 40, margin: '40px 0' }}>
            button one
          </button>
          <div
            id="d1"
            style={{ width: 200, height: 60, background: '#7c3aed', color: '#fff', margin: '60px 0' }}
          >
            plain div
          </div>
          <button id="b2" type="button" style={{ display: 'block', width: 120, height: 40, margin: '360px 0' }}>
            button two
          </button>
          <button id="b3" type="button" style={{ display: 'block', width: 120, height: 40, margin: '360px 0' }}>
            button three
          </button>
          <div style={{ height: 200 }} />
        </div>
      </main>
      <RunawayButtons />
    </div>
  )
}

createRoot(document.getElementById('host')!).render(<Harness />)
