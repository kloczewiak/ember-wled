import { useEffect, useState } from 'react'
import { send } from '../store'
import { useUi } from '../ui'
import { useDraft, useFxMeta, useMedia, useSelection } from '../hooks'
import { fromHex, hsvToRgb, kelvinToRgb, rgbCss, rgbToHsv, rgbToKelvin, toHex, type HSV, type RGB } from '../lib/color'
import { ColorWheel } from './ColorWheel'
import { Card, cx, Icon, LabeledSlider, SectionTitle } from './controls'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const QUICK = ['#ff0000', '#ffa000', '#ffc800', '#ffe0a0', '#ffffff', '#000000', '#ff00ff', '#0000ff', '#00ffc8', '#08ff00']
const KELVIN_TRACK = `linear-gradient(to right, ${[1900, 3000, 4500, 6500, 8000, 10091].map((k) => rgbCss(kelvinToRgb(k))).join(',')})`
const HUE_TRACK = 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'

// Which colour slots to show: the effect's metadata decides, but the "* Color" palettes (ids 2-5) need their slots.
export function visibleSlots(colors: (string | null)[], pal: number) {
  return colors.map((label, i) => label !== null || (pal > 1 && pal < 6 && pal - 2 >= i))
}

export function ColorPanel({ className }: { className?: string }) {
  const { main, hasRGB, hasWhite, hasCCT } = useSelection()
  const meta = useFxMeta(main?.fx)
  const { csel, setCsel, colorMode, setColorMode } = useUi()
  const wide = useMedia('(min-width: 1100px)')

  const visible = visibleSlots(meta.colors, main?.pal ?? 0)
  useEffect(() => {
    if (!visible[csel]) { const first = visible.indexOf(true); if (first >= 0) setCsel(first) }
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
    if (next.v === 0 && hsv.v === 0) next = { ...next, v: 100 } // picking on a black slot: make it visible
    setHsv(next)
    commit(hsvToRgb(next))
  }

  const [hex, setHex] = useDraft(toHex(rgb) + (w > 0 ? w.toString(16).padStart(2, '0').toUpperCase() : ''))
  const applyHex = () => {
    const c = fromHex(hex)
    if (!c) { setHex(toHex(rgb)); return }
    const hw = parseInt(hex.slice(6, 8), 16)
    setHsv(rgbToHsv(c))
    commit(c, isNaN(hw) ? 0 : hw)
  }

  const pickQuick = (q: string) => {
    let c = fromHex(q)!
    if (q === 'random') c = hsvToRgb({ h: Math.random() * 360, s: 50 + Math.random() * 50, v: 100 })
    setHsv(rgbToHsv(c))
    commit(c)
  }

  const pure = hsvToRgb({ h: hsv.h, s: hsv.s, v: 100 })
  const kelvin = rgbToKelvin(rgb)

  return (
    <Card className={className}>
      <Tabs value={colorMode} onValueChange={(m) => setColorMode(m as typeof colorMode)} className="gap-3">
        <SectionTitle
          right={hasRGB && (
            <TabsList aria-label="Color controls">
              <TabsTrigger value="wheel">Wheel</TabsTrigger>
              <TabsTrigger value="hsv">HSV</TabsTrigger>
              <TabsTrigger value="rgb">RGB</TabsTrigger>
            </TabsList>
          )}
        >
          Color
        </SectionTitle>

        {hasRGB && (
          <TabsContent value="wheel" className="flex justify-center py-1">
            <ColorWheel hsv={hsv} size={wide ? 200 : 220} onChange={setHsv} onCommit={commitHsv} />
          </TabsContent>
        )}

        <div className="flex flex-col gap-3">
          {hasRGB && (
            <TabsContent value="hsv" className="flex flex-col gap-3">
              <LabeledSlider label="Hue" value={Math.round(hsv.h)} max={359} track={HUE_TRACK} display={`${Math.round(hsv.h)}°`}
                onInput={(h) => setHsv({ ...hsv, h })} onCommit={(h) => commitHsv({ ...hsv, h })} />
              <LabeledSlider label="Saturation" value={Math.round(hsv.s)} max={100} track={`linear-gradient(to right, #aaa, ${rgbCss(hsvToRgb({ h: hsv.h, s: 100, v: 100 }))})`}
                display={`${Math.round(hsv.s)}%`} onInput={(s) => setHsv({ ...hsv, s })} onCommit={(s) => commitHsv({ ...hsv, s })} />
            </TabsContent>
          )}
          {hasRGB && (
            <TabsContent value="rgb" className="flex flex-col gap-3">
              {(['r', 'g', 'b'] as const).map((k) => (
                <LabeledSlider key={k} label={{ r: 'Red', g: 'Green', b: 'Blue' }[k]} value={rgb[k]}
                  track={`linear-gradient(to right, ${rgbCss({ ...rgb, [k]: 0 })}, ${rgbCss({ ...rgb, [k]: 255 })})`}
                  onInput={(v) => setHsv(rgbToHsv({ ...rgb, [k]: v }))} onCommit={(v) => commit({ ...rgb, [k]: v })} />
              ))}
            </TabsContent>
          )}
          {hasRGB && (
            <LabeledSlider label="Value" value={Math.round(hsv.v)} max={100} track={`linear-gradient(to right, #000, ${rgbCss(pure)})`}
              display={`${Math.round(hsv.v)}%`} onInput={(v) => setHsv({ ...hsv, v })} onCommit={(v) => commitHsv({ ...hsv, v })} />
          )}
          {hasRGB && !hasCCT && (
            <LabeledSlider label="Temperature" value={Math.min(10091, Math.max(1900, kelvin))} min={1900} max={10091} track={KELVIN_TRACK}
              display={`${Math.round(kelvin / 100) * 100}K`}
              onInput={(k) => setHsv(rgbToHsv(kelvinToRgb(k)))} onCommit={(k) => { const c = kelvinToRgb(k); setHsv(rgbToHsv(c)); commit(c) }} />
          )}
          {(hasWhite || !hasRGB) && (
            <LabeledSlider label={hasRGB ? 'White' : 'Brightness'} value={w} track="linear-gradient(to right, #23262d, #fff)"
              onCommit={(v) => commit(rgb, v)} />
          )}
          {hasCCT && main && (
            <LabeledSlider label="White balance" value={main.cct} track={`linear-gradient(to right, ${rgbCss(kelvinToRgb(2700))}, #fff, ${rgbCss(kelvinToRgb(8000))})`}
              onCommit={(cct) => send({ seg: { cct } })} />
          )}
        </div>
      </Tabs>

      <div className="flex gap-2">
        {[0, 1, 2].map((i) => {
          if (!visible[i]) return null
          const c = main?.col[i] ?? [0, 0, 0, 0]
          const cw = c[3] ?? 0
          const black = !c[0] && !c[1] && !c[2]
          const bg = hasRGB && !black
            ? (hasWhite && cw > 0 ? `linear-gradient(180deg, rgb(${c[0]},${c[1]},${c[2]}) 40%, rgb(${cw},${cw},${cw}))` : `rgb(${c[0]},${c[1]},${c[2]})`)
            : `rgb(${cw},${cw},${cw})`
          return (
            <button
              key={i}
              aria-pressed={csel === i}
              onClick={() => setCsel(i)}
              className={cx('flex h-14 min-w-0 flex-1 flex-col gap-1 rounded-lg border p-1 text-xs', csel === i ? 'border-primary ring-3 ring-ring/50' : 'border-border text-muted-foreground')}
            >
              <span className="w-full flex-1 rounded-md" style={{ background: bg }} />
              <span className="truncate">{meta.colors[i] ?? `Color ${i + 1}`}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form className="flex min-w-36 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); applyHex() }}>
          <InputGroup>
            <InputGroupAddon><InputGroupText className="font-mono">#</InputGroupText></InputGroupAddon>
            <InputGroupInput
              value={hex}
              placeholder="RRGGBB"
              // strip "#" and anything else before limiting the length, so a pasted "#RRGGBBWW" keeps all 8 digits
              onChange={(e) => setHex(e.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase())}
              aria-label="Hex color (RRGGBB or RRGGBBWW)"
              className="font-mono"
            />
          </InputGroup>
          <Button type="submit" variant="outline" size="icon" aria-label="Apply hex color"><Icon.check /></Button>
        </form>
        {hasRGB && (
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button key={q} aria-label={`Set color ${q}`} onClick={() => pickQuick(q)} className="size-7 rounded-full border" style={{ background: q }} />
            ))}
            <button aria-label="Random color" onClick={() => pickQuick('random')}
              className="flex size-7 items-center justify-center rounded-full border"
              style={{ background: HUE_TRACK }}>
              <Icon.dice className="size-4 text-black/70" />
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}
