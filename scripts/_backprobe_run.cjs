/* 跑探针（真实时间，不用 --virtual-time-budget —— 虚拟时间会把 performance.now() 压成 0，
   测出来的耗时全是假的）。结果经 CDP Runtime.evaluate 取回。
   用法：node scripts/_backprobe_run.cjs <tag> "<hash>" [timeoutMs] */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, execFileSync } = require('child_process')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333

const tag = process.argv[2] || 'after'
const hash = process.argv[3] || '#total=400&target=400'
const timeoutMs = Number(process.argv[4] || 90000)

const FILE_URL =
  'file:///C:/Users/Administrator/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev/out/renderer/_backprobe-' +
  tag +
  '.html' +
  hash

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await r.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch (e) {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error('没找到可调试的 page target')
}

function makeClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      const p = pending.get(msg.id)
      if (p) {
        pending.delete(msg.id)
        p(msg)
      }
    }
    ws.onerror = (e) => reject(new Error('ws error ' + (e && e.message)))
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
  const profile = path.join(os.tmpdir(), 'backprobe-' + tag)
  try {
    fs.rmSync(profile, { recursive: true, force: true })
  } catch (e) {
    /* ignore */
  }

  console.log('RUN ' + tag + '  ' + hash)
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--no-first-run',
      '--disable-extensions',
      '--window-size=1280,900',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + profile,
      FILE_URL
    ],
    { stdio: 'ignore' }
  )

  const kill = () => {
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(chrome.pid)], { stdio: 'ignore' })
    } catch (e) {
      try {
        chrome.kill('SIGKILL')
      } catch (e2) {
        /* ignore */
      }
    }
  }

  let lines = []
  try {
    const target = await findPageTarget()
    const cdp = await makeClient(target.webSocketDebuggerUrl)
    const deadline = Date.now() + timeoutMs
    let done = false
    while (Date.now() < deadline) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify({ lines: window.__lines || [], done: !!window.__done })',
        returnByValue: true
      })
      const payload = r.result && r.result.result && r.result.result.value
      if (payload) {
        const parsed = JSON.parse(payload)
        lines = parsed.lines
        done = parsed.done
      }
      if (done) break
      await sleep(400)
    }
    for (const l of lines) console.log('  ' + l)
    console.log(done ? 'OK done' : 'TIMEOUT (部分结果)')
    cdp.close()
    process.exitCode = done ? 0 : 1
  } catch (e) {
    console.log('RUNNER ERROR ' + e.message)
    process.exitCode = 1
  } finally {
    kill()
    await sleep(500)
    try {
      fs.rmSync(profile, { recursive: true, force: true })
    } catch (e) {
      /* ignore */
    }
  }
})()
