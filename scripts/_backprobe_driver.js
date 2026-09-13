/* 探针驱动：量「详情页点返回 → 列表重新出现并完成绘制」的耗时。跑在真实组件上。
   结果既写进页面、也以 no-cors 信标发给本地 node 服务器（headless 里读得到）。 */
;(function () {
  // 结果走 window.__lines / window.__done，由 CDP 的 Runtime.evaluate 取回。
  // （file:// 页面往 127.0.0.1 发信标会被挡，别指望 Image/fetch。）
  window.__lines = []
  window.__done = false
  const logEl = document.getElementById('log')
  const log = (s) => {
    window.__lines.push(String(s))
    logEl.textContent += s + '\n'
  }
  const $ = (s) => document.querySelector(s)
  const $$ = (s) => Array.from(document.querySelectorAll(s))
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const rafOrTimeout = () =>
    Promise.race([new Promise((r) => requestAnimationFrame(() => r())), sleep(64)])
  const raf2 = async () => {
    await rafOrTimeout()
    await rafOrTimeout()
  }
  const scroller = () => $('main')
  const cards = () => $$('main .aspect-video').length
  const backBtn = () => $$('main header button').slice(-1)[0]

  async function waitFor(fn, timeout) {
    const t0 = performance.now()
    while (performance.now() - t0 < timeout) {
      if (fn()) return true
      await sleep(16)
    }
    return false
  }

  const longs = []
  let longtaskOk = true
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push(Math.round(e.duration)))).observe(
      { entryTypes: ['longtask'] }
    )
  } catch (e) {
    longtaskOk = false
  }

  const cfg = new URLSearchParams(location.hash.replace(/^#/, ''))
  const TARGET = Number(cfg.get('target') ?? 400)

  ;(async () => {
    log('cfg: ' + location.hash + '  longtaskObserver=' + longtaskOk)
    log('[0] viewport ' + innerWidth + 'x' + innerHeight + '  dpr=' + devicePixelRatio)
    const rafFired = await Promise.race([
      new Promise((r) => requestAnimationFrame(() => r(true))),
      sleep(800).then(() => false)
    ])
    log('[0] rAF 回调 = ' + rafFired)

    await waitFor(() => cards() > 0, 10000)
    log('[1] 首屏 cards=' + cards() + '  t=' + Math.round(performance.now()) + 'ms')

    let nudges = 0
    while (cards() < TARGET && nudges < 60) {
      const s = scroller()
      s.scrollTop = s.scrollHeight
      s.dispatchEvent(new Event('scroll'))
      nudges++
      await sleep(160)
    }
    log('[2] 跑到 ' + cards() + ' 条，用了 ' + nudges + ' 次触底触发')

    // 定到一个固定比例的位置，两个规模都好比较。
    // 赋值不一定一次生效（图片加载/布局会让 scrollHeight 变），轮询到真正停稳为止。
    const s = scroller()
    const wantScroll = Math.floor(s.scrollHeight * 0.6)
    const sticky = []
    s.scrollTop = wantScroll
    sticky.push('赋值后同帧=' + Math.round(s.scrollTop))
    for (let i = 0; i < 50; i++) {
      await sleep(40)
      sticky.push(Math.round(s.scrollTop))
      if (Math.abs(s.scrollTop - wantScroll) <= 8) break
      s.scrollTop = wantScroll
    }
    await raf2()
    window.__savedScroll = s.scrollTop
    const n0 = cards()
    log(
      '[3] 点卡片前：cards=' + n0 + '  wantScroll=' + wantScroll + '  scrollHeight=' + s.scrollHeight +
      '  轨迹[' + sticky.slice(0, 6).join(',') + (sticky.length > 6 ? ',…' : '') + ']'
    )

    // ── 前进：列表 → 详情 ──
    const tF0 = performance.now()
    $('main .grid .group').click()
    await waitFor(() => backBtn() !== undefined, 10000)
    await raf2()
    log('[4] 前进 list->detail ' + Math.round(performance.now() - tF0) + 'ms，列表卡片此时=' + cards())

    await sleep(500)

    // ── 后退：详情 → 列表 ──
    longs.length = 0
    const t0 = performance.now()
    backBtn().click()
    await waitFor(() => cards() >= n0, 30000)
    const domAt = performance.now() - t0
    await raf2()
    const paintAt = performance.now() - t0
    log(
      '[5] 后退 detail->list：DOM 到位 ' +
        Math.round(domAt) +
        'ms，绘制完成 ' +
        Math.round(paintAt) +
        'ms，cards=' +
        cards()
    )
    log('[6] 后退期间 longtask：' + JSON.stringify(longs) + ' 合计 ' + longs.reduce((a, b) => a + b, 0) + 'ms')

    let restoredAt = -1
    const trace = []
    for (let i = 0; i < 150 && restoredAt < 0; i++) {
      await sleep(20)
      const st = Math.round(scroller().scrollTop)
      const sh = Math.round(scroller().scrollHeight)
      if (i < 25 || i % 25 === 0) trace.push(st + '/' + sh)
      if (Math.abs(st - window.__savedScroll) < 8) restoredAt = performance.now() - t0
    }
    log(
      '[7] 滚动恢复：' +
        (restoredAt < 0 ? '没恢复' : Math.round(restoredAt) + 'ms') +
        '  scrollTop=' +
        Math.round(scroller().scrollTop) +
        '（期望 ' +
        window.__savedScroll +
        '）'
    )
    log('[7b] scrollTop/scrollHeight 轨迹：' + trace.join('  '))

    await sleep(700)
    log('[8] 静置 700ms 后 cards=' + cards() + '（多出来说明又被自动续加载了）')
    log('DONE')
    window.__done = true
  })().catch((e) => {
    log('ERROR ' + (e && e.stack ? e.stack : e))
    window.__done = true
  })
})()
