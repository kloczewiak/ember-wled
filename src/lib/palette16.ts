import type { RGB } from './color'

// How WLED v16.0.1 turns a palette into the 16 colours it keeps, and how it reads them back for a segment,
// integer for integer, so the app shows what the light does. No other dependencies: the mock uses it too.

type Stop = { t: number; rgb: RGB }

// The 16 slots of a palette: loadCustomPalettes (colors.cpp) passes the file's colours to
// loadDynamicGradientPalette (src/dependencies/fastled_slim/fastled_slim.h). It doesn't sample the gradient:
// it walks it a section at a time (one colour to the next) and fills the slots between them, a position p
// landing in slot p / 16. With fewer than 16 colours, every section gets at least one slot of its own, so a
// section too short for that takes the next free slot and pushes the rest along. `stops` as normalize()
// leaves them: sorted, the first at 0 and the last at 255.
export function paletteSlots(stops: Stop[]): RGB[] {
  const slots: RGB[] = Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0 }))
  if (stops.length < 2) return slots.map(() => ({ ...(stops[0]?.rgb ?? { r: 0, g: 0, b: 0 }) }))
  const count = stops.length
  let lastSlotUsed = -1
  let indexStart = 0
  let rgbStart = stops[0].rgb
  for (let k = 1; k < stops.length && indexStart < 255; k++) {
    const indexEnd = stops[k].t
    const rgbEnd = stops[k].rgb
    let start = indexStart >> 4
    let end = indexEnd >> 4
    if (count < 16) {
      if (start <= lastSlotUsed && lastSlotUsed < 15) {
        start = lastSlotUsed + 1
        if (end < start) end = start
      }
      lastSlotUsed = end
    }
    fillGradient(slots, start, rgbStart, end, rgbEnd)
    indexStart = indexEnd
    rgbStart = rgbEnd
  }
  return slots
}

// fill_gradient_RGB (fastled_slim.cpp): slots `from` to `to` inclusive, in 16.16 fixed point
function fillGradient(slots: RGB[], from: number, c1: RGB, to: number, c2: RGB) {
  if (to < from) [from, to, c1, c2] = [to, from, c2, c1]
  const div = to - from || 1
  const ch = ['r', 'g', 'b'] as const
  const delta = ch.map((c) => Math.trunc(((c2[c] - c1[c]) << 16) / div))
  const acc = ch.map((c) => c1[c] << 16)
  for (let i = from; i <= to && i < 16; i++) {
    slots[i] = { r: acc[0] >> 16, g: acc[1] >> 16, b: acc[2] >> 16 }
    for (let j = 0; j < 3; j++) acc[j] += delta[j]
  }
}

// ColorFromPalette (colors.cpp) at a palette position (0-255). `wrap` is LINEARBLEND, where 240-255 blends
// back towards the first slot; without it (LINEARBLEND_NOWRAP, what a still palette uses with the default
// "wrap if moving" setting) the positions are squeezed so the last slot is never passed.
export function paletteAt(slots: RGB[], index: number, wrap = false): RGB {
  if (!wrap) index = (index * 0xf0) >> 8
  const hi4 = (index & 0xff) >> 4
  const lo4 = index & 0x0f
  const a = slots[hi4]
  if (!lo4) return { ...a }
  const b = slots[hi4 === 15 ? 0 : hi4 + 1]
  const f2 = lo4 << 4
  const f1 = 256 - f2
  return {
    r: (a.r * f1 + b.r * f2) >> 8,
    g: (a.g * f1 + b.g * f2) >> 8,
    b: (a.b * f1 + b.b * f2) >> 8,
  }
}

// The colours of `n` LEDs showing the palette along a segment, as color_from_palette maps them (FX_fcn.cpp):
// LED i at position i * 255 / n, without wrapping.
export const stripColours = (slots: RGB[], n: number): RGB[] =>
  Array.from({ length: n }, (_, i) => paletteAt(slots, Math.min(Math.floor((i * 255) / n), 255)))
