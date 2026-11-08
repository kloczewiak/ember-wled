import { useState } from 'react'
import { accentVars, DEFAULT_ACCENT } from '../lib/accent'
import { fromHex, hsvToRgb, rgbToHsv, toHex, type HSV, type RGB } from '../lib/color'
import { useDraft } from '../hooks'
import { ColorControls, HexRow } from '../components/ColorPicker'
import { Chip, cx, Slider, Switch } from '../components/controls'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'

// Settings → User interface: the accent colour row. Folded it shows the colour; unfolded, the Colour card's
// picker (ColorPicker.tsx, without temperature) with suggested accents instead of the quick colours, and a
// preview.

const SUGGESTED = ['FF9F43', 'EF4444', 'EC4899', 'A855F7', '3B82F6', '22D3EE', '22C55E', 'FACC15']

export function AccentPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false)
  // the picker works in HSV; re-derive it only when the colour really changes, so the hue survives greys
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(fromHex(value)!))
  const [hsvFor, setHsvFor] = useState(value)
  if (value !== hsvFor) {
    setHsvFor(value)
    if (toHex(hsvToRgb(hsv)) !== value) setHsv(rgbToHsv(fromHex(value)!))
  }
  // every change previews at once, while dragging too: unlike the light's colour it's only a CSS variable
  const pickHsv = (next: HSV) => {
    setHsv(next)
    onChange(toHex(hsvToRgb(next)))
  }
  const pickRgb = (c: RGB) => {
    setHsv(rgbToHsv(c))
    onChange(toHex(c))
  }

  const [hex, setHex] = useDraft(value)
  const applyHex = () => {
    const c = fromHex(hex)
    if (c && hex.length === 6) pickRgb(c)
    else setHex(value)
  }

  const adjusted = accentVars(fromHex(value)!).adjusted

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm">Accent colour</div>
          <div className="text-xs text-muted-foreground">Buttons, switches, sliders and selected chips.</div>
        </div>
        <span className="size-5 shrink-0 rounded-full border" style={{ background: `#${value}` }} />
        <span className="font-mono text-xs text-muted-foreground">#{value}</span>
        <ChevronDown
          className={cx('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <>
          {/* every change previews at once, while dragging too */}
          <ColorControls
            hsv={hsv}
            temperature={false}
            wheelSize={200}
            onInput={pickHsv}
            onCommitHsv={pickHsv}
            onCommitRgb={pickRgb}
          />
          <HexRow
            hex={hex}
            onHex={setHex}
            onApply={applyHex}
            onPick={pickRgb}
            label="Accent colour (RRGGBB)"
            swatches={SUGGESTED.map((q) => `#${q}`)}
            random={false}
            pressed={`#${value}`}
            applyOnBlur
            extra={
              <Button
                variant="outline"
                onClick={() => pickRgb(fromHex(DEFAULT_ACCENT)!)}
                disabled={value === DEFAULT_ACCENT}
              >
                Reset to orange
              </Button>
            }
          />
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
        <Chip on onClick={() => {}}>
          On
        </Chip>
        <Chip on={false} onClick={() => {}}>
          Off
        </Chip>
        <Switch on={sw} onChange={setSw} label="Sample switch" />
        <Slider label="Sample slider" value={level} onCommit={setLevel} className="min-w-20 flex-1" />
        <Button>Button</Button>
      </div>
    </div>
  )
}
