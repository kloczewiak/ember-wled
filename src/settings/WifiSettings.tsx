import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Icon, Switch } from '../components/controls'
import { useStore } from '../store'
import { scanNetworks, type Cfg, type ScannedNet } from './api'
import { useCfgForm } from './config'
import { FieldError, IpInput, ipValid, Row, SaveBar, Section, useLeaveGuard, useSaver } from './shared'

// Settings → Wi-Fi and network, with the same fields, limits and conditional sections as the firmware's
// page (data/settings_wifi.htm, filled by xml.cpp, saved by set.cpp).

const MAX_NETWORKS = 3 // WLED_MAX_WIFI_COUNT
const MAX_REMOTES = 10
const AP_OPENS = ['No connection after boot', 'Disconnected', 'Always', 'Never (not recommended)', 'Temporary (no connection after boot)']
const TX_POWER: [number, string][] = [[84, '21 dBm'], [82, '20.5 dBm'], [80, '20 dBm'], [78, '19.5 dBm'], [76, '19 dBm'], [74, '18.5 dBm'],
  [68, '17 dBm'], [60, '15 dBm'], [52, '13 dBm'], [44, '11 dBm'], [34, '8.5 dBm'], [28, '7 dBm'], [20, '5 dBm'], [8, '2 dBm']]
const BANDS: [number, string][] = [[1, '2.4 GHz only'], [2, '5 GHz only'], [3, 'Auto (both)']]
const ETHERNET: [number, string][] = [[0, 'None'], [6, 'IoTorero/ESP32Deux/RGB2Go'], [9, 'ABC! WLED V43 and compatible'], [2, 'ESP32-POE'],
  [11, 'ESP32-POE-WROVER'], [7, 'KIT-VE'], [12, 'LILYGO T-POE Pro'], [4, 'QuinLED Uno/Quad'], [8, 'QuinLED Octa and T-ETH-POE'],
  [14, 'QuinLED v4 Uno/Quad'], [15, 'QuinLED v4 Octa'], [10, 'Serg74-ETH32'], [5, 'TwilightLord-ESP32'], [3, 'WESP32'], [1, 'WT32-ETH01'], [13, 'Gledopto']]

// Passwords never leave the light, only their length (pskl). An empty field keeps the stored password: we
// post asterisks of its length, which set.cpp treats as "unchanged" (as the stock page's prefilled field
// does). `remove` posts an empty password instead, like clearing the field on the stock page.
const stars = (n: number) => '*'.repeat(n)
type Secret = { pw: string; pskl: number; remove: boolean }
const keep = (pskl: number): Secret => ({ pw: '', pskl, remove: false })
const secretField = (s: Secret) => (s.remove ? '' : s.pw === '' ? stars(s.pskl) : s.pw)

type Net = Secret & { ssid: string; bssid: string; ip: number[]; gw: number[]; sn: number[]; enc: number; anon: string; ident: string }
type Form = {
  nets: Net[]; dns: number[]; mdns: string
  ap: Secret & { ssid: string; hide: boolean; chan: number; behav: number }
  phy: boolean; noSleep: boolean; band?: number; tx?: number; espnow?: boolean; remotes: string[]; eth?: number
}

const newNet = (): Net => ({ ssid: '', ...keep(0), bssid: '', ip: [0, 0, 0, 0], gw: [0, 0, 0, 0], sn: [255, 255, 255, 0], enc: 0, anon: '', ident: '' })

function toForm(c: Cfg): Form {
  return {
    nets: c.nw.ins.map((n) => ({ ssid: n.ssid, ...keep(n.pskl), bssid: n.bssid, ip: n.ip, gw: n.gw, sn: n.sn, enc: n.enc_type ?? 0, anon: n.e_anon_ident ?? '', ident: n.e_ident ?? '' })),
    dns: c.nw.dns, mdns: c.id.mdns,
    ap: { ssid: c.ap.ssid, hide: !!c.ap.hide, ...keep(c.ap.pskl), chan: c.ap.chan, behav: c.ap.behav },
    phy: c.wifi.phy, noSleep: !c.wifi.sleep, band: c.wifi.band, tx: c.wifi.txpwr, espnow: c.nw.espnow, remotes: c.nw.linked_remote ?? [], eth: c.eth?.type,
  }
}

// The fields the stock form posts, in the firmware's names.
function toFields(f: Form, enterprise: boolean): [string, string][] {
  const out: [string, string][] = []
  f.nets.forEach((n, i) => {
    out.push([`CS${i}`, n.ssid], [`PW${i}`, secretField(n)], [`BS${i}`, n.bssid])
    for (const [p, v] of [['IP', n.ip], ['GW', n.gw], ['SN', n.sn]] as const) v.forEach((x, j) => out.push([`${p}${i}${j}`, String(x)]))
    if (enterprise) out.push([`ET${i}`, String(n.enc)], [`EA${i}`, n.anon], [`EI${i}`, n.ident])
  })
  f.dns.forEach((x, j) => out.push([`D${j}`, String(x)]))
  out.push(['CM', f.mdns], ['AS', f.ap.ssid], ['AP', secretField(f.ap)], ['AC', String(f.ap.chan)], ['AB', String(f.ap.behav)])
  if (f.ap.hide) out.push(['AH', 'on'])
  if (f.phy) out.push(['FG', 'on'])
  if (f.noSleep) out.push(['WS', 'on'])
  if (f.band !== undefined) out.push(['BM', String(f.band)])
  if (f.tx !== undefined) out.push(['TX', String(f.tx)])
  if (f.espnow !== undefined) {
    if (f.espnow) out.push(['RE', 'on'])
    f.remotes.forEach((m, i) => out.push([`RM${i}`, m]))
  }
  if (f.eth !== undefined) out.push(['ETH', String(f.eth)])
  return out
}

// The checks the stock page's inputs make (required, min/max, maxlength, pattern) plus the MAC check of aR().
function validate(f: Form): string[] {
  const errors: string[] = []
  f.nets.forEach((n, i) => {
    const name = `Network ${i + 1}`
    if (i > 0 && !n.ssid) errors.push(`${name} needs a name, or remove it.`)
    if (![n.ip, n.gw, n.sn].every(ipValid)) errors.push(`${name}: each part of the IP, gateway and subnet must be 0–255.`)
  })
  if (!ipValid(f.dns)) errors.push('Each part of the DNS server must be 0–255.')
  // the stock rule (empty or 8–63 characters) applied to a newly typed AP password; empty keeps or removes it
  const ap = f.ap.pw
  if (!f.ap.remove && ap !== '' && (ap.length < 8 || ap.length > 63)) errors.push('The AP password must be 8–63 characters.')
  if (!Number.isInteger(f.ap.chan) || f.ap.chan < 1 || f.ap.chan > 13) errors.push('The AP channel must be a whole number from 1 to 13.')
  if (f.remotes.some((m) => !/^[0-9a-f]{12}$/i.test(m))) errors.push('Linked remote MACs must be 12 hex characters.')
  return errors
}

// A password field whose stored value shows as placeholder dots. Remove (only when one is stored) clears it.
function PasswordInput({ secret, maxLength, label, onChange }: { secret: Secret; maxLength: number; label: string; onChange: (p: Partial<Secret>) => void }) {
  const placeholder = secret.remove ? 'Will be removed' : secret.pskl ? '•'.repeat(secret.pskl) : 'No password'
  return (
    <div className="flex gap-2">
      <Input type="password" maxLength={maxLength} value={secret.pw} placeholder={placeholder} aria-label={label}
        disabled={secret.remove} onChange={(e) => onChange({ pw: e.target.value })} />
      {secret.pskl > 0 && (
        <Button variant="outline" onClick={() => onChange(secret.remove ? { remove: false } : { remove: true, pw: '' })}>
          {secret.remove ? 'Undo' : 'Remove'}
        </Button>
      )}
    </div>
  )
}

function SsidField({ value, onChange, scanned, label }: { value: string; onChange: (v: string) => void; scanned: ScannedNet[] | null; label: string }) {
  const [custom, setCustom] = useState(false)
  // like the stock page: after a scan, a field that's empty or matches a found network becomes a list
  const useList = scanned && scanned.length > 0 && !custom && (value === '' || value === 'Your_Network' || scanned.some((s) => s.ssid === value))
  if (useList) {
    return (
      <NativeSelect className="w-full" value={value} aria-label={label}
        onChange={(e) => { if (e.target.value === '!Cs') setCustom(true); else onChange(e.target.value) }}>
        {value === '' && <option value="">Choose a network</option>}
        {scanned.map((s) => <option key={s.ssid} value={s.ssid}>{`${s.ssid} (${s.rssi} dBm, Ch ${s.channel})`}</option>)}
        <option value="!Cs">Other network…</option>
      </NativeSelect>
    )
  }
  return <Input maxLength={32} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
}

export function WifiSettings() {
  const info = useStore((s) => s.info)
  const [scanned, setScanned] = useState<ScannedNet[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const { draft: f, setDraft, dirty, discard, cfg, error, retry, reloadAfterSave } = useCfgForm(toForm)
  useLeaveGuard(dirty)
  const { save, saving, dialog } = useSaver('wifi', reloadAfterSave)

  if (error && !f) return <p className="text-sm text-muted-foreground">Couldn't load the settings. <Button variant="link" onClick={retry}>Try again</Button></p>
  if (!f || !cfg) return <p className="text-sm text-muted-foreground">Loading settings…</p>

  const enterprise = cfg.nw.ins.some((n) => n.enc_type !== undefined)
  const errors = validate(f)
  const set = (p: Partial<Form>) => setDraft({ ...f, ...p })
  const setNet = (i: number, p: Partial<Net>) => set({ nets: f.nets.map((n, j) => (j === i ? { ...n, ...p } : n)) })
  const setAp = (p: Partial<Form['ap']>) => set({ ap: { ...f.ap, ...p } })
  // the AP always runs at 4.3.2.1 (wled.cpp initAP); info.wifi.ap says whether it is up
  const apIp = info?.wifi.ap ? '4.3.2.1' : 'Not active'

  return (
    <div className="flex flex-col gap-4">
      <Section title="Wireless networks">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-xs text-muted-foreground">The light connects to the first network it finds, in this order.</p>
          <Button variant="outline" disabled={scanning} onClick={async () => { setScanning(true); setScanned(await scanNetworks()); setScanning(false) }}>
            {scanning ? 'Scanning…' : 'Scan'}
          </Button>
        </div>
        {f.nets.map((n, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="text-xs font-medium text-muted-foreground">Network {i + 1}</div>
            <Row label="Name (SSID)" hint={i === 0 ? 'Leave empty to not connect' : undefined} stack>
              <SsidField value={n.ssid} onChange={(ssid) => setNet(i, { ssid })} scanned={scanned} label={`Network ${i + 1} name`} />
            </Row>
            {enterprise && (
              <Row label="Encryption" stack>
                <NativeSelect className="w-full" value={n.enc} onChange={(e) => setNet(i, { enc: Number(e.target.value) })}>
                  <option value={0}>None/WPA/WPA2</option>
                  <option value={1}>WPA/WPA2-Enterprise</option>
                </NativeSelect>
              </Row>
            )}
            {enterprise && n.enc === 1 && (
              <>
                <Row label="Anonymous identity" stack><Input maxLength={64} value={n.anon} onChange={(e) => setNet(i, { anon: e.target.value })} /></Row>
                <Row label="Identity" stack><Input maxLength={64} value={n.ident} onChange={(e) => setNet(i, { ident: e.target.value })} /></Row>
              </>
            )}
            <Row label="Password" hint={n.pskl ? 'Leave empty to keep the current password.' : undefined} stack>
              <PasswordInput secret={n} maxLength={64} label={`Network ${i + 1} password`} onChange={(p) => setNet(i, p)} />
            </Row>
            <Row label="BSSID" hint="Optional: connect to this access point only" stack>
              <Input className="font-mono" maxLength={12} value={n.bssid} onChange={(e) => setNet(i, { bssid: e.target.value })} />
            </Row>
            <Row label="Static IP" hint={`0.0.0.0 uses DHCP${i === 0 ? '. Also used by Ethernet.' : ''}`} stack>
              <IpInput label="Static IP" value={n.ip} onChange={(ip) => setNet(i, { ip })} />
            </Row>
            <Row label="Static gateway" stack><IpInput label="Static gateway" value={n.gw} onChange={(gw) => setNet(i, { gw })} /></Row>
            <Row label="Static subnet mask" stack><IpInput label="Static subnet mask" value={n.sn} onChange={(sn) => setNet(i, { sn })} /></Row>
          </div>
        ))}
        <div className="flex gap-2">
          {f.nets.length < MAX_NETWORKS && <Button variant="outline" onClick={() => set({ nets: [...f.nets, newNet()] })}><Icon.plus />Add network</Button>}
          {f.nets.length > 1 && <Button variant="outline" onClick={() => set({ nets: f.nets.slice(0, -1) })}><Icon.trash />Remove last</Button>}
        </div>
      </Section>

      {f.eth !== undefined && (
        <Section title="Ethernet">
          <Row label="Ethernet type" stack>
            <NativeSelect className="w-full" value={f.eth} onChange={(e) => set({ eth: Number(e.target.value) })}>
              {ETHERNET.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </Row>
        </Section>
      )}

      <Section title="DNS and mDNS">
        <Row label="DNS server" stack><IpInput label="DNS server" value={f.dns} onChange={(dns) => set({ dns })} /></Row>
        <Row label="mDNS address" hint="Leave empty for no mDNS" stack>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            http://<Input maxLength={32} value={f.mdns} onChange={(e) => set({ mdns: e.target.value })} aria-label="mDNS address" />.local
          </div>
        </Row>
        <Row label="Client IP"><span className="font-mono text-sm">{info?.ip || 'Not connected'}</span></Row>
      </Section>

      <Section title="Access point">
        <Row label="AP name (SSID)" hint="Leave empty for no AP" stack>
          <Input maxLength={32} value={f.ap.ssid} onChange={(e) => setAp({ ssid: e.target.value })} />
        </Row>
        <Row label="Hide AP name"><Switch on={f.ap.hide} label="Hide AP name" onChange={(hide) => setAp({ hide })} /></Row>
        <Row label="AP password" hint={`At least 8 characters. ${f.ap.pskl ? 'Leave empty to keep the current one, or remove it for an open AP.' : 'Leave empty for an open AP.'}`} stack>
          <PasswordInput secret={f.ap} maxLength={63} label="AP password" onChange={setAp} />
        </Row>
        <Row label="AP channel">
          <Input className="w-20" type="number" min={1} max={13} value={Number.isNaN(f.ap.chan) ? '' : f.ap.chan}
            onChange={(e) => setAp({ chan: e.target.value === '' ? NaN : Number(e.target.value) })} />
        </Row>
        <Row label="AP opens" stack>
          <NativeSelect className="w-full" value={f.ap.behav} onChange={(e) => setAp({ behav: Number(e.target.value) })}>
            {AP_OPENS.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </NativeSelect>
        </Row>
        <Row label="AP IP"><span className="font-mono text-sm">{apIp}</span></Row>
      </Section>

      <Section title="Wi-Fi power">
        <Row label="Force 802.11g mode" hint="ESP8266 only"><Switch on={f.phy} label="Force 802.11g mode" onChange={(phy) => set({ phy })} /></Row>
        <Row label="Disable Wi-Fi sleep" hint="Uses more power, but can help with connection problems and sync.">
          <Switch on={f.noSleep} label="Disable Wi-Fi sleep" onChange={(noSleep) => set({ noSleep })} />
        </Row>
        {f.band !== undefined && (
          <Row label="Wi-Fi band" stack>
            <NativeSelect className="w-full" value={f.band} onChange={(e) => set({ band: Number(e.target.value) })}>
              {BANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </NativeSelect>
          </Row>
        )}
        {f.tx !== undefined && (
          <>
            <Row label="Max TX power" stack>
              <NativeSelect className="w-full" value={f.tx} onChange={(e) => set({ tx: Number(e.target.value) })}>
                {!TX_POWER.some(([v]) => v === f.tx) && <option value={f.tx}>{f.tx / 4} dBm</option>}
                {TX_POWER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
            </Row>
            <Alert><AlertDescription>Changing the TX power can make the light unreachable.</AlertDescription></Alert>
          </>
        )}
      </Section>

      {f.espnow !== undefined && (
        <Section title="ESP-NOW">
          <Row label="Enable ESP-NOW" hint="Listens for remotes and ESP-NOW sync. Uses more power, so keep it off if you don't use it.">
            <Switch on={f.espnow} label="Enable ESP-NOW" onChange={(espnow) => set({ espnow })} />
          </Row>
          {f.espnow && (
            <>
              <div className="text-xs font-medium text-muted-foreground">Linked remotes ({f.remotes.length} of {MAX_REMOTES})</div>
              {f.remotes.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <Input className="font-mono" maxLength={12} value={m} aria-label={`Linked remote ${i + 1}`}
                    onChange={(e) => set({ remotes: f.remotes.map((r, j) => (j === i ? e.target.value : r)) })} />
                  <Button variant="outline" size="icon-lg" aria-label={`Remove linked remote ${i + 1}`} onClick={() => set({ remotes: f.remotes.filter((_, j) => j !== i) })}><Icon.x /></Button>
                </div>
              ))}
              {/* the stock page adds the last ESP-NOW device seen, which only its settings script exposes (see PARITY.md) */}
              {f.remotes.length < MAX_REMOTES && (
                <Button variant="outline" className="self-start" onClick={() => set({ remotes: [...f.remotes, ''] })}><Icon.plus />Add remote</Button>
              )}
            </>
          )}
        </Section>
      )}

      <Alert>
        <AlertDescription>Saving may reconnect the light, and it may get a new IP address. This page reconnects by itself if it can.</AlertDescription>
      </Alert>
      <SaveBar dirty={dirty} saving={saving} error={errors[0]} saveLabel="Save and connect"
        onSave={() => save(toFields(f, enterprise))} onDiscard={discard} />
      <FieldError>{errors.length > 1 ? errors.slice(1).join(' ') : undefined}</FieldError>
      {dialog}
    </div>
  )
}
