/* 打包真实 MagneticCursor 到无头浏览器。产出 out/renderer/_magnetprobe.html
   用法：node scripts/_magnetprobe.cjs */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = 'C:/Users/Administrator/AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev'
const OUT = path.join(ROOT, 'out/renderer')

const cssFile = fs
  .readdirSync(path.join(OUT, 'assets'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ f, m: fs.statSync(path.join(OUT, 'assets', f)).mtimeMs }))
  .sort((a, b) => b.m - a.m)[0].f

const entry = path.join(ROOT, 'scripts/_magnetprobe_entry.tsx')
const jsOut = path.join(OUT, '_magnetprobe.js')

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
    '--define:process.env.NODE_ENV="production"',
    '--alias:@=' + ROOT + '/src/renderer/src',
    '--alias:@renderer=' + ROOT + '/src/renderer/src',
    '--alias:@shared=' + ROOT + '/src/shared'
  ],
  { cwd: ROOT, stdio: 'inherit' }
)

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>magnet probe</title>
<link rel="stylesheet" href="./assets/${cssFile}">
<style>
  body { margin: 0; font: 13px/1.5 monospace; }
</style>
</head>
<body>
<div id="host"></div>
<script src="./_magnetprobe.js"></script>
</body>
</html>
`

fs.writeFileSync(path.join(OUT, '_magnetprobe.html'), html)
console.log('css  ->', cssFile)
console.log('js   ->', path.basename(jsOut), Math.round(fs.statSync(jsOut).size / 1024) + 'kB')
console.log('html ->', 'out/renderer/_magnetprobe.html')
