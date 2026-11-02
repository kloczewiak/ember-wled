// Lists where each WLED effect gets its colours from, to review src/lib/fxcolors.ts after a firmware update.
// Usage: npm run audit:fx-colors [-- path to the firmware repo, default ../wled-firmware]
// See src/lib/fxcolors.md for how to read the output.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? join(import.meta.dirname, '../../wled-firmware')
// comments removed in one pass with strings, so "//" or "/*" inside a string doesn't start one
const tokens = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\*[\s\S]*?\*\/|\/\/.*$/gm
const raw = readFileSync(join(root, 'wled00/FX.cpp'), 'utf8')
const fxCpp = raw.replace(tokens, (t) => (t[0] === '/' ? '' : t))
// and with strings emptied too, for counting braces
const code = raw.replace(tokens, (t) => (t[0] === '/' ? '' : t[0] + t[0]))
const fxH = readFileSync(join(root, 'wled00/FX.h'), 'utf8')

// top-level function bodies: from a "type name(...)" line at depth 0 to its closing brace
const fns = new Map()
{
  let depth = 0, current = null, body = []
  for (const line of code.split('\n')) {
    if (depth === 0 && !current) {
      const m = /^(?:static\s+|inline\s+|\[\[[^\]]*\]\]\s*)*[A-Za-z_][\w:<>]*[\s*&]+([A-Za-z_]\w*)\s*\(/.exec(line)
      if (m && !/;\s*$/.test(line)) { current = m[1]; body = [] }
    }
    for (const c of line) { if (c === '{') depth++; else if (c === '}') depth-- }
    if (current) {
      body.push(line)
      if (depth === 0 && body.join('').includes('{')) { fns.set(current, body.join('\n')); current = null }
    }
  }
}

// the arguments of each call to `name(` in a body, with nested parentheses kept together
function calls(body, name) {
  const out = []
  const re = new RegExp(`\\b${name}\\s*\\(`, 'g')
  for (let m; (m = re.exec(body));) {
    let depth = 1, arg = '', args = []
    for (let i = re.lastIndex; i < body.length && depth; i++) {
      const c = body[i]
      if (c === '(') depth++
      if (c === ')') depth--
      if ((c === ',' && depth === 1) || depth === 0) { args.push(arg.trim()); arg = '' } else arg += c
    }
    out.push(args)
  }
  return out
}

// what each function itself does with colours
const own = new Map()
for (const [name, body] of fns) {
  const pal = calls(body, 'color_from_palette').map((a) => a[3] ?? '')
  own.set(name, {
    wheel: calls(body, 'color_wheel').length > 0,
    // mcol 0-2 gives the segment colour on the Default palette, anything else always the palette
    palAlways: pal.some((m) => /^\d+$/.test(m) && Number(m) > 2) || /\b(SEGPALETTE|_currentPalette|getCurrentPalette)\b/.test(body),
    palColour: pal.some((m) => /^[012]$/.test(m)),
    palVariable: pal.some((m) => !/^\d+$/.test(m)),
    segcolor: /\bSEGCOLOR\s*\(/.test(body),
    callees: [...fns.keys()].filter((f) => f !== name && new RegExp(`\\b${f}\\s*\\(`).test(body)),
  })
}

// ...including the helpers it calls
function traits(name, seen = new Set()) {
  const t = { ...(own.get(name) ?? { callees: [] }) }
  seen.add(name)
  for (const f of t.callees) {
    if (seen.has(f)) continue
    const u = traits(f, seen)
    for (const k of ['wheel', 'palAlways', 'palColour', 'palVariable', 'segcolor']) t[k] ||= u[k]
  }
  return t
}

const ids = Object.fromEntries([...fxH.matchAll(/#define\s+(FX_MODE_\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]))
const data = Object.fromEntries([...fxCpp.matchAll(/(_data_FX_MODE_\w+)\[\]\s*PROGMEM\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]))
const rows = [...fxCpp.matchAll(/addEffect\(\s*(FX_MODE_\w+)\s*,\s*&(\w+)\s*,\s*(_data_FX_MODE_\w+)\s*\)/g)].map(([, id, fn, d]) => {
  const meta = data[d] ?? ''
  const [name, rest = ''] = meta.split('@')
  const parts = rest.split(';')
  return { id: ids[id], name, fn, palDefault: /(?:^|,)pal=(\d+)/.exec(parts[4] ?? '')?.[1], usesPalette: rest === '' || (parts[2] ?? '') !== '', ...traits(fn) }
}).sort((a, b) => a.id - b.id)

const flags = (r) => ['wheel', 'palAlways', 'palColour', 'palVariable', 'segcolor'].filter((k) => r[k]).join(' ')
const list = (title, rs) => {
  console.log(`\n## ${title} (${rs.length})`)
  for (const r of rs) console.log(`${String(r.id).padStart(3)}  ${r.name.padEnd(22)} ${r.fn.padEnd(28)} ${flags(r)}`)
}
const candidates = rows.filter((r) => r.usesPalette)
list('Uses the hue wheel: HUE_WHEEL candidates', candidates.filter((r) => r.wheel))
list('Always draws from the palette: ALWAYS_PALETTE candidates', candidates.filter((r) => !r.wheel && r.palAlways))
list('Palette colour index is computed: read the code', candidates.filter((r) => !r.wheel && !r.palAlways && r.palVariable))
console.log(`\n${rows.length} effects, ${candidates.length} of them use a palette. The rest show colour 1 on the Default palette.`)
