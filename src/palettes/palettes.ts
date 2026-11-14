import { fromHex, rgbCss, toHex, type RGB } from '../lib/color'
import type { Color, PaletteStop, Preset, Presets } from '../api/types'
import { uploadFile, type SaveResult } from '../settings/api'

// Custom palettes as the firmware keeps them (WLED v16.0.1): one file per slot, /palette<slot>.json holding
// {"palette":[position, "rrggbb", ...]} (colors.cpp loadCustomPalettes). Slot n is palette ID 200 - n.
// A gap in the numbering stays a grey placeholder, so presets keep pointing at the right palette; the light
// reads up to 18 colours of a file and stores each palette as 16 colours that effects blend between.

export const MAX_COLOURS = 18
export const CUSTOM_ID_BASE = 200
export type Stop = { t: number; rgb: RGB }
// a slot's colours, or null for a free slot
export type Slot = Stop[] | null

export const paletteId = (slot: number) => CUSTOM_ID_BASE - slot

// Sorted, one colour per position, the first at 0 and the last at 255, at most 18 colours.
export function normalize(stops: Stop[]): Stop[] {
  const seen = new Set<number>()
  const list = stops
    .map((s) => ({ t: Math.max(0, Math.min(255, Math.round(s.t))), rgb: s.rgb }))
    .sort((a, b) => a.t - b.t)
    .filter((s) => (seen.has(s.t) ? false : (seen.add(s.t), true)))
  if (!list.length) return []
  if (list[0].t > 0) list.unshift({ t: 0, rgb: list[0].rgb })
  if (list[list.length - 1].t < 255) list.push({ t: 255, rgb: list[list.length - 1].rgb })
  while (list.length > MAX_COLOURS) list.splice(list.length - 2, 1)
  return list
}

// A palette file's colours, as the firmware reads them: index and hex string pairs, or index, r, g, b.
export function fromFile(json: unknown): Stop[] | null {
  const pal = (json as { palette?: unknown } | null)?.palette
  if (!Array.isArray(pal) || pal.length < 4) return null
  return fromArray(pal)
}

// [t, "rrggbb", ...] or [t, r, g, b, ...], the format of palette files and the downloadable collection
function fromArray(pal: unknown[]): Stop[] | null {
  const out: Stop[] = []
  if (typeof pal[1] === 'string') {
    for (let i = 0; i + 1 < pal.length; i += 2) {
      const rgb = fromHex(String(pal[i + 1]))
      if (rgb) out.push({ t: Number(pal[i]), rgb })
    }
  } else {
    for (let i = 0; i + 3 < pal.length; i += 4)
      out.push({ t: Number(pal[i]), rgb: { r: Number(pal[i + 1]), g: Number(pal[i + 2]), b: Number(pal[i + 3]) } })
  }
  const list = normalize(out.filter((s) => Number.isFinite(s.t)))
  return list.length >= 2 ? list : null
}

export const toFile = (stops: Stop[]) =>
  JSON.stringify({ palette: stops.flatMap((s) => [s.t, toHex(s.rgb).toLowerCase()]) })

// The colour at a position (0-255), blended between the stops on either side.
export function sample(stops: Stop[], t: number): RGB {
  if (t <= stops[0].t) return stops[0].rgb
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i],
      b = stops[i + 1]
    if (t <= b.t) return mix(a.rgb, b.rgb, b.t === a.t ? 0 : (t - a.t) / (b.t - a.t))
  }
  return stops[stops.length - 1].rgb
}

const mix = (a: RGB, b: RGB, f: number): RGB => ({
  r: Math.round(a.r + (b.r - a.r) * f),
  g: Math.round(a.g + (b.g - a.g) * f),
  b: Math.round(a.b + (b.b - a.b) * f),
})

// The 16 colours the light keeps of a palette: the gradient's colour at positions 0, 17, 34 … 255.
export const lightColours = (stops: Stop[]): RGB[] => Array.from({ length: 16 }, (_, k) => sample(stops, k * 17))

// What the light shows for `n` LEDs across the palette: it keeps 16 colours (one every 17 positions) and
// blends between them, so a band narrower than that softens or disappears.
export function onTheLight(stops: Stop[], n: number): RGB[] {
  const entries = lightColours(stops)
  return Array.from({ length: n }, (_, j) => {
    const p = n > 1 ? (j * 15) / (n - 1) : 0
    const a = Math.floor(p)
    return mix(entries[a], entries[Math.min(15, a + 1)], p - a)
  })
}

export const gradientCss = (stops: Stop[]) =>
  `linear-gradient(to right, ${stops.map((s) => `${rgbCss(s.rgb)} ${((s.t / 255) * 100).toFixed(2)}%`).join(', ')})`

// A palette from /json/palx as stops: "c1".."c3" are the segment's colour slots, spread evenly like the
// firmware does. Random ("r") palettes have no fixed colours.
export function fromPalx(entries: PaletteStop[] | undefined, col: Color[]): Stop[] | null {
  if (!entries?.length || entries.some((e) => e === 'r')) return null
  const list = entries.length === 1 ? [entries[0], entries[0]] : entries
  return normalize(
    list.map((e, j) => {
      if (Array.isArray(e)) return { t: e[0], rgb: { r: e[1], g: e[2], b: e[3] } }
      const c = col[Number(e[1]) - 1]
      return { t: Math.round((j / (list.length - 1)) * 255), rgb: { r: c?.[0] ?? 0, g: c?.[1] ?? 0, b: c?.[2] ?? 0 } }
    }),
  )
}

// colours spread evenly from 0 to 255
export const spread = (cols: RGB[]): Stop[] =>
  cols.map((rgb, i) => ({ t: Math.round((255 * i) / Math.max(1, cols.length - 1)), rgb }))

export const TWO_COLOURS = spread([fromHex('ff9f43')!, fromHex('1e88e5')!])

// 3 to 5 colours that go together: three or four hues evenly round the wheel, like the stock editor's
const hsl = (h: number, s: number, l: number): RGB => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return { r: f(0), g: f(8), b: f(4) }
}
export function generate(): Stop[] {
  const n = 3 + Math.floor(Math.random() * 3)
  const base = Math.random() * 360
  const hues = Math.random() < 0.5 ? 3 : 4
  return spread(
    Array.from({ length: n }, (_, i) => hsl((base + (360 * (i % hues)) / hues) % 360, 100, 35 + Math.random() * 30)),
  )
}

// A new colour at `t`, sampled from the gradient there, or in the middle of the widest gap without one.
// Returns the new list and the new colour's index, or null when it can't be added.
export function addColour(stops: Stop[], t?: number): [Stop[], number] | null {
  if (stops.length >= MAX_COLOURS) return null
  let at = t
  if (at === undefined) {
    let gi = 0
    for (let i = 1; i < stops.length - 1; i++) if (stops[i + 1].t - stops[i].t > stops[gi + 1].t - stops[gi].t) gi = i
    at = Math.round((stops[gi].t + stops[gi + 1].t) / 2)
  }
  at = Math.max(1, Math.min(254, Math.round(at)))
  if (stops.some((s) => s.t === at)) return null
  const next = [...stops, { t: at, rgb: sample(stops, at) }].sort((a, b) => a.t - b.t)
  return [next, next.findIndex((s) => s.t === at)]
}

// Moves a colour anywhere between the ends (which stay at 0 and 255), passing others if it has to, to the
// nearest position no other colour holds. Returns the new list and the colour's new index.
export function moveTo(stops: Stop[], i: number, t: number): [Stop[], number] {
  if (i <= 0 || i >= stops.length - 1 || !Number.isFinite(t)) return [stops, i]
  const want = Math.max(1, Math.min(254, Math.round(t)))
  const taken = new Set(stops.filter((_, k) => k !== i).map((s) => s.t))
  let pos = stops[i].t
  for (let d = 0; d < 254; d++) {
    if (want + d <= 254 && !taken.has(want + d)) {
      pos = want + d
      break
    }
    if (want - d >= 1 && !taken.has(want - d)) {
      pos = want - d
      break
    }
  }
  if (pos === stops[i].t) return [stops, i]
  const moved = { t: pos, rgb: stops[i].rgb }
  const next = [...stops.filter((_, k) => k !== i), moved].sort((a, b) => a.t - b.t)
  return [next, next.indexOf(moved)]
}

// Which row each pin sits in so none overlap: a pin closer than `gap` positions to the last one in a row moves
// down a row, up to three rows (then they share the emptiest).
export function lanes(stops: Stop[], gap: number): number[] {
  const last: number[] = []
  return stops.map((s) => {
    let k = last.findIndex((t) => s.t - t >= gap)
    if (k < 0) k = last.length < 3 ? last.length : last.indexOf(Math.min(...last))
    last[k] = s.t
    return k
  })
}

// ---------------------------------------------------------------- the light's palette files

// One slot's file, or null when there's none. Throws when the light doesn't answer.
export async function loadSlot(i: number): Promise<Slot> {
  const res = await fetch(`/palette${i}.json`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return fromFile(await res.json())
}

// Reads the palette files one at a time (the ESP refuses parallel requests when its memory is low).
// `count` is info.cpalcount: the slots up to the last file, gaps included.
export async function loadSlots(count: number): Promise<Slot[]> {
  const slots: Slot[] = []
  for (let i = 0; i < count; i++) slots.push(await loadSlot(i))
  return slots
}

// The files as read last time, kept on this device so the list shows at once; they're read again in the
// background. Only used while the light still has as many slots.
const SLOTS_KEY = 'wledUiCustomPalettes'
export function cachedSlots(count: number): Slot[] | null {
  try {
    const c = JSON.parse(localStorage.getItem(SLOTS_KEY) ?? 'null') as { files: (unknown[] | null)[] } | null
    if (!c || c.files.length !== count) return null
    return c.files.map((f) => (f ? fromArray(f) : null))
  } catch {
    return null
  }
}
export function cacheSlots(slots: Slot[]) {
  try {
    localStorage.setItem(
      SLOTS_KEY,
      JSON.stringify({ files: slots.map((s) => (s ? JSON.parse(toFile(s)).palette : null)) }),
    )
  } catch {
    /* storage full or blocked */
  }
}

// Before the files arrive on a first visit: the palettes as the main app already has them from /json/palx,
// which is only the light's 16-colour version (json.cpp setPaletteColors). Good for the list, but never
// edited: opening a palette reads its file first. A grey placeholder (a gap) is a free slot.
export function slotsFromPalx(palx: Record<number, PaletteStop[]>, count: number): Slot[] {
  return Array.from({ length: count }, (_, i) => {
    const e = palx[paletteId(i)]
    if (!e?.length)
      return [
        { t: 0, rgb: { r: 82, g: 82, b: 91 } },
        { t: 255, rgb: { r: 82, g: 82, b: 91 } },
      ]
    if (e.every((x) => Array.isArray(x) && x[1] === 128 && x[2] === 128 && x[3] === 128)) return null
    return fromPalx(e, [])
  })
}

// Writes a slot's file; the light loads its palettes again right away (wled_server.cpp handleUpload).
export async function saveSlot(slot: number, stops: Stop[]): Promise<SaveResult> {
  const { result } = await uploadFile(new Blob([toFile(stops)], { type: 'application/json' }), `/palette${slot}.json`)
  return result
}

// The first slot a new palette can go in: a gap, or the next one after the last.
export function freeSlot(slots: Slot[], max: number) {
  const gap = slots.indexOf(null)
  if (gap >= 0) return gap
  return slots.length < max ? slots.length : -1
}

// The presets that use a palette on any of their segments, by name.
export function presetsUsing(presets: Presets | null, id: number): string[] {
  if (!presets) return []
  return Object.entries(presets)
    .filter(([, p]) => usesPalette(p, id))
    .map(([pid, p]) => p.n || `Preset ${pid}`)
}
function usesPalette(p: Preset, id: number) {
  const seg = p.seg as { pal?: number } | { pal?: number }[] | undefined
  return Array.isArray(seg) ? seg.some((s) => s?.pal === id) : seg?.pal === id
}

// ---------------------------------------------------------------- the downloadable collection

// Palettes picked from the cpt-city archive by the WLED team (wled-web-tools), the stock editor's
// "Download more palettes". The browser downloads them, so it needs internet; they're kept under the stock
// editor's key so both share the download.
const COLLECTION_URL = 'https://wled.github.io/wled-web-tools/cpt_city_selection.json'
const COLLECTION_KEY = 'wledCptCityJson'
export const GROUPS = ['colorful', 'thematic', 'pastel', 'striped', 'gradient', 'monochrome'] as const
export type Collected = { name: string; author?: string; group: string; stops: Stop[] }

type RawPal = { name?: string; author?: string; colors?: unknown[]; category?: string; class?: string }
function parseCollection(data: unknown): Collected[] {
  const raw: RawPal[] = []
  const d = data as { categories?: Record<string, RawPal[]>; palettes?: RawPal[] } | RawPal[]
  if (Array.isArray(d)) raw.push(...d)
  else if (Array.isArray(d?.palettes)) raw.push(...d.palettes)
  else if (d?.categories)
    for (const [k, list] of Object.entries(d.categories))
      if (Array.isArray(list)) raw.push(...list.map((p) => ({ ...p, class: k })))
  return raw.flatMap((p) => {
    const stops = Array.isArray(p.colors) ? fromArray(p.colors) : null
    const g = (p.category || p.class || '').toLowerCase()
    return stops
      ? [{ name: p.name || 'Untitled', author: p.author, group: g === 'themed' ? 'thematic' : g, stops }]
      : []
  })
}

export function cachedCollection(): Collected[] | null {
  try {
    const raw = localStorage.getItem(COLLECTION_KEY)
    return raw ? parseCollection(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export async function downloadCollection(): Promise<Collected[]> {
  const res = await fetch(COLLECTION_URL, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  try {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(data))
  } catch {
    /* storage full or blocked: it stays for this visit */
  }
  return parseCollection(data)
}
