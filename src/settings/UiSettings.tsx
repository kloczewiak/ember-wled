import { useEffect, useRef } from 'react'
import { refresh, toast } from '../store'
import { readStockUiCfg, showAccent, useUi, type Json } from '../ui'
import { Switch } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useCfgForm } from './config'
import { AccentPicker } from './AccentPicker'
import { PresetSelect, Row, SaveBar, Section, useLeaveGuard, useSaver } from './shared'

// Settings → User interface, with the same options as the firmware's page (data/settings_ui.htm):
// the device name and simplified UI are stored on the light, everything else in this browser (wledUiCfg),
// plus this UI's own options (also in this browser): the accent colour and accurate Peek.

type Form = { name: string; sui: boolean; ui: Json; accent: string; accuratePeek: boolean }

const get = (o: Json, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v as Json)?.[k], o)
function set(o: Json, path: string, value: unknown): Json {
  const [k, ...rest] = path.split('.')
  return { ...o, [k]: rest.length ? set((o[k] as Json) ?? {}, rest.join('.'), value) : value }
}

// Uploads a file to the light's filesystem, like the stock page's uploadFile() (common.js).
async function upload(file: File, path: string) {
  const data = new FormData()
  data.append('data', file, path)
  const res = await fetch('/upload', { method: 'POST', body: data }).catch(() => null)
  toast(res?.ok ? 'File uploaded' : 'Upload failed', !res?.ok)
}

const RANDOM_BG = 'https://picsum.photos/1920/1080'

export function UiSettings() {
  const { base: loaded, draft, setDraft, dirty, discard, error, retry, reloadAfterSave } =
    useCfgForm((c): Form => ({ name: c.id.name, sui: c.id.sui, ui: readStockUiCfg(), accent: useUi.getState().accent, accuratePeek: useUi.getState().accuratePeek }))
  useLeaveGuard(dirty)
  // after saving the light's settings: fetch fresh info (the header shows the device name) and re-read the form
  const { save, saving, dialog } = useSaver('ui', () => { refresh(); reloadAfterSave() })
  // the image chosen before turning on "random image", restored when it's turned off again (like oldUrl)
  const oldUrl = useRef('')
  const cssFile = useRef<HTMLInputElement>(null)
  const holidaysFile = useRef<HTMLInputElement>(null)
  // the page shows the accent being edited; leaving goes back to the saved one
  const accent = draft?.accent
  useEffect(() => { if (accent) showAccent(accent) }, [accent])
  useEffect(() => () => showAccent(useUi.getState().accent), [])

  if (error && !draft) return <p className="text-sm text-muted-foreground">Couldn't load the settings. <Button variant="link" onClick={retry}>Try again</Button></p>
  if (!draft || !loaded) return <p className="text-sm text-muted-foreground">Loading settings…</p>

  const ui = draft.ui
  const setUi = (path: string, value: unknown) => setDraft({ ...draft, ui: set(ui, path, value) })
  const bool = (path: string, label: string, hint?: string) => (
    <Row label={label} hint={hint}><Switch on={get(ui, path) === true} label={label} onChange={(v) => setUi(path, v)} /></Row>
  )
  const num = (path: string, min: number, max: number, step: number) => {
    const v = get(ui, path)
    return <Input className="w-24" type="number" min={min} max={max} step={step} value={String(v ?? '')}
      onChange={(e) => setUi(path, e.target.value === '' ? '' : Number(e.target.value))} />
  }

  // the same limits as the stock page's inputs
  const inRange = (path: string, min: number, max: number, int: boolean) => {
    const v = get(ui, path)
    return typeof v === 'number' && v >= min && v <= max && (!int || Number.isInteger(v))
  }
  const errors = [
    !inRange('comp.on', 0, 250, true) && 'Power-on preset must be a whole number from 0 to 250.',
    !inRange('comp.off', 0, 250, true) && 'Power-off preset must be a whole number from 0 to 250.',
    !inRange('theme.alpha.tab', 0, 1, false) && 'Button opacity must be between 0 and 1.',
    !inRange('theme.alpha.bg', 0, 1, false) && 'Background opacity must be between 0 and 1.',
  ].filter(Boolean) as string[]

  const random = get(ui, 'theme.bg.rnd') === true
  const bgUrl = String(get(ui, 'theme.bg.url') ?? '')
  const randomUrl = (rnd: Json) => {
    let url = RANDOM_BG
    if (rnd.rndGrayscale) url += '?grayscale'
    if (rnd.rndBlur) url += (url.includes('?') ? '&' : '?') + 'blur'
    return url
  }
  const setBg = (patch: Json) => {
    const bg = { ...(get(ui, 'theme.bg') as Json), ...patch }
    setUi('theme.bg', bg.rnd ? { ...bg, url: randomUrl(bg) } : bg)
  }

  const onSave = async () => {
    const deviceChanged = draft.name !== loaded.name || draft.sui !== loaded.sui
    // browser settings are stored and applied at once (the panels read them from the UI store)
    try {
      if (JSON.stringify(draft.ui) !== JSON.stringify(loaded.ui)) useUi.getState().setStockCfg(draft.ui)
      if (draft.accuratePeek !== loaded.accuratePeek) useUi.getState().setAccuratePeek(draft.accuratePeek)
      if (draft.accent !== loaded.accent) useUi.getState().setAccent(draft.accent)
    } catch { toast('Couldn\'t save to this browser\'s storage.', true); return }
    // like the stock page, only post to the light when its own settings changed
    if (deviceChanged) save([['DS', draft.name], ...(draft.sui ? [['SU', 'on'] as [string, string]] : [])])
    else { toast('Settings saved'); reloadAfterSave() }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="On this light">
        <Row label="Device name" stack>
          <Input maxLength={32} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Device name" />
        </Row>
        <Row label="Simplified UI" hint="Used by the stock WLED interface.">
          <Switch on={draft.sui} label="Simplified UI" onChange={(sui) => setDraft({ ...draft, sui })} />
        </Row>
      </Section>

      <Section title={<span className="flex items-center gap-2">In this browser <Badge variant="outline">Used here</Badge></span>}>
        <p className="m-0 text-xs text-muted-foreground">Stored in this browser for this address only. Set them again on another browser, device or IP address.</p>
        {bool('comp.pid', 'Show preset IDs')}
        {bool('comp.idsort', 'Sort presets by ID')}
        {bool('comp.fxdef', 'Use effect default parameters')}
        {bool('comp.seglen', 'Set segment length instead of stop LED')}
        {bool('comp.segpwr', 'Hide segment power and brightness')}
        {bool('comp.segexp', 'Always expand first segment')}
        <Row label="Power button preset for on" stack>
          <PresetSelect label="Power button preset for on" none="Turn the light on" value={Number(get(ui, 'comp.on'))} onChange={(v) => setUi('comp.on', v)} />
        </Row>
        <Row label="Power button preset for off" stack>
          <PresetSelect label="Power button preset for off" none="Turn the light off" value={Number(get(ui, 'comp.off'))} onChange={(v) => setUi('comp.off', v)} />
        </Row>
        <AccentPicker value={draft.accent} onChange={(accent) => setDraft({ ...draft, accent })} />
        <Row
          label="Accurate Peek colours"
          hint="Peek shows the colours as the LEDs really get them, with the light's gamma correction, brightness and current limit, so the steps you see on the strip at low brightness show here too. Brightness is evened out, so dim colours stay visible."
        >
          <Switch on={draft.accuratePeek} label="Accurate Peek colours" onChange={(accuratePeek) => setDraft({ ...draft, accuratePeek })} />
        </Row>
      </Section>

      <Section title={<span className="flex items-center gap-2">In this browser <Badge variant="outline">Stock UI only</Badge></span>}>
        <p className="m-0 text-xs text-muted-foreground">These only change the stock WLED interface.</p>
        {bool('comp.labels', 'Show button labels')}
        {bool('comp.pcmbot', 'Show bottom tab bar in PC mode')}
        <div className="text-xs font-medium text-muted-foreground">Color selection methods</div>
        {bool('comp.colors.picker', 'Color wheel')}
        {bool('comp.colors.rgb', 'RGB sliders')}
        {bool('comp.colors.quick', 'Quick color selectors')}
        {bool('comp.colors.hex', 'HEX color input')}
        <Row label="Light mode"><Switch on={get(ui, 'theme.base') === 'light'} label="Light mode" onChange={(v) => setUi('theme.base', v ? 'light' : 'dark')} /></Row>
        <Row label="Button opacity">{num('theme.alpha.tab', 0, 1, 0.01)}</Row>
        {bool('comp.css', 'Enable custom CSS')}
        <Row label="Custom CSS file" hint="Uploaded as skin.css">
          <input ref={cssFile} type="file" accept=".css" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], '/skin.css')} />
          <Button variant="outline" onClick={() => cssFile.current?.click()}>Upload</Button>
        </Row>
        <div className="text-xs font-medium text-muted-foreground">Background</div>
        <Row label="Background opacity">{num('theme.alpha.bg', 0, 1, 0.01)}</Row>
        <Row label="Background color" hint="HEX, e.g. #000000">
          <Input className="w-32 font-mono" maxLength={9} value={String(get(ui, 'theme.color.bg') ?? '')} onChange={(e) => setUi('theme.color.bg', e.target.value)} />
        </Row>
        <Row label="Background image">
          <div className="flex gap-2">
            <label className="contents">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => setBg({ url: String(reader.result), rnd: false })
                reader.readAsDataURL(file)
              }} />
              <Button variant="outline" nativeButton={false} render={<span />}>Choose</Button>
            </label>
            <Button variant="outline" onClick={() => setBg({ url: '', rnd: false })}>Remove</Button>
          </div>
        </Row>
        <Row label="Random image" hint="From picsum.photos">
          <Switch on={random} label="Random image" onChange={(rnd) => {
            if (rnd) oldUrl.current = bgUrl
            setBg(rnd ? { rnd } : { rnd, url: oldUrl.current })
          }} />
        </Row>
        {random ? (
          <>
            {bool('theme.bg.rndGrayscale', 'Grayscale')}
            {bool('theme.bg.rndBlur', 'Blur')}
          </>
        ) : !bgUrl.startsWith('data:') && (
          <Row label="Image URL" stack>
            <Input value={bgUrl} onChange={(e) => setUi('theme.bg.url', e.target.value)} aria-label="Image URL" />
          </Row>
        )}
        {bool('comp.hdays', 'Enable custom holidays list')}
        <Row label="Holidays file" hint="Uploaded as holidays.json">
          <input ref={holidaysFile} type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], '/holidays.json')} />
          <Button variant="outline" onClick={() => holidaysFile.current?.click()}>Upload</Button>
        </Row>
      </Section>

      <Section title="Cache">
        <Row label="Clear local storage" hint="Removes cached presets and palettes. They're downloaded again on the next load.">
          <Button variant="outline" onClick={() => {
            for (const k of ['wledP', 'wledPmt', 'wledPalx', 'wledUiPalx']) localStorage.removeItem(k)
            toast('Cleared')
          }}>Clear</Button>
        </Row>
      </Section>

      <SaveBar dirty={dirty} saving={saving} errors={errors} onSave={onSave} onDiscard={discard} />
      {dialog}
    </div>
  )
}
