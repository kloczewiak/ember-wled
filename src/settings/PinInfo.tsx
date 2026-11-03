import { useEffect, useState } from 'react'
import { Card, cx } from '../components/controls'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Cable, Cpu, Lightbulb, Puzzle, ToggleRight, type LucideIcon } from 'lucide-react'
import { useCfg } from './config'

// Settings → Pin info: which GPIOs are used and by what, like the firmware's page in WLED v16.0.1
// (data/settings_pininfo.htm), refreshed 4 times a second so button and relay states show live. Three
// styles: a table like the stock page, the pins grouped by use, and a map of every GPIO. Touch capability and
// pins reserved by usermods come only from the settings script, so they aren't shown.

// /json/pins (serializePins() in json.cpp)
interface Pin {
  p: number // GPIO
  c?: number // capabilities: 0x02 analog, 0x08 flash boot, 0x10 bootstrap, 0x20 input only
  a: boolean // allocated
  o?: number // owner (PinOwner in pin_manager.h): 0 system, below 0x80 a usermod's ID
  n?: string // owner name
  t?: number // button type
  m?: number // 0 input, 1 output
  s?: number // state, for buttons and outputs
  r?: number // raw touch or analog reading
}

type Kind = 'led' | 'io' | 'hw' | 'um' | 'sys' | 'free'
const KINDS: Record<Kind, { label: string; tile: string }> = {
  led: { label: 'LEDs', tile: 'bg-primary text-primary-foreground' },
  io: { label: 'Buttons, IR, relay', tile: 'bg-emerald-900 text-emerald-100' },
  hw: { label: 'Other hardware', tile: 'bg-sky-900 text-sky-100' },
  um: { label: 'Usermods', tile: 'bg-violet-900 text-violet-100' },
  sys: { label: 'System', tile: 'bg-muted text-muted-foreground' },
  free: { label: 'Free', tile: 'border text-foreground' },
}

function kind(p: Pin): Kind {
  if (!p.a) return 'free'
  if (!p.o) return 'sys'
  if (p.o < 0x80) return 'um'
  if ([0x82, 0x83, 0x84, 0x8e].includes(p.o)) return 'led' // digital, on/off, PWM, HUB75
  if ([0x85, 0x86, 0x87].includes(p.o)) return 'io' // button, IR, relay
  return 'hw' // Ethernet, SPI RAM, debug, DMX, I2C, SPI
}

const SHORT: Record<number, string> = { 0x81: 'Eth', 0x85: 'Btn', 0x86: 'IR', 0x87: 'Relay', 0x88: 'RAM', 0x89: 'Dbg', 0x8a: 'DMX', 0x8b: 'I2C', 0x8c: 'SPI', 0x8d: 'DMX' }
const short = (p: Pin) => ({ led: 'LED', um: 'UM', sys: '', free: '' } as Partial<Record<Kind, string>>)[kind(p)] ?? SHORT[p.o!] ?? ''

const BUTTON_TYPES = ['None', 'Reserved', 'Push', 'Push inverted', 'Switch', 'PIR', 'Touch', 'Analog', 'Analog inverted', 'Touch switch']

const capNotes = (c = 0) => [c & 0x02 && 'Analog', c & 0x20 && 'Input only', c & 0x08 && 'Flash boot', c & 0x10 && 'Bootstrap'].filter(Boolean) as string[]
const stateText = (p: Pin) => (p.s === undefined ? '' : p.o === 0x85 ? (p.s ? 'Pressed' : 'Released') : p.s ? 'On' : 'Off')

// runs of three or more pins as "6–11", the rest one by one
function ranges(nums: number[]) {
  const out: string[] = []
  for (let i = 0; i < nums.length;) {
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++
    if (j - i >= 2) out.push(`${nums[i]}–${nums[j]}`)
    else for (let k = i; k <= j; k++) out.push(String(nums[k]))
    i = j + 1
  }
  return out
}

type Style = 'table' | 'use' | 'map'
const STYLE_KEY = 'wledUiPinStyle'
const readStyle = (): Style => {
  try { const s = localStorage.getItem(STYLE_KEY); return s === 'use' || s === 'map' ? s : 'table' } catch { return 'table' }
}

export function PinInfo() {
  const [pins, setPins] = useState<Pin[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [style, setStyle] = useState<Style>(readStyle)
  // buttons are named by their place in the button list, like on LED and hardware
  const buttons = useCfg((s) => s.cfg?.hw?.btn?.ins)
  const name = (p: Pin) => {
    if (p.o === 0x85) { const i = buttons?.findIndex((b) => b.pin?.[0] === p.p) ?? -1; return i >= 0 ? `Button ${i + 1}` : 'Button' }
    return p.n || (p.o ? `Usermod ${p.o}` : 'System')
  }

  useEffect(() => {
    let stop = false
    let timer = 0
    const load = async () => {
      try {
        const j = await fetch('/json/pins', { signal: AbortSignal.timeout(3000) }).then((r) => r.json())
        if (!stop) { setPins(j.pins ?? []); setFailed(false) }
      } catch {
        if (!stop) setFailed(true)
      }
      if (!stop) timer = window.setTimeout(load, 250)
    }
    load()
    return () => { stop = true; clearTimeout(timer) }
  }, [])

  const pick = (s: Style) => {
    setStyle(s)
    try { localStorage.setItem(STYLE_KEY, s) } catch { /* storage unavailable: just this visit */ }
  }

  if (!pins) return <p className="text-sm text-muted-foreground">{failed ? 'Couldn\'t load the pin info.' : 'Loading pins…'}</p>
  if (!pins.length) return <p className="text-sm text-muted-foreground">No pins available.</p>

  return (
    <Card>
      <div className="flex items-center gap-3">
        <Tabs value={style} onValueChange={(s) => pick(s as Style)}>
          <TabsList aria-label="Pin info style">
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="use">By use</TabsTrigger>
            <TabsTrigger value="map">Map</TabsTrigger>
          </TabsList>
        </Tabs>
        {failed && <span className="ml-auto text-xs text-destructive">Not updating</span>}
      </div>
      {style === 'table' && <PinTable pins={pins} name={name} />}
      {style === 'use' && <ByUse pins={pins} name={name} />}
      {style === 'map' && <PinMap pins={pins} name={name} />}
    </Card>
  )
}

type Named = { pins: Pin[]; name: (p: Pin) => string }

const StateDot = ({ p }: { p: Pin }) =>
  p.s === undefined ? null : <span className={cx('inline-block size-2 shrink-0 rounded-full', p.s ? 'bg-green-500' : 'bg-muted-foreground/50')} aria-hidden />

// Every pin on its own row, as on the stock page.
function PinTable({ pins, name }: Named) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted text-left text-xs text-muted-foreground">
            <th className="w-14 px-3 py-2 font-medium">GPIO</th>
            <th className="border-l px-3 py-2 font-medium">Used by</th>
            <th className="border-l px-3 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {pins.map((p) => (
            <tr key={p.p} className="border-t even:bg-muted/40">
              <td className="px-3 py-2 font-mono">{p.p}</td>
              <td className="border-l px-3 py-2">
                {p.a ? (
                  <span className="flex flex-wrap items-center gap-x-2">
                    <StateDot p={p} />
                    {name(p)}
                    {p.t !== undefined && <span className="text-xs text-muted-foreground">{BUTTON_TYPES[p.t] ?? '?'}</span>}
                    {p.r !== undefined && <span className="font-mono text-xs text-muted-foreground">{p.r}</span>}
                  </span>
                ) : <span className="text-primary">Available</span>}
              </td>
              <td className="border-l px-3 py-2 text-xs text-muted-foreground">{capNotes(p.c).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// A grid cell; every one is the same size. Free pins show their capabilities: "A" analog, a dashed outline
// for input only, a dot for boot pins.
function Tile({ p, label, selected, onClick }: { p: Pin; label?: string; selected?: boolean; onClick?: () => void }) {
  const k = kind(p)
  const c = p.c ?? 0
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? selected : undefined}
      aria-label={onClick ? `GPIO ${p.p}` : undefined}
      className={cx('relative flex h-11 flex-col items-center justify-center rounded-lg font-mono text-xs leading-tight', KINDS[k].tile,
        k === 'free' && c & 0x20 && 'border-dashed text-muted-foreground', selected && 'outline-2 outline-offset-1 outline-foreground')}>
      {p.p}
      {label !== undefined && <span className="h-3 font-sans text-[9px] opacity-85">{label}</span>}
      {k === 'free' && c & 0x02 ? <span className="absolute top-0.5 right-1 font-sans text-[9px] text-primary">A</span> : null}
      {k === 'free' && c & 0x18 ? <span className="absolute top-1 left-1 size-1.5 rounded-full bg-amber-500" /> : null}
      {p.s !== undefined && <span className={cx('absolute top-1 right-1 size-1.5 rounded-full', p.s ? 'bg-green-400' : 'bg-black/30')} />}
    </Tag>
  )
}

const tileGrid = 'grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5'

function FreeLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span><span className="text-primary">A</span> analog</span>
      <span>Dashed: input only</span>
      <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-500" />Boot pin</span>
    </div>
  )
}

const ICONS: Record<Exclude<Kind, 'free'>, LucideIcon> = { led: Lightbulb, io: ToggleRight, hw: Cable, um: Puzzle, sys: Cpu }

// What uses which pins, then the free ones.
function ByUse({ pins, name }: Named) {
  // one row per LED type, button, IR receiver and relay; other hardware by name; usermods and system together
  const groups = new Map<string, { k: Kind; title: string; pins: Pin[] }>()
  for (const p of pins) {
    const k = kind(p)
    if (k === 'free') continue
    const title = k === 'led' ? 'LED outputs' : k === 'um' ? 'Usermods' : k === 'sys' ? 'System' : name(p)
    const g = groups.get(title) ?? { k, title, pins: [] }
    g.pins.push(p)
    groups.set(title, g)
  }
  const order: Kind[] = ['led', 'io', 'hw', 'um', 'sys']
  const used = [...groups.values()].sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k) || a.title.localeCompare(b.title, undefined, { numeric: true }))
  const free = pins.filter((p) => !p.a)

  return (
    <>
      <div className="flex flex-col">
        {used.map((g) => {
          const Icon = ICONS[g.k as Exclude<Kind, 'free'>]
          const p = g.pins[0]
          const hint = g.k === 'led' ? [...new Set(g.pins.map((q) => q.n?.replace(/^LED /, '')))].join(', ')
            : g.k === 'sys' ? 'Flash and internal'
            : [stateText(p), p.t !== undefined && BUTTON_TYPES[p.t], p.r !== undefined && `Reading ${p.r}`].filter(Boolean).join(' · ')
          return (
            <div key={g.title} className={cx('flex items-center gap-3 border-t py-2 first:border-t-0', g.k === 'sys' && 'text-muted-foreground')}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm">{g.title}</div>
                {hint && <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{g.pins.length === 1 && <StateDot p={p} />}{hint}</div>}
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {ranges(g.pins.map((q) => q.p)).map((r) => <span key={r} className="rounded-md border px-1.5 font-mono text-xs">{r}</span>)}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
        <span className="font-semibold tracking-wider uppercase">Free</span>
        <span>{free.length} {free.length === 1 ? 'pin' : 'pins'}</span>
      </div>
      {free.length ? <div className={tileGrid}>{free.map((p) => <Tile key={p.p} p={p} />)}</div> : <p className="m-0 text-sm text-muted-foreground">No free pins.</p>}
      <FreeLegend />
    </>
  )
}

// Every GPIO as a tile; selecting one shows what it is below.
function PinMap({ pins, name }: Named) {
  const [sel, setSel] = useState<number | null>(null)
  const kinds = new Set(pins.map(kind))
  const p = pins.find((q) => q.p === sel)
  return (
    <>
      <p className="m-0 text-xs text-muted-foreground">Select a pin to see what uses it and if it's free.</p>
      <div className={tileGrid}>
        {pins.map((q) => <Tile key={q.p} p={q} label={short(q)} selected={q.p === sel} onClick={() => setSel(q.p === sel ? null : q.p)} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(KINDS) as Kind[]).filter((k) => kinds.has(k)).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cx('size-2.5 rounded-sm', k === 'free' ? 'border border-muted-foreground' : k === 'sys' ? 'bg-muted ring-1 ring-muted-foreground/40' : KINDS[k].tile)} />{KINDS[k].label}
          </span>
        ))}
      </div>
      <div className="min-h-16 border-t pt-3" aria-live="polite">
        {p ? <PinDetails p={p} name={name(p)} /> : <p className="m-0 text-sm text-muted-foreground">No pin selected.</p>}
      </div>
    </>
  )
}

function PinDetails({ p, name }: { p: Pin; name: string }) {
  const k = kind(p)
  const c = p.c ?? 0
  const lines = [
    k === 'free' ? (c & 0x20 ? 'Free, input only: for buttons and sensors, not LEDs or a relay.' : 'Free to use.')
      : k === 'sys' ? 'Used by the chip itself (flash memory or other internals), so it can\'t be used.'
      : `Used by ${name}${p.t !== undefined ? ` (${BUTTON_TYPES[p.t] ?? '?'})` : ''}. It can't be used for anything else until it's freed in the settings.`,
    c & 0x02 && 'Can read analog values.',
    c & 0x08 && 'Flash boot pin: held low at power-on, the chip starts in download mode instead of WLED.',
    c & 0x10 && 'Bootstrap pin: what it\'s connected to at power-on can change how the chip starts.',
  ].filter(Boolean) as string[]
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        GPIO {p.p}
        {stateText(p) && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><StateDot p={p} />{stateText(p)}</span>}
        {p.r !== undefined && <span className="font-mono text-xs text-muted-foreground">Reading {p.r}</span>}
      </div>
      {lines.map((l) => <p key={l} className="m-0 text-xs text-muted-foreground">{l}</p>)}
    </div>
  )
}
