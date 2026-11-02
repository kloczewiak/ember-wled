import { useEffect, useRef, useState } from 'react'
import { onLiveFrame, send, toast, useStore } from '../store'
import { useDraft, useSelection } from '../hooks'
import { parseFxMeta } from '../api/fxmeta'
import type { Segment } from '../api/types'
import { stockCfg } from '../ui'
import { Button, Card, Check, cx, Field, Icon, inputCls, SectionTitle, Slider, Switch } from './controls'
import { Button as UiButton } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect } from '@/components/ui/native-select'

const BLEND_MODES = ['Top/Default', 'Bottom/None', 'Add', 'Subtract', 'Difference', 'Average', 'Multiply', 'Divide', 'Lighten', 'Darken', 'Screen', 'Overlay', 'Hard Light', 'Soft Light', 'Dodge', 'Burn', 'Stencil']
const SOUND_SIMS = ['BeatSin', 'WeWillRockYou', '10/13', '14/3']
const EXPAND_1D = ['Pixels', 'Bar', 'Arc', 'Corner', 'Pinwheel']
const BLEND_STYLES: [number, string, boolean?][] = [
  [0, 'Fade'], [1, 'Fairy Dust'], [2, 'Swipe right'], [3, 'Swipe left'], [16, 'Push right'], [17, 'Push left'],
  [4, 'Outside-in'], [5, 'Inside-out'], [6, 'Swipe up', true], [7, 'Swipe down', true], [8, 'Open H', true],
  [9, 'Open V', true], [18, 'Push up', true], [19, 'Push down', true], [10, 'Swipe TL', true], [11, 'Swipe TR', true],
  [12, 'Swipe BR', true], [13, 'Swipe BL', true], [14, 'Circular Out', true], [15, 'Circular In', true],
]
// segment groups ("sets") 1-3 are colour coded like the stock UI
const SET_COLORS = ['var(--color-muted-foreground)', '#ee4422', '#44ee22', '#4488aa']

const segName = (s: Segment) => s.n || `Segment ${s.id}`
const numCls = cx(inputCls, 'font-mono')

function lengthLabel(len: number, grp: number, spc: number) {
  let out = len > 1 ? `${len} LEDs` : len === 1 ? '1 LED' : '(delete)'
  const virt = Math.ceil(len / (Math.max(grp, 1) + spc))
  if (len > 0 && (grp > 1 || spc > 0)) out += ` (${virt} virtual)`
  return out
}

export function SegmentsPanel({ className }: { className?: string }) {
  const state = useStore((s) => s.state)
  const info = useStore((s) => s.info)
  const { isMatrix, mw, mh } = useSelection()
  const [adding, setAdding] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  // "Always expand first segment" in Settings → User Interface
  const [expanded, setExpanded] = useState<number | null>(() => (stockCfg.segexp ? useStore.getState().state?.seg[0]?.id ?? null : null))
  if (!state || !info) return null

  const segs = state.seg
  let lowestUnused = 0
  for (const s of segs) if (s.id === lowestUnused) lowestUnused++
  const canAdd = lowestUnused < info.leds.maxseg
  const allSel = segs.length > 0 && segs.every((s) => s.sel)
  const ledCount = info.leds.count

  return (
    <Card className={className}>
      <SectionTitle
        right={
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={() => send({ seg: segs.map((s) => ({ id: s.id, sel: !allSel })) })}>
              {allSel ? 'Select none' : 'Select all'}
            </Button>
            <Button size="sm" variant="primary" disabled={!canAdd} onClick={() => setAdding(true)} title={canAdd ? 'Add segment' : 'Maximum number of segments reached'}>
              <Icon.plus className="size-3.5" />Add
            </Button>
          </div>
        }
      >
        Segments
      </SectionTitle>

      {!isMatrix && segs.length > 0 && <StripMap segs={segs} total={ledCount} />}

      {segs.length > 2 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Select group
          {[0, 1, 2, 3].map((g) => (
            <UiButton
              key={g}
              variant="outline"
              size="icon-sm"
              aria-label={`Select group ${g + 1}`}
              onClick={() => send({ seg: segs.map((s) => ({ id: s.id, sel: s.set === g })) })}
              style={{ color: SET_COLORS[g] }}
            >
              {g + 1}
            </UiButton>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {segs.map((s, i) => (
          <SegmentItem
            key={s.id}
            seg={s}
            main={s.id === state.mainseg}
            open={expanded === s.id}
            onToggle={() => setExpanded(expanded === s.id ? null : s.id)}
            canDelete={segs.length > 1}
            canRepeat={!isMatrix && canAdd && i === segs.length - 1 && s.stop < ledCount}
          />
        ))}
      </div>

      {adding && (
        <NewSegment
          id={lowestUnused}
          defaults={isMatrix
            ? { start: 0, stop: mw, startY: 0, stopY: mh }
            : { start: (segs.at(-1)?.stop ?? 0) < ledCount ? segs.at(-1)?.stop ?? 0 : 0, stop: ledCount }}
          onDone={() => setAdding(false)}
        />
      )}

      <div className="mt-1 flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <TransitionField value={state.transition} />
        {state.transition > 0 && (
          <Field label="Blending" className="min-w-32 flex-1">
            <NativeSelect className="w-full" value={state.bs ?? 0} onChange={(e) => send({ bs: Number(e.target.value) })}>
              {BLEND_STYLES.filter(([, , is2D]) => isMatrix || !is2D).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </NativeSelect>
          </Field>
        )}
        {(info.maps?.length ?? 0) > 1 && (
          <Field label="LED map" className="min-w-32 flex-1">
            <NativeSelect className="w-full" value={state.ledmap ?? 0} onChange={(e) => send({ ledmap: Number(e.target.value) })}>
              {info.maps!.map((m) => <option key={m.id} value={m.id}>{m.id === 0 ? 'Default' : m.n || `ledmap${m.id}.json`}</option>)}
            </NativeSelect>
          </Field>
        )}
        {segs.length > 1 && (
          <Button
            variant={confirmReset ? 'danger' : 'default'}
            onClick={() => {
              if (!confirmReset) { setConfirmReset(true); return }
              setConfirmReset(false)
              send({ rSeg: true })
            }}
            onBlur={() => setConfirmReset(false)}
          >
            {confirmReset ? 'Confirm reset' : 'Reset segments'}
          </Button>
        )}
      </div>
    </Card>
  )
}

const TICK_CHAR_PX = 6.2 // width of one digit at 10px monospace
const TICK_GAP_PX = 4    // minimum space between two labels
const TICK_INSET_PX = 3  // labels sit this far inside the segment edge they mark

// One label per segment edge: its first LED at its left edge and its last LED at its right edge,
// so two touching segments show e.g. "96 | 97" on either side of the boundary.
type Tick = { x: number; led: number; edge: 'start' | 'end' }

// The labels that fit under the bar without touching: the outermost two always, then the rest left to
// right, skipping any that would overlap one already placed. Returns each shown label's left position.
function fittingTicks(ticks: Tick[], total: number, width: number) {
  const span = (t: Tick) => {
    const w = String(t.led).length * TICK_CHAR_PX
    const x = (t.x / total) * width
    const inset = t.x === 0 || t.x === total ? 0 : TICK_INSET_PX
    const left = t.edge === 'start' ? x + inset : x - inset - w
    return [left, left + w] as const
  }
  const placed: { tick: Tick; at: readonly [number, number] }[] = []
  const fits = ([a, b]: readonly [number, number]) => placed.every(({ at: [c, d] }) => b + TICK_GAP_PX <= c || a >= d + TICK_GAP_PX)
  const outer = ticks.length ? [ticks[0], ticks[ticks.length - 1]] : []
  for (const t of [...new Set(outer)]) placed.push({ tick: t, at: span(t) })
  for (const t of ticks) {
    if (outer.includes(t)) continue
    const at = span(t)
    if (fits(at)) placed.push({ tick: t, at })
  }
  return placed.map(({ tick, at }) => ({ ...tick, left: at[0] }))
}

function StripMap({ segs, total }: { segs: Segment[]; total: number }) {
  // With Peek on, the bar shows the strip's live colours (the frames Peek already streams) under the segments.
  const live = useStore((s) => s.peek)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!live) return
    return onLiveFrame((f) => {
      const el = canvas.current
      if (!el || f[1] !== 1) return // 1D frames only: 'L', version, then RGB triplets
      const n = (f.length - 2) / 3
      if (el.width !== n || el.height !== 1) { el.width = n; el.height = 1 }
      const img = new ImageData(n, 1)
      for (let i = 0; i < n; i++) img.data.set([f[2 + i * 3], f[3 + i * 3], f[4 + i * 3], 255], i * 4)
      el.getContext('2d')!.putImageData(img, 0, 0)
    })
  }, [live])
  const tickRow = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = tickRow.current!
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const edges: Tick[] = [...segs].sort((a, b) => a.start - b.start)
    .flatMap((s) => [{ x: s.start, led: s.start, edge: 'start' as const }, { x: s.stop, led: s.stop - 1, edge: 'end' as const }])
  const ticks = width ? fittingTicks(edges, total, width) : []
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-6 overflow-hidden rounded-md bg-bg">
        {live && <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" />}
        {segs.map((s) => {
          const c = s.col[0]
          return (
            <button
              key={s.id}
              title={`${segName(s)}: LED ${s.start}–${s.stop - 1}`}
              aria-label={`Select only ${segName(s)}`}
              onClick={() => send({ seg: segs.map((g) => ({ id: g.id, sel: g.id === s.id })), mainseg: s.id })}
              className={cx(
                // the border is the card colour, so neighbouring segments look separated by a gap
                'absolute inset-y-0 flex items-center overflow-hidden border-x border-card px-1.5 text-[11px] font-semibold',
                // live colours are a canvas underneath, so unselected segments are dimmed with an overlay instead
                live ? cx('text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]', !s.sel && 'bg-black/55') : !s.sel && 'opacity-45',
              )}
              style={{
                left: `${(s.start / total) * 100}%`,
                width: `${((s.stop - s.start) / total) * 100}%`,
                ...(live ? {} : {
                  background: s.on ? `rgb(${c[0]},${c[1]},${c[2]})` : 'var(--color-line)',
                  color: s.on && 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 140 ? '#000' : '#fff',
                }),
              }}
            >
              <span className="truncate">{segName(s)}</span>
            </button>
          )
        })}
      </div>
      <div ref={tickRow} className="relative h-3 font-mono text-[10px] text-muted-foreground">
        {ticks.map((t) => <span key={`${t.edge}${t.x}`} className="absolute" style={{ left: t.left }}>{t.led}</span>)}
      </div>
    </div>
  )
}

function SegmentItem({ seg, main, open, onToggle, canDelete, canRepeat }: {
  seg: Segment; main: boolean; open: boolean; onToggle: () => void; canDelete: boolean; canRepeat: boolean
}) {
  const info = useStore((s) => s.info)!
  const state = useStore((s) => s.state)!
  const { isMatrix, mw, mh } = useSelection()
  const fxdata = useStore((s) => s.fxdata)
  const live = info.live && info.liveseg === seg.id

  const freeze = () => {
    if (live) { send({ lor: 1 }); toast(`${segName(seg)} now ignores live data and shows its own effect again.`); return }
    send({ seg: { id: seg.id, frz: !seg.frz } })
    toast(seg.frz ? `${segName(seg)} unfrozen, its effect is running again.` : `${segName(seg)} frozen: its effect is paused on the current frame until you unfreeze it.`)
  }

  return (
    <div className={cx('flex flex-col gap-3 rounded-lg border p-3', main && 'border-input', open && 'bg-muted/50')}>
      <div className="flex items-center gap-2.5">
        <Checkbox
          checked={seg.sel}
          onCheckedChange={(sel) => send({ seg: { id: seg.id, sel } })}
          aria-label={`Select ${segName(seg)}`}
        />
        <button className="min-w-0 flex-1 text-left" onClick={() => send({ seg: state.seg.map((g) => ({ id: g.id, sel: g.id === seg.id })), mainseg: seg.id })} title="Select only this segment">
          <div className="flex items-center gap-1.5 truncate font-semibold">
            {segName(seg)}
            {seg.set > 0 && <span className="font-mono text-[11px]" style={{ color: SET_COLORS[seg.set] }}>G{seg.set + 1}</span>}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {isMatrix && seg.startY !== undefined ? `${seg.start},${seg.startY} – ${seg.stop},${seg.stopY}` : `LED ${seg.start}–${seg.stop - 1}`}
            {' · '}{lengthLabel((seg.stop - seg.start) * (isMatrix ? (seg.stopY ?? 1) - (seg.startY ?? 0) : 1), seg.grp, seg.spc)}
          </div>
        </button>
        <UiButton variant="ghost" size="icon" aria-label={open ? 'Collapse segment settings' : 'Expand segment settings'} aria-expanded={open} onClick={onToggle}>
          <Icon.chevron className={cx('transition-transform', open && 'rotate-180')} />
        </UiButton>
        {!stockCfg.segpwr && <Switch on={seg.on} label={`${segName(seg)} power`} onChange={(on) => send({ seg: { id: seg.id, on } })} />}
      </div>
      <div className="flex items-center gap-3">
          <Toggle
            variant="outline"
            size="sm"
            pressed={seg.frz}
            onPressedChange={freeze}
            aria-label={live ? `Override live data on ${segName(seg)}` : seg.frz ? `Unfreeze ${segName(seg)}` : `Freeze ${segName(seg)}`}
            title={live ? 'Receiving live data: tap to show the effect instead' : seg.frz ? 'Effect paused: tap to resume' : 'Pause the effect on its current frame'}
          >
            <Icon.snow />
            {live ? 'Live' : seg.frz ? 'Frozen' : 'Freeze'}
          </Toggle>
        {!stockCfg.segpwr && <Slider label={`${segName(seg)} brightness`} value={seg.bri} min={1} onCommit={(bri) => send({ seg: { id: seg.id, bri } })} className="min-w-0 flex-1" />}
      </div>
      {open && (
        <SegmentEditor
          seg={seg} isMatrix={isMatrix} mw={mw} mh={mh} ledCount={info.leds.count}
          fxFlags={parseFxMeta(seg.fx, fxdata[seg.fx]).flags} audioOn={!!state.AudioReactive?.on}
          canDelete={canDelete} canRepeat={canRepeat}
        />
      )}
    </div>
  )
}

function SegmentEditor({ seg, isMatrix, mw, mh, ledCount, fxFlags, audioOn, canDelete, canRepeat }: {
  seg: Segment; isMatrix: boolean; mw: number; mh: number; ledCount: number; fxFlags: string; audioOn: boolean; canDelete: boolean; canRepeat: boolean
}) {
  const is2DSeg = isMatrix && seg.start < mw * mh
  const [name, setName] = useDraft(seg.n ?? '')
  // with "Set segment length instead of stop LED" the stop fields hold lengths; `stop`/`stopY` are always absolute
  const rel = stockCfg.seglen
  const [b, setB] = useDraft(`${seg.start},${seg.stop - (rel ? seg.start : 0)},${seg.startY ?? 0},${(seg.stopY ?? 1) - (rel ? seg.startY ?? 0 : 0)},${seg.of},${seg.grp},${seg.spc}`)
  const [start, stopField, startY, stopYField, of, grp, spc] = b.split(',').map((v) => (v === '' ? NaN : Number(v)))
  const stop = stopField + (rel ? start : 0)
  const stopY = stopYField + (rel ? startY : 0)
  const setField = (i: number, v: string) => { const p = b.split(','); p[i] = v.replace(/[^0-9]/g, ''); setB(p.join(',')) }
  const [confirmDelete, setConfirmDelete] = useState(false)
  const maxNameLen = useStore((s) => (s.info?.arch === 'esp8266' ? 32 : 64))

  const len = (stop - start) * (is2DSeg ? stopY - startY : 1)
  const maxX = is2DSeg ? mw : ledCount

  const apply = () => {
    if ([start, stop, of, grp, spc].some(isNaN) || start < 0 || start > maxX - 1 || stop > maxX) { toast('Segment bounds out of range', true); return }
    if (stop <= start) { remove(); return }
    const cmd: Record<string, unknown> = { id: seg.id, n: name, start, stop, grp, spc, of }
    if (is2DSeg) {
      if (isNaN(startY) || isNaN(stopY) || startY < 0 || startY > mh - 1 || stopY > mh) { toast('Segment bounds out of range', true); return }
      Object.assign(cmd, { startY, stopY })
    }
    send({ seg: cmd })
  }
  const remove = () => {
    if (!canDelete) { toast('You need to have multiple segments to delete one!'); return }
    send({ seg: { id: seg.id, stop: 0 } })
  }
  const set = (patch: Record<string, unknown>) => send({ seg: { id: seg.id, ...patch } })
  const is1DFx = !fxFlags.includes('2')
  const isAudioFx = fxFlags.includes('v') || fxFlags.includes('f')

  const num = (i: number, label: string, value: number) => (
    <Field label={label}>
      <input className={numCls} inputMode="numeric" value={isNaN(value) ? '' : value} onChange={(e) => setField(i, e.target.value)} />
    </Field>
  )

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); apply() }}>
      <Field label="Name">
        <input className={inputCls} value={name} maxLength={maxNameLen} placeholder="Enter name..." onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        {num(0, is2DSeg ? 'Start X' : 'Start LED', start)}
        {num(1, is2DSeg ? (rel ? 'Width' : 'Stop X') : (rel ? 'LED count' : 'Stop LED'), stopField)}
        {is2DSeg ? <span /> : num(4, 'Offset', of)}
        {is2DSeg && <>{num(2, 'Start Y', startY)}{num(3, rel ? 'Height' : 'Stop Y', stopYField)}<span /></>}
        {num(5, 'Grouping', grp)}
        {num(6, 'Spacing', spc)}
        <div className="flex items-end">
          <Button type="submit" variant="primary" className="w-full">Apply</Button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">{lengthLabel(len, grp || 1, spc || 0)}{isMatrix && !is2DSeg ? ' [strip]' : ''}</div>

      <div className="grid grid-cols-2 gap-x-3">
        <Check checked={seg.rev} onChange={(rev) => set({ rev })}>{is2DSeg ? 'Reverse X' : 'Reverse direction'}</Check>
        <Check checked={seg.mi} onChange={(mi) => set({ mi })}>{is2DSeg ? 'Mirror X' : 'Mirror effect'}</Check>
        {is2DSeg && (
          <>
            <Check checked={!!seg.rY} onChange={(rY) => set({ rY })}>Reverse Y</Check>
            <Check checked={!!seg.mY} onChange={(mY) => set({ mY })}>Mirror Y</Check>
            {seg.stop - seg.start > 1 && (seg.stopY ?? 1) - (seg.startY ?? 0) > 1 && (
              <Check checked={!!seg.tp} onChange={(tp) => set({ tp })}>Transpose</Check>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Blend mode">
          <NativeSelect className="w-full" value={seg.bm} onChange={(e) => set({ bm: Number(e.target.value) })}>
            {BLEND_MODES.map((n, i) => <option key={i} value={i}>{n}</option>)}
          </NativeSelect>
        </Field>
        {is2DSeg && is1DFx && seg.stop - seg.start > 1 && (seg.stopY ?? 1) - (seg.startY ?? 0) > 1 && (
          <Field label="Expand 1D FX">
            <NativeSelect className="w-full" value={seg.m12} onChange={(e) => set({ m12: Number(e.target.value) })}>
              {EXPAND_1D.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </NativeSelect>
          </Field>
        )}
        {isAudioFx && !audioOn && (
          <Field label="Sound sim">
            <NativeSelect className="w-full" value={seg.si} onChange={(e) => set({ si: Number(e.target.value) })}>
              {SOUND_SIMS.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </NativeSelect>
          </Field>
        )}
        <Field label="Group">
          <NativeSelect className="w-full" value={seg.set} onChange={(e) => set({ set: Number(e.target.value) })}>
            {[0, 1, 2, 3].map((i) => <option key={i} value={i}>Group {i + 1}</option>)}
          </NativeSelect>
        </Field>
      </div>

      <div className="flex gap-2">
        {canRepeat && (
          <Button type="button" className="flex-1" onClick={() => set({ n: name, start, stop, grp, spc, of, rpt: true })} title="Repeat this segment until the end of the strip">
            <Icon.repeat className="size-4" />Repeat until end
          </Button>
        )}
        {canDelete && (
          <Button type="button" variant="danger" className="flex-1"
            onClick={() => { if (confirmDelete) remove(); else setConfirmDelete(true) }}
            onBlur={() => setConfirmDelete(false)}>
            <Icon.trash className="size-4" />{confirmDelete ? 'Confirm delete' : 'Delete'}
          </Button>
        )}
      </div>
    </form>
  )
}


function NewSegment({ id, defaults, onDone }: { id: number; defaults: { start: number; stop: number; startY?: number; stopY?: number }; onDone: () => void }) {
  const { isMatrix } = useSelection()
  const [name, setName] = useState('')
  const rel = stockCfg.seglen // stop fields hold lengths, as in the segment editor
  const [v, setV] = useState({
    start: String(defaults.start), stop: String(defaults.stop - (rel ? defaults.start : 0)),
    startY: String(defaults.startY ?? 0), stopY: String((defaults.stopY ?? 1) - (rel ? defaults.startY ?? 0 : 0)),
  })
  const stop = Number(v.stop) + (rel ? Number(v.start) : 0)
  const stopY = Number(v.stopY) + (rel ? Number(v.startY) : 0)
  const field = (k: keyof typeof v, label: string) => (
    <Field label={label}>
      <input className={numCls} inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^0-9]/g, '') })} />
    </Field>
  )
  const submit = () => {
    const cmd: Record<string, unknown> = { id, n: name, start: Number(v.start), stop }
    if (isMatrix) Object.assign(cmd, { startY: Number(v.startY), stopY })
    send({ seg: cmd })
    onDone()
  }
  return (
    <form className="flex flex-col gap-3 rounded-xl border border-primary bg-raised p-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <Field label="Name"><input className={inputCls} value={name} placeholder={`New segment ${id}`} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-2">
        {field('start', isMatrix ? 'Start X' : 'Start LED')}
        {field('stop', isMatrix ? (rel ? 'Width' : 'Stop X') : (rel ? 'LED count' : 'Stop LED'))}
        {isMatrix && <>{field('startY', 'Start Y')}{field('stopY', rel ? 'Height' : 'Stop Y')}</>}
      </div>
      <div className="text-xs text-muted-foreground">{lengthLabel((stop - Number(v.start)) * (isMatrix ? stopY - Number(v.startY) : 1), 1, 0)}</div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" className="flex-1">Add segment</Button>
        <Button type="button" className="flex-1" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

function TransitionField({ value }: { value: number }) {
  const [text, setText] = useDraft(String(value / 10))
  const commit = () => {
    const n = Math.round(parseFloat(text) * 10)
    if (isNaN(n) || n < 0 || n > 655) { setText(String(value / 10)); return }
    if (n !== value) send({ transition: n })
  }
  return (
    <Field label="Transition (s)" className="w-28">
      <input className={numCls} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </Field>
  )
}

