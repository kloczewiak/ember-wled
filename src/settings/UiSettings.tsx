import { useRef } from 'react'
import { toast } from '../store'
import { readStockUiCfg, writeStockUiCfg, type Json } from '../ui'
import { Switch } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useCfgForm } from './config'
import { FieldError, Row, SaveBar, Section, useLeaveGuard, useSaver } from './shared'

// Settings → User interface, with the same options as the firmware's page (data/settings_ui.htm):
// the device name and simplified UI are stored on the light, everything else in this browser (wledUiCfg).

type Form = { name: string; sui: boolean; ui: Json }

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
  const { base: loaded, draft, setDraft, dirty, discard, error, retry } =
    useCfgForm((c): Form => ({ name: c.id.name, sui: c.id.sui, ui: readStockUiCfg() }))
  useLeaveGuard(dirty)
  // browser settings are read when the app starts, so reload after saving (the stock page asks you to refresh)
  const { save, saving, dialog } = useSaver('ui', () => location.reload())
  // the image chosen before turning on "random image", restored when it's turned off again (like oldUrl)
  const oldUrl = useRef('')
  const cssFile = useRef<HTMLInputElement>(null)
  const holidaysFile = useRef<HTMLInputElement>(null)

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
    if (JSON.stringify(draft.ui) !== JSON.stringify(loaded.ui)) {
      try { writeStockUiCfg(draft.ui) } catch { toast('Couldn\'t save to this browser\'s storage.', true); return }
    }
    // like the stock page, only post to the light when its own settings changed
    if (deviceChanged) save([['DS', draft.name], ...(draft.sui ? [['SU', 'on'] as [string, string]] : [])])
    else { toast('Settings saved'); location.reload() }
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
        <Row label="Power button preset for on" hint="0 turns the light on normally.">{num('comp.on', 0, 250, 1)}</Row>
        <Row label="Power button preset for off" hint="0 turns the light off normally.">{num('comp.off', 0, 250, 1)}</Row>
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

      <SaveBar dirty={dirty} saving={saving} error={errors[0]} onSave={onSave} onDiscard={discard} />
      <FieldError>{errors.length > 1 ? errors.slice(1).join(' ') : undefined}</FieldError>
      {dialog}
    </div>
  )
}
