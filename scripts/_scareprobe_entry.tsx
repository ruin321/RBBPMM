import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { JumpScare } from '@/components/JumpScare'

/* Scare 探针外壳：假详情页 + window.api 桩（close 只计数不真关）。 */

;(window as unknown as Record<string, unknown>).api = {
  window: {
    close: () => {
      const w = window as unknown as Record<string, number>
      w.__closed = (w.__closed || 0) + 1
    }
  }
}

function Harness(): React.JSX.Element {
  useEffect(() => {
    ;(window as unknown as { __ready: boolean }).__ready = true
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ height: 40, flexShrink: 0, borderBottom: '1px solid #555' }}>titlebar</div>
      <main className="flex-1 overflow-y-auto" style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
        <div className="scare-703263" style={{ position: 'relative', padding: 24 }}>
          <h1 style={{ fontSize: 24 }}>Scare probe page</h1>
          <p>content body for the jumpscare probe</p>
          <div style={{ height: 400 }} />
        </div>
      </main>
      <JumpScare />
    </div>
  )
}

createRoot(document.getElementById('host')!).render(<Harness />)
