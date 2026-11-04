import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { toast } from '../store'
import { cx, Switch } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { uploadFile, type Cfg } from './api'
import { FieldError, NumberInput, Row, SaveBar, Section, usePinAction } from './shared'
import { OWNER, PinPicker, usePins, type PinNeed, type PinUse } from './pins'
import {
  allowedTypes, busOk, hasCCT, pageErrors, hasW, isAna, isD2P, isDig, isHub75, isNet, isPWM, isVir, ledFields, mustRefresh, newOutput, pinFields,
  pinLabels, SPEEDS, speedFreqs, speedIndex, startOf, startsCustom, summary, toOutput, typeLookup, useLedForm, validate, withType,
  type LedForm, type LedInfo, type LedType, type Output, type Types,
} from './leds'

// Settings → LED and hardware, with the options of the firmware's page in WLED v16.0.1 (data/settings_leds.htm)
// except power-up and other defaults, which are on the Defaults page (they save through the same form).
// Each output folds to one line; pins are picked from a map of the light's GPIOs.

const ORDERS = ['GRB', 'RGB', 'BRG', 'RBG', 'BGR', 'GBR']
const SWAPS = ['None', 'W and B', 'W and G', 'W and R', 'WW and CW']
const AUTO_WHITE = ['None', 'Brighter', 'Accurate', 'Dual', 'Max']
// mA per LED presets, as the stock page's dropdown (255 is WS2815's 12 mA)
const LED_MA: [number, string][] = [[55, '55 mA (5V WS281x)'], [35, '35 mA (eco WS2812)'], [30, '30 mA (12V)'],
  [255, '12 mA (WS2815)'], [15, '15 mA (fairy pixels)']]
const BUTTON_TYPES: [number, string][] = [[0, 'Disabled'], [2, 'Pushbutton'], [3, 'Push inverted'], [4, 'Switch'], [5, 'PIR sensor'],
  [6, 'Touch'], [7, 'Analog'], [8, 'Analog inverted'], [9, 'Touch (switch)']]
const IR_TYPES = ['Remote disabled', '24-key RGB', '24-key with CT', '40-key blue', '44-key RGB', '21-key RGB', '6-key black', '9-key red', 'JSON remote']
// the LED type dropdown's groups, by the type's pin letters
const GROUPS: [string, (x: LedType) => boolean][] = [['Digital', (x) => x.t === 'D'], ['Digital with clock', isD2P], ['PWM', isPWM],
  ['On/off', (x) => x.t === ''], ['Network', isNet], ['Virtual', (x) => x.t === 'V'], ['HUB75', isHub75]]

const ADVANCED_KEY = 'wledUiLedAdvanced'
const readAdvanced = () => { try { return localStorage.getItem(ADVANCED_KEY) === '1' } catch { return false } }

const btnNeed = (type: number): PinNeed => (type === 6 || type === 9 ? 'touch' : type === 7 || type === 8 ? 'analog' : 'any')

// Pins the form uses, each with the field that uses it ("o0p1": output 1's second pin), so a picker can show
// the others as taken.
function pinUses(f: LedForm, T: Types) {
  const uses: { key: string; pin: number; use: PinUse }[] = []
  f.outs.forEach((o, i) => {
    const x = T(o.type)
    if (isVir(x) || isHub75(x)) return
    o.pins.slice(0, pinFields(x)).forEach((p, j) => uses.push({ key: `o${i}p${j}`, pin: p, use: { o: OWNER.led, label: `Out ${i + 1}`, name: `Output ${i + 1}` } }))
  })
  f.btns.forEach((b, i) => uses.push({ key: `b${i}`, pin: b.pin, use: { o: OWNER.button, label: `Btn ${i + 1}`, name: `Button ${i + 1}` } }))
  if (f.ir) uses.push({ key: 'ir', pin: f.ir.pin, use: { o: OWNER.ir, label: 'IR', name: 'the IR receiver' } })
  uses.push({ key: 'relay', pin: f.relay.pin, use: { o: OWNER.relay, label: 'Relay', name: 'the relay' } })
  return uses.filter((u) => u.pin >= 0)
}
// the pins the saved settings hold: free for this page's fields once nothing on the page uses them
const ownPins = (saved: LedForm, T: Types) => pinUses(saved, T).map((u) => u.pin)

// A config template (a cfg.json, e.g. from a board's maker), applied like the stock page's loadCfg(): its LED
// outputs, colour order overrides, buttons, IR, relay and "a segment for each output".
function applyTemplate(f: LedForm, c: Partial<Cfg>): LedForm {
  const hw = c.hw
  if (!hw) return f
  const next = { ...f }
  if (hw.led?.ins) {
    const outs = hw.led.ins.map(toOutput)
    Object.assign(next, { outs, customStarts: startsCustom(outs), abl: hw.led.maxpwr > 0, ppl: false, maxpwr: hw.led.maxpwr || f.maxpwr })
  }
  if (hw.com) next.com = hw.com.map((x) => ({ start: x.start, len: x.len, order: x.order & 0x0f, swap: x.order >> 4 }))
  if (hw.btn?.ins) Object.assign(next, { btns: hw.btn.ins.map((x) => ({ pin: x.pin?.[0] ?? -1, type: x.type })), tt: hw.btn.tt ?? f.tt })
  if (hw.ir && f.ir) next.ir = { pin: hw.ir.pin ?? -1, type: hw.ir.type ?? 0 }
  if (hw.relay) next.relay = { pin: hw.relay.pin, inverted: hw.relay.rev, odrain: hw.relay.odrain }
  if (c.light?.aseg !== undefined) next.autoSeg = c.light.aseg
  return next
}

export function LedSettings() {
  const { draft: f, base, setDraft, dirty, discard, error, retry, info, save, saving, dialog } = useLedForm()
  const pins = usePins()
  const [advanced, setAdvanced] = useState(readAdvanced)
  // outputs shown open; a light with one output opens it
  const [open, setOpen] = useState<Set<number> | null>(null)
  const template = useRef<HTMLInputElement>(null)

  if (error && !f) return <p className="text-sm text-muted-foreground">Couldn't load the settings. <Button variant="link" onClick={retry}>Try again</Button></p>
  if (info === null) return <p className="text-sm text-muted-foreground">Couldn't read the light's LED types. <Button variant="link" onClick={() => location.reload()}>Try again</Button></p>
  if (!f || !base || !info) return <p className="text-sm text-muted-foreground">Loading settings…</p>

  const T = typeLookup(info)
  const s = summary(f, T, info)
  const v = validate(f, T, info, s)
  const errors = pageErrors(v.leds, v.defaults, 'Defaults')
  const set = (p: Partial<LedForm>) => setDraft({ ...f, ...p })
  const setOut = (i: number, o: Output) => set({ outs: f.outs.map((x, j) => (j === i ? o : x)) })
  const opened = open ?? new Set(f.outs.length === 1 ? [0] : [])
  const toggle = (i: number) => {
    const n = new Set(opened)
    if (n.has(i)) n.delete(i); else n.add(i)
    setOpen(n)
  }

  const uses = pinUses(f, T)
  const own = ownPins(base, T)
  const others = (key: string) => new Map(uses.filter((u) => u.key !== key).map((u) => [u.pin, u.use]))
  const picker = (key: string, label: string, value: number, onChange: (p: number) => void, need: PinNeed, none?: string) =>
    pins === null ? <span className="text-sm text-muted-foreground">Loading pins…</span>
      : <PinPicker label={label} pins={pins} own={own} used={others(key)} need={need} touch={info.touch} none={none} value={value} onChange={onChange} />

  const canAdd = f.outs.length < 36
  const white = f.outs.some((o) => hasW(T(o.type)))
  const showDriver = info.chip !== 0 && info.chip !== 1 && f.outs.some((o) => T(o.type).t === 'D')

  const loadTemplate = async (file: File) => {
    try {
      setDraft(applyTemplate(f, JSON.parse(await file.text())))
      toast('Template applied. Check the outputs, then save.')
    } catch { toast('That file isn\'t a valid JSON config.', true) }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Outputs">
        {f.outs.length === 0 && <p className="m-0 text-sm text-muted-foreground">No outputs. Add one to drive LEDs.</p>}
        {f.outs.map((o, i) => (
          <OutputCard key={i} index={i} o={o} f={f} T={T} info={info} open={opened.has(i)} onToggle={() => toggle(i)}
            advanced={advanced} onChange={(x) => setOut(i, x)} picker={picker}
            onRemove={() => { set({ outs: f.outs.filter((_, j) => j !== i) }); setOpen(new Set([...opened].filter((j) => j !== i).map((j) => (j > i ? j - 1 : j)))) }} />
        ))}
        {f.outs.length > 0 && <Usage s={s} info={info} outputs={f.outs.length} />}
        {canAdd && (
          <Button variant="outline" className="self-start" onClick={() => { set({ outs: [...f.outs, newOutput(f, T, info)] }); setOpen(new Set([...opened, f.outs.length])) }}>
            <Plus data-icon="inline-start" />Add output
          </Button>
        )}
        <Row label="Custom start positions" hint="Off: each output starts where the one before it ends.">
          <Switch label="Custom start positions" on={f.customStarts} onChange={(customStarts) => set({
            customStarts, outs: f.outs.map((o, i) => ({ ...o, start: startOf(f, i) })),
          })} />
        </Row>
        <Row label="Make a segment for each output"><Switch label="Make a segment for each output" on={f.autoSeg} onChange={(autoSeg) => set({ autoSeg })} /></Row>
        {showDriver && (
          <Row label="Show advanced settings" hint="The driver (RMT or I2S) of each digital output.">
            <Switch label="Show advanced settings" on={advanced} onChange={(v) => {
              setAdvanced(v)
              try { localStorage.setItem(ADVANCED_KEY, v ? '1' : '0') } catch { /* storage unavailable: just this visit */ }
            }} />
          </Row>
        )}
        {showDriver && advanced && (
          <Row label="Hardware channels" hint="Digital outputs each take one, on the driver they use.">
            <span className={cx('text-sm', (s.use.rmt > info.maxRMT || s.use.i2s > info.maxI2S) ? 'text-destructive' : 'text-muted-foreground')}>
              RMT {s.use.rmt} of {info.maxRMT} · I2S {s.use.i2s} of {info.maxI2S}
            </span>
          </Row>
        )}
      </Section>

      <ColorOverrides f={f} info={info} set={set} />
      <Power f={f} s={s} T={T} set={set} />

      <Section title="Colour and white">
        <Row label="Gamma correction for colour" hint="Strongly recommended."><Switch label="Gamma correction for colour" on={f.gc} onChange={(gc) => set({ gc })} /></Row>
        <Row label="Gamma correction for brightness" hint="Not recommended."><Switch label="Gamma correction for brightness" on={f.gb} onChange={(gb) => set({ gb })} /></Row>
        <Row label="Gamma value"><NumberInput label="Gamma value" min={0.1} max={3} step={0.1} value={f.gv} onChange={(gv) => set({ gv })} /></Row>
        <Row label="White balance correction"><Switch label="White balance correction" on={f.cct} onChange={(cct) => set({ cct })} /></Row>
        {white && (
          <>
            <Row label="Auto-calculate white, for all outputs" stack>
              <NativeSelect className="w-full" value={f.aw} aria-label="Auto-calculate white, for all outputs" onChange={(e) => set({ aw: Number(e.target.value) })}>
                <option value={255}>Disabled (each output's own)</option>
                {AUTO_WHITE.map((l, v) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            </Row>
            <Row label="Calculate CCT from RGB"><Switch label="Calculate CCT from RGB" on={f.cr} onChange={(cr) => set({ cr })} /></Row>
            <Row label="CCT IC used (Athom 15W)"><Switch label="CCT IC used (Athom 15W)" on={f.ic} onChange={(ic) => set({ ic })} /></Row>
            <Row label="CCT blending" hint="Positive: additive blend. Negative: exclusive blend. Set to 0 for 2-wire (reverse polarity) CCT strips.">
              <NumberInput label="CCT blending" unit="%" min={-100} max={100} value={f.cb} onChange={(cb) => set({ cb })} />
            </Row>
          </>
        )}
      </Section>

      <Section title="Buttons">
        {f.btns.map((b, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-sm">Button {i + 1}</span>
            <NativeSelect className="min-w-0 flex-1" value={b.type} aria-label={`Button ${i + 1} type`}
              onChange={(e) => set({ btns: f.btns.map((x, j) => (j === i ? { ...x, type: Number(e.target.value) } : x)) })}>
              {BUTTON_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
            {picker(`b${i}`, `Button ${i + 1} GPIO`, b.pin, (pin) => set({ btns: f.btns.map((x, j) => (j === i ? { ...x, pin } : x)) }), btnNeed(b.type), 'None')}
            {f.btns.length > 1 && (
              <Button variant="ghost" size="icon" aria-label={`Remove button ${i + 1}`} title="Remove"
                onClick={() => set({ btns: f.btns.filter((_, j) => j !== i) })}><Trash2 /></Button>
            )}
          </div>
        ))}
        {f.btns.length < info.maxBT && (
          <Button variant="outline" className="self-start" onClick={() => set({ btns: [...f.btns, { pin: -1, type: 0 }] })}><Plus data-icon="inline-start" />Add button</Button>
        )}
        <Row label="Disable internal pull-up/down"><Switch label="Disable internal pull-up/down" on={!f.pull} onChange={(v) => set({ pull: !v })} /></Row>
        <Row label="Touch threshold"><NumberInput label="Touch threshold" min={0} max={100} value={f.tt} onChange={(tt) => set({ tt })} /></Row>
      </Section>

      {f.ir && <IrRemote f={f} set={set} picker={picker} />}

      <Section title="Relay">
        <Row label="Relay GPIO">{picker('relay', 'Relay GPIO', f.relay.pin, (pin) => set({ relay: { ...f.relay, pin } }), 'output', 'None')}</Row>
        <Row label="Inverted" hint="On: the relay is on while the pin is low."><Switch label="Inverted" on={f.relay.inverted} onChange={(inverted) => set({ relay: { ...f.relay, inverted } })} /></Row>
        <Row label="Open drain"><Switch label="Open drain" on={f.relay.odrain} onChange={(odrain) => set({ relay: { ...f.relay, odrain } })} /></Row>
      </Section>

      <Section title="Config template">
        <p className="m-0 text-xs text-muted-foreground">Fills in the outputs and hardware from a board's cfg.json. Nothing changes on the light until you save.</p>
        <input ref={template} type="file" accept=".json" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) loadTemplate(file) }} />
        <div><Button variant="outline" onClick={() => template.current?.click()}>Choose file…</Button></div>
      </Section>

      <SaveBar dirty={dirty} saving={saving} errors={errors} onSave={() => save(ledFields(f, T, info))} onDiscard={discard} />
      {dialog}
    </div>
  )
}

// A number of amps, to one decimal (in the light's locale, like the other numbers on the page).
const amps = (a: number) => `${a.toLocaleString(undefined, { maximumFractionDigits: 1 })} A`

// Under the outputs: how many LEDs, and how much of the LED memory they take. The bar and the stock page's
// warnings only show once it's getting full; most lights use a few percent.
function Usage({ s, info, outputs }: { s: ReturnType<typeof summary>; info: LedInfo; outputs: number }) {
  const lag = s.maxPerOutput > Math.min(info.maxPB, 800) || s.memPct > 80
  const lagBad = s.maxPerOutput > Math.max(info.maxPB, 800) || s.memPct > 100
  const pct = s.memPct < 1 ? 'under 1' : String(Math.round(s.memPct))
  return (
    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      <span>
        {s.total} LEDs on {outputs} {outputs === 1 ? 'output' : 'outputs'}{s.physical !== s.total && ` (${s.physical} physical)`}
        {' · '}uses {pct}% of the LED memory
      </span>
      {s.memPct > 60 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="LED memory" aria-valuenow={Math.round(s.memPct)} aria-valuemin={0} aria-valuemax={100}>
          <div className={cx('h-full rounded-full', s.memPct > 90 ? 'bg-destructive' : 'bg-amber-500')} style={{ width: `${Math.min(100, s.memPct)}%` }} />
        </div>
      )}
      {lag && (
        <p className={cx('m-0', lagBad ? 'text-destructive' : 'text-amber-500')}>
          {s.memPct > 80
            ? `LED memory is ${s.memPct > 100 ? 'over its limit' : 'over 80% full'}. You might run into stability or lag issues${s.memPct <= 100 ? '; restart the light after saving, and set transitions to 0 to save memory' : ''}.`
            : 'You might run into stability or lag issues. Use fewer than 800 LEDs per output for the best experience.'}
        </p>
      )}
    </div>
  )
}

function OutputCard({ index, o, f, T, info, open, onToggle, advanced, onChange, onRemove, picker }: {
  index: number; o: Output; f: LedForm; T: Types; info: LedInfo; open: boolean; onToggle: () => void; advanced: boolean
  onChange: (o: Output) => void; onRemove: () => void
  picker: (key: string, label: string, value: number, onChange: (p: number) => void, need: PinNeed, none?: string) => ReactNode
}) {
  const x = T(o.type)
  const set = (p: Partial<Output>) => onChange({ ...o, ...p })
  const n = `Output ${index + 1}`
  const allowed = allowedTypes(f, index, T, info)
  const labels = pinLabels(x)
  const fields = pinFields(x)
  const gpio = !isVir(x) && !isHub75(x)
  const setPin = (j: number, p: number) => set({ pins: o.pins.map((q, k) => (k === j ? p : q)) })
  const start = startOf(f, index)
  const where = isNet(x) ? o.pins.slice(0, 4).join('.')
    : gpio ? (o.pins.slice(0, fields).every((p) => p < 0) ? 'No pin' : `GPIO ${o.pins.slice(0, fields).filter((p) => p >= 0).join(', ')}`) : ''
  const sel = (label: string, value: number, onSel: (v: number) => void, options: ReactNode) => (
    <Row label={label}>
      <NativeSelect className="w-44" value={value} aria-label={`${n}: ${label}`} onChange={(e) => onSel(Number(e.target.value))}>{options}</NativeSelect>
    </Row>
  )
  const sw = (label: string, on: boolean, onSw: (v: boolean) => void, hint?: string) => (
    <Row label={label} hint={hint}><Switch label={`${n}: ${label}`} on={on} onChange={onSw} /></Row>
  )
  const speeds = speedFreqs(x, info.chip)
  // Custom stays chosen while its value matches a preset; a value that isn't a preset is always custom
  const [custom, setCustom] = useState(false)
  const customMa = custom || !LED_MA.some(([v]) => v === o.ledma)

  return (
    <div className="rounded-2xl border">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm hover:bg-muted/50">
        <span className="font-semibold">{index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          <span className="text-foreground">{x.n}</span>{where && ` · ${where}`}{!isAna(x) && !isHub75(x) && ` · ${o.len} LEDs`}
        </span>
        <ChevronDown className={cx('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t px-3 pt-3 pb-3">
          <Row label="LED type" stack>
            <NativeSelect className="w-full" value={o.type} aria-label={`${n}: LED type`} onChange={(e) => onChange(withType(o, Number(e.target.value), T, info))}>
              {GROUPS.map(([g, test]) => {
                const types = info.types.filter(test)
                return types.length ? (
                  <optgroup key={g} label={g}>
                    {types.map((t) => <option key={t.i} value={t.i} disabled={!allowed.has(t.i)}>{t.n}</option>)}
                  </optgroup>
                ) : null
              })}
            </NativeSelect>
          </Row>

          {gpio && labels.slice(0, fields).map((l, j) => (
            <Row key={j} label={l}>{picker(`o${index}p${j}`, `${n}: ${l}`, o.pins[j], (p) => setPin(j, p), 'output')}</Row>
          ))}
          {isNet(x) && (
            <Row label="IP address" stack>
              <div className="flex items-center gap-1 font-mono" role="group" aria-label={`${n}: IP address`}>
                {[0, 1, 2, 3].map((j) => (
                  <span key={j} className="flex items-center gap-1">
                    {j > 0 && <span className="text-muted-foreground">.</span>}
                    <NumberInput label={`${n}: IP address, part ${j + 1}`} className="w-16" min={0} max={255} value={o.pins[j] < 0 ? NaN : o.pins[j]} onChange={(v) => setPin(j, Number.isNaN(v) ? -1 : v)} />
                  </span>
                ))}
              </div>
            </Row>
          )}
          {(isHub75(x) || x.t === 'V') && labels.slice(0, fields).map((l, j) => (
            <Row key={j} label={l}><NumberInput label={`${n}: ${l}`} value={o.pins[j] < 0 ? NaN : o.pins[j]} onChange={(v) => setPin(j, Number.isNaN(v) ? -1 : v)} /></Row>
          ))}
          {isNet(x) && info.chip !== 0 && (
            <Row label="Host name" hint="Used instead of the IP address when set (.local).">
              <Input className="w-44" maxLength={32} value={o.text} aria-label={`${n}: host name`} onChange={(e) => set({ text: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })} />
            </Row>
          )}

          {!isAna(x) && !isHub75(x) && <Row label="Length"><NumberInput label={`${n}: length`} unit="LEDs" min={1} max={isDig(x) ? info.maxPB : 16384} value={o.len} onChange={(len) => set({ len })} /></Row>}
          <Row label="Start">
            {f.customStarts
              ? <NumberInput label={`${n}: start`} min={0} max={8191} value={o.start} onChange={(v) => set({ start: v })} />
              : <span className="text-sm text-muted-foreground">{start} (automatic)</span>}
          </Row>
          {!isVir(x) && !isAna(x) && !isHub75(x) && sel('Colour order', o.order, (order) => set({ order }), ORDERS.map((l, v) => <option key={v} value={v}>{l}</option>))}
          {isDig(x) && hasW(x) && sel('Swap', o.swap, (swap) => set({ swap }), SWAPS.map((l, v) => <option key={v} value={v} disabled={v === 4 && !hasCCT(x)}>{l}</option>))}
          {hasW(x) && sel('Auto-calculate white', o.aw, (aw) => set({ aw }), AUTO_WHITE.map((l, v) => <option key={v} value={v}>{l}</option>))}
          {(isD2P(x) || isPWM(x)) && sel(isPWM(x) ? 'PWM frequency' : 'Clock', speedIndex(x, info.chip, o.freq), (v) => set({ freq: speeds[v] }),
            SPEEDS.map((l, v) => <option key={v} value={v}>{l}{isPWM(x) ? ` (${speeds[v]} Hz)` : ''}</option>))}
          {!isVir(x) && sw(isAna(x) ? 'Inverted output' : 'Reversed', o.rev, (rev) => set({ rev }))}
          {!isVir(x) && !isAna(x) && !isHub75(x) && <Row label="Skip first LEDs"><NumberInput label={`${n}: skip first LEDs`} min={0} max={255} value={o.skip} onChange={(skip) => set({ skip })} /></Row>}
          {(isDig(x) || (isPWM(x) && info.maxL > 2048)) && (mustRefresh(x)
            ? <Row label="Off refresh" hint="Always on for this LED type."><Switch label={`${n}: off refresh`} on onChange={() => {}} /></Row>
            : sw(isPWM(x) ? 'Dithering' : 'Off refresh', o.ref, (ref) => set({ ref })))}
          {advanced && x.t === 'D' && info.chip !== 0 && info.chip !== 1 && <Driver o={o} f={f} T={T} info={info} label={n} onChange={(drv) => set({ drv })} />}

          {f.abl && isDig(x) && (
            <>
              <Row label="Current per LED">
                <NativeSelect className="w-44" aria-label={`${n}: current per LED`} value={customMa ? 0 : o.ledma}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setCustom(v === 0)
                    // Custom starts from the chosen preset (WS2815's 255 stands for 12 mA)
                    set({ ledma: v || (o.ledma === 255 ? 12 : o.ledma) })
                  }}>
                  {LED_MA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  <option value={0}>Custom</option>
                </NativeSelect>
              </Row>
              {customMa && (
                <Row label="Maximum per LED"><NumberInput label={`${n}: maximum current per LED`} unit="mA" min={1} max={254} value={o.ledma} onChange={(ledma) => set({ ledma })} /></Row>
              )}
            </>
          )}

          <div>
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}><Trash2 data-icon="inline-start" />Remove output</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// RMT or I2S for a digital output (ESP32, S2, S3), with the choice that's full disabled like the stock page.
function Driver({ o, f, T, info, label, onChange }: { o: Output; f: LedForm; T: Types; info: LedInfo; label: string; onChange: (d: number) => void }) {
  const s = summary(f, T, info)
  return (
    <Row label="Driver">
      <NativeSelect className="w-44" value={o.drv} aria-label={`${label}: driver`} aria-invalid={!busOk(o, T, info, s.use) || undefined} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={0} disabled={o.drv === 1 && s.use.rmt >= info.maxRMT}>RMT</option>
        <option value={1} disabled={o.drv === 0 && s.use.i2s >= info.maxI2S}>I2S</option>
      </NativeSelect>
    </Row>
  )
}
function ColorOverrides({ f, info, set }: { f: LedForm; info: LedInfo; set: (p: Partial<LedForm>) => void }) {
  const [shown, setShown] = useState(f.com.length > 0)
  const setCom = (i: number, p: Partial<LedForm['com'][number]>) => set({ com: f.com.map((c, j) => (j === i ? { ...c, ...p } : c)) })
  return (
    <Section title="Colour order overrides" action={
      <Button size="sm" variant="ghost" aria-expanded={shown} onClick={() => setShown(!shown)}>
        {f.com.length ? `${f.com.length} set` : 'None'}<ChevronDown data-icon="inline-end" className={cx('transition-transform', shown && 'rotate-180')} />
      </Button>
    }>
      {shown && (
        <>
          <p className="m-0 text-xs text-muted-foreground">A different colour order for a range of LEDs, e.g. a strip spliced from two kinds.</p>
          {f.com.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <NumberInput label={`Override ${i + 1}: start`} unit="start" unitStart min={0} max={65535} value={c.start} onChange={(start) => setCom(i, { start })} />
              <NumberInput label={`Override ${i + 1}: length`} unit="LEDs" min={1} max={65535} value={c.len} onChange={(len) => setCom(i, { len })} />
              <NativeSelect value={c.order} aria-label={`Override ${i + 1}: colour order`} onChange={(e) => setCom(i, { order: Number(e.target.value) })}>
                {ORDERS.map((l, v) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
              <NativeSelect value={c.swap} aria-label={`Override ${i + 1}: white swap`} onChange={(e) => setCom(i, { swap: Number(e.target.value) })}>
                <option value={0}>Swap: as the output</option>
                {SWAPS.slice(1, 4).map((l, v) => <option key={v} value={v + 1}>Swap {l}</option>)}
              </NativeSelect>
              <Button variant="ghost" size="icon" aria-label={`Remove override ${i + 1}`} title="Remove" onClick={() => set({ com: f.com.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>
          ))}
          {f.com.length < info.maxCO && (
            <Button variant="outline" className="self-start" onClick={() => set({ com: [...f.com, { start: 0, len: 1, order: 0, swap: 0 }] })}><Plus data-icon="inline-start" />Add override</Button>
          )}
        </>
      )}
    </Section>
  )
}

// What the LEDs can draw, then the limiter that keeps them within the power supply: one rating for all
// outputs, or one for each digital output (the others aren't limited).
function Power({ f, s, T, set }: { f: LedForm; s: ReturnType<typeof summary>; T: Types; set: (p: Partial<LedForm>) => void }) {
  const digital = f.outs.map((o, i) => ({ o, i })).filter(({ o }) => isDig(T(o.type)))
  const perLed = (o: Output) => (o.ledma === 255 ? 12 : o.ledma)
  const total = f.ppl ? digital.reduce((sum, { o }) => sum + (o.maxpwr || 0), 0) : f.maxpwr
  const currents = [...new Set(digital.map(({ o }) => perLed(o)))]
  const setRating = (i: number, maxpwr: number) => set({ outs: f.outs.map((o, j) => (j === i ? { ...o, maxpwr } : o)) })
  return (
    <Section title="Power">
      {s.digital > 0 && (
        <Row label="Full white needs" hint={`${currents.length === 1 ? `${s.digital} LEDs at ${currents[0]} mA` : 'Each output\'s LEDs at their current per LED'}, plus 0.1 A for the controller. Most effects use about ${amps(s.psuMost)}.`}>
          <span className="text-sm font-semibold whitespace-nowrap">{amps(s.psu)}</span>
        </Row>
      )}
      <Row label="Brightness limiter" hint="Dims the LEDs so they never draw more than your power supply provides.">
        <Switch label="Brightness limiter" on={f.abl} onChange={(abl) => set({ abl, ppl: abl && f.ppl })} />
      </Row>
      {f.abl && (
        <>
          <p className="m-0 text-xs text-muted-foreground">
            Keep it under 1 A if the LEDs are powered from the ESP's 5V pin. PWM and network outputs aren't limited.
          </p>
          <Row label="Power supplies" stack>
            <NativeSelect className="w-full" value={f.ppl ? 1 : 0} aria-label="Power supplies" onChange={(e) => {
              const ppl = e.target.value === '1'
              // like enPPL(): one supply for each output splits the rating by LED count, and back adds them up
              const leds = digital.reduce((sum, { o }) => sum + o.len, 0) || 1
              set(ppl
                ? { ppl, outs: f.outs.map((o) => (isDig(T(o.type)) ? { ...o, maxpwr: Math.max(250, Math.round((f.maxpwr * o.len) / leds)) } : o)) }
                : { ppl, maxpwr: Math.max(250, total) })
            }}>
              <option value={0}>One power supply for all outputs</option>
              <option value={1}>A power supply for each output</option>
            </NativeSelect>
          </Row>
          {f.ppl ? (
            <>
              {digital.map(({ o, i }) => (
                <Row key={i} label={`Output ${i + 1} rating`} hint={`${o.len} LEDs, full white needs ${amps((perLed(o) * o.len) / 1000)}`}>
                  <NumberInput label={`Output ${i + 1}: power supply rating`} unit="mA" min={250} max={65000} value={o.maxpwr} onChange={(v) => setRating(i, v)} />
                </Row>
              ))}
              <Row label="In all"><span className="text-sm whitespace-nowrap">{amps(total / 1000)}</span></Row>
            </>
          ) : (
            <Row label="Power supply rating" hint="What your power supply provides.">
              <NumberInput label="Power supply rating" unit="mA" min={250} max={65000} value={f.maxpwr} onChange={(maxpwr) => set({ maxpwr })} />
            </Row>
          )}
          {total > 7200 && (
            <p className="m-0 text-xs text-amber-500">That's a lot of current. Use thick cables, several power injection points and a fuse.</p>
          )}
        </>
      )}
      <Row label="Brightness factor" hint="Scales every brightness the light sets."><NumberInput label="Brightness factor" unit="%" min={1} max={255} value={f.bf} onChange={(bf) => set({ bf })} /></Row>
    </Section>
  )
}

function IrRemote({ f, set, picker }: {
  f: LedForm; set: (p: Partial<LedForm>) => void
  picker: (key: string, label: string, value: number, onChange: (p: number) => void, need: PinNeed, none?: string) => ReactNode
}) {
  const ir = f.ir!
  const file = useRef<HTMLInputElement>(null)
  const upload = usePinAction(async (body: File) => {
    const { result } = await uploadFile(body, '/ir.json')
    if (result === 'ok') toast('ir.json uploaded')
    return result
  }, () => {}, { verb: 'upload', onFail: () => toast('Couldn\'t upload ir.json.', true) })
  return (
    <Section title="IR remote">
      <Row label="IR receiver GPIO">{picker('ir', 'IR receiver GPIO', ir.pin, (pin) => set({ ir: { ...ir, pin } }), 'any', 'None')}</Row>
      <Row label="Remote" stack>
        <NativeSelect className="w-full" value={ir.type} aria-label="Remote" onChange={(e) => set({ ir: { ...ir, type: Number(e.target.value) } })}>
          {IR_TYPES.map((l, v) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
      </Row>
      {ir.type === 8 && (
        <Row label="JSON remote file" hint="Uploaded as ir.json.">
          <input ref={file} type="file" accept=".json" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) upload.run(x) }} />
          <Button variant="outline" disabled={upload.busy} onClick={() => file.current?.click()}>{upload.busy ? 'Uploading…' : 'Upload…'}</Button>
        </Row>
      )}
      <Row label="Apply IR changes to the main segment only"><Switch label="Apply IR changes to the main segment only" on={f.irMain} onChange={(irMain) => set({ irMain })} /></Row>
      <a className="text-xs" href="https://kno.wled.ge/interfaces/infrared/" target="_blank" rel="noreferrer">About IR remotes</a>
      <FieldError>{ir.type > 0 && ir.pin < 0 ? 'Choose the receiver\'s GPIO for the remote to work.' : undefined}</FieldError>
      {upload.dialog}
    </Section>
  )
}

