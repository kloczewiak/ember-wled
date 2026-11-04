import { Switch } from '../components/controls'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { NumberInput, PresetSelect, Row, SaveBar, Section } from './shared'
import { ledFields, pageErrors, summary, typeLookup, useLedForm, validate, type LedForm } from './leds'

// Settings → Defaults: the "General settings" half of the firmware's LED page in WLED v16.0.1
// (data/settings_leds.htm): power-up, transitions, random palettes, the timer's defaults, palette wrapping and
// the refresh rate. It saves through the same form as LED and hardware, so it sends that page's values too.

const TIMER_MODES = ['Wait and set', 'Fade', 'Fade colour', 'Sunrise']
const WRAPPING = ['Linear (wrap if moving)', 'Linear (always wrap)', 'Linear (never wrap)', 'None (not recommended)']

export function DefaultsSettings() {
  const { draft: f, setDraft, dirty, discard, error, retry, info, save, saving, dialog } = useLedForm()

  if (error && !f) return <p className="text-sm text-muted-foreground">Couldn't load the settings. <Button variant="link" onClick={retry}>Try again</Button></p>
  if (info === null) return <p className="text-sm text-muted-foreground">Couldn't read the light's LED types. <Button variant="link" onClick={() => location.reload()}>Try again</Button></p>
  if (!f || !info) return <p className="text-sm text-muted-foreground">Loading settings…</p>

  const T = typeLookup(info)
  const v = validate(f, T, info, summary(f, T, info))
  const errors = pageErrors(v.defaults, v.leds, 'LED and hardware')
  const set = (p: Partial<LedForm>) => setDraft({ ...f, ...p })
  const setNl = (p: Partial<LedForm['nl']>) => set({ nl: { ...f.nl, ...p } })

  return (
    <div className="flex flex-col gap-4">
      <Section title="Power up">
        <Row label="Turn on after power up or reset"><Switch label="Turn on after power up or reset" on={f.on} onChange={(on) => set({ on })} /></Row>
        <Row label="Brightness at boot"><NumberInput label="Brightness at boot" min={1} max={255} value={f.bri} onChange={(bri) => set({ bri })} /></Row>
        <Row label="Preset at boot" stack><PresetSelect label="Preset at boot" none="None" value={f.ps} onChange={(ps) => set({ ps })} /></Row>
      </Section>

      <Section title="Transitions">
        <Row label="Default transition time"><NumberInput label="Default transition time" unit="ms" min={0} max={65500} value={f.td} onChange={(td) => set({ td })} /></Row>
      </Section>

      <Section title="Random palettes">
        <Row label="Use harmonic colours"><Switch label="Use harmonic colours" on={f.hrp} onChange={(hrp) => set({ hrp })} /></Row>
        <Row label="Cycle time"><NumberInput label="Random palette cycle time" unit="s" min={1} max={255} value={f.rpc} onChange={(rpc) => set({ rpc })} /></Row>
      </Section>

      <Section title="Timer">
        <p className="m-0 text-xs text-muted-foreground">What the timer in the header does when it's turned on.</p>
        <Row label="Duration"><NumberInput label="Timer duration" unit="min" min={1} max={255} value={f.nl.dur} onChange={(dur) => setNl({ dur })} /></Row>
        <Row label="Target brightness"><NumberInput label="Timer target brightness" min={0} max={255} value={f.nl.tbri} onChange={(tbri) => setNl({ tbri })} /></Row>
        <Row label="Mode">
          <NativeSelect className="w-44" value={f.nl.mode} aria-label="Timer mode" onChange={(e) => setNl({ mode: Number(e.target.value) })}>
            {TIMER_MODES.map((l, v) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </Row>
      </Section>

      <Section title="Advanced">
        <Row label="Palette wrapping" stack>
          <NativeSelect className="w-full" value={f.pb} aria-label="Palette wrapping" onChange={(e) => set({ pb: Number(e.target.value) })}>
            {WRAPPING.map((l, v) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </Row>
        <Row label="Target refresh rate" hint="0 is unlimited.">
          <NumberInput label="Target refresh rate" unit="FPS" min={0} max={250} value={f.fps} onChange={(fps) => set({ fps })} />
        </Row>
        {(f.fps === 0 || f.fps >= 80) && (
          <p className="m-0 text-xs text-amber-500">
            {f.fps === 0 ? 'Unlimited FPS mode is experimental.' : 'High FPS mode is experimental.'}{' '}
            Back up the configuration and presets first (<a href="#settings/sec">Security and updates</a>).
          </p>
        )}
      </Section>

      <SaveBar dirty={dirty} saving={saving} errors={errors} onSave={() => save(ledFields(f, T, info))} onDiscard={discard} />
      {dialog}
    </div>
  )
}
