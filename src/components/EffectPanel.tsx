import { useMemo, useState } from 'react'
import { send, useStore } from '../store'
import { useFxMeta, useScrollToSelected, useSelection } from '../hooks'
import { parseFxMeta } from '../api/fxmeta'
import { stockCfg } from '../ui'
import { searchList } from './PalettePanel'
import { Card, Chip, cx, LabeledSlider, SearchField, SectionTitle } from './controls'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const FILTERS = [
  { flag: 'pal', label: 'Palette', title: 'Uses palette' },
  { flag: '0', label: '0D', title: 'Single pixel' },
  { flag: '1', label: '1D', title: '1D' },
  { flag: '2', label: '2D', title: '2D' },
  { flag: 'v', label: 'Volume', title: 'Volume reactive' },
  { flag: 'f', label: 'Frequency', title: 'Frequency reactive' },
]

function tags(flags: string, usesPalette: boolean) {
  const t: string[] = []
  if (usesPalette) t.push('Pal')
  if (flags.includes('0')) t.push('0D')
  if (flags.includes('2')) t.push('2D')
  if (flags.includes('v')) t.push('Vol')
  if (flags.includes('f')) t.push('Freq')
  return t
}

// The effect list: two columns once the list itself is at least 32rem wide (a container query, so it
// adapts to the column it sits in, not the window).
export function EffectList({ className }: { className?: string }) {
  const { main, segLmax, has2D, isMatrix } = useSelection()
  const effects = useStore((s) => s.effects)
  const fxdata = useStore((s) => s.fxdata)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<string[]>([])

  const withMeta = useMemo(() => effects.map((e) => {
    const m = parseFxMeta(e.id, fxdata[e.id])
    return { ...e, flags: m.flags, usesPalette: m.usesPalette, tags: tags(m.flags, m.usesPalette) }
  }), [effects, fxdata])

  const selected = main?.fx ?? 0
  // effects that can't run on the selected segments are hidden, as in the stock UI
  const runnable = withMeta.filter((e) => {
    if (e.id === 0 || e.id === selected) return true
    if (segLmax === 0) return false
    if (segLmax === 1 && !e.flags.includes('0')) return false
    if (!has2D && e.flags.includes('2') && !e.flags.includes('1')) return false
    return true
  })
  const filtered = filters.length
    ? runnable.filter((e, i) => i === 0 || e.id === selected || filters.every((f) => (f === 'pal' ? e.usesPalette : e.flags.includes(f))))
    : searchList(runnable, query, selected)

  // bring the selected effect into view once the list has loaded
  const listRef = useScrollToSelected<HTMLDivElement>(effects.length > 0)

  const toggleFilter = (f: string) => {
    setQuery('')
    setFilters(filters.includes(f) ? filters.filter((x) => x !== f) : [...filters, f])
  }

  return (
    <div className={cx('@container flex min-h-0 flex-col gap-3', className)}>
      <SearchField value={query} onChange={(q) => { setQuery(q); if (q) setFilters([]) }} placeholder={`Search ${effects.length} effects`} />
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {FILTERS.filter((f) => f.flag !== '2' || isMatrix).map((f) => (
          <Chip key={f.flag} on={filters.includes(f.flag)} onClick={() => toggleFilter(f.flag)} title={f.title}>{f.label}</Chip>
        ))}
      </div>
      <div
        ref={listRef}
        role="listbox"
        aria-label="Effects"
        className="scroll-thin -mx-1 grid min-h-0 flex-1 grid-cols-1 content-start gap-1 overflow-y-auto px-1 @lg:grid-cols-2"
      >
        {filtered.map((e) => {
          const sel = e.id === selected
          return (
            <Button
              key={e.id}
              role="option"
              aria-selected={sel}
              variant={sel ? 'secondary' : 'ghost'}
              size="lg"
              onClick={() => send({ seg: { fx: e.id, fxdef: stockCfg.fxdef } })}
              className="justify-between font-normal"
            >
              <span className="truncate">{e.name}</span>
              <span className="flex shrink-0 gap-1">
                {e.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
              </span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}

// Speed / intensity / custom sliders and option toggles, labelled from the effect's metadata.
export function EffectParams({ className }: { className?: string }) {
  const { main } = useSelection()
  const meta = useFxMeta(main?.fx)
  const name = useStore((s) => s.effects.find((e) => e.id === main?.fx)?.name)
  if (!main) return null
  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">{name ?? 'Effect'}</div>
        <div className="flex flex-wrap gap-1.5">
          {meta.options.map((o) => (
            <Chip key={o.key} on={main[o.key]} onClick={() => send({ seg: { [o.key]: !main[o.key] } })}>{o.label}</Chip>
          ))}
        </div>
      </div>
      {meta.sliders.map((s) => (
        <LabeledSlider key={s.key} label={s.label} value={main[s.key]} max={s.max} onCommit={(v) => send({ seg: { [s.key]: v } })} />
      ))}
      {!meta.sliders.length && !meta.options.length && <p className="m-0 text-[13px] text-muted-foreground">This effect has no settings.</p>}
    </div>
  )
}

export function EffectPanel({ className }: { className?: string }) {
  const count = useStore((s) => s.effects.length)
  return (
    <Card className={cx('min-h-0', className)}>
      <SectionTitle right={<span className="text-xs text-muted-foreground">{count} effects</span>}>Effect</SectionTitle>
      <EffectList className="flex-1" />
      <EffectParams className="rounded-xl bg-bg px-4 py-3" />
    </Card>
  )
}
