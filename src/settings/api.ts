// Settings are read through /json/cfg but saved by posting the same form fields as the firmware's own
// settings pages, to the same /settings/<page> URL. That way the firmware runs its usual handler
// (wled00/set.cpp) with all of its checks and side effects, e.g. reconnecting Wi-Fi or dropping a removed
// network, which /json/cfg would not do.

export interface WifiNet { ssid: string; pskl: number; bssid: string; ip: number[]; gw: number[]; sn: number[]; enc_type?: number; e_anon_ident?: string; e_ident?: string }

// The parts of /json/cfg the settings pages use. Optional keys only exist on firmware builds that support
// the feature (ESP-NOW, WPA-Enterprise, 5 GHz, TX power on ESP32, Ethernet), mirroring what the stock page hides.
export interface Cfg {
  id: { mdns: string; name: string; sui: boolean }
  nw: { espnow?: boolean; linked_remote?: string[]; ins: WifiNet[]; dns: number[] }
  ap: { ssid: string; pskl: number; chan: number; hide: number; behav: number; ip: number[] }
  wifi: { sleep: boolean; phy: boolean; txpwr?: number; band?: number }
  eth?: { type: number }
  dmx?: unknown // only on builds with DMX output (WLED_ENABLE_DMX)
}

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

// The JSON API accepts the settings PIN in any POST and unlocks settings for a while (checkSettingsPIN).
export async function unlockSettings(pin: string) {
  await fetch('/json/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })
}
