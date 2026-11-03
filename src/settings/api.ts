import type { Info } from '../api/types'

// Settings are read through /json/cfg but saved by posting the same form fields as the firmware's own
// settings pages, to the same /settings/<page> URL. That way the firmware runs its usual handler
// (wled00/set.cpp) with all of its checks and side effects, e.g. reconnecting Wi-Fi or dropping a removed
// network, which /json/cfg would not do.

export interface WifiNet { ssid: string; pskl: number; bssid: string; ip: number[]; gw: number[]; sn: number[]; enc_type?: number; e_anon_ident?: string; e_ident?: string }

// The parts of /json/cfg the settings pages use. Optional keys only exist on firmware builds that support
// the feature (ESP-NOW, WPA-Enterprise, TX power on ESP32, Ethernet), mirroring what the stock page hides.
export interface Cfg {
  id: { mdns: string; name: string; sui: boolean; inv?: string }
  nw: { espnow?: boolean; linked_remote?: string[]; ins: WifiNet[]; dns: number[] }
  ap: { ssid: string; pskl: number; chan: number; hide: number; behav: number; ip: number[] }
  wifi: { sleep: boolean; phy: boolean; txpwr?: number }
  eth?: { type: number }
  dmx?: unknown // only on builds with DMX output (WLED_ENABLE_DMX)
  // read by accurate Peek (lib/ledoutput.ts): gamma, brightness factor and the outputs' current limits
  light?: { 'scale-bri': number; gc: { col: number }; nl?: { macro: number } }
  hw?: {
    led: { maxpwr: number; ins: { start: number; len: number; type: number; ledma?: number; maxpwr?: number }[] }
    btn?: { ins: { type: number; pin?: number[]; macros: number[] }[]; mqtt?: boolean }
    baud?: number // in hundreds, e.g. 1152
  }
  if?: Interfaces
  ol?: { clock: number; cntdwn: boolean; min: number; max: number; o12pix: number; o5m: boolean; osec: boolean; osb: boolean }
  // Security and updates; aota only on builds with OTA (it does something only with ArduinoOTA compiled in)
  ota: { lock: boolean; 'lock-wifi': boolean; pskl: number; aota?: boolean; 'same-subnet': boolean }
  timers?: {
    cntdwn: { goal: number[]; macro: number } // goal: 2-digit year, month, day, hour, minute, second
    ins: TimerCfg[]
  }
}

// /json/cfg "if" (Sync interfaces). Optional parts only exist on builds with the feature.
export interface Interfaces {
  sync: {
    port0: number; port1: number; espnow?: boolean
    recv: { bri: boolean; col: boolean; fx: boolean; pal: boolean; grp: number; seg: boolean; sb: boolean }
    send: { en: boolean; dir: boolean; btn: boolean; va: boolean; hue: boolean; grp: number; ret: number }
  }
  nodes: { list: boolean; bcast: boolean }
  live: {
    en: boolean; mso: boolean; rlm: boolean; port: number; mc: boolean
    // inputRxPin/inputTxPin are swapped in the firmware: inputRxPin holds the transmit pin (cfg.cpp)
    dmx: { uni: number; seqskip: boolean; e131prio: number; addr: number; dss: number; mode: number
      inputRxPin?: number; inputTxPin?: number; inputEnablePin?: number; dmxInputPort?: number }
    timeout: number; maxbri: boolean; 'no-gc': boolean; offset: number // timeout in 100 ms
  }
  va?: { alexa: boolean; macros: number[]; p: number }
  mqtt?: { en: boolean; broker: string; port: number; user: string; pskl: number; cid: string; rtn: boolean; topics: { device: string; group: string } }
  hue?: { en: boolean; id: number; iv: number; recv: { on: boolean; bri: boolean; col: boolean }; ip: number[] } // iv in 100 ms
  ntp: { en: boolean; host: string; tz: number; offset: number; ampm: boolean; ln: number; lt: number }
}

// hour 255 = sunrise, 254 = sunset, 24 = every hour; dow: Monday = bit 0 … Sunday = bit 6
export interface TimerCfg { en: number; hour: number; min: number; macro: number; dow: number; start: { mon: number; day: number }; end: { mon: number; day: number } }

export async function loadCfg(): Promise<Cfg> {
  const res = await fetch('/json/cfg', { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export interface ScannedNet { ssid: string; rssi: number; channel: number }

// Scans for networks like the stock page: strongest first, one entry per SSID, and retried for a while
// because the first request only starts the scan.
export async function scanNetworks(): Promise<ScannedNet[]> {
  for (let attempt = 0; attempt <= 10; attempt++) {
    const json = await fetch('/json/net').then((r) => r.json()).catch(() => ({}))
    const nets: ScannedNet[] = (json.networks ?? []).sort((a: ScannedNet, b: ScannedNet) => b.rssi - a.rssi)
    const unique = nets.filter((n, i) => nets.findIndex((m) => m.ssid === n.ssid) === i)
    if (unique.length) return unique
    await new Promise((r) => setTimeout(r, 1000))
  }
  return []
}

export type SaveResult = 'ok' | 'pin' | 'locked' | 'error'

// Posts a settings form. 401 means a settings PIN is needed (or, for Wi-Fi, that Wi-Fi and OTA are locked).
export async function postSettings(page: string, fields: [string, string][]): Promise<SaveResult> {
  try {
    const res = await fetch(`/settings/${page}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) return 'ok'
    if (res.status === 401) return (await res.text()).includes('OTA') ? 'locked' : 'pin'
    return 'error'
  } catch {
    return 'error'
  }
}

// Uploads a file to the light's filesystem (needs the settings PIN, like the settings forms). JSON is checked
// and minified first, like the stock pages' uploadFile() (common.js); `text` is the light's reply.
export async function uploadFile(file: Blob, path: string): Promise<{ result: SaveResult; text: string }> {
  const data = new FormData()
  data.append('data', file, path)
  try {
    const res = await fetch('/upload', { method: 'POST', body: data, signal: AbortSignal.timeout(20000) })
    return { result: res.ok ? 'ok' : res.status === 401 ? 'pin' : 'error', text: await res.text() }
  } catch {
    return { result: 'error', text: '' }
  }
}

// The JSON API accepts the settings PIN in any POST and unlocks settings for a while (checkSettingsPIN).
export async function unlockSettings(pin: string) {
  await fetch('/json/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })
}

// ---------------------------------------------------------------- firmware updates (wled_server.cpp, ota_update.cpp)

// The light answers updates with its message page (data/msg.htm): a heading, then a line of detail.
export type Reply = { title: string; text: string }
export function parseReply(html: string): Reply | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const h2 = doc.querySelector('h2')
  if (!h2) return null
  doc.querySelectorAll('h2, script, button, form').forEach((e) => e.remove())
  return { title: h2.textContent?.trim() ?? '', text: doc.body.textContent?.trim() ?? '' }
}

// Whether the light takes an update now. GET /update answers 401 while updates are locked or the settings
// PIN is needed (serveSettings treats it as a settings page), and 501 on builds without OTA. Checking first
// saves uploading a whole firmware file only to have it refused.
export async function updateAccess(): Promise<SaveResult> {
  try {
    const res = await fetch('/update', { signal: AbortSignal.timeout(8000) })
    if (res.ok) return 'ok'
    if (res.status === 401) return (await res.text()).includes('unlock OTA') ? 'locked' : 'pin'
    return 'error'
  } catch {
    return 'error'
  }
}

export type UploadReply = { ok: boolean; reply: Reply | null; status: number }

// Uploads firmware to /update (or a bootloader to /updatebootloader) as the stock form does, with progress
// from 0 to 1. skipValidation has to come before the file: the light reads it when the file starts.
export function uploadFirmware(file: File, { bootloader = false, skipValidation = false, onProgress }: {
  bootloader?: boolean; skipValidation?: boolean; onProgress: (p: number) => void
}): Promise<UploadReply> {
  const data = new FormData()
  if (!bootloader) data.append('skipValidation', skipValidation ? '1' : '')
  data.append('update', file, file.name)
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', bootloader ? '/updatebootloader' : '/update')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    xhr.onload = () => resolve({ ok: xhr.status === 200, reply: parseReply(xhr.responseText), status: xhr.status })
    xhr.onerror = () => resolve({ ok: false, reply: null, status: 0 })
    xhr.send(data)
  })
}

// Goes back to the firmware from before the last update (ESP32). Without one to go back to, or from outside
// the local network, the light serves the update page instead of a message.
export async function revertFirmware(): Promise<UploadReply> {
  try {
    const res = await fetch('/update?revert', { signal: AbortSignal.timeout(10000) })
    return { ok: res.ok, reply: parseReply(await res.text()), status: res.status }
  } catch {
    return { ok: false, reply: null, status: 0 }
  }
}

// Waits for the light to restart: its uptime starts again (or it stops answering for a while, then answers).
// Resolves with its info, or null if it isn't back within `timeout` ms.
export async function waitForRestart(uptimeBefore: number, timeout = 120000): Promise<Info | null> {
  const end = Date.now() + timeout
  let dropped = false
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const res = await fetch('/json/info', { signal: AbortSignal.timeout(2000), cache: 'no-store' })
      if (!res.ok) { dropped = true; continue }
      const info: Info = await res.json()
      if (dropped || info.uptime < uptimeBefore) return info
    } catch {
      dropped = true
    }
  }
  return null
}

// The latest release on GitHub, and the firmware file in it for this build type, found like the stock page:
// named *_<version>_<release>.bin and downloaded through download.wled.me.
export interface Release { version: string; page: string; file?: { name: string; size: number; url: string } }
export async function latestRelease(repo: string, release: string): Promise<Release> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const gh: { tag_name: string; html_url: string; assets: { name: string; size: number; browser_download_url: string }[] } = await res.json()
  const version = gh.tag_name.replace(/^v/, '')
  const asset = gh.assets.find((a) => a.name.endsWith(`_${version}_${release}.bin`))
  return {
    version, page: gh.html_url,
    file: asset && { name: asset.name, size: asset.size, url: asset.browser_download_url.replace(/^https?:\/\/[^/]+/, 'https://download.wled.me') },
  }
}

// Downloads a firmware file with progress from 0 to 1.
export async function download(url: string, name: string, size: number, onProgress: (p: number) => void): Promise<File> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const total = Number(res.headers.get('Content-Length')) || size
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.length
    if (total) onProgress(Math.min(1, got / total))
  }
  return new File(chunks as BlobPart[], name, { type: 'application/octet-stream' })
}

// Compares versions like "16.0.1" and "0.15.0-b3": by their numbers, then a release is newer than a beta or
// other build of the same numbers.
export function compareVersions(a: string, b: string) {
  const parse = (v: string) => { const [nums, ...rest] = v.split('-'); return { n: nums.split('.').map((x) => Number.parseInt(x) || 0), pre: rest.length > 0 } }
  const x = parse(a), y = parse(b)
  for (let i = 0; i < Math.max(x.n.length, y.n.length); i++) {
    const d = (x.n[i] ?? 0) - (y.n[i] ?? 0)
    if (d) return d
  }
  return Number(y.pre) - Number(x.pre)
}
