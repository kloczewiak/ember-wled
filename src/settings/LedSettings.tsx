import { useRef, useState, type ReactNode } from 'react'
import { Calculator, Plus, Trash2, TriangleAlert, Upload } from 'lucide-react'
import { toast } from '../store'
import { cx, Slider, Switch } from '../components/controls'
import { Accordion } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { uploadFile, type Cfg } from './api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { intIn, NumberInput, Row, SaveBar, Section, usePinAction } from './shared'
import { PinPicker, usePins } from './pins'
import {
  AUTO_WHITE,
  AUTO_WHITE_HINTS,
  Field,
  fieldGrid,
  LedMap,
  ORDERS,
  OrderDots,
  OutBadge,
  OutputCard,
  type Picker,
} from './LedOutputs'
import {
  BUTTON_OPTIONS,
  espMA,
  fullWhiteBri,
  fullWhiteMA,
  globalBudget,
  hasW,
  isAna,
  isDig,
  isHub75,
  isVir,
  ledFields,
  newOutput,
  outputBudget,
  ownPins,
  pageErrors,
  pinUses,
  pinFields,
  startsCustom,
  startOf,
  summary,
  toOutput,
  typeLookup,
  useLedForm,
  validate,
  type ButtonCfg,
  type LedForm,
  type LedInfo,
  type Output,
  type Types,
} from './leds'

// Settings → LED and hardware, with the options of the firmware's page in WLED v16.0.1 (data/settings_leds.htm)
// except power-up and other defaults, which are on the Defaults page (they save through the same form).
// The outputs are a map of where their LEDs sit plus a card each; power compares what the LEDs draw with the
// supply. Buttons are on their own page (their pins and types still save through this form).

// mA per LED presets, as the stock page's dropdown (255 is WS2815's 12 mA)
const LED_MA: [number, string][] = [
  [55, '55 mA · 5 V WS281x'],
  [35, '35 mA · eco WS2812'],
  [30, '30 mA · 12 V'],
  [255, '12 mA · WS2815'],
  [15, '15 mA · fairy lights'],
]
const IR_TYPES = [
  'None',
  '24-key RGB',
  '24-key with white temperature',
  '40-key blue',
  '44-key RGB',
  '21-key RGB',
  '6-key black',
  '9-key red',
  'Custom (JSON file)',
]
const SWAP_OVERRIDE = ['As the output', 'Swapped with blue', 'Swapped with green', 'Swapped with red']

// A config template (a cfg.json, e.g. from a board's maker), applied like the stock page's loadCfg(): its LED
// outputs, colour order overrides, buttons, IR, relay and "a segment for each output".
function applyTemplate(f: LedForm, c: Partial<Cfg>): LedForm {
  const hw = c.hw
  if (!hw) return f
  const next = { ...f }
  if (hw.led?.ins) {
    const outs = hw.led.ins.map(toOutput)
    Object.assign(next, {
      outs,
      customStarts: startsCustom(outs),
      abl: hw.led.maxpwr > 0,
      ppl: false,
      maxpwr: hw.led.maxpwr || f.maxpwr,
    })
  }
  if (hw.com) next.com = hw.com.map((x) => ({ start: x.start, len: x.len, order: x.order & 0x0f, swap: x.order >> 4 }))
  if (hw.btn?.ins)
    Object.assign(next, {
      btns: hw.btn.ins.map((x) => ({ pin: x.pin?.[0] ?? -1, type: x.type, macros: x.macros ?? [0, 0, 0] })),
      tt: hw.btn.tt ?? f.tt,
    })
  if (hw.ir && f.ir) next.ir = { pin: hw.ir.pin ?? -1, type: hw.ir.type ?? 0 }
  if (hw.relay) next.relay = { pin: hw.relay.pin, inverted: hw.relay.rev, odrain: hw.relay.odrain }
  if (c.light?.aseg !== undefined) next.autoSeg = c.light.aseg
  return next
}

// A number of amps, to one decimal (in the light's locale, like the other numbers on the page).
// Amps to the milliamp, the firmware's own precision
const amps = (a: number) => `${a.toLocaleString(undefined, { maximumFractionDigits: 3 })} A`
// A calculated current, rounded up to 100 mA: these are estimates, and rounding up never undersizes a supply
const ampsUp = (a: number) => amps(Math.ceil(Math.round(a * 1000) / 100) / 10)
const gpio = (p: number) => (p >= 0 ? `GPIO ${p}` : 'none')
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

// What applying a template changes on this page, as [what, before → after] lines.
function templateChanges(f: LedForm, next: LedForm, T: Types): [string, string][] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const outs = (l: Output[]) =>
    l
      .map((o) => {
        const x = T(o.type)
        const p = o.pins.slice(0, pinFields(x)).filter((q) => q >= 0)
        return `${x.n}${p.length && !isVir(x) && !isHub75(x) ? ` on GPIO ${p.join(', ')}` : ''}${isAna(x) || isHub75(x) ? '' : `, ${o.len} LEDs`}`
      })
      .join('; ') || 'none'
  const btns = (l: ButtonCfg[]) =>
    l
      .filter((b) => b.type)
      .map((b) => `${BUTTON_OPTIONS.find(([v]) => v === b.type)?.[1] ?? 'Button'} on ${gpio(b.pin)}`)
      .join('; ') || 'none'
  const lines: [string, string][] = []
  if (!same(f.outs, next.outs)) lines.push(['LED outputs', `${count(f.outs.length, 'output')} → ${outs(next.outs)}`])
  if (!same(f.com, next.com)) lines.push(['Colour order overrides', `${f.com.length} → ${next.com.length}`])
  if (
    !same(
      f.btns.map((b) => [b.pin, b.type]),
      next.btns.map((b) => [b.pin, b.type]),
    )
  )
    lines.push(['Buttons', `${count(f.btns.filter((b) => b.type).length, 'button')} → ${btns(next.btns)}`])
  if (!same(f.ir, next.ir))
    lines.push([
      'IR receiver',
      `${gpio(f.ir?.pin ?? -1)} → ${gpio(next.ir?.pin ?? -1)}${next.ir?.type ? `, ${IR_TYPES[next.ir.type]}` : ''}`,
    ])
  if (!same(f.relay, next.relay)) lines.push(['Relay', `${gpio(f.relay.pin)} → ${gpio(next.relay.pin)}`])
  if (f.autoSeg !== next.autoSeg) lines.push(['A segment for each output', next.autoSeg ? 'off → on' : 'on → off'])
  const limiter = (x: LedForm) => (x.abl ? `${amps(x.maxpwr / 1000)} supply` : 'off')
  if (limiter(f) !== limiter(next)) lines.push(['Brightness limiter', `${limiter(f)} → ${limiter(next)}`])
  return lines
}

export function LedSettings() {
  const { draft: f, base, setDraft, dirty, discard, error, retry, info, save, saving, dialog } = useLedForm()
  const pins = usePins()
  // the open output (one at a time); a light with one output opens it
  const [open, setOpen] = useState<number | null>(null)
  const [template, setTemplate] = useState<{ name: string; next: LedForm } | null>(null)
  const file = useRef<HTMLInputElement>(null)

  if (error && !f)
    return (
      <p className="text-sm text-muted-foreground">
        Couldn't load the settings.{' '}
        <Button variant="link" onClick={retry}>
          Try again
        </Button>
      </p>
    )
  if (info === null)
    return (
      <p className="text-sm text-muted-foreground">
        Couldn't read the light's LED types.{' '}
        <Button variant="link" onClick={() => location.reload()}>
          Try again
        </Button>
      </p>
    )
  if (!f || !base || !info) return <p className="text-sm text-muted-foreground">Loading settings…</p>

  const T = typeLookup(info)
  const s = summary(f, T, info)
  const v = validate(f, T, info, s)
  const errors = pageErrors(v.leds, v.defaults, 'Defaults')
  const set = (p: Partial<LedForm>) => setDraft({ ...f, ...p })
  const setOut = (i: number, o: Output) => set({ outs: f.outs.map((x, j) => (j === i ? o : x)) })
  const opened = open ?? (f.outs.length === 1 ? 0 : -1)
  const toggle = (i: number) => setOpen(opened === i ? -1 : i)

  const uses = pinUses(f, T)
  const own = ownPins(base, T)
  const others = (key: string) => new Map(uses.filter((u) => u.key !== key).map((u) => [u.pin, u.use]))
  const picker: Picker = (key, p) =>
    pins === null ? (
      <span className="text-sm text-muted-foreground">Loading pins…</span>
    ) : (
      <PinPicker pins={pins} own={own} used={others(key)} touch={info.touch} {...p} />
    )
  // pins two outputs both use (only possible from a template or the stock page)
  const outPins = uses.filter((u) => u.key.startsWith('o')).map((u) => u.pin)
  const dupPins = new Set(outPins.filter((p, i) => outPins.indexOf(p) !== i))

  const loadTemplate = async (fl: File) => {
    try {
      const next = applyTemplate(f, JSON.parse(await fl.text()))
      setTemplate({ name: fl.name, next })
    } catch {
      toast("That file isn't a valid JSON config.", true)
    }
  }
  const changes = template ? templateChanges(f, template.next, T) : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 min-w-0 flex-1 basis-64 text-sm text-muted-foreground">
          What's wired to the controller: LED outputs and their power, the IR receiver and the relay. Buttons have{' '}
          <a href="#settings/buttons">their own page</a>.
        </p>
        <input
          ref={file}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const x = e.target.files?.[0]
            e.target.value = ''
            if (x) loadTemplate(x)
          }}
        />
        <Button
          variant="outline"
          title="Fills in the outputs and hardware from a board's cfg.json"
          onClick={() => file.current?.click()}
        >
          <Upload data-icon="inline-start" />
          Load board template
        </Button>
      </div>

      <Section
        title="LED outputs"
        action={
          f.outs.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {s.total} LEDs on {count(f.outs.length, 'output')}
            </span>
          )
        }
      >
        {f.outs.length === 0 && <p className="m-0 text-sm text-muted-foreground">No outputs. Add one to drive LEDs.</p>}
        {f.outs.length > 0 && (
          <>
            <LedMap f={f} T={T} open={opened} onOpen={toggle} />
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm text-soft">Starts</span>
                <Tabs
                  value={f.customStarts}
                  onValueChange={(c) =>
                    set({ customStarts: c, outs: f.outs.map((o, i) => ({ ...o, start: startOf(f, i) })) })
                  }
                >
                  <TabsList aria-label="Where outputs start">
                    <TabsTrigger value={false}>One after another</TabsTrigger>
                    <TabsTrigger value={true}>Custom</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <Memory s={s} />
            </div>
            <Lag s={s} info={info} />
          </>
        )}
        <div className="flex flex-col gap-2">
          <Accordion
            className="gap-2 overflow-visible rounded-none border-0"
            value={opened >= 0 ? [opened] : []}
            onValueChange={(o) => setOpen(o[0] ?? -1)}
          >
            {f.outs.map((o, i) => (
              <OutputCard
                key={i}
                index={i}
                o={o}
                f={f}
                T={T}
                info={info}
                onChange={(x) => setOut(i, x)}
                picker={picker}
                dupPins={dupPins}
                errors={v.leds.filter((e) => e.startsWith(`Output ${i + 1}:`))}
                onRemove={() => {
                  set({ outs: f.outs.filter((_, j) => j !== i) })
                  setOpen(-1)
                }}
              />
            ))}
          </Accordion>
          {f.outs.length < 36 && (
            <Button
              variant="outline"
              className="h-11 w-full border-dashed"
              onClick={() => {
                set({ outs: [...f.outs, newOutput(f, T, info)] })
                setOpen(f.outs.length)
              }}
            >
              <Plus data-icon="inline-start" />
              Add output
            </Button>
          )}
        </div>
        <div className="h-px bg-border" />
        <Row
          label="A segment for each output"
          hint="Sets up one segment per output when the light starts, so each can be controlled on its own."
        >
          <Switch label="A segment for each output" on={f.autoSeg} onChange={(autoSeg) => set({ autoSeg })} />
        </Row>
      </Section>

      <ColorOverrides f={f} info={info} set={set} />
      <Power f={f} s={s} T={T} info={info} set={set} />
      <ColourWhite f={f} T={T} set={set} />
      <div className="grid gap-4 md:grid-cols-2">
        {f.ir && <IrRemote f={f} set={set} picker={picker} />}
        <Relay f={f} set={set} picker={picker} />
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        errors={errors}
        onSave={() => save(ledFields(f, T, info))}
        onDiscard={discard}
      />
      {dialog}
      <AlertDialog
        open={template !== null}
        onOpenChange={(o) => {
          if (!o) setTemplate(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply {template?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {changes.length
                ? 'It replaces these settings on this page. Nothing changes on the light until you save.'
                : 'It matches the settings on this page already.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {changes.length > 0 && (
            <div className="flex flex-col rounded-2xl bg-muted/50 px-3 py-1">
              {changes.map(([what, change]) => (
                <div key={what} className="flex gap-3 border-b py-2.5 text-sm last:border-b-0">
                  <span className="w-28 shrink-0 text-muted-foreground">{what}</span>
                  <span className="min-w-0">{change}</span>
                </div>
              ))}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!changes.length}
              onClick={() => {
                if (template) setDraft(template.next)
                setTemplate(null)
                setOpen(null)
                toast('Template applied. Check the outputs, then save.')
              }}
            >
              Apply template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// How much of the LED memory the outputs take, as a small meter.
function Memory({ s }: { s: ReturnType<typeof summary> }) {
  const pct = s.memPct < 1 ? 'under 1%' : `${Math.round(s.memPct)}%`
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>LED memory</span>
      <Progress
        aria-label="LED memory"
        value={Math.min(100, s.memPct)}
        className={cx(
          'w-18 *:data-[slot=progress-track]:h-1.5',
          s.memPct > 90
            ? '**:data-[slot=progress-indicator]:bg-destructive'
            : s.memPct > 60
              ? '**:data-[slot=progress-indicator]:bg-amber-500'
              : '**:data-[slot=progress-indicator]:bg-muted-foreground',
        )}
      />
      <span className="text-soft tabular-nums">{pct}</span>
    </div>
  )
}

// The stock page's warnings: long outputs, or LED memory getting full.
function Lag({ s, info }: { s: ReturnType<typeof summary>; info: LedInfo }) {
  const lag = s.maxPerOutput > Math.min(info.maxPB, 800) || s.memPct > 80
  if (!lag) return null
  const bad = s.maxPerOutput > Math.max(info.maxPB, 800) || s.memPct > 100
  return (
    <Notice tone={bad ? 'bad' : 'warn'}>
      {s.memPct > 80
        ? `LED memory is ${s.memPct > 100 ? 'over its limit' : `${Math.round(s.memPct)}% full`}, so the light may lag or become unstable.${s.memPct <= 100 ? ' Restart it after saving, and set transitions to 0 to save memory.' : ''}`
        : 'An output has over 800 LEDs, so the light may lag. Fewer than 800 per output works best.'}
    </Notice>
  )
}

function Notice({ tone, children }: { tone: 'warn' | 'bad'; children: ReactNode }) {
  return (
    <Alert
      variant={tone === 'bad' ? 'destructive' : 'default'}
      className={
        tone === 'bad'
          ? 'border-destructive/30 bg-destructive/10'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      }
    >
      <TriangleAlert aria-hidden />
      <AlertDescription className="text-current">{children}</AlertDescription>
    </Alert>
  )
}

function ColorOverrides({ f, info, set }: { f: LedForm; info: LedInfo; set: (p: Partial<LedForm>) => void }) {
  const setCom = (i: number, p: Partial<LedForm['com'][number]>) =>
    set({ com: f.com.map((c, j) => (j === i ? { ...c, ...p } : c)) })
  const add = f.com.length < info.maxCO && (
    <Button
      variant="outline"
      size="sm"
      onClick={() => set({ com: [...f.com, { start: 0, len: 1, order: 0, swap: 0 }] })}
    >
      <Plus data-icon="inline-start" />
      Add override
    </Button>
  )
  return (
    <Section title="Colour order overrides" action={add}>
      <p className="m-0 text-sm text-soft">
        {f.com.length ? '' : 'None. '}For a strip spliced from two kinds: give a range of its LEDs another colour order.
      </p>
      {f.com.map((c, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-3">
          <div className="flex items-center gap-2.5">
            <OrderDots order={ORDERS[c.order] ?? 'GRB'} />
            <span className="flex-1 text-sm font-medium">
              LEDs {c.len > 1 ? `${c.start}–${c.start + c.len - 1}` : c.start} use {ORDERS[c.order]}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove override ${i + 1}`}
              title="Remove"
              onClick={() => set({ com: f.com.filter((_, j) => j !== i) })}
            >
              <Trash2 />
            </Button>
          </div>
          <div className={fieldGrid}>
            <Field label="First LED">
              <NumberInput
                className="w-full"
                label={`Override ${i + 1}: first LED`}
                min={0}
                max={65535}
                value={c.start}
                invalid={!intIn(c.start, 0, 65535)}
                onChange={(start) => setCom(i, { start })}
              />
            </Field>
            <Field label="Length">
              <NumberInput
                className="w-full"
                label={`Override ${i + 1}: length`}
                unit="LEDs"
                min={1}
                max={65535}
                value={c.len}
                invalid={!intIn(c.len, 1, 65535)}
                onChange={(len) => setCom(i, { len })}
              />
            </Field>
            <Field label="Colour order">
              <NativeSelect
                className="w-full"
                value={c.order}
                aria-label={`Override ${i + 1}: colour order`}
                onChange={(e) => setCom(i, { order: Number(e.target.value) })}
              >
                {ORDERS.map((l, v) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="White channel">
              <NativeSelect
                className="w-full"
                value={c.swap}
                aria-label={`Override ${i + 1}: white channel`}
                onChange={(e) => setCom(i, { swap: Number(e.target.value) })}
              >
                {SWAP_OVERRIDE.map((l, v) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </div>
      ))}
    </Section>
  )
}

// A supply rating in amps over the form's mA.
function AmpInput({
  value,
  onChange,
  label,
  prefix,
}: {
  value: number
  onChange: (mA: number) => void
  label: string
  prefix?: string
}) {
  const bad = !intIn(value, 250, 65000)
  return (
    <div className="flex items-center gap-2">
      {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
      <NumberInput
        className="w-24"
        label={label}
        unit="A"
        min={0.25}
        max={65}
        step={0.1}
        invalid={bad}
        value={Number.isNaN(value) ? NaN : value / 1000}
        onChange={(a) => onChange(Number.isNaN(a) ? NaN : Math.round(a * 1000))}
      />
    </div>
  )
}

// What's calculated from the LEDs, kept apart from the settings: what full white draws as the limiter
// estimates it, which is the supply to get, and what most effects draw.
function Estimate({ draw, most }: { draw: number; most: number }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-muted/40 p-4">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Calculator className="size-3.5" aria-hidden />
        Calculated from your LEDs
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm text-soft">Recommended power supply</span>
        <span className="text-[22px] leading-tight font-semibold tracking-tight tabular-nums">
          {ampsUp(draw)} or more
        </span>
      </span>
      <span className="text-xs text-muted-foreground">
        What the LEDs and controller draw at full white, rounded up to 0.1 A. Most effects use about {ampsUp(most)}.
      </span>
    </div>
  )
}

// Your supply against what full white needs: the part the limiter dims is hatched.
function PowerGauge({ need, most, supply, bri }: { need: number; most: number; supply: number; bri: number }) {
  const scale = Math.max(need, supply, 0.1)
  const at = (a: number) => Math.max(0, Math.min(100, (a / scale) * 100))
  const over = supply < need
  // The ticked value: the supply where the limiter cuts in, or full white when the supply covers it
  const mark = over ? supply : need
  // The labels in order along the bar, alternating above and below it so neighbours never meet. Each one slides
  // from left-aligned at 0 to right-aligned at the end, so it stays inside the bar.
  const marks = [
    { v: most, text: `Most effects ${ampsUp(most)}`, strong: false },
    { v: need, text: `Full white ${ampsUp(need)}`, strong: false },
    { v: supply, text: `Your supply ${amps(supply)}`, strong: true },
  ].sort((x, y) => x.v - y.v)
  const place = (v: number) => ({ left: `${at(v)}%`, transform: `translateX(-${at(v)}%)` })
  const tag = (m: (typeof marks)[number]) => (
    <span
      key={m.text}
      className={cx('absolute whitespace-nowrap', m.strong && 'font-semibold text-foreground')}
      style={place(m.v)}
    >
      {m.text}
    </span>
  )
  const text = !over
    ? 'Your supply covers full white, so the limiter never has to dim.'
    : `The limiter dims full white to about ${Math.max(1, Math.round(bri * 100))}% so the light stays within ${amps(supply)}. ${most <= supply ? "Most effects aren't dimmed at all." : 'Most effects are dimmed a little too.'}`
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-xs text-muted-foreground tabular-nums" aria-hidden>
        <div className="relative h-4">{marks.filter((_, i) => i % 2 === 0).map(tag)}</div>
        <div className="relative">
          <div className="relative h-3.5 overflow-hidden rounded-full bg-input/70">
            <span
              className="absolute inset-y-0 left-0 bg-primary"
              style={{ width: `${at(Math.min(supply, need))}%` }}
            />
            {over && (
              <span
                className="absolute inset-y-0"
                style={{
                  left: `${at(supply)}%`,
                  right: 0,
                  background: 'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.2) 0 3px, transparent 3px 7px)',
                }}
              />
            )}
            <span className="absolute inset-y-0 -ml-px w-0.5 bg-background/75" style={{ left: `${at(most)}%` }} />
          </div>
          <span
            className="absolute -top-1 -ml-px h-5.5 w-0.5 rounded-full bg-foreground"
            style={{ left: `${at(mark)}%` }}
          />
        </div>
        <div className="relative h-4">
          {at(marks[1].v) > 20 && <span className="absolute left-0">0 A</span>}
          {tag(marks[1])}
        </div>
      </div>
      <p className="m-0 text-sm text-soft">{text}</p>
    </div>
  )
}

// What the LEDs draw, then the limiter that keeps them within the power supply: one rating for all outputs,
// or one for each digital output (the others aren't limited).
function Power({
  f,
  s,
  T,
  info,
  set,
}: {
  f: LedForm
  s: ReturnType<typeof summary>
  T: Types
  info: LedInfo
  set: (p: Partial<LedForm>) => void
}) {
  const digital = f.outs.map((o, i) => ({ o, i })).filter(({ o }) => isDig(T(o.type)))
  const others = f.outs.length - digital.length
  const total = f.ppl ? digital.reduce((sum, { o }) => sum + (o.maxpwr || 0), 0) : f.maxpwr
  const setOut = (i: number, p: Partial<Output>) => set({ outs: f.outs.map((o, j) => (j === i ? { ...o, ...p } : o)) })
  const leds = digital.reduce((sum, { o }) => sum + o.len, 0)
  const ledDraw = digital.reduce((sum, { o }) => sum + fullWhiteMA(o), 0)
  // What full white draws with the controller, in amps, and how far one supply for all outputs dims it
  const draw = (ledDraw + espMA(info.chip)) / 1000
  // Most effects light about a third of what full white does (stock's estimate)
  const most = (ledDraw / 3 + espMA(info.chip)) / 1000
  const bri = fullWhiteBri(globalBudget(f.maxpwr, info.chip), ledDraw, leds)
  const setPpl = (ppl: boolean) => {
    // like enPPL(): one supply for each output splits the rating by LED count, and back adds them up
    const leds = digital.reduce((sum, { o }) => sum + o.len, 0) || 1
    set(
      ppl
        ? {
            ppl,
            outs: f.outs.map((o) =>
              isDig(T(o.type)) ? { ...o, maxpwr: Math.max(250, Math.round((f.maxpwr * o.len) / leds / 100) * 100) } : o,
            ),
          }
        : { ppl, maxpwr: Math.max(250, total) },
    )
  }
  return (
    <Section title="Power">
      {digital.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col">
            <span className="text-sm">Current per LED</span>
            <span className="text-xs text-muted-foreground">
              What one LED draws at full white. Pick your LED type, or check its datasheet.
            </span>
          </div>
          {digital.map(({ o, i }) => (
            <CurrentRow key={i} i={i} o={o} name={T(o.type).n} onChange={(p) => setOut(i, p)} />
          ))}
          {others > 0 && (
            <span className="text-xs text-muted-foreground">
              PWM, on/off and network outputs aren't limited, and aren't counted here.
            </span>
          )}
        </div>
      )}
      {s.digital > 0 && <Estimate draw={draw} most={most} />}
      <div className="h-px bg-border" />
      <Row label="Brightness limiter" hint="Dims the LEDs so they never draw more than your power supply provides.">
        <Switch label="Brightness limiter" on={f.abl} onChange={(abl) => set({ abl, ppl: abl && f.ppl })} />
      </Row>
      {f.abl && (digital.length > 1 || f.ppl) && (
        <Row label="Power supplies">
          <Tabs value={f.ppl} onValueChange={setPpl}>
            <TabsList aria-label="Power supplies">
              <TabsTrigger value={false}>One for all outputs</TabsTrigger>
              <TabsTrigger value={true}>One per output</TabsTrigger>
            </TabsList>
          </Tabs>
        </Row>
      )}
      {f.abl && !f.ppl && (
        <Row
          label="Your supply's rating"
          hint="The current your power supply provides, from its label. Keep it under 1 A if the LEDs run off the ESP's 5 V pin."
        >
          <AmpInput label="Power supply rating" value={f.maxpwr} onChange={(maxpwr) => set({ maxpwr })} />
        </Row>
      )}
      {f.abl && f.ppl && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col">
            <span className="text-sm">Your supplies' ratings</span>
            <span className="text-xs text-muted-foreground">
              The current each output's power supply provides, from its label. Each output is limited on its own, so
              spare current on one supply doesn't help another.
            </span>
          </div>
          {digital.map(({ o, i }) => (
            <SupplyRow
              key={i}
              i={i}
              o={o}
              name={T(o.type).n}
              share={Math.floor(espMA(info.chip) / digital.length)}
              bri={fullWhiteBri(outputBudget(o, digital.length, info.chip), fullWhiteMA(o), o.len)}
              onChange={(maxpwr) => setOut(i, { maxpwr })}
            />
          ))}
          <div className="flex justify-between px-0.5 text-sm">
            <span>In all</span>
            <span className="font-semibold tabular-nums">{amps(total / 1000)}</span>
          </div>
        </div>
      )}
      {f.abl && !f.ppl && s.digital > 0 && <PowerGauge need={draw} most={most} supply={f.maxpwr / 1000} bri={bri} />}
      {f.abl && total > 7200 && (
        <Notice tone="warn">
          {amps(total / 1000)} is a lot of current. Use thick cables, feed power in at several points along the strip,
          and add a fuse.
        </Notice>
      )}
      <div className="h-px bg-border" />
      <Row label="Brightness factor" hint="Scales every brightness the light sets: 50% halves it, up to 255%.">
        <NumberInput
          label="Brightness factor"
          unit="%"
          min={1}
          max={255}
          value={f.bf}
          invalid={!intIn(f.bf, 1, 255)}
          onChange={(bf) => set({ bf })}
        />
      </Row>
    </Section>
  )
}

// One digital output's current per LED, with what full white draws.
function CurrentRow({
  i,
  o,
  name,
  onChange,
}: {
  i: number
  o: Output
  name: string
  onChange: (p: Partial<Output>) => void
}) {
  // Custom stays chosen while its value matches a preset; a value that isn't a preset is always custom
  const [custom, setCustom] = useState(false)
  const customMa = custom || !LED_MA.some(([v]) => v === o.ledma)
  const full = fullWhiteMA(o) / 1000
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-muted/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <OutBadge i={i} small />
        <span className="flex min-w-0 flex-1 basis-32 flex-col">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">
            {o.len} LEDs · up to {ampsUp(full)} at full white
          </span>
        </span>
        <NativeSelect
          className="w-48"
          aria-label={`Output ${i + 1}: current per LED`}
          value={customMa ? 0 : o.ledma}
          onChange={(e) => {
            const v = Number(e.target.value)
            setCustom(v === 0)
            // Custom starts from the chosen preset (WS2815's 255 stands for 12 mA)
            onChange({ ledma: v || (o.ledma === 255 ? 12 : o.ledma) })
          }}
        >
          {LED_MA.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
          <option value={0}>Custom</option>
        </NativeSelect>
        {customMa && (
          <NumberInput
            className="w-24"
            label={`Output ${i + 1}: maximum current per LED`}
            unit="mA"
            min={1}
            max={254}
            value={o.ledma}
            invalid={!intIn(o.ledma, 1, 254)}
            onChange={(ledma) => onChange({ ledma })}
          />
        )}
      </div>
    </div>
  )
}

// One digital output's own supply, with one per output, and how far the limiter dims its full white. What it
// needs counts its share of the controller's current, which comes out of its budget.
function SupplyRow({
  i,
  o,
  name,
  share,
  bri,
  onChange,
}: {
  i: number
  o: Output
  name: string
  share: number
  bri: number
  onChange: (maxpwr: number) => void
}) {
  const full = (fullWhiteMA(o) + share) / 1000
  const dim = bri < 1 ? Math.max(1, Math.round(bri * 100)) : null
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-muted/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <OutBadge i={i} small />
        <span className="flex min-w-0 flex-1 basis-32 flex-col">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">
            Needs up to {ampsUp(full)} at full white, about {ampsUp((fullWhiteMA(o) / 3 + share) / 1000)} for most
            effects
          </span>
        </span>
        <AmpInput
          prefix="Your supply"
          label={`Output ${i + 1}: power supply rating`}
          value={o.maxpwr}
          onChange={onChange}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {dim === null
          ? 'Covers full white, so this output is never dimmed.'
          : `Full white is dimmed to about ${dim}% on this output.`}
      </span>
    </div>
  )
}

function ColourWhite({ f, T, set }: { f: LedForm; T: Types; set: (p: Partial<LedForm>) => void }) {
  const white = f.outs.map((o, i) => ({ o, i })).filter(({ o }) => hasW(T(o.type)))
  const [cb, setCb] = useState<number | null>(null)
  return (
    <Section title="Colour and white">
      <div className="flex flex-col gap-3">
        <Row
          label={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              Colour gamma correction
              <span className="rounded-full bg-primary/15 px-2 py-px text-[11px] font-semibold text-primary">
                Recommended
              </span>
            </span>
          }
          hint="Makes fades and dim colours look natural on LEDs."
        >
          <Switch label="Colour gamma correction" on={f.gc} onChange={(gc) => set({ gc })} />
        </Row>
        <Row
          label="Brightness gamma correction"
          hint="Not recommended: the lower half of the brightness slider gets very dark."
        >
          <Switch label="Brightness gamma correction" on={f.gb} onChange={(gb) => set({ gb })} />
        </Row>
        <Row label="Gamma value" hint="For both corrections. 2.2 suits most LEDs.">
          <NumberInput
            label="Gamma value"
            min={0.1}
            max={3}
            step={0.1}
            value={f.gv}
            invalid={!(f.gv >= 0.1 && f.gv <= 3)}
            onChange={(gv) => set({ gv })}
          />
        </Row>
        <Row
          label="White balance correction"
          hint="Gives RGB LEDs the white temperature slider too, and tints their colours to it."
        >
          <Switch label="White balance correction" on={f.cct} onChange={(cct) => set({ cct })} />
        </Row>
      </div>
      {white.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl bg-muted/40 px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pb-1">
            <span className="text-sm font-semibold">White LEDs</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              on {white.length === 1 ? 'output' : 'outputs'}{' '}
              {white.map(({ i }) => (
                <OutBadge key={i} i={i} small />
              ))}
            </span>
          </div>
          <Row
            label="Auto white for all outputs"
            hint={f.aw === 255 ? 'Each output uses its own setting, in its options.' : AUTO_WHITE_HINTS[f.aw]}
          >
            <NativeSelect
              className="w-48"
              value={f.aw}
              aria-label="Auto white for all outputs"
              onChange={(e) => set({ aw: Number(e.target.value) })}
            >
              <option value={255}>Each output's own</option>
              {AUTO_WHITE.map((l, v) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Row>
          <Row
            label="White temperature from colour"
            hint="Works out warm or cold white from the colour, instead of the white temperature slider."
          >
            <Switch label="White temperature from colour" on={f.cr} onChange={(cr) => set({ cr })} />
          </Row>
          <Row
            label="CCT driver chip"
            hint="For PWM CCT lights with a CCT chip, like the Athom 15 W bulb: one pin sets brightness, the other the temperature."
          >
            <Switch label="CCT driver chip" on={f.ic} onChange={(ic) => set({ ic })} />
          </Row>
          <div className="flex flex-col gap-2 pt-2 pb-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">Warm and cold white blending</span>
              <span className="text-sm font-semibold tabular-nums">
                {(cb ?? f.cb) > 0 ? '+' : ''}
                {cb ?? f.cb}%
              </span>
            </div>
            <Slider
              label="Warm and cold white blending"
              min={-100}
              max={100}
              value={intIn(f.cb, -100, 100) ? f.cb : 0}
              onInput={setCb}
              onCommit={(v) => {
                setCb(null)
                set({ cb: v })
              }}
            />
            <div className="flex justify-between text-[11.5px] text-muted-foreground">
              <span>−100 · kept apart</span>
              <span>0</span>
              <span>mixed in · +100</span>
            </div>
            <span className="text-xs text-muted-foreground">
              How warm and cold white overlap between the ends of the temperature slider. Set to 0 for 2-wire (reverse
              polarity) CCT strips.
            </span>
          </div>
        </div>
      )}
    </Section>
  )
}

function IrRemote({ f, set, picker }: { f: LedForm; set: (p: Partial<LedForm>) => void; picker: Picker }) {
  const ir = f.ir!
  const file = useRef<HTMLInputElement>(null)
  const upload = usePinAction(
    async (body: File) => {
      const { result } = await uploadFile(body, '/ir.json')
      if (result === 'ok') toast('ir.json uploaded')
      return result
    },
    () => {},
    { verb: 'upload', onFail: () => toast("Couldn't upload ir.json.", true) },
  )
  const shown = ir.type > 0 || ir.pin >= 0
  const missing = ir.type > 0 && ir.pin < 0
  return (
    <Section title="IR remote" className="h-full">
      <Field
        label="Remote"
        hint={shown ? undefined : 'Pick your remote to control the light with an infrared receiver.'}
      >
        <NativeSelect
          className="w-full"
          value={ir.type}
          aria-label="IR remote"
          onChange={(e) => set({ ir: { ...ir, type: Number(e.target.value) } })}
        >
          {IR_TYPES.map((l, v) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {shown && (
        <>
          <Row
            label="Receiver pin"
            hint={missing ? <span className="text-destructive">Choose the pin your receiver is on.</span> : undefined}
          >
            {picker('ir', {
              label: 'IR receiver pin',
              value: ir.pin,
              onChange: (pin) => set({ ir: { ...ir, pin } }),
              need: 'any',
              none: 'None',
              invalid: missing,
            })}
          </Row>
          <Field label="Remote changes">
            <Tabs value={f.irMain} onValueChange={(irMain) => set({ irMain })}>
              <TabsList className="w-full" aria-label="Remote changes">
                <TabsTrigger value={false}>Selected segments</TabsTrigger>
                <TabsTrigger value={true}>Main segment only</TabsTrigger>
              </TabsList>
            </Tabs>
          </Field>
          {ir.type === 8 && (
            <Row label="Remote file" hint="Your buttons and their codes, uploaded as ir.json.">
              <input
                ref={file}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const x = e.target.files?.[0]
                  e.target.value = ''
                  if (x) upload.run(x)
                }}
              />
              <Button variant="outline" disabled={upload.busy} onClick={() => file.current?.click()}>
                {upload.busy ? 'Uploading…' : 'Upload…'}
              </Button>
            </Row>
          )}
        </>
      )}
      <a className="mt-auto text-xs" href="https://kno.wled.ge/interfaces/infrared/" target="_blank" rel="noreferrer">
        About IR remotes
      </a>
      {upload.dialog}
    </Section>
  )
}

function Relay({ f, set, picker }: { f: LedForm; set: (p: Partial<LedForm>) => void; picker: Picker }) {
  const r = f.relay
  return (
    <Section title="Relay" className="h-full">
      <p className="m-0 text-xs text-muted-foreground">
        Switched on with the light, for example to cut the LED power supply while the light is off.
      </p>
      <Row label="Relay pin">
        {picker('relay', {
          label: 'Relay pin',
          value: r.pin,
          onChange: (pin) => set({ relay: { ...r, pin } }),
          need: 'output',
          none: 'None',
        })}
      </Row>
      {r.pin >= 0 && (
        <>
          <Field label="The relay is on while the pin is">
            <Tabs value={r.inverted} onValueChange={(inverted) => set({ relay: { ...r, inverted } })}>
              <TabsList className="w-full" aria-label="The relay is on while the pin is">
                <TabsTrigger value={false}>High</TabsTrigger>
                <TabsTrigger value={true}>Low</TabsTrigger>
              </TabsList>
            </Tabs>
          </Field>
          <Field label="Pin output" hint="Open drain only pulls the pin low, for relay boards with their own pull-up.">
            <Tabs value={r.odrain} onValueChange={(odrain) => set({ relay: { ...r, odrain } })}>
              <TabsList className="w-full" aria-label="Pin output">
                <TabsTrigger value={false}>Push-pull</TabsTrigger>
                <TabsTrigger value={true}>Open drain</TabsTrigger>
              </TabsList>
            </Tabs>
          </Field>
        </>
      )}
    </Section>
  )
}
