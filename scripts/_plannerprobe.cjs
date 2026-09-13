#!/usr/bin/env node
/* BBMM 启发式分拣验证：把 ModArchivePlanner 单独打包，跑临时 fixture 断言。
 * 用法：node scripts/_plannerprobe.cjs
 * 前置：npx esbuild src/main/services/ModArchivePlanner.ts --bundle --platform=node
 *       --format=cjs --outfile=out/_plannerprobe_module.cjs
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'out', '_plannerprobe_module.cjs')

// 1) 打包 planner（无 electron 依赖，可直接 bundle）
require(path.join(ROOT, 'node_modules', 'esbuild')).buildSync({
  entryPoints: [path.join(ROOT, 'src', 'main', 'services', 'ModArchivePlanner.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: OUT,
  logLevel: 'silent'
})
const planner = require(OUT)
const { collectTargets, isValidGuidFolderName, isTemplateFolderName } = planner

let pass = 0
let fail = 0
function assert(name, cond, detail) {
  if (cond) {
    pass++
    console.log(`PASS  ${name}`)
  } else {
    fail++
    console.log(`FAIL  ${name}  ${JSON.stringify(detail ?? '')}`)
  }
}

// ---- 纯函数规则 ----
assert('GUID: com.example.mod 合法', isValidGuidFolderName('com.example.mod'))
assert('GUID: a.b 两段合法', isValidGuidFolderName('a.b'))
assert('GUID: a.b.c.d.e 五段合法', isValidGuidFolderName('a.b.c.d.e'))
assert('GUID: a.b.c.d.e.f 六段不合法', !isValidGuidFolderName('a.b.c.d.e.f'))
assert('GUID: 无点不合法', !isValidGuidFolderName('myfolder'))
assert('GUID: 大写不合法', !isValidGuidFolderName('Com.Example'))
assert('GUID: 连字符不合法', !isValidGuidFolderName('com.my-mod'))
assert('GUID: 空串不合法', !isValidGuidFolderName(''))
assert('模板: 含 template', isTemplateFolderName('My_Template_Pack'))
assert('模板: 含 example', isTemplateFolderName('Examples'))
assert('模板: 普通名字否', !isTemplateFolderName('CoolMod'))

// ---- fixture：无布局的散包 ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plannerprobe-'))
const root = path.join(tmp, 'extract')
let W = (rel, content) => {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content ?? 'x')
}
W('MyMod.dll')
W('MyMod.pdb')
W('MyMod.xml')
W('MyMod.deps.json')
W('MyMod.json')
W('unrelated.json')
W('nested/patchers/Helper.dll') // 注意：根级 patchers/ 会触发结构化分支，这里放深层测启发式
W('nested/patchers/notes.txt')
W('nested/deep/Other.dll')
W('com.coolmod.assets/texture.png')
W('com.coolmod.assets/data.json')
W('Template_Stuff/junk.dll')
W('examples/readme.txt')
W('MyUpper/upper.dll') // 非 GUID（大写无点）→ 递归进去，dll 仍要被收到
W('a.b.c.d.e.f/toomany.dll') // 六段 → 非 GUID → 递归

const t = collectTargets(root)
const rels = (arr) => arr.map((x) => x.destRel).sort()

// dll → plugins（保留相对路径），路径含精确 'patchers' 段的 dll → patchers（平铺名）
assert(
  'H1 plugins 收录 4 颗 dll（根/嵌套，不含 patchers 与模板）',
  JSON.stringify(rels(t.plugins)) === JSON.stringify(['MyMod.dll', 'MyUpper/upper.dll', 'a.b.c.d.e.f/toomany.dll', 'nested/deep/Other.dll'].sort()),
  rels(t.plugins)
)
assert('H2 patchers 收录 Helper.dll（平铺）', rels(t.patchers).join(',') === 'Helper.dll', rels(t.patchers))

// extras：同目录同名 pdb/xml/deps.json 跟 dll
const mymod = t.plugins.find((p) => p.destRel === 'MyMod.dll')
assert(
  'H3 MyMod.dll extras 含 pdb/xml/deps.json',
  mymod && rels(mymod.extras.map((e) => ({ destRel: path.basename(e) }))).join(',') === 'MyMod.deps.json,MyMod.pdb,MyMod.xml',
  mymod && mymod.extras.map((e) => path.basename(e))
)

// json 配对：同名且非 deps → modInfo；无关 json → 丢弃
assert(
  'H4 modInfo 收录 MyMod.json（与 dll 同名）',
  rels(t.modInfo).join(',') === 'MyMod.json',
  rels(t.modInfo)
)
assert('H5 unrelated.json 被跳过', !rels(t.modInfo).includes('unrelated.json'))

// GUID 目录 → modded；模板目录不出现在任何目标
assert('H6 GUID 目录整目录进 modded', rels(t.modded).join(',') === 'com.coolmod.assets', rels(t.modded))
const allSrcs = [
  ...t.plugins.flatMap((p) => [p.src, ...p.extras]),
  ...t.patchers.map((p) => p.src),
  ...t.modded.map((p) => p.src),
  ...t.modInfo.map((p) => p.src)
]
assert('H7 模板目录内容不被收录', !allSrcs.some((s) => /template_stuff|examples/i.test(s)), allSrcs)

// fixture：结构化布局（回归，确保原路径没被破坏）
const root2 = path.join(tmp, 'structured')
const W2 = (rel) => {
  const p = path.join(root2, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, 'x')
}
W2('BepInEx/plugins/structured.dll')
W2('BepInEx/patchers/patch.dll')
W2('BALDI_Data/StreamingAssets/Modded/com.structured.res/file.png')
const t2 = collectTargets(root2)
assert('S1 结构化: plugins', rels(t2.plugins).join(',') === 'structured.dll', rels(t2.plugins))
assert('S2 结构化: patchers', rels(t2.patchers).join(',') === 'patch.dll', rels(t2.patchers))
assert('S3 结构化: modded', rels(t2.modded).join(',') === 'com.structured.res', rels(t2.modded))
assert('S4 结构化: 不做启发式（modInfo 空）', t2.modInfo.length === 0, t2.modInfo)

// fixture：两条同名 GUID 目录（不同深度）→ destRel 去重，只收一条
const root3 = path.join(tmp, 'dup')
W = (rel) => {
  const p = path.join(root3, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, 'x')
}
W('com.dup.res/outer.png')
W('sub/com.dup.res/inner.png')
const t3 = collectTargets(root3)
assert('D1 同名 GUID 目录去重', rels(t3.modded).filter((r) => r === 'com.dup.res').length === 1, rels(t3.modded))

// 清理
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail > 0 ? 1 : 0)
