import { useState } from 'react'
import { accentVars, DEFAULT_ACCENT } from '../lib/accent'
import { fromHex, hsvToRgb, rgbCss, rgbToHsv, toHex, type HSV, type RGB } from '../lib/color'
import { useDraft } from '../hooks'
import { ColorWheel } from '../components/ColorWheel'
import { Chip, cx, Icon, LabeledSlider, Slider, Switch } from '../components/controls'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronDown } from 'lucide-react'

// Settings → User interface: the accent colour row. Folded it shows the colour; unfolded, the same picker
// as the Colour card (without white and temperature) plus a few suggested accents and a preview.

const SUGGESTED = ['FF9F43', 'EF4444', 'EC4899', 'A855F7', '3B82F6', '22D3EE', '22C55E', 'FACC15']
const HUE_TRACK = 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'

export function AccentPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('wheel')
  // the picker works in HSV; re-derive it only when the colour really changes, so the hue survives greys
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(fromHex(value)!))
  const [hsvFor, setHsvFor] = useState(value)
  if (value !== hsvFor) {
    setHsvFor(value)
    if (toHex(hsvToRgb(hsv)) !== value) setHsv(rgbToHsv(fromHex(value)!))
  }
  const rgb = hsvToRgb(hsv)
  // every change previews at once, while dragging too: unlike the light's colour it's only a CSS variable
  const pickHsv = (next: HSV) => { setHsv(next); onChange(toHex(hsvToRgb(next))) }
  const pickRgb = (c: RGB) => { setHsv(rgbToHsv(c)); onChange(toHex(c)) }

  const [hex, setHex] = useDraft(value)
  const applyHex = () => { const c = fromHex(hex); if (c && hex.length === 6) pickRgb(c); else setHex(value) }

  const adjusted = accentVars(fromHex(value)!).adjusted
  const pure = hsvToRgb({ h: hsv.h, s: hsv.s, v: 100 })

  return (
    <div className="flex flex-col gap-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="text-sm">Accent colour</div>
          <div className="text-xs text-muted-foreground">Buttons, switches, sliders and selected chips.</div>
        </div>
        <span className="size-5 shrink-0 rounded-full border" style={{ background: `#${value}` }} />
        <span className="font-mono text-xs text-muted-foreground">#{value}</span>
        <ChevronDown className={cx('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <>
          <Tabs value={mode} onValueChange={(m) => setMode(m as string)} className="gap-3">
            <TabsList aria-label="Accent colour controls" className="self-end">
              <TabsTrigger value="wheel">Wheel</TabsTrigger>
              <TabsTrigger value="hsv">HSV</TabsTrigger>
              <TabsTrigger value="rgb">RGB</TabsTrigger>
            </TabsList>
            <TabsContent value="wheel" className="flex justify-center py-1">
              <ColorWheel hsv={hsv} size={200} onChange={pickHsv} onCommit={pickHsv} />
            </TabsContent>
            <TabsContent value="hsv" className="flex flex-col gap-3">
              <LabeledSlider label="Hue" value={Math.round(hsv.h)} max={359} track={HUE_TRACK} display={`${Math.round(hsv.h)}°`}
                onInput={(h) => pickHsv({ ...hsv, h })} onCommit={(h) => pickHsv({ ...hsv, h })} />
              <LabeledSlider label="Saturation" value={Math.round(hsv.s)} max={100} track={`linear-gradient(to right, #aaa, ${rgbCss(hsvToRgb({ h: hsv.h, s: 100, v: 100 }))})`}
                display={`${Math.round(hsv.s)}%`} onInput={(s) => pickHsv({ ...hsv, s })} onCommit={(s) => pickHsv({ ...hsv, s })} />
            </TabsContent>
            <TabsContent value="rgb" className="flex flex-col gap-3">
              {(['r', 'g', 'b'] as const).map((k) => (
                <LabeledSlider key={k} label={{ r: 'Red', g: 'Green', b: 'Blue' }[k]} value={rgb[k]}
                  track={`linear-gradient(to right, ${rgbCss({ ...rgb, [k]: 0 })}, ${rgbCss({ ...rgb, [k]: 255 })})`}
                  onInput={(v) => pickRgb({ ...rgb, [k]: v })} onCommit={(v) => pickRgb({ ...rgb, [k]: v })} />
              ))}
            </TabsContent>
            <LabeledSlider label="Value" value={Math.round(hsv.v)} max={100} track={`linear-gradient(to right, #000, ${rgbCss(pure)})`}
              display={`${Math.round(hsv.v)}%`} onInput={(v) => pickHsv({ ...hsv, v })} onCommit={(v) => pickHsv({ ...hsv, v })} />
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <form className="flex min-w-36 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); applyHex() }}>
              <InputGroup>
                <InputGroupAddon><InputGroupText className="font-mono">#</InputGroupText></InputGroupAddon>
                <InputGroupInput value={hex} placeholder="RRGGBB" className="font-mono" aria-label="Accent colour (RRGGBB)"
                  onChange={(e) => setHex(e.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 6).toUpperCase())} onBlur={applyHex} />
              </InputGroup>
              <Button type="submit" variant="outline" size="icon" aria-label="Apply accent colour"><Icon.check /></Button>
            </form>
            <Button variant="outline" onClick={() => pickRgb(fromHex(DEFAULT_ACCENT)!)} disabled={value === DEFAULT_ACCENT}>Reset to orange</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.map((q) => (
              <button key={q} type="button" aria-label={`Accent #${q}`} aria-pressed={value === q} onClick={() => pickRgb(fromHex(q)!)}
                className="size-7 rounded-full border aria-pressed:ring-2 aria-pressed:ring-foreground aria-pressed:ring-offset-2 aria-pressed:ring-offset-card" style={{ background: `#${q}` }} />
            ))}
          </div>
          {/* always there, so the layout doesn't jump while dragging across the adjusted range */}
          <p className="m-0 text-xs text-muted-foreground">
            {adjusted
              ? `Shown slightly ${adjusted} so it stays visible and text on it stays readable.`
              : 'Very dark and very pale colours are adjusted so text on them stays readable.'}
          </p>
          <Preview />
        </>
      )}
    </div>
  )
}

// Sample controls in the accent colour; they don't change anything.
function Preview() {
  const [sw, setSw] = useState(true)
  const [level, setLevel] = useState(150)
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Preview</div>
      <div className="flex flex-wrap items-center gap-3">
        <Chip on onClick={() => {}}>On</Chip>
        <Chip on={false} onClick={() => {}}>Off</Chip>
        <Switch on={sw} onChange={setSw} label="Sample switch" />
        <Slider label="Sample slider" value={level} onCommit={setLevel} className="min-w-20 flex-1" />
        <Button>Button</Button>
      </div>
    </div>
  )
}
