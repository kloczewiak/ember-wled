import type { Color, PaletteStop, Segment } from '../api/types'
import { parseFxMeta } from '../api/fxmeta'
import { DEFAULT_PALETTE_LOOK } from './fxcolors'

// What a segment roughly looks like on the strip, for the segment bar: the colours its effect draws with
// (per-effect rules for the Default palette are in fxcolors.ts), dimmed like the LEDs. Animation isn't modelled, so an
// effect shows the colours it uses rather than what's on the strip at this moment.

type Rgb = [number, number, number]
export type Stop = { rgb: Rgb; pos: number }

// "r" stops (the random palette) get colours picked once per page load, so previews don't change on every render
const randoms: Rgb[] = []
const randomRgb = (j: number) => (randoms[j] ??= [0, 1, 2].map(() => Math.floor(Math.random() * 255)) as Rgb)

// A palette from /json/palx as gradient stops; "c1".."c3" stops use the segment's colour slots.
export function paletteStops(stops: PaletteStop[] | undefined, col: Color[]): Stop[] {
  if (!stops?.length) return []
  const list = stops.length === 1 ? [stops[0], stops[0]] : stops
  return list.map((e, j) => {
    let rgb: Rgb
    let pos: number
    if (Array.isArray(e)) { pos = Math.round((e[0] / 255) * 100); rgb = [e[1], e[2], e[3]] }
    else {
      pos = Math.round((j / (list.length - 1)) * 100)
      rgb = e === 'r' ? randomRgb(j) : rgbOf(col[Number(e[1]) - 1])
    }
    if (stops.length === 1 && j === 1) pos = 100
    return { rgb, pos }
  })
}

export const cssGradient = (stops: Stop[]) =>
  stops.length ? `linear-gradient(to right, ${stops.map((s) => `rgb(${s.rgb.join(',')}) ${s.pos}%`).join(',')})` : undefined

const rgbOf = (c: Color | undefined): Rgb => [c?.[0] ?? 0, c?.[1] ?? 0, c?.[2] ?? 0]

const RAINBOW: Rgb[] = [[255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255], [255, 0, 0]]

// colours spread evenly across the segment
const evenly = (list: Rgb[]): Stop[] => list.map((rgb, i) => ({ rgb, pos: list.length > 1 ? Math.round((i / (list.length - 1)) * 100) : 0 }))

// The colours a segment's effect draws with on a palette (its own by default), at full brightness.
export function effectStops(seg: Segment, fxdata: string[], palx: Record<number, PaletteStop[]>, pal = seg.pal): Stop[] {
  const solid: Stop[] = [{ rgb: rgbOf(seg.col[0]), pos: 0 }]
  if (!parseFxMeta(seg.fx, fxdata[seg.fx]).usesPalette) return solid
  if (pal === 0) {
    // what Default means differs per effect, see fxcolors.ts
    const look = DEFAULT_PALETTE_LOOK[seg.fx]
    if (look === undefined) return solid
    if (look === 'rainbow') return evenly(RAINBOW)
    if (Array.isArray(look)) return evenly(look)
    if (look === 'colors') {
      const used = seg.col.slice(0, 3).map(rgbOf).filter(([r, g, b]) => r || g || b)
      return used.length ? evenly(used) : solid
    }
    // the effect's own palette (its "pal=" default, see Segment::setMode), else Party Colors
    pal = Number(/(?:^|,)pal=(\d+)/.exec((fxdata[seg.fx] ?? '').split(';')[4] ?? '')?.[1] ?? 0) || 6
  }
  const stops = paletteStops(palx[pal], seg.col)
  return stops.length ? stops : solid // palettes not loaded yet
}

// sRGB <-> linear light. Gamma-corrected LEDs (WLED's default) put out roughly linear-light sRGB, and
// brightness scales that output linearly, which the eye sees as a curve: the first steps up from 0 make
// far more difference than the same steps near full.
const toLinear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const fromLinear = (l: number) => Math.round(255 * Math.min(1, l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055))

// CSS background for a segment in the bar, and how to label it: outlined text over several colours,
// otherwise dark or light text depending on the colour.
// `bri` is the segment's brightness (0-1). Master brightness is left out, like Peek's live colours.
export function segmentFill(seg: Segment, fxdata: string[], palx: Record<number, PaletteStop[]>, bri: number) {
  const white = toLinear(seg.col[0]?.[3] ?? 0) // the white channel of colour 1 is added to every LED (RGBW strips)
  const stops = effectStops(seg, fxdata, palx).map((s) => ({
    ...s,
    rgb: s.rgb.map((v) => fromLinear((toLinear(v) + white) * bri)) as Rgb,
  }))
  const [r, g, b] = stops[0].rgb
  const solid = isSolid(stops)
  return {
    background: stopsBackground(stops),
    outline: !solid,
    light: solid && 0.2126 * r + 0.7152 * g + 0.0722 * b > 140,
  }
}

const isSolid = (stops: Stop[]) => stops.every((s) => s.rgb.every((v, i) => v === stops[0].rgb[i]))

// CSS background for stops: a plain colour when they're all the same (a gradient needs two stops)
export const stopsBackground = (stops: Stop[]) => (isSolid(stops) ? `rgb(${stops[0].rgb.join(',')})` : cssGradient(stops)!)
