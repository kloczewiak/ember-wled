// Builds mock/fixtures.json (effect names, effect metadata, palette names) from the WLED firmware source,
// so the mock device used during development exposes the same effects and palettes as real firmware.
// Usage: node scripts/gen-fixtures.mjs [path/to/wled00]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(process.argv[2] ?? resolve(here, '../../wled-firmware/wled00'))

const fxh = readFileSync(resolve(src, 'FX.h'), 'utf8')
const fxcpp = readFileSync(resolve(src, 'FX.cpp'), 'utf8')
const fxfcn = readFileSync(resolve(src, 'FX_fcn.cpp'), 'utf8')

const ids = Object.fromEntries([...fxh.matchAll(/#define (FX_MODE_\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]))
const data = Object.fromEntries([...fxcpp.matchAll(/static const char (_data_\w+)\[\] PROGMEM = "((?:[^"\\]|\\.)*)"/g)].map((m) => [m[1], m[2]]))

const modes = []
for (const m of fxcpp.matchAll(/addEffect\((FX_MODE_\w+),\s*&?\w+,\s*(_data_\w+)\)/g)) {
  const id = ids[m[1]]
  const str = data[m[2]]
  if (id === undefined || str === undefined) continue
  modes[id] = str
}

const count = modes.length
const effects = []
const fxdata = []
for (let i = 0; i < count; i++) {
  // Solid (0) is registered outside addEffect() in the firmware
  const str = modes[i] ?? (i === 0 ? 'Solid' : 'RSVD')
  const at = str.indexOf('@')
  effects.push(at < 0 ? str : str.slice(0, at))
  fxdata.push(at < 0 ? '' : str.slice(at + 1))
}

const palMatch = fxfcn.match(/JSON_palette_names\[\] PROGMEM = R"=====\(([\s\S]*?)\)====="/)
const palettes = JSON.parse(palMatch[1])

mkdirSync(resolve(here, '../mock'), { recursive: true })
writeFileSync(resolve(here, '../mock/fixtures.json'), JSON.stringify({ effects, fxdata, palettes }))
console.log(`${effects.length} effects, ${palettes.length} palettes`)
