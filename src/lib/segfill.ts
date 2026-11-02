import type { Color, PaletteStop, Segment } from '../api/types'
import { parseFxMeta } from '../api/fxmeta'

// What a segment roughly looks like on the strip, for the segment bar: the colours its effect draws with
// (wled00/FX.cpp and FX_fcn.cpp in WLED v16.0.1), dimmed like the LEDs. Animation isn't modelled, so an
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

// Effects that, with the Default palette, colour LEDs from the hue wheel (Segment::color_wheel) instead of
// colour 1, so they show a rainbow: Wipe/Sweep Random, Random Colors, Dynamic (+ Smooth), Colorloop,
// Rainbow, Theater Rainbow, Dissolve Rnd, Strobe/Blink Rainbow, Chase Random/Rainbow/Flash Rnd, Rainbow
// Runner, Stream, Palette, Fireworks Starburst, Sinelon Rainbow, Ripple Rainbow.
const HUE_WHEEL = new Set([4, 5, 7, 8, 9, 14, 19, 24, 26, 29, 30, 32, 33, 36, 39, 65, 89, 94, 99, 117])
const RAINBOW: Stop[] = [[255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255], [255, 0, 0]]
  .map((rgb, i) => ({ rgb: rgb as Rgb, pos: Math.round((i / 6) * 100) }))

// The colours a segment's effect draws with, at full brightness.
function effectStops(seg: Segment, fxdata: string[], palx: Record<number, PaletteStop[]>): Stop[] {
  const solid: Stop[] = [{ rgb: rgbOf(seg.col[0]), pos: 0 }]
  if (!parseFxMeta(seg.fx, fxdata[seg.fx]).usesPalette) return solid
  let pal = seg.pal
  if (pal === 0) {
    if (HUE_WHEEL.has(seg.fx)) return RAINBOW
    // Default stands for the effect's own palette (its "pal=" default, see Segment::setMode), which effects
    // with one draw from; the rest get colour 1 from color_from_palette()
    pal = Number(/(?:^|,)pal=(\d+)/.exec((fxdata[seg.fx] ?? '').split(';')[4] ?? '')?.[1] ?? 0)
    if (!pal) return solid
  }
  const stops = paletteStops(palx[pal], seg.col)
  return stops.length ? stops : solid // palettes not loaded yet
}

// sRGB <-> linear light. Gamma-corrected LEDs (WLED's default) put out roughly linear-light sRGB, and
// brightness scales that output linearly, which the eye sees as a curve: the first steps up from 0 make
// far more difference than the same steps near full.
const toLinear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const fromLinear = (l: number) => Math.round(255 * Math.min(1, l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055))

// CSS background for a segment in the bar, and whether it's light enough to need dark text.
// `bri` is the overall brightness factor (0-1): the segment's own brightness times the master brightness.
export function segmentFill(seg: Segment, fxdata: string[], palx: Record<number, PaletteStop[]>, bri: number) {
  const white = toLinear(seg.col[0]?.[3] ?? 0) // the white channel of colour 1 is added to every LED (RGBW strips)
  const stops = effectStops(seg, fxdata, palx).map((s) => ({
    ...s,
    rgb: s.rgb.map((v) => fromLinear((toLinear(v) + white) * bri)) as Rgb,
  }))
  const avg = [0, 1, 2].map((i) => stops.reduce((sum, s) => sum + s.rgb[i], 0) / stops.length)
  return {
    background: stops.length === 1 ? `rgb(${stops[0].rgb.join(',')})` : cssGradient(stops)!,
    light: 0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2] > 140,
  }
}
