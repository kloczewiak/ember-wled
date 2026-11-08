import { useMemo, useState, type ReactNode } from 'react'
import { Download, XIcon } from 'lucide-react'
import { toast, useStore } from '../store'
import { useFxMeta, useSelection } from '../hooks'
import { Chip, cx, SearchField } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  cachedCollection,
  downloadCollection,
  fromPalx,
  generate,
  gradientCss,
  GROUPS,
  TWO_COLOURS,
  type Collected,
  type Slot,
  type Stop,
} from './palettes'

// Where a new palette starts: two colours, a copy of the palette in use, a generated one, or a copy of a
// built-in palette, one of yours or one from the downloadable collection. A dialog on wide screens, a sheet
// from the bottom on phones.

const GROUP_LABEL: Record<string, string> = {
  colorful: 'Colourful',
  thematic: 'Thematic',
  pastel: 'Pastel',
  striped: 'Striped',
  gradient: 'Gradient',
  monochrome: 'Monochrome',
}

type Source = 'builtin' | 'yours' | 'more'
type Item = { key: string; name: string; by?: string; stops: Stop[] }

export function NewPalette({
  open,
  onOpenChange,
  wide,
  slot,
  slots,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  wide: boolean
  slot: number
  slots: Slot[]
  onPick: (stops: Stop[]) => void
}) {
  const title = 'New palette'
  const sub = `Saved as Custom ${slot + 1}, the first free slot. You can change everything in the editor afterwards.`
  const body = <Choices slots={slots} onPick={onPick} />
  if (wide)
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)] gap-4 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{sub}</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent className="h-[calc(100dvh-5rem)]">
        <DrawerHeader className="flex-row items-start justify-between gap-2 pb-2 text-left">
          <div className="flex min-w-0 flex-col gap-1 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{sub}</DrawerDescription>
          </div>
          <DrawerClose render={<Button variant="ghost" size="icon-sm" />}>
            <XIcon />
            <span className="sr-only">Close</span>
          </DrawerClose>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{body}</div>
      </DrawerContent>
    </Drawer>
  )
}

function Choices({ slots, onPick }: { slots: Slot[]; onPick: (stops: Stop[]) => void }) {
  const palettes = useStore((s) => s.palettes)
  const palx = useStore((s) => s.palx)
  const info = useStore((s) => s.info)
  const { main, hasRGB } = useSelection()
  const meta = useFxMeta(main?.fx)
  const [source, setSource] = useState<Source>('builtin')
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState<Collected[] | null>(() => cachedCollection())
  const [group, setGroup] = useState<string>('all')
  const [loading, setLoading] = useState(false)

  // Only when the effect uses a palette at all (as the palette card decides). Default (0) depends on the effect
  // and 1 is random, so they can't be copied; the "* Color" palettes (2-5) use the segment's colours.
  const inUse = main && hasRGB && meta.palette.shown && main.pal >= 2 ? fromPalx(palx[main.pal], main.col) : null
  const inUseName = main ? (palettes.find((p) => p.id === main.pal)?.name ?? `Custom ${200 - main.pal + 1}`) : ''

  const items: Item[] = useMemo(() => {
    if (source === 'yours')
      return slots.flatMap((s, i) => (s ? [{ key: `c${i}`, name: `Custom ${i + 1}`, stops: s }] : []))
    if (source === 'more')
      return (collection ?? [])
        .filter((p) => group === 'all' || p.group === group)
        .map((p, i) => ({ key: `m${i}`, name: p.name, by: p.author, stops: p.stops }))
    // the fixed palettes after the ones that depend on the effect or the colour slots
    return palettes
      .filter((p) => p.id >= 6 && p.id < (info?.palcount ?? 72))
      .flatMap((p) => {
        const stops = fromPalx(palx[p.id], main?.col ?? [])
        return stops ? [{ key: `b${p.id}`, name: p.name, stops }] : []
      })
  }, [source, slots, collection, group, palettes, palx, info, main])
  const q = query.trim().toLowerCase()
  const shown = q ? items.filter((it) => it.name.toLowerCase().includes(q) || it.by?.toLowerCase().includes(q)) : items

  const download = async () => {
    setLoading(true)
    try {
      setCollection(await downloadCollection())
    } catch {
      toast("Couldn't download the palettes. Your browser needs internet for this.", true)
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto md:flex-row md:overflow-visible">
      <section className="flex shrink-0 flex-col gap-2 md:w-60">
        <h3 className="m-0 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Start with</h3>
        <Start title="Two colours" sub="A plain gradient to build on" stops={TWO_COLOURS} onPick={onPick} />
        {inUse && (
          <Start
            title="Copy the palette in use"
            sub={`${inUseName}, on ${main!.n || `Segment ${main!.id}`}`}
            stops={inUse}
            onPick={onPick}
          />
        )}
        <Start
          title="Generate one"
          sub="Random colours that go together"
          stops={null}
          onPick={() => onPick(generate())}
        />
      </section>

      <section className="flex min-h-[22rem] min-w-0 flex-1 flex-col gap-2.5">
        <h3 className="m-0 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Or copy one</h3>
        <SearchField value={query} onChange={setQuery} placeholder="Search palettes" />
        <div className="flex flex-wrap gap-1.5">
          <Chip on={source === 'builtin'} onClick={() => setSource('builtin')}>
            Built in
          </Chip>
          <Chip on={source === 'yours'} onClick={() => setSource('yours')}>
            Your palettes
          </Chip>
          <Chip on={source === 'more'} onClick={() => setSource('more')}>
            {!collection && <Download data-icon="inline-start" />}
            More collections
          </Chip>
        </div>
        {source === 'more' && !collection ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl bg-muted/50 p-4">
            <p className="m-0 text-sm text-soft">
              739 free palettes picked from the cpt-city archive by the WLED team, in six groups. Your browser downloads
              them (about 240 KB), so it needs internet; the light doesn't. They stay on this device for next time, and
              nothing goes to the light until you save one.
            </p>
            <Button onClick={download} disabled={loading}>
              <Download data-icon="inline-start" />
              {loading ? 'Downloading…' : 'Download collections'}
            </Button>
          </div>
        ) : (
          <>
            {source === 'more' && (
              <div className="flex flex-wrap gap-1.5">
                {['all', ...GROUPS].map((g) => (
                  <Chip key={g} on={group === g} onClick={() => setGroup(g)}>
                    {g === 'all' ? 'All' : GROUP_LABEL[g]}
                  </Chip>
                ))}
              </div>
            )}
            <div className="scroll-thin -mx-1.5 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1.5 md:h-80">
              {shown.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => onPick(it.stops)}
                  aria-label={`Copy ${it.name}`}
                  className="grid h-11 shrink-0 grid-cols-[minmax(0,8.5rem)_1fr] items-center gap-3 rounded-xl px-2.5 text-left hover:bg-muted"
                >
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate">{it.name}</span>
                    {it.by && <span className="truncate text-[11px] text-muted-foreground">by {it.by}</span>}
                  </span>
                  <span aria-hidden className="h-3 rounded-full" style={{ background: gradientCss(it.stops) }} />
                </button>
              ))}
              {!shown.length && (
                <p className="m-2 text-sm text-muted-foreground">
                  {source === 'yours' && !q ? 'You have no custom palettes yet.' : 'No palette matches that name.'}
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Start({
  title,
  sub,
  stops,
  onPick,
}: {
  title: string
  sub: ReactNode
  stops: Stop[] | null
  onPick: (s: Stop[]) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(stops ?? TWO_COLOURS)}
      className="flex min-h-15 w-full items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2 text-left hover:bg-muted"
    >
      <span
        aria-hidden
        className={cx('h-9 w-14 shrink-0 rounded-lg')}
        style={{
          background: stops ? gradientCss(stops) : 'linear-gradient(90deg, #7b1fa2, #e91e63, #ffb300, #00acc1)',
        }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-[13px] text-muted-foreground">{sub}</span>
      </span>
    </button>
  )
}
