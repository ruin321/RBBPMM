const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'preview');
fs.mkdirSync(OUT, { recursive: true });

const esbuild = path.join(ROOT, 'node_modules/@esbuild/win32-x64/esbuild.exe');
const pkg = require(path.join(ROOT, 'package.json'));
execFileSync(esbuild, [
    path.join(ROOT, 'scripts/_nativeui_entry.tsx'),
    '--bundle', '--platform=browser', '--format=iife', '--jsx=automatic',
    '--outfile=' + path.join(OUT, 'app.js'),
    '--log-level=error',
    '--loader:.png=dataurl', '--loader:.gif=dataurl', '--loader:.wav=dataurl',
    '--define:process.env.NODE_ENV="production"',
    '--define:__APP_VERSION__=' + JSON.stringify(pkg.version),
    '--tsconfig=' + path.join(ROOT, 'tsconfig.web.json')
], { cwd: ROOT, stdio: 'inherit' });

const cssDir = path.join(ROOT, 'out/renderer/assets');
const cssName = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css'))
    .map((f) => ({ f, m: fs.statSync(path.join(cssDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0].f;
let css = fs.readFileSync(path.join(cssDir, cssName), 'utf8');

const absCssDir = cssDir.replace(/\\/g, '/');
css = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, p) => {
    if (/^(data:|https?:|file:)/.test(p))
        return m;
    const clean = p.replace(/^\.?\//, '');
    return `url("file:///${absCssDir}/${clean}")`;
});

const js = fs.readFileSync(path.join(OUT, 'app.js'), 'utf8');

const GOTO = `<script>
var tries = 0;
var iv = setInterval(function () {
  var hit = [].slice.call(document.querySelectorAll('aside button')).filter(function (x) {
    return /设置|Settings/.test(x.textContent || '');
  })[0];
  if (hit) { hit.click(); clearInterval(iv); }
  else if (++tries > 80) { clearInterval(iv); }
}, 40);
</script>`;

const page = (theme, nav) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>native ui preview - ${theme} - ${nav}</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<pre id="boot-error" style="display:none"></pre>
<script>
window.__probe = ['pre'];
window.onerror = function (m, s, l, c, e) {
  document.title = 'ERR:' + (e && e.stack ? e.stack.split('\\n').slice(0, 3).join(' | ') : m);
};
window.addEventListener('unhandledrejection', function (e) {
  document.title = 'REJ:' + String((e.reason && e.reason.stack) || e.reason);
});
</script>
<script>window.__FORCE_THEME=${JSON.stringify(theme)};</script>
${nav === 'settings' ? GOTO : ''}
<script>${js}</script>
<script>window.__probe.push('post');document.title=document.title+'+post';</script>
</body>
</html>`;

for (const theme of ['windows', 'dark']) {
    for (const nav of ['home', 'settings']) {
        fs.writeFileSync(path.join(OUT, `preview-${theme}-${nav}.html`), page(theme, nav));
    }
}

console.log('CSS: ' + cssName + ' (' + css.length + ' chars)');
console.log('JS: ' + js.length + ' chars');
console.log('OUT: ' + OUT);
