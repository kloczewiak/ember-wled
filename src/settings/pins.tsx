import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCfg } from './config'

// GPIOs as /json/pins describes them, drawn as tiles (Pin info's map) and picked from a popover of tiles
// wherever a settings page asks for a pin.

// /json/pins (serializePins() in json.cpp)
export interface Pin {
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

// pin owners (PinOwner in pin_manager.h)
export const OWNER = { led: 0x82, button: 0x85, ir: 0x86, relay: 0x87, dmxIn: 0x8d } as const

export type Kind = 'led' | 'io' | 'hw' | 'um' | 'sys' | 'free'
export const KINDS: Record<Kind, { label: string; tile: string }> = {
  led: { label: 'LEDs', tile: 'bg-primary text-primary-foreground' },
  io: { label: 'Buttons, IR, relay', tile: 'bg-emerald-900 text-emerald-100' },
  hw: { label: 'Other hardware', tile: 'bg-sky-900 text-sky-100' },
  um: { label: 'Usermods', tile: 'bg-violet-900 text-violet-100' },
  sys: { label: 'System', tile: 'bg-muted text-muted-foreground' },
  free: { label: 'Free', tile: 'border text-foreground' },
}

export function kind(p: Pin): Kind {
  if (!p.a) return 'free'
  if (!p.o) return 'sys'
  if (p.o < 0x80) return 'um'
  if ([0x82, 0x83, 0x84, 0x8e].includes(p.o)) return 'led' // digital, on/off, PWM, HUB75
  if ([0x85, 0x86, 0x87].includes(p.o)) return 'io' // button, IR, relay
  return 'hw' // Ethernet, SPI RAM, debug, DMX, I2C, SPI
}

const SHORT: Record<number, string> = { 0x81: 'Eth', 0x85: 'Btn', 0x86: 'IR', 0x87: 'Relay', 0x88: 'RAM', 0x89: 'Dbg', 0x8a: 'DMX', 0x8b: 'I2C', 0x8c: 'SPI', 0x8d: 'DMX' }
export const short = (p: Pin) => ({ led: 'LED', um: 'UM', sys: '', free: '' } as Partial<Record<Kind, string>>)[kind(p)] ?? SHORT[p.o!] ?? ''

export const BUTTON_TYPES = ['None', 'Reserved', 'Push', 'Push inverted', 'Switch', 'PIR', 'Touch', 'Analog', 'Analog inverted', 'Touch switch']

// What uses a pin, by name. Buttons are named by their place in the button list, like on LED and hardware.
export function usePinName() {
  const buttons = useCfg((s) => s.cfg?.hw?.btn?.ins)
  return (p: Pin) => {
    if (p.o === OWNER.button) { const i = buttons?.findIndex((b) => b.pin?.[0] === p.p) ?? -1; return i >= 0 ? `Button ${i + 1}` : 'Button' }
    return p.n || (p.o ? `Usermod ${p.o}` : 'System')
  }
}

// A pin's details as sentences, as Pin info shows them: what uses it, then what its capabilities mean.
export function pinNotes(p: Pin, name: string, { analog = true } = {}) {
  const k = kind(p)
  const c = p.c ?? 0
  return [
    k === 'free' ? (c & 0x20 ? 'Free, input only: for buttons and sensors, not LEDs or a relay.' : 'Free to use.')
      : k === 'sys' ? 'Used by the chip itself (flash memory or other internals), so it can\'t be used.'
      : `Used by ${name}${p.t !== undefined ? ` (${BUTTON_TYPES[p.t] ?? '?'})` : ''}.`,
    k !== 'free' && k !== 'sys' && 'It can\'t be used for anything else until it\'s freed in the settings.',
    analog && c & 0x02 && 'Can read analog values.',
    c & 0x08 && 'Flash boot pin: held low at power-on, the chip starts in download mode instead of WLED.',
    c & 0x10 && 'Bootstrap pin: what it\'s connected to at power-on can change how the chip starts.',
  ].filter(Boolean) as string[]
}

export const capNotes = (c = 0) => [c & 0x02 && 'Analog', c & 0x20 && 'Input only', c & 0x08 && 'Flash boot', c & 0x10 && 'Bootstrap'].filter(Boolean) as string[]

// A grid cell; every one is the same size. Free pins show their capabilities: "A" analog, a dashed outline
// for input only, a dot for boot pins. `off` dims a pin that can't be picked; `tip` says why, shown on hover
// after a moment so passing over the grid doesn't flash it. (It stays focusable rather than disabled, so the
// hover works.)
export function Tile({ p, label, selected, off, tip, onClick }: {
  p: Pin; label?: string; selected?: boolean; off?: boolean; tip?: string[]; onClick?: () => void
}) {
  const k = kind(p)
  const c = p.c ?? 0
  const cls = cx('relative flex h-11 flex-col items-center justify-center rounded-lg font-mono text-xs leading-tight', KINDS[k].tile,
    k === 'free' && c & 0x20 && 'border-dashed', selected && 'outline-2 outline-offset-1 outline-foreground',
    onClick && !off && k === 'free' && 'hover:bg-muted', off && 'cursor-not-allowed opacity-40')
  const inner = (
    <>
      {p.p}
      {label !== undefined && <span className="h-3 font-sans text-[9px] opacity-85">{label}</span>}
      {k === 'free' && c & 0x02 ? <span className="absolute top-0.5 right-1 font-sans text-[9px] text-primary">A</span> : null}
      {k === 'free' && c & 0x18 ? <span className="absolute top-1 left-1 size-1.5 rounded-full bg-amber-500" /> : null}
      {p.s !== undefined && <span className={cx('absolute top-1 right-1 size-1.5 rounded-full', p.s ? 'bg-green-400' : 'bg-black/30')} />}
    </>
  )
  if (!onClick) return <div className={cls}>{inner}</div>
  const props = {
    type: 'button' as const, className: cls, 'aria-pressed': selected, 'aria-disabled': off || undefined,
    'aria-label': `GPIO ${p.p}${label ? `, ${label}` : ''}`, onClick: off ? undefined : onClick,
  }
  if (!tip?.length) return <button {...props}>{inner}</button>
  return (
    <Tooltip>
      <TooltipTrigger delay={500} render={<button {...props} />}>{inner}</TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        {tip.map((t) => <span key={t}>{t}</span>)}
      </TooltipContent>
    </Tooltip>
  )
}

export const tileGrid = 'grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5'

// Legend entries are small copies of the cells, so a colour reads as a cell and a dot as a marker on one.
export function LegendItem({ tile, mark, children }: { tile: string; mark?: 'analog' | 'boot' | 'state'; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx('relative size-4 shrink-0 rounded-[5px]', tile)}>
        {mark === 'analog' && <span className="absolute top-px right-0.5 font-sans text-[8px] leading-none text-primary">A</span>}
        {mark === 'boot' && <span className="absolute top-0.5 left-0.5 size-1 rounded-full bg-amber-500" />}
        {mark === 'state' && <span className="absolute top-0.5 right-0.5 size-1 rounded-full bg-green-400" />}
      </span>
      {children}
    </span>
  )
}

export const legendRow = 'flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground'

// the marks on free pins
export function FreeMarks() {
  return (
    <>
      <LegendItem tile={KINDS.free.tile} mark="analog">Analog</LegendItem>
      <LegendItem tile={cx(KINDS.free.tile, 'border-dashed')}>Input only</LegendItem>
      <LegendItem tile={KINDS.free.tile} mark="boot">Boot pin</LegendItem>
    </>
  )
}

// /json/pins once, for the pickers on a page (null while loading, [] when it couldn't be loaded)
export function usePins() {
  const [pins, setPins] = useState<Pin[] | null>(null)
  useEffect(() => { fetch('/json/pins').then((r) => r.json()).then((j) => setPins(j.pins ?? [])).catch(() => setPins([])) }, [])
  return pins
}

// What a pin field can take: any pin, one that can drive an output (not input only), a touch pin or an
// analog (ADC) pin.
export type PinNeed = 'any' | 'output' | 'touch' | 'analog'
const NEEDS: Record<PinNeed, string> = { any: '', output: 'Input-only pins can\'t drive outputs.', touch: 'Only touch pins work for touch buttons.', analog: 'Only analog pins work for analog buttons.' }
// why a free pin doesn't fit
const MISFIT: Record<PinNeed, string> = { any: '', output: 'Input only: for buttons and sensors, not LEDs or a relay.', touch: 'Not a touch pin, so it can\'t be used for a touch button.', analog: 'Not an analog pin, so it can\'t be used for an analog button.' }

// A pin another field on the same page uses right now, before it's saved: its owner (OWNER), a short label for
// the tile and the field's name.
export type PinUse = { o: number; label: string; name: string }

// A pin field: a button with the chosen GPIO that opens a map of every pin. The map shows the light's pins as
// /json/pins has them, except for what the open page changes before saving: `own` are pins the page's saved
// settings hold (free once nothing on the page uses them) and `used` are pins its other fields use now. Pins
// that are taken or don't fit `need` can't be picked. `none` names the "no pin" choice (-1); without it a pin
// has to be picked.
export function PinPicker({ value, onChange, label, pins, own = [], used = new Map(), need = 'any', touch = [], none, invalid }: {
  value: number; onChange: (p: number) => void; label: string; pins: Pin[]
  own?: number[]; used?: Map<number, PinUse>; need?: PinNeed; touch?: number[]; none?: string; invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const grid = useRef<HTMLDivElement>(null)

  const name = usePinName()
  // the boot pin notes, which also apply to a pin that's taken or doesn't fit
  const bootNotes = (p: Pin) => pinNotes({ p: p.p, c: p.c, a: false }, '', { analog: false }).slice(1)
  const shown = pins.map((p): { p: Pin; label: string; off: boolean; tip?: string[] } => {
    const use = used.get(p.p)
    if (use && p.p !== value) {
      return { p: { p: p.p, c: p.c, a: true, o: use.o }, label: use.label, off: true,
        tip: [`Used by ${use.name} on this page.`, 'Choose another pin there to free it.'] }
    }
    const taken = p.a && !own.includes(p.p)
    const q = taken ? p : { p: p.p, c: p.c, a: false }
    const fits = need === 'any' || (need === 'output' ? !((p.c ?? 0) & 0x20) : need === 'touch' ? touch.includes(p.p) : !!((p.c ?? 0) & 0x02))
    const off = (taken || !fits) && p.p !== value
    return { p: q, label: taken ? short(p) : '', off,
      tip: !off ? undefined : taken ? pinNotes(p, name(p), { analog: false }) : [MISFIT[need], ...bootNotes(p)] }
  })
  const pick = (p: number) => { onChange(p); setOpen(false) }

  // arrow keys move between pickable tiles: left and right in order, up and down to the nearest tile in the
  // row above or below
  const move = (e: KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
    if (!keys.includes(e.key) || !grid.current) return
    const tiles = [...grid.current.querySelectorAll<HTMLButtonElement>('button:not([aria-disabled])')]
    const at = tiles.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    e.preventDefault()
    let next = at
    if (e.key === 'ArrowLeft') next = Math.max(0, at - 1)
    else if (e.key === 'ArrowRight') next = Math.min(tiles.length - 1, at + 1)
    else {
      const r = tiles[at].getBoundingClientRect()
      const down = e.key === 'ArrowDown'
      const rows = tiles.map((t) => t.getBoundingClientRect()).map((b, i) => ({ i, b }))
        .filter(({ b }) => (down ? b.top > r.bottom - 1 : b.bottom < r.top + 1))
      if (rows.length) {
        const rowTop = down ? Math.min(...rows.map(({ b }) => b.top)) : Math.max(...rows.map(({ b }) => b.top))
        next = rows.filter(({ b }) => b.top === rowTop)
          .reduce((best, t) => (Math.abs(t.b.left - r.left) < Math.abs(best.b.left - r.left) ? t : best)).i
      }
    }
    tiles[next].focus()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <Button variant="outline" aria-label={label} aria-invalid={invalid || undefined}
          className="w-28 justify-between font-mono font-normal" />
      }>
        {value >= 0 ? <span>GPIO {value}</span> : <span className="font-sans text-muted-foreground">{none ?? 'Choose'}</span>}
        <ChevronDown data-icon="inline-end" className="text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] gap-3"
        // focus starts on the chosen pin (or the first one that can be picked)
        initialFocus={() => grid.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? grid.current?.querySelector<HTMLElement>('button:not([aria-disabled])') ?? true}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{label}</span>
          {none && <Button size="sm" variant={value < 0 ? 'secondary' : 'ghost'} onClick={() => pick(-1)}>{none}</Button>}
        </div>
        <div ref={grid} className={tileGrid} role="group" aria-label={`${label}: pins`} onKeyDown={move}>
          {shown.map((s) => <Tile key={s.p.p} p={s.p} label={s.label} selected={s.p.p === value} off={s.off} tip={s.tip} onClick={() => pick(s.p.p)} />)}
        </div>
        <div className={legendRow}><FreeMarks /></div>
        {NEEDS[need] && <p className="m-0 text-xs text-muted-foreground">{NEEDS[need]}</p>}
      </PopoverContent>
    </Popover>
  )
}
