import type { Command, Segment, State } from './types'

// Applies a JSON API command to a state object the way the firmware would (for the fields the UI uses).
// The UI uses it for optimistic updates; the mock device uses it as its whole state machine.
export function applyCommand(state: State, cmd: Command): State {
  const s: State = structuredClone(state)

  for (const key of ['bri', 'transition', 'bs', 'ledmap', 'lor', 'mainseg'] as const) {
    if (typeof cmd[key] === 'number') (s as unknown as Record<string, number>)[key] = cmd[key] as number
  }
  if (cmd.on === 't') s.on = !s.on
  else if (typeof cmd.on === 'boolean') s.on = cmd.on
  if (isObj(cmd.nl)) s.nl = { ...s.nl, ...(cmd.nl as object) }
  if (isObj(cmd.udpn)) s.udpn = { ...s.udpn, ...(cmd.udpn as object) }

  if (Array.isArray(cmd.seg)) {
    cmd.seg.forEach((sc: Command, i: number) => applySeg(s, { id: i, ...sc }))
  } else if (isObj(cmd.seg)) {
    const sc = cmd.seg as Command
    if (typeof sc.id === 'number') applySeg(s, sc)
    else {
      const targets = s.seg.filter((g) => g.sel)
      for (const g of targets.length ? targets : s.seg.filter((g) => g.id === s.mainseg))
        applySeg(s, { ...sc, id: g.id })
    }
  }
  return s
}

function applySeg(s: State, sc: Command) {
  const id = sc.id as number
  const idx = s.seg.findIndex((g) => g.id === id)
  if (sc.stop === 0) {
    if (idx >= 0) s.seg.splice(idx, 1)
    return
  }
  let g: Segment
  if (idx < 0) {
    if (typeof sc.start !== 'number' || typeof sc.stop !== 'number') return
    g = newSegment(id, s.seg[0])
    s.seg.push(g)
    s.seg.sort((a, b) => a.id - b.id)
  } else g = s.seg[idx]

  for (const [k, v] of Object.entries(sc)) {
    if (k === 'id' || k === 'fxdef' || k === 'rpt') continue
    if (k === 'col' && Array.isArray(v)) {
      v.forEach((c, i) => {
        if (Array.isArray(c) && c.length) g.col[i] = c as Segment['col'][number]
      })
    } else if ((k === 'frz' || k === 'on' || k === 'sel') && v === 't') {
      g[k] = !g[k]
    } else {
      ;(g as unknown as Record<string, unknown>)[k] = v
    }
  }
  g.len = g.stop - g.start
}

function newSegment(id: number, template?: Segment): Segment {
  return {
    id,
    start: 0,
    stop: 0,
    grp: 1,
    spc: 0,
    of: 0,
    on: true,
    frz: false,
    bri: 255,
    cct: 127,
    set: 0,
    lc: template?.lc ?? 1,
    col: [
      [255, 160, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    fx: 0,
    sx: 128,
    ix: 128,
    pal: 0,
    c1: 128,
    c2: 128,
    c3: 16,
    sel: false,
    rev: false,
    mi: false,
    o1: false,
    o2: false,
    o3: false,
    si: 0,
    m12: 0,
    bm: 0,
  }
}

export function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}
