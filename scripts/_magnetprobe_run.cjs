/* 磁吸光标探针跑批：真实时间 + CDP Input 注入**真实（trusted）鼠标事件**。
   断言：
    A. CSS：作用域内 cursor 全部 none（含 cursor-pointer 按钮），作用域外保持 pointer
    B. 吸附：P1(420,140) 距 b1 右缘 40px → 吸向 b1 中心 (320,140)
       - 80ms 后指针在半路（缓动，不是瞬移也不是不动）
       - 1.1s 后贴住中心 ≤2px，b1 挂上 .magnet-target
    C. 点击劫持：在 P1 真实点击 → b1 收到 click，真实落点 overlay 收不到
    D. 真指针压在 b1 上时点击 → 正常路径（b1 再 +1）
    E. 远离按钮 (560,140) → 不吸附，指针贴合鼠标，点击正常落在 container
    F. 靠近禁用按钮 (420,320) → 不吸附
    G. 鼠标去侧边栏 (100,450) → 假指针隐藏
    H. 靠近 summary (300,430) → 吸附；点击 → details 展开
   用法：node scripts/_magnetprobe_run.cjs [timeoutMs] */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, execFileSync } = require('child_process')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9337
const timeoutMs = Number(process.argv[2] || 90000)

const FILE_URL =
  'file:///C:/Users/Administrator/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev/out/renderer/_magnetprobe.html'

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
  const profile = path.join(os.tmpdir(), 'magnetprobe')
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
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`)
  }

  try {
    const target = await findPageTarget()
    const cdp = await makeClient(target.webSocketDebuggerUrl)

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })
      if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
      return r.result && r.result.result ? r.result.result.value : undefined
    }

    // 等 React 挂好
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline && !(await ev('!!window.__ready'))) await sleep(200)
    if (!(await ev('!!window.__ready'))) throw new Error('页面没就绪')

    const state = async () =>
      JSON.parse(
        await ev(`(() => {
      const img = document.querySelector('.magnet-fake-cursor')
      const m = /translate3d\\(([-\\d.]+)px, ([-\\d.]+)px/.exec((img && img.style.transform) || '')
      const t = document.querySelector('.magnet-target')
      return JSON.stringify({
        x: m ? +m[1] + 23 : null,
        y: m ? +m[2] + 16 : null,
        snap: t ? t.id : null,
        opacity: img ? getComputedStyle(img).opacity : null,
        cursorB1: getComputedStyle(document.getElementById('b1')).cursor,
        cursorContainer: getComputedStyle(document.getElementById('container')).cursor,
        cursorAside: getComputedStyle(document.getElementById('asideB')).cursor,
        cursorSummary: getComputedStyle(document.getElementById('sum')).cursor,
        clicks: window.__clicks,
        detOpen: document.getElementById('det').open,
        natW: img ? img.naturalWidth : 0
      })
    })()`)
      )

    const move = (x, y) =>
      cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    const click = async (x, y) => {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await sleep(30)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    }

    // ---- A. CSS 断言（还没动鼠标）----
    let s = await state()
    assert('A1 b1(cursor-pointer) 计算值 none', s.cursorB1 === 'none', s.cursorB1)
    assert('A2 容器计算值 none', s.cursorContainer === 'none', s.cursorContainer)
    assert('A3 summary 计算值 none', s.cursorSummary === 'none', s.cursorSummary)
    assert('A4 侧边栏按钮保持 pointer', s.cursorAside === 'pointer', s.cursorAside)
    assert('A5 假指针图 64px 解码', s.natW === 64, String(s.natW))
    assert('A6 未动鼠标前假指针隐藏', s.opacity === '0', s.opacity)

    // ---- B. 吸附 + 缓动 ----
    await move(420, 140)
    await sleep(80)
    s = await state()
    assert(
      'B1 80ms 后在半路（缓动非瞬移）',
      s.snap === 'b1' && s.x > 325 && s.x < 415 && Math.abs(s.y - 140) <= 2,
      `x=${s.x} y=${s.y} snap=${s.snap}`
    )
    await sleep(1100)
    s = await state()
    assert('B2 贴住 b1 中心 ≤2px', Math.abs(s.x - 320) <= 2 && Math.abs(s.y - 140) <= 2, `x=${s.x} y=${s.y}`)
    assert('B3 b1 挂上提示圈', s.snap === 'b1', s.snap)

    // ---- C. 点击劫持：真实落点在 overlay 上 ----
    await click(420, 140)
    await sleep(150)
    s = await state()
    assert('C1 b1 收到转发的 click ×1', s.clicks.b1 === 1, JSON.stringify(s.clicks))
    assert('C2 真实落点 overlay 没收到 click', s.clicks.overlay === 0, JSON.stringify(s.clicks))
    assert('C3 容器只吃到 b1 冒泡的 1 次', s.clicks.container === 1, JSON.stringify(s.clicks))

    // ---- D. 真指针压在吸附目标上 → 正常路径 ----
    await click(320, 140)
    await sleep(150)
    s = await state()
    assert('D1 b1 正常再收 ×1', s.clicks.b1 === 2, JSON.stringify(s.clicks))
    assert('D2 overlay 仍为 0', s.clicks.overlay === 0, JSON.stringify(s.clicks))

    // ---- E. 远离按钮：不吸附，点击穿透正常 ----
    await move(560, 140)
    await sleep(1200)
    s = await state()
    assert('E1 不吸附', s.snap === null, String(s.snap))
    assert('E2 指针贴合鼠标', Math.abs(s.x - 560) <= 3 && Math.abs(s.y - 140) <= 3, `x=${s.x} y=${s.y}`)
    await click(560, 140)
    await sleep(150)
    s = await state()
    assert('E3 点击正常落 container', s.clicks.container === 3 && s.clicks.b1 === 2, JSON.stringify(s.clicks))

    // ---- F. 禁用按钮不吸 ----
    await move(420, 320)
    await sleep(800)
    s = await state()
    assert('F1 禁用按钮不吸附', s.snap === null, String(s.snap))
    assert('F2 指针贴合鼠标', Math.abs(s.x - 420) <= 3 && Math.abs(s.y - 320) <= 3, `x=${s.x} y=${s.y}`)

    // ---- G. 去侧边栏：假指针隐藏 ----
    await move(100, 450)
    await sleep(500)
    s = await state()
    assert('G1 假指针隐藏', s.opacity === '0', s.opacity)
    assert('G2 无吸附', s.snap === null, String(s.snap))

    // ---- H. summary 吸附 + 点击展开 ----
    await move(300, 430)
    await sleep(900)
    s = await state()
    assert('H1 吸附 summary', s.snap === 'sum', String(s.snap))
    await click(300, 430)
    await sleep(150)
    s = await state()
    assert('H2 details 展开', s.detOpen === true, String(s.detOpen))
    assert('H3 summary 收到 click ×1', s.clicks.sum === 1, JSON.stringify(s.clicks))

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
