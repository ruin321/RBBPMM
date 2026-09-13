/* 一次性生成 708588 素材：复制 milk.png / Drink.wav 进 assets，并把 Drink.wav
   逐帧反转成 drink-708588-rev.wav（喝奶彩蛋的第二段音频）。
   用法：node scripts/_milkgen.cjs */
const fs = require('fs')
const path = require('path')

const SRC = "D:/steam/steamapps/common/Baldi's Basics Plus/BALDI_Data/StreamingAssets/Modded/com.milk.item"
const DEST = 'C:/Users/Administrator/AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/work-mode-projects/6a9d0054dbefb8a0fd194992/GottaManageDev/src/renderer/src/assets'

fs.copyFileSync(path.join(SRC, 'milk.png'), path.join(DEST, 'milk-708588.png'))
fs.copyFileSync(path.join(SRC, 'Drink.wav'), path.join(DEST, 'drink-708588.wav'))

// 反转 wav：找 fmt 块拿 blockAlign，按帧倒排 data 块
const buf = fs.readFileSync(path.join(SRC, 'Drink.wav'))
let pos = 12
let fmt = null
let data = null
while (pos + 8 <= buf.length) {
  const id = buf.toString('ascii', pos, pos + 4)
  const size = buf.readUInt32LE(pos + 4)
  if (id === 'fmt ') fmt = { blockAlign: buf.readUInt16LE(pos + 8 + 12) }
  if (id === 'data') data = { start: pos + 8, size }
  pos += 8 + size + (size % 2)
}
if (!fmt || !data || !fmt.blockAlign) throw new Error('wav 结构解析失败')

const frames = Math.floor(data.size / fmt.blockAlign)
const out = Buffer.from(buf)
const frame = Buffer.alloc(fmt.blockAlign)
for (let i = 0; i < Math.floor(frames / 2); i++) {
  const a = data.start + i * fmt.blockAlign
  const b = data.start + (frames - 1 - i) * fmt.blockAlign
  buf.copy(frame, 0, a, a + fmt.blockAlign)
  buf.copy(out, a, b, b + fmt.blockAlign)
  frame.copy(out, b)
}
fs.writeFileSync(path.join(DEST, 'drink-708588-rev.wav'), out)
console.log(
  'fmt blockAlign =', fmt.blockAlign,
  '| frames =', frames,
  '| reversed ->', 'drink-708588-rev.wav', out.length, 'bytes'
)
