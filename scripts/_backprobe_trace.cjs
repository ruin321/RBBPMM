/* 跑 var 探针 + CDP Tracing（devtools.timeline），把「返回」窗口内的时间按事件名聚合。
   用法：node scripts/_backprobe_trace.cjs */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, execFileSync } = require('child_process')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const OUT =
  'C:/Users/Administrator/AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev/out/renderer'
const FILE_URL =
  'file:///C:/Users/Administrator/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev/out/renderer/_backprobe-var.html' +
  '#total=400&target=400'

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

function makeClient(wsUrl, onEvent) {
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
      } else if (onEvent) {
        onEvent(msg)
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
  const profile = path.join(os.tmpdir(), 'backprobe-trace')
  try {
    fs.rmSync(profile, { recursive: true, force: true })
  } catch (e) {}

  const chrome = spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--no-first-run', '--disable-extensions', '--window-size=1280,900',
      '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, FILE_URL
    ],
    { stdio: 'ignore' }
  )
  const kill = () => {
    try { execFileSync('taskkill', ['/F', '/T', '/PID', String(chrome.pid)], { stdio: 'ignore' }) }
    catch (e) { try { chrome.kill('SIGKILL') } catch (e2) {} }
  }

  const events = []
  try {
    const target = await findPageTarget()
    const cdp = await makeClient(target.webSocketDebuggerUrl, (msg) => {
      if (msg.method === 'Tracing.dataCollected') events.push(...msg.params.value)
    })
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
    await cdp.send('Profiler.start')
    await cdp.send('Tracing.start', {
      traceConfig: { includedCategories: ['devtools.timeline', 'v8'] }
    })
    // 等探针跑完（driver 写 DONE）
    const deadline = Date.now() + 150000
    let lines = []
    for (;;) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify({ lines: window.__lines || [], done: !!window.__done })',
        returnByValue: true
      })
      const payload = r.result?.result?.value
      if (payload) {
        lines = JSON.parse(payload).lines
        if (JSON.parse(payload).done) break
      }
      if (Date.now() > deadline) break
      await sleep(500)
    }
    for (const l of lines) console.log('  ' + l)
    await cdp.send('Tracing.end')
    // dataCollected 在 tracingComplete 前会陆续推完；给 5 秒收尾
    await sleep(5000)
    const profMsg = await cdp.send('Profiler.stop')
    const prof = profMsg?.result?.profile
    if (!prof) throw new Error('Profiler.stop 没返回 profile')
    fs.writeFileSync(path.join(OUT, '_backprobe.cpuprofile'), JSON.stringify(prof))
    console.log('cpuprofile -> out/renderer/_backprobe.cpuprofile  samples=' + prof.samples.length)
    cdp.close()
  } catch (e) {
    console.log('RUNNER ERROR ' + e.message)
  } finally {
    kill()
    await sleep(500)
    try { fs.rmSync(profile, { recursive: true, force: true }) } catch (e) {}
  }

  console.log('events collected:', events.length)
  const agg = new Map()
  for (const ev of events) {
    if (!ev.ph || ev.ph !== 'X' || ev.dur == null) continue
    const key = ev.name
    const cur = agg.get(key) || { n: 0, ms: 0, max: 0 }
    cur.n++
    cur.ms += ev.dur / 1000
    cur.max = Math.max(cur.max, ev.dur / 1000)
    agg.set(key, cur)
  }
  const top = [...agg.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 18)
  console.log('=== 按事件名聚合（总耗时 ms / 次数 / 最长单次 ms）===')
  for (const [k, v] of top) console.log(`${v.ms.toFixed(0).padStart(7)}ms  ${String(v.n).padStart(5)}x  max=${v.max.toFixed(0).padStart(6)}ms  ${k}`)

  // CPU profile 分析：按时间顺序算每 ms 的采样，找最后的重块（长任务窗口）
  try {
    const prof = JSON.parse(fs.readFileSync(path.join(OUT, '_backprobe.cpuprofile'), 'utf8'))
    const nodes = new Map(prof.nodes.map((n) => [n.id, n]))
    // 累计时间轴
    let t = 0
    const timeline = []
    for (let i = 0; i < prof.samples.length; i++) {
      const dt = prof.timeDeltas[i] / 1000 || 0
      t += dt
      timeline.push({ t, id: prof.samples[i] })
    }
    const total = t
    // 滑窗 100ms 找最后 5 秒内最重的窗口
    const winMs = 100
    const buckets = new Map()
    for (const s of timeline) {
      const b = Math.floor(s.t / winMs)
      buckets.set(b, (buckets.get(b) || 0) + 1)
    }
    const hottest = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    console.log('=== 最热 100ms 窗口（bucketIndex*100ms 采样数/总' + Math.round(total) + 'ms）===')
    for (const [b, n] of hottest) {
      // 这个窗口内的函数自用时（按采样归属）
      const fn = new Map()
      for (const s of timeline) {
        if (Math.floor(s.t / winMs) !== b) continue
        const node = nodes.get(s.id)
        if (!node) continue
        const f = node.callFrame
        const key = (f.functionName || '(anon)') + ' @ ' + (f.url || '').split('/').pop() + ':' + f.lineNumber
        fn.set(key, (fn.get(key) || 0) + 1)
      }
      const topFn = [...fn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      console.log(`t=${(b * winMs / 1000).toFixed(1)}s  ${n} samples`)
      for (const [k, v] of topFn) console.log(`    ${String(v).padStart(4)}x  ${k}`)
    }
  } catch (e) {
    console.log('profile分析失败: ' + e.message)
  }
  process.exitCode = events.length ? 0 : 2
})()
