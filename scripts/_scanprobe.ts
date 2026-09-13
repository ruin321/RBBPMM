import { scanRepository } from '../src/main/services/ModRepositoryScanner'

const root = process.argv[2] || "D:/steam/steamapps/common/Baldi's Basics Plus"
const mods = scanRepository(root, undefined)
console.log('total mods =', mods.length)
console.log('--- name 匹配 balditexturepacks ---')
for (const m of mods.filter((m) => /balditexturepacks/i.test(m.name))) {
  console.log(
    JSON.stringify({
      name: m.name,
      guid: m.guid,
      directoryName: m.directoryName,
      identifyName: m.identifyName,
      activated: m.activated,
      pluginFiles: m.pluginFiles
    })
  )
}
console.log('--- 前置检查（level studio）---')
const patterns: [string, RegExp[]][] = [
  ['devApi 383711', [/mtm101baldapi/i]],
  ['loader 617565', [/plusstudiolevelloader/i]],
  ['levelStudio 617567', [/pluslevelstudio/i, /levelstudio/i]]
]
for (const [label, pats] of patterns) {
  const installed = mods.some((m) => {
    const names = [m.name, m.identifyName, m.dllFile, m.dllDirectory, ...(m.pluginFiles ?? [])]
    return names.some((n) => !!n && pats.some((p) => p.test(String(n))))
  })
  console.log(label, '->', installed)
}
console.log('--- BaldiTexturePacks 是否在列表里 (name 匹配) ---')
console.log(mods.some((m) => /balditexturepacks/i.test(m.name)))

console.log('--- 所有 mod 名称（前 60）---')
for (const m of mods.slice(0, 60)) console.log(`  ${m.activated ? 'ON ' : 'off'} ${m.name}`)
