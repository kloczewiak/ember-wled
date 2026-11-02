// "Accurate Peek": turns Peek's live colours into what the LEDs really get, following WLED v16.0.1 from the
// frame Peek sends to the bytes on the wire, so the steps that low brightness causes show up on screen too.
//
// Peek's WebSocket frame (ws.cpp sendLiveLedsWs) is the frame buffer after the segments were combined with
// their own brightness, but before the rest of WS2812FX::show() and the bus:
//   1. gamma correction, per channel (gamma32, colors.h)
//   2. master brightness times the LED settings' brightness factor (scaledBri), with color_fade(..., video)
//      in BusDigital::setPixelColor
//   3. the current limiter (BusManager::applyABL), which can dim each output again with the same fade
// The result is the 8-bit value each LED gets. For the screen, the brightness is divided back out and the
// gamma undone, so colours look like plain Peek at full brightness but keep the LEDs' steps.
//
// Not modelled: white channels (Peek already adds white into RGB), colour temperature balance, brightness
// transitions, and a ledmap. Above 1024 LEDs (256 on an ESP8266) Peek skips LEDs, so the current estimate
// scales up the ones it sends.

import type { Cfg } from '../settings/api'

interface Output { start: number; len: number; digital: boolean; ma: number; limit: number; white: boolean }

export interface LedModel {
  gamma: number[] | null // gamma table, null when gamma correction is off
  gammaValue: number
  bri: number // master brightness the buses get (scaledBri)
  outputs: Output[]
  abl: 'off' | 'global' | 'perOutput'
  globalLimit: number // mA left for the LEDs with a global limit (ESP current taken off)
  sampleStep: number // LEDs per Peek pixel
  matrixWidth: number // 0 for a strip
}

const MAX_LIVE_LEDS = (esp8266: boolean) => (esp8266 ? 256 : 1024)

// types 16-39 and 48-63 (bus_manager.h isDigital, is2Pin): 8 bits per channel
const isDigital = (t: number) => (t >= 16 && t <= 39) || (t >= 48 && t <= 63)
// bus_manager.h hasWhite, digital types only (analog outputs aren't quantised here anyway)
const hasWhite = (t: number) => (t >= 18 && t <= 21) || [28, 29, 30, 31, 32, 34].includes(t)

export function ledModel(cfg: Cfg, bri: number, info: { arch: string; leds: { count: number; matrix?: { w: number; h: number } } }): LedModel {
  const esp8266 = info.arch === 'esp8266'
  const espMa = esp8266 ? 80 : 120 // MA_FOR_ESP
  const gc = cfg.light?.gc?.col ?? 1
  const gamma = gc !== 1 ? Array.from({ length: 256 }, (_, i) => Math.floor(Math.pow(i / 255, gc) * 255 + 0.5)) : null
  const led = cfg.hw?.led
  const ins = led?.ins ?? []
  const globalMa = led?.maxpwr ?? 0

  // BusManager::initializeABL
  let abl: LedModel['abl'] = 'off'
  const outputs: Output[] = ins.map((b) => ({
    start: b.start, len: b.len, digital: isDigital(b.type), ma: b.ledma ?? 0, limit: 0, white: hasWhite(b.type),
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
    gamma, gammaValue: gc,
    bri: Math.min(255, Math.floor((bri * (cfg.light?.['scale-bri'] ?? 100)) / 100)),
    outputs, abl,
    globalLimit: globalMa > espMa ? globalMa - espMa : 1,
    sampleStep: matrix ? 1 : Math.floor((total - 1) / MAX_LIVE_LEDS(esp8266)) + 1,
    matrixWidth: matrix?.w ?? 0,
  }
}

// color_fade(c, amount, video = true), colors.cpp: rounds, and keeps a channel lit if it was above ~25% of the
// brightest one, so dim colours don't lose their hue
function fade(c: [number, number, number], amount: number): [number, number, number] {
  if (amount === 0 || (c[0] | c[1] | c[2]) === 0) return [0, 0, 0]
  if (amount === 255) return c
  const maxc = (Math.max(c[0], c[1], c[2]) >> 2) + 1
  return c.map((v) => (((v * amount + 127) >> 8) & 255) | (v > maxc ? 1 : 0)) as [number, number, number]
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

  const px: [number, number, number][] = []
  const out: number[] = []
  const sums = m.outputs.map(() => 0)
  for (let k = 0; k < count; k++) {
    const i = head + k * 3
    let c: [number, number, number] = [frame[i], frame[i + 1], frame[i + 2]]
    if (m.gamma && (c[0] | c[1] | c[2])) c = c.map((v) => m.gamma![v]) as [number, number, number]
    const o = outputOf(ledIndex(k))
    const output = m.outputs[o]
    if (output?.digital) {
      c = fade(c, m.bri)
      // BusDigital::setPixelColor sums the faded channels for the current estimate (max channel for WS2815)
      sums[o] += (output.ma === 255 ? Math.max(...c) : c[0] + c[1] + c[2]) * weight
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
        if (o.limit > o.len) { if (used[i] > o.limit) limitBri[i] = Math.floor((o.limit * 255) / used[i]) + 1 }
        else limitBri[i] = 1
      })
    } else {
      const sum = used.reduce((a, b) => a + b, 0)
      const leds = m.outputs.reduce((a, o) => a + (o.digital ? o.len : 0), 0)
      let bri = 255
      if (m.globalLimit > leds) { if (sum > m.globalLimit) bri = Math.floor((m.globalLimit * 255) / sum) + 1 }
      else bri = 1
      m.outputs.forEach((o, i) => { if (o.digital && o.ma > 0) limitBri[i] = Math.min(255, bri) })
    }
  }

  // back to screen colours: divide the brightness out, then undo the gamma
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
    const i = head + k * 3
    for (let ch = 0; ch < 3; ch++) {
      const v = Math.min(255, c[ch] / scale)
      result[i + ch] = Math.round(m.gamma ? 255 * Math.pow(v / 255, 1 / m.gammaValue) : v)
    }
  }
  return result
}
