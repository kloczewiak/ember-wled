// "Accurate Peek": turns Peek's live colours into what the LEDs really get, following WLED v16.0.1 from the
// frame Peek sends to the bytes on the wire, so the steps that low brightness causes show up on screen too.
//
// Peek's WebSocket frame (ws.cpp sendLiveLedsWs) is the frame buffer after the segments were combined with
// their own brightness, but before the rest of WS2812FX::show() and the bus:
//   1. gamma correction, per channel (gamma32, colors.h)
//   2. with white balance correction, the colour tinted to the white balance of the segment on top
//      (colorBalanceFromKelvin, colors.cpp)
//   3. on outputs with white LEDs, the output's auto white mode (Bus::autoWhiteCalc)
//   4. master brightness times the LED settings' brightness factor (scaledBri), with color_fade(..., video)
//      in BusDigital::setPixelColor
//   5. the current limiter (BusManager::applyABL), which can dim each output again with the same fade
// The result is the 8-bit value each LED gets. For the screen, the white LEDs are added to the colour ones,
// the brightness is divided back out and the gamma undone, so colours look like plain Peek at full brightness
// but keep the LEDs' steps.
//
// White: the frame has each LED's own white added into R, G and B (min(255, r + w)), so it can't be split
// back exactly. With auto white Brighter, Accurate or Max the white slider is hidden and the frame is taken as
// plain RGB, which is what those modes replace white with anyway. With None or Dual it's decided by the segment
// on top of each LED: plain RGB (Dual: Brighter) unless that segment's colours have white; then the part red,
// green and blue share is taken as the white.
//
// Not modelled: the white LEDs' own tint (they show as neutral white), warm/cold white mixing, segment blend
// modes other than Top, spacing gaps, brightness transitions, and a ledmap. Above 1024 LEDs (256 on an ESP8266) Peek skips LEDs, so
// the current estimate scales up the ones it sends.

import type { Cfg } from '../settings/api'

interface Output {
  start: number
  len: number
  digital: boolean
  net: boolean // network output: its bus tints after auto white instead of before
  pwmTint: boolean // a PWM output the white balance tints (BusPwm: RGB and RGBW only)
  ma: number
  limit: number
  white: boolean // has white LEDs
  rgb: boolean // has colour LEDs (white-only types don't)
  wwa: boolean // WS2812 WWA: the bus writes white as amber, warm and cold channels
  aw: number // auto white mode (RGBW_MODE_*), the global override applied
}

export interface LedModel {
  gamma: number[] | null // gamma table, null when gamma correction is off
  gammaValue: number
  bri: number // master brightness the buses get (scaledBri)
  outputs: Output[]
  abl: 'off' | 'global' | 'perOutput'
  globalLimit: number // mA left for the LEDs with a global limit (ESP current taken off)
  sampleStep: number // LEDs per Peek pixel
  matrixWidth: number // 0 for a strip
  segs: Seg[] // segments that are on, bottom to top
  whiteBalance: boolean // white balance correction (and not white temperature from colour)
}

// what Peek needs of a segment: where it is, its white balance (0-255) and whether its colours have white
export interface Seg {
  start: number
  stop: number
  startY: number
  stopY: number
  cct: number
  white: boolean
}

const MAX_LIVE_LEDS = (esp8266: boolean) => (esp8266 ? 256 : 1024)

// types 16-39 and 48-63 (bus_manager.h isDigital, is2Pin): 8 bits per channel
const isDigital = (t: number) => (t >= 16 && t <= 39) || (t >= 48 && t <= 63)
// bus_manager.h hasWhite and hasRGB
const hasWhite = (t: number) =>
  (t >= 18 && t <= 21) ||
  [28, 29, 30, 31, 32, 34].includes(t) ||
  [41, 42, 44, 45, 46].includes(t) ||
  t === 88 ||
  t === 89
const hasRGB = (t: number) => !((t >= 18 && t <= 21) || t === 40 || t === 41 || t === 42)
// RGBW_MODE_* (const.h)
const AW_NONE = 0
const AW_BRIGHTER = 1
const AW_ACCURATE = 2
const AW_DUAL = 3
const AW_MAX = 4

export function ledModel(
  cfg: Cfg,
  bri: number,
  info: { arch: string; leds: { count: number; matrix?: { w: number; h: number } } },
  segments: {
    start: number
    stop: number
    startY?: number
    stopY?: number
    on: boolean
    cct?: number
    col: (number | undefined)[][]
  }[] = [],
): LedModel {
  const esp8266 = info.arch === 'esp8266'
  const espMa = esp8266 ? 80 : 120 // MA_FOR_ESP
  const gc = cfg.light?.gc?.col ?? 1
  const gamma = gc !== 1 ? Array.from({ length: 256 }, (_, i) => Math.floor(Math.pow(i / 255, gc) * 255 + 0.5)) : null
  const led = cfg.hw?.led
  const ins = led?.ins ?? []
  const globalMa = led?.maxpwr ?? 0
  const globalAw = led?.rgbwm ?? 255 // AW_GLOBAL_DISABLED: each output's own

  // BusManager::initializeABL
  let abl: LedModel['abl'] = 'off'
  const outputs: Output[] = ins.map((b) => ({
    start: b.start,
    len: b.len,
    digital: isDigital(b.type),
    net: b.type >= 80 && b.type <= 95,
    pwmTint: b.type === 43 || b.type === 44,
    ma: b.ledma ?? 0,
    limit: 0,
    white: hasWhite(b.type),
    rgb: hasRGB(b.type),
    wwa: b.type === 21,
    // Bus constructor: outputs without white are always manual; the global override wins when it's set
    aw: !hasWhite(b.type) ? AW_NONE : globalAw < 255 ? globalAw : (b.rgbwm ?? AW_NONE),
  }))
  if (globalMa > 0) {
    if (outputs.some((o) => o.digital && o.ma > 0)) abl = 'global'
  } else {
    const limited = ins.filter((b, i) => outputs[i].digital && (b.ledma ?? 0) > 0 && (b.maxpwr ?? 0) > 0).length
    if (limited > 0) {
      abl = 'perOutput'
      const espShare = Math.floor(espMa / limited)
      outputs.forEach((o, i) => {
        if (!o.digital) return
        let max = ins[i].maxpwr ?? 0
        if (max > espShare) max -= espShare
        if (max < o.len) max = o.len // 1mA per LED: dims to the minimum
        if (o.len * o.ma === 0) max = 0 // no LED current set: no limit
        o.limit = max
      })
    }
  }

  const total = info.leds.count
  const matrix = info.leds.matrix
  return {
    gamma,
    gammaValue: gc,
    bri: Math.min(255, Math.floor((bri * (cfg.light?.['scale-bri'] ?? 100)) / 100)),
    outputs,
    abl,
    globalLimit: globalMa > espMa ? globalMa - espMa : 1,
    sampleStep: matrix ? 1 : Math.floor((total - 1) / MAX_LIVE_LEDS(esp8266)) + 1,
    matrixWidth: matrix?.w ?? 0,
    // blendSegment: segments that are on, in order, each over the ones before
    segs: segments
      .filter((g) => g.on && g.stop > g.start)
      .map((g) => ({
        start: g.start,
        stop: g.stop,
        startY: g.startY ?? 0,
        stopY: g.stopY ?? 1,
        cct: Math.min(255, Math.max(0, g.cct ?? 127)),
        white: g.col.some((c) => (c[3] ?? 0) > 0),
      })),
    // WS2812FX::show: the white balance only reaches the buses as a temperature when correction is on and white
    // temperature isn't worked out from the colour
    whiteBalance: !!led?.cct && !led?.cr,
  }
}

// colorKtoRGB (colors.cpp): the colour of a temperature
function kelvinRgb(kelvin: number): [number, number, number] {
  const t = kelvin / 100
  let r: number, g: number, b: number
  if (t <= 66) {
    r = 255
    g = Math.round(99.4708025861 * Math.log(t) - 161.1195681661)
    b = t <= 19 ? 0 : Math.round(138.5177312231 * Math.log(t - 10) - 305.0447927307)
  } else {
    r = Math.round(329.698727446 * Math.pow(t - 60, -0.1332047592))
    g = Math.round(288.1221695283 * Math.pow(t - 60, -0.0755148492))
    b = 255
  }
  return [r, g, b].map((v) => Math.min(255, Math.max(0, v))) as [number, number, number]
}
const tints = new Map<number, [number, number, number]>()

// colorBalanceFromKelvin (colors.cpp) at a segment's white balance: BusManager::setSegmentCCT turns 0-255 into
// 1900 K + 32 K a step; white is left alone
function tint(c: RGBW, cct: number): RGBW {
  const k = 1900 + (cct << 5)
  let t = tints.get(k)
  if (!t) tints.set(k, (t = kelvinRgb(k)))
  return [Math.floor((t[0] * c[0]) / 255), Math.floor((t[1] * c[1]) / 255), Math.floor((t[2] * c[2]) / 255), c[3]]
}

type RGBW = [number, number, number, number]

// color_fade(c, amount, video = true), colors.cpp: rounds, and keeps a colour channel lit if it was above ~25% of
// the brightest one, so dim colours don't lose their hue, and white lit if it was on at all
function fade(c: RGBW, amount: number): RGBW {
  if (amount === 0 || (c[0] | c[1] | c[2] | c[3]) === 0) return [0, 0, 0, 0]
  if (amount === 255) return c
  const maxc = (Math.max(c[0], c[1], c[2]) >> 2) + 1
  return c.map((v, ch) => (((v * amount + 127) >> 8) & 255) | ((ch === 3 ? v > 0 : v > maxc) ? 1 : 0)) as RGBW
}

// Bus::autoWhiteCalc for an output's mode (Dual is decided before: Brighter, or the white as it is)
function autoWhite([r, g, b, w]: RGBW, aw: number): RGBW {
  if (aw === AW_MAX) return [r, g, b, Math.max(r, g, b)]
  if (aw !== AW_BRIGHTER && aw !== AW_ACCURATE) return [r, g, b, w]
  const min = Math.min(r, g, b)
  return aw === AW_ACCURATE ? [r - min, g - min, b - min, min] : [r, g, b, min]
}

// Returns a new frame (same format) with the colours as the LEDs show them, scaled back up for the screen.
export function ledOutputFrame(frame: Uint8Array, m: LedModel): Uint8Array {
  if (m.bri === 0) return frame
  const matrix = frame[1] === 2
  const head = matrix ? 4 : 2
  const count = Math.floor((frame.length - head) / 3)
  // LED index and how many LEDs each Peek pixel stands for
  const fw = matrix ? frame[2] : 0
  const n = matrix && m.matrixWidth ? Math.max(1, Math.round(m.matrixWidth / fw)) : m.sampleStep
  const ledIndex = (k: number) => (matrix ? Math.floor(k / fw) * n * m.matrixWidth + (k % fw) * n : k * n)
  const weight = matrix ? n * n : n
  const outputOf = (led: number) => m.outputs.findIndex((o) => led >= o.start && led < o.start + o.len)
  // the segment on top of an LED (the frame buffer is laid out x + y * matrix width)
  const segAt = (led: number) => {
    const x = m.matrixWidth ? led % m.matrixWidth : led
    const y = m.matrixWidth ? Math.floor(led / m.matrixWidth) : 0
    for (let j = m.segs.length - 1; j >= 0; j--) {
      const g = m.segs[j]
      if (x >= g.start && x < g.stop && y >= g.startY && y < g.stopY) return g
    }
    return undefined
  }

  const px: RGBW[] = []
  const out: number[] = []
  const sums = m.outputs.map(() => 0)
  for (let k = 0; k < count; k++) {
    const i = head + k * 3
    const led = ledIndex(k)
    const o = outputOf(led)
    const output = m.outputs[o]
    const seg = segAt(led)
    const ownWhite = seg?.white ?? false
    let c: RGBW = [frame[i], frame[i + 1], frame[i + 2], 0]
    let aw = output?.white ? output.aw : AW_NONE
    // Dual: Brighter where a pixel has no white of its own
    if (aw === AW_DUAL) aw = ownWhite ? AW_NONE : AW_BRIGHTER
    if (output?.white && aw === AW_NONE && ownWhite) {
      // the part R, G and B share as the pixel's own white (the frame added it to each)
      const w = Math.min(c[0], c[1], c[2])
      c = [c[0] - w, c[1] - w, c[2] - w, w]
    }
    if (m.gamma && c[0] | c[1] | c[2] | c[3]) c = c.map((v) => m.gamma![v]) as RGBW
    // LEDs outside every segment keep the neutral 127 the firmware fills the white balances with
    const tinted = m.whiteBalance && output && (output.digital || output.pwmTint || output.net)
    if (tinted && !output.net) c = tint(c, seg?.cct ?? 127)
    if (output?.white) c = autoWhite(c, aw)
    if (tinted && output.net) c = tint(c, seg?.cct ?? 127)
    if (output?.digital) {
      c = fade(c, m.bri)
      // BusDigital::setPixelColor sums the faded channels for the current estimate (max colour channel for
      // WS2815); WWA's bus colour is warm and cold white (which add up to about the white), 0 and white
      const [r, g, b, w] = c
      sums[o] += (output.ma === 255 ? Math.max(r, g, b) : output.wwa ? 2 * w : r + g + b + w) * weight
    }
    px.push(c)
    out.push(o)
  }

  // current limiter: BusDigital::estimateCurrent / applyBriLimit and BusManager::applyABL
  const limitBri = m.outputs.map(() => 255)
  if (m.abl !== 'off') {
    const used = m.outputs.map((o, i) => {
      if (!o.digital) return 0
      const sum = o.ma === 255 ? sums[i] * 3 : sums[i]
      return Math.floor((sum * (o.ma === 255 ? 12 : o.ma)) / (o.white ? 1020 : 765)) + o.len
    })
    if (m.abl === 'perOutput') {
      m.outputs.forEach((o, i) => {
        if (!o.digital || o.limit === 0 || used[i] === 0) return
        if (o.limit > o.len) {
          if (used[i] > o.limit) limitBri[i] = Math.floor((o.limit * 255) / used[i]) + 1
        } else limitBri[i] = 1
      })
    } else {
      const sum = used.reduce((a, b) => a + b, 0)
      const leds = m.outputs.reduce((a, o) => a + (o.digital ? o.len : 0), 0)
      let bri = 255
      if (m.globalLimit > leds) {
        if (sum > m.globalLimit) bri = Math.floor((m.globalLimit * 255) / sum) + 1
      } else bri = 1
      m.outputs.forEach((o, i) => {
        if (o.digital && o.ma > 0) limitBri[i] = Math.min(255, bri)
      })
    }
  }

  // back to screen colours: the white LEDs' light added to the colour LEDs' (as neutral white), the brightness
  // divided out, then the gamma undone
  const result = new Uint8Array(frame)
  for (let k = 0; k < count; k++) {
    const output = m.outputs[out[k]]
    let c = px[k]
    let scale = 1
    if (output?.digital) {
      const limit = limitBri[out[k]]
      if (limit < 255) c = fade(c, limit)
      scale = (m.bri / 255) * (limit / 255)
    }
    const colour = !output || output.rgb
    const white = output?.white ? c[3] : 0
    const i = head + k * 3
    for (let ch = 0; ch < 3; ch++) {
      const v = Math.min(255, ((colour ? c[ch] : 0) + white) / scale)
      result[i + ch] = Math.round(m.gamma ? 255 * Math.pow(v / 255, 1 / m.gammaValue) : v)
    }
  }
  return result
}
