// Fake settings backend for the mock device: /json/cfg (read), the firmware's form POSTs to /settings/wifi
// and /settings/ui (write, applied with the same rules as wled00/set.cpp), and /json/net.
// Set WLED_MOCK_PIN to require a settings PIN, as the firmware does when one is configured.

const PIN = process.env.WLED_MOCK_PIN ?? ''
let pinOk = PIN === ''

const secrets = { wifi: ['hunter22', '', ''], ap: 'wled1234', mqtt: 'brokerpass', ota: 'wledota' }

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
  // what accurate Peek reads: gamma, brightness factor, one WS2812 output and the global 5A current limit
  light: { 'scale-bri': 100, gc: { bri: 1, col: 2.2, val: 2.2 }, nl: { mode: 1, dur: 60, tbri: 0, macro: 0 } },
  hw: {
    led: { maxpwr: 5000, ins: [{ start: 0, len: 300, type: 22, ledma: 55, maxpwr: 5000 }] },
    // a pushbutton, a switch and an analog input, to show each kind on Time and macros
    btn: { ins: [{ type: 2, pin: [0], macros: [1, 0, 2] }, { type: 4, pin: [13], macros: [0, 0, 0] }, { type: 7, pin: [34], macros: [0, 0, 250] }], mqtt: false },
    baud: 1152,
  },
  // Sync interfaces (a build with every optional feature: ESP-NOW, DMX input, Alexa, MQTT, Hue)
  if: {
    sync: {
      port0: 21324, port1: 65506, espnow: false,
      recv: { bri: true, col: true, fx: true, pal: true, grp: 1, seg: false, sb: false },
      send: { en: false, dir: false, btn: false, va: false, hue: true, grp: 1, ret: 0 },
    },
    nodes: { list: true, bcast: true },
    live: {
      en: true, mso: false, rlm: true, port: 5568, mc: false,
      dmx: { uni: 1, seqskip: false, e131prio: 0, addr: 1, dss: 0, mode: 4, inputRxPin: -1, inputTxPin: -1, inputEnablePin: -1, dmxInputPort: 2 },
      timeout: 25, maxbri: false, 'no-gc': true, offset: 0,
    },
    va: { alexa: false, macros: [0, 0], p: 0 },
    mqtt: { en: false, broker: '', port: 1883, user: '', cid: 'WLED-mock', rtn: false, topics: { device: 'wled/mock', group: 'wled/all' } },
    hue: { en: false, id: 1, iv: 25, recv: { on: true, bri: true, col: true }, ip: [192, 168, 1, 0] },
    ntp: { en: true, host: '0.wled.pool.ntp.org', tz: 2, offset: 0, ampm: false, ln: 20.86, lt: 51.8 },
  },
  ota: { lock: false, 'lock-wifi': false, aota: true, 'same-subnet': true },
  ol: { clock: 0, cntdwn: false, min: 0, max: 29, o12pix: 0, o5m: false, osec: false, osb: false },
  timers: {
    cntdwn: { goal: [26, 12, 24, 18, 0, 0], macro: 0 },
    ins: [
      { en: 1, hour: 7, min: 0, macro: 1, dow: 31, start: { mon: 1, day: 1 }, end: { mon: 12, day: 31 } },
      { en: 1, hour: 254, min: 15, macro: 2, dow: 127, start: { mon: 10, day: 1 }, end: { mon: 3, day: 31 } },
    ] as { en: number; hour: number; min: number; macro: number; dow: number; start: { mon: number; day: number }; end: { mon: number; day: number } }[],
  },
}

// the parts of /json/cfg the settings pages read; passwords are never sent, only their length (pskl)
export function cfgJson() {
  return {
    ...cfg,
    nw: { ...cfg.nw, ins: cfg.nw.ins.map((n, i) => ({ ...n, pskl: secrets.wifi[i].length })) },
    ap: { ...cfg.ap, pskl: secrets.ap.length },
    if: { ...cfg.if, mqtt: { ...cfg.if.mqtt, pskl: secrets.mqtt.length } },
    ota: { ...cfg.ota, pskl: secrets.ota.length },
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
  if (page === 'sync') return postSync(form)
  if (page === 'time') return postTime(form)
  if (page === 'sec') return postSec(form)
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

// set.cpp's SUBPAGE_SYNC: checkboxes are on when posted, numbers only taken when in range
function postSync(form: URLSearchParams): number {
  const arg = (k: string) => form.get(k) ?? ''
  const num = (k: string) => Number(arg(k))
  const has = (k: string) => form.has(k)
  const i = cfg.if
  if (num('UP') > 0) i.sync.port0 = num('UP')
  if (num('U2') > 0) i.sync.port1 = num('U2')
  i.sync.espnow = has('EN')
  i.sync.send.grp = num('GS'); i.sync.recv.grp = num('GR')
  Object.assign(i.sync.recv, { bri: has('RB'), col: has('RC'), fx: has('RX'), pal: has('RP'), seg: has('SO'), sb: has('SG') })
  Object.assign(i.sync.send, { en: has('SS'), dir: has('SD'), btn: has('SB'), va: has('SA'), hue: has('SH') })
  if (num('UR') >= 0 && num('UR') < 30) i.sync.send.ret = num('UR')
  i.nodes = { list: has('NL'), bcast: has('NB') }
  Object.assign(i.live, { en: has('RD'), mso: has('MO'), rlm: has('RLM'), mc: has('EM'), maxbri: has('FB'), 'no-gc': has('RG') })
  i.live.dmx.seqskip = has('ES')
  if (num('EP') > 0) i.live.port = num('EP')
  if (num('EU') >= 0 && num('EU') <= 63999) i.live.dmx.uni = num('EU')
  if (num('DA') >= 0 && num('DA') <= 510) i.live.dmx.addr = num('DA')
  if (num('XX') >= 0 && num('XX') <= 150) i.live.dmx.dss = num('XX')
  if (num('PY') >= 0 && num('PY') <= 200) i.live.dmx.e131prio = num('PY')
  if (num('DM') >= 0 && num('DM') <= 10) i.live.dmx.mode = num('DM')
  if (num('ET') > 99 && num('ET') <= 65000) i.live.timeout = Math.floor(num('ET') / 100)
  if (num('WO') >= -255 && num('WO') <= 255) i.live.offset = num('WO')
  // stored swapped, like the firmware: inputRxPin holds the transmit pin
  Object.assign(i.live.dmx, { inputRxPin: num('IDMT'), inputTxPin: num('IDMR'), inputEnablePin: num('IDME'), dmxInputPort: num('IDMP') > 0 && num('IDMP') <= 2 ? num('IDMP') : 2 })
  i.va.alexa = has('AL'); cfg.id.inv = arg('AI').slice(0, 32)
  if (num('AP') >= 0 && num('AP') <= 9) i.va.p = num('AP')
  Object.assign(i.mqtt, { en: has('MQ'), broker: arg('MS').slice(0, 32), user: arg('MQUSER').slice(0, 40), cid: arg('MQCID').slice(0, 40), rtn: has('RT') })
  if (num('MQPORT') > 0) i.mqtt.port = num('MQPORT')
  if (!asterisksOnly(arg('MQPASS'))) secrets.mqtt = arg('MQPASS').slice(0, 64)
  i.mqtt.topics = { device: arg('MD').slice(0, 32), group: arg('MG').slice(0, 32) }
  cfg.hw.btn.mqtt = has('BM')
  i.hue.ip = [0, 1, 2, 3].map((j) => num(`H${j}`) || 0)
  if (num('HL') > 0) i.hue.id = num('HL')
  if (num('HI') > 50) i.hue.iv = Math.floor(num('HI') / 100)
  Object.assign(i.hue, { en: has('HP'), recv: { on: has('HO'), bri: has('HB'), col: has('HC') } })
  if (num('BD') >= 96 && num('BD') <= 15000) cfg.hw.baud = num('BD')
  return 200
}

// set.cpp's SUBPAGE_TIME and ntp.cpp's addTimer/compactTimers
function postTime(form: URLSearchParams): number {
  const arg = (k: string) => form.get(k) ?? ''
  const num = (k: string) => Number(arg(k))
  const has = (k: string) => form.has(k)
  Object.assign(cfg.if.ntp, { en: has('NT'), host: arg('NS').slice(0, 32), ampm: !has('CF'), tz: num('TZ'), offset: num('UO'), ln: num('LN'), lt: num('LT') })
  Object.assign(cfg.ol, { clock: has('OL') ? 1 : 0, min: num('O1'), max: num('O2'), o12pix: num('OM'), o5m: has('O5'), osec: has('OS'), osb: has('OB'), cntdwn: has('CE') })
  cfg.timers.cntdwn.goal = ['CY', 'CI', 'CD', 'CH', 'CM', 'CS'].map(num)
  cfg.timers.cntdwn.macro = num('MC'); cfg.light.nl.macro = num('MN')
  cfg.if.va.macros = [num('A0'), num('A1')]
  cfg.hw.btn.ins.forEach((b, i) => {
    const k = String.fromCharCode((i < 10 ? 48 : 55) + i)
    b.macros = [num(`MP${k}`) || 0, num(`ML${k}`) || 0, num(`MD${k}`) || 0]
  })
  const timers: typeof cfg.timers.ins = []
  for (let i = 0; i < 64; i++) {
    if (!has(`T${i}`)) continue
    const preset = num(`T${i}`), hour = num(`H${i}`), w = num(`W${i}`)
    const min = Math.max(-120, Math.min(120, num(`N${i}`)))
    if (hour > 24 && hour !== 254 && hour !== 255) continue
    if (hour <= 24 && (min < 0 || min > 59)) continue
    if (preset === 0) continue // compactTimers
    timers.push({ en: w & 1, hour, min, macro: preset, dow: w >> 1, start: { mon: num(`M${i}`) || 1, day: num(`D${i}`) || 1 }, end: { mon: num(`P${i}`) || 12, day: num(`E${i}`) || 31 } })
  }
  cfg.timers.ins = timers
  return 200
}

// set.cpp's SUBPAGE_SEC (a factory reset only logs here, the mock keeps its data)
let lastSecEdit = 0
function postSec(form: URLSearchParams): number {
  const arg = (k: string) => form.get(k) ?? ''
  if (form.has('RS')) { console.log('[mock] factory reset requested'); return 200 }
  if (form.has('PIN')) {
    const pin = arg('PIN')
    if ((pin.length === 4 && pin !== '0000') || pin.length === 0) console.log(`[mock] settings PIN ${pin ? 'set' : 'removed'}`)
  }
  let ok = !cfg.ota.lock
  if (form.has('OP')) {
    if (cfg.ota.lock && arg('OP') === secrets.ota && Date.now() - lastSecEdit > 3000) ok = true
    if (!cfg.ota.lock && arg('OP').length > 0) secrets.ota = arg('OP').slice(0, 32)
  }
  lastSecEdit = Date.now()
  if (ok) {
    cfg.ota.lock = form.has('NO')
    cfg.ota['lock-wifi'] = form.has('OW')
    cfg.ota.aota = form.has('AO')
    cfg.ota['same-subnet'] = form.has('SU')
  }
  return 200
}

// /json/pins: usable GPIOs (an ESP32 without the flash pins), with the button pins allocated
export function pins() {
  const usable = [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39]
  const system = [6, 7, 8, 9, 10, 11]
  const caps = (p: number) => (p >= 34 ? 0x22 : 0) | (p === 0 ? 0x08 : 0) | (p === 2 || p === 12 ? 0x10 : 0) | ([32, 33].includes(p) ? 0x02 : 0)
  const used: Record<number, object> = {
    0: { o: 0x85, n: 'Button', t: 2, m: 0, s: Math.random() < 0.2 ? 1 : 0 },
    13: { o: 0x85, n: 'Button', t: 4, m: 0, s: 1 },
    34: { o: 0x85, n: 'Button', t: 7, m: 0, s: 0, r: Math.round(1800 + Math.random() * 50) },
    5: { o: 0x87, n: 'Relay', m: 1, s: 1 },
    16: { o: 0x82, n: 'LED Digital' },
  }
  const all = [...usable, ...system].sort((a, b) => a - b)
  return {
    pins: all.map((p) => system.includes(p) ? { p, c: 0, a: true, o: 0, n: 'System' }
      : { p, c: caps(p), a: p in used, ...used[p] }),
  }
}
