/* 按钮逃跑探针跑批（全页面物理版）：真实时间 + CDP Input 注入真实鼠标事件。
   断言：
    A. 初始未启用：摸按钮/标题/段落 → 无松脱；触发按钮钉在内容区右下角
    B. 点击右下角原生按钮 → 启用（候选 = 页面上所有元素，非仅按钮）
    C. 碰 h1（纯标题，非按钮）→ 解锁被踢飞
    D. 碰 d1（纯 div，非按钮）→ 也被解锁（全元素语义）
    E. 碰 b1 按住 → 持续被推走；指针远离 → 摩擦减速静止
    F. 碰撞连锁：把 b1 向下压进 b2 → b2 被撞松
    G. 追到左缘反弹 + 松脱物全程不越出内容边界（内容坐标）
    H. 再点一次按钮 → 全场复位、关闭；之后碰按钮无效果
   用法：node scripts/_fleeprobe_run.cjs [timeoutMs] */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, execFileSync } = require('child_process')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
/** 随机端口：避免上一次异常退出留下的僵尸实例占口导致本次挂死 */
const PORT = 9341 + Math.floor(Math.random() * 50)
const timeoutMs = Number(process.argv[2] || 90000)

// 看门狗：无论卡在哪里（CDP 无响应等）都强制退出，绝不让跑批挂死
setTimeout(() => {
  console.log('WATCHDOG TIMEOUT — 进程被强制终止')
  process.exit(2)
}, timeoutMs + 60000).unref()

const FILE_URL =
  'file:///C:/Users/Administrator/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev/out/renderer/_fleeprobe.html'

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
  const profile = path.join(os.tmpdir(), 'fleeprobe')
  // 上一轮如果被看门狗强杀，Chrome 会变成僵尸 —— 用 PID 文件先清掉
  const pidFile = path.join(os.tmpdir(), 'fleeprobe.pid')
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

    const move = (x, y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })

    const rectOf = (id) => ev(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right } })()`)
    const mainRect = await ev(`(() => { const r = document.querySelector('main').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } })()`)
    const offsets = async () => ev('window.__flee.offsets()')
    const armed = () => ev('window.__flee.isArmed()')

    /** 把目标滚回可视区内（松脱物可能被撞出可视区，指针够不着），返回新 scrollTop */
    const ensureVisible = (id) =>
      ev(`(() => {
        const m = document.querySelector('main')
        const r = document.getElementById('${id}').getBoundingClientRect()
        const mr = m.getBoundingClientRect()
        if (r.top < mr.top + 60) m.scrollTop -= mr.top + 60 - r.top
        else if (r.bottom > mr.bottom - 60) m.scrollTop += r.bottom - (mr.bottom - 60)
        return m.scrollTop
      })()`)

    /** 真正的空档停靠点：右侧、p1 与 d1 之间的纵向空带（注意 h1 是整宽块级元素，
     *  顶带全是它的矩形，不能停） */
    const PARK = { x: mainRect.right - 60, y: mainRect.top + 240 }

    // ---- A. 初始未启用 ----
    assert('A1 初始未启用', (await armed()) === false)
    const b1 = await rectOf('b1')
    await move(b1.cx, b1.cy)
    await sleep(300)
    assert('A2 未启用时摸按钮不解锁', (await offsets()).length === 0, (await offsets()).length)
    // 指针停到空档，避免启用瞬间就把指针下的元素解锁
    await move(PARK.x, PARK.y)
    await sleep(100)
    // 触发按钮钉在内容区右下角（right/bottom 留白 20px）
    const btnRect = await ev(`(() => {
      const f = document.querySelector('.pointer-events-none.fixed')
      const btn = f ? f.querySelector('button') : null
      if (!btn) return null
      const r = btn.getBoundingClientRect()
      return { right: r.right, bottom: r.bottom, text: btn.textContent }
    })()`)
    assert(
      'A3 触发按钮在内容区右下角',
      btnRect && Math.abs(btnRect.right - (mainRect.right - 20)) < 4 && Math.abs(btnRect.bottom - (mainRect.bottom - 20)) < 4,
      { btnRect, mainRect }
    )

    // ---- B. 点击触发按钮 → 启用 ----
    await ev('window.__flee.trigger()')
    await sleep(150)
    assert('B1 点击按钮 → 启用', (await armed()) === true)
    assert('B2 候选非空（快照整页元素）', (await ev('window.__flee.candidateCount()')) > 0, await ev('window.__flee.candidateCount()'))

    // ---- C. 碰 h1（纯标题，非按钮）→ 被踢飞（摸它左端，别用整宽中心）----
    const h1 = await rectOf('h1')
    await move(h1.left + 80, (h1.top + h1.bottom) / 2)
    await sleep(250)
    let offs = await offsets()
    const cOff = offs.find((o) => o.id === 'h1')
    assert('C1 h1（非按钮）解锁', !!cOff, offs.map((o) => o.id))
    assert('C2 h1 被推走（位移 > 0）', cOff && Math.hypot(cOff.x, cOff.y) > 2, cOff)

    // ---- D. 碰 d1（纯 div）→ 也被解锁 ----
    const d1 = await rectOf('d1')
    await move(d1.cx, d1.cy)
    await sleep(250)
    offs = await offsets()
    const dOff = offs.find((o) => o.id === 'd1')
    assert('D1 d1（纯 div）解锁且位移 > 0', dOff && Math.hypot(dOff.x, dOff.y) > 2, offs.map((o) => o.id))

    // ---- E. 碰 b1 按住 → 持续逃；远离 → 摩擦静止 ----
    const b1b = await rectOf('b1')
    await move(b1b.cx, b1b.cy)
    await sleep(200)
    offs = await offsets()
    const eOff1 = offs.find((o) => o.id === 'b1')
    assert('E1 b1 解锁', !!eOff1, offs.map((o) => o.id))
    // 持续追着按中心（指针原地不动的话 b1 很快就逃出推力圈了）
    for (let i = 0; i < 12; i++) {
      const cur = await rectOf('b1')
      await move(cur.cx, cur.cy)
      await sleep(45)
    }
    offs = await offsets()
    const eOff2 = offs.find((o) => o.id === 'b1')
    await move(PARK.x, PARK.y) // 先移开指针再断言（防读数漂移）
    assert('E2 按住期间位移继续增长', eOff1 && eOff2 && Math.hypot(eOff2.x, eOff2.y) > Math.hypot(eOff1.x, eOff1.y) + 50, {
      e1: eOff1,
      e2: eOff2
    })
    let stable = false
    let prevKey = null
    for (let i = 0; i < 30; i++) {
      await sleep(220)
      const all = await offsets()
      const key = JSON.stringify(all.map((o) => [o.id, Math.round(o.x), Math.round(o.y)]))
      if (prevKey === key) {
        stable = true
        break
      }
      prevKey = key
    }
    assert('E3 撤走指针 → 全场摩擦静止', stable)

    // ---- F. 碰撞连锁（确定性）：复位重开 → 程序化解锁 b1 → 瞬移到 b2 正上方 → 向下压 ----
    await ev('window.__flee.reset()')
    await sleep(120)
    await ev('window.__flee.trigger()')
    await sleep(150)
    const f0offs = await offsets()
    const f0armed = await armed()
    const f0log = await ev('window.__flee.unlockLog()')
    assert('F0 复位重开后启用且无松脱', f0armed === true && f0offs.length === 0, { armed: f0armed, offs: f0offs, log: f0log })
    await ev('window.__flee.unlockId("b1", 0, 100)')
    // b1 瞬移到 b2 正上方 12px（内容坐标）
    const place = await ev(`(() => {
      const m = document.querySelector('main')
      const mr = m.getBoundingClientRect()
      const ct = mr.top - m.scrollTop
      const r2 = document.getElementById('b2').getBoundingClientRect()
      const b2Top = r2.top - ct
      const b1 = window.__flee.bodyRect('b1')
      if (!b1) return null
      window.__flee.tp('b1', r2.left - (mr.left - m.scrollLeft) - b1.leftC, b2Top - b1.topC - b1.h - 12)
      return window.__flee.bodyRect('b1')
    })()`)
    assert('F0b b1 已就位（b2 正上方）', !!place, { place, candidates: await ev('window.__flee.candidateIds()') })
    const trace = []
    for (let i = 0; i < 40; i++) {
      await ensureVisible('b1')
      const cur = await rectOf('b1')
      await move(cur.cx, cur.cy - 110) // 光标贴上方 ⇒ 持续向下推
      await sleep(40)
      if (i % 8 === 0) {
        trace.push(
          await ev(`(() => {
            const m = document.querySelector('main')
            const r = document.getElementById('b1').getBoundingClientRect()
            return { i: ${i}, st: m.scrollTop, b1Client: Math.round(r.top), b1Body: window.__flee.bodyRect('b1'), loose: window.__flee.looseIds() }
          })()`)
        )
      }
    }
    const looseIds = await ev('window.__flee.looseIds()')
    const f1diag = await ev(`(() => {
      const m = document.querySelector('main')
      const mr = m.getBoundingClientRect()
      const r2 = document.getElementById('b2').getBoundingClientRect()
      return { b1: window.__flee.bodyRect('b1'), b2Client: { top: r2.top, bottom: r2.bottom, left: r2.left }, scrollTop: m.scrollTop, log: window.__flee.unlockLog(), dbg: window.__flee.dbg(), candidates: window.__flee.candidateIds() }
    })()`)
    assert('F1 碰撞连锁：b2 被撞松', looseIds.includes('b2'), { looseIds, diag: f1diag, trace })

    // ---- G. 追到左缘反弹 + 全程不越界 ----
    let minLeft = Infinity
    for (let i = 0; i < 60; i++) {
      await ensureVisible('b1')
      const cur = await rectOf('b1')
      await move(cur.cx + 110, cur.cy) // 光标贴右侧 ⇒ 持续向左推
      await sleep(40)
      const r = await ev(`document.getElementById('b1').getBoundingClientRect().left`)
      minLeft = Math.min(minLeft, r)
    }
    assert('G1 b1 被追到撞左缘', minLeft <= mainRect.left + 4 + 16, { minLeft, limit: mainRect.left + 4 })

    const violation = await ev(`(() => {
      const m = document.querySelector('main')
      const mr = m.getBoundingClientRect()
      const cl = mr.left - m.scrollLeft
      const ct = mr.top - m.scrollTop
      for (const el of document.querySelectorAll('[data-flee]')) {
        const r = el.getBoundingClientRect()
        const l = r.left - cl
        const t = r.top - ct
        if (l < -2 || t < -2 || l + r.width > m.scrollWidth + 2 || t + r.height > m.scrollHeight + 2) {
          return { id: el.id || el.textContent, l, t, w: r.width, h: r.height, sw: m.scrollWidth, sh: m.scrollHeight }
        }
      }
      return null
    })()`)
    assert('G2 松脱物全程没越出内容边界', violation === null, violation)

    // ---- H. 再点按钮 → 复位、关闭 ----
    await ev('window.__flee.trigger()')
    await sleep(150)
    assert('H1 复位后未启用', (await armed()) === false)
    assert('H2 复位后无松脱物', (await offsets()).length === 0, (await offsets()).length)
    const cleared = await ev(`(() => {
      for (const el of document.querySelectorAll('[data-flee]')) return { leftover: el.id || el.textContent }
      const h1 = document.getElementById('h1')
      return { h1Transform: h1.style.transform || '(empty)' }
    })()`)
    assert('H3 transform 已清空', cleared && cleared.h1Transform === '(empty)', cleared)
    const b1c = await rectOf('b1')
    await move(b1c.cx, b1c.cy)
    await sleep(250)
    assert('H4 关闭后碰按钮无效果', (await offsets()).length === 0)

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
