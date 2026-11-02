import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { ExternalLink } from 'lucide-react'
import { Icon, Switch } from '../components/controls'
import { useStore } from '../store'
import type { Cfg } from './api'
import { useCfgForm } from './config'
import { ChoiceChip, FieldError, intIn, presetIdValid, NumberInput, PresetSelect, Row, SaveBar, Section, useLeaveGuard, useSaver } from './shared'

// Settings → Time and macros, with the same fields and limits as the firmware's page in WLED v16.0.1
// (data/settings_time.htm, filled by xml.cpp, saved by set.cpp and ntp.cpp addTimer). Presets are picked by
// name instead of typing their IDs.

// the stock time zone list; the firmware stores the position in it
const TIME_ZONES = ['GMT (UTC)', 'GMT/BST', 'CET/CEST', 'EET/EEST', 'US-EST/EDT', 'US-CST/CDT', 'US-MST/MDT', 'US-AZ', 'US-PST/PDT',
  'CST (AWST, PHST)', 'JST (KST)', 'AEST/AEDT', 'NZST/NZDT', 'North Korea', 'IST (India)', 'CA-Saskatchewan', 'ACST', 'ACST/ACDT',
  'HST (Hawaii)', 'NOVT (Novosibirsk)', 'AKST/AKDT (Anchorage)', 'MX-CST', 'PKT (Pakistan)', 'BRT (Brasília)', 'AWST (Perth)']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SUNRISE = 255
const SUNSET = 254
// what an analog button controls (the stock page's bAO()): a function, or a segment's opacity
const ANALOG: [number, string][] = [[250, 'Global brightness'], [249, 'Effect speed'], [248, 'Effect intensity'], [247, 'Palette'], [200, 'Primary color hue'],
  ...Array.from({ length: 33 }, (_, j): [number, string] => [j, `Segment ${j} opacity`])]
const BUTTON_TYPES: Record<number, string> = { 2: 'Pushbutton', 3: 'Push inverted', 4: 'Switch', 5: 'PIR sensor', 6: 'Touch', 7: 'Analog', 8: 'Analog inverted', 9: 'Touch (switch)' }
const isAnalog = (t: number) => t === 7 || t === 8
const isSwitch = (t: number) => t === 4 || t === 5 || t === 9

type Timer = { en: boolean; kind: number; hour: number; min: number; preset: number; dow: number; ms: number; ds: number; me: number; de: number }
type Btn = { type: number; macros: number[] }
type Form = {
  ntp: boolean; host: string; h24: boolean; tz: number; offset: number; lat: number; lon: number
  ol: { on: boolean; min: number; max: number; h12: number; m5: boolean; sec: boolean; solid: boolean }
  cd: { on: boolean; goal: number[] } // 2-digit year, month, day, hour, minute, second
  nlPreset: number; cdPreset: number; alexaOn: number; alexaOff: number
  buttons: Btn[]
  timers: Timer[]
}

const newTimer = (): Timer => ({ en: true, kind: 0, hour: 0, min: 0, preset: 0, dow: 127, ms: 1, ds: 1, me: 12, de: 31 })

function toForm(c: Cfg): Form {
  const ntp = c.if!.ntp
  const ol = c.ol!
  return {
    ntp: ntp.en, host: ntp.host, h24: !ntp.ampm, tz: ntp.tz, offset: ntp.offset, lat: ntp.lt, lon: ntp.ln,
    ol: { on: !!ol.clock, min: ol.min, max: ol.max, h12: ol.o12pix, m5: ol.o5m, sec: ol.osec, solid: ol.osb },
    cd: { on: ol.cntdwn, goal: c.timers!.cntdwn.goal },
    nlPreset: c.light?.nl?.macro ?? 0, cdPreset: c.timers!.cntdwn.macro,
    alexaOn: c.if!.va?.macros[0] ?? 0, alexaOff: c.if!.va?.macros[1] ?? 0,
    buttons: (c.hw?.btn?.ins ?? []).map((b) => ({ type: b.type, macros: [b.macros[0] ?? 0, b.macros[1] ?? 0, b.macros[2] ?? 0] })),
    timers: c.timers!.ins.map((t) => ({
      en: !!t.en, kind: t.hour === SUNRISE || t.hour === SUNSET ? t.hour : 0, hour: t.hour === SUNRISE || t.hour === SUNSET ? 0 : t.hour,
      min: t.min, preset: t.macro, dow: t.dow, ms: t.start.mon, ds: t.start.day, me: t.end.mon, de: t.end.day,
    })),
  }
}

// button field suffix: 0-9, then A, B, … (set.cpp)
const btnKey = (i: number) => String.fromCharCode((i < 10 ? 48 : 55) + i)

function toFields(f: Form): [string, string][] {
  const out: [string, string][] = []
  const val = (k: string, v: string | number) => out.push([k, String(v)])
  const on = (k: string, v: boolean) => { if (v) out.push([k, 'on']) }
  on('NT', f.ntp); val('NS', f.host); on('CF', f.h24); val('TZ', f.tz); val('UO', f.offset)
  val('LN', f.lon); val('LT', f.lat)
  on('OL', f.ol.on); val('O1', f.ol.min); val('O2', f.ol.max); val('OM', f.ol.h12); on('O5', f.ol.m5); on('OS', f.ol.sec); on('OB', f.ol.solid)
  on('CE', f.cd.on)
  ;['CY', 'CI', 'CD', 'CH', 'CM', 'CS'].forEach((k, j) => val(k, f.cd.goal[j]))
  val('A0', f.alexaOn); val('A1', f.alexaOff); val('MC', f.cdPreset); val('MN', f.nlPreset)
  // every button's three fields are always posted: set.cpp sets a missing one to 0
  f.buttons.forEach((b, i) => {
    const k = btnKey(i)
    val(`MP${k}`, isAnalog(b.type) ? 0 : b.macros[0])
    val(`ML${k}`, isAnalog(b.type) ? 0 : b.macros[1])
    val(`MD${k}`, isSwitch(b.type) ? 0 : b.macros[2])
  })
  // a timer without a preset (0) is dropped by the firmware (compactTimers)
  f.timers.forEach((t, i) => {
    val(`T${i}`, t.preset); val(`H${i}`, t.kind || t.hour); val(`N${i}`, t.min); val(`W${i}`, (t.dow << 1) | (t.en ? 1 : 0))
    val(`M${i}`, t.ms); val(`P${i}`, t.me); val(`D${i}`, t.ds); val(`E${i}`, t.de)
  })
  return out
}

function validGoal(g: number[]) {
  const [y, mo, d, h, mi, s] = g
  return intIn(y, 0, 99) && intIn(mo, 1, 12) && intIn(d, 1, 31) && intIn(h, 0, 23) && intIn(mi, 0, 59) && intIn(s, 0, 59)
}

function validate(f: Form): string[] {
  const e: string[] = []
  const check = (ok: boolean, msg: string) => { if (!ok) e.push(msg) }
  check(intIn(f.offset, -65500, 65500), 'The UTC offset must be a whole number from −65500 to 65500 seconds.')
  check(!Number.isNaN(f.lat) && Math.abs(f.lat) <= 66.6, 'The latitude must be from 0 to 66.6.')
  check(!Number.isNaN(f.lon) && Math.abs(f.lon) <= 180, 'The longitude must be from 0 to 180.')
  check(intIn(f.ol.min, 0, 1024) && intIn(f.ol.max, 0, 1024) && intIn(f.ol.h12, 0, 1024), 'Clock overlay LEDs must be whole numbers from 0 to 1024.')
  check(validGoal(f.cd.goal), 'Set a countdown goal between 2000 and 2099.')
  const ids = [f.nlPreset, f.cdPreset, f.alexaOn, f.alexaOff, ...f.buttons.flatMap((b) => (isAnalog(b.type) ? [] : b.macros)), ...f.timers.map((t) => t.preset)]
  check(ids.every(presetIdValid), 'Preset IDs must be whole numbers from 0 to 250.')
  f.timers.forEach((t, i) => {
    const n = `Timer ${i + 1}`
    if (t.kind) check(intIn(t.min, -120, 120), `${n}: the offset must be −120 to 120 minutes.`)
    else check(intIn(t.hour, 0, 24) && intIn(t.min, 0, 59), `${n}: set an hour from 0 to 24 and a minute from 0 to 59.`)
    check(intIn(t.ds, 1, 31) && intIn(t.de, 1, 31), `${n}: days must be 1–31.`)
  })
  return e
}

// The goal as the value of a datetime-local input, and back.
const pad = (n: number) => String(n).padStart(2, '0')
const goalValue = (g: number[]) => (validGoal(g) ? `20${pad(g[0])}-${pad(g[1])}-${pad(g[2])}T${pad(g[3])}:${pad(g[4])}:${pad(g[5])}` : '')
function parseGoal(v: string): number[] {
  const m = /^20(\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?/.exec(v)
  return m ? [1, 2, 3, 4, 5, 6].map((j) => Number(m[j] ?? 0)) : [NaN, NaN, NaN, NaN, NaN, NaN]
}

// A coordinate as a positive number with a hemisphere, like the stock page; stored signed (S and W negative).
function Coordinate({ value, onChange, label, max, pos, neg }: { value: number; onChange: (v: number) => void; label: string; max: number; pos: string; neg: string }) {
  const negative = value < 0 || Object.is(value, -0)
  const abs = Math.abs(value)
  return (
    <div className="flex gap-2">
      <NumberInput label={label} min={0} max={max} step={0.01} value={abs} onChange={(v) => onChange(negative ? -v : v)} />
      <NativeSelect aria-label={`${label} hemisphere`} value={negative ? neg : pos} onChange={(e) => onChange(e.target.value === neg ? -abs : abs)}>
        <option value={pos}>{pos}</option>
        <option value={neg}>{neg}</option>
      </NativeSelect>
    </div>
  )
}

function TimerCard({ t, i, onChange, onRemove }: { t: Timer; i: number; onChange: (p: Partial<Timer>) => void; onRemove: () => void }) {
  const n = `Timer ${i + 1}`
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Switch on={t.en} label={`${n} enabled`} onChange={(en) => onChange({ en })} />
        <NativeSelect aria-label={`${n} type`} value={t.kind} onChange={(e) => {
          const kind = Number(e.target.value)
          // like the stock page's TT(): leaving sunrise/sunset puts the minute back in 0–59
          onChange(kind ? { kind } : { kind, min: t.min < 0 || t.min > 59 ? 0 : t.min })
        }}>
          <option value={0}>At a time</option>
          <option value={SUNRISE}>Sunrise</option>
          <option value={SUNSET}>Sunset</option>
        </NativeSelect>
        {t.kind ? (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <NumberInput className="w-20" label={`${n} offset in minutes`} min={-120} max={120} value={t.min} onChange={(min) => onChange({ min })} />min
          </span>
        ) : (
          <span className="flex items-center gap-1 font-mono">
            <NumberInput className="w-16" label={`${n} hour`} min={0} max={24} value={t.hour} onChange={(hour) => onChange({ hour })} />:
            <NumberInput className="w-16" label={`${n} minute`} min={0} max={59} value={t.min} onChange={(min) => onChange({ min })} />
          </span>
        )}
        <Button variant="ghost" size="icon" className="ml-auto" aria-label={`Remove ${n}`} onClick={onRemove}><Icon.trash /></Button>
      </div>
      {!t.kind && t.hour === 24 && <p className="m-0 text-xs text-muted-foreground">Hour 24 runs every hour at this minute.</p>}
      <PresetSelect label={`${n} preset`} none="No preset (removed when you save)" value={t.preset} onChange={(preset) => onChange({ preset })} />
      <div className="flex flex-wrap gap-1" role="group" aria-label={`${n} weekdays`}>
        {DAYS.map((d, j) => (
          <ChoiceChip key={d} on={!!(t.dow & (1 << j))} onChange={(on) => onChange({ dow: on ? t.dow | (1 << j) : t.dow & ~(1 << j) })}>{d}</ChoiceChip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        From
        <NativeSelect aria-label={`${n} start month`} value={t.ms} onChange={(e) => onChange({ ms: Number(e.target.value) })}>
          {MONTHS.map((m, j) => <option key={m} value={j + 1}>{m}</option>)}
        </NativeSelect>
        <NumberInput className="w-16" label={`${n} start day`} min={1} max={31} value={t.ds} onChange={(ds) => onChange({ ds })} />
        to
        <NativeSelect aria-label={`${n} end month`} value={t.me} onChange={(e) => onChange({ me: Number(e.target.value) })}>
          {MONTHS.map((m, j) => <option key={m} value={j + 1}>{m}</option>)}
        </NativeSelect>
        <NumberInput className="w-16" label={`${n} end day`} min={1} max={31} value={t.de} onChange={(de) => onChange({ de })} />
      </div>
    </div>
  )
}

export function TimeSettings() {
  const info = useStore((s) => s.info)
  const { draft: f, setDraft, dirty, discard, cfg, error, retry, reloadAfterSave } = useCfgForm(toForm)
  useLeaveGuard(dirty)
  const { save, saving, dialog } = useSaver('time', reloadAfterSave)

  // "Get location" opens locate.wled.me (like the stock page), which sends the coordinates back to this page
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://locate.wled.me' || !e.data || typeof e.data !== 'object') return
      const lat = Number(e.data.lat), lon = Number(e.data.lon)
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) setDraft((d) => (d ? { ...d, lat, lon } : d))
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [setDraft])

  if (error && !f) return <p className="text-sm text-muted-foreground">Couldn't load the settings. <Button variant="link" onClick={retry}>Try again</Button></p>
  if (!f || !cfg) return <p className="text-sm text-muted-foreground">Loading settings…</p>

  const errors = validate(f)
  const set = (p: Partial<Form>) => setDraft({ ...f, ...p })
  const setOl = (p: Partial<Form['ol']>) => set({ ol: { ...f.ol, ...p } })
  const setTimer = (i: number, p: Partial<Timer>) => set({ timers: f.timers.map((t, j) => (j === i ? { ...t, ...p } : t)) })
  const setButton = (i: number, slot: number, v: number) =>
    set({ buttons: f.buttons.map((b, j) => (j === i ? { ...b, macros: b.macros.map((m, k) => (k === slot ? v : m)) } : b)) })
  const maxTimers = info?.arch === 'esp8266' ? 16 : 64 // WLED_MAX_TIMERS
  const sw = (label: string, on: boolean, onChange: (v: boolean) => void, hint?: string) => (
    <Row label={label} hint={hint}><Switch on={on} label={label} onChange={onChange} /></Row>
  )
  const led = (label: string, v: number, onChange: (v: number) => void) => (
    <Row label={label}><NumberInput label={label} min={0} max={1024} value={v} onChange={onChange} /></Row>
  )

  return (
    <div className="flex flex-col gap-4">
      <Section title="Time">
        {sw('Get time from an NTP server', f.ntp, (ntp) => set({ ntp }))}
        {f.ntp && <Row label="NTP server" stack><Input maxLength={32} value={f.host} aria-label="NTP server" onChange={(e) => set({ host: e.target.value })} /></Row>}
        {sw('24-hour clock', f.h24, (h24) => set({ h24 }))}
        <Row label="Time zone" stack>
          <NativeSelect className="w-full" value={f.tz} onChange={(e) => set({ tz: Number(e.target.value) })}>
            {TIME_ZONES.map((z, i) => <option key={z} value={i}>{z}</option>)}
          </NativeSelect>
        </Row>
        <Row label="UTC offset" hint="Seconds, up to 18 hours">
          <NumberInput label="UTC offset" min={-65500} max={65500} value={f.offset} onChange={(offset) => set({ offset })} />
        </Row>
        <Row label="Local time"><span className="font-mono text-sm">{info?.time || 'Unknown'}</span></Row>
        <Row label="Latitude" hint="For sunrise and sunset timers">
          <Coordinate label="Latitude" max={66.6} pos="N" neg="S" value={f.lat} onChange={(lat) => set({ lat })} />
        </Row>
        <Row label="Longitude">
          <Coordinate label="Longitude" max={180} pos="E" neg="W" value={f.lon} onChange={(lon) => set({ lon })} />
        </Row>
        <Button variant="outline" className="self-start" onClick={() => open('https://locate.wled.me', '_blank')}>Get location<ExternalLink /></Button>
      </Section>

      <Section title="Scheduled presets">
        {f.timers.length === 0 && <p className="m-0 text-sm text-muted-foreground">No timers yet. Timers apply a preset at a time of day, or at sunrise or sunset.</p>}
        {f.timers.map((t, i) => (
          <TimerCard key={i} t={t} i={i} onChange={(p) => setTimer(i, p)} onRemove={() => set({ timers: f.timers.filter((_, j) => j !== i) })} />
        ))}
        {f.timers.length < maxTimers && (
          <Button variant="outline" className="self-start" onClick={() => set({ timers: [...f.timers, newTimer()] })}><Icon.plus />Add timer</Button>
        )}
      </Section>

      <Section title="Buttons">
        {f.buttons.length === 0 ? <p className="m-0 text-sm text-muted-foreground">No buttons are set up. Add them in LED and hardware.</p> : f.buttons.map((b, i) => {
          const kind = isAnalog(b.type) ? 'Analog' : isSwitch(b.type) ? 'Switch' : 'Button'
          const name = `${kind} ${i}`
          return (
            <div key={i} className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="text-xs font-medium text-muted-foreground">{name} · {BUTTON_TYPES[b.type] ?? 'Disabled'}</div>
              {isAnalog(b.type) ? (
                <Row label="Controls" stack>
                  <NativeSelect className="w-full" aria-label={`${name} function`} value={b.macros[2]} onChange={(e) => setButton(i, 2, Number(e.target.value))}>
                    {!ANALOG.some(([v]) => v === b.macros[2]) && <option value={b.macros[2]}>{b.macros[2]}</option>}
                    {ANALOG.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </NativeSelect>
                </Row>
              ) : (isSwitch(b.type)
                ? [['On → off', 0], ['Off → on', 1]] as const
                : [['Short press', 0], ['Long press', 1], ['Double press', 2]] as const
              ).map(([label, slot]) => (
                <Row key={slot} label={label} stack>
                  <PresetSelect label={`${name} ${label.toLowerCase()}`} none="Default action" value={b.macros[slot]} onChange={(v) => setButton(i, slot, v)} />
                </Row>
              ))}
            </div>
          )
        })}
      </Section>

      <Section title="Presets on events">
        <Row label="When the timer ends" hint="The nightlight timer in the top bar" stack>
          <PresetSelect label="Preset when the timer ends" none="Default action" value={f.nlPreset} onChange={(nlPreset) => set({ nlPreset })} />
        </Row>
        <Row label="When the countdown ends" stack>
          <PresetSelect label="Preset when the countdown ends" none="Default action" value={f.cdPreset} onChange={(cdPreset) => set({ cdPreset })} />
        </Row>
        {cfg.if?.va && (
          <>
            <Row label="Alexa on" stack><PresetSelect label="Alexa on preset" none="Default action" value={f.alexaOn} onChange={(alexaOn) => set({ alexaOn })} /></Row>
            <Row label="Alexa off" stack><PresetSelect label="Alexa off preset" none="Default action" value={f.alexaOff} onChange={(alexaOff) => set({ alexaOff })} /></Row>
          </>
        )}
        <p className="m-0 text-xs text-muted-foreground">Presets can also hold JSON or HTTP API commands, so they work as macros.</p>
      </Section>

      <Section title="Clock overlay" action={<Switch on={f.ol.on} label="Analog clock overlay" onChange={(on) => setOl({ on })} />}>
        {f.ol.on ? (
          <>
            {led('First LED', f.ol.min, (min) => setOl({ min }))}
            {led('Last LED', f.ol.max, (max) => setOl({ max }))}
            {led('12 o\'clock LED', f.ol.h12, (h12) => setOl({ h12 }))}
            {sw('Show 5-minute marks', f.ol.m5, (m5) => setOl({ m5 }))}
            {sw('Seconds as a trail', f.ol.sec, (sec) => setOl({ sec }))}
            {sw('Only when all LEDs are black', f.ol.solid, (solid) => setOl({ solid }))}
          </>
        ) : <p className="m-0 text-xs text-muted-foreground">Shows an analog clock on part of the strip.</p>}
      </Section>

      <Section title="Countdown" action={<Switch on={f.cd.on} label="Countdown mode" onChange={(on) => set({ cd: { ...f.cd, on } })} />}>
        {f.cd.on ? (
          <Row label="Goal" stack>
            <Input type="datetime-local" step={1} min="2000-01-01T00:00" max="2099-12-31T23:59:59" aria-label="Countdown goal"
              value={goalValue(f.cd.goal)} onChange={(e) => set({ cd: { ...f.cd, goal: parseGoal(e.target.value) } })} />
          </Row>
        ) : <p className="m-0 text-xs text-muted-foreground">Counts down to a date and time, then applies its preset.</p>}
      </Section>

      <SaveBar dirty={dirty} saving={saving} error={errors[0]} onSave={() => save(toFields(f))} onDiscard={discard} />
      <FieldError>{errors.length > 1 ? errors.slice(1).join(' ') : undefined}</FieldError>
      {dialog}
    </div>
  )
}
