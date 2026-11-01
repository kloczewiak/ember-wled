import { useMemo, useState } from 'react'
import { send, useStore } from '../store'
import { useFxMeta, useScrollToSelected, useSelection } from '../hooks'
import type { Color, PaletteStop } from '../api/types'
import { Card, cx, SearchField, SectionTitle } from './ui'

// CSS gradient for a palette preview from /json/palx data; "c1".."c3" stops use the segment's colour slots.
function gradient(stops: PaletteStop[] | undefined, col: Color[]) {
  if (!stops?.length) return undefined
  const list = stops.length === 1 ? [stops[0], stops[0]] : stops
  const parts = list.map((e, j) => {
    let rgb: number[]
    let pos: number
    if (Array.isArray(e)) { pos = Math.round((e[0] / 255) * 100); rgb = e.slice(1) }
    else {
      pos = Math.round((j / (list.length - 1)) * 100)
      rgb = e === 'r' ? [0, 1, 2].map(() => Math.floor(Math.random() * 255)) : (col[Number(e[1]) - 1] ?? [0, 0, 0]).slice(0, 3).map((v) => v ?? 0)
    }
    if (stops.length === 1 && j === 1) pos = 100
    return `rgb(${rgb.join(',')}) ${pos}%`
  })
  return `linear-gradient(to right, ${parts.join(',')})`
}

// Search like the stock UI: matching names first, ordered by where the match is; Default and the selected
// palette stay visible.
export function searchList<T extends { id: number; name: string }>(list: T[], query: string, selected: number, pinFirst = true) {
  if (!query) return list
  const q = query.toUpperCase()
  return list
    .map((item, i) => ({ item, i, idx: item.name.toUpperCase().indexOf(q) }))
    .filter(({ item, i, idx }) => idx >= 0 || item.id === selected || (pinFirst && i === 0))
    .sort((a, b) => (pinFirst && a.i === 0 ? -1 : pinFirst && b.i === 0 ? 1 : (a.idx < 0 ? 1e9 : a.idx) - (b.idx < 0 ? 1e9 : b.idx) || a.item.name.localeCompare(b.item.name)))
    .map(({ item }) => item)
}

export function PalettePanel({ className }: { className?: string }) {
  const { main, hasRGB } = useSelection()
  const meta = useFxMeta(main?.fx)
  const palettes = useStore((s) => s.palettes)
  const palx = useStore((s) => s.palx)
  const info = useStore((s) => s.info)
  const [query, setQuery] = useState('')

  const all = useMemo(() => {
    const list = [...palettes]
    for (let j = 0; j < (info?.umpalcount ?? 0); j++) list.push({ id: 255 - j, name: info?.umpalnames?.[j] ?? `Usermod ${j}` })
    for (let j = 0; j < (info?.cpalcount ?? 0); j++) {
      const id = 200 - j
      const pd = palx[id]
      // gaps in the custom palette numbering are filled with grey placeholders
      if (pd?.length === 16 && pd.every((e) => Array.isArray(e) && e[1] === 128 && e[2] === 128 && e[3] === 128)) continue
      list.push({ id, name: `~ Custom ${j} ~` })
    }
    return list
  }, [palettes, info, palx])

  const shown = searchList(all, query, main?.pal ?? 0)
  const usable = hasRGB && meta.palette.shown
  const listRef = useScrollToSelected<HTMLDivElement>(usable && all.length > 0)

  return (
    <Card className={cx('min-h-0', className)}>
      <SectionTitle right={<a href="/cpal.htm" className="text-xs text-soft no-underline hover:text-fg">Custom palettes</a>}>
        {meta.palette.label}
      </SectionTitle>
      {!usable ? (
        <p className="m-0 text-[13px] text-muted">{hasRGB ? 'This effect does not use a palette.' : 'Palettes need an RGB segment.'}</p>
      ) : (
        <>
          <SearchField value={query} onChange={setQuery} placeholder={`Search ${all.length} palettes`} />
          <div ref={listRef} className="scroll-thin -mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1" role="listbox" aria-label="Palettes">
            {shown.map((p) => {
              const sel = p.id === main?.pal
              return (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={sel}
                  onClick={() => send({ seg: { pal: p.id } })}
                  className={cx(
                    'grid min-h-10 shrink-0 grid-cols-[minmax(0,120px)_1fr] items-center gap-3 rounded-lg border px-2.5 text-left text-[13px]',
                    sel ? 'border-accent bg-hover' : 'border-transparent hover:bg-hover',
                  )}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="h-3.5 rounded-full bg-line" style={{ background: gradient(palx[p.id], main?.col ?? []) }} />
                </button>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}
