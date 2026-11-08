import { useEffect, useState } from 'react'
import { send } from '../store'
import { useUi } from '../ui'
import { useDraft, useFxMeta, useMedia, WIDE, useSelection } from '../hooks'
import { fromHex, hsvToRgb, kelvinToRgb, rgbCss, rgbToHsv, toHex, type HSV, type RGB } from '../lib/color'
import { ColorControls, HexRow } from './ColorPicker'
import { Card, cx, LabeledSlider } from './controls'

// Which colour slots to show: the effect's metadata decides, but the "* Color" palettes (ids 2-5) need their
// slots, and so does the Default palette: for most effects it means colour 1 (color_from_palette() returns the
// segment's colour on palette 0), even when the metadata declares no colours, e.g. Meteor.
export function visibleSlots(colors: (string | null)[], pal: number, usesPalette: boolean) {
  return colors.map(
    (label, i) => label !== null || (pal > 1 && pal < 6 && pal - 2 >= i) || (pal === 0 && usesPalette && i === 0),
  )
}

export function ColorPanel({ className }: { className?: string }) {
  const { main, hasRGB, hasWhite, hasCCT } = useSelection()
  const meta = useFxMeta(main?.fx)
  const { csel, setCsel } = useUi()
  const wide = useMedia(WIDE)

  const visible = visibleSlots(meta.colors, main?.pal ?? 0, meta.usesPalette)
  useEffect(() => {
    if (!visible[csel]) {
      const first = visible.indexOf(true)
      if (first >= 0) setCsel(first)
    }
  }, [visible, csel, setCsel])

  const slot = main?.col[csel] ?? [0, 0, 0, 0]
  const slotRgb: RGB = { r: slot[0], g: slot[1], b: slot[2] }
  const w = slot[3] ?? 0
  // The picker works in HSV; re-derive it only when the slot's colour really changes, so the hue
  // survives round trips through colours that have none (greys, black).
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(slotRgb))
  const slotKey = `${csel}:${toHex(slotRgb)}`
  const [hsvKey, setHsvKey] = useState(slotKey)
  if (slotKey !== hsvKey) {
    setHsvKey(slotKey)
    if (toHex(hsvToRgb(hsv)) !== toHex(slotRgb)) setHsv(rgbToHsv(slotRgb))
  }
  const rgb = hsvToRgb(hsv)

  const commit = (c: RGB, white = w) => {
    if (!main) return
    const col: number[][] = [[], [], []]
    col[csel] = hasRGB ? [c.r, c.g, c.b, white] : [white, white, white, white]
    send({ seg: { col } })
  }
  const commitHsv = (next: HSV) => {
    setHsv(next)
    commit(hsvToRgb(next))
  }

  const [hex, setHex] = useDraft(toHex(rgb) + (w > 0 ? w.toString(16).padStart(2, '0').toUpperCase() : ''))
  const applyHex = () => {
    const c = fromHex(hex)
    if (!c) {
      setHex(toHex(rgb))
      return
    }
    const hw = parseInt(hex.slice(6, 8), 16)
    setHsv(rgbToHsv(c))
    commit(c, isNaN(hw) ? 0 : hw)
  }

  const pickQuick = (c: RGB) => {
    setHsv(rgbToHsv(c))
    commit(c)
  }

  return (
    <Card className={className}>
      <ColorControls
        title="Color"
        hsv={hsv}
        rgb={hasRGB}
        temperature={!hasCCT}
        wheelSize={wide ? 200 : 220}
        onInput={setHsv}
        onCommitHsv={commitHsv}
        onCommitRgb={commit}
      >
        {(hasWhite || !hasRGB) && (
          <LabeledSlider
            label={hasRGB ? 'White' : 'Brightness'}
            value={w}
            track="linear-gradient(to right, #23262d, #fff)"
            onCommit={(v) => commit(rgb, v)}
          />
        )}
        {hasCCT && main && (
          <LabeledSlider
            label="White balance"
            value={main.cct}
            track={`linear-gradient(to right, ${rgbCss(kelvinToRgb(2700))}, #fff, ${rgbCss(kelvinToRgb(8000))})`}
            onCommit={(cct) => send({ seg: { cct } })}
          />
        )}
      </ColorControls>

      <div className="flex gap-2">
        {[0, 1, 2].map((i) => {
          if (!visible[i]) return null
          const c = main?.col[i] ?? [0, 0, 0, 0]
          const cw = c[3] ?? 0
          const black = !c[0] && !c[1] && !c[2]
          const bg =
            hasRGB && !black
              ? hasWhite && cw > 0
                ? `linear-gradient(180deg, rgb(${c[0]},${c[1]},${c[2]}) 40%, rgb(${cw},${cw},${cw}))`
                : `rgb(${c[0]},${c[1]},${c[2]})`
              : `rgb(${cw},${cw},${cw})`
          return (
            <button
              key={i}
              aria-pressed={csel === i}
              onClick={() => setCsel(i)}
              className={cx(
                'flex h-14 min-w-0 flex-1 flex-col gap-1 rounded-lg border p-1 text-xs',
                csel === i ? 'border-primary ring-3 ring-ring/50' : 'border-border text-muted-foreground',
              )}
            >
              <span className="w-full flex-1 rounded-md" style={{ background: bg }} />
              <span className="truncate">{meta.colors[i] ?? `Color ${i + 1}`}</span>
            </button>
          )
        })}
      </div>

      <HexRow hex={hex} onHex={setHex} onApply={applyHex} onPick={hasRGB ? pickQuick : undefined} digits={8} />
    </Card>
  )
}
