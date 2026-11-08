import { useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Search, Trash2 } from 'lucide-react'
import { cx, Switch } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { intIn, NumberInput, Row } from './shared'
import type { PinNeed } from './pins'
import {
  blockedTypes,
  busOk,
  hasCCT,
  hasRGB,
  hasW,
  I2S_NOTE,
  is16b,
  isAna,
  isD2P,
  isDig,
  isHub75,
  isNet,
  isPWM,
  isVir,
  mustRefresh,
  numPins,
  pinFields,
  pinLabels,
  SPEEDS,
  speedFreqs,
  speedIndex,
  startOf,
  summary,
  withType,
  type LedForm,
  type LedInfo,
  type LedType,
  type Output,
  type Types,
} from './leds'

// The LED outputs of Settings → LED and hardware: the map of where each output's LEDs sit, and each output's
// card with the fields its LED type uses.

// A pin field on the page, which knows the pins the page's other fields use (LedSettings' picker()).
export type Picker = (
  key: string,
  p: {
    label: string
    value: number
    onChange: (p: number) => void
    need: PinNeed
    none?: string
    invalid?: boolean
    wide?: boolean
  },
) => ReactNode

export const ORDERS = ['GRB', 'RGB', 'BRG', 'RBG', 'BGR', 'GBR']
export const AUTO_WHITE = ['None', 'Brighter', 'Accurate', 'Dual', 'Max']
// what each auto white mode does (RGBW_MODE_* in const.h)
export const AUTO_WHITE_HINTS = [
  'White LEDs only light from the white slider.',
  "Adds white as bright as each colour's darkest channel: brighter, less saturated.",
  'Moves what red, green and blue have in common to the white LEDs: the truest colours.',
  'Like Brighter, until you use the white slider; then the slider sets white.',
  'White follows the brightest channel. For white-only LEDs.',
]
const SWAPS = ['Last, as usual', 'Swapped with blue', 'Swapped with green', 'Swapped with red', 'Warm and cold swapped']
// the LED type picker's groups, by the type's pin letters
const GROUPS: [string, string, (x: LedType) => boolean][] = [
  ['Digital', '1 data pin, the usual addressable strips', (x) => x.t === 'D'],
  ['Digital with clock', 'data and clock pins', isD2P],
  ['PWM', 'a pin for each colour', isPWM],
  ['On/off', 'switches a pin', (x) => x.t === ''],
  ['Network', 'sends to another device', isNet],
  ['Virtual', '', (x) => x.t === 'V'],
  ['HUB75', 'LED matrix panels', isHub75],
]

// Each output's colour, for its block on the map and its number badge.
const COLORS = ['#ff9f43', '#5eb8ff', '#c4a7ff', '#5fd4a6', '#f9a8d4', '#fcd34d']
export const outColor = (i: number) => COLORS[i % COLORS.length]
export function OutBadge({ i, small }: { i: number; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'flex shrink-0 items-center justify-center font-bold text-black/80',
        small ? 'size-5 rounded-md text-xs' : 'size-7 rounded-lg text-[13px]',
      )}
      style={{ background: outColor(i) }}
    >
      {i + 1}
    </span>
  )
}

const CH: Record<string, string> = { R: '#ff6b6b', G: '#4ade80', B: '#60a5fa', W: '#f4f4f5' }
// the colour order as coloured squares, e.g. green, red, blue for GRB
export function OrderDots({ order, white }: { order: string; white?: boolean }) {
  return (
    <span aria-hidden className="flex shrink-0 gap-[3px]">
      {(order + (white ? 'W' : '')).split('').map((c, i) => (
        <span key={i} className="size-2.5 rounded-[3px]" style={{ background: CH[c] }} />
      ))}
    </span>
  )
}
// the colour of a PWM pin, from its label
const PIN_DOTS: [string, string][] = [
  ['Warm', '#ffc178'],
  ['Cold', '#cfe6ff'],
  ['Red', CH.R],
  ['Green', CH.G],
  ['Blue', CH.B],
  ['White', CH.W],
]

const range = (start: number, len: number) => (len > 1 ? `${start}–${start + len - 1}` : String(start))
// outputs that take one LED position whatever their length (PWM, on/off, HUB75 has its own size)
const onePosition = (x: LedType) => isAna(x) || isHub75(x)

// What a type has, as short tags: its colours, 16 bit, and what it needs.
function typeTags(x: LedType): { t: string; warn?: boolean }[] {
  const colours = hasRGB(x)
    ? hasCCT(x)
      ? 'RGB + CCT'
      : hasW(x)
        ? 'RGBW'
        : 'RGB'
    : hasCCT(x)
      ? 'Warm and cold white'
      : 'White'
  const pins =
    x.t === 'D'
      ? '1 data pin'
      : isD2P(x)
        ? 'Data + clock'
        : isPWM(x)
          ? `PWM · ${numPins(x)} ${numPins(x) === 1 ? 'pin' : 'pins'}`
          : x.t === ''
            ? '1 pin'
            : isNet(x)
              ? 'Network'
              : isHub75(x)
                ? 'HUB75 panel'
                : 'Virtual'
  return [
    { t: colours },
    ...(is16b(x) ? [{ t: '16-bit' }] : []),
    { t: pins },
    ...(mustRefresh(x) ? [{ t: 'needs off refresh', warn: true }] : []),
  ]
}
function Tag({ t, warn }: { t: string; warn?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-medium',
        warn ? 'bg-amber-500/15 text-amber-200' : 'bg-foreground/8 text-soft',
      )}
    >
      {t}
    </span>
  )
}

// A field with its label above the control, and a hint or a problem below it.
export function Field({
  label,
  hint,
  error,
  children,
  wide,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', wide && 'col-span-full')}>
      <span className="flex items-center gap-1.5 text-[13px] font-medium text-soft">{label}</span>
      {children}
      {(error || hint) && (
        <span className={cx('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{error || hint}</span>
      )}
    </div>
  )
}
export const fieldGrid = 'grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-4 gap-y-3.5'

// The bar of LED positions: a block for each output, as wide as its LEDs, with the LED it starts at below.
// Colour order overrides show as marks under the outputs they fall in. A block opens its output.
export function LedMap({ f, T, open, onOpen }: { f: LedForm; T: Types; open: number; onOpen: (i: number) => void }) {
  return (
    <div className="no-scrollbar -m-0.5 flex items-start gap-1 overflow-x-auto p-0.5">
      {f.outs.map((o, i) => {
        const x = T(o.type)
        const one = onePosition(x)
        const start = startOf(f, i)
        const len = one ? 1 : Math.max(0, o.len || 0)
        const c = outColor(i)
        const marks = f.com.flatMap((m) => {
          const a = Math.max(m.start, start),
            b = Math.min(m.start + m.len, start + len)
          return b > a && !one ? [{ left: ((a - start) / len) * 100, width: ((b - a) / len) * 100 }] : []
        })
        return (
          <button
            key={i}
            type="button"
            aria-pressed={open === i}
            aria-label={`Output ${i + 1}: ${len > 1 ? `LEDs ${range(start, len)}` : `LED ${start}`}`}
            onClick={() => onOpen(i)}
            className={cx('flex flex-col gap-1.5 text-left', one ? 'w-11 shrink-0' : 'min-w-16')}
            style={one ? undefined : { flex: `${Math.max(len, 1)} 1 0px` }}
          >
            <span
              className={cx(
                'flex h-10 items-center gap-2 overflow-hidden rounded-xl whitespace-nowrap',
                one ? 'justify-center' : 'px-2.5',
              )}
              style={{
                background: `color-mix(in oklab, ${c} ${open === i ? 32 : 18}%, var(--card))`,
                boxShadow:
                  open === i ? `inset 0 0 0 2px ${c}` : `inset 0 0 0 1px color-mix(in oklab, ${c} 45%, transparent)`,
              }}
            >
              <OutBadge i={i} small />
              {!one && (
                <span className="truncate text-[13px] font-medium">
                  {len} {len === 1 ? 'LED' : 'LEDs'}
                </span>
              )}
            </span>
            {f.com.length > 0 && (
              <span className="relative h-1.5">
                {marks.map((m, j) => (
                  <span
                    key={j}
                    className="absolute inset-y-0 rounded-full bg-foreground"
                    style={{ left: `${m.left}%`, width: `max(${m.width}%, 4px)` }}
                  />
                ))}
              </span>
            )}
            <span className="pl-0.5 font-mono text-[11.5px] text-muted-foreground">{start}</span>
          </button>
        )
      })}
    </div>
  )
}

// One output: a line with its type, pins and LEDs, opening to the fields its LED type uses. `errors` are the
// page's problems with this output.
export function OutputCard({
  index,
  o,
  f,
  T,
  info,
  onChange,
  onRemove,
  picker,
  errors,
  dupPins,
}: {
  index: number
  o: Output
  f: LedForm
  T: Types
  info: LedInfo
  onChange: (o: Output) => void
  onRemove: () => void
  picker: Picker
  errors: string[]
  dupPins: Set<number>
}) {
  const x = T(o.type)
  const set = (p: Partial<Output>) => onChange({ ...o, ...p })
  const n = `Output ${index + 1}`
  const labels = pinLabels(x)
  const fields = pinFields(x)
  const gpio = !isVir(x) && !isHub75(x)
  const setPin = (j: number, p: number) => set({ pins: o.pins.map((q, k) => (k === j ? p : q)) })
  const start = startOf(f, index)
  const one = onePosition(x)
  const pins = o.pins.slice(0, fields).filter((p) => p >= 0)
  const where = isNet(x)
    ? o.pins.slice(0, 4).join('.')
    : gpio
      ? pins.length
        ? `GPIO ${pins.join(', ')}`
        : 'No pin'
      : ''
  const meta = [where, !one && `${o.len} LEDs`, one ? `LED ${start}` : `LEDs ${range(start, o.len || 0)}`]
    .filter(Boolean)
    .join(' · ')
  const maxLen = isDig(x) ? info.maxPB : 16384
  const speeds = speedFreqs(x, info.chip)
  const driver = x.t === 'D' && info.chip !== 0 && info.chip !== 1
  const use = summary(f, T, info).use
  const sw = (label: string, hint: string, on: boolean, onSw: (v: boolean) => void, locked?: boolean) => (
    <Row label={label} hint={hint}>
      <Switch label={`${n}: ${label}`} on={on} onChange={locked ? () => {} : onSw} />
    </Row>
  )

  return (
    <AccordionItem
      value={index}
      className="rounded-2xl ring-1 ring-foreground/8 not-last:border-b-0 data-open:bg-muted/40 data-open:ring-foreground/12"
    >
      <AccordionTrigger className="items-center gap-3 rounded-2xl px-3.5 py-3 hover:bg-foreground/4 hover:no-underline">
        <OutBadge i={index} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{x.n}</span>
          <span className="truncate text-[12.5px] text-muted-foreground">{meta}</span>
        </span>
        {errors.length > 0 && (
          <Badge variant="destructive" className="shrink-0">
            {errors.length} to fix
          </Badge>
        )}
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-4 pt-1 pb-2.5">
        <TypePicker index={index} o={o} f={f} T={T} info={info} onPick={(t) => onChange(withType(o, t, T, info))} />

        <div className={fieldGrid}>
          {f.customStarts && (
            <Field label="First LED" hint="0–8191" error={intIn(o.start, 0, 8191) ? undefined : '0–8191'}>
              <NumberInput
                className="w-full"
                label={`${n}: first LED`}
                min={0}
                max={8191}
                value={o.start}
                invalid={!intIn(o.start, 0, 8191)}
                onChange={(v) => set({ start: v })}
              />
            </Field>
          )}
          {gpio &&
            labels.slice(0, fields).map((l, j) => {
              const dot = isPWM(x) ? PIN_DOTS.find(([w]) => l.startsWith(w))?.[1] : undefined
              const p = o.pins[j]
              return (
                <Field
                  key={j}
                  label={
                    <>
                      {dot && <span aria-hidden className="size-2 rounded-full" style={{ background: dot }} />}
                      {l}
                    </>
                  }
                  error={
                    p < 0
                      ? "Choose the pin it's wired to."
                      : dupPins.has(p)
                        ? `GPIO ${p} is used by two outputs.`
                        : undefined
                  }
                >
                  {picker(`o${index}p${j}`, {
                    label: `${n}: ${l}`,
                    value: p,
                    onChange: (q) => setPin(j, q),
                    need: 'output',
                    invalid: p < 0 || dupPins.has(p),
                    wide: true,
                  })}
                </Field>
              )
            })}
          {isNet(x) && (
            <Field
              label="IP address"
              wide
              error={o.pins.slice(0, 4).every((p) => intIn(p, 0, 255)) ? undefined : 'Each part is 0–255.'}
            >
              <div className="flex items-center gap-1 font-mono" role="group" aria-label={`${n}: IP address`}>
                {[0, 1, 2, 3].map((j) => (
                  <span key={j} className="flex items-center gap-1">
                    {j > 0 && <span className="text-muted-foreground">.</span>}
                    <NumberInput
                      label={`${n}: IP address, part ${j + 1}`}
                      className="w-16"
                      min={0}
                      max={255}
                      value={o.pins[j] < 0 ? NaN : o.pins[j]}
                      onChange={(v) => setPin(j, Number.isNaN(v) ? -1 : v)}
                    />
                  </span>
                ))}
              </div>
            </Field>
          )}
          {isNet(x) && info.chip !== 0 && (
            <Field label="Host name" hint="Used instead of the IP address when set (.local).">
              <Input
                maxLength={32}
                value={o.text}
                aria-label={`${n}: host name`}
                onChange={(e) => set({ text: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })}
              />
            </Field>
          )}
          {(isHub75(x) || x.t === 'V') &&
            labels.slice(0, fields).map((l, j) => (
              <Field key={j} label={l}>
                <NumberInput
                  className="w-full"
                  label={`${n}: ${l}`}
                  value={o.pins[j] < 0 ? NaN : o.pins[j]}
                  onChange={(v) => setPin(j, Number.isNaN(v) ? -1 : v)}
                />
              </Field>
            ))}
          {!one && (
            <Field
              label="Length"
              error={intIn(o.len, 1, maxLen) ? undefined : `1–${maxLen} LEDs per output`}
              hint={`LEDs ${range(start, o.len)}`}
            >
              <NumberInput
                className="w-full"
                label={`${n}: length`}
                unit="LEDs"
                min={1}
                max={maxLen}
                value={o.len}
                invalid={!intIn(o.len, 1, maxLen)}
                onChange={(len) => set({ len })}
              />
            </Field>
          )}
          {!isVir(x) && !one && (
            <Field label="Colour order" hint="Pick the one that makes red look red.">
              <div className="flex items-center gap-2">
                <NativeSelect
                  className="min-w-0 flex-1"
                  value={o.order}
                  aria-label={`${n}: colour order`}
                  onChange={(e) => set({ order: Number(e.target.value) })}
                >
                  {ORDERS.map((l, v) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
                <OrderDots order={ORDERS[o.order] ?? 'GRB'} white={hasW(x)} />
              </div>
            </Field>
          )}
          {isDig(x) && hasW(x) && (
            <Field label="White channel" hint="Where the strip expects white, if not after RGB.">
              <NativeSelect
                className="w-full"
                value={o.swap}
                aria-label={`${n}: white channel`}
                onChange={(e) => set({ swap: Number(e.target.value) })}
              >
                {SWAPS.map((l, v) => (
                  <option key={v} value={v} disabled={v === 4 && !hasCCT(x)}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {hasW(x) && (
            <Field
              label="Auto white"
              hint={f.aw !== 255 ? 'Set for all outputs in Colour and white.' : AUTO_WHITE_HINTS[o.aw]}
            >
              <NativeSelect
                className="w-full"
                value={f.aw !== 255 ? f.aw : o.aw}
                disabled={f.aw !== 255}
                aria-label={`${n}: auto white`}
                onChange={(e) => set({ aw: Number(e.target.value) })}
              >
                {AUTO_WHITE.map((l, v) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {(isD2P(x) || isPWM(x)) && (
            <Field
              label={isPWM(x) ? 'PWM frequency' : 'Clock speed'}
              hint={isPWM(x) ? 'Faster: no flicker on camera. Slower: finer dimming steps.' : undefined}
            >
              <NativeSelect
                className="w-full"
                value={speedIndex(x, info.chip, o.freq)}
                aria-label={`${n}: ${isPWM(x) ? 'PWM frequency' : 'clock speed'}`}
                onChange={(e) => set({ freq: speeds[Number(e.target.value)] })}
              >
                {SPEEDS.map((l, v) => (
                  <option key={v} value={v}>
                    {l} · {isPWM(x) ? `${speeds[v]} Hz` : `${speeds[v] / 1000} MHz`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          {!isVir(x) && !one && (
            <Field
              label="Skip first LEDs"
              hint="For a level-shifter LED at the start."
              error={intIn(o.skip, 0, 255) ? undefined : '0–255'}
            >
              <NumberInput
                className="w-full"
                label={`${n}: skip first LEDs`}
                unit="LEDs"
                min={0}
                max={255}
                value={o.skip}
                invalid={!intIn(o.skip, 0, 255)}
                onChange={(skip) => set({ skip })}
              />
            </Field>
          )}
        </div>
        {one && !isHub75(x) && (
          <p className="m-0 text-xs text-muted-foreground">
            A {isPWM(x) ? 'PWM' : 'switched'} output is one LED position ({start}), so the whole fixture follows that
            LED.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {!isVir(x) &&
            (isAna(x)
              ? sw('Inverted output', 'For drivers that light up while the pin is low.', o.rev, (rev) => set({ rev }))
              : sw('Reverse direction', 'LED 0 moves to the far end of the strip.', o.rev, (rev) => set({ rev })))}
          {isPWM(x) &&
            info.maxL > 2048 &&
            sw('Dithering', 'Smoother fades at very low brightness.', o.ref, (ref) => set({ ref }))}
        </div>

        {isDig(x) && (
          <Collapsible className="flex flex-col gap-1">
            <CollapsibleTrigger className="group/more flex h-8 items-center gap-1.5 self-start rounded-lg pr-2 text-sm font-medium text-soft">
              <ChevronDown
                className="size-4 -rotate-90 transition-transform group-data-panel-open/more:rotate-0"
                aria-hidden
              />
              More options
              <span className="font-normal text-muted-foreground">· off refresh{driver ? ', driver' : ''}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-3 pt-1 pl-6">
              {mustRefresh(x)
                ? sw('Off refresh', 'Always on for this LED type.', true, () => {}, true)
                : sw(
                    'Off refresh',
                    'Keeps sending data while the light is off. Some LED chips need it to stay dark.',
                    o.ref,
                    (ref) => set({ ref }),
                  )}
              {driver && (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="text-sm">Driver</div>
                    <div
                      className={cx('text-xs', busOk(o, T, info, use) ? 'text-muted-foreground' : 'text-destructive')}
                    >
                      RMT: {use.rmt} of {info.maxRMT} in use. I2S: {use.i2s} of {info.maxI2S}, and every I2S output must
                      be the same LED type.
                    </div>
                  </div>
                  <Tabs value={o.drv} onValueChange={(drv) => set({ drv })}>
                    <TabsList aria-label={`${n}: driver`}>
                      <TabsTrigger value={0} disabled={o.drv === 1 && use.rmt >= info.maxRMT}>
                        RMT
                      </TabsTrigger>
                      <TabsTrigger value={1} disabled={o.drv === 0 && use.i2s >= info.maxI2S}>
                        I2S
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="border-t pt-2">
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}>
            <Trash2 data-icon="inline-start" />
            Remove output
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

// The LED type: a button with the type and what it has, opening a searchable list grouped by how the LEDs are
// driven. Types this output can't switch to say why (the I2S rule once, above the list).
function TypePicker({
  index,
  o,
  f,
  T,
  info,
  onPick,
}: {
  index: number
  o: Output
  f: LedForm
  T: Types
  info: LedInfo
  onPick: (t: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const x = T(o.type)
  const blocked = blockedTypes(f, index, T, info)
  const note = [...blocked.values()].find((w) => w.startsWith(I2S_NOTE))
  const match = (t: LedType) => !q.trim() || t.n.toLowerCase().includes(q.trim().toLowerCase())
  const groups = GROUPS.map(([g, sub, test]) => ({ g, sub, types: info.types.filter(test).filter(match) })).filter(
    (g) => g.types.length,
  )
  return (
    <Field label="LED type">
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setQ('')
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={`Output ${index + 1}: LED type, ${x.n}. Change`}
              className="flex min-h-11 w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl bg-input/50 px-3 py-1.5 text-left transition-colors hover:bg-input/80"
            />
          }
        >
          <span className="font-semibold">{x.n}</span>
          {typeTags(x)
            .filter((t) => !t.warn)
            .map((t) => (
              <Tag key={t.t} {...t} />
            ))}
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <span className="max-sm:hidden">Change</span>
            <ChevronDown className="size-4" aria-hidden />
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          initialFocus={() => search.current ?? true}
          className="w-[25rem] max-w-[calc(100vw-2rem)] gap-2 p-2.5"
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search, e.g. WS2812 or APA102"
              aria-label="Search LED types"
              className="pl-9"
            />
          </div>
          {note && (
            <p className="m-0 rounded-xl bg-sky-500/10 px-3 py-2 text-xs text-sky-100 ring-1 ring-sky-400/25">
              {note} Switch it to RMT under More options to choose freely.
            </p>
          )}
          <div className="scroll-thin flex max-h-[min(26rem,55vh)] flex-col overflow-y-auto">
            {groups.map(({ g, sub, types }) => (
              <div key={g} className="flex flex-col">
                <div className="flex items-baseline justify-between gap-2 px-2.5 pt-2.5 pb-1">
                  <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{g}</span>
                  <span className="truncate text-xs text-muted-foreground">{sub}</span>
                </div>
                {types.map((t) => {
                  const why = blocked.get(t.i)
                  const on = t.i === o.type
                  return (
                    <button
                      key={t.i}
                      type="button"
                      disabled={!!why}
                      aria-pressed={on}
                      onClick={() => {
                        onPick(t.i)
                        setOpen(false)
                        setQ('')
                      }}
                      className={cx(
                        'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left disabled:cursor-not-allowed',
                        on ? 'bg-primary/12' : 'enabled:hover:bg-muted',
                      )}
                    >
                      <span className={cx('flex min-w-0 flex-1 flex-col gap-1', why && 'opacity-50')}>
                        <span>{t.n}</span>
                        <span className="flex flex-wrap gap-1">
                          {typeTags(t).map((tag) => (
                            <Tag key={tag.t} {...tag} />
                          ))}
                        </span>
                        {why && !why.startsWith(I2S_NOTE) && (
                          <span className="text-xs text-muted-foreground">{why}</span>
                        )}
                      </span>
                      {on && <Check className="size-4.5 shrink-0 text-primary" aria-hidden />}
                    </button>
                  )
                })}
              </div>
            ))}
            {!groups.length && (
              <p className="m-0 px-2.5 py-3 text-sm text-muted-foreground">No LED type matches “{q.trim()}”.</p>
            )}
          </div>
          <p className="m-0 px-1 text-xs text-muted-foreground">
            Switching type keeps the pins and length where they still fit; options the new type doesn't have are reset.
          </p>
        </PopoverContent>
      </Popover>
    </Field>
  )
}
