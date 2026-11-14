// A fake WLED device served by the Vite dev server (`npm run dev:mock`), for working on the UI without hardware.
// It implements the JSON endpoints the UI uses; effects run as a simple animation for the live preview.
import type { Plugin, Connect } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fixtures from './fixtures.json'
import { applyCommand, isObj } from '../src/api/apply'
import { paletteSlots } from '../src/lib/palette16'
import type { Command, Info, Presets, State } from '../src/api/types'
import { cfg, cfgJson, checkPin, ledScript, pins, postSettings, scan, settingsUnlocked } from './settings'

const LEDS = 300

let state: State = {
  on: true,
  bri: 184,
  transition: 7,
  bs: 0,
  ps: 1,
  pl: -1,
  ledmap: 0,
  nl: { on: false, dur: 60, mode: 1, tbri: 0, rem: -1 },
  udpn: { send: false, recv: true, sgrp: 1, rgrp: 1 },
  lor: 0,
  mainseg: 0,
  seg: [
    seg(0, 'Desk', 0, 120, {
      sel: true,
      fx: 66,
      pal: 8,
      col: [
        [255, 106, 26, 0],
        [58, 10, 0, 0],
        [255, 211, 107, 0],
      ],
      sx: 64,
      ix: 160,
    }),
    seg(1, 'Shelf', 120, 180, {
      fx: 101,
      pal: 9,
      col: [
        [0, 96, 255, 0],
        [0, 0, 0, 0],
        [0, 208, 255, 0],
      ],
    }),
    seg(2, 'Window', 180, LEDS, {
      on: false,
      lc: 3,
      col: [
        [255, 200, 120, 80],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    }),
  ],
}

const info: Info = {
  // the release Ember is built for; MOCK_WLED_VER pretends to be another, for Ember's version warning
  ver: process.env.MOCK_WLED_VER ?? readFileSync(resolve(__dirname, '../WLED-VERSION'), 'utf8').trim(),
  vid: 2510010,
  cn: 'Mock',
  release: 'ESP32',
  repo: 'wled/WLED',
  leds: { count: LEDS, pwr: 2350, fps: 42, maxpwr: 5000, maxseg: 32, bootps: 0, lc: 3 },
  name: 'WLED-Mock',
  simplifiedui: false,
  live: false,
  liveseg: -1,
  lm: '',
  lip: '',
  ws: -1,
  fxcount: fixtures.effects.length,
  palcount: fixtures.palettes.length,
  cpalcount: 0,
  umpalcount: 0,
  maps: [{ id: 0 }],
  wifi: { bssid: '00:11:22:33:44:55', rssi: -61, signal: 78, channel: 6, ap: false },
  fs: { u: 212, t: 960, pmt: 1 },
  ndc: 2,
  arch: 'esp32',
  core: 'v4.4.7',
  clock: 240,
  flash: 4,
  lwip: 0,
  freeheap: 145200,
  uptime: 0,
  time: '',
  u: { Temperature: [23.5, '°C'] },
  opt: 0x4d,
  brand: 'WLED',
  bootloaderSHA256: '3f1a9c0d5e7b2486a1c9e0f4d7b3a5c8e2f6091b4d7a3c5e8f0b2d4a6c8e1f3a',
  product: 'FOSS',
  mac: 'a4cf123e9b10',
  ip: '127.0.0.1',
}

let presets: Presets = {
  '0': {},
  '1': { n: 'Evening warm', ql: 'EV', on: true, bri: 140, seg: [{ id: 0, fx: 0, col: [[255, 140, 40]] }] },
  '2': { n: 'Movie night', ql: 'MV', on: true, bri: 40, seg: [{ id: 0, fx: 2, col: [[80, 0, 160]] }] },
  '3': {
    n: 'Party cycle',
    ql: 'PT',
    on: true,
    playlist: { ps: [1, 2, 4], dur: [300, 450, 200], transition: [20, 20, 10], repeat: 0, r: true, end: 0 },
  },
  '4': { n: 'Focus white', on: true, bri: 255, seg: [{ id: 0, fx: 0, col: [[255, 255, 255]] }] },
  '5': { n: 'Night light', win: 'T=1&A=8&R=255&G=60&B=0' },
}

const nodes = [
  { name: 'Living room', type: 32, ip: '192.168.1.51', age: 0, vid: 2510010 },
  { name: 'Garden', type: 82, ip: '192.168.1.63', age: 1, vid: 2405180 },
]

const start = Date.now()
let booted = start - 273600 * 1000 // for the uptime, which a restart starts again
let down = 0 // while restarting (until this time), the mock doesn't answer
let previousVer: string | null = null // what /update?revert goes back to

function seg(
  id: number,
  n: string,
  startLed: number,
  stop: number,
  extra: Partial<State['seg'][number]>,
): State['seg'][number] {
  return {
    id,
    n,
    start: startLed,
    stop,
    len: stop - startLed,
    grp: 1,
    spc: 0,
    of: 0,
    on: true,
    frz: false,
    bri: 255,
    cct: 127,
    set: 0,
    lc: 1,
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
    ...extra,
  }
}

// Custom palettes: /palette<n>.json files (null: no file), loaded like colors.cpp loadCustomPalettes, whose
// count runs up to the last file, gaps included. Slot n is palette ID 200 - n.
const palFiles: (string | null)[] = [
  JSON.stringify({ palette: [0, '1b1464', 90, 'c2185b', 170, 'ff7043', 255, 'ffd54f'] }),
  JSON.stringify({ palette: [0, '00c9a7', 128, '1e88e5', 255, '7c4dff'] }),
]
// MOCK_CUSTOM_PALETTES=20 starts with that many custom palettes (the two above, repeated), for testing long lists
for (let n = Number(process.env.MOCK_CUSTOM_PALETTES) || 0, i = palFiles.length; i < Math.min(n, 129); i++)
  palFiles.push(palFiles[i % 2])
const palCount = () => palFiles.reduce((n, f, i) => (f ? i + 1 : n), 0)
// a custom palette's 16 entries in the /json/palx format, as the light keeps them (src/lib/palette16.ts), at
// positions 0, 16 … 240 like the firmware's (a gap is the firmware's grey placeholder)
function customPalx(slot: number) {
  const f = palFiles[slot]
  if (!f) return Array.from({ length: 16 }, (_, k) => [k * 16, 128, 128, 128])
  const a = JSON.parse(f).palette as (number | string)[]
  const stops: { t: number; rgb: { r: number; g: number; b: number } }[] = []
  for (let i = 0; i + 1 < a.length; i += 2) {
    const n = parseInt(String(a[i + 1]), 16)
    stops.push({ t: Number(a[i]), rgb: { r: n >> 16, g: (n >> 8) & 255, b: n & 255 } })
  }
  return paletteSlots(stops).map((c, k) => [k * 16, c.r, c.g, c.b])
}

function currentInfo(): Info {
  info.cpalcount = palCount()
  info.cpalmax = 129
  info.uptime = Math.floor((Date.now() - booted) / 1000)
  info.time = new Date().toLocaleString()
  info.fs.pmt = presetsVersion
  info.name = cfg.id.name
  return info
}

let presetsVersion = 1

function handleCommand(cmd: Command) {
  if (cmd.rSeg) state.seg = [seg(0, '', 0, LEDS, { sel: true })]
  if (typeof cmd.rmcpal === 'number') palFiles[cmd.rmcpal] = null
  if (typeof cmd.pdel === 'number') {
    delete presets[String(cmd.pdel)]
    presetsVersion++
  }
  if (typeof cmd.psave === 'number') savePreset(cmd)
  else {
    const id = (cmd.pd ?? cmd.ps) as number | undefined
    if (typeof id === 'number' && presets[String(id)]) {
      const p = presets[String(id)]
      if (p.playlist) {
        state.pl = id
        state.ps = p.playlist.ps[0] ?? -1
      } else {
        state = applyCommand(state, p as Command)
        state.ps = id
        state.pl = -1
      }
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
    const segs = state.seg
      .filter((g) => !cmd.sc || g.sel)
      .map(({ len: _len, lc: _lc, ...g }) => {
        if (cmd.sb === false) {
          const { start: _s, stop: _e, ...rest } = g
          return rest
        }
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
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round(255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))))
  }
  return [f(5), f(3), f(1)]
}

// A moving gradient of each segment's colours, so the live preview has something to show.
function live() {
  const t = (Date.now() - start) / 1000
  const leds: string[] = []
  for (let i = 0; i < LEDS; i++) {
    const g = state.seg.find((s) => i >= s.start && i < s.stop)
    if (!state.on || !g || !g.on) {
      leds.push('000000')
      continue
    }
    const wave = (Math.sin(i / 6 - t * (g.sx / 40)) + 1) / 2
    const a = g.col[0],
      b = g.col[1]
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

// The firmware's message page (data/msg.htm): a heading and a line of detail.
function message(res: ServerResponse, status: number, head: string, sub: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html')
  res.end(
    `<!DOCTYPE html><html><head><title>WLED Message</title></head><body><h2>${head}</h2>${sub}<br><br><button type="button" onclick="B()">Back</button></body></html>`,
  )
}

function restart() {
  setTimeout(() => {
    down = Date.now() + 5000
    booted = down
  }, 500)
}

// A firmware upload, read slowly so the page's progress has something to show. Latin-1 keeps the bytes.
function readUpload(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.setEncoding('latin1')
    req.on('data', (c: string) => {
      data += c
      req.pause()
      setTimeout(() => req.resume(), 120)
    })
    req.on('end', () => resolve(data))
  })
}

// /update and /updatebootloader, with the firmware's checks (wled_server.cpp, ota_update.cpp). A firmware
// file is valid when it's named like a release for the mock's build type, WLED_<version>_ESP32.bin.
async function update(req: IncomingMessage, res: ServerResponse, path: string, url: URL) {
  const denied = cfg.ota.lock
    ? 'Please unlock OTA in security settings!'
    : !settingsUnlocked()
      ? 'Please unlock settings using PIN code!'
      : null
  if (req.method === 'GET') {
    if (denied) return message(res, 401, 'Access Denied', denied)
    if (url.searchParams.has('revert')) {
      if (previousVer) {
        ;[info.ver, previousVer] = [previousVer, null]
        restart()
        return message(res, 200, 'Reverted to previous version!', 'Rebooting now...')
      }
    }
    res.setHeader('Content-Type', 'text/html')
    return res.end(
      '<!DOCTYPE html><html><head><title>WLED Update</title></head><body><h2>WLED Software Update</h2></body></html>',
    )
  }
  const body = await readUpload(req)
  if (denied) return message(res, 401, 'Access Denied', denied)
  const name = /filename="([^"]*)"/.exec(body)?.[1] ?? ''
  if (path === '/updatebootloader') {
    if (!name.endsWith('.bin')) return message(res, 500, 'Bootloader update failed!', 'Invalid bootloader image')
    restart()
    return message(res, 200, 'Bootloader updated successfully!', 'Rebooting now...')
  }
  const skip = /name="skipValidation"\r\n\r\n1\r\n/.test(body)
  const m = /_(\d+\.\d+\.\d+[^_]*)_([^_]+)\.bin$/.exec(name)
  if (!skip && m?.[2] !== info.release) {
    return message(
      res,
      500,
      'Update failed!',
      `Firmware release name mismatch: current='${info.release}', uploaded='${m?.[2] ?? 'unknown'}'. Enable 'Ignore firmware validation' to proceed anyway.`,
    )
  }
  previousVer = info.ver
  if (m) info.ver = m[1]
  restart()
  message(res, 200, 'Update successful!', 'Rebooting now...')
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
  if (Date.now() < down) {
    req.socket.destroy()
    return
  }
  if (path === '/update' || path === '/updatebootloader') return update(req, res, path, url)
  if (req.method === 'POST' && (path === '/json/si' || path === '/json/state' || path === '/json')) {
    try {
      const body = JSON.parse(await readBody(req))
      checkPin(body)
      handleCommand(body)
    } catch {
      return send(res, { error: 9 }, 400)
    }
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
    // presets.json and palette files change the mock's data; other files (skin.css, holidays.json) are just accepted
    const palFile = /filename="\/?palette(\d+)\.json"/.exec(body)
    if (palFile) {
      const slot = Number(palFile[1])
      while (palFiles.length <= slot) palFiles.push(null)
      palFiles[slot] = body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1)
    }
    if (/filename="\/?presets\.json"/.test(body)) {
      const json = body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1)
      try {
        presets = JSON.parse(json)
        presetsVersion++
      } catch {
        /* keep old presets */
      }
    }
    res.end(/filename="\/?cfg\.json"/.test(body) ? 'Config restore ok.\nRebooting...' : 'File Uploaded!')
    return
  }
  const palFile = /^\/palette(\d+)\.json$/.exec(path)
  if (palFile) {
    const f = palFiles[Number(palFile[1])]
    if (!f) return send(res, { error: 'not found' }, 404)
    res.setHeader('Content-Type', 'application/json')
    res.end(f)
    return
  }
  switch (path) {
    case '/json':
    case '/json/si':
      return send(res, { state, info: currentInfo() })
    case '/json/state':
      return send(res, state)
    case '/json/info':
      return send(res, currentInfo())
    case '/json/effects':
      return send(res, fixtures.effects)
    case '/json/fxdata':
      return send(res, fixtures.fxdata)
    case '/json/palettes':
      return send(res, fixtures.palettes)
    case '/json/palx': {
      const page = Number(url.searchParams.get('page') ?? 0)
      const out = palx(page)
      // the custom palettes come on the last page, like the firmware's
      if (page === out.m) palFiles.slice(0, palCount()).forEach((_, i) => (out.p[200 - i] = customPalx(i)))
      return send(res, out)
    }
    case '/json/nodes':
      return send(res, { nodes })
    case '/json/live':
      return send(res, live())
    case '/presets.json':
      return send(res, presets)
    case '/json/cfg':
      return send(res, cfgJson())
    case '/cfg.json':
      return send(res, cfg)
    case '/json/net':
      return send(res, scan())
    case '/json/pins':
      return send(res, pins())
    case '/settings/s.js':
      if (url.searchParams.get('p') !== '2') break
      res.setHeader('Content-Type', 'application/javascript')
      res.end(ledScript())
      return
    case '/reset':
      res.end('Rebooting...')
      return
  }
  next()
}

// `npm run preview:mock`: Ember's built files (dist/) as the light serves them, its start page at / and ui.bin
// as plain bytes, plus the file editor's delete (behind the settings PIN) so removing Ember can be tried.
// GET /mock/ui-bin?other=1 makes it serve a ui.bin from another build, so the start page refuses it, and
// ?slow=1 sends it slowly to watch the progress (without them, back to normal).
const EMBER_FILES = [
  '/index.htm.gz',
  '/ui.bin',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]
const removedFiles = new Set<string>()
let otherBuild = false
let slowBin = false
const distFile = (f: string) => readFileSync(resolve(__dirname, '../dist', f))
const emberFiles: Connect.NextHandleFunction = (req, res, next) => {
  const url = new URL(req.url ?? '/', 'http://mock')
  const path = url.pathname
  if (path === '/mock/ui-bin') {
    otherBuild = url.searchParams.get('other') === '1'
    slowBin = url.searchParams.get('slow') === '1'
    res.end(`ui.bin from ${otherBuild ? 'another' : 'this'} build${slowBin ? ', slowly' : ''}`)
    return
  }
  if (path === '/edit' && url.searchParams.get('func') === 'delete') {
    const file = url.searchParams.get('path') ?? ''
    if (!settingsUnlocked()) {
      res.statusCode = 401
      res.end('Access denied')
    } else if (!EMBER_FILES.includes(file) || removedFiles.has(file)) {
      res.statusCode = 404
      res.end('File not found')
    } else {
      removedFiles.add(file)
      res.end('File deleted')
    }
    return
  }
  if (removedFiles.has(path) || (path === '/' && removedFiles.has('/index.htm.gz'))) {
    if (path !== '/') {
      res.statusCode = 404
      res.end('File not found')
      return
    }
    res.setHeader('Content-Type', 'text/html')
    res.end(
      '<!doctype html><body style="background:#111;color:#eee;font:16px system-ui;padding:2em">The standard WLED interface (mock): Ember was removed.</body>',
    )
    return
  }
  if (path === '/' || path === '/index.htm') {
    res.setHeader('Content-Type', 'text/html')
    res.setHeader('Content-Encoding', 'gzip')
    res.end(distFile('index.htm.gz'))
    return
  }
  if (path === '/ui.bin') {
    const bin = Buffer.from(distFile('ui.bin'))
    if (otherBuild) bin[bin.length - 9] ^= 0xff
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', String(bin.length))
    if (!slowBin) {
      res.end(bin)
      return
    }
    // about 6 s, like a first load from a real light
    let at = 0
    const step = () => {
      res.write(bin.subarray(at, (at += 8192)))
      if (at < bin.length) setTimeout(step, 180)
      else res.end()
    }
    step()
    return
  }
  next()
}

export function mockWled(): Plugin {
  return {
    name: 'mock-wled',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(emberFiles)
      server.middlewares.use(middleware)
    },
  }
}
