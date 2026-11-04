import { useEffect, useState } from 'react'
import { send, setPeek, toast, useStore } from '../store'
import { useUi } from '../ui'
import { cx, Icon, IconButton, Slider } from './controls'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'

export function togglePower() {
  const { state, info } = useStore.getState()
  if (!state) return
  const on = !state.on
  const cmd: Record<string, unknown> = { on }
  // turning on while a live segment is frozen by realtime data: leave live mode
  if (on && info?.live && info.liveseg >= 0) Object.assign(cmd, { live: false, seg: [{ id: info.liveseg, frz: false }] })
  // "Power button preset override" in Settings → User Interface: load a preset instead of switching
  const { stock } = useUi.getState()
  const preset = on ? stock.on : stock.off
  send(preset > 0 ? { ps: preset } : cmd)
}

export function toggleTimer() {
  const state = useStore.getState().state
  const nl = state?.nl
  if (!nl) return
  // The firmware cancels the timer straight away when the light is already at the target brightness
  // (led.cpp), e.g. off with a target of 0; sunrise mode (3) is the exception.
  const current = state.on ? state.bri : 0
  if (!nl.on && nl.mode !== 3 && current === nl.tbri) {
    toast(nl.tbri === 0
      ? 'The timer turns the light off, but it is already off. Turn it on first.'
      : `The light is already at the timer's target brightness (${nl.tbri}). Change the brightness or the target first.`, true)
    return
  }
  if (!nl.on) toast(`Timer active. Your light will turn ${nl.tbri > 0 ? 'on' : 'off'} ${nl.mode ? 'over' : 'after'} ${nl.dur} minutes.`)
  else toast('Timer deactivated.')
  send({ nl: { on: !nl.on } })
}

export function toggleSync() {
  const udpn = useStore.getState().state?.udpn
  if (!udpn) return
  toast(!udpn.send ? 'Other lights in the network will now sync to this one.' : 'This light and other lights in the network will no longer sync.')
  send({ udpn: { send: !udpn.send } })
}

// The line under the device name: its IP address and, while it runs, the timer's remaining time.
function DeviceStatus() {
  const ip = useStore((s) => s.info?.ip) || location.host
  const nl = useStore((s) => s.state?.nl)
  const left = useCountdown(nl?.on ? nl.rem : -1)
  return (
    <div className="truncate text-xs text-muted-foreground">
      {ip}{left > 0 && <span title="Timer remaining"> · timer {left >= 60 ? `${Math.ceil(left / 60)} min` : `${left} s`}</span>}
    </div>
  )
}

// Counts down locally from the seconds the light last reported (-1 = not running).
function useCountdown(reported: number) {
  const [since, setSince] = useState(() => ({ reported, at: Date.now() }))
  const [now, setNow] = useState(() => Date.now())
  if (since.reported !== reported) setSince({ reported, at: Date.now() })
  useEffect(() => {
    if (reported < 0) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [reported])
  return reported < 0 ? -1 : Math.max(0, reported - Math.floor((now - since.at) / 1000))
}

function ConnDot() {
  const conn = useStore((s) => s.conn)
  const color = conn === 'ok' ? 'bg-ok' : conn === 'error' ? 'bg-danger' : 'bg-primary'
  return <span title={conn === 'ok' ? 'Connected' : conn === 'error' ? 'Connection lost' : 'Connecting'} className={cx('size-2 shrink-0 rounded-full', color)} />
}

export function Header({ wide }: { wide: boolean }) {
  const state = useStore((s) => s.state)
  const info = useStore((s) => s.info)
  const peek = useStore((s) => s.peek)
  const setSheet = useUi((s) => s.setSheet)
  const [dragBri, setDragBri] = useState<number | null>(null) // shown while the slider is held
  if (!state || !info) return null

  const power = (
    <Button variant={state.on ? 'default' : 'outline'} size={wide ? 'icon-lg' : 'icon'} aria-label={state.on ? 'Turn off' : 'Turn on'} aria-pressed={state.on} onClick={togglePower}>
      <Icon.power />
    </Button>
  )
  const brightness = (
    <Slider label="Master brightness" value={state.bri} min={1} onInput={setDragBri}
      onCommit={(bri) => { setDragBri(null); send({ bri }) }} className="min-w-0 flex-1" />
  )
  const toggles = (
    <>
      <Toggle variant="outline" size="lg" pressed={state.nl.on} onPressedChange={toggleTimer}><Icon.moon data-icon="inline-start" />Timer</Toggle>
      <Toggle variant="outline" size="lg" pressed={state.udpn.send} onPressedChange={toggleSync}><Icon.sync data-icon="inline-start" />Sync</Toggle>
      <Toggle variant="outline" size="lg" pressed={peek} onPressedChange={() => setPeek(!peek)}><Icon.eye data-icon="inline-start" />Peek</Toggle>
    </>
  )
  const bri = dragBri ?? state.bri

  if (wide) {
    return (
      <header className="flex h-[72px] shrink-0 items-center gap-5 border-b border-raised px-5">
        <div className="flex w-[300px] min-w-0 items-center gap-3">
          <ConnDot />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{info.name}</div>
            <DeviceStatus />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          {power}
          <div className="flex w-[360px] items-center gap-3">
            {brightness}
            <span className="w-8 text-right font-mono text-sm">{bri}</span>
          </div>
          <div className="ml-2 flex gap-2">{toggles}</div>
        </div>
        <div className="flex gap-2">
          <IconButton label="Info, timer and more" onClick={() => setSheet('more')}><Icon.info /></IconButton>
          <Button variant="outline" size="icon-lg" aria-label="Settings" title="Settings" nativeButton={false} render={<a href="#settings" />}><Icon.settings /></Button>
        </div>
      </header>
    )
  }

  // phone: two compact rows, with the toggles as icon buttons next to the name
  return (
    <header className="flex shrink-0 flex-col gap-2 px-4 pt-2.5">
      <div className="flex items-center gap-1.5">
        <ConnDot />
        <div className="ml-1 min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{info.name}</div>
          <DeviceStatus />
        </div>
        {/* icon only: no side padding, so they're square (min-w-8) like the icon buttons beside them */}
        <Toggle className="px-0" pressed={state.nl.on} onPressedChange={toggleTimer} aria-label="Timer" title="Timer"><Icon.moon /></Toggle>
        <Toggle className="px-0" pressed={state.udpn.send} onPressedChange={toggleSync} aria-label="Sync" title="Sync"><Icon.sync /></Toggle>
        <Toggle className="px-0" pressed={peek} onPressedChange={() => setPeek(!peek)} aria-label="Peek (live preview)" title="Peek"><Icon.eye /></Toggle>
        <Button variant="ghost" size="icon" aria-label="Settings" title="Settings" nativeButton={false} render={<a href="#settings" />}><Icon.settings /></Button>
        <Button variant="ghost" size="icon" aria-label="Info, timer and more" title="More" onClick={() => setSheet('more')}><Icon.more /></Button>
      </div>
      <div className="flex items-center gap-3">
        {power}
        {brightness}
        <span className="w-8 text-right font-mono text-sm">{bri}</span>
      </div>
    </header>
  )
}
