import { useState } from 'react'
import { send, setPeek, toast, useStore } from '../store'
import { stockCfg, useUi } from '../ui'
import { cx, Icon, IconButton, Slider } from './ui'

export function togglePower() {
  const { state, info } = useStore.getState()
  if (!state) return
  const on = !state.on
  const cmd: Record<string, unknown> = { on }
  // turning on while a live segment is frozen by realtime data: leave live mode
  if (on && info?.live && info.liveseg >= 0) Object.assign(cmd, { live: false, seg: [{ id: info.liveseg, frz: false }] })
  // "Power button preset override" in Settings → User Interface: load a preset instead of switching
  const preset = on ? stockCfg.on : stockCfg.off
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

function ConnDot() {
  const conn = useStore((s) => s.conn)
  const color = conn === 'ok' ? 'bg-ok' : conn === 'error' ? 'bg-danger' : 'bg-accent'
  return <span title={conn === 'ok' ? 'Connected' : conn === 'error' ? 'Connection lost' : 'Connecting'} className={cx('size-2 shrink-0 rounded-full', color)} />
}

function ToggleButton({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-3.5 text-[13px] transition-colors',
        on ? 'border-accent bg-hover text-fg' : 'border-line bg-surface text-soft hover:bg-hover',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function Header({ wide }: { wide: boolean }) {
  const state = useStore((s) => s.state)
  const info = useStore((s) => s.info)
  const peek = useStore((s) => s.peek)
  const setSheet = useUi((s) => s.setSheet)
  const [dragBri, setDragBri] = useState<number | null>(null) // shown while the slider is held
  if (!state || !info) return null

  const power = (
    <button
      aria-label={state.on ? 'Turn off' : 'Turn on'}
      aria-pressed={state.on}
      onClick={togglePower}
      className={cx('flex shrink-0 items-center justify-center rounded-full transition-colors', wide ? 'size-11' : 'size-9', state.on ? 'bg-accent text-on-accent' : 'border border-line bg-surface text-muted')}
    >
      <Icon.power className="size-5" />
    </button>
  )
  const brightness = (
    <Slider label="Master brightness" value={state.bri} min={1} onInput={setDragBri}
      onCommit={(bri) => { setDragBri(null); send({ bri }) }} className="min-w-0 flex-1" />
  )
  const toggles = (
    <>
      <ToggleButton on={state.nl.on} onClick={toggleTimer} icon={<Icon.moon className="size-4" />}>Timer</ToggleButton>
      <ToggleButton on={state.udpn.send} onClick={toggleSync} icon={<Icon.sync className="size-4" />}>Sync</ToggleButton>
      <ToggleButton on={peek} onClick={() => setPeek(!peek)} icon={<Icon.eye className="size-4" />}>Peek</ToggleButton>
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
            <div className="truncate text-xs text-muted">{info.ip || location.host} · {info.leds.count} LEDs</div>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          {power}
          <div className="flex w-[360px] items-center gap-3">
            {brightness}
            <span className="w-8 text-right font-mono text-[13px]">{bri}</span>
          </div>
          <div className="ml-2 flex gap-1.5">{toggles}</div>
        </div>
        <div className="flex gap-1.5">
          <IconButton label="Info" onClick={() => setSheet('more')}><Icon.info /></IconButton>
          {info.ndc > 0 && <IconButton label="Other WLED devices" onClick={() => setSheet('more')}><Icon.nodes /></IconButton>}
          <a href="/settings" aria-label="Settings" title="Settings" className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface text-fg hover:bg-hover"><Icon.settings /></a>
        </div>
      </header>
    )
  }

  // phone: two compact rows, with the toggles as icon buttons next to the name
  return (
    <header className="flex shrink-0 flex-col gap-2 px-4 pb-2 pt-2.5">
      <div className="flex items-center gap-1.5">
        <ConnDot />
        <div className="ml-1 min-w-0 flex-1 truncate text-[15px] font-semibold">{info.name}</div>
        <IconToggle on={state.nl.on} onClick={toggleTimer} label="Timer"><Icon.moon className="size-4" /></IconToggle>
        <IconToggle on={state.udpn.send} onClick={toggleSync} label="Sync"><Icon.sync className="size-4" /></IconToggle>
        <IconToggle on={peek} onClick={() => setPeek(!peek)} label="Peek (live preview)"><Icon.eye className="size-4" /></IconToggle>
        <a href="/settings" aria-label="Settings" title="Settings" className="flex size-9 items-center justify-center rounded-lg text-soft"><Icon.settings className="size-4" /></a>
        <button aria-label="Info, timer and more" title="More" onClick={() => setSheet('more')} className="-mr-1.5 flex size-9 items-center justify-center rounded-lg text-soft"><Icon.more className="size-4" /></button>
      </div>
      <div className="flex items-center gap-3">
        {power}
        {brightness}
        <span className="w-8 text-right font-mono text-[13px]">{bri}</span>
      </div>
    </header>
  )
}

function IconToggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx('flex size-9 items-center justify-center rounded-lg border transition-colors', on ? 'border-accent bg-hover text-accent' : 'border-transparent text-soft')}
    >
      {children}
    </button>
  )
}
