import { useEffect, useState, type ReactNode } from 'react'
import { loadNodes, refresh, send, useStore } from '../store'
import { useDraft } from '../hooks'
import { useUi } from '../ui'
import type { Info, Node } from '../api/types'
import { toggleSync, toggleTimer } from './Header'
import { Button, Check, cx, Field, Icon, inputCls, SectionTitle, Switch } from './ui'

// Usermod HTML uses glyphs from the stock UI's icon font, which this UI doesn't ship; the power glyph
// (the one usermods use for their on/off buttons) is swapped for an inline icon.
const POWER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg>'
const usermodHtml = (html: string) => html.replace(/&#xe08f;|\ue08f/gi, POWER_SVG)

function runtime(t: number) {
  const days = Math.floor(t / 86400), hrs = Math.floor((t % 86400) / 3600), mins = Math.floor((t % 3600) / 60)
  if (days) return `${days} day${days === 1 ? '' : 's'}, ${hrs} hour${hrs === 1 ? '' : 's'}`
  if (hrs) return `${hrs} hour${hrs === 1 ? '' : 's'}, ${mins} min`
  if (t > 59) return `${mins} min, ${t % 60} sec`
  return `${t} sec`
}

function current(i: Info) {
  const pwr = i.leds.pwr
  if (pwr > 1000) return `${(pwr / 1000).toFixed(pwr > 10000 ? 0 : 1)} A`
  if (pwr > 0) return `${50 * Math.round(pwr / 50)} mA`
  return 'Not calculated'
}

const chip = (t: number) => ({ 2: 'ESP32', 32: 'ESP32', 3: 'ESP32-S2', 33: 'ESP32-S2', 4: 'ESP32-S3', 34: 'ESP32-S3', 5: 'ESP32-C3', 35: 'ESP32-C3', 39: 'ESP32-C6', 40: 'ESP32-C61', 41: 'ESP32-C5', 42: 'ESP32-P4', 43: 'ESP32-P4', 1: 'ESP8266', 82: 'ESP8266' } as Record<number, string>)[t] ?? '?'

export function MoreSheet() {
  const sheet = useUi((s) => s.sheet)
  const setSheet = useUi((s) => s.setSheet)
  const close = () => setSheet(null)

  useEffect(() => {
    if (!sheet) return
    refresh()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(null)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [sheet, setSheet])

  if (!sheet) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end bg-black/60 lg:items-stretch" onClick={close}>
      <div
        role="dialog"
        aria-label="Timer, sync, device info and other devices"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="scroll-thin flex max-h-[92vh] w-full flex-col gap-5 overflow-y-auto rounded-t-3xl bg-surface px-4 pb-8 pt-3 lg:max-h-none lg:w-[440px] lg:rounded-none lg:px-6 lg:pt-6"
      >
        <div className="flex items-center justify-between lg:hidden">
          <span className="mx-auto h-1 w-9 rounded-full bg-line-strong" />
        </div>
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold">More</h2>
          <button aria-label="Close" onClick={close} className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg"><Icon.x /></button>
        </div>
        <TimerSync />
        <DeviceInfo />
        <Nodes />
        <Links />
      </div>
    </div>
  )
}

function TimerSync() {
  const state = useStore((s) => s.state)
  const [dur, setDur] = useDraft(String(state?.nl.dur ?? 60))
  const [tbri, setTbri] = useDraft(String(state?.nl.tbri ?? 0))
  if (!state) return null
  const nl = state.nl
  const commitNum = (key: 'dur' | 'tbri', text: string, min: number, max: number) => {
    const v = parseInt(text)
    if (!isNaN(v) && v >= min && v <= max && v !== nl[key]) send({ nl: { [key]: v } })
  }
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Timer &amp; sync</SectionTitle>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">Timer</div>
          <div className="text-xs text-muted">{nl.on && nl.rem > 0 ? `${Math.ceil(nl.rem / 60)} min remaining` : 'Nightlight: fade or switch after a delay'}</div>
        </div>
        <Switch on={nl.on} label="Timer" onChange={toggleTimer} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Mode">
          <select className={inputCls} value={nl.mode} onChange={(e) => send({ nl: { mode: Number(e.target.value) } })}>
            {['Instant', 'Fade', 'Color fade', 'Sunrise'].map((n, i) => <option key={i} value={i}>{n}</option>)}
          </select>
        </Field>
        <Field label="Duration (min)">
          <input className={cx(inputCls, 'font-mono')} inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} onBlur={() => commitNum('dur', dur, 1, 255)} />
        </Field>
        <Field label="Target brightness">
          <input className={cx(inputCls, 'font-mono')} inputMode="numeric" value={tbri} onChange={(e) => setTbri(e.target.value)} onBlur={() => commitNum('tbri', tbri, 0, 255)} />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">Send sync</div>
          <div className="text-xs text-muted">Other WLEDs follow this one</div>
        </div>
        <Switch on={state.udpn.send} label="Send sync" onChange={toggleSync} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">Receive sync</div>
          <div className="text-xs text-muted">Follow other WLEDs</div>
        </div>
        <Switch on={state.udpn.recv} label="Receive sync" onChange={(recv) => send({ udpn: { recv } })} />
      </div>
    </section>
  )
}

function Row({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 bg-bg px-3 py-2">
      <span className="text-[11px] text-muted">{k}</span>
      <span className="font-mono text-[13px] break-words">{children}</span>
    </div>
  )
}

function DeviceInfo() {
  const i = useStore((s) => s.info)
  const [confirmReboot, setConfirmReboot] = useState(false)
  if (!i) return null
  const usermods = Object.entries(i.u ?? {})
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle right={<span className="font-mono text-[11px] text-muted">v{i.ver} “{i.cn ?? 'Kuuhaku'}”</span>}>Device</SectionTitle>
      {usermods.length > 0 && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-hover">
          {usermods.map(([k, v]) => {
            const [val, unit] = Array.isArray(v) ? v : [v, '']
            // usermods may report HTML (e.g. buttons calling requestJson), as the stock UI renders it
            return <Row key={k} k={k}><span className="info-html" dangerouslySetInnerHTML={{ __html: usermodHtml(`${val}${unit ?? ''}`) }} /></Row>
          })}
        </div>
      )}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-hover">
        {i.release && <Row k="Release">{i.release}</Row>}
        <Row k="Build">{i.vid}</Row>
        <Row k="Signal strength">{i.wifi.signal}% ({i.wifi.rssi} dBm)</Row>
        {i.wifi.band && <Row k="WiFi band">{i.wifi.band} (Ch {i.wifi.channel})</Row>}
        <Row k="Uptime">{runtime(i.uptime)}</Row>
        <Row k="Time">{i.time}</Row>
        <Row k="Free heap">{(i.freeheap / 1024).toFixed(1)} kB</Row>
        {!!i.psram && <Row k="Free PSRAM">{(i.psram / 1024).toFixed(1)} kB</Row>}
        {!!i.leds.count && <Row k="Total LEDs">{i.leds.count}</Row>}
        <Row k="Estimated current">{current(i)}</Row>
        <Row k="Average FPS">{i.leds.fps}</Row>
        <Row k="MAC address">{i.mac}</Row>
        <Row k="IP address">{i.ip || '—'}</Row>
        <Row k="CPU clock">{i.clock} MHz</Row>
        <Row k="Flash size">{i.flash} MB</Row>
        <Row k="Filesystem">{i.fs.u}/{i.fs.t} kB ({Math.round((i.fs.u * 100) / i.fs.t)}%)</Row>
        <Row k="Environment">{i.arch} {i.core}{i.lwip ? ` (${i.lwip})` : ''}</Row>
        {i.repo && <Row k="GitHub"><a href={`https://github.com/${i.repo}`} target="_blank" rel="noopener noreferrer">{i.repo}</a></Row>}
      </div>
      {(i.opt & 0x100) !== 0 && (
        <Check checked={(i.opt & 0x80) !== 0} onChange={(debug) => send({ debug })}>Network debug output</Check>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => refresh()}>Refresh</Button>
        {(i.opt & 1) !== 0 && <a href="/update" className="flex h-10 flex-1 items-center justify-center rounded-lg border border-line text-[13px] text-fg no-underline hover:bg-hover">Update WLED</a>}
        <Button
          className="flex-1"
          variant={confirmReboot ? 'danger' : 'default'}
          onBlur={() => setConfirmReboot(false)}
          onClick={() => { if (confirmReboot) location.href = '/reset'; else setConfirmReboot(true) }}
        >
          {confirmReboot ? 'Confirm reboot' : 'Reboot'}
        </Button>
      </div>
    </section>
  )
}

function Nodes() {
  const info = useStore((s) => s.info)
  const nodes = useStore((s) => s.nodes)
  useEffect(() => { if ((info?.ndc ?? -1) >= 0) loadNodes() }, [info?.ndc])
  if (!info) return null
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle right={info.ndc >= 0 && <Button size="sm" variant="ghost" onClick={loadNodes}>Refresh</Button>}>Other WLEDs on this network</SectionTitle>
      {info.ndc < 0 ? (
        <p className="m-0 text-[13px] text-muted">Instance list is disabled in settings.</p>
      ) : !nodes?.length ? (
        <p className="m-0 text-[13px] text-muted">{nodes ? 'No other instances found.' : 'Loading…'}</p>
      ) : (
        nodes.filter((n) => n.name).map((n) => <NodeRow key={n.ip} node={n} />)
      )}
    </section>
  )
}

function NodeRow({ node }: { node: Node }) {
  const [on, setOn] = useState((node.type & 0x80) !== 0)
  // older builds have no remote toggle support
  const canToggle = node.vid >= 2307130
  const toggle = async () => {
    try {
      const res = await fetch(`http://${node.ip}/win&T=2`)
      const xml = new DOMParser().parseFromString(await res.text(), 'text/xml')
      setOn(xml.getElementsByTagName('ac')[0]?.textContent !== '0')
    } catch { setOn(!on) }
  }
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-xl bg-bg px-3">
      <a href={`http://${node.ip}`} className="min-w-0 flex-1 py-2 text-fg no-underline">
        <div className="truncate">{node.name === 'WLED' ? node.ip : node.name}</div>
        <div className="truncate font-mono text-[11px] text-muted">{node.ip} · {chip(node.type & 0x7f)} · {node.vid || 'N/A'}</div>
      </a>
      {canToggle && <Switch on={on} label={`Power ${node.name}`} onChange={toggle} />}
    </div>
  )
}

function Links() {
  const links: [string, string][] = [['/settings', 'Settings'], ['/edit', 'File editor'], ['/cpal.htm', 'Custom palettes'], ['/pixelforge.htm', 'PixelForge']]
  return (
    <section className="grid grid-cols-2 gap-2">
      {links.map(([href, label]) => (
        <a key={href} href={href} className="flex h-11 items-center justify-center rounded-lg border border-line text-[13px] text-fg no-underline hover:bg-hover">{label}</a>
      ))}
    </section>
  )
}
