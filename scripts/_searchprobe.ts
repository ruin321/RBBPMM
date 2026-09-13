import { searchMods } from '../src/main/services/GamebananaService'

async function main(): Promise<void> {
  const cats = [4609, 28926, 28929]
  for (const cat of cats) {
    const t0 = Date.now()
    try {
      const r = await searchMods(1, undefined, cat)
      console.log(
        `cat=${cat} items=${r.items.length} recordCount=${r.recordCount} perPage=${r.perPage} complete=${r.isComplete} in ${Date.now() - t0}ms`
      )
      console.log(
        '   样本:',
        r.items
          .slice(0, 4)
          .map((i) => `${i.id}|${i.name}|cat=${i.categoryId}|thumb=${i.thumbnailUrl ? 'Y' : 'N'}`)
          .join('\n         ')
      )
      const emptyName = r.items.filter((i) => !i.name).length
      const noId = r.items.filter((i) => !i.id).length
      console.log(`   name 为空=${emptyName} id 为空=${noId}`)
    } catch (e) {
      console.log(`cat=${cat} 抛错:`, e instanceof Error ? e.message : String(e))
    }
  }

  const kw: [number, string][] = [
    [28929, 'school'],
    [28926, 'school']
  ]
  for (const [cat, q] of kw) {
    const t0 = Date.now()
    try {
      const r = await searchMods(1, q, cat)
      console.log(
        `关键词 cat=${cat} q=${q} items=${r.items.length} recordCount=${r.recordCount} in ${Date.now() - t0}ms`
      )
    } catch (e) {
      console.log(`关键词 cat=${cat} q=${q} 抛错:`, e instanceof Error ? e.message : String(e))
    }
  }
}

void main()
