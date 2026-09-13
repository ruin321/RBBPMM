import { listCustomLevels } from '../src/main/services/CustomLevelService'
import { listTexturePacks } from '../src/main/services/TexturePackService'
import * as fs from 'fs'
import * as path from 'path'

function main(): void {
  const levels = listCustomLevels()
  console.log('=== 自定义关卡 listCustomLevels ===')
  console.log('数量 =', levels.length)
  for (const l of levels) {
    console.log(`  ${l.enabled ? 'ON ' : 'off'} ${l.name} | ${l.fileName} | ${l.size}B | thumb=${l.thumbnail ? 'Y' : 'N'}`)
  }

  const playables = path.join(
    process.env.USERPROFILE || '',
    "AppData/LocalLow/Basically Games/Baldi's Basics Plus/Level Studio/Playables"
  )
  console.log('--- Playables 目录实际内容 ---')
  try {
    for (const f of fs.readdirSync(playables)) console.log('  ', f)
  } catch (e) {
    console.log('  读取失败:', e instanceof Error ? e.message : String(e))
  }

  const gameRoot = "D:/steam/steamapps/common/Baldi's Basics Plus"
  const packs = listTexturePacks(gameRoot)
  console.log('=== 材质包 listTexturePacks ===')
  console.log('数量 =', packs.length)
  for (const p of packs) console.log(`  ${p.name} | folder=${p.folderName} | protected=${p.protected} | ver=${p.version ?? '-'}`)

  const tpDir = path.join(gameRoot, 'BALDI_Data/StreamingAssets/Texture Packs')
  console.log('--- Texture Packs 目录实际内容 ---')
  try {
    for (const f of fs.readdirSync(tpDir)) console.log('  ', f)
  } catch (e) {
    console.log('  读取失败:', e instanceof Error ? e.message : String(e))
  }
}

main()
