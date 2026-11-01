import { create } from 'zustand'
import { applyCommand } from './api/apply'
import type { Command, Info, Node, PaletteStop, Presets, State } from './api/types'

export interface Toast { id: number; text: string; error: boolean }

interface Store {
  conn: 'connecting' | 'ok' | 'error'
  state: State | null
  info: Info | null
  effects: { id: number; name: string }[]
  fxdata: string[]
  palettes: { id: number; name: string }[]
  palx: Record<number, PaletteStop[]>
  presets: Presets | null
  presetsError: boolean
  nodes: Node[] | null
  toasts: Toast[]
  peek: boolean
}

export const useStore = create<Store>(() => ({
  conn: 'connecting',
  state: null,
  info: null,
  effects: [],
  fxdata: [],
  palettes: [],
  palx: {},
  presets: null,
  presetsError: false,
  nodes: null,
  toasts: [],
  peek: false,
}))

const get = useStore.getState
const set = useStore.setState

// ---------------------------------------------------------------- toasts

let toastId = 0
export function toast(text: string, error = false) {
  const id = ++toastId
  set({ toasts: [...get().toasts.filter((t) => !t.error || error), { id, text, error }].slice(-3) })
  setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), error ? 6000 : 2900)
}

const ERRORS: Record<number, string> = {
  1: 'Denied!', 3: 'Buffer locked!', 7: 'No RAM for buffer!', 8: 'Effect RAM depleted!', 9: 'JSON parsing error!',
  10: 'Could not mount filesystem!', 11: 'Not enough space to save preset!', 12: 'Preset not found.',
  13: 'Missing ir.json.', 19: 'A filesystem error has occured.', 90: 'Unexpected Restart.', 91: 'Brownout Restart.',
  100: 'Please reboot WLED to activate changed settings.', 101: 'Please switch your device off and back on.',
}

// ---------------------------------------------------------------- receiving state

let lastUpdate = 0
let responseTimer: ReturnType<typeof setTimeout> | null = null

function receive(json: { state?: State; info?: Info } & Partial<State>) {
  if (responseTimer) { clearTimeout(responseTimer); responseTimer = null }
  lastUpdate = Date.now()
  const info = json.info ?? get().info
  const state = json.state ?? (json.seg ? (json as State) : null)
  const patch: Partial<Store> = { conn: 'ok', info }
  if (state) {
    patch.state = state
    if (state.error) toast(`${state.error < 100 ? 'Error' : 'Note'} ${state.error}: ${ERRORS[state.error] ?? ''}`, true)
  }
  set(patch)
  if (info && document.title !== info.name) document.title = (info.live ? '(Live) ' : '') + info.name
  // presets were modified elsewhere (pmt = presets modified time)
  if (info && presetsPmt !== null && info.fs.pmt !== presetsPmt) loadPresets()
}

// ---------------------------------------------------------------- WebSocket

let ws: WebSocket | null = null
let wsRetries = 0
const liveListeners = new Set<(frame: Uint8Array) => void>()

function connectWs() {
  if (ws || (get().info?.ws ?? 0) < 0) return
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const sock = new WebSocket(`${proto}//${location.host}/ws`)
  sock.binaryType = 'arraybuffer'
  ws = sock
  sock.onopen = () => {
    wsRetries = 0
    if (get().peek) sock.send('{"lv":true}')
  }
  sock.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) {
      const frame = new Uint8Array(e.data)
      if (frame[0] === 76) liveListeners.forEach((l) => l(frame)) // 'L' = liveview packet
      return
    }
    const json = JSON.parse(e.data)
    if (json.leds) return // JSON liveview packet
    receive(json)
  }
  sock.onclose = () => {
    ws = null
    if (wsRetries++ < 10) setTimeout(connectWs, wsRetries * 200)
  }
}

const wsOpen = () => ws !== null && ws.readyState === WebSocket.OPEN

// ---------------------------------------------------------------- sending

// Sends a state command. The UI updates right away from the command; the device's reply then replaces it.
export async function send(cmd: Command) {
  const { state, info } = get()
  if (state) set({ state: applyCommand(state, cmd) })
  await request({ ...cmd, v: true, time: Math.floor(Date.now() / 1000) }, info)
}

// Asks the device for its full state and info.
export function refresh() {
  return request(null, get().info)
}

async function request(cmd: Command | null, info: Info | null, retry = 0): Promise<void> {
  const body = cmd ? JSON.stringify(cmd) : null
  // large payloads go over HTTP: the WebSocket buffer on the device is small (esp8266 especially)
  const useWs = wsOpen() && (!body || (body.length <= 1340 && !(body.length > 500 && info?.arch === 'esp8266')))
  if (!responseTimer) {
    responseTimer = setTimeout(() => {
      responseTimer = null
      ws?.close()
      set({ conn: 'error' })
      toast('Connection to light failed!', true)
    }, 3000)
  }
  if (useWs) {
    ws!.send(body ?? '{"v":true}')
    return
  }
  try {
    const res = await fetch('/json/si', {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.success) { if (responseTimer) { clearTimeout(responseTimer); responseTimer = null } return }
    receive(json)
  } catch (e) {
    if (retry < 10) {
      await new Promise((r) => setTimeout(r, retry * 50))
      return request(cmd, info, retry + 1)
    }
    toast(String(e), true)
  }
}

// Exposed for usermods whose /json/info rows contain buttons calling requestJson(), as in the stock UI.
;(window as unknown as { requestJson: (c?: Command) => void }).requestJson = (c?: Command) => (c ? send(c) : refresh())

// ---------------------------------------------------------------- loading

async function getJson<T>(path: string, retries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      // without a timeout a dropped device leaves the request hanging until the proxy or browser gives up
      const res = await fetch(path, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      // retries are for a busy ESP (503); a timeout means it is gone
      if (i >= retries || (e instanceof DOMException && e.name === 'TimeoutError')) throw e
      await new Promise((r) => setTimeout(r, 100))
    }
  }
}

function sortByName<T extends { id: number; name: string }>(list: T[]) {
  const [first, ...rest] = list
  return [first, ...rest.sort((a, b) => a.name.localeCompare(b.name))]
}

let started = false

// Runs once, even when React's StrictMode mounts the app twice in development.
export function init() {
  if (started) return
  started = true
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && get().info && Date.now() - lastUpdate > 3000) refresh()
  })
  load(0)
}

// Loads everything one request at a time: the ESP answers parallel requests with 503 when its heap is low.
// Until the first load succeeds, it keeps retrying every few seconds.
async function load(attempt: number) {
  try {
    const palNames = await getJson<string[]>('/json/palettes')
    set({ palettes: sortByName(palNames.map((name, id) => ({ id, name }))) })
    const fxdata = await getJson<string[]>('/json/fxdata')
    const fxNames = await getJson<string[]>('/json/effects')
    set({
      fxdata,
      effects: sortByName(fxNames.map((name, id) => ({ id, name })).filter((e) => !e.name.includes('RSVD'))),
    })
    await getJson<{ state: State; info: Info }>('/json/si').then(receive)
    await loadPalx()
    await loadPresets()
    connectWs()
  } catch (e) {
    if (attempt === 0) toast(e instanceof DOMException && e.name === 'TimeoutError' ? 'WLED is not responding' : `Could not reach WLED: ${e}`, true)
    set({ conn: 'error' })
    setTimeout(() => load(attempt + 1), 5000)
  }
}

const PALX_KEY = 'wledUiPalx'

async function loadPalx() {
  const info = get().info
  if (!info) return
  try {
    const cached = JSON.parse(localStorage.getItem(PALX_KEY) ?? 'null')
    if (cached && cached.vid === info.vid && cached.pcount === info.palcount && cached.cpal === info.cpalcount) {
      set({ palx: cached.p })
      return
    }
  } catch { /* no cache */ }
  let palx: Record<number, PaletteStop[]> = {}
  for (let page = 0, max = 0; page <= max; page++) {
    const json = await getJson<{ m: number; p: Record<number, PaletteStop[]> }>(`/json/palx?page=${page}`)
    palx = { ...palx, ...json.p }
    max = json.m
    set({ palx })
  }
  try {
    localStorage.setItem(PALX_KEY, JSON.stringify({ p: palx, vid: info.vid, pcount: info.palcount, cpal: info.cpalcount }))
  } catch { /* storage full or blocked */ }
}

let presetsPmt: number | null = null
const PRESETS_BACKUP_KEY = 'wledUiPresets'

export async function loadPresets() {
  presetsPmt = get().info?.fs.pmt ?? null
  try {
    const res = await fetch('/presets.json')
    const presets: Presets = res.status === 404 ? {} : await res.json()
    delete presets['0']
    set({ presets, presetsError: false })
    if (Object.keys(presets).length) {
      try { localStorage.setItem(PRESETS_BACKUP_KEY, JSON.stringify(presets)) } catch { /* ignore */ }
    }
  } catch {
    set({ presetsError: true })
  }
}

export const presetsBackup = () => {
  try { return localStorage.getItem(PRESETS_BACKUP_KEY) } catch { return null }
}

// Replaces presets.json on the device (used to restore the local backup).
export async function uploadPresets(text: string) {
  const form = new FormData()
  form.append('data', new Blob([text], { type: 'application/json' }), '/presets.json')
  const res = await fetch('/upload', { method: 'POST', body: form })
  toast(await res.text(), !res.ok)
  setTimeout(loadPresets, 2000)
}

// Saving goes through the state API (psave); the file on the device is re-read shortly after.
export function presetsChanged() {
  setTimeout(loadPresets, 750)
}

export async function loadNodes() {
  try {
    const json = await getJson<{ nodes: Node[] }>('/json/nodes', 0)
    set({ nodes: json.nodes.sort((a, b) => a.name.localeCompare(b.name)) })
  } catch {
    toast('Could not load Node list!', true)
  }
}

// ---------------------------------------------------------------- live view ("Peek")

let livePoll: ReturnType<typeof setTimeout> | null = null

export function setPeek(on: boolean) {
  set({ peek: on })
  if (wsOpen()) {
    ws!.send(on ? '{"lv":true}' : '{"lv":false}')
    return
  }
  if (livePoll) { clearTimeout(livePoll); livePoll = null }
  if (on) pollLive()
}

// Without a WebSocket, poll /json/live (hex strings) and convert to the binary frame format.
async function pollLive() {
  if (!get().peek || wsOpen()) return
  try {
    const json = await getJson<{ leds: string[] }>('/json/live', 0)
    const frame = new Uint8Array(2 + json.leds.length * 3)
    frame[0] = 76; frame[1] = 1
    json.leds.forEach((hex, i) => {
      const n = parseInt(hex.length > 6 ? hex.slice(2) : hex, 16)
      frame.set([n >> 16, (n >> 8) & 255, n & 255], 2 + i * 3)
    })
    liveListeners.forEach((l) => l(frame))
  } catch { /* try again */ }
  livePoll = setTimeout(pollLive, 100)
}

export function onLiveFrame(listener: (frame: Uint8Array) => void) {
  liveListeners.add(listener)
  return () => { liveListeners.delete(listener) }
}
