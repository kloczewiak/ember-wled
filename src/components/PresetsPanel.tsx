import { useMemo, useState } from 'react'
import { presetsBackup, presetsChanged, send, toast, uploadPresets, useStore } from '../store'
import type { Command, Playlist, Preset, Presets } from '../api/types'
import { useUi } from '../ui'
import { Button, Card, Check, cx, Field, Icon, inputCls, SearchField, SectionTitle } from './controls'
import { Badge } from '@/components/ui/badge'
import { Button as UiButton } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { comparePresets } from '../lib/presets'

const pName = (presets: Presets | null, id: number) => presets?.[id]?.n || `Preset ${id}`
const isPlaylist = (p?: Preset) => !!p?.playlist?.ps

export function applyPreset(id: number) {
  const { presets } = useStore.getState()
  const p = presets?.[id]
  let cmd: Command = { ps: id }
  if (p && !isPlaylist(p) && !(p.win && p.win.indexOf('Please') > 0)) {
    // send the preset content directly so the device doesn't have to read it from flash first
    const { ql: _ql, n: _n, ...content } = p
    cmd = { pd: id, ...content }
  }
  if (isPlaylist(p)) cmd.on = true
  toast(`Loading preset ${pName(presets, id)} (${id})`)
  send(cmd)
}

export function QuickLoad({ className }: { className?: string }) {
  const presets = useStore((s) => s.presets)
  const state = useStore((s) => s.state)
  const current = state ? (state.pl < 0 ? state.ps : state.pl) : -1
  const ql = Object.entries(presets ?? {}).filter(([, p]) => p.ql).sort(([a], [b]) => Number(a) - Number(b))
  if (!ql.length) return null
  return (
    <div className={cx('grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5', className)}>
      {ql.map(([id, p]) => (
        <UiButton
          key={id}
          variant={Number(id) === current ? 'secondary' : 'outline'}
          size="lg"
          title={pName(presets, Number(id))}
          onClick={() => applyPreset(Number(id))}
          className="truncate"
        >
          {p.ql}
        </UiButton>
      ))}
    </div>
  )
}

export function PresetsPanel({ className }: { className?: string }) {
  const { idsort, pid } = useUi((s) => s.stock)
  const presets = useStore((s) => s.presets)
  const presetsError = useStore((s) => s.presetsError)
  const state = useStore((s) => s.state)
  const info = useStore((s) => s.info)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<number | 'new' | 'newpl' | null>(null)

  const sorted = useMemo(() => Object.entries(presets ?? {}).filter(([, p]) => p && typeof p === 'object').sort(comparePresets(idsort)), [presets, idsort])
  const current = state ? (state.pl < 0 ? state.ps : state.pl) : -1
  const q = query.toUpperCase()
  const shown = query
    ? sorted.filter(([, p]) => (p.n ?? '').toUpperCase().includes(q)).sort(([, a], [, b]) => (a.n ?? '').toUpperCase().indexOf(q) - (b.n ?? '').toUpperCase().indexOf(q))
    : sorted

  return (
    <Card className={className}>
      <SectionTitle
        right={
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => setEditing('newpl')}>
              <Icon.plus className="size-3.5" />Playlist
            </Button>
            <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
              <Icon.plus className="size-3.5" />Preset
            </Button>
          </div>
        }
      >
        Presets
      </SectionTitle>
      <QuickLoad />
      {(editing === 'new' || editing === 'newpl') && <PresetEditor id={0} playlist={editing === 'newpl'} onClose={() => setEditing(null)} />}
      {presetsError ? (
        <PresetsProblem empty={false} />
      ) : presets === null ? (
        <p className="m-0 text-[13px] text-muted-foreground">Loading…</p>
      ) : !sorted.length ? (
        <PresetsProblem empty />
      ) : (
        <>
          {sorted.length > 6 && <SearchField value={query} onChange={setQuery} placeholder="Search presets" />}
          <div className="flex flex-col gap-1">
            {shown.map(([key, p]) => {
              const id = Number(key)
              return (
                <div key={key} className={cx('rounded-lg', (editing === id || id === current) && 'bg-muted')}>
                  <div className="flex items-center gap-1 pl-3">
                    {pid && <span className="w-6 shrink-0 font-mono text-[11px] text-muted-foreground">{id}</span>}
                    <UiButton variant="ghost" size="lg" className="min-w-0 flex-1 justify-start font-normal" onClick={() => applyPreset(id)}>
                      <span className="truncate">{pName(presets, id)}</span>
                    </UiButton>
                    {id === info?.leds.bootps && <span title="Applied at boot" className="text-primary"><Icon.star className="size-4" /></span>}
                    {isPlaylist(p) && <Badge variant="secondary">Playlist</Badge>}
                    <UiButton
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Edit ${pName(presets, id)}`}
                      aria-expanded={editing === id}
                      onClick={() => setEditing(editing === id ? null : id)}
                    >
                      <Icon.edit />
                    </UiButton>
                  </div>
                  {editing === id && <PresetEditor id={id} playlist={isPlaylist(p)} onClose={() => setEditing(null)} />}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}

function PresetsProblem({ empty }: { empty: boolean }) {
  const backup = presetsBackup()
  const hasBackup = !!backup && backup.length > 10
  const [text, setText] = useState(backup ?? '')
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-bg p-3 text-[13px]">
      <p className="m-0">{empty ? 'You have no presets yet!' : 'Sorry, there was an issue loading your presets!'}</p>
      {!empty && <Button onClick={() => { useStore.setState({ presetsError: false }); presetsChanged() }}>Try again</Button>}
      {hasBackup && (
        <>
          <p className="m-0 text-muted-foreground">
            {empty ? 'There is a backup of presets from a previous installation. Saving a preset will overwrite it.' : 'Here is a backup of the last known good presets:'}
          </p>
          <textarea className={cx(inputCls, 'h-24 py-2 font-mono text-xs')} value={text} onChange={(e) => setText(e.target.value)} aria-label="Presets backup" />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard!'))}>Copy to clipboard</Button>
            <Button className="flex-1" onClick={() => uploadPresets(text)}>Restore</Button>
          </div>
        </>
      )}
    </div>
  )
}

const toArr = (v: number[] | number | undefined, len: number, fallback: number) => {
  const a = Array.isArray(v) ? [...v] : [typeof v === 'number' ? v : fallback]
  while (a.length < len) a.push(a[a.length - 1])
  return a.slice(0, len)
}

function normalizePlaylist(pl: Playlist | undefined, transition: number): Required<Playlist> & { dur: number[]; transition: number[] } {
  const ps = pl?.ps?.length ? [...pl.ps] : [1]
  return {
    ps,
    dur: toArr(pl?.dur, ps.length, 100),
    transition: toArr(pl?.transition, ps.length, transition),
    repeat: pl?.repeat ?? 0,
    r: pl?.r ?? false,
    end: pl?.end ?? 0,
  }
}

// API command text for an existing preset: its raw HTTP-API string, or its JSON without name/quick load.
function apiText(p?: Preset) {
  if (!p) return ''
  if (p.win) return p.win
  const { n: _n, p: _p, ql: _ql, ...rest } = p
  return JSON.stringify(rest)
}

function PresetEditor({ id, playlist, onClose }: { id: number; playlist: boolean; onClose: () => void }) {
  const presets = useStore((s) => s.presets) ?? {}
  const state = useStore((s) => s.state)!
  const info = useStore((s) => s.info)!
  const existing = id > 0 ? presets[id] : undefined
  const lowestUnused = (() => { let l = 1; while (presets[l] && l < 250) l++; return l })()

  const [name, setName] = useState(id > 0 ? pName(presets, id) : playlist ? '' : (useStore.getState().effects.find((e) => e.id === state.seg.find((s) => s.id === state.mainseg)?.fx)?.name ?? ''))
  const [ql, setQl] = useState(existing?.ql ?? '')
  // "use current state" for new presets; existing presets open on their API command instead
  const [useState_, setUseState] = useState(id === 0 || playlist)
  const [api, setApi] = useState(apiText(existing))
  const [ib, setIb] = useState(true)
  const [sb, setSb] = useState(true)
  const [sc, setSc] = useState(false)
  const [ledmap, setLedmap] = useState('')
  const [boot, setBoot] = useState(id > 0 && id === info.leds.bootps)
  const [saveId, setSaveId] = useState(String(id > 0 ? id : lowestUnused))
  const [pl, setPl] = useState(() => normalizePlaylist(existing?.playlist, state.transition))
  const [warn, setWarn] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [testing, setTesting] = useState(false)

  const targetId = Number(saveId)
  const overwrite = presets[targetId] && (id === 0 || targetId !== id) ? `Overwriting ${pName(presets, targetId)}!` : ''

  const save = () => {
    let pI = targetId
    if (!pI || pI < 1) pI = id > 0 ? id : lowestUnused
    if (pI > 250) { setWarn('ID must be 250 or less.'); return }
    const n = name || `${playlist ? 'Playlist' : 'Preset'} ${pI}`
    let cmd: Command = {}
    if (!useState_) {
      try { cmd = JSON.parse(api) } catch {
        if (api.length < 2) { setWarn('Please enter your API command first'); return }
        if (api.includes('{')) { setWarn('Syntax error in custom JSON API command'); return }
        cmd = { win: api }
      }
      cmd.o = true
    } else if (playlist) {
      cmd = { playlist: { ...pl, transition: pl.transition.map((t, i) => (pl.dur[i] > 0 ? Math.min(t, pl.dur[i]) : t)) }, on: true, o: true }
    } else {
      cmd = { ib, sb, sc }
      if (ledmap !== '') cmd.ledmap = Number(ledmap)
    }
    if (boot) cmd.bootps = pI
    cmd.psave = pI
    cmd.n = n
    if (ql) cmd.ql = ql
    toast(`Saving ${n} (${pI})`)
    send(cmd)
    // show it in the list right away; the file is re-read from the device shortly after
    const { psave: _ps, o: _o, ...stored } = cmd
    useStore.setState({ presets: { ...presets, [pI]: cmd.o ? (stored as Preset) : { n, ql: ql || undefined } } })
    presetsChanged()
    onClose()
  }

  const remove = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    send({ pdel: id })
    const rest = { ...presets }
    delete rest[id]
    useStore.setState({ presets: rest })
    presetsChanged()
    onClose()
  }

  const test = () => {
    if (testing) send({ playlist: {} })
    else send({ playlist: pl, on: true })
    setTesting(!testing)
  }

  return (
    <div className={cx('flex flex-col gap-3 p-3', id === 0 && 'rounded-xl border border-primary bg-raised')}>
      <div className="grid grid-cols-[1fr_72px] gap-2">
        <Field label="Name"><input className={inputCls} value={name} maxLength={32} placeholder="Enter name..." autoFocus={id === 0} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Quick load"><input className={inputCls} value={ql} maxLength={2} onChange={(e) => setQl(e.target.value)} /></Field>
      </div>
      {!(playlist && id === 0) && (
        <Check checked={useState_} onChange={setUseState}>
          {playlist ? 'Show playlist editor' : id > 0 ? 'Overwrite with current state' : 'Use current state'}
        </Check>
      )}

      {!useState_ ? (
        <Field label="API command">
          <textarea className={cx(inputCls, 'h-24 py-2 font-mono text-xs')} value={api} onChange={(e) => setApi(e.target.value)} />
        </Field>
      ) : playlist ? (
        <PlaylistEditor id={id} pl={pl} setPl={setPl} presets={presets} />
      ) : (
        <div className="flex flex-col">
          <Check checked={ib} onChange={setIb}>Include brightness</Check>
          <Check checked={sb} onChange={setSb}>Save segment bounds</Check>
          <Check checked={sc} onChange={setSc}>Checked segments only</Check>
          {(info.maps?.length ?? 0) > 1 && (
            <Field label="LED map" className="mt-1">
              <NativeSelect className="w-full" value={ledmap} onChange={(e) => setLedmap(e.target.value)}>
                <option value="">Unchanged</option>
                {info.maps!.map((m) => <option key={m.id} value={m.id}>{m.id === 0 ? 'Default' : m.n || `ledmap${m.id}.json`}</option>)}
              </NativeSelect>
            </Field>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Check checked={boot} onChange={setBoot}>Apply at boot</Check>
        <Field label="Save to ID" className="ml-auto w-24">
          <input className={cx(inputCls, 'font-mono')} inputMode="numeric" value={saveId} onChange={(e) => setSaveId(e.target.value.replace(/[^0-9]/g, ''))} />
        </Field>
      </div>
      {(warn || overwrite || targetId > 250) && (
        <p className="m-0 text-xs text-warn-fg">⚠ {warn || (targetId > 250 ? 'ID must be 250 or less.' : overwrite)}</p>
      )}

      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={save}><Icon.check className="size-4" />Save</Button>
        {playlist && useState_ && (
          <Button className="flex-1" onClick={test}>{testing ? <><Icon.stop className="size-4" />Stop</> : <><Icon.play className="size-4" />Test</>}</Button>
        )}
        {id > 0 ? (
          <Button variant="danger" onClick={remove} onBlur={() => setConfirmDelete(false)} aria-label="Delete preset">
            <Icon.trash className="size-4" />{confirmDelete && 'Delete!'}
          </Button>
        ) : (
          <Button onClick={onClose}>Cancel</Button>
        )}
      </div>
    </div>
  )
}

type PlaylistState = ReturnType<typeof normalizePlaylist>

function PlaylistEditor({ id, pl, setPl, presets }: { id: number; pl: PlaylistState; setPl: (p: PlaylistState) => void; presets: Presets }) {
  const idsort = useUi((s) => s.stock.idsort)
  const manual = pl.dur.every((d) => d === 0)
  // endless playlists (and this playlist itself) can't be entries
  const options = Object.entries(presets)
    .filter(([key, p]) => !isPlaylist(p) || ((p.playlist!.repeat ?? 0) > 0 && Number(key) !== id))
    .sort(comparePresets(idsort))
  const update = (patch: Partial<PlaylistState>) => setPl({ ...pl, ...patch })
  const setAt = (field: 'ps' | 'dur' | 'transition', i: number, v: number) => update({ [field]: pl[field].map((x, j) => (j === i ? v : x)) })
  const add = (i: number) => update({
    ps: [...pl.ps.slice(0, i + 1), pl.ps[i] ?? 1, ...pl.ps.slice(i + 1)],
    dur: [...pl.dur.slice(0, i + 1), pl.dur[i] ?? 100, ...pl.dur.slice(i + 1)],
    transition: [...pl.transition.slice(0, i + 1), pl.transition[i] ?? 7, ...pl.transition.slice(i + 1)],
  })
  const del = (i: number) => pl.ps.length > 1 && update({ ps: pl.ps.filter((_, j) => j !== i), dur: pl.dur.filter((_, j) => j !== i), transition: pl.transition.filter((_, j) => j !== i) })
  const tenths = (s: string) => Math.max(0, Math.round(parseFloat(s) * 10) || 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_64px_56px_28px_28px] gap-1.5 text-[11px] text-muted-foreground">
        <span>Preset</span><span>Duration (s)</span><span>Fade (s)</span><span /><span />
      </div>
      {pl.ps.map((ps, i) => (
        <div key={i} className="grid grid-cols-[1fr_64px_56px_28px_28px] items-center gap-1.5">
          <NativeSelect className="w-full" aria-label={`Entry ${i + 1} preset`} value={ps} onChange={(e) => setAt('ps', i, Number(e.target.value))}>
            {!presets[ps] && <option value={ps}>Preset {ps}</option>}
            {options.map(([key, p]) => <option key={key} value={key}>{pName(presets, Number(key))}{isPlaylist(p) ? ' ▶' : ''}</option>)}
          </NativeSelect>
          <input className={cx(inputCls, 'px-1.5 font-mono text-xs')} aria-label={`Entry ${i + 1} duration in seconds, 0 for forever`} inputMode="decimal"
            defaultValue={pl.dur[i] / 10} readOnly={manual} key={`d${i}-${manual}`} onChange={(e) => setAt('dur', i, tenths(e.target.value))} />
          <input className={cx(inputCls, 'px-1.5 font-mono text-xs')} aria-label={`Entry ${i + 1} transition in seconds`} inputMode="decimal"
            defaultValue={pl.transition[i] / 10} onChange={(e) => setAt('transition', i, Math.min(655, tenths(e.target.value)))} />
          <UiButton variant="ghost" size="icon-sm" aria-label={`Add entry after ${i + 1}`} onClick={() => add(i)}><Icon.plus /></UiButton>
          <UiButton variant="ghost" size="icon-sm" aria-label={`Remove entry ${i + 1}`} disabled={pl.ps.length < 2} onClick={() => del(i)}><Icon.x /></UiButton>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-x-3">
        <Check checked={pl.r} onChange={(r) => update({ r })}>Shuffle</Check>
        <Check checked={manual} onChange={(m) => update({ dur: pl.dur.map(() => (m ? 0 : 100)) })}>Manual advance</Check>
        <Check checked={pl.repeat === 0} onChange={(inf) => update({ repeat: inf ? 0 : 1, end: inf ? 0 : pl.end })}>Repeat indefinitely</Check>
      </div>
      {pl.repeat > 0 && (
        <div className="grid grid-cols-[96px_1fr] gap-2">
          <Field label="Repeat times">
            <input className={cx(inputCls, 'font-mono')} inputMode="numeric" defaultValue={pl.repeat}
              onChange={(e) => update({ repeat: Math.min(127, Math.max(1, parseInt(e.target.value) || 1)) })} />
          </Field>
          <Field label="End preset">
            <NativeSelect className="w-full" value={pl.end} onChange={(e) => update({ end: Number(e.target.value) })}>
              <option value={0}>None</option>
              <option value={255}>Restore preset</option>
              {options.map(([key]) => <option key={key} value={key}>{pName(presets, Number(key))}</option>)}
            </NativeSelect>
          </Field>
        </div>
      )}
    </div>
  )
}
