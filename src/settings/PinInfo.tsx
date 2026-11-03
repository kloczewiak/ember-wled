import { useEffect, useState } from 'react'
import { Card, cx } from '../components/controls'
import { ChoiceChip } from './shared'

// Settings → Pin info: which GPIOs are used and by what, like the firmware's page in WLED v16.0.1
// (data/settings_pininfo.htm), refreshed 4 times a second so button and relay states show live. Touch
// capability and pins reserved by usermods come only from the settings script, so they aren't shown.

interface Pin {
  p: number // GPIO
  c?: number // capabilities: 0x02 analog, 0x08 flash boot, 0x10 bootstrap, 0x20 input only
  a: boolean // allocated
  o?: number // owner (0x85 = button)
  n?: string // owner name
  t?: number // button type
  s?: number // state, for buttons and outputs
  r?: number // raw touch or analog reading
}

const BUTTON_TYPES = ['None', 'Reserved', 'Push', 'Push inverted', 'Switch', 'PIR', 'Touch', 'Analog', 'Analog inverted', 'Touch switch']

const owner = (p: Pin) => p.n || (p.o === undefined || p.o === 0 ? 'System' : p.o === 0x85 ? 'Button' : `Usermod #${p.o}`)

function notes(c = 0) {
  return [c & 0x02 && 'Analog', c & 0x20 && 'Input only', c & 0x08 && 'Flash boot', c & 0x10 && 'Bootstrap'].filter(Boolean).join(', ')
}

type Filter = 'all' | 'used' | 'free'
// rows: single pins, or a run of consecutive system pins (e.g. the flash pins)
type Row = { from: Pin; to: Pin }

export function PinInfo() {
  const [pins, setPins] = useState<Pin[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let stop = false
    let timer = 0
    const load = async () => {
      try {
        const j = await fetch('/json/pins', { signal: AbortSignal.timeout(3000) }).then((r) => r.json())
        if (!stop) { setPins(j.pins ?? []); setFailed(false) }
      } catch {
        if (!stop) setFailed(true)
      }
      if (!stop) timer = window.setTimeout(load, 250)
    }
    load()
    return () => { stop = true; clearTimeout(timer) }
  }, [])

  if (!pins) return <p className="text-sm text-muted-foreground">{failed ? 'Couldn\'t load the pin info.' : 'Loading pins…'}</p>
  if (!pins.length) return <p className="text-sm text-muted-foreground">No pins available.</p>

  const shown = pins.filter((p) => filter === 'all' || (filter === 'used') === p.a)
  const system = (p: Pin) => p.a && owner(p) === 'System' && p.s === undefined
  const rows: Row[] = []
  for (const p of shown) {
    const last = rows[rows.length - 1]
    if (last && system(p) && system(last.to) && last.to.p === p.p - 1 && (last.to.c ?? 0) === (p.c ?? 0)) last.to = p
    else rows.push({ from: p, to: p })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center gap-1.5">
          {([['all', 'All'], ['used', 'In use'], ['free', 'Free']] as const).map(([k, label]) => (
            <ChoiceChip key={k} on={filter === k} onChange={() => setFilter(k)}>{label}</ChoiceChip>
          ))}
          {failed && <span className="ml-auto text-xs text-destructive">Not updating</span>}
        </div>
        <table className="w-full border-collapse text-sm">
          <thead className="sr-only"><tr><th>GPIO</th><th>Used by</th><th>Notes</th></tr></thead>
          <tbody>
            {rows.map(({ from: p, to }) => (
              <tr key={p.p} className="border-t first:border-t-0">
                <td className="w-14 py-2 pr-2 font-mono text-muted-foreground">{p.p === to.p ? p.p : `${p.p}–${to.p}`}</td>
                <td className="py-2 pr-2">
                  {p.a ? (
                    <span className="flex items-center gap-2">
                      {p.s !== undefined && <span className={cx('size-2 shrink-0 rounded-full', p.s ? 'bg-green-500' : 'bg-muted-foreground/50')} aria-label={p.s ? 'On' : 'Off'} />}
                      {owner(p)}
                      {p.t !== undefined && <span className="text-xs text-muted-foreground">{BUTTON_TYPES[p.t] ?? '?'}</span>}
                      {p.r !== undefined && <span className="font-mono text-xs text-muted-foreground">{p.r}</span>}
                    </span>
                  ) : <span className="text-primary">Free</span>}
                </td>
                <td className="py-2 text-right text-xs text-muted-foreground">{notes(p.c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="m-0 text-sm text-muted-foreground">No pins.</p>}
      </Card>
    </div>
  )
}
