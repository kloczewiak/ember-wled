import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Switch } from '../components/controls'
import type { Cfg } from './api'
import { useCfgForm } from './config'
import { OWNER, PinPicker, usePins } from './pins'
import {
  ChoiceChip,
  intIn,
  IpInput,
  ipValid,
  keepSecret,
  NumberInput,
  PasswordInput,
  Row,
  SaveBar,
  secretField,
  Section,
  useLeaveGuard,
  useSaver,
  type Secret,
} from './shared'

// Settings → Sync interfaces, with the same fields, limits and build-dependent sections as the firmware's page
// in WLED v16.0.1 (data/settings_sync.htm, filled by xml.cpp, saved by set.cpp). Where the stock input and
// set.cpp disagree on a limit, the stricter one is used, so nothing is quietly ignored when saving.

const DMX_MODES: [number, string][] = [
  [0, 'Disabled'],
  [1, 'Single RGB'],
  [2, 'Single DRGB'],
  [3, 'Effect'],
  [7, 'Effect + White'],
  [8, 'Effect Segment'],
  [9, 'Effect Segment + White'],
  [4, 'Multi RGB'],
  [5, 'Dimmer + Multi RGB'],
  [6, 'Multi RGBW'],
  [10, 'Preset'],
]
const DMX_TYPES: [number, string][] = [
  [5568, 'E1.31 (sACN)'],
  [6454, 'Art-Net'],
  [0, 'Custom port'],
]
const BAUD = [1152, 2304, 4608, 5000, 5760, 9216, 10000, 15000] // in hundreds, like the firmware stores it
const RECEIVE = [
  ['bri', 'Brightness'],
  ['col', 'Color'],
  ['fx', 'Effects'],
  ['pal', 'Palette'],
  ['seg', 'Segment options'],
  ['sb', 'Segment bounds'],
] as const

type Form = {
  port0: number
  port1: number
  espnow?: boolean
  sendGrp: number
  recvGrp: number
  recv: { bri: boolean; col: boolean; fx: boolean; pal: boolean; seg: boolean; sb: boolean }
  send: { en: boolean; dir: boolean; btn: boolean; va: boolean; hue: boolean; ret: number }
  nodes: { list: boolean; bcast: boolean }
  live: { en: boolean; mso: boolean; rlm: boolean; timeout: number; maxbri: boolean; nogc: boolean; offset: number }
  dmx: {
    type: number
    port: number
    mc: boolean
    uni: number
    seqskip: boolean
    addr: number
    dss: number
    prio: number
    mode: number
  }
  dmxIn?: { rx: number; tx: number; en: number; port: number }
  alexa?: { en: boolean; name: string; presets: number }
  mqtt?: Secret & {
    en: boolean
    broker: string
    port: number
    user: string
    cid: string
    device: string
    group: string
    retain: boolean
    btn: boolean
  }
  hue?: { en: boolean; id: number; ms: number; on: boolean; bri: boolean; col: boolean; ip: number[] }
  baud: number
}

const dmxType = (port: number) => (port === 5568 || port === 6454 ? port : 0)

function toForm(c: Cfg): Form {
  const i = c.if!
  const { sync, live } = i
  const d = live.dmx
  return {
    port0: sync.port0,
    port1: sync.port1,
    espnow: sync.espnow,
    sendGrp: sync.send.grp,
    recvGrp: sync.recv.grp,
    recv: {
      bri: sync.recv.bri,
      col: sync.recv.col,
      fx: sync.recv.fx,
      pal: sync.recv.pal,
      seg: sync.recv.seg,
      sb: sync.recv.sb,
    },
    send: {
      en: sync.send.en,
      dir: sync.send.dir,
      btn: sync.send.btn,
      va: sync.send.va,
      hue: sync.send.hue,
      ret: sync.send.ret,
    },
    nodes: { ...i.nodes },
    live: {
      en: live.en,
      mso: live.mso,
      rlm: live.rlm,
      timeout: live.timeout * 100,
      maxbri: live.maxbri,
      nogc: live['no-gc'],
      offset: live.offset,
    },
    dmx: {
      type: dmxType(live.port),
      port: live.port,
      mc: live.mc,
      uni: d.uni,
      seqskip: d.seqskip,
      addr: d.addr,
      dss: d.dss,
      prio: d.e131prio,
      mode: d.mode,
    },
    // the firmware stores the transmit pin under inputRxPin and the receive pin under inputTxPin (cfg.cpp)
    dmxIn:
      d.inputRxPin === undefined
        ? undefined
        : { rx: d.inputTxPin ?? -1, tx: d.inputRxPin, en: d.inputEnablePin ?? -1, port: d.dmxInputPort ?? 2 },
    alexa: i.va && { en: i.va.alexa, name: c.id.inv ?? '', presets: i.va.p },
    mqtt: i.mqtt && {
      en: i.mqtt.en,
      broker: i.mqtt.broker,
      port: i.mqtt.port,
      user: i.mqtt.user,
      ...keepSecret(i.mqtt.pskl),
      cid: i.mqtt.cid,
      device: i.mqtt.topics.device,
      group: i.mqtt.topics.group,
      retain: i.mqtt.rtn,
      btn: !!c.hw?.btn?.mqtt,
    },
    hue: i.hue && { en: i.hue.en, id: i.hue.id, ms: i.hue.iv * 100, ...i.hue.recv, ip: i.hue.ip },
    baud: c.hw?.baud ?? 1152,
  }
}

// The fields the stock form posts, in the firmware's names. Checkboxes are only posted when ticked.
function toFields(f: Form, espnowOn: boolean): [string, string][] {
  const out: [string, string][] = []
  const val = (k: string, v: string | number) => out.push([k, String(v)])
  const on = (k: string, v: boolean) => {
    if (v) out.push([k, 'on'])
  }
  val('UP', f.port0)
  val('U2', f.port1)
  // like the stock page, the setting is hidden (and saved as off) while ESP-NOW is turned off in Wi-Fi
  if (f.espnow !== undefined) on('EN', espnowOn && f.espnow)
  val('GS', f.sendGrp)
  val('GR', f.recvGrp)
  on('RB', f.recv.bri)
  on('RC', f.recv.col)
  on('RX', f.recv.fx)
  on('RP', f.recv.pal)
  on('SO', f.recv.seg)
  on('SG', f.recv.sb)
  on('SS', f.send.en)
  on('SD', f.send.dir)
  on('SB', f.send.btn)
  on('SA', f.send.va)
  on('SH', f.send.hue)
  val('UR', f.send.ret)
  on('NL', f.nodes.list)
  on('NB', f.nodes.bcast)
  on('RD', f.live.en)
  on('MO', f.live.mso)
  on('RLM', f.live.rlm)
  val('EP', f.dmx.port)
  on('EM', f.dmx.mc)
  val('EU', f.dmx.uni)
  on('ES', f.dmx.seqskip)
  val('DA', f.dmx.addr)
  val('XX', f.dmx.dss)
  val('PY', f.dmx.prio)
  val('DM', f.dmx.mode)
  val('ET', f.live.timeout)
  on('FB', f.live.maxbri)
  on('RG', f.live.nogc)
  val('WO', f.live.offset)
  if (f.dmxIn) {
    val('IDMR', f.dmxIn.rx)
    val('IDMT', f.dmxIn.tx)
    val('IDME', f.dmxIn.en)
    val('IDMP', f.dmxIn.port)
  }
  if (f.alexa) {
    on('AL', f.alexa.en)
    val('AI', f.alexa.name)
    val('AP', f.alexa.presets)
  }
  if (f.mqtt) {
    const m = f.mqtt
    on('MQ', m.en)
    val('MS', m.broker)
    val('MQPORT', m.port)
    val('MQUSER', m.user)
    val('MQPASS', secretField(m))
    val('MQCID', m.cid)
    val('MD', m.device)
    val('MG', m.group)
    on('BM', m.btn)
    on('RT', m.retain)
  }
  if (f.hue) {
    f.hue.ip.forEach((x, j) => val(`H${j}`, x))
    val('HL', f.hue.id)
    val('HI', f.hue.ms)
    on('HP', f.hue.en)
    on('HO', f.hue.on)
    on('HB', f.hue.bri)
    on('HC', f.hue.col)
  }
  val('BD', f.baud)
  return out
}

function validate(f: Form): string[] {
  const e: string[] = []
  const check = (ok: boolean, msg: string) => {
    if (!ok) e.push(msg)
  }
  check(intIn(f.port0, 1, 65535) && intIn(f.port1, 1, 65535), 'The UDP ports must be whole numbers from 1 to 65535.')
  check(intIn(f.send.ret, 0, 29), 'Retransmissions must be a whole number from 0 to 29.')
  check(intIn(f.live.timeout, 100, 65000), 'The realtime timeout must be 100–65000 ms.')
  check(intIn(f.live.offset, -255, 255), 'The realtime LED offset must be a whole number from −255 to 255.')
  check(intIn(f.dmx.port, 1, 65535), 'The DMX port must be a whole number from 1 to 65535.')
  check(intIn(f.dmx.uni, 0, 63999), 'The start universe must be a whole number from 0 to 63999.')
  check(intIn(f.dmx.addr, 1, 510), 'The DMX start address must be a whole number from 1 to 510.')
  check(intIn(f.dmx.dss, 0, 150), 'The DMX segment spacing must be a whole number from 0 to 150.')
  check(intIn(f.dmx.prio, 0, 200), 'The E1.31 priority must be a whole number from 0 to 200.')
  if (f.alexa) check(intIn(f.alexa.presets, 0, 9), 'The number of Alexa preset devices must be 0–9.')
  if (f.mqtt) check(intIn(f.mqtt.port, 1, 65535), 'The MQTT port must be a whole number from 1 to 65535.')
  if (f.hue) {
    check(intIn(f.hue.id, 1, 99), 'The Hue light number must be a whole number from 1 to 99.')
    check(intIn(f.hue.ms, 100, 65000), 'The Hue poll interval must be 100–65000 ms.')
    check(ipValid(f.hue.ip), 'Each part of the Hue bridge IP must be 0–255.')
  }
  return e
}

function Groups({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((g) => (
        <ChoiceChip
          key={g}
          className="w-9"
          label={`${label}: group ${g + 1}`}
          on={!!(value & (1 << g))}
          onChange={(on) => onChange(on ? value | (1 << g) : value & ~(1 << g))}
        >
          {g + 1}
        </ChoiceChip>
      ))}
    </div>
  )
}

export function SyncSettings() {
  const { draft: f, setDraft, dirty, discard, cfg, error, retry, reloadAfterSave } = useCfgForm(toForm)
  useLeaveGuard(dirty)
  const { save, saving, dialog } = useSaver('sync', reloadAfterSave)
  const pins = usePins()

  if (error && !f)
    return (
      <p className="text-sm text-muted-foreground">
        Couldn't load the settings.{' '}
        <Button variant="link" onClick={retry}>
          Try again
        </Button>
      </p>
    )
  if (!f || !cfg) return <p className="text-sm text-muted-foreground">Loading settings…</p>

  const errors = validate(f)
  const set = (p: Partial<Form>) => setDraft({ ...f, ...p })
  const setRecv = (p: Partial<Form['recv']>) => set({ recv: { ...f.recv, ...p } })
  const setSend = (p: Partial<Form['send']>) => set({ send: { ...f.send, ...p } })
  const setLive = (p: Partial<Form['live']>) => set({ live: { ...f.live, ...p } })
  const setDmx = (p: Partial<Form['dmx']>) => set({ dmx: { ...f.dmx, ...p } })
  const espnowOn = !!cfg.nw.espnow
  // the saved wired DMX input pins are allocated to it, so they stay selectable
  const savedDmx = cfg.if?.live.dmx
  const ownPins = savedDmx ? [savedDmx.inputRxPin ?? -1, savedDmx.inputTxPin ?? -1, savedDmx.inputEnablePin ?? -1] : []
  const sw = (label: string, on: boolean, onChange: (v: boolean) => void, hint?: string) => (
    <Row label={label} hint={hint}>
      <Switch on={on} label={label} onChange={onChange} />
    </Row>
  )

  return (
    <div className="flex flex-col gap-4">
      <Section title="WLED sync">
        <Row label="UDP port">
          <NumberInput label="UDP port" min={1} max={65535} value={f.port0} onChange={(port0) => set({ port0 })} />
        </Row>
        <Row label="Second port">
          <NumberInput label="Second port" min={1} max={65535} value={f.port1} onChange={(port1) => set({ port1 })} />
        </Row>
        {f.espnow !== undefined &&
          (espnowOn ? (
            sw('Sync over ESP-NOW', f.espnow, (espnow) => set({ espnow }), 'Used in AP mode or without Wi-Fi.')
          ) : (
            <Row label="Sync over ESP-NOW" hint="Turn on ESP-NOW in Wi-Fi and network first.">
              <span className="text-sm text-muted-foreground">Off</span>
            </Row>
          ))}
        <Row label="Send to groups" stack>
          <Groups label="Send to groups" value={f.sendGrp} onChange={(sendGrp) => set({ sendGrp })} />
        </Row>
        <Row label="Receive from groups" stack>
          <Groups label="Receive from groups" value={f.recvGrp} onChange={(recvGrp) => set({ recvGrp })} />
        </Row>
        <Row label="Receive" stack>
          <div className="flex flex-wrap gap-1">
            {RECEIVE.map(([k, l]) => (
              <ChoiceChip key={k} on={f.recv[k]} onChange={(v) => setRecv({ [k]: v })}>
                {l}
              </ChoiceChip>
            ))}
          </div>
        </Row>
        {sw('Send on start', f.send.en, (en) => setSend({ en }), 'Turns on sending when the light starts.')}
        {sw('Send on direct change', f.send.dir, (dir) => setSend({ dir }))}
        {sw('Send on button press or IR', f.send.btn, (btn) => setSend({ btn }))}
        {sw('Send Alexa changes', f.send.va, (va) => setSend({ va }))}
        {sw('Send Philips Hue changes', f.send.hue, (hue) => setSend({ hue }))}
        <Row label="Packet retransmissions">
          <NumberInput
            label="Packet retransmissions"
            min={0}
            max={29}
            value={f.send.ret}
            onChange={(ret) => setSend({ ret })}
          />
        </Row>
      </Section>

      <Section title="Instance list">
        {sw('Show other WLEDs', f.nodes.list, (list) => set({ nodes: { ...f.nodes, list } }))}
        {sw('Make this light discoverable', f.nodes.bcast, (bcast) => set({ nodes: { ...f.nodes, bcast } }))}
      </Section>

      <Section title="Realtime">
        {sw('Receive UDP realtime', f.live.en, (en) => setLive({ en }))}
        {sw('Use main segment only', f.live.mso, (mso) => setLive({ mso }))}
        {sw('Respect LED maps', f.live.rlm, (rlm) => setLive({ rlm }))}
        <Row label="Timeout">
          <NumberInput
            label="Realtime timeout"
            unit="ms"
            min={100}
            max={65000}
            value={f.live.timeout}
            onChange={(timeout) => setLive({ timeout })}
          />
        </Row>
        {sw('Force max brightness', f.live.maxbri, (maxbri) => setLive({ maxbri }))}
        {sw('Disable realtime gamma correction', f.live.nogc, (nogc) => setLive({ nogc }))}
        <Row label="Realtime LED offset">
          <NumberInput
            label="Realtime LED offset"
            min={-255}
            max={255}
            value={f.live.offset}
            onChange={(offset) => setLive({ offset })}
          />
        </Row>
      </Section>

      <Section title="Network DMX input">
        <Row label="Type" stack>
          <NativeSelect
            className="w-full"
            value={f.dmx.type}
            onChange={(e) => {
              const type = Number(e.target.value)
              // like the stock page's SP() and adj(): a protocol sets its port and fixes up its usual defaults
              const p: Partial<Form['dmx']> = { type, ...(type ? { port: type } : {}) }
              if (type === 6454 && f.dmx.uni === 1) p.uni = 0
              if (type === 5568) {
                if (f.dmx.addr === 0) p.addr = 1
                if (f.dmx.uni === 0) p.uni = 1
              }
              setDmx(p)
            }}
          >
            {DMX_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Row>
        {f.dmx.type === 0 && (
          <Row label="Port">
            <NumberInput
              label="DMX port"
              min={1}
              max={65535}
              value={f.dmx.port}
              onChange={(port) => setDmx({ port })}
            />
          </Row>
        )}
        {sw('Multicast', f.dmx.mc, (mc) => setDmx({ mc }))}
        <Row label="Start universe">
          <NumberInput
            label="Start universe"
            min={0}
            max={63999}
            value={f.dmx.uni}
            onChange={(uni) => setDmx({ uni })}
          />
        </Row>
        {sw('Skip out-of-sequence packets', f.dmx.seqskip, (seqskip) => setDmx({ seqskip }))}
        <Row label="DMX start address">
          <NumberInput
            label="DMX start address"
            min={1}
            max={510}
            value={f.dmx.addr}
            onChange={(addr) => setDmx({ addr })}
          />
        </Row>
        <Row label="DMX segment spacing">
          <NumberInput
            label="DMX segment spacing"
            min={0}
            max={150}
            value={f.dmx.dss}
            onChange={(dss) => setDmx({ dss })}
          />
        </Row>
        <Row label="E1.31 port priority">
          <NumberInput
            label="E1.31 port priority"
            min={0}
            max={200}
            value={f.dmx.prio}
            onChange={(prio) => setDmx({ prio })}
          />
        </Row>
        <Row label="DMX mode" stack>
          <NativeSelect
            className="w-full"
            value={f.dmx.mode}
            onChange={(e) => setDmx({ mode: Number(e.target.value) })}
          >
            {DMX_MODES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Row>
        <p className="m-0 text-xs text-muted-foreground">
          Changing the type, port, multicast or universe needs a reboot.
        </p>
      </Section>

      {f.dmxIn && (
        <Section title="Wired DMX input">
          {pins === null ? (
            <p className="m-0 text-sm text-muted-foreground">Loading pins…</p>
          ) : (
            (
              [
                ['rx', 'RX pin (RO)', 'any'],
                ['tx', 'TX pin (DI)', 'output'],
                ['en', 'Enable pin (RE+DE)', 'output'],
              ] as const
            ).map(([k, label, need]) => (
              <Row key={k} label={label}>
                <PinPicker
                  label={label}
                  pins={pins}
                  own={ownPins}
                  need={need}
                  none="Unused"
                  value={f.dmxIn![k]}
                  used={
                    new Map(
                      (['rx', 'tx', 'en'] as const)
                        .filter((o) => o !== k && f.dmxIn![o] >= 0)
                        .map((o) => [f.dmxIn![o], { o: OWNER.dmxIn, label: 'DMX', name: 'the DMX input' }]),
                    )
                  }
                  onChange={(v) => set({ dmxIn: { ...f.dmxIn!, [k]: v } })}
                />
              </Row>
            ))
          )}
          <Row label="DMX port">
            <NativeSelect
              value={f.dmxIn.port}
              aria-label="DMX port"
              onChange={(e) => set({ dmxIn: { ...f.dmxIn!, port: Number(e.target.value) } })}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </NativeSelect>
          </Row>
          <p className="m-0 text-xs text-muted-foreground">Changes need a reboot.</p>
        </Section>
      )}

      {f.alexa && (
        <Section
          title="Alexa"
          action={
            <Switch
              on={f.alexa.en}
              label="Emulate an Alexa device"
              onChange={(en) => set({ alexa: { ...f.alexa!, en } })}
            />
          }
        >
          {f.alexa.en ? (
            <>
              <Row label="Invocation name" stack>
                <Input
                  maxLength={32}
                  value={f.alexa.name}
                  aria-label="Alexa invocation name"
                  onChange={(e) => set({ alexa: { ...f.alexa!, name: e.target.value } })}
                />
              </Row>
              <Row
                label="Devices for the first presets"
                hint="Also emulates a device for each of the first presets, 0–9."
              >
                <NumberInput
                  label="Alexa preset devices"
                  min={0}
                  max={9}
                  value={f.alexa.presets}
                  onChange={(presets) => set({ alexa: { ...f.alexa!, presets } })}
                />
              </Row>
            </>
          ) : (
            <p className="m-0 text-xs text-muted-foreground">Lets Alexa control this light as a smart home device.</p>
          )}
        </Section>
      )}

      {(f.mqtt || f.hue) && (
        <Alert>
          <AlertDescription>
            MQTT and Philips Hue connect to other hosts, which can make the light respond slower. For the best results
            use only one of them, or use a second ESP with UDP sync.
          </AlertDescription>
        </Alert>
      )}

      {f.mqtt && (
        <Section
          title="MQTT"
          action={<Switch on={f.mqtt.en} label="Enable MQTT" onChange={(en) => set({ mqtt: { ...f.mqtt!, en } })} />}
        >
          {f.mqtt.en ? (
            (() => {
              const m = f.mqtt!
              const setM = (p: Partial<NonNullable<Form['mqtt']>>) => set({ mqtt: { ...m, ...p } })
              return (
                <>
                  <Row label="Broker" stack>
                    <Input
                      maxLength={32}
                      value={m.broker}
                      aria-label="MQTT broker"
                      onChange={(e) => setM({ broker: e.target.value })}
                    />
                  </Row>
                  <Row label="Port">
                    <NumberInput
                      label="MQTT port"
                      min={1}
                      max={65535}
                      value={m.port}
                      onChange={(port) => setM({ port })}
                    />
                  </Row>
                  <Row label="Username" stack>
                    <Input
                      maxLength={40}
                      value={m.user}
                      aria-label="MQTT username"
                      onChange={(e) => setM({ user: e.target.value })}
                    />
                  </Row>
                  <Row label="Password" hint="Sent unencrypted. Don't use a password you use anywhere else." stack>
                    <PasswordInput secret={m} maxLength={64} label="MQTT password" onChange={setM} />
                  </Row>
                  <Row label="Client ID" stack>
                    <Input
                      maxLength={40}
                      value={m.cid}
                      aria-label="MQTT client ID"
                      onChange={(e) => setM({ cid: e.target.value })}
                    />
                  </Row>
                  <Row label="Device topic" stack>
                    <Input
                      maxLength={32}
                      value={m.device}
                      aria-label="MQTT device topic"
                      onChange={(e) => setM({ device: e.target.value })}
                    />
                  </Row>
                  <Row label="Group topic" stack>
                    <Input
                      maxLength={32}
                      value={m.group}
                      aria-label="MQTT group topic"
                      onChange={(e) => setM({ group: e.target.value })}
                    />
                  </Row>
                  {sw('Publish on button press', m.btn, (btn) => setM({ btn }))}
                  {sw('Retain brightness and color messages', m.retain, (retain) => setM({ retain }))}
                  <p className="m-0 text-xs text-muted-foreground">Changes need a reboot.</p>
                </>
              )
            })()
          ) : (
            <p className="m-0 text-xs text-muted-foreground">
              Connects the light to an MQTT broker, e.g. for home automation.
            </p>
          )}
        </Section>
      )}

      {f.hue && (
        <Section
          title="Philips Hue"
          action={<Switch on={f.hue.en} label="Poll a Hue light" onChange={(en) => set({ hue: { ...f.hue!, en } })} />}
        >
          {f.hue.en ? (
            (() => {
              const h = f.hue!
              const setH = (p: Partial<NonNullable<Form['hue']>>) => set({ hue: { ...h, ...p } })
              return (
                <>
                  <p className="m-0 text-xs text-muted-foreground">
                    Find the bridge IP and the light number in the About section of the Hue app.
                  </p>
                  <Row label="Hue bridge IP" stack>
                    <IpInput label="Hue bridge IP" value={h.ip} onChange={(ip) => setH({ ip })} />
                  </Row>
                  <Row label="Light number">
                    <NumberInput
                      label="Hue light number"
                      min={1}
                      max={99}
                      value={h.id}
                      onChange={(id) => setH({ id })}
                    />
                  </Row>
                  <Row label="Poll every">
                    <NumberInput
                      label="Hue poll interval"
                      unit="ms"
                      min={100}
                      max={65000}
                      value={h.ms}
                      onChange={(ms) => setH({ ms })}
                    />
                  </Row>
                  {sw('Receive on/off', h.on, (on) => setH({ on }))}
                  {sw('Receive brightness', h.bri, (bri) => setH({ bri }))}
                  {sw('Receive color', h.col, (col) => setH({ col }))}
                  <p className="m-0 text-xs text-muted-foreground">
                    When connecting for the first time, press the bridge's link button, then save this page.
                  </p>
                </>
              )
            })()
          ) : (
            <p className="m-0 text-xs text-muted-foreground">
              Follows a Philips Hue light: its on/off state, brightness and color.
            </p>
          )}
        </Section>
      )}

      <Section title="Serial">
        <Row label="Baud rate" hint="Keep at 115200 to use Improv. Some boards don't support high rates." stack>
          <NativeSelect className="w-full" value={f.baud} onChange={(e) => set({ baud: Number(e.target.value) })}>
            {!BAUD.includes(f.baud) && <option value={f.baud}>{f.baud * 100}</option>}
            {BAUD.map((b) => (
              <option key={b} value={b}>
                {b * 100}
              </option>
            ))}
          </NativeSelect>
        </Row>
      </Section>

      <SaveBar
        dirty={dirty}
        saving={saving}
        errors={errors}
        onSave={() => save(toFields(f, espnowOn))}
        onDiscard={discard}
      />
      {dialog}
    </div>
  )
}
