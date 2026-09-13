/* GlitchPage 探针跑批（真实时间）。「开门即坏」版断言：
    1. 页面就绪那一刻就已经带了 1~3 个 bug，且类型互不重复
    2. 17 种 bug 全部能强制下毒且病灶出现，healAll 后完全复原（逐类型 apply/restore）
    3. reroll（=退出再进）后变成新的随机 1~3 个，旧毒全部清干净、不叠加
    4. 真实重挂载（React key 变更 → unmount cleanup + mount）同样重摇 1~3 个
    5. 活动 bug 全部落在活动范围内；打开期间不自愈（不等待观察，结构上已无定时器）
   用法：node scripts/_glitchprobe_run.cjs [timeoutMs] */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, execFileSync } = require('child_process')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9339
const timeoutMs = Number(process.argv[2] || 90000)

const FILE_URL =
  'file:///C:/Users/Administrator/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev/out/renderer/_glitchprobe.html'

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
  const profile = path.join(os.tmpdir(), 'glitchprobe')
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
    await sleep(100) // 等 mount effect 跑完（开门即坏发生在 effect 里）

    const snap = `(() => {
      const texts = {}
      for (const id of ['t1', 't2', 't3']) texts[id] = document.getElementById(id).textContent
      const srcs = [document.getElementById('im1').src, document.getElementById('im2').src]
      const classes = [...document.querySelectorAll('[class*="glitch-"]')]
        .flatMap((el) => [...el.classList])
        .filter((c) => c !== 'glitch-713697')
      const marked = document.querySelectorAll('[data-glitch]').length
      return JSON.stringify({ texts, srcs, classes, marked })
    })()`
    const S = async () => JSON.parse(await ev(snap))
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    const healAll = async () => {
      await ev('window.__glitchPage.healAll()')
    }

    // ---- 1. 开门即坏：就绪时就带着 1~3 个互不重复的 bug ----
    const bootN = await ev('window.__glitchPage.appliedTypes()')
    const bootEls = await ev('window.__glitchPage.appliedEls().length')
    const bootMarked = (await S()).marked
    assert('1a 开门即带 1~3 个 bug', bootN >= 1 && bootN <= 3 && bootEls === bootN, {
      bootN,
      bootEls,
      bootMarked
    })
    const scopeHit = await ev(`(() => {
      const scope = document.querySelector('.glitch-713697').closest('main')
      return window.__glitchPage.appliedEls().every((el) => scope.contains(el))
    })()`)
    assert('1b 开场 bug 全在活动范围内', scopeHit === true, scopeHit)

    await healAll()
    const base = await S()
    assert('1c healAll 后回到干净基线', same(base, { texts: { t1: 'A short paragraph for text bugs.', t2: 'span text', t3: 'Section heading' }, srcs: base.srcs, classes: [], marked: 0 }), base)

    // ---- 2. 17 种 bug 逐个强制下毒 + 复原 ----
    const has = (s, k) => s.classes.some((c) => c.includes(k))
    const textChanged = (b, s) => ['t1', 't2', 't3'].some((id) => s.texts[id] !== b.texts[id])
    const CHECKS = {
      lang: (b, s) => textChanged(b, s),
      zalgo: (b, s) => ['t1', 't2', 't3'].some((id) => [...s.texts[id]].some((c) => c.codePointAt(0) >= 0x300)),
      overflow: (b, s) => has(s, 'glitch-nowrap'),
      nocss: (b, s) => has(s, 'glitch-nocss'),
      shift: (b, s) => has(s, 'glitch-shift'),
      undef: (b, s) => has(s, 'glitch-undef'),
      texrgb: (b, s) => has(s, 'glitch-rgb'),
      texswap: (b, s) => s.srcs[0] === b.srcs[1] && s.srcs[1] === b.srcs[0],
      flicker: (b, s) => has(s, 'glitch-flicker'),
      upside: (b, s) => has(s, 'glitch-upside'),
      mirror: (b, s) => has(s, 'glitch-mirror'),
      blur: (b, s) => has(s, 'glitch-blur'),
      ghost: (b, s) => has(s, 'glitch-ghost'),
      hue: (b, s) => has(s, 'glitch-hue'),
      tiny: (b, s) => has(s, 'glitch-tiny'),
      objobj: (b, s) => ['t1', 't2', 't3'].some((id) => s.texts[id] === '[object Object]'),
      garble: (b, s) => ['t1', 't2', 't3'].some((id) => /[▓▒░█▄▀▐▌]/.test(s.texts[id]))
    }
    const TYPES = Object.keys(CHECKS)
    let idx = 0
    for (const t of TYPES) {
      idx += 1
      const r = await ev(`window.__glitchPage.force(${JSON.stringify(t)})`)
      const s = await S()
      assert(`2-${idx}a ${t} 下毒生效`, r === t && CHECKS[t](base, s), { r, s })
      await healAll()
      const restored = same(await S(), base)
      assert(`2-${idx}b ${t} 复原`, restored)
    }

    // ---- 3. reroll = 退出再进：重摇随机 1~3 个，不叠加 ----
    const c0 = await ev('window.__glitchPage.spawnCount()')
    const rerolled = await ev('window.__glitchPage.reroll()')
    const c1 = await ev('window.__glitchPage.spawnCount()')
    const s3 = await S()
    assert('3a reroll 后仍是 1~3 个且真的重摇了', rerolled >= 1 && rerolled <= 3 && c1 - c0 === rerolled && s3.marked === rerolled, {
      rerolled,
      c0,
      c1,
      marked: s3.marked
    })
    await healAll()
    assert('3b reroll 后 healAll 仍能全复原', same(await S(), base))

    // ---- 4. 真实重挂载（React key 变更，走 unmount cleanup + 新 mount）----
    for (let gen = 1; gen <= 3; gen++) {
      const before = await S()
      await ev('window.__remount()')
      await sleep(150)
      const n = await ev('window.__glitchPage.appliedTypes()')
      const els = await ev('window.__glitchPage.appliedEls().length')
      const s4 = await S()
      // 旧毒不能残留：当前带毒元素数 == 新一组数量（cleanup 已把上一组清干净）
      assert(`4-${gen} 重挂载第${gen}次：重摇 1~3 个且无残留`, n >= 1 && n <= 3 && els === n && s4.marked === n, {
        n,
        els,
        marked: s4.marked,
        beforeMarked: before.marked
      })
    }

    // ---- 5. 收尾：stop + healAll 彻底复原 ----
    await ev('window.__glitchPage.stop()')
    await healAll()
    const s5 = await S()
    assert('5 stop+healAll 页面彻底复原', same(s5, base), s5)

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
