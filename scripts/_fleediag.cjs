#!/usr/bin/env node
/* 最小诊断：mousemove 之后渲染进程是否还活着 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, execFileSync } = require('child_process')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9341 + Math.floor(Math.random() * 50)
const FILE_URL =
  'file:///C:/Users/Administrator/AppData/Roaming/TRAE%20SOLO%20CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev/out/renderer/_fleeprobe.html'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await Promise.race([
        fetch(`http://127.0.0.1:${PORT}/json/list`),
        new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 2000))
      ])
      const list = await r.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch (e) {}
    await sleep(250)
  }
  throw new Error('no target')
}

function makeClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    const events = []
    const boot = setTimeout(() => reject(new Error('ws handshake timeout')), 5000)
    ws.onmessage = (evm) => {
      const msg = JSON.parse(evm.data)
      if (msg.id) {
        const p = pending.get(msg.id)
        if (p) {
          pending.delete(msg.id)
          p(msg)
        }
      } else {
        events.push(msg.method + (msg.params && msg.params.exceptionDetails ? ' :: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300) : ''))
        if (events.length > 40) events.shift()
      }
    }
    ws.onerror = (e) => { clearTimeout(boot); reject(new Error('ws error')) }
    ws.onopen = () => {
      clearTimeout(boot)
      resolve({
        events,
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
  const profile = path.join(os.tmpdir(), 'fleediag')
  const pidFile = path.join(os.tmpdir(), 'fleediag.pid')
  try {
    const oldPid = fs.readFileSync(pidFile, 'utf8').trim()
    if (oldPid) execFileSync('taskkill', ['/F', '/T', '/PID', oldPid], { stdio: 'ignore' })
  } catch (e) {}
  try { fs.rmSync(profile, { recursive: true, force: true }) } catch (e) {}

  const chrome = spawn(
    CHROME,
    ['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--no-first-run','--disable-extensions','--window-size=1280,900','--remote-debugging-port='+PORT,'--user-data-dir='+profile,FILE_URL],
    { stdio: 'ignore' }
  )
  fs.writeFileSync(pidFile, String(chrome.pid))
  setTimeout(() => { try { execFileSync('taskkill', ['/F','/T','/PID',String(chrome.pid)],{stdio:'ignore'}) } catch(e){} process.exit(2) }, 60000).unref()

  try {
    const target = await findPageTarget()
    const cdp = await makeClient(target.webSocketDebuggerUrl)
    const ev = async (expr, ms = 5000) => {
      const r = await Promise.race([
        cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('ev timeout')), ms))
      ])
      return r.result && r.result.result ? r.result.result.value : undefined
    }
    while (!(await ev('!!window.__ready', 5000))) await sleep(200)
    console.log('ready ✓')

    console.log('armed pre-move:', await ev('window.__flee.isArmed()'))
    console.log('move...')
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 84, y: 231 })
    await sleep(500)
    console.log('evaluate after move:', await ev('1+1', 5000))
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 84, y: 232 })
    await sleep(500)
    console.log('evaluate after move2:', await ev('1+1', 5000))
    await sleep(1500)
    console.log('armed:', await ev('window.__flee.isArmed()', 5000))
    console.log('loose:', JSON.stringify(await ev('window.__flee.looseIds()', 5000)))
    console.log('events:', JSON.stringify(cdp.events, null, 1))
  } catch (e) {
    console.log('DIAG ERROR ' + e.message)
  } finally {
    try { execFileSync('taskkill', ['/F','/T','/PID',String(chrome.pid)],{stdio:'ignore'}) } catch(e){}
  }
})()
