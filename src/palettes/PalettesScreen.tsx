import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Redo2,
  Shuffle,
  Trash2,
  TriangleAlert,
  Undo2,
  ArrowLeftRight,
} from 'lucide-react'
import { send, sendQuiet, reloadPalx, toast, useStore } from '../store'
import { useDraft, useMedia, WIDE } from '../hooks'
import { fromHex, hsvToRgb, rgbCss, rgbToHsv, toHex, type HSV, type RGB } from '../lib/color'
import { Card, cx, Switch } from '../components/controls'
import { ColorControls, HexRow } from '../components/ColorPicker'
import { usePinAction, useLeaveGuard } from '../settings/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Segment } from '../api/types'
import { GradientEditor } from './GradientEditor'
import { NewPalette } from './NewPalette'
import {
  addColour,
  cachedSlots,
  cacheSlots,
  freeSlot,
  generate,
  gradientCss,
  loadSlot,
  loadSlots,
  moveTo,
  onTheLight,
  paletteId,
  presetsUsing,
  saveSlot,
  slotsFromPalx,
  type Slot,
  type Stop,
} from './palettes'

// #palettes: the custom palette editor, in place of the firmware's /cpal.htm. A list of the light's custom
// palettes beside (on phones: before) the editor of one. Nothing reaches the light until Save, except the
// optional preview, which paints the selected segments and pauses their effect until you leave.

const segName = (s: Segment) => s.n || `Segment ${s.id}`
const andList = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
const same = (a: Stop[] | null, b: Stop[] | null) => JSON.stringify(a) === JSON.stringify(b)

export function PalettesScreen() {
  const info = useStore((s) => s.info)
  const presets = useStore((s) => s.presets)
  const wide = useMedia(WIDE)
  const max = info?.cpalmax ?? (info?.arch === 'esp8266' ? 10 : 129)

  // The slots show at once: from the copy kept on this device, or on a first visit from the colours the main
  // app already has (only the light's 16-colour version, so never edited). The files are read again in the
  // background; until then (`exact` false) opening a palette reads its file first.
  const [initial] = useState(() => {
    const count = useStore.getState().info?.cpalcount ?? 0
    const cached = cachedSlots(count)
    return { slots: cached ?? slotsFromPalx(useStore.getState().palx, count), exact: cached !== null }
  })
  const [slots, setSlots] = useState<Slot[]>(initial.slots)
  const [exact, setExact] = useState(initial.exact)
  const [opening, setOpening] = useState<number | null>(null)

  // the palette being edited: its slot, its colours, and whether it's new (not on the light yet)
  const [cur, setCur] = useState<number | null>(null)
  const [draft, setDraft] = useState<Stop[] | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [sel, setSel] = useState(0)
  // undo history; `committed` is the draft as of the last finished change (a drag in progress isn't one)
  const committed = useRef<Stop[] | null>(null)
  const [past, setPast] = useState<Stop[][]>([])
  const [future, setFuture] = useState<Stop[][]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [preview, setPreview] = useState(false)
  const saved = cur !== null ? (slots[cur] ?? null) : null
  const dirty = draft !== null && (isNew || !same(draft, saved))
  useLeaveGuard(dirty)

  const open = (slot: number, stops: Stop[], fresh: boolean) => {
    setCur(slot)
    setDraft(stops)
    setIsNew(fresh)
    setSel(fresh || stops.length < 3 ? 0 : 1)
    committed.current = stops
    setPast([])
    setFuture([])
    setConfirmDelete(false)
  }
  const close = () => {
    setCur(null)
    setDraft(null)
    setIsNew(false)
    setPreview(false)
  }
  // Opens a slot's palette: right away when its colours are exact, else once its file is read (one request).
  const openSlot = (i: number, known = exact) => {
    if (known) {
      if (slots[i]) open(i, slots[i]!, false)
      return
    }
    setOpening(i)
    loadSlot(i)
      .then((stops) => {
        if (!stops) return
        setSlots((list) => list.map((s, k) => (k === i ? stops : s)))
        open(i, stops, false)
      })
      .catch(() => toast(`Couldn't read Custom ${i + 1} from the light. Try again.`, true))
      .finally(() => setOpening(null))
  }
  // wide screens show a palette right away: the first one, or after deleting one the first left
  const openFirst = (list: Slot[], known: boolean) => {
    const first = list.findIndex((s) => s)
    if (first >= 0 && matchMedia(WIDE).matches) {
      if (known) open(first, list[first]!, false)
      else openSlot(first, false)
    }
  }
  // what the background read needs to know about the editor when it finishes
  const latest = useRef({ cur, draft, dirty, isNew })
  useEffect(() => {
    latest.current = { cur, draft, dirty, isNew }
  })
  useEffect(() => {
    let alive = true
    openFirst(initial.slots, initial.exact)
    loadSlots(useStore.getState().info?.cpalcount ?? 0)
      .then((list) => {
        if (!alive) return
        setSlots(list)
        setExact(true)
        cacheSlots(list)
        // the palette open but untouched follows the file if it changed elsewhere
        const { cur: c, draft: d, dirty: changed, isNew: fresh } = latest.current
        if (c !== null && !fresh && !changed && !same(list[c], d)) {
          if (list[c]) open(c, list[c]!, false)
          else close()
        }
      })
      .catch(() => {
        /* the light didn't answer: keep what's shown; opening a palette tries its file again */
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the editor opens
  }, [])

  const live = (next: Stop[]) => setDraft(next)
  const commit = (next: Stop[]) => {
    if (committed.current && !same(next, committed.current)) {
      setPast((p) => [...p.slice(-49), committed.current!])
      setFuture([])
    }
    committed.current = next
    setDraft(next)
  }
  const undo = () => {
    if (!past.length) return
    const prev = past[past.length - 1]
    setFuture((f) => [...f, committed.current!])
    setPast((p) => p.slice(0, -1))
    committed.current = prev
    setDraft(prev)
    setSel((s) => Math.min(s, prev.length - 1))
  }
  const redo = () => {
    if (!future.length) return
    const next = future[future.length - 1]
    setPast((p) => [...p, committed.current!])
    setFuture((f) => f.slice(0, -1))
    committed.current = next
    setDraft(next)
    setSel((s) => Math.min(s, next.length - 1))
  }

  // ---- leaving with unsaved changes asks first
  const [pending, setPending] = useState<(() => void) | null>(null)
  const afterSave = useRef<(() => void) | null>(null)
  const guard = (action: () => void) => (dirty ? setPending(() => action) : action())

  // ---- saving and deleting
  const save = usePinAction(
    ({ slot, stops }: { slot: number; stops: Stop[] }) => saveSlot(slot, stops),
    ({ slot, stops }) => {
      setSlots((s) => {
        const next = [...s]
        while (next.length <= slot) next.push(null)
        next[slot] = stops
        if (exact) cacheSlots(next)
        return next
      })
      setIsNew(false)
      committed.current = stops
      toast(`Custom ${slot + 1} saved`)
      reloadPalx()
      const then = afterSave.current
      afterSave.current = null
      then?.()
    },
  )
  const doSave = () => {
    if (cur !== null && draft) save.run({ slot: cur, stops: draft })
  }
  const doDelete = () => {
    if (cur === null) return
    setConfirmDelete(false)
    if (isNew) return close()
    send({ rmcpal: cur })
    const next = [...slots]
    next[cur] = null
    while (next.length && next[next.length - 1] === null) next.pop()
    setSlots(next)
    if (exact) cacheSlots(next)
    toast(`Custom ${cur + 1} deleted`)
    close()
    openFirst(next, exact)
    setTimeout(reloadPalx, 500)
  }

  // ---- new palettes
  const [newOpen, setNewOpen] = useState(false)
  const free = freeSlot(slots, max)
  const startNew = () => guard(() => setNewOpen(true))

  // ---- the preview on the light
  const targets = usePreview(preview, draft)

  if (!info) return null
  const used = slots.filter((s) => s).length
  const editing = cur !== null && draft !== null
  const header = (title: ReactNode, back: () => void, backLabel: string, right?: ReactNode) => (
    <header className="flex w-full shrink-0 items-center gap-1 px-3 pt-2.5 pb-1.5">
      <Button variant="ghost" size="icon" aria-label={backLabel} onClick={back}>
        <ArrowLeft />
      </Button>
      <h1 className="m-0 flex min-w-0 items-center gap-2 text-[15px] font-semibold">{title}</h1>
      <span className="flex-1" />
      {right}
    </header>
  )
  const toControls = () => guard(() => (location.hash = '#'))

  const list = (
    <PaletteList
      slots={slots}
      cur={opening ?? cur}
      max={max}
      free={free}
      draft={isNew ? draft : null}
      presetsOf={(i) => presetsUsing(presets, paletteId(i))}
      onOpen={(i) => guard(() => openSlot(i))}
      onNew={startNew}
    />
  )
  const editor = editing ? (
    <Editor
      key={cur}
      compact={!wide}
      slot={cur}
      stops={draft}
      sel={Math.min(sel, draft.length - 1)}
      onSelect={setSel}
      onLive={live}
      onCommit={commit}
      dirty={dirty}
      canUndo={past.length > 0}
      canRedo={future.length > 0}
      onUndo={undo}
      onRedo={redo}
      onSave={doSave}
      saving={save.busy}
      onDiscard={() => (isNew ? close() : saved && open(cur, saved, false))}
      preview={preview}
      onPreview={setPreview}
      targets={targets}
      presetNames={isNew ? [] : presetsUsing(presets, paletteId(cur))}
      isLast={!isNew && slots.every((s, i) => i <= cur || !s)}
      isNew={isNew}
      confirmDelete={confirmDelete}
      onAskDelete={setConfirmDelete}
      onDelete={doDelete}
    />
  ) : null

  const dialogs = (
    <>
      <NewPalette
        open={newOpen}
        onOpenChange={setNewOpen}
        wide={wide}
        slot={free}
        slots={slots}
        onPick={(stops) => {
          setNewOpen(false)
          open(free, stops, true)
        }}
      />
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Custom {(cur ?? 0) + 1} first?</AlertDialogTitle>
            <AlertDialogDescription>
              {isNew
                ? "It's new and isn't on the light yet. Leaving without saving drops it."
                : 'You changed its colours. Leaving without saving puts it back the way it was.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                const then = pending
                setPending(null)
                close()
                then?.()
              }}
            >
              Discard changes
            </Button>
            <Button variant="outline" onClick={() => setPending(null)}>
              Keep editing
            </Button>
            <Button
              onClick={() => {
                afterSave.current = pending
                setPending(null)
                doSave()
              }}
            >
              Save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {save.dialog}
    </>
  )

  if (!wide) {
    // phones: the list, or one palette's editor with its own header
    if (editing)
      return (
        <div className="flex h-full flex-col">
          {header(
            <>
              <span className="truncate">Custom {cur + 1}</span>
              {dirty && (
                <span
                  role="img"
                  aria-label="Unsaved changes"
                  title="Unsaved changes"
                  className="size-2 shrink-0 rounded-full bg-primary"
                />
              )}
            </>,
            () => guard(close),
            'Back to custom palettes',
            <>
              <Button variant="ghost" size="icon-lg" aria-label="Undo" disabled={!past.length} onClick={undo}>
                <Undo2 />
              </Button>
              <Button variant="ghost" size="icon-lg" aria-label="Redo" disabled={!future.length} onClick={redo}>
                <Redo2 />
              </Button>
              <Button className="ml-1" disabled={!dirty || save.busy} onClick={doSave}>
                {save.busy ? 'Saving…' : 'Save'}
              </Button>
            </>,
          )}
          <div className="scroll-thin min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {editor}
          </div>
          {dialogs}
        </div>
      )
    return (
      <div className="flex h-full flex-col">
        {header(
          'Custom palettes',
          toControls,
          'Back to the controls',
          <span className="pr-2 text-xs text-muted-foreground">{slotsText(used, max)}</span>,
        )}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {list}
        </div>
        {dialogs}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-6xl items-center">
        {header(
          'Custom palettes',
          toControls,
          'Back to the controls',
          <span className="pr-2 text-xs text-muted-foreground">{slotsText(used, max)}</span>,
        )}
      </div>
      {/* the list and the editor scroll on their own, like the columns of the main desktop layout, so a long list
          doesn't push the editor out of view (p-px keeps the cards' outline ring from being clipped, and the corners
          follow that ring: rounded-card-area in index.css) */}
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 gap-6 px-4 pt-2">
        <aside className="scroll-thin w-85 shrink-0 overflow-y-auto rounded-card-area px-px pt-px pb-6">{list}</aside>
        <main className="scroll-thin min-w-0 flex-1 overflow-y-auto rounded-card-area px-px pt-px pb-6">
          {editor ?? (
            <Card>
              <p className="m-0 py-10 text-center text-sm text-muted-foreground">
                Choose a palette on the left, or make a new one.
              </p>
            </Card>
          )}
        </main>
      </div>
      {dialogs}
    </div>
  )
}

const slotsText = (used: number, max: number) => `${used} of ${max} slots used`

// ---------------------------------------------------------------- the list

function PaletteList({
  slots,
  cur,
  max,
  free,
  draft,
  presetsOf,
  onOpen,
  onNew,
}: {
  slots: Slot[]
  cur: number | null
  max: number
  free: number
  draft: Stop[] | null
  presetsOf: (slot: number) => string[]
  onOpen: (slot: number) => void
  onNew: () => void
}) {
  const rows = slots.flatMap((s, i) => (s ? [{ i, stops: s }] : []))
  // a new palette shows in its slot until it's saved
  if (draft && cur !== null && !slots[cur]) rows.push({ i: cur, stops: draft })
  rows.sort((a, b) => a.i - b.i)
  const count = slots.filter((s) => s).length

  return (
    <div className="flex flex-col gap-3">
      {count > 10 && (
        <Alert className="rounded-card border-amber-500/30 bg-amber-500/10 text-amber-200">
          <TriangleAlert aria-hidden />
          <AlertDescription className="text-current">
            Many custom palettes use the light's memory and can make it unstable.{' '}
            <a href="#settings/sec">Back up your settings and presets</a> before adding more.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <h2 className="m-0 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Your palettes</h2>
        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-3 py-6 text-center">
            <span
              aria-hidden
              className="h-5 w-44 rounded-full"
              style={{ background: 'linear-gradient(90deg, #ff9f43, #e91e63, #7c4dff, #1e88e5)' }}
            />
            <p className="m-0 max-w-72 text-sm text-soft">
              Make your own colour gradients for effects. They appear in the palette list for every segment and preset.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-1">
          {rows.map(({ i, stops }) => {
            const names = slots[i] ? presetsOf(i) : []
            const isNew = !slots[i]
            return (
              <button
                key={i}
                type="button"
                aria-pressed={i === cur}
                onClick={() => !isNew && onOpen(i)}
                className={cx(
                  'flex w-full flex-col gap-2 rounded-xl px-3 py-2.5 text-left',
                  i === cur ? 'bg-muted' : 'hover:bg-muted/50',
                )}
              >
                <span className="flex w-full items-baseline gap-2">
                  <span className="font-semibold">Custom {i + 1}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {isNew
                      ? 'New, not saved yet'
                      : names.length
                        ? `In ${names.length} preset${names.length > 1 ? 's' : ''}`
                        : 'Not in a preset'}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="block h-3.5 w-full rounded-full"
                  style={{ background: gradientCss(stops) }}
                />
              </button>
            )
          })}
        </div>
        <Button variant="outline" className="h-11 w-full border-dashed" disabled={free < 0} onClick={onNew}>
          <Plus data-icon="inline-start" />
          New palette
        </Button>
        {free < 0 && (
          <p className="m-0 text-xs text-soft">
            All {max} palette slots on this light are used. Delete one to make room.
          </p>
        )}
      </Card>
      <p className="m-0 px-1.5 text-xs text-muted-foreground">
        Custom palettes show up in the palette list after the built-in ones, for every segment and preset.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- the editor

function Editor({
  compact,
  slot,
  stops,
  sel,
  onSelect,
  onLive,
  onCommit,
  dirty,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  saving,
  onDiscard,
  preview,
  onPreview,
  targets,
  presetNames,
  isLast,
  isNew,
  confirmDelete,
  onAskDelete,
  onDelete,
}: {
  compact: boolean
  slot: number
  stops: Stop[]
  sel: number
  onSelect: (i: number) => void
  onLive: (s: Stop[]) => void
  onCommit: (s: Stop[]) => void
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  saving: boolean
  onDiscard: () => void
  preview: boolean
  onPreview: (on: boolean) => void
  targets: Segment[]
  presetNames: string[]
  isLast: boolean
  isNew: boolean
  confirmDelete: boolean
  onAskDelete: (on: boolean) => void
  onDelete: () => void
}) {
  const effects = useStore((s) => s.effects)
  const stop = stops[sel]
  const end = sel === 0 || sel === stops.length - 1

  // The picker works in HSV; re-derive it only when the colour really changes, so the hue survives colours
  // that have none (greys, black), like the Colour card.
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(stop.rgb))
  const key = `${sel}:${toHex(stop.rgb)}`
  const [hsvKey, setHsvKey] = useState(key)
  if (key !== hsvKey) {
    setHsvKey(key)
    if (toHex(hsvToRgb(hsv)) !== toHex(stop.rgb)) setHsv(rgbToHsv(stop.rgb))
  }
  const recolour = (rgb: RGB) => stops.map((s, i) => (i === sel ? { t: s.t, rgb } : s))
  const commitHsv = (next: HSV) => {
    setHsv(next)
    onCommit(recolour(hsvToRgb(next)))
  }
  const pick = (rgb: RGB) => {
    setHsv(rgbToHsv(rgb))
    onCommit(recolour(rgb))
  }
  const [hex, setHex] = useDraft(toHex(stop.rgb))
  const applyHex = () => {
    const c = fromHex(hex)
    if (c) pick(c)
    else setHex(toHex(stop.rgb))
  }

  const add = () => {
    const r = addColour(stops)
    if (r) {
      onCommit(r[0])
      onSelect(r[1])
    }
  }
  const tools: { label: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; run: () => void }[] = [
    {
      label: compact ? 'Even out' : 'Space evenly',
      Icon: SpreadIcon,
      run: () => onCommit(stops.map((s, i) => ({ t: Math.round((255 * i) / (stops.length - 1)), rgb: s.rgb }))),
    },
    {
      label: 'Reverse',
      Icon: ArrowLeftRight,
      run: () => {
        onCommit(stops.map((s) => ({ t: 255 - s.t, rgb: s.rgb })).reverse())
        onSelect(stops.length - 1 - sel)
      },
    },
    {
      label: 'Generate',
      Icon: Shuffle,
      run: () => {
        onCommit(generate())
        onSelect(0)
      },
    },
  ]
  const full = stops.length >= 18
  // moving the selected colour can carry it past others; the selection goes with it
  const moveSel = (t: number) => {
    const [next, j] = moveTo(stops, sel, t)
    onCommit(next)
    onSelect(j)
  }
  const removeSel = () => {
    if (end) return
    onCommit(stops.filter((_, i) => i !== sel))
    onSelect(Math.max(1, sel - 1))
  }
  const own = stops.filter((s, i) => stops.findIndex((x) => toHex(x.rgb) === toHex(s.rgb)) === i)
  const fxOf = (s: Segment) => effects.find((e) => e.id === s.fx)?.name ?? 'its effect'

  const stepper = (label: string, title: ReactNode) => (
    <span className="flex items-center gap-1">
      <Button
        variant={compact ? 'secondary' : 'ghost'}
        size={compact ? 'icon-lg' : 'icon-sm'}
        className={cx(compact && 'size-11 rounded-full')}
        aria-label="Previous colour"
        disabled={sel === 0}
        onClick={() => onSelect(sel - 1)}
      >
        <ChevronLeft />
      </Button>
      <span className={cx('whitespace-nowrap', label)}>{title}</span>
      <Button
        variant={compact ? 'secondary' : 'ghost'}
        size={compact ? 'icon-lg' : 'icon-sm'}
        className={cx(compact && 'size-11 rounded-full')}
        aria-label="Next colour"
        disabled={sel === stops.length - 1}
        onClick={() => onSelect(sel + 1)}
      >
        <ChevronRight />
      </Button>
    </span>
  )
  const position = (
    <div className="flex items-center gap-1.5">
      <label htmlFor="pal-pos" className={cx('text-[13px] font-medium text-soft', compact && 'flex-1')}>
        Position
      </label>
      <Button
        variant="secondary"
        size="icon-lg"
        className={cx(compact && 'h-10 w-11')}
        aria-label="Move left"
        disabled={end}
        onClick={() => moveSel(stop.t - 1)}
      >
        <Minus />
      </Button>
      <input
        id="pal-pos"
        type="number"
        min={0}
        max={255}
        value={stop.t}
        disabled={end}
        onChange={(e) => e.target.value !== '' && moveSel(Number(e.target.value))}
        className="h-10 w-16 rounded-xl border border-input bg-transparent text-center font-mono text-sm disabled:opacity-50 dark:bg-input/30"
      />
      <Button
        variant="secondary"
        size="icon-lg"
        className={cx(compact && 'h-10 w-11')}
        aria-label="Move right"
        disabled={end}
        onClick={() => moveSel(stop.t + 1)}
      >
        <Plus />
      </Button>
    </div>
  )
  const endNote = end && (
    <p className="m-0 text-xs text-muted-foreground">
      The first and last colours stay at the ends. You can still change their colour.
    </p>
  )
  const picker = (
    <>
      <ColorControls
        title={compact ? 'Colour' : stepper('', `Colour ${sel + 1} of ${stops.length}`)}
        hsv={hsv}
        wheelSize={compact ? 220 : 200}
        onInput={(h) => {
          setHsv(h)
          onLive(recolour(hsvToRgb(h)))
        }}
        onCommitHsv={commitHsv}
        onCommitRgb={(rgb) => onCommit(recolour(rgb))}
      />
      <HexRow hex={hex} onHex={setHex} onApply={applyHex} onPick={pick} />
    </>
  )

  const previewRow = (
    <>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm">{compact ? 'Show on the light' : 'Show on the light while editing'}</div>
          <div className="text-xs text-muted-foreground">
            {compact
              ? 'Pauses the effect while you edit'
              : 'Paints the selected segments with this palette. Their effect pauses until you leave the editor.'}
          </div>
        </div>
        <Switch on={preview} onChange={onPreview} label="Show on the light while editing" />
      </div>
      {preview && targets.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl bg-primary/10 px-3 py-2.5 text-[13px] text-primary ring-1 ring-primary/30">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
          <span>
            Showing on {andList(targets.map(segName))}.{' '}
            {targets.length === 1
              ? `Its effect, ${fxOf(targets[0])}, comes back when you leave.`
              : 'Their effects come back when you leave.'}
          </span>
        </div>
      )}
    </>
  )

  const deleteText = isNew
    ? "It isn't saved yet, so nothing changes on the light."
    : presetNames.length
      ? `${andList(presetNames)} ${presetNames.length > 1 ? 'use' : 'uses'} it. ${
          isLast
            ? `${presetNames.length > 1 ? "They'll" : "It'll"} use the Default palette instead.`
            : `${presetNames.length > 1 ? 'They show' : 'It shows'} grey until you save another palette in its place, which keeps the name Custom ${slot + 1}.`
        }`
      : 'No preset uses it. Its slot stays free for your next new palette.'
  const deleteRow = confirmDelete ? (
    <div role="alert" className="flex flex-col gap-2.5 rounded-2xl bg-destructive/10 p-3.5 ring-1 ring-destructive/30">
      <div className="font-semibold">Delete Custom {slot + 1}?</div>
      <div className="text-[13px] text-soft">{deleteText}</div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onAskDelete(false)}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onAskDelete(true)}>
        <Trash2 data-icon="inline-start" />
        Delete palette
      </Button>
      {!isNew && (
        <span className="text-xs text-muted-foreground">
          {presetNames.length ? `Used in ${andList(presetNames)}.` : 'No preset uses it.'}
        </span>
      )}
    </div>
  )

  const gradient = (
    <GradientEditor stops={stops} sel={sel} onSelect={onSelect} onLive={onLive} onCommit={onCommit} compact={compact} />
  )

  if (compact)
    return (
      <div className="flex flex-col gap-3.5">
        {gradient}
        <div className="grid grid-cols-4 gap-1.5">
          <ToolButton label="Add" icon={<Plus />} onClick={add} disabled={full} primary />
          {tools.map((t) => (
            <ToolButton key={t.label} label={t.label} icon={<t.Icon />} onClick={t.run} />
          ))}
        </div>
        <Card>
          <div className="flex items-center gap-1.5">
            {stepper('px-1 font-semibold', `Colour ${sel + 1} of ${stops.length}`)}
            <span className="flex-1" />
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-11 text-destructive hover:text-destructive"
              aria-label="Remove this colour"
              disabled={end}
              onClick={removeSel}
            >
              <Trash2 />
            </Button>
          </div>
          {position}
          {endNote}
        </Card>
        <Card>{picker}</Card>
        {previewRow}
        <div className="h-px bg-border" />
        {deleteRow}
      </div>
    )

  return (
    <Card className="gap-0">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 text-lg font-semibold">Custom {slot + 1}</h2>
          {dirty && (
            <Badge variant="secondary" className="bg-primary/15 text-primary">
              Unsaved changes
            </Badge>
          )}
          <span className="flex-1" />
          <Button variant="outline" disabled={!dirty || saving} onClick={onDiscard}>
            Discard
          </Button>
          <Button disabled={!dirty || saving} onClick={onSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {gradient}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" disabled={full} onClick={add}>
            <Plus data-icon="inline-start" />
            Add colour
          </Button>
          {tools.map((t) => (
            <Button key={t.label} variant="ghost" onClick={t.run}>
              <t.Icon data-icon="inline-start" />
              {t.label}
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <Button variant="ghost" size="icon" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
            <Undo2 />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
            <Redo2 />
          </Button>
        </div>
        <div className="flex flex-wrap gap-7 rounded-2xl bg-foreground/[0.03] p-4.5 ring-1 ring-foreground/6">
          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5">{picker}</div>
          <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-3.5">
            {position}
            {endNote}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">In this palette</span>
              <div className="flex flex-wrap gap-1.5">
                {own.map((s) => (
                  <button
                    key={toHex(s.rgb)}
                    type="button"
                    aria-label={`Use #${toHex(s.rgb)}`}
                    onClick={() => pick(s.rgb)}
                    className="size-7 rounded-full border"
                    style={{ background: rgbCss(s.rgb) }}
                  />
                ))}
              </div>
            </div>
            <Button
              variant="ghost"
              className="self-start text-destructive hover:text-destructive"
              disabled={end}
              onClick={removeSel}
            >
              <Trash2 data-icon="inline-start" />
              Remove this colour
            </Button>
          </div>
        </div>
        {previewRow}
        <div className="h-px bg-border" />
        {deleteRow}
      </div>
    </Card>
  )
}

function ToolButton({
  label,
  icon,
  onClick,
  disabled,
  primary,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex h-14.5 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl bg-card text-[11.5px] text-soft disabled:opacity-40 [&_svg]:size-[19px]',
        primary && 'text-primary ring-1 ring-primary/45 ring-inset',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

const SpreadIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...props}
  >
    <path d="M3 4v16" />
    <path d="M21 4v16" />
    <rect x="8" y="7" width="8" height="10" rx="1.5" />
  </svg>
)

// ---------------------------------------------------------------- the preview on the light

// Paints the palette (as the light will show it: 16 colours, blended) onto the selected segments, or the main
// one, LED by LED. Setting LEDs freezes a segment (json.cpp), so the segments are unfrozen again when the
// preview stops or the editor closes. Returns the segments it paints.
function usePreview(on: boolean, stops: Stop[] | null) {
  const state = useStore((s) => s.state)
  const arch = useStore((s) => s.info?.arch)
  const segs = state?.seg ?? []
  const picked = segs.filter((s) => s.sel)
  const targets = picked.length ? picked : segs.filter((s) => s.id === state?.mainseg)
  const ids = targets.map((s) => s.id).join(',')
  const painted = useRef<number[]>([])
  const seq = useRef(0)

  useEffect(() => {
    if (!on || !stops) return
    const run = ++seq.current
    const timer = setTimeout(async () => {
      const chunk = arch === 'esp8266' ? 50 : 128
      for (const s of useStore.getState().state?.seg.filter((x) => ids.split(',').includes(String(x.id))) ?? []) {
        const len = (s.stop - s.start) * Math.max(1, (s.stopY ?? 1) - (s.startY ?? 0))
        const cols = onTheLight(stops, len).map(toHex)
        if (!painted.current.includes(s.id)) painted.current.push(s.id)
        for (let j = 0; j < cols.length; j += chunk) {
          if (run !== seq.current) return
          await sendQuiet({ seg: { id: s.id, i: [j, ...cols.slice(j, j + chunk)] } })
          await new Promise((r) => setTimeout(r, 15))
        }
      }
    }, 80)
    return () => clearTimeout(timer)
  }, [on, stops, ids, arch])

  // stopping (or leaving) gives the segments their effects back
  useEffect(() => {
    if (on) return
    if (painted.current.length) {
      seq.current++
      sendQuiet({ seg: painted.current.map((id) => ({ id, frz: false })) })
      painted.current = []
    }
  }, [on])
  useEffect(
    () => () => {
      seq.current++
      if (painted.current.length) sendQuiet({ seg: painted.current.map((id) => ({ id, frz: false })) })
    },
    [],
  )
  return targets
}
