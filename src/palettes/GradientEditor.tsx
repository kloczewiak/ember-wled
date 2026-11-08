import { useEffect, useRef, useState } from 'react'
import { rgbCss, toHex } from '../lib/color'
import { cx } from '../components/controls'
import { addColour, gradientCss, lanes, MAX_COLOURS, moveTo, onTheLight, type Stop } from './palettes'

// The gradient with a pin under each colour. Clicking the bar adds a colour there; only the pins move colours
// (dragging, or the arrow keys once one is selected). Pins too close to share a row drop to a row below with a
// stem to their spot. `onLive` follows a drag, `onCommit` ends it (and is the only call for everything else),
// so undo steps over whole drags.

const ROW = 38 // px between pin rows

export function GradientEditor({
  stops,
  sel,
  onSelect,
  onLive,
  onCommit,
  compact,
}: {
  stops: Stop[]
  sel: number
  onSelect: (i: number) => void
  onLive: (stops: Stop[]) => void
  onCommit: (stops: Stop[]) => void
  compact: boolean
}) {
  const pinsRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = pinsRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 600))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // the pin being dragged (its index changes as it passes others), and the rows as they were when the drag
  // started: its own, and the others' in order, so nothing jumps between rows until it's let go
  const [drag, setDrag] = useState<{ i: number; own: number; others: number[] } | null>(null)

  const pinW = compact ? 40 : 36
  const gap = Math.ceil((pinW * 255) / Math.max(1, width)) + 1
  const rows =
    drag && drag.others.length === stops.length - 1
      ? stops.map((_, k) => (k === drag.i ? drag.own : drag.others[k < drag.i ? k : k - 1]))
      : lanes(stops, gap)
  const rowCount = Math.max(...rows) + 1
  const leds = onTheLight(stops, Math.max(8, Math.floor(width / 14)))
  const dragged = drag ? stops[drag.i] : null

  const add = (t?: number) => {
    const r = addColour(stops, t)
    if (!r) return
    onCommit(r[0])
    onSelect(r[1])
  }
  const remove = (i: number) => {
    onCommit(stops.filter((_, k) => k !== i))
    onSelect(Math.max(1, i - 1))
  }
  const posAt = (clientX: number) => {
    const r = pinsRef.current!.getBoundingClientRect()
    return ((clientX - r.left) / r.width) * 255
  }
  const move = (i: number, t: number, how: 'live' | 'commit') => {
    const [next, j] = moveTo(stops, i, t)
    if (how === 'live') onLive(next)
    else onCommit(next)
    if (j !== i) onSelect(j)
    return j
  }
  const endDrag = () => {
    if (!drag) return
    setDrag(null)
    onCommit(stops)
  }

  return (
    <div className="flex flex-col">
      <div className="relative">
        <button
          type="button"
          aria-label="Add a colour to the gradient"
          className={cx(
            'block w-full cursor-copy rounded-2xl ring-1 ring-foreground/10 ring-inset',
            compact ? 'h-16' : 'h-18',
          )}
          style={{ background: gradientCss(stops) }}
          onClick={(e) => {
            // from the keyboard there's no position: add one in the widest gap, like Add colour
            if (e.detail === 0) return add()
            const r = e.currentTarget.getBoundingClientRect()
            add(((e.clientX - r.left) / r.width) * 255)
          }}
        />
        {dragged && (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -ml-px w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
              style={{ left: `${(dragged.t / 255) * 100}%` }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute top-2 rounded-lg bg-background/90 px-2 py-0.5 font-mono text-xs font-semibold whitespace-nowrap text-foreground"
              style={{
                left: `${(dragged.t / 255) * 100}%`,
                transform: `translateX(${dragged.t < 20 ? '0%' : dragged.t > 235 ? '-100%' : '-50%'})`,
              }}
            >
              Position {dragged.t}
            </span>
          </>
        )}
      </div>

      {/* the drag is followed here rather than on the pin, whose place in the list changes as it passes others */}
      <div
        ref={pinsRef}
        className="relative"
        style={{ height: 46 + (rowCount - 1) * ROW }}
        onPointerMove={(e) => {
          if (drag) setDrag({ ...drag, i: move(drag.i, posAt(e.clientX), 'live') })
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {stops.map((s, i) => {
          const end = i === 0 || i === stops.length - 1
          const on = i === sel
          const row = rows[i]
          const ring = on ? 'var(--color-primary)' : 'var(--color-foreground)'
          return (
            <button
              key={i}
              type="button"
              aria-label={`Colour ${i + 1}, #${toHex(s.rgb)} at ${s.t}`}
              aria-pressed={on}
              className={cx(
                'absolute flex h-11.5 -translate-x-1/2 touch-none flex-col items-center outline-none',
                // the ends can't move, so they only select
                end ? 'cursor-pointer' : drag?.i === i ? 'cursor-grabbing' : 'cursor-grab',
                'focus-visible:[&>span:last-child]:outline-2 focus-visible:[&>span:last-child]:outline-offset-4 focus-visible:[&>span:last-child]:outline-ring',
              )}
              style={{ left: `${(s.t / 255) * 100}%`, top: row * ROW, width: pinW, zIndex: on ? 3 : 1 }}
              onClick={() => onSelect(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault()
                  const step = (e.shiftKey ? 8 : 1) * (e.key === 'ArrowLeft' ? -1 : 1)
                  if (end) return
                  const j = move(i, s.t + step, 'commit')
                  // keep the focus on the colour that moved, now at its new place
                  if (j !== i)
                    requestAnimationFrame(() => (pinsRef.current?.children[j] as HTMLElement | undefined)?.focus())
                } else if ((e.key === 'Delete' || e.key === 'Backspace') && !end) {
                  e.preventDefault()
                  remove(i)
                }
              }}
              onPointerDown={(e) => {
                onSelect(i)
                if (end) return
                setDrag({ i, own: rows[i], others: rows.filter((_, k) => k !== i) })
                try {
                  pinsRef.current!.setPointerCapture(e.pointerId)
                } catch {
                  /* a pointer the browser no longer tracks: the drag still follows moves over the pins */
                }
              }}
            >
              {row > 0 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 -ml-px w-0.5"
                  style={{ top: -row * ROW, height: row * ROW + 8, background: ring }}
                />
              )}
              <span
                aria-hidden
                className="size-0 border-x-[6px] border-b-[7px] border-x-transparent"
                style={{ borderBottomColor: row > 0 ? 'transparent' : ring }}
              />
              <span
                aria-hidden
                className={cx('rounded-full', compact ? 'size-7.5' : 'size-6.5')}
                style={{
                  background: rgbCss(s.rgb),
                  boxShadow: `0 0 0 ${on ? 3 : 2}px ${ring}, 0 2px 8px rgba(0,0,0,0.5)`,
                }}
              />
            </button>
          )
        })}
      </div>

      {!compact && (
        <div aria-hidden className="flex justify-between pt-0.5 font-mono text-[11px] text-muted-foreground/70">
          <span>0</span>
          <span>64</span>
          <span>128</span>
          <span>192</span>
          <span>255</span>
        </div>
      )}
      <p className="m-0 mt-2 flex gap-2 text-xs text-muted-foreground">
        <span className="flex-1">
          {compact
            ? 'Tap the bar to add a colour. Drag a pin to move it.'
            : 'Click the bar to add a colour there. Drag a pin to move it; arrow keys nudge the selected one.'}
        </span>
        <span className="shrink-0">
          {stops.length} of {MAX_COLOURS} colours
        </span>
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <p className="m-0 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          <span className="text-[13px] font-semibold text-soft">On the light</span>
          {compact
            ? '16 colours, blended'
            : 'WLED keeps 16 colours of every palette and blends between them, so fine details soften.'}
        </p>
        <div aria-hidden className="flex justify-between rounded-xl bg-black/40 px-3.5 py-3">
          {leds.map((c, i) => (
            <span
              key={i}
              className="size-2 rounded-full"
              style={{ background: rgbCss(c), boxShadow: `0 0 6px ${rgbCss(c)}` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
