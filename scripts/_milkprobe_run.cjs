/* 牛奶探针跑批：真实时间 + CDP 注入**真实（trusted）点击**。
   断言：
    A. 右下角牛奶按钮：钉在内容区右下角（不压标题栏/侧边栏），图片解码成功，初始未翻转
    B. 点一下：is-milk-flipped 挂上挂点根节点、正在放 Drink.wav、
       过渡结束后牛奶瓶图片倒转（页面本身不转）、内容全部隐成空气、牛奶按钮自己仍可见
    C. 再点一下：正在放反转音频、类摘掉、过渡结束后牛奶瓶回正、内容恢复
   用法：node scripts/_milkprobe_run.cjs [timeoutMs] */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, execFileSync } = require('child_process')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9342
const timeoutMs = Number(process.argv[2] || 90000)

const FILE_URL =
  'file:///C:/Users/Administrator/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev/out/renderer/_milkprobe.html'

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
  const profile = path.join(os.tmpdir(), 'milkprobe')
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
      '--autoplay-policy=no-user-gesture-required',
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
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  [' + JSON.stringify(detail) + ']' : ''}`)
  }

  try {
    const target = await findPageTarget()
    const cdp = await makeClient(target.webSocketDebuggerUrl)

    const ev = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true })
      if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
      return r.result && r.result.result ? r.result.result.value : undefined
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline && !(await ev('!!window.__ready'))) await sleep(200)
    if (!(await ev('!!window.__ready'))) throw new Error('页面没就绪')
    await sleep(150)

    const clickAt = async (x, y) => {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await sleep(30)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    }

    const state = async () =>
      JSON.parse(
        await ev(`(() => {
      const marker = document.querySelector('.milk-708588')
      const btn = document.querySelector('.milk-btn')
      const img = btn && btn.querySelector('img')
      const c1 = document.getElementById('c1')
      return JSON.stringify({
        flipped: window.__milk.isFlipped(),
        cls: marker.classList.contains('is-milk-flipped'),
        btnCls: btn.classList.contains('milk-flipped'),
        playing: window.__milk.playing(),
        lastAction: window.__milk.lastAction(),
        btnRect: window.__milk.rect(),
        mainRect: (() => { const r = document.querySelector('main').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } })(),
        natW: img ? img.naturalWidth : 0,
        btnOpacity: btn ? getComputedStyle(btn).opacity : null,
        c1Opacity: getComputedStyle(c1).opacity,
        markerTransform: getComputedStyle(marker).transform,
        imgTransform: img ? getComputedStyle(img).transform : null
      })
    })()`)
      )

    const clickMilk = async () => {
      const r = (await ev('window.__milk.rect()'))
      await clickAt(Math.round((r.left + r.right) / 2), Math.round((r.top + r.bottom) / 2))
    }

    // ---- A. 初始状态 ----
    let s = await state()
    const btnRightOk = Math.abs(s.btnRect.right - (s.mainRect.right - 20)) <= 3
    const btnBottomOk = Math.abs(s.btnRect.bottom - (s.mainRect.bottom - 20)) <= 3
    assert('A1 牛奶钉在内容区右下角', btnRightOk && btnBottomOk, { btn: s.btnRect, main: s.mainRect })
    assert('A2 牛奶图解码成功', s.natW > 0, s.natW)
    assert('A3 初始未翻转', !s.flipped && !s.cls && s.lastAction === null && s.markerTransform === 'none', {
      flipped: s.flipped,
      cls: s.cls,
      lastAction: s.lastAction,
      tf: s.markerTransform
    })

    // ---- B. 第一口：翻转 + 空气 ----
    await clickMilk()
    await sleep(120)
    s = await state()
    assert('B1 点击后 flipped + 类已挂 + 在放 Drink', s.flipped && s.cls && (s.playing === 'drink' || s.lastAction === 'drink'), {
      flipped: s.flipped,
      cls: s.cls,
      playing: s.playing,
      lastAction: s.lastAction
    })
    await sleep(1300)
    s = await state()
    const imgRotated = s.imgTransform.includes('-1') // matrix(-1,0,0,-1,0,0) = rotate(180deg)
    assert('B2 过渡后牛奶瓶倒转、页面本身不转', imgRotated && s.markerTransform === 'none', {
      img: s.imgTransform,
      marker: s.markerTransform
    })
    assert('B3 内容变成空气（c1 隐没）', parseFloat(s.c1Opacity) < 0.05, s.c1Opacity)
    assert('B4 牛奶按钮自己仍可见', s.btnOpacity === '1' && parseFloat(s.btnOpacity) === 1, s.btnOpacity)

    // ---- C. 第二口：反转音频 + 回正 ----
    await clickMilk()
    await sleep(120)
    s = await state()
    assert('C1 点击后在放反转音频 + 类已摘', !s.flipped && !s.cls && (s.playing === 'rev' || s.lastAction === 'rev'), {
      flipped: s.flipped,
      cls: s.cls,
      playing: s.playing,
      lastAction: s.lastAction
    })
    await sleep(1300)
    s = await state()
    assert('C2 牛奶瓶回正、页面保持不转', s.imgTransform === 'none' && s.markerTransform === 'none', {
      img: s.imgTransform,
      marker: s.markerTransform
    })
    assert('C3 内容恢复', s.c1Opacity === '1', s.c1Opacity)

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
