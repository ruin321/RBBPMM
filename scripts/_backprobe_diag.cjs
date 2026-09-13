/* 一次性诊断：探针页里的 main 到底是不是真滚动容器。 */
const { spawn, execFileSync } = require('child_process')
const os = require('os')
const path = require('path')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const FILE_URL =
  'file:///C:/Users/Administrator/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev/out/renderer/_backprobe-after.html#total=400&target=400'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await r.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch (e) {}
    await sleep(250)
  }
  throw new Error('no page target')
}
function makeClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== undefined) {
        const p = pending.get(msg.id)
        if (p) {
          pending.delete(msg.id)
          p(msg)
        }
      }
    }
    ws.onerror = () => reject(new Error('ws error'))
    ws.onopen = () =>
      resolve({
        send: (method, params) =>
          new Promise((res) => {
            id += 1
            pending.set(id, res)
            ws.send(JSON.stringify({ id, method, params }))
          }),
        close: () => ws.close()
      })
  })
}
;(async () => {
  const profile = path.join(os.tmpdir(), 'backprobe-diag')
  try { fs_rm(profile) } catch (e) {}
  function fs_rm(p) { require('fs').rmSync(p, { recursive: true, force: true }) }

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--no-first-run', '--disable-extensions', '--window-size=1280,900',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, FILE_URL
  ], { stdio: 'ignore' })
  const kill = () => {
    try { execFileSync('taskkill', ['/F', '/T', '/PID', String(chrome.pid)], { stdio: 'ignore' }) }
    catch (e) { try { chrome.kill('SIGKILL') } catch (e2) {} }
  }
  try {
    const target = await findPageTarget()
    const cdp = await makeClient(target.webSocketDebuggerUrl)
    // 等列表出来
    for (let i = 0; i < 60; i++) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'document.querySelectorAll("main .aspect-video").length',
        returnByValue: true
      })
      if ((r.result?.result?.value || 0) > 0) break
      await sleep(300)
    }
    const expr = `(() => {
      const m = document.querySelector('main')
      const cs = getComputedStyle(m)
      const before = m.scrollTop
      m.scrollTop = 1000
      const afterAssign = m.scrollTop
      m.scrollTop = before
      const host = document.getElementById('host')
      return JSON.stringify({
        clientH: m.clientHeight, scrollH: m.scrollHeight,
        offsetH: m.offsetHeight, rectH: Math.round(m.getBoundingClientRect().height),
        overflowY: cs.overflowY, minH: cs.minHeight,
        hostH: host ? host.clientHeight : -1,
        parentClass: m.parentElement.className,
        parentH: m.parentElement.clientHeight,
        parentScrollH: m.parentElement.scrollHeight,
        assignTest: { before, afterAssign }
      })
    })()`
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })
    console.log(r.result?.result?.value)
    cdp.close()
  } catch (e) {
    console.log('DIAG ERROR ' + e.message)
  } finally {
    kill()
    await sleep(400)
    try { fs_rm(profile) } catch (e) {}
  }
})()
