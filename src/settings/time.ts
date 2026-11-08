import type { Cfg } from './api'
import { intIn, presetIdValid } from './shared'
import { isAnalogBtn, isSwitchBtn } from './leds'

// The Time and macros form (the firmware's data/settings_time.htm, WLED v16.0.1, filled by xml.cpp, saved by
// set.cpp and ntp.cpp addTimer), shared by the Time and macros page and the Buttons page: both save through
// /settings/time, which needs every field of the form, so the Buttons page posts the time settings too, and
// Time and macros posts the buttons' presets.

// timer hours that stand for sunrise and sunset
export const SUNRISE = 255
export const SUNSET = 254

export type Timer = {
  en: boolean
  kind: number
  hour: number
  min: number
  preset: number
  dow: number
  ms: number
  ds: number
  me: number
  de: number
}
export type TimeButton = { type: number; macros: number[] }
export type TimeForm = {
  ntp: boolean
  host: string
  h24: boolean
  tz: number
  offset: number
  lat: number
  lon: number
  ol: { on: boolean; min: number; max: number; h12: number; m5: boolean; sec: boolean; solid: boolean }
  cd: { on: boolean; goal: number[] } // 2-digit year, month, day, hour, minute, second
  nlPreset: number
  cdPreset: number
  alexaOn: number
  alexaOff: number
  buttons: TimeButton[]
  timers: Timer[]
}

export const newTimer = (): Timer => ({
  en: true,
  kind: 0,
  hour: 0,
  min: 0,
  preset: 0,
  dow: 127,
  ms: 1,
  ds: 1,
  me: 12,
  de: 31,
})

export function toTimeForm(c: Cfg): TimeForm {
  const ntp = c.if!.ntp
  const ol = c.ol!
  return {
    ntp: ntp.en,
    host: ntp.host,
    h24: !ntp.ampm,
    tz: ntp.tz,
    offset: ntp.offset,
    lat: ntp.lt,
    lon: ntp.ln,
    ol: { on: !!ol.clock, min: ol.min, max: ol.max, h12: ol.o12pix, m5: ol.o5m, sec: ol.osec, solid: ol.osb },
    cd: { on: ol.cntdwn, goal: c.timers!.cntdwn.goal },
    nlPreset: c.light?.nl?.macro ?? 0,
    cdPreset: c.timers!.cntdwn.macro,
    alexaOn: c.if!.va?.macros[0] ?? 0,
    alexaOff: c.if!.va?.macros[1] ?? 0,
    buttons: (c.hw?.btn?.ins ?? []).map((b) => ({
      type: b.type,
      macros: [b.macros[0] ?? 0, b.macros[1] ?? 0, b.macros[2] ?? 0],
    })),
    timers: c.timers!.ins.map((t) => ({
      en: !!t.en,
      kind: t.hour === SUNRISE || t.hour === SUNSET ? t.hour : 0,
      hour: t.hour === SUNRISE || t.hour === SUNSET ? 0 : t.hour,
      min: t.min,
      preset: t.macro,
      dow: t.dow,
      ms: t.start.mon,
      ds: t.start.day,
      me: t.end.mon,
      de: t.end.day,
    })),
  }
}

// button field suffix: 0-9, then A, B, … (set.cpp)
const btnKey = (i: number) => String.fromCharCode((i < 10 ? 48 : 55) + i)

export function timeFields(f: TimeForm): [string, string][] {
  const out: [string, string][] = []
  const val = (k: string, v: string | number) => out.push([k, String(v)])
  const on = (k: string, v: boolean) => {
    if (v) out.push([k, 'on'])
  }
  on('NT', f.ntp)
  val('NS', f.host)
  on('CF', f.h24)
  val('TZ', f.tz)
  val('UO', f.offset)
  val('LN', f.lon)
  val('LT', f.lat)
  on('OL', f.ol.on)
  val('O1', f.ol.min)
  val('O2', f.ol.max)
  val('OM', f.ol.h12)
  on('O5', f.ol.m5)
  on('OS', f.ol.sec)
  on('OB', f.ol.solid)
  on('CE', f.cd.on)
  ;['CY', 'CI', 'CD', 'CH', 'CM', 'CS'].forEach((k, j) => val(k, f.cd.goal[j]))
  val('A0', f.alexaOn)
  val('A1', f.alexaOff)
  val('MC', f.cdPreset)
  val('MN', f.nlPreset)
  // every button's three fields are always posted: set.cpp sets a missing one to 0
  f.buttons.forEach((b, i) => {
    const k = btnKey(i)
    val(`MP${k}`, isAnalogBtn(b.type) ? 0 : b.macros[0])
    val(`ML${k}`, isAnalogBtn(b.type) ? 0 : b.macros[1])
    val(`MD${k}`, isSwitchBtn(b.type) ? 0 : b.macros[2])
  })
  // a timer without a preset (0) is dropped by the firmware (compactTimers)
  f.timers.forEach((t, i) => {
    val(`T${i}`, t.preset)
    val(`H${i}`, t.kind || t.hour)
    val(`N${i}`, t.min)
    val(`W${i}`, (t.dow << 1) | (t.en ? 1 : 0))
    val(`M${i}`, t.ms)
    val(`P${i}`, t.me)
    val(`D${i}`, t.ds)
    val(`E${i}`, t.de)
  })
  return out
}

export function validGoal(g: number[]) {
  const [y, mo, d, h, mi, s] = g
  return (
    intIn(y, 0, 99) && intIn(mo, 1, 12) && intIn(d, 1, 31) && intIn(h, 0, 23) && intIn(mi, 0, 59) && intIn(s, 0, 59)
  )
}

export function validateTime(f: TimeForm): string[] {
  const e: string[] = []
  const check = (ok: boolean, msg: string) => {
    if (!ok) e.push(msg)
  }
  check(intIn(f.offset, -65500, 65500), 'The UTC offset must be a whole number from −65500 to 65500 seconds.')
  check(!Number.isNaN(f.lat) && Math.abs(f.lat) <= 66.6, 'The latitude must be from 0 to 66.6.')
  check(!Number.isNaN(f.lon) && Math.abs(f.lon) <= 180, 'The longitude must be from 0 to 180.')
  check(
    intIn(f.ol.min, 0, 1024) && intIn(f.ol.max, 0, 1024) && intIn(f.ol.h12, 0, 1024),
    'Clock overlay LEDs must be whole numbers from 0 to 1024.',
  )
  check(validGoal(f.cd.goal), 'Set a countdown goal between 2000 and 2099.')
  const ids = [
    f.nlPreset,
    f.cdPreset,
    f.alexaOn,
    f.alexaOff,
    ...f.buttons.flatMap((b) => (isAnalogBtn(b.type) ? [] : b.macros)),
    ...f.timers.map((t) => t.preset),
  ]
  check(ids.every(presetIdValid), 'Preset IDs must be whole numbers from 0 to 250.')
  f.timers.forEach((t, i) => {
    const n = `Timer ${i + 1}`
    if (t.kind) check(intIn(t.min, -120, 120), `${n}: the offset must be −120 to 120 minutes.`)
    else check(intIn(t.hour, 0, 24) && intIn(t.min, 0, 59), `${n}: set an hour from 0 to 24 and a minute from 0 to 59.`)
    check(intIn(t.ds, 1, 31) && intIn(t.de, 1, 31), `${n}: days must be 1–31.`)
  })
  return e
}
