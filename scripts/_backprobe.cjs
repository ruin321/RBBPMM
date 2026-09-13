/* 打包真实 BananaPage 到无头浏览器里，量「返回列表」的耗时。
   用法：node scripts/_backprobe.cjs [after|before]   -> 产出 out/renderer/_backprobe-<tag>.html */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = 'C:/Users/Administrator/AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev'
const OUT = path.join(ROOT, 'out/renderer')
const TAG = (process.argv[2] || 'after').replace(/[^a-z0-9_-]/gi, '') || 'after'

// 取最新的构建 CSS，别硬编码 hash
const cssFile = fs
  .readdirSync(path.join(OUT, 'assets'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ f, m: fs.statSync(path.join(OUT, 'assets', f)).mtimeMs }))
  .sort((a, b) => b.m - a.m)[0].f

const entryFile = fs.existsSync(path.join(ROOT, `scripts/_backprobe_${TAG}.tsx`))
  ? `scripts/_backprobe_${TAG}.tsx`
  : 'scripts/_backprobe_entry.tsx'
const entry = path.join(ROOT, entryFile)
const jsOut = path.join(OUT, `_backprobe-${TAG}.js`)

const esbuild = path.join(ROOT, 'node_modules/@esbuild/win32-x64/esbuild.exe')
execFileSync(
  esbuild,
  [
    entry,
    '--bundle',
    '--platform=browser',
    '--format=iife',
    '--jsx=automatic',
    '--outfile=' + jsOut,
    '--log-level=warning',
    '--loader:.png=dataurl',
    '--loader:.gif=dataurl',
    '--loader:.wav=dataurl',
    '--loader:.jpg=dataurl',
    '--define:process.env.NODE_ENV="production"',
    '--alias:@=' + ROOT + '/src/renderer/src',
    '--alias:@renderer=' + ROOT + '/src/renderer/src',
    '--alias:@shared=' + ROOT + '/src/shared'
  ],
  { cwd: ROOT, stdio: 'inherit' }
)

const driver = fs.readFileSync(path.join(ROOT, 'scripts/_backprobe_driver.js'), 'utf8')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>back probe ${TAG}</title>
<link rel="stylesheet" href="./assets/${cssFile}">
<style>
  body { margin: 0; font: 13px/1.5 monospace; }
  #panel { position: fixed; right: 0; top: 0; width: 460px; height: 100vh; overflow: auto;
           background: #111; color: #0f0; padding: 10px; z-index: 9999; white-space: pre-wrap; }
  #host { position: fixed; left: 0; top: 0; width: calc(100vw - 460px); height: 100vh; }
</style>
</head>
<body>
<div id="host"></div>
<pre id="panel"><div id="log"></div></pre>
<script>${driver}</script>
<script src="./_backprobe-${TAG}.js"></script>
</body>
</html>
`

fs.writeFileSync(path.join(OUT, `_backprobe-${TAG}.html`), html)
console.log('css  ->', cssFile)
console.log('js   ->', path.basename(jsOut), Math.round(fs.statSync(jsOut).size / 1024) + 'kB')
console.log('html ->', `out/renderer/_backprobe-${TAG}.html`)
