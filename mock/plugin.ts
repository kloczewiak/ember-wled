// A fake WLED device served by the Vite dev server (`npm run dev:mock`), for working on the UI without hardware.
// It implements the JSON endpoints the UI uses; effects run as a simple animation for the live preview.
import type { Plugin, Connect } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import fixtures from './fixtures.json'
import { applyCommand, isObj } from '../src/api/apply'
import type { Command, Info, Presets, State } from '../src/api/types'
import { cfg, cfgJson, checkPin, pins, postSettings, scan } from './settings'

const LEDS = 300

let state: State = {
  on: true, bri: 184, transition: 7, bs: 0, ps: 1, pl: -1, ledmap: 0,
  nl: { on: false, dur: 60, mode: 1, tbri: 0, rem: -1 },
  udpn: { send: false, recv: true, sgrp: 1, rgrp: 1 },
  lor: 0, mainseg: 0,
  seg: [
    seg(0, 'Desk', 0, 120, { sel: true, fx: 66, pal: 8, col: [[255, 106, 26, 0], [58, 10, 0, 0], [255, 211, 107, 0]], sx: 64, ix: 160 }),
    seg(1, 'Shelf', 120, 180, { fx: 101, pal: 9, col: [[0, 96, 255, 0], [0, 0, 0, 0], [0, 208, 255, 0]] }),
    seg(2, 'Window', 180, LEDS, { on: false, lc: 3, col: [[255, 200, 120, 80], [0, 0, 0, 0], [0, 0, 0, 0]] }),
  ],
}

const info: Info = {
  ver: '0.16.0-mock', vid: 2510010, cn: 'Mock', release: 'ESP32', repo: 'wled/WLED',
  leds: { count: LEDS, pwr: 2350, fps: 42, maxpwr: 5000, maxseg: 32, bootps: 0, lc: 3 },
  name: 'WLED-Mock', simplifiedui: false, live: false, liveseg: -1, lm: '', lip: '', ws: -1,
  fxcount: fixtures.effects.length, palcount: fixtures.palettes.length, cpalcount: 0, umpalcount: 0,
  maps: [{ id: 0 }],
  wifi: { bssid: '00:11:22:33:44:55', rssi: -61, signal: 78, channel: 6, ap: false },
  fs: { u: 212, t: 960, pmt: 1 }, ndc: 2, arch: 'esp32', core: 'v4.4.7', clock: 240, flash: 4, lwip: 0,
  freeheap: 145200, uptime: 0, time: '', u: { 'Temperature': [23.5, '°C'] }, opt: 0x4d, brand: 'WLED',
  product: 'FOSS', mac: 'a4cf123e9b10', ip: '127.0.0.1',
}

let presets: Presets = {
  '0': {},
  '1': { n: 'Evening warm', ql: 'EV', on: true, bri: 140, seg: [{ id: 0, fx: 0, col: [[255, 140, 40]] }] },
  '2': { n: 'Movie night', ql: 'MV', on: true, bri: 40, seg: [{ id: 0, fx: 2, col: [[80, 0, 160]] }] },
  '3': { n: 'Party cycle', ql: 'PT', on: true, playlist: { ps: [1, 2, 4], dur: [300, 450, 200], transition: [20, 20, 10], repeat: 0, r: true, end: 0 } },
  '4': { n: 'Focus white', on: true, bri: 255, seg: [{ id: 0, fx: 0, col: [[255, 255, 255]] }] },
  '5': { n: 'Night light', win: 'T=1&A=8&R=255&G=60&B=0' },
}

const nodes = [
  { name: 'Living room', type: 32, ip: '192.168.1.51', age: 0, vid: 2510010 },
  { name: 'Garden', type: 82, ip: '192.168.1.63', age: 1, vid: 2405180 },
]

const start = Date.now()

function seg(id: number, n: string, startLed: number, stop: number, extra: Partial<State['seg'][number]>): State['seg'][number] {
  return {
    id, n, start: startLed, stop, len: stop - startLed, grp: 1, spc: 0, of: 0, on: true, frz: false, bri: 255, cct: 127,
    set: 0, lc: 1, col: [[255, 160, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], fx: 0, sx: 128, ix: 128, pal: 0, c1: 128,
    c2: 128, c3: 16, sel: false, rev: false, mi: false, o1: false, o2: false, o3: false, si: 0, m12: 0, bm: 0, ...extra,
  }
}

function currentInfo(): Info {
  info.uptime = Math.floor((Date.now() - start) / 1000) + 273600
  info.time = new Date().toLocaleString()
  info.fs.pmt = presetsVersion
  info.name = cfg.id.name
  return info
}

let presetsVersion = 1

function handleCommand(cmd: Command) {
  if (cmd.rSeg) state.seg = [seg(0, '', 0, LEDS, { sel: true })]
  if (typeof cmd.pdel === 'number') { delete presets[String(cmd.pdel)]; presetsVersion++ }
  if (typeof cmd.psave === 'number') savePreset(cmd)
  else {
    const id = (cmd.pd ?? cmd.ps) as number | undefined
    if (typeof id === 'number' && presets[String(id)]) {
      const p = presets[String(id)]
      if (p.playlist) { state.pl = id; state.ps = p.playlist.ps[0] ?? -1 }
      else { state = applyCommand(state, p as Command); state.ps = id; state.pl = -1 }
    }
    if (isObj(cmd.playlist)) state.pl = Array.isArray(cmd.playlist.ps) ? 0 : -1
    state = applyCommand(state, cmd)
  }
  if (typeof cmd.bootps === 'number') info.leds.bootps = cmd.bootps
  if (typeof cmd.lor === 'number') state.lor = cmd.lor
}

function savePreset(cmd: Command) {
  const id = cmd.psave as number
  let p: Command
  if (cmd.o) {
    p = { ...cmd }
    for (const k of ['psave', 'o', 'v', 'time', 'bootps']) delete p[k]
  } else {
    const segs = state.seg.filter((g) => !cmd.sc || g.sel).map(({ len: _len, lc: _lc, ...g }) => {
      if (cmd.sb === false) { const { start: _s, stop: _e, ...rest } = g; return rest }
      return g
    })
    p = { on: state.on, transition: state.transition, mainseg: state.mainseg, seg: segs, n: cmd.n }
    if (cmd.ib !== false) p.bri = state.bri
    if (cmd.ql) p.ql = cmd.ql
  }
  presets[String(id)] = p as Presets[string]
  state.ps = id
  presetsVersion++
}

// Palette previews in the /json/palx format: 0-5 are the firmware's dynamic palettes, the rest get generated colours.
function palx(page: number) {
  const per = 8
  const total = fixtures.palettes.length
  const p: Record<string, unknown> = {}
  for (let i = page * per; i < Math.min(total, (page + 1) * per); i++) {
    if (i === 1) p[i] = ['r', 'r', 'r', 'r']
    else if (i === 2) p[i] = ['c1']
    else if (i === 3) p[i] = ['c1', 'c1', 'c2', 'c2']
    else if (i === 4) p[i] = ['c3', 'c2', 'c1']
    else if (i === 5) p[i] = [...Array(5).fill('c1'), ...Array(5).fill('c2'), ...Array(5).fill('c3'), 'c1']
    else {
      const h = (i * 47) % 360
      p[i] = [0, 85, 170, 255].map((pos, j) => [pos, ...hsv((h + j * 40) % 360, j === 3 ? 0.4 : 1)])
    }
  }
  return { m: Math.ceil(total / per) - 1, p }
}

function hsv(h: number, s: number): [number, number, number] {
  const f = (n: number) => { const k = (n + h / 60) % 6; return Math.round(255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)))) }
  return [f(5), f(3), f(1)]
}

// A moving gradient of each segment's colours, so the live preview has something to show.
function live() {
  const t = (Date.now() - start) / 1000
  const leds: string[] = []
  for (let i = 0; i < LEDS; i++) {
    const g = state.seg.find((s) => i >= s.start && i < s.stop)
    if (!state.on || !g || !g.on) { leds.push('000000'); continue }
    const wave = (Math.sin(i / 6 - t * (g.sx / 40)) + 1) / 2
    const a = g.col[0], b = g.col[1]
    const k = (state.bri / 255) * (g.bri / 255)
    const c = [0, 1, 2].map((j) => Math.round((a[j]! * wave + b[j]! * (1 - wave)) * k))
    leds.push(c.map((v) => v.toString(16).padStart(2, '0')).join(''))
  }
  return { leds, n: 1 }
}

function send(res: ServerResponse, body: unknown, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}

const middleware: Connect.NextHandleFunction = async (req, res, next) => {
  const url = new URL(req.url ?? '/', 'http://mock')
  const path = url.pathname
  if (req.method === 'POST' && (path === '/json/si' || path === '/json/state' || path === '/json')) {
    try { const body = JSON.parse(await readBody(req)); checkPin(body); handleCommand(body) } catch { return send(res, { error: 9 }, 400) }
    return send(res, path === '/json/state' ? state : { state, info: currentInfo() })
  }
  if (req.method === 'POST' && path.startsWith('/settings/')) {
    const status = postSettings(path.slice('/settings/'.length), new URLSearchParams(await readBody(req)))
    res.statusCode = status
    res.setHeader('Content-Type', 'text/html')
    res.end(status === 200 ? 'Settings saved.' : 'Access denied')
    return
  }
  if (req.method === 'POST' && path === '/upload') {
    const body = await readBody(req)
    // only presets.json changes the mock's data; other files (skin.css, holidays.json) are just accepted
    if (/filename="\/?presets\.json"/.test(body)) {
      const json = body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1)
      try { presets = JSON.parse(json); presetsVersion++ } catch { /* keep old presets */ }
    }
    res.end(/filename="\/?cfg\.json"/.test(body) ? 'Config restore ok.\nRebooting...' : 'File Uploaded!')
    return
  }
  switch (path) {
    case '/json': case '/json/si': return send(res, { state, info: currentInfo() })
    case '/json/state': return send(res, state)
    case '/json/info': return send(res, currentInfo())
    case '/json/effects': return send(res, fixtures.effects)
    case '/json/fxdata': return send(res, fixtures.fxdata)
    case '/json/palettes': return send(res, fixtures.palettes)
    case '/json/palx': return send(res, palx(Number(url.searchParams.get('page') ?? 0)))
    case '/json/nodes': return send(res, { nodes })
    case '/json/live': return send(res, live())
    case '/presets.json': return send(res, presets)
    case '/json/cfg': return send(res, cfgJson())
    case '/cfg.json': return send(res, cfg)
    case '/json/net': return send(res, scan())
    case '/json/pins': return send(res, pins())
    case '/reset': res.end('Rebooting...'); return
  }
  next()
}

export function mockWled(): Plugin {
  return {
    name: 'mock-wled',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
