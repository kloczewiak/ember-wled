import { useEffect, useState, type ReactNode } from 'react'
import { useMedia } from '../hooks'
import { cx } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowLeft, Bolt, ChevronRight, Clock, ExternalLink, Grid3x3, Layers, Lightbulb, Lock, Palette, Puzzle, RefreshCw, Wifi, type LucideIcon } from 'lucide-react'
import { loadCfg } from './api'
import { confirmLeave } from './shared'
import { UiSettings } from './UiSettings'
import { WifiSettings } from './WifiSettings'

// The settings screen: #settings is the menu, #settings/<page> a page. Pages built here open in the app;
// the rest link to the firmware's own settings pages until they are rebuilt.

type Page = { id: string; title: string; icon: LucideIcon; render?: () => ReactNode; href?: string; show?: (b: Build) => boolean }
type Build = { dmx: boolean }

const PAGES: Page[] = [
  { id: 'wifi', title: 'Wi-Fi and network', icon: Wifi, render: () => <WifiSettings /> },
  { id: 'ui', title: 'User interface', icon: Palette, render: () => <UiSettings /> },
  { id: 'leds', title: 'LED and hardware', icon: Lightbulb, href: '/settings/leds' },
  { id: 'pins', title: 'Pin info', icon: Bolt, href: '/settings/pins' },
  // listed on every build: whether 2D is compiled in is only exposed by the settings script (see PARITY.md)
  { id: '2D', title: '2D configuration', icon: Grid3x3, href: '/settings/2D' },
  { id: 'dmx', title: 'DMX output', icon: Layers, href: '/settings/dmx', show: (b) => b.dmx },
  { id: 'sync', title: 'Sync interfaces', icon: RefreshCw, href: '/settings/sync' },
  { id: 'time', title: 'Time and macros', icon: Clock, href: '/settings/time' },
  { id: 'um', title: 'Usermods', icon: Puzzle, href: '/settings/um' },
  { id: 'sec', title: 'Security and updates', icon: Lock, href: '/settings/sec' },
]

// navigates within the app, asking first if the open page has unsaved changes
function go(hash: string) {
  if (confirmLeave()) location.hash = hash
}

function Menu({ build, current }: { build: Build; current?: string }) {
  const visible = PAGES.filter((p) => !p.show || p.show(build))
  const item = (p: Page) => {
    const Icon = p.icon
    const active = p.id === current
    const inner = (
      <>
        <Icon className={cx('size-4', p.render ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
        <span className="flex-1 text-left">{p.title}</span>
        {p.render ? <ChevronRight className="size-4 text-muted-foreground" aria-hidden /> : <ExternalLink className="size-4 text-muted-foreground" aria-hidden />}
      </>
    )
    return p.render
      ? <Button key={p.id} variant={active ? 'secondary' : 'ghost'} size="lg" className="w-full justify-start font-normal" aria-current={active ? 'page' : undefined}
          onClick={() => go(`#settings/${p.id}`)}>{inner}</Button>
      : <Button key={p.id} variant="ghost" size="lg" className="w-full justify-start font-normal" nativeButton={false}
          render={<a href={p.href} onClick={(e) => { if (!confirmLeave()) e.preventDefault() }} />}>{inner}</Button>
  }
  return (
    <div className="flex flex-col gap-3">
      <Card className="gap-0 px-1 py-1">{visible.filter((p) => p.render).map(item)}</Card>
      <div className="px-1 text-xs font-medium text-muted-foreground">Firmware pages</div>
      <Card className="gap-0 px-1 py-1">{visible.filter((p) => !p.render).map(item)}</Card>
    </div>
  )
}

export function SettingsScreen({ route }: { route: string }) {
  const wide = useMedia('(min-width: 1100px)')
  const [build, setBuild] = useState<Build>({ dmx: false })
  // the config only has a dmx section on builds with DMX output
  useEffect(() => { loadCfg().then((c) => setBuild({ dmx: c.dmx !== undefined })).catch(() => {}) }, [])
  const page = PAGES.find((p) => p.render && p.id === route)
  const title = page?.title ?? 'Settings'
  // back goes from a page to the menu (on phones) and from the menu to the controls
  const back = page && !wide ? () => go('#settings') : () => go('#')

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 px-4 pt-2.5 pb-1">
        <Button variant="ghost" size="icon" aria-label={page && !wide ? 'Back to settings' : 'Back to controls'} onClick={back}><ArrowLeft /></Button>
        <h1 className="m-0 text-[15px] font-semibold">{wide ? 'Settings' : title}</h1>
      </header>
      {wide ? (
        // only the page column scrolls, so the menu stays put (like the columns of the main desktop layout);
        // p-px keeps the cards' outline ring from being clipped by the scroll area
        <div className="mx-auto grid min-h-0 w-full max-w-5xl flex-1 grid-cols-[260px_minmax(0,1fr)] gap-6 px-4 pt-2">
          <nav aria-label="Settings pages"><Menu build={build} current={page?.id} /></nav>
          <div className="scroll-thin min-h-0 overflow-y-auto rounded-xl p-px pb-4">
            {page
              ? <main key={page.id} className="min-w-0"><h2 className="mt-0 mb-3 text-lg font-semibold">{title}</h2>{page.render!()}</main>
              : <p className="m-0 text-sm text-muted-foreground">Choose a page on the left.</p>}
          </div>
        </div>
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 pt-2 pb-4">
            {page ? <main key={page.id} className="min-w-0">{page.render!()}</main> : <nav aria-label="Settings pages"><Menu build={build} current={page} /></nav>}
          </div>
        </div>
      )}
    </div>
  )
}
