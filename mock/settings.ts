// Fake settings backend for the mock device: /json/cfg (read), the firmware's form POSTs to /settings/wifi
// and /settings/ui (write, applied with the same rules as wled00/set.cpp), and /json/net.
// Set WLED_MOCK_PIN to require a settings PIN, as the firmware does when one is configured.

const PIN = process.env.WLED_MOCK_PIN ?? ''
let pinOk = PIN === ''

const secrets = { wifi: ['hunter22', '', ''], ap: 'wled1234' }

type Net = { ssid: string; bssid: string; ip: number[]; gw: number[]; sn: number[] }

export const cfg = {
  id: { mdns: 'wled-mock', name: 'WLED-Mock', inv: 'Light', sui: false },
  nw: {
    espnow: false,
    linked_remote: ['a1b2c3d4e5f6'] as string[],
    ins: [{ ssid: 'Mock Network', bssid: '', ip: [0, 0, 0, 0], gw: [0, 0, 0, 0], sn: [255, 255, 255, 0] }] as Net[],
    dns: [192, 168, 1, 1],
  },
  ap: { ssid: 'WLED-AP', chan: 1, hide: 0, behav: 1, ip: [4, 3, 2, 1] },
  wifi: { sleep: false, phy: false, txpwr: 78 },
}

// the parts of /json/cfg the settings pages read; passwords are never sent, only their length (pskl)
export function cfgJson() {
  return {
    ...cfg,
    nw: { ...cfg.nw, ins: cfg.nw.ins.map((n, i) => ({ ...n, pskl: secrets.wifi[i].length })) },
    ap: { ...cfg.ap, pskl: secrets.ap.length },
  }
}

export function scan() {
  return {
    networks: [
      { ssid: 'Mock Network', rssi: -52, bssid: '00:11:22:33:44:55', channel: 6, enc: 3 },
      { ssid: 'Neighbour', rssi: -81, bssid: '66:77:88:99:aa:bb', channel: 11, enc: 3 },
      { ssid: 'Mock Network', rssi: -70, bssid: '00:11:22:33:44:56', channel: 1, enc: 3 },
    ],
  }
}

// {"pin": "..."} in any JSON POST unlocks the settings, like checkSettingsPIN()
export function checkPin(body: Record<string, unknown>) {
  if (typeof body.pin === 'string') pinOk = PIN === '' || body.pin === PIN
}

const asterisksOnly = (s: string) => s.length > 0 && /^\*+$/.test(s)

// Applies a settings form POST; returns the HTTP status the firmware would.
export function postSettings(page: string, form: URLSearchParams): number {
  if (!pinOk) return 401
  const arg = (k: string) => form.get(k) ?? ''
  if (page === 'ui') {
    cfg.id.name = arg('DS').slice(0, 32)
    cfg.id.sui = form.has('SU')
    return 200
  }
  if (page !== 'wifi') return 404
  const nets: Net[] = []
  for (let n = 0; n < 3; n++) {
    if (!form.has(`CS${n}`)) continue
    const octets = (p: string) => [0, 1, 2, 3].map((i) => Number(arg(`${p}${n}${i}`)) || 0)
    nets.push({ ssid: arg(`CS${n}`).slice(0, 32), bssid: arg(`BS${n}`).slice(0, 12), ip: octets('IP'), gw: octets('GW'), sn: octets('SN') })
    if (!asterisksOnly(arg(`PW${n}`))) secrets.wifi[n] = arg(`PW${n}`).slice(0, 64)
  }
  cfg.nw.ins = nets // fewer networks posted = the rest removed
  if (form.has('D0')) cfg.nw.dns = [0, 1, 2, 3].map((i) => Number(arg(`D${i}`)) || 0)
  cfg.id.mdns = arg('CM').slice(0, 32)
  cfg.ap.behav = Number(arg('AB')) || 0
  cfg.ap.ssid = arg('AS').slice(0, 32)
  cfg.ap.hide = form.has('AH') ? 1 : 0
  const ap = arg('AP')
  if (ap.length === 0 || (ap.length > 7 && !asterisksOnly(ap))) secrets.ap = ap
  const ch = Number(arg('AC'))
  if (ch > 0 && ch < 14) cfg.ap.chan = ch
  cfg.wifi.txpwr = Math.min(Math.max(Number(arg('TX')) || 0, 8), 78) // v16.0.1: 2 to 19.5 dBm
  cfg.wifi.phy = form.has('FG')
  cfg.wifi.sleep = !form.has('WS')
  cfg.nw.espnow = form.has('RE')
  cfg.nw.linked_remote = [...Array(10).keys()].map((i) => arg(`RM${i}`).toLowerCase()).filter(Boolean)
  return 200
}
