import type { ReactNode } from 'react'
import { useUi } from '../ui'
import { fromHex, hsvToRgb, kelvinToRgb, rgbCss, rgbToHsv, rgbToKelvin, type HSV, type RGB } from '../lib/color'
import { ColorWheel } from './ColorWheel'
import { Icon, LabeledSlider, SectionTitle } from './controls'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// The colour picker of the Colour card, shared with the palette editor so both work the same: Wheel, HSV and
// RGB tabs, Value and Temperature, then a hex field and quick colours. The tab choice is remembered for both.

export const QUICK = [
  '#ff0000',
  '#ffa000',
  '#ffc800',
  '#ffe0a0',
  '#ffffff',
  '#000000',
  '#ff00ff',
  '#0000ff',
  '#00ffc8',
  '#08ff00',
]
const KELVIN_TRACK = `linear-gradient(to right, ${[1900, 3000, 4500, 6500, 8000, 10091].map((k) => rgbCss(kelvinToRgb(k))).join(',')})`
export const HUE_TRACK = 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'

// The tabs, wheel and sliders. `onInput` follows a drag, the commits happen when it ends; RGB and Temperature
// commit the exact RGB they produce. `children` are extra sliders below these (white, white balance).
// Without `rgb` (a white-only light) only the title and the extra sliders show; without a title the tabs sit
// on their own, on the right.
export function ColorControls({
  title,
  hsv,
  onInput,
  onCommitHsv,
  onCommitRgb,
  rgb: hasRGB = true,
  temperature = true,
  wheelSize,
  children,
}: {
  title?: ReactNode
  hsv: HSV
  onInput: (hsv: HSV) => void
  onCommitHsv: (hsv: HSV) => void
  onCommitRgb: (rgb: RGB) => void
  rgb?: boolean
  temperature?: boolean
  wheelSize: number
  children?: ReactNode
}) {
  const { colorMode, setColorMode } = useUi()
  const rgb = hsvToRgb(hsv)
  const pure = hsvToRgb({ h: hsv.h, s: hsv.s, v: 100 })
  const kelvin = rgbToKelvin(rgb)
  const tabs = (
    <TabsList aria-label="Color controls">
      <TabsTrigger value="wheel">Wheel</TabsTrigger>
      <TabsTrigger value="hsv">HSV</TabsTrigger>
      <TabsTrigger value="rgb">RGB</TabsTrigger>
    </TabsList>
  )

  return (
    <Tabs value={colorMode} onValueChange={(m) => setColorMode(m as typeof colorMode)} className="gap-3">
      {title === undefined ? (
        hasRGB && <div className="flex justify-end">{tabs}</div>
      ) : (
        <SectionTitle right={hasRGB && tabs}>{title}</SectionTitle>
      )}

      {hasRGB && (
        <TabsContent value="wheel" className="flex justify-center py-1">
          <ColorWheel hsv={hsv} size={wheelSize} onChange={onInput} onCommit={onCommitHsv} />
        </TabsContent>
      )}

      <div className="flex flex-col gap-1">
        {hasRGB && (
          <TabsContent value="hsv" className="flex flex-col gap-1">
            <LabeledSlider
              label="Hue"
              value={Math.round(hsv.h)}
              max={359}
              track={HUE_TRACK}
              display={`${Math.round(hsv.h)}°`}
              onInput={(h) => onInput({ ...hsv, h })}
              onCommit={(h) => onCommitHsv({ ...hsv, h })}
            />
            <LabeledSlider
              label="Saturation"
              value={Math.round(hsv.s)}
              max={100}
              track={`linear-gradient(to right, #aaa, ${rgbCss(hsvToRgb({ h: hsv.h, s: 100, v: 100 }))})`}
              display={`${Math.round(hsv.s)}%`}
              onInput={(s) => onInput({ ...hsv, s })}
              onCommit={(s) => onCommitHsv({ ...hsv, s })}
            />
          </TabsContent>
        )}
        {hasRGB && (
          <TabsContent value="rgb" className="flex flex-col gap-1">
            {(['r', 'g', 'b'] as const).map((k) => (
              <LabeledSlider
                key={k}
                label={{ r: 'Red', g: 'Green', b: 'Blue' }[k]}
                value={rgb[k]}
                track={`linear-gradient(to right, ${rgbCss({ ...rgb, [k]: 0 })}, ${rgbCss({ ...rgb, [k]: 255 })})`}
                onInput={(v) => onInput(rgbToHsv({ ...rgb, [k]: v }))}
                onCommit={(v) => onCommitRgb({ ...rgb, [k]: v })}
              />
            ))}
          </TabsContent>
        )}
        {hasRGB && (
          <LabeledSlider
            label="Value"
            value={Math.round(hsv.v)}
            max={100}
            track={`linear-gradient(to right, #000, ${rgbCss(pure)})`}
            display={`${Math.round(hsv.v)}%`}
            onInput={(v) => onInput({ ...hsv, v })}
            onCommit={(v) => onCommitHsv({ ...hsv, v })}
          />
        )}
        {hasRGB && temperature && (
          <LabeledSlider
            label="Temperature"
            value={Math.min(10091, Math.max(1900, kelvin))}
            min={1900}
            max={10091}
            track={KELVIN_TRACK}
            display={`${Math.round(kelvin / 100) * 100}K`}
            onInput={(k) => onInput(rgbToHsv(kelvinToRgb(k)))}
            onCommit={(k) => {
              const c = kelvinToRgb(k)
              onInput(rgbToHsv(c))
              onCommitRgb(c)
            }}
          />
        )}
        {children}
      </div>
    </Tabs>
  )
}

// The hex field with its apply button, then `extra` (a button), then colours to pick when `onPick` is given:
// the quick colours and a random one, or `swatches` (with `pressed` ringed). `digits` is 8 where a white channel
// can follow the RGB (RRGGBBWW); `applyOnBlur` applies what was typed when the field loses focus.
export function HexRow({
  hex,
  onHex,
  onApply,
  onPick,
  digits = 6,
  label,
  swatches = QUICK,
  random = true,
  pressed,
  applyOnBlur,
  extra,
}: {
  hex: string
  onHex: (hex: string) => void
  onApply: () => void
  onPick?: (rgb: RGB) => void
  digits?: 6 | 8
  label?: string
  swatches?: string[]
  random?: boolean
  pressed?: string
  applyOnBlur?: boolean
  extra?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="flex min-w-36 flex-1 gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onApply()
        }}
      >
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText className="font-mono">#</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            value={hex}
            placeholder="RRGGBB"
            // strip "#" and anything else before limiting the length, so a pasted "#RRGGBBWW" keeps all 8 digits
            onChange={(e) =>
              onHex(
                e.target.value
                  .replace(/[^0-9a-f]/gi, '')
                  .slice(0, digits)
                  .toUpperCase(),
              )
            }
            onBlur={applyOnBlur ? onApply : undefined}
            aria-label={label ?? (digits === 8 ? 'Hex color (RRGGBB or RRGGBBWW)' : 'Hex color (RRGGBB)')}
            className="font-mono"
          />
        </InputGroup>
        <Button type="submit" variant="outline" size="icon" aria-label="Apply hex color">
          <Icon.check />
        </Button>
      </form>
      {extra}
      {onPick && (
        <div className="flex flex-wrap gap-1.5">
          {swatches.map((q) => (
            <button
              key={q}
              type="button"
              aria-label={`Set color ${q}`}
              aria-pressed={pressed === undefined ? undefined : q.toUpperCase() === pressed.toUpperCase()}
              onClick={() => onPick(fromHex(q)!)}
              className="size-7 rounded-full border aria-pressed:ring-2 aria-pressed:ring-foreground aria-pressed:ring-offset-2 aria-pressed:ring-offset-card"
              style={{ background: q }}
            />
          ))}
          {random && (
            <button
              type="button"
              aria-label="Random color"
              onClick={() => onPick(hsvToRgb({ h: Math.random() * 360, s: 50 + Math.random() * 50, v: 100 }))}
              className="flex size-7 items-center justify-center rounded-full border"
              style={{ background: HUE_TRACK }}
            >
              <Icon.dice className="size-4 text-black/70" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
