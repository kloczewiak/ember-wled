import { useRef, useState } from 'react'
import { CircleHelp, Plus, Trash2 } from 'lucide-react'
import { toast } from '../store'
import { cx, Switch } from '../components/controls'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCfgForm } from './config'
import { intIn, NumberInput, PageIntro, PresetSelect, Row, SaveBar, Section, useLeaveGuard, useSaver } from './shared'
import { OWNER, PinPicker, usePins, type Pin } from './pins'
import {
  BUTTON_OPTIONS,
  btnNeed,
  isAnalogBtn,
  isSwitchBtn,
  isTouch,
  ledFields,
  ownPins,
  pageErrors,
  pinUses,
  summary,
  toLedForm,
  typeLookup,
  useLedInfo,
  validate,
  type ButtonCfg,
  type LedInfo,
} from './leds'
import { timeFields, toTimeForm, validateTime } from './time'

// Settings → Buttons: everything about a button in one place. The firmware splits it over two forms: the pin,
// type, pull-up and touch threshold are on its LED page (data/settings_leds.htm), the presets for each press
// on Time and macros (data/settings_time.htm). This page edits both and saves the LED form only when the
// hardware changed, since every save of it restarts the LED outputs. Then it saves the presets, which set.cpp
// gives to the buttons the light has by then.

// what an analog button controls (the stock page's bAO()): a function, or a segment's opacity
const ANALOG: [number, string][] = [
  [250, 'Global brightness'],
  [249, 'Effect speed'],
  [248, 'Effect intensity'],
  [247, 'Palette'],
  [200, 'Primary color hue'],
  ...Array.from({ length: 33 }, (_, j): [number, string] => [j, `Segment ${j} opacity`]),
]

// What a button does without a preset (button.cpp): the first two pushbuttons have built-in actions. Switches
// and motion sensors turn the light on when the contact opens or motion stops, and off when it closes or starts.
const BUILT_IN = [
  ['Turn on or off', 'Random colour', ''],
  ['Next effect', 'Brightness up or down', 'Next palette'],
]
const builtIn = (i: number, type: number, slot: number) =>
  (isSwitchBtn(type) ? (slot === 0 ? 'Turn the light on' : 'Turn the light off') : BUILT_IN[i]?.[slot]) || undefined

// The presets a button runs, by the preset slot set.cpp stores them in: a switch's slot 0 fires when it turns
// off (opens) and slot 1 when it turns on
function slots(type: number): [string, number][] {
  if (type === 5)
    return [
      ['Motion starts', 1],
      ['Motion stops', 0],
    ]
  if (type === 9)
    return [
      ['Touched', 1],
      ['Let go', 0],
    ]
  if (isSwitchBtn(type))
    return [
      ['Switched on', 1],
      ['Switched off', 0],
    ]
  return [
    ['Press', 0],
    ['Hold', 1],
    ['Double press', 2],
  ]
}

// What a saved button reads now, from /json/pins: pressed or not, a switch's position, an analog or touch
// reading. A button changed on the page reads nothing until it's saved.
function liveState(b: ButtonCfg, saved: ButtonCfg | undefined, pins: Pin[] | null, info: LedInfo, tt: number) {
  if (!b.type) return null
  const p = pins?.find((q) => q.p === b.pin && q.o === OWNER.button)
  if (!saved || saved.pin !== b.pin || saved.type !== b.type || !p) return { text: 'Save to test it' }
  if (isAnalogBtn(b.type) && p.r !== undefined)
    return {
      bar: (p.r / (info.chip === 0 ? 1023 : 4095)) * 100,
      text: `${Math.round((p.r / (info.chip === 0 ? 1023 : 4095)) * 100)}%`,
    }
  if (isTouch(b.type) && p.r !== undefined)
    return { dot: p.r <= tt, text: `${p.r <= tt ? 'Touched' : 'Not touched'} · reads ${p.r}` }
  if (p.s === undefined) return null
  const on = !!p.s
  return {
    dot: on,
    text:
      b.type === 4 ? (on ? 'On' : 'Off') : b.type === 5 ? (on ? 'Motion' : 'No motion') : on ? 'Pressed' : 'Released',
  }
}

// What buttons do that the settings don't show, by kind of button, from button.cpp and the JSON API (json.cpp,
// util.cpp getVal)
function ButtonHelp() {
  const [tab, setTab] = useState('push')
  // opens focused on the text, not its first link, so it opens at the top
  const body = useRef<HTMLDivElement>(null)
  const h = 'm-0 text-[13px] font-semibold text-foreground'
  const list = 'm-0 flex list-disc flex-col gap-1 pl-5'
  const code = 'rounded bg-muted px-1 py-0.5 font-mono text-[12px]'
  const rows: [string, string, string, string][] = [
    ['Button 1', 'Turn on or off', 'Random colour', 'Nothing'],
    ['Button 2', 'Next effect', 'Brightness up or down', 'Next palette'],
    ['Others', 'Nothing', 'Nothing', 'Nothing'],
  ]
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        <CircleHelp data-icon="inline-start" />
        Learn about hidden button functions
      </DialogTrigger>
      <DialogContent
        initialFocus={body}
        className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>Hidden button functions</DialogTitle>
          <DialogDescription>What the firmware does with buttons beyond the presets you pick.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 gap-3">
          <TabsList className="w-full shrink-0" aria-label="Kind of button">
            <TabsTrigger value="push">Pushbuttons</TabsTrigger>
            <TabsTrigger value="switch">Switches</TabsTrigger>
            <TabsTrigger value="pot">Knobs</TabsTrigger>
            <TabsTrigger value="presets">Presets</TabsTrigger>
          </TabsList>
          {/* a new scroll area for each tab, so each one opens at the top */}
          <div
            key={tab}
            ref={body}
            tabIndex={-1}
            className="scroll-thin -mx-6 min-h-0 overflow-y-auto px-6 text-sm text-soft outline-none"
          >
            <TabsContent value="push" className="flex flex-col gap-5">
              <p className="m-0">
                Pushbuttons, inverted pushbuttons and touch buttons all work like this. Touch only works on ESP32
                boards, not on ESP8266 or ESP32-C3.
              </p>
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>Without a preset</h3>
                <p className="m-0">
                  The first two buttons have built-in actions. The rest do nothing until you give them presets.
                </p>
                <table className="w-full border-separate border-spacing-0 text-[13px]">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      {['', 'Press', 'Hold', 'Double press'].map((x) => (
                        <th key={x} className="pb-1.5 text-left font-medium">
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([b, ...acts]) => (
                      <tr key={b}>
                        <th className="border-t py-1.5 pr-3 text-left font-medium text-foreground">{b}</th>
                        {acts.map((a, j) => (
                          <td
                            key={j}
                            className={cx('border-t py-1.5 pr-3', a === 'Nothing' && 'text-muted-foreground')}
                          >
                            {a}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="m-0">
                  Button 2's brightness steps while you hold it, and goes the other way each time you hold it again.
                </p>
              </section>
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>Holding button 1</h3>
                <ul className={list}>
                  <li>
                    Hold for 5 seconds, then let go: the light starts its own Wi-Fi access point, so you can reach it
                    when it's lost its network.
                  </li>
                  <li>
                    Hold for 10 seconds, then let go: a <span className="text-amber-400">factory reset</span>. It erases
                    all settings and presets, then restarts.
                  </li>
                </ul>
                <p className="m-0">
                  These work whatever presets the button has. The hold action still runs first, after 0.6 seconds.
                  They're off only when press, hold and double press all have the same preset.
                </p>
              </section>
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>Timing</h3>
                <ul className={list}>
                  <li>
                    A hold is a press longer than 0.6 seconds. A double press is a second press within 0.35 seconds.
                  </li>
                  <li>
                    A press acts when you let go. With a double-press preset (and always on button 2), a single press
                    first waits 0.35 seconds for a second one.
                  </li>
                  <li>
                    With the same preset for press, hold and double press, it runs the moment the button goes down.
                  </li>
                  <li>
                    On every button except the first, holding repeats the hold action about five times a second,
                    including a hold preset.
                  </li>
                </ul>
              </section>
            </TabsContent>

            <TabsContent value="switch" className="flex flex-col gap-5">
              <p className="m-0">
                Switches, touch switches and motion sensors stay on or off rather than being pressed. They have no hold
                or double press, and as button 1 they don't start the access point or reset the light.
              </p>
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>Without a preset, it's the other way round</h3>
                <ul className={list}>
                  <li>
                    Switching on, touching or motion turns the light <em>off</em>.
                  </li>
                  <li>Switching off, letting go or no more motion turns it on.</li>
                </ul>
                <p className="m-0">
                  Give them presets for "Switched on" and "Switched off" (or "Motion starts" and "Motion stops") to
                  change that.
                </p>
              </section>
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>At power-up</h3>
                <p className="m-0">
                  A switch that's already on when the light starts counts as just switched on, so without a preset it
                  turns the light off, and with one it runs its "Switched on" preset. A motion sensor that sees motion
                  at power-up does the same. A switch that's off does nothing.
                </p>
              </section>
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>Timing</h3>
                <p className="m-0">
                  A change counts once it has held for 0.05 seconds, so a bouncing contact switches once.
                </p>
              </section>
            </TabsContent>

            <TabsContent value="pot" className="flex flex-col gap-5">
              <p className="m-0">
                Potentiometers, normal or inverted, control one thing as you turn them: the brightness unless you pick
                something else.
              </p>
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>The ends</h3>
                <ul className={list}>
                  <li>
                    Turned all the way down, it turns the light off, and turning it up turns it back on. Controlling a
                    segment, it turns that segment off.
                  </li>
                  <li>The last 2% at each end count as fully off and fully on, so a worn knob still reaches both.</li>
                </ul>
              </section>
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>When it acts</h3>
                <ul className={list}>
                  <li>
                    Only when it's turned: what you set in the app stays until someone moves the knob, which then sets
                    its own value.
                  </li>
                  <li>Changes under 2% are ignored, so a noisy knob doesn't flicker. It's read every 0.25 seconds.</li>
                </ul>
              </section>
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>What it can control</h3>
                <ul className={list}>
                  <li>Palette: every palette, spread across the whole turn.</li>
                  <li>Primary colour hue: the colour wheel at full saturation.</li>
                  <li>A segment's opacity: that segment's own brightness.</li>
                </ul>
              </section>
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>On ESP8266</h3>
                <p className="m-0">It always reads A0, whatever pin it's set to, since that's the only analog pin.</p>
              </section>
            </TabsContent>

            <TabsContent value="presets" className="flex flex-col gap-5">
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>Presets as commands</h3>
                <p className="m-0">
                  A button can only run presets, but a preset can be an API command instead of a saved look. To make
                  one, add a preset, turn off "Use current state" and type the command under "API command":
                </p>
                <ul className={list}>
                  <li>
                    <code className={code}>{'{"on":"t"}'}</code> turns the light on or off
                  </li>
                  <li>
                    <code className={code}>{'{"bri":"~16"}'}</code> and <code className={code}>{'{"bri":"~-16"}'}</code>{' '}
                    step the brightness up and down. On a hold, they repeat while you hold, except on button 1
                  </li>
                  <li>
                    <code className={code}>{'{"seg":[{"fx":"~"}]}'}</code> picks the next effect
                  </li>
                  <li>
                    <code className={code}>{'{"ps":"1~5~"}'}</code> steps through presets 1 to 5
                  </li>
                </ul>
              </section>
              <section className="flex flex-col gap-1.5">
                <h3 className={h}>Home automation</h3>
                <p className="m-0">
                  With "Publish on button press" in <a href="#settings/sync">Sync interfaces</a>, every press is also
                  sent over MQTT (short, long or double, and on or off for switches and motion sensors), so a home
                  automation system can react to it.
                </p>
              </section>
            </TabsContent>
          </div>
        </Tabs>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}

export function ButtonSettings() {
  const led = useCfgForm(toLedForm)
  const time = useCfgForm(toTimeForm)
  const info = useLedInfo()
  // read again every 1.5 s for the live states
  const pins = usePins(1500)
  useLeaveGuard(led.dirty || time.dirty)
  // the presets to save once the hardware is saved, and whether the hardware waits for them to reload: both
  // forms reload from one request, sent after both saves (a reload started in between is shared, so it would
  // bring back the old presets)
  const next = useRef<[string, string][] | null>(null)
  const hwSaved = useRef(false)
  const timeSaver = useSaver('time', () => {
    time.reloadAfterSave()
    if (hwSaved.current) {
      hwSaved.current = false
      led.reloadAfterSave()
    }
  })
  const ledSaver = useSaver(
    'leds',
    () => {
      const fields = next.current
      next.current = null
      if (fields) {
        hwSaved.current = true
        timeSaver.save(fields)
      } else {
        led.reloadAfterSave()
        toast('Settings saved')
      }
    },
    true,
  )

  if ((led.error && !led.draft) || (time.error && !time.draft))
    return (
      <p className="text-sm text-muted-foreground">
        Couldn't load the settings.{' '}
        <Button variant="link" onClick={led.retry}>
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
  const f = led.draft
  const t = time.draft
  if (!f || !led.base || !t || !time.base || !info)
    return <p className="text-sm text-muted-foreground">Loading settings…</p>

  const T = typeLookup(info)
  const v = validate(f, T, info, summary(f, T, info))
  const touchMsg = (e: string) => e.startsWith('The touch threshold')
  const presetMsg = (e: string) => e.startsWith('Preset IDs')
  const tv = validateTime(t)
  const own = [
    ...f.btns.flatMap((b, i) => (b.type && b.pin < 0 ? [`Button ${i + 1}: choose a pin.`] : [])),
    ...v.leds.filter(touchMsg),
    ...tv.filter(presetMsg),
  ]
  // the other pages' problems only matter when their form is saved too
  const errors = pageErrors(
    pageErrors(own, led.dirty ? [...v.leds.filter((e) => !touchMsg(e)), ...v.defaults] : [], 'LED and hardware'),
    time.dirty ? tv.filter((e) => !presetMsg(e)) : [],
    'Time and macros',
  )
  const macros = (i: number) => t.buttons[i]?.macros ?? [0, 0, 0]

  const setHw = (i: number, p: Partial<ButtonCfg>) => {
    led.setDraft({ ...f, btns: f.btns.map((b, j) => (j === i ? { ...b, ...p } : b)) })
    // the presets' form needs the type too: it posts no presets for an analog button
    if (p.type !== undefined)
      time.setDraft({ ...t, buttons: f.btns.map((b, j) => ({ type: j === i ? p.type! : b.type, macros: macros(j) })) })
  }
  const setMacro = (i: number, slot: number, id: number) =>
    time.setDraft({
      ...t,
      buttons: f.btns.map((b, j) => ({
        type: b.type,
        macros: j === i ? macros(j).map((m, k) => (k === slot ? id : m)) : macros(j),
      })),
    })
  const add = () => {
    led.setDraft({ ...f, btns: [...f.btns, { pin: -1, type: 2, macros: [0, 0, 0] }] })
    time.setDraft({
      ...t,
      buttons: [...f.btns.map((b, j) => ({ type: b.type, macros: macros(j) })), { type: 2, macros: [0, 0, 0] }],
    })
  }
  const remove = (i: number) => {
    led.setDraft({ ...f, btns: f.btns.filter((_, j) => j !== i) })
    time.setDraft({
      ...t,
      buttons: f.btns.map((b, j) => ({ type: b.type, macros: macros(j) })).filter((_, j) => j !== i),
    })
  }

  const save = () => {
    // the light drops buttons without a pin (except the first), which would move the presets of the ones after
    // them, so they go before either form is sent
    const keep = (i: number) => i === 0 || f.btns[i].pin >= 0
    const hw = { ...f, btns: f.btns.filter((_, i) => keep(i)) }
    const presets = {
      ...t,
      buttons: f.btns.map((b, j) => ({ type: b.type, macros: macros(j) })).filter((_, i) => keep(i)),
    }
    led.setDraft(hw)
    time.setDraft(presets)
    const presetsChanged = JSON.stringify(presets) !== JSON.stringify(time.base)
    hwSaved.current = false
    if (JSON.stringify(hw) !== JSON.stringify(led.base)) {
      next.current = presetsChanged ? timeFields(presets) : null
      ledSaver.save(ledFields(hw, T, info))
    } else {
      next.current = null
      timeSaver.save(timeFields(presets))
    }
  }

  const uses = pinUses(f, T)
  const ownP = ownPins(led.base, T)
  const touch = f.btns.some((b) => isTouch(b.type))
  const touchReads = f.btns
    .map((b, i) => ({ b, i, p: pins?.find((q) => q.p === b.pin && q.o === OWNER.button) }))
    .filter(({ b, p }) => isTouch(b.type) && p?.r !== undefined)

  return (
    <div className="flex flex-col gap-4">
      <PageIntro>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 min-w-0 flex-1 basis-64 text-sm text-muted-foreground">
            Buttons, switches, motion sensors and potentiometers wired to the controller, and what each one does.
          </p>
          <ButtonHelp />
        </div>
      </PageIntro>
      <Section
        title="Buttons"
        action={f.btns.length > 0 && <span className="text-xs text-muted-foreground">Live: press one to test it</span>}
      >
        {f.btns.length === 0 && (
          <p className="m-0 text-sm text-muted-foreground">No buttons. Add one to control the light from it.</p>
        )}
        {f.btns.map((b, i) => {
          const live = liveState(b, led.base!.btns[i], pins, info, f.tt)
          const m = macros(i)
          const n = `Button ${i + 1}`
          const momentary = b.type > 0 && !isAnalogBtn(b.type) && !isSwitchBtn(b.type)
          return (
            <div key={i} className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-input text-[13px] font-bold"
                >
                  {i + 1}
                </span>
                <NativeSelect
                  className="min-w-40 flex-1"
                  value={b.type}
                  aria-label={`${n} type`}
                  onChange={(e) => setHw(i, { type: Number(e.target.value) })}
                >
                  {BUTTON_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
                {pins === null ? (
                  <span className="text-sm text-muted-foreground">Loading pins…</span>
                ) : (
                  <PinPicker
                    pins={pins}
                    own={ownP}
                    used={new Map(uses.filter((u) => u.key !== `b${i}`).map((u) => [u.pin, u.use]))}
                    touch={info.touch}
                    label={`${n} pin`}
                    value={b.pin}
                    onChange={(pin) => setHw(i, { pin })}
                    need={btnNeed(b.type)}
                    none="None"
                    invalid={!!b.type && b.pin < 0}
                  />
                )}
                <span className="flex min-w-24 flex-1 items-center gap-2 text-[12.5px] text-soft">
                  {live?.dot !== undefined && (
                    <span
                      aria-hidden
                      className={cx('size-2 shrink-0 rounded-full', live.dot ? 'bg-primary' : 'bg-input')}
                    />
                  )}
                  {live?.bar !== undefined && (
                    <span aria-hidden className="h-1.5 w-11 overflow-hidden rounded-full bg-input">
                      <span className="block h-full bg-soft" style={{ width: `${live.bar}%` }} />
                    </span>
                  )}
                  {live && (
                    <span className={cx(live.dot === undefined && live.bar === undefined && 'text-muted-foreground')}>
                      {live.text}
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  aria-label={`Remove ${n.toLowerCase()}`}
                  title="Remove"
                  onClick={() => remove(i)}
                >
                  <Trash2 />
                </Button>
              </div>

              {isAnalogBtn(b.type) && (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                  <span className="text-[13px] font-medium text-soft">Turning it controls</span>
                  <NativeSelect
                    className="w-full sm:w-72"
                    aria-label={`${n}: what it controls`}
                    value={m[2]}
                    onChange={(e) => setMacro(i, 2, Number(e.target.value))}
                  >
                    {!ANALOG.some(([v]) => v === m[2]) && <option value={m[2]}>{m[2]}</option>}
                    {ANALOG.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}
              {b.type > 0 && !isAnalogBtn(b.type) && (
                <div className="flex flex-col gap-2">
                  {slots(b.type).map(([label, slot]) => (
                    <div key={slot} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                      <span className="text-[13px] font-medium text-soft">{label}</span>
                      <PresetSelect
                        className="sm:w-72"
                        label={`${n}: ${label.toLowerCase()}`}
                        none="Default action"
                        does={builtIn(i, b.type, slot)}
                        value={m[slot]}
                        onChange={(id) => setMacro(i, slot, id)}
                      />
                    </div>
                  ))}
                </div>
              )}
              {i === 0 && momentary && (
                <p className="m-0 text-xs text-muted-foreground">
                  {m[0] && m.every((x) => x === m[0]) ? (
                    'With the same preset for every press, it runs as soon as the button goes down, and holding it does nothing else.'
                  ) : (
                    <>
                      Whatever the presets, holding this button 5 s and letting go starts the access point. Holding it
                      10 s does a <span className="text-amber-400">factory reset</span>, which erases all settings and
                      presets.
                    </>
                  )}
                </p>
              )}
            </div>
          )
        })}
        {f.btns.length < info.maxBT && (
          <Button variant="outline" className="h-11 w-full border-dashed" onClick={add}>
            <Plus data-icon="inline-start" />
            Add button
          </Button>
        )}
        {touch && (
          <Row
            label="Touch threshold"
            hint={`A reading at or below this counts as a touch.${touchReads.length ? ` Now: ${touchReads.map(({ i, p }) => `button ${i + 1} reads ${p!.r}`).join(', ')}.` : ''}`}
          >
            <NumberInput
              label="Touch threshold"
              min={0}
              max={100}
              value={f.tt}
              invalid={!intIn(f.tt, 0, 100)}
              onChange={(tt) => led.setDraft({ ...f, tt })}
            />
          </Row>
        )}
        <Row label="Internal pull-up and pull-down" hint="Turn off if your buttons have their own resistors.">
          <Switch
            label="Internal pull-up and pull-down"
            on={f.pull}
            onChange={(pull) => led.setDraft({ ...f, pull })}
          />
        </Row>
        {led.dirty && (
          <p className="m-0 text-xs text-muted-foreground">
            Saving a new pin or type briefly restarts the LED outputs.
          </p>
        )}
      </Section>

      <SaveBar
        dirty={led.dirty || time.dirty}
        saving={ledSaver.saving || timeSaver.saving}
        errors={errors}
        onSave={save}
        onDiscard={() => {
          led.discard()
          time.discard()
        }}
      />
      {ledSaver.dialog}
      {timeSaver.dialog}
    </div>
  )
}
