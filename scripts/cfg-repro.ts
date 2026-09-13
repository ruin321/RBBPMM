import fs from 'fs'
import path from 'path'
import { parseCfgFile, setConfigValue } from '../src/main/services/ConfigService'

const dir = "D:\\steam\\steamapps\\common\\Baldi's Basics Plus\\BepInEx\\config"
for (const f of ['BepInEx.cfg', 'mtm101.rulerp.bbplus.baldidevapi.cfg', 'rost.moment.baldiplus.qop.cfg']) {
  const dto = parseCfgFile(path.join(dir, f))
  console.log('== ' + f + '  sections=' + dto?.sections.length + '  heading=' + (dto?.heading ? 'Y' : 'N'))
  const s = dto!.sections[0]
  console.log('   firstSection=' + s.name + '  entries=' + s.entries.length + '  heading=' + (s.heading ? 'Y' : 'N'))
  for (const e of s.entries.slice(0, 6)) {
    console.log('     - [' + e.control + '] ' + e.key + ' = ' + e.value + (e.acceptable ? '  opts=' + e.acceptable.join('|') : ''))
  }
}


const src = path.join(dir, 'BepInEx.cfg')
const tmp = path.join(process.cwd(), '_cfg_tmp.cfg')
fs.copyFileSync(src, tmp)
const before = fs.readFileSync(src, 'utf8')
console.log('setUnityLogListening -> ' + setConfigValue(tmp, 'Logging', 'UnityLogListening', 'false'))
const after = fs.readFileSync(tmp, 'utf8')
const bl = before.split(/\r?\n/), al = after.split(/\r?\n/)
console.log('lines: before=' + bl.length + ' after=' + al.length)
let diffN = 0
for (let i = 0; i < Math.max(bl.length, al.length); i++) {
  if (bl[i] !== al[i]) { diffN++; if (diffN <= 5) console.log('  DIFF@' + i + '  before=[' + bl[i] + '] after=[' + al[i] + ']') }
}
console.log('it reset correctly: ' + after.includes('\r\nUnityLogListening = false'))
fs.unlinkSync(tmp)


const bd = parseCfgFile(src)!
console.log('BepInEx heading?=' + (bd.heading ? 'Y:' + JSON.stringify(bd.heading?.split('\n')[0]) : 'N'))
console.log('sections: ' + bd.sections.map((s) => s.name + ':' + s.entries.length).join(' | '))