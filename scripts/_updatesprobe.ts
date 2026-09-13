/* 探针：用真实的 getUpdates 解析 GameBanana 的 Updates 接口 */
import { getUpdates } from '../src/main/services/GamebananaService'

const IDS = [694067, 716127, 713948]

async function main(): Promise<void> {
  for (const id of IDS) {
    const t0 = Date.now()
    const res = await getUpdates(id)
    console.log(`\n########## mod ${id} — total=${res.total} items=${res.items.length} (${Date.now() - t0}ms) ##########`)
    for (const u of res.items) {
      console.log(`  [${u.id}] ${JSON.stringify(u.title)}  ver=${JSON.stringify(u.version)}  date=${u.dateAdded ? new Date(u.dateAdded * 1000).toISOString().slice(0, 10) : 'n/a'}  author=${JSON.stringify(u.authorName)}`)
      console.log(`      url=${u.url}`)
      console.log(`      body=${u.body ? u.body.length + ' chars' : '(empty)'}`)
      console.log(`      files=${JSON.stringify(u.fileNames)}`)
      for (const c of u.changeLog) {
        console.log(`      * [${c.category ?? '-'}] ${c.text.slice(0, 90)}`)
      }
    }
  }
  // 防御：非法 id 不应该抛
  console.log('\n--- 边界 ---')
  for (const bad of [0, -1, Number.NaN]) {
    const r = await getUpdates(bad)
    console.log(`  getUpdates(${String(bad)}) ->`, JSON.stringify(r))
  }
}

void main()
