/* 突脸探针跑批：真实时间 + CDP。
   断言：
    A. 左下角 gif 小图钉在内容区左下角（留白 20px）；初始无黑幕
    B. 点击 → 黑幕出现（全屏 fixed、黑底）
    C. 放大进行中：gif 的 computed transform scaleX 在 0.06 → 1 途中
    D. 放大完成约 1.3s 后 → window.api.window.close 恰好被调用一次
   用法：node scripts/_scareprobe_run.cjs [timeoutMs] */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, execFileSync } = require('child_process')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
/** 随机端口：避免上一次异常退出留下的僵尸实例占口导致本次挂死 */
const PORT = 9341 + Math.floor(Math.random() * 50)
const timeoutMs = Number(process.argv[2] || 90000)

// 看门狗：无论卡在哪里都强制退出
setTimeout(() => {
  console.log('WATCHDOG TIMEOUT — 进程被强制终止')
  process.exit(2)
}, timeoutMs + 60000).unref()

const FILE_URL =
  'file:///C:/Users/Administrator/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev/out/renderer/_scareprobe.html'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await Promise.race([
        fetch(`http://127.0.0.1:${PORT}/json/list`),
        new Promise((_, rej) => setTimeout(() => rej(new Error('fetch timeout')), 2000))
      ])
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
    const bootTimeout = setTimeout(() => {
      try { ws.close() } catch (e) { /* ignore */ }
      reject(new Error('ws handshake timeout'))
    }, 5000)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      const p = pending.get(msg.id)
      if (p) {
        pending.delete(msg.id)
        p(msg)
      }
    }
    ws.onerror = (e) => {
      clearTimeout(bootTimeout)
      reject(new Error('ws error ' + (e && e.message)))
    }
    ws.onopen = () => {
      clearTimeout(bootTimeout)
      resolve({
        send: (method, params) =>
          new Promise((res) => {
            id += 1
            pending.set(id, res)
            ws.send(JSON.stringify({ id, method, params }))
          }),
        close: () => ws.close()
      })
    }
  })
}

;(async () => {
  const profile = path.join(os.tmpdir(), 'scareprobe')
  // 上一轮如果被看门狗强杀，Chrome 会变成僵尸 —— 用 PID 文件先清掉
  const pidFile = path.join(os.tmpdir(), 'scareprobe.pid')
  try {
    const oldPid = fs.readFileSync(pidFile, 'utf8').trim()
    if (oldPid) execFileSync('taskkill', ['/F', '/T', '/PID', oldPid], { stdio: 'ignore' })
  } catch (e) {
    /* no stale pid */
  }
  try {
    fs.rmSync(profile, { recursive: true, force: true })
  } catch (e) {
    /* ignore */
  }

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
  fs.writeFileSync(pidFile, String(chrome.pid))
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

  let pass = 0
  let fail = 0
  const results = []
  const assert = (name, ok, detail) => {
    if (ok) pass += 1
    else fail += 1
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  [' + JSON.stringify(detail) + ']' : ''}`)
  }

  try {
    const target = await findPageTarget()
    const cdp = await makeClient(target.webSocketDebuggerUrl)

    const ev = async (expr) => {
      const r = await Promise.race([
        cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('ev timeout: ' + expr.slice(0, 60))), 10000))
      ])
      if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
      return r.result && r.result.result ? r.result.result.value : undefined
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline && !(await ev('!!window.__ready'))) await sleep(200)
    if (!(await ev('!!window.__ready'))) throw new Error('页面没就绪')

    // ---- A. 左下角小图 ----
    const mainRect = await ev(`(() => { const r = document.querySelector('main').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } })()`)
    const btnRect = await ev('window.__scare.rect()')
    assert(
      'A1 gif 按钮钉在内容区左下角',
      btnRect &&
        Math.abs(btnRect.left - (mainRect.left + 20)) < 4 &&
        Math.abs(btnRect.bottom - (mainRect.bottom - 20)) < 4 &&
        btnRect.left >= mainRect.left &&
        btnRect.bottom <= mainRect.bottom,
      { btnRect, mainRect }
    )
    assert('A2 初始无黑幕', (await ev('window.__scare.overlay()')) === null)

    // ---- B. 点击 → 黑幕 + 开始放大 ----
    await ev('window.__scare.fire()')
    await sleep(120)
    const ov1 = await ev('window.__scare.overlay()')
    assert('B1 点击后黑幕出现（黑底 fixed）', ov1 && ov1.bg === 'rgb(0, 0, 0)', ov1)
    const parseScale = (m) => (m && m !== 'none' ? Number(m.split(',')[0].replace('matrix(', '')) : null)
    assert('B2 初始 scaleX 很小（< 0.2）', ov1 && parseScale(ov1.imgTransform) !== null && parseScale(ov1.imgTransform) < 0.2, ov1 && ov1.imgTransform)

    // ---- C. 放大进行中 ----
    await sleep(450)
    const ov2 = await ev('window.__scare.overlay()')
    const s2 = parseScale(ov2 && ov2.imgTransform)
    assert('C1 放大途中 scaleX 明显增长', s2 !== null && s2 > 0.25, { s2, t: ov2 && ov2.imgTransform })

    // ---- D. 约 1.3s 后关窗 ----
    await sleep(1400)
    const closed = await ev('window.__closed || 0')
    assert('D1 window.api.window.close 恰好调用一次', closed === 1, closed)
    const ov3 = await ev('window.__scare.overlay()')
    const s3 = parseScale(ov3 && ov3.imgTransform)
    assert('D2 放大完成 scaleX ≈ 1', s3 !== null && s3 > 0.95, s3)

    console.log(results.join('\n'))
    console.log(`\n===> ${pass} PASS / ${fail} FAIL`)
    cdp.close()
    process.exitCode = fail === 0 ? 0 : 1
  } catch (e) {
    console.log(results.join('\n'))
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
