import { useRef } from 'react'
import { hsvToRgb, rgbCss, type HSV } from '../lib/color'

// Hue around the circle (red at the top, clockwise), saturation from the centre outwards. Value is a separate slider.
export function ColorWheel({
  hsv,
  size,
  onChange,
  onCommit,
}: {
  hsv: HSV
  size: number
  onChange: (hsv: HSV) => void
  onCommit: (hsv: HSV) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef(hsv)

  const pick = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    let h = (Math.atan2(dx, -dy) * 180) / Math.PI
    if (h < 0) h += 360
    const s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2)) * 100
    last.current = { h, s, v: hsv.v }
    onChange(last.current)
  }

  const rad = ((hsv.h - 90) * Math.PI) / 180
  const dist = (hsv.s / 100) * (size / 2)
  const marker = hsvToRgb({ h: hsv.h, s: hsv.s, v: 100 })

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2
    const next = { ...hsv }
    if (e.key === 'ArrowLeft') next.h = (hsv.h - step + 360) % 360
    else if (e.key === 'ArrowRight') next.h = (hsv.h + step) % 360
    else if (e.key === 'ArrowUp') next.s = Math.min(100, hsv.s + step)
    else if (e.key === 'ArrowDown') next.s = Math.max(0, hsv.s - step)
    else return
    e.preventDefault()
    onCommit(next)
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Color wheel: arrow keys change hue (left/right) and saturation (up/down)"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hsv.h)}
      aria-valuetext={`hue ${Math.round(hsv.h)}°, saturation ${Math.round(hsv.s)}%`}
      className="relative shrink-0 touch-none rounded-full"
      style={{
        width: size,
        height: size,
        background:
          'radial-gradient(closest-side, #fff, rgba(255,255,255,0)), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        pick(e)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e)
      }}
      onPointerUp={() => onCommit(last.current)}
      onKeyDown={onKey}
    >
      <div
        className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_1px_6px_rgba(0,0,0,.6)]"
        style={{
          left: size / 2 + Math.cos(rad) * dist,
          top: size / 2 + Math.sin(rad) * dist,
          background: rgbCss(marker),
        }}
      />
    </div>
  )
}
