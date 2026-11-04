import { useEffect, useState } from 'react'
import type { Cfg, LedOutputCfg } from './api'
import { useCfgForm } from './config'
import { intIn, useLeaveGuard, useSaver } from './shared'

// The LED and hardware form (the firmware's data/settings_leds.htm, WLED v16.0.1), shared by the LED and
// hardware page and the Defaults page: both save through /settings/leds, which needs every field of the
// form, so each page posts the other's values too. Values come from /json/cfg; the LED types and the chip's
// limits are only in the page's settings script (/settings/s.js?p=2), which is read for those.

// ---- What the settings script adds --------------------------------------------------------------------

// An LED type (LEDTypesToJson() in bus_manager.cpp). t: "D" digital, "2P" digital with a clock, "" on/off,
// "A".."AAAAA" PWM with that many pins, "N" network, "V" virtual, "H" HUB75. c: 0x01 RGB, 0x02 white,
// 0x04 CCT, 0x10 16 bit, 0x20 needs off refresh.
export interface LedType { i: number; c: number; t: string; n: string }

export interface LedInfo {
  types: LedType[]
  chip: number // WLED_PLATFORM_ID: 0 ESP8266, 1 C3, 2 S2, 3 S3, 4 ESP32
  maxPB: number // LEDs per output
  maxM: number // LED memory in bytes
  maxL: number // LEDs in all
  maxCO: number // colour order overrides
  maxD: number // digital outputs
  maxRMT: number
  maxI2S: number
  maxA: number // PWM pins
  maxBT: number // buttons
  touch: number[] // touch-capable pins
}

const list = (js: string, name: string) => {
  const m = js.match(new RegExp(`d\\.${name}=\\[([^\\]]*)\\]`))
  return m ? m[1].split(',').filter(Boolean).map(Number) : []
}

// Reads the parts of the script it needs as data; the script itself isn't run.
export function parseLedScript(js: string): LedInfo | null {
  const types = js.match(/d\.ledTypes=(\[.*?\]);/)
  const limits = js.match(/bLimits\(([\d,]+)\)/)
  if (!types || !limits) return null
  const json = types[1].replace(/([{,])(\w+):/g, '$1"$2":').replace(/,\]$/, ']')
  const [chip, maxPB, maxM, maxL, maxCO, maxD, maxRMT, maxI2S, maxA, maxBT] = limits[1].split(',').map(Number)
  return { types: JSON.parse(json), chip, maxPB, maxM, maxL, maxCO, maxD, maxRMT, maxI2S, maxA, maxBT, touch: list(js, 'touch') }
}

let infoCache: Promise<LedInfo | null> | null = null
// The settings script once per visit (it only changes with the firmware); null when it couldn't be read.
export function useLedInfo() {
  const [info, setInfo] = useState<LedInfo | null | undefined>(undefined)
  useEffect(() => {
    infoCache ??= fetch('/settings/s.js?p=2').then((r) => (r.ok ? r.text() : '')).then(parseLedScript).catch(() => null)
    infoCache.then((i) => { if (!i) infoCache = null; setInfo(i) })
  }, [])
  return info
}

// ---- LED types ----------------------------------------------------------------------------------------

export type Types = (t: number) => LedType
export const typeLookup = (info: LedInfo): Types => {
  const fallback: LedType = { i: 0, c: 0, t: '', n: 'Unknown' }
  return (t) => info.types.find((x) => x.i === t) ?? fallback
}
export const isPWM = (x: LedType) => x.t.charAt(0) === 'A'
export const isAna = (x: LedType) => x.t === '' || isPWM(x)
export const isD2P = (x: LedType) => x.t === '2P'
export const isDig = (x: LedType) => x.t === 'D' || isD2P(x)
export const isNet = (x: LedType) => x.t === 'N'
export const isVir = (x: LedType) => x.t === 'V' || isNet(x)
export const isHub75 = (x: LedType) => x.t === 'H'
export const hasRGB = (x: LedType) => !!(x.c & 0x01)
export const hasW = (x: LedType) => !!(x.c & 0x02)
export const hasCCT = (x: LedType) => !!(x.c & 0x04)
export const is16b = (x: LedType) => !!(x.c & 0x10)
export const mustRefresh = (x: LedType) => !!(x.c & 0x20)
export const numPins = (x: LedType) => Math.max(x.t.length, 1)
// fields in the pins row: GPIOs, or the 4 parts of an IP address, or HUB75's 5 panel numbers
export const pinFields = (x: LedType) => numPins(x) + 3 * +isNet(x) + 4 * +isHub75(x)
// a digital output that takes an RMT or I2S channel
const usesChannel = (x: LedType) => x.t === 'D'

// What each pin is called, for an output's type.
export function pinLabels(x: LedType): string[] {
  if (isD2P(x)) return ['Data GPIO', 'Clock GPIO']
  if (x.t === 'D') return ['Data GPIO']
  if (isNet(x)) return ['IP address']
  if (isHub75(x)) return ['Panel width', 'Panel height', 'Panels', 'Rows', 'Columns']
  if (x.t === 'V') return ['Config']
  const pwm: Record<number, string[]> = { 2: ['Warm white GPIO', 'Cold white GPIO'], 3: ['Red GPIO', 'Green GPIO', 'Blue GPIO'],
    4: ['Red GPIO', 'Green GPIO', 'Blue GPIO', 'White GPIO'], 5: ['Red GPIO', 'Green GPIO', 'Blue GPIO', 'Warm white GPIO', 'Cold white GPIO'] }
  return pwm[numPins(x)] ?? ['GPIO']
}

// ---- The form -----------------------------------------------------------------------------------------

export interface Output {
  type: number
  pins: number[] // 5 fields; -1 is empty. GPIOs, or IP address parts (network), or panel numbers (HUB75)
  text: string // host name of a network output
  start: number
  len: number
  order: number // colour order, 0–5
  swap: number // white channel swap, 0–4
  rev: boolean
  skip: number
  ref: boolean // off refresh (dithering for PWM)
  aw: number // auto white mode
  freq: number // as stored: kHz for clocked outputs, Hz for PWM
  drv: number // 0 RMT, 1 I2S
  ledma: number // mA per LED (255: WS2815's 12 mA)
  maxpwr: number // this output's power supply, mA (per-output limiter)
}
export interface ColorOverride { start: number; len: number; order: number; swap: number }
export interface ButtonCfg { pin: number; type: number }

export interface LedForm {
  outs: Output[]
  customStarts: boolean
  autoSeg: boolean // a segment for each output
  abl: boolean
  ppl: boolean // per-output limiter
  maxpwr: number // power supply for all outputs, mA
  bf: number // brightness factor, %
  com: ColorOverride[]
  gc: boolean // gamma for colours
  gb: boolean // gamma for brightness
  gv: number
  cct: boolean // white balance correction
  aw: number // global auto white override, 255 = disabled
  cr: boolean // CCT from RGB
  ic: boolean // CCT IC (Athom 15W)
  cb: number // CCT blending
  btns: ButtonCfg[]
  pull: boolean // internal pull-up/down
  tt: number // touch threshold
  ir?: { pin: number; type: number } // builds without IR have none
  irMain: boolean // IR changes only the main segment
  relay: { pin: number; inverted: boolean; odrain: boolean }
  // the Defaults page
  on: boolean // turn on at boot
  bri: number // boot brightness
  ps: number // boot preset
  td: number // transition, ms
  rpc: number // random palette cycle, s
  hrp: boolean // harmonic random palettes
  nl: { dur: number; tbri: number; mode: number }
  pb: number // palette wrapping
  fps: number
}

// pins stored as 255 are unset
const pinOf = (p: number | undefined) => (p === undefined || p === 255 ? -1 : p)

export const toOutput = (b: LedOutputCfg): Output => ({
  type: b.type, pins: [0, 1, 2, 3, 4].map((i) => pinOf(b.pin?.[i])), text: b.text ?? '',
  start: b.start ?? 0, len: b.len ?? 1, order: (b.order ?? 0) & 0x0f, swap: (b.order ?? 0) >> 4, rev: !!b.rev, skip: b.skip ?? 0,
  ref: !!b.ref, aw: b.rgbwm ?? 0, freq: b.freq ?? 0, drv: b.drv ?? 0, ledma: b.ledma ?? 55, maxpwr: b.maxpwr ?? 0,
})
// a start that isn't where the previous output ends means the starts were set by hand (checkSi())
export const startsCustom = (outs: Output[]) => outs.some((o, i) => o.start !== (i ? outs[i - 1].start + outs[i - 1].len : 0))

export function toLedForm(cfg: Cfg): LedForm {
  const hw = cfg.hw!
  const led = hw.led
  const light = cfg.light!
  const outs = led.ins.map(toOutput)
  const sum = outs.reduce((s, o) => s + o.maxpwr, 0)
  return {
    outs, customStarts: startsCustom(outs), autoSeg: light.aseg,
    abl: led.maxpwr > 0 || sum > 0, ppl: !led.maxpwr && sum > 0, maxpwr: led.maxpwr || sum, bf: light['scale-bri'],
    com: (hw.com ?? []).map((c) => ({ start: c.start, len: c.len, order: c.order & 0x0f, swap: c.order >> 4 })),
    gc: light.gc.col !== 1, gb: light.gc.bri !== 1, gv: light.gc.val,
    cct: led.cct, aw: led.rgbwm, cr: led.cr, ic: led.ic, cb: led.cb,
    btns: (hw.btn?.ins ?? []).map((b) => ({ pin: pinOf(b.pin?.[0]), type: b.type })),
    pull: hw.btn?.pull ?? true, tt: hw.btn?.tt ?? 32,
    ir: hw.ir?.pin === undefined ? undefined : { pin: hw.ir.pin, type: hw.ir.type ?? 0 }, irMain: !(hw.ir?.sel ?? true),
    relay: { pin: hw.relay?.pin ?? -1, inverted: hw.relay?.rev ?? false, odrain: hw.relay?.odrain ?? false },
    on: cfg.def.on, bri: cfg.def.bri, ps: cfg.def.ps,
    td: light.tr.dur * 100, rpc: light.tr.rpc, hrp: light.tr.hrp,
    nl: { dur: light.nl.dur, tbri: light.nl.tbri, mode: light.nl.mode }, pb: light['pal-mode'], fps: led.fps,
  }
}

// The form of the LED and hardware and Defaults pages, with the LED types, saved through /settings/leds.
export function useLedForm() {
  const form = useCfgForm(toLedForm)
  const info = useLedInfo()
  useLeaveGuard(form.dirty)
  const { save, saving, dialog } = useSaver('leds', form.reloadAfterSave)
  return { ...form, info, save, saving, dialog }
}

// ---- Clock speeds -------------------------------------------------------------------------------------

export const SPEEDS = ['Slowest', 'Slow', 'Normal', 'Fast', 'Fastest']
const pwmBase = (chip: number) => (chip === 0 ? 880 : chip === 4 ? 19531 : 9765) // WLED_PWM_FREQ (const.h)
// the speed choices' frequencies, as the firmware sets them (set.cpp)
export function speedFreqs(x: LedType, chip: number): number[] {
  if (isD2P(x)) return [1000, 2000, 5000, 10000, 20000]
  const b = pwmBase(chip)
  return [b / 2, (b * 2) / 3, b, b * 2, (b * 10) / 3].map(Math.trunc)
}
// the choice a stored frequency is, like xml.cpp (anything else counts as Normal)
export const speedIndex = (x: LedType, chip: number, freq: number) => {
  const i = speedFreqs(x, chip).indexOf(freq)
  return i < 0 ? 2 : i
}

// ---- Sums and limits ----------------------------------------------------------------------------------

// RMT and I2S channels the digital outputs take (getDuse()); I2Smem is the I2S buffer per I2S output.
export function channelUse(outs: Output[], T: Types, info: LedInfo) {
  let rmt = 0, i2s = 0, maxLeds = 0
  let i2sType: number | null = null
  if (info.chip !== 0) for (const o of outs) {
    if (!usesChannel(T(o.type))) continue
    if (o.drv === 1) {
      i2s++
      maxLeds = Math.max(maxLeds, (o.len || 0) + (o.skip || 0))
      i2sType ??= o.type
    } else rmt++
  }
  let i2sMem = 0
  if (i2sType !== null) {
    const x = T(i2sType)
    const ch = 3 * +hasRGB(x) + +hasW(x) + +hasCCT(x)
    if (is16b(x)) maxLeds *= 2
    i2sMem = Math.round((maxLeds * ch * (i2s > 1 || info.chip === 3 ? 24 : 3)) / i2s)
  }
  return { rmt, i2s, i2sType, i2sMem }
}

// Bytes an output takes: its pixel buffers, plus the driver's buffer (getMem()).
function memOf(o: Output, T: Types, info: LedInfo, i2sMem: number) {
  const x = T(o.type)
  if (isAna(x)) return 5
  let len = (o.len || 0) + (o.skip || 0)
  const buffers = len * 8
  const ch = 3 * +hasRGB(x) + +hasW(x) + +hasCCT(x)
  let mul = 1, dma = 0
  if (isDig(x)) {
    if (is16b(x)) len *= 2
    if (info.chip === 0 && o.pins[0] === 3) mul = 5 // ESP8266 DMA on GPIO3
    if (info.chip !== 0 && !isD2P(x)) {
      mul = 2
      if (o.drv === 1) { mul = 1; dma = i2sMem }
    }
  }
  return len * ch * mul + dma + buffers
}

// Whether an output's driver choice works with the others (isBCok()).
export function busOk(o: Output, T: Types, info: LedInfo, use: ReturnType<typeof channelUse>) {
  if (info.chip === 0 || !usesChannel(T(o.type))) return true
  if (o.drv === 1 && use.i2sType !== null && o.type !== use.i2sType) return false
  if (o.drv === 0 && use.rmt > info.maxRMT) return false
  if (o.drv === 1 && use.i2s > info.maxI2S) return false
  return true
}

export function summary(f: LedForm, T: Types, info: LedInfo) {
  const use = channelUse(f.outs, T, info)
  let total = 0, physical = 0, digital = 0, maxPerOutput = 0, busMA = 0, mem = 0
  f.outs.forEach((o, i) => {
    const x = T(o.type)
    mem += memOf(o, T, info, use.i2sMem)
    const start = startOf(f, i)
    if (!o.len) return
    total = Math.max(total, start + o.len)
    if (!isVir(x)) physical += o.len
    if (isDig(x)) {
      maxPerOutput = Math.max(maxPerOutput, o.len)
      digital += o.len
      busMA += (o.ledma === 255 ? 12 : o.ledma) * o.len
    }
  })
  const amps = (div: number) => { const v = Math.ceil((100 + busMA) / div) / 2; return v > 5 ? Math.ceil(v) : v }
  return { use, total, physical, digital, maxPerOutput, mem, memPct: (mem / info.maxM) * 100, psu: amps(500), psuMost: amps(1500) }
}

// Where an output starts: set by hand with custom starts, otherwise right after the outputs before it
// (UI() and set.cpp count up the lengths in order).
export function startOf(f: LedForm, i: number) {
  if (f.customStarts) return f.outs[i].start
  return f.outs.slice(0, i).reduce((s, o) => s + (o.len || 0), 0)
}

// Which LED types an output can switch to, given the others (updateTypeDropdowns()): digital outputs up to
// maxD and the RMT/I2S channels (I2S outputs must share one type), two clocked outputs, and PWM up to maxA pins.
export function allowedTypes(f: LedForm, index: number, T: Types, info: LedInfo): Set<number> {
  const use = channelUse(f.outs, T, info)
  let digital = 0, twoPin = 0, analogPins = 0
  for (const o of f.outs) {
    const x = T(o.type)
    if (usesChannel(x)) digital++
    if (isPWM(x)) analogPins += numPins(x)
    if (isD2P(x)) twoPin++
  }
  // the first I2S output: later I2S outputs must have its type, and the stock page's loop only knows it
  // once it has passed it
  const firstIdx = f.outs.findIndex((o) => usesChannel(T(o.type)) && o.drv === 1)
  const firstI2S = firstIdx >= 0 && firstIdx <= index ? f.outs[firstIdx].type : null
  const cur = f.outs[index]
  const x = T(cur.type)
  const ok = new Set<number>()
  for (const t of info.types) {
    let allowed = true
    if (t.t === 'D') {
      if (usesChannel(x)) {
        if (cur.drv === 1 && firstIdx !== index && t.i !== firstI2S) allowed = false
      } else if (digital >= info.maxD) allowed = false
      else if (info.chip !== 0 && use.rmt >= info.maxRMT && firstI2S !== null && t.i !== firstI2S) allowed = false
    }
    if (isD2P(t) && twoPin >= 2 && !isD2P(x)) allowed = false
    if (isPWM(t) && numPins(t) > info.maxA - analogPins + (isPWM(x) ? numPins(x) : 0)) allowed = false
    if (allowed || t.i === cur.type) ok.add(t.i)
  }
  return ok
}

// A new output, like the stock page's + button: the first type that's free, one LED, after the last output.
export function newOutput(f: LedForm, T: Types, info: LedInfo): Output {
  const o: Output = {
    type: 0, pins: [-1, -1, -1, -1, -1], text: '', start: f.outs.reduce((s, x) => s + (x.len || 0), 0), len: 1,
    order: 0, swap: 0, rev: false, skip: 0, ref: false, aw: 0, freq: 0, drv: 0, ledma: 55, maxpwr: 250,
  }
  const net = info.types.find(isNet)
  const draft = { ...f, outs: [...f.outs, { ...o, type: net?.i ?? 0 }] }
  const allowed = allowedTypes(draft, f.outs.length, T, info)
  return withType(o, info.types.find((t) => allowed.has(t.i))?.i ?? info.types[0].i, T, info)
}

// An output switched to another type, with what doesn't apply to it reset (UI(true)).
export function withType(o: Output, type: number, T: Types, info: LedInfo): Output {
  const x = T(type)
  const n = pinFields(x)
  // the values carry over between types whose fields mean the same: GPIOs, an IP address, HUB75 panels
  const fieldKind = (y: LedType) => (isNet(y) ? 'ip' : isHub75(y) ? 'panel' : isVir(y) ? 'config' : 'gpio')
  const keep = fieldKind(T(o.type)) === fieldKind(x)
  const pins = [0, 1, 2, 3, 4].map((i) => (i < n && keep ? o.pins[i] : -1))
  if (isHub75(x)) for (let i = 2; i < 5; i++) if (pins[i] < 0) pins[i] = 1
  return {
    ...o, type, pins,
    len: isAna(x) ? 1 : o.len,
    ref: o.ref || type === 31 || mustRefresh(x),
    swap: isDig(x) && hasW(x) ? (o.swap === 4 && !hasCCT(x) ? 0 : o.swap) : 0,
    freq: isD2P(x) || isPWM(x) ? speedFreqs(x, info.chip)[2] : 0,
    text: isNet(x) && info.chip !== 0 ? o.text : '',
  }
}

// ---- Checks -------------------------------------------------------------------------------------------

// What has to be fixed before saving, for each page: both are saved together, so either page's problems block
// the other.
export function validate(f: LedForm, T: Types, info: LedInfo, s: ReturnType<typeof summary>) {
  let e: string[] = []
  const check = (ok: boolean, msg: string) => { if (!ok && !e.includes(msg)) e.push(msg) }
  const seen = new Map<number, number>()
  f.outs.forEach((o, i) => {
    const x = T(o.type)
    const n = `Output ${i + 1}`
    const fields = pinFields(x)
    if (isNet(x)) check(o.pins.slice(0, 4).every((p) => intIn(p, 0, 255)), `${n}: each part of the IP address must be 0–255.`)
    else if (isHub75(x)) {
      check(intIn(o.pins[0], 16, 128) && intIn(o.pins[1], 16, 128), `${n}: the panel width and height must be 16–128.`)
      check(o.pins.slice(2, 5).every((p) => intIn(p, 1, 4)), `${n}: panels, rows and columns must be 1–4.`)
      check(o.pins[2] === o.pins[3] * o.pins[4], `${n}: the number of panels must be rows × columns.`)
    } else if (x.t === 'V') check(o.pins.slice(0, fields).every((p) => intIn(p, 0, 255)), `${n}: the config values must be 0–255.`)
    else {
      check(o.pins.slice(0, fields).every((p) => p >= 0), `${n}: choose ${fields > 1 ? 'all its pins' : 'a pin'}.`)
      for (const p of o.pins.slice(0, fields)) {
        if (p < 0) continue
        check(!seen.has(p), `GPIO ${p} is used by two outputs.`)
        seen.set(p, i)
      }
    }
    if (!isAna(x) && !isHub75(x)) check(intIn(o.len, 1, isDig(x) ? info.maxPB : 16384), `${n}: the length must be 1–${isDig(x) ? info.maxPB : 16384}.`)
    if (f.customStarts) check(intIn(o.start, 0, 8191), `${n}: the start must be 0–8191.`)
    if (!isVir(x) && !isAna(x) && !isHub75(x)) check(intIn(o.skip, 0, 255), `${n}: skipped LEDs must be 0–255.`)
    if (f.abl && isDig(x)) {
      check(intIn(o.ledma, 1, 255), `${n}: the current per LED must be 1–255 mA.`)
      if (f.ppl) check(intIn(o.maxpwr, 250, 65000), `${n}: the power supply rating must be 250–65000 mA.`)
    }
    check(busOk(o, T, info, s.use), `${n}: too many outputs on the ${o.drv ? 'I2S' : 'RMT'} driver${o.drv && s.use.i2sType !== null && o.type !== s.use.i2sType ? ', or a different LED type than the other I2S outputs' : ''}.`)
  })
  if (f.abl && !f.ppl) check(intIn(f.maxpwr, 250, 65000), 'The power supply rating must be 250–65000 mA.')
  check(s.memPct <= 100, 'Too many LEDs for the light\'s memory.')
  check(intIn(f.bf, 1, 255), 'The brightness factor must be 1–255 %.')
  check(f.gv >= 0.1 && f.gv <= 3, 'The gamma value must be 0.1–3.')
  check(intIn(f.cb, -100, 100), 'CCT blending must be −100 to 100 %.')
  f.com.forEach((c, i) => check(intIn(c.start, 0, 65535) && intIn(c.len, 1, 65535), `Colour order override ${i + 1}: start 0–65535 and length 1–65535.`))
  check(intIn(f.tt, 0, 100), 'The touch threshold must be 0–100.')
  const leds = e
  e = []
  check(intIn(f.bri, 1, 255), 'The boot brightness must be 1–255.')
  check(intIn(f.ps, 0, 250), 'The boot preset must be 0–250.')
  check(intIn(f.td, 0, 65500), 'The transition time must be 0–65500 ms.')
  check(intIn(f.rpc, 1, 255), 'The random palette cycle time must be 1–255 s.')
  check(intIn(f.nl.dur, 1, 255), 'The timer duration must be 1–255 min.')
  check(intIn(f.nl.tbri, 0, 255), 'The timer\'s target brightness must be 0–255.')
  check(intIn(f.fps, 0, 250), 'The refresh rate must be 0–250 FPS.')
  return { leds, defaults: e }
}

// A page's own problems, then one line for the other page's.
export const pageErrors = (own: string[], other: string[], otherTitle: string) =>
  other.length ? [...own, `Fix ${otherTitle} first: its settings are saved with these.`] : own

// ---- Saving -------------------------------------------------------------------------------------------

// The whole form as the stock page posts it. Checkboxes are only sent when on, and the starts only with
// custom starts (the stock page disables those fields otherwise, so set.cpp counts them up itself).
export function ledFields(f: LedForm, T: Types, info: LedInfo): [string, string][] {
  const out: [string, string][] = []
  const val = (k: string, v: number | string) => out.push([k, String(v)])
  const on = (k: string, v: boolean) => { if (v) out.push([k, 'on']) }
  const id = (i: number) => String.fromCharCode((i < 10 ? 48 : 55) + i)

  val('BF', f.bf)
  on('ABL', f.abl); on('PPL', f.abl && f.ppl)
  val('MA', f.abl && !f.ppl ? f.maxpwr : 0)
  f.outs.forEach((o, i) => {
    const s = id(i)
    const x = T(o.type)
    const fields = pinFields(x)
    o.pins.forEach((p, j) => val(`L${j}${s}`, j < fields && p >= 0 ? p : ''))
    val(`LT${s}`, o.type)
    val(`LC${s}`, isAna(x) ? 1 : o.len)
    if (f.customStarts) val(`LS${s}`, o.start)
    val(`CO${s}`, o.order); val(`WO${s}`, o.swap)
    on(`CV${s}`, o.rev); val(`SL${s}`, o.skip); on(`RF${s}`, o.ref); val(`AW${s}`, o.aw)
    val(`SP${s}`, isD2P(x) || isPWM(x) ? speedIndex(x, info.chip, o.freq) : 0)
    val(`LA${s}`, o.ledma); val(`MA${s}`, o.maxpwr)
    val(`LD${s}`, usesChannel(x) ? o.drv : 0)
    val(`HS${s}`, o.text)
  })
  on('MS', f.autoSeg)
  f.com.forEach((c, i) => { const s = id(i); val(`XS${s}`, c.start); val(`XC${s}`, c.len); val(`XO${s}`, c.order); val(`XW${s}`, c.swap) })
  on('GC', f.gc); on('GB', f.gb); val('GV', f.gv)
  on('CCT', f.cct)
  // without a white channel the stock page resets these (they're hidden)
  const white = f.outs.some((o) => hasW(T(o.type)))
  val('AW', white ? f.aw : 255); on('CR', white && f.cr)
  on('IC', f.ic); val('CB', f.cb)
  f.btns.forEach((b, i) => { const s = id(i); val(`BT${s}`, b.pin); val(`BE${s}`, b.type) })
  on('IP', !f.pull); val('TT', f.tt)
  if (f.ir) { val('IR', f.ir.pin); val('IT', f.ir.type) }
  on('MSO', f.irMain)
  val('RL', f.relay.pin); on('RM', !f.relay.inverted); on('RO', f.relay.odrain)
  on('BO', f.on); val('CA', f.bri); val('BP', f.ps)
  val('TD', f.td); on('TH', f.hrp); val('TP', f.rpc)
  val('TL', f.nl.dur); val('TB', f.nl.tbri); val('TW', f.nl.mode)
  val('PB', f.pb); val('FR', f.fps)
  return out
}
