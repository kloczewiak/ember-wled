import { useEffect, useRef, useState, type ReactNode } from 'react'
import { init, useStore } from './store'
import { useAccuratePeek, useHash, useHashLinks, useMedia, WIDE } from './hooks'
import { useUi } from './ui'
import { Header } from './components/Header'
import { LivePreview, RealtimeBanner } from './components/Live'
import { ColorPanel } from './components/ColorPanel'
import { PalettePanel } from './components/PalettePanel'
import { EffectList, EffectPanel, EffectParams } from './components/EffectPanel'
import { SegmentsPanel } from './components/SegmentsPanel'
import { PresetsPanel } from './components/PresetsPanel'
import { MoreSheet } from './components/MoreSheet'
import { SettingsScreen } from './settings/SettingsScreen'
import { PalettesScreen } from './palettes/PalettesScreen'
import { Card, cx } from './components/controls'
import { Toaster } from '@/components/ui/toast'

// Tab names match the stock UI's location hashes, so existing bookmarks keep working.
const TABS = ['Colors', 'Effects', 'Segments', 'Presets'] as const
type Tab = (typeof TABS)[number]

export default function App() {
  const ready = useStore((s) => !!s.state && !!s.info)
  const conn = useStore((s) => s.conn)
  const peek = useStore((s) => s.peek)
  const wide = useMedia(WIDE)
  const hash = useHash()
  const settings = /^#settings(\/|$)/.test(hash)
  const palettes = hash === '#palettes'

  useEffect(() => {
    init()
    // Ember's start page (boot/index.html) shows a splash until the app has drawn something
    document.getElementById('ember-boot')?.remove()
  }, [])
  useAccuratePeek()
  useHashLinks()
  // opening settings from the More sheet: don't leave the sheet open to reappear on the way back
  useEffect(() => {
    if (settings || palettes) useUi.getState().setSheet(null)
  }, [settings, palettes])

  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className={cx('size-3 rounded-full', conn === 'error' ? 'bg-danger' : 'animate-pulse bg-primary')} />
        <p className="m-0 text-muted-foreground">
          {conn === 'error' ? 'Could not reach WLED. Retrying…' : 'Connecting to WLED…'}
        </p>
        <Toasts />
      </div>
    )
  }

  // #palettes is the custom palette editor
  if (palettes) {
    return (
      <>
        <PalettesScreen />
        <Toasts />
      </>
    )
  }

  // #settings and #settings/<page> show the settings screen instead of the controls
  if (settings) {
    return (
      <>
        <SettingsScreen route={hash.replace(/^#settings\/?/, '')} />
        <Toasts />
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {wide ? (
        <>
          <Header wide />
          {/* vertical spacing between these comes from the gap, not from their own padding */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 pt-4">
            {peek && (
              <div className="px-4">
                <LivePreview />
              </div>
            )}
            <RealtimeBanner />
            <DesktopLayout />
          </div>
        </>
      ) : (
        <PhoneLayout
          top={
            <>
              <Header wide={false} />
              {peek && (
                <div className="px-4">
                  <LivePreview className="mx-auto max-w-2xl" />
                </div>
              )}
              <RealtimeBanner />
            </>
          }
        />
      )}
      <MoreSheet />
      <Toasts behindTabBar={!wide} />
    </div>
  )
}

// Whether a column has at least `min` px left below its first child.
function useRoomBelowFirst(col: HTMLElement | null, min: number) {
  const [roomy, setRoomy] = useState(true)
  useEffect(() => {
    if (!col) return
    const first = col.firstElementChild
    const check = () => {
      const s = getComputedStyle(col)
      const room =
        col.clientHeight -
        parseFloat(s.paddingTop) -
        parseFloat(s.paddingBottom) -
        parseFloat(s.rowGap) -
        (first?.getBoundingClientRect().height ?? 0)
      setRoomy(room >= min)
    }
    const ro = new ResizeObserver(check)
    ro.observe(col)
    if (first) ro.observe(first)
    return () => ro.disconnect()
  }, [col, min])
  return roomy
}

function DesktopLayout() {
  // The palette list fills the room below the colour card and scrolls on its own. When the window is too short
  // to leave it 320px, the list is shown in full and the whole column scrolls instead, so there's only ever one
  // scroll area (like the Colors tab on phones).
  const [left, setLeft] = useState<HTMLDivElement | null>(null)
  const roomy = useRoomBelowFirst(left, 320)
  // p-px on the scrolling columns: shadcn Cards draw their edge with a ring (a box-shadow just outside the
  // card), which a scroll container would otherwise clip
  return (
    <main className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)_420px] gap-4 px-4 pb-4">
      <div ref={setLeft} className="scroll-thin flex min-h-0 flex-col gap-4 overflow-y-auto rounded-card-area p-px">
        <ColorPanel className="shrink-0" />
        <PalettePanel className={roomy ? 'flex-1' : 'shrink-0'} />
      </div>
      <EffectPanel />
      <div className="scroll-thin flex min-h-0 flex-col gap-4 overflow-y-auto rounded-card-area p-px">
        <SegmentsPanel className="shrink-0" />
        <PresetsPanel className="shrink-0" />
      </div>
    </main>
  )
}

// Phones: the header stays put and each tab scrolls under it. On short screens (landscape) that leaves
// too little room, so the whole page scrolls as one instead and the header scrolls away; only the
// tab bar stays pinned. All four tabs stay mounted (the others hidden), so going to another tab and back keeps
// what was open there, like a new preset's card, and the element tree is the same in both arrangements, so
// turning the phone keeps it too.
function PhoneLayout({ top }: { top: ReactNode }) {
  const hash = useHash()
  const tab: Tab = TABS.find((t) => `#${t}` === hash) ?? 'Colors'
  const short = useMedia('(max-height: 560px)')
  // in the short arrangement the tabs share one scroll area, so each tab opens scrolled to the top
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (short) scroller.current?.scrollTo(0, 0)
  }, [tab, short])

  const panels: Record<Tab, ReactNode> = {
    Colors: (
      <>
        <ColorPanel className="shrink-0" />
        <PalettePanel className="shrink-0" />
      </>
    ),
    Effects: (
      <>
        {short && (
          <Card className="shrink-0">
            <EffectParams />
          </Card>
        )}
        <EffectList className={short ? undefined : 'flex-1'} />
      </>
    ),
    Segments: <SegmentsPanel />,
    Presets: <PresetsPanel />,
  }

  return (
    <>
      <div ref={scroller} className={cx('flex min-h-0 flex-1 flex-col gap-3', short && 'scroll-thin overflow-y-auto')}>
        {top}
        <main className={cx('px-4 pb-4', !short && 'flex min-h-0 flex-1 flex-col')}>
          {TABS.map((t) => (
            // only the Effects tab is pinned to the screen height (its list scrolls inside); the others scroll
            // inside a rounded area as wide as the content column, so cards keep their rounded corners as they
            // scroll out
            <div
              key={t}
              hidden={t !== tab}
              className={cx(
                'mx-auto w-full max-w-2xl',
                !short && 'flex min-h-0 flex-1 flex-col',
                !short && t !== 'Effects' && 'scroll-thin overflow-y-auto rounded-card-area p-px',
              )}
            >
              <div className={cx('flex flex-col gap-4', !short && t === 'Effects' && 'h-full')}>{panels[t]}</div>
            </div>
          ))}
        </main>
      </div>
      {!short && tab === 'Effects' && (
        <section aria-label="Effect settings" className="shrink-0 px-4 pb-4">
          <Card className="mx-auto max-w-2xl">
            <EffectParams />
          </Card>
        </section>
      )}
      <TabBar tab={tab} />
    </>
  )
}

function TabBar({ tab }: { tab: Tab }) {
  return (
    <nav
      aria-label="Sections"
      className="grid shrink-0 grid-cols-4 border-t bg-background pb-[max(4px,env(safe-area-inset-bottom))]"
    >
      {TABS.map((t) => (
        <a
          key={t}
          href={`#${t}`}
          aria-current={t === tab ? 'page' : undefined}
          className={cx(
            'flex h-11 flex-col items-center justify-center gap-1 text-xs font-medium no-underline',
            t === tab ? 'text-fg' : 'text-muted-foreground',
          )}
        >
          <span className={cx('h-1 w-9 rounded-full', t === tab ? 'bg-primary' : 'bg-transparent')} />
          {t === 'Colors' ? 'Color' : t}
        </a>
      ))}
    </nav>
  )
}

// On the phone controls screen the toasts slide out from behind the tab bar: the viewport ends at the bar's top
// edge (2.75rem, its 1px border and the home-indicator safe area) and clips anything below it, the toasts sit
// 1rem above that edge, and they don't fade. Elsewhere on phones (settings, connecting) they keep the same
// height above the bottom and fade in and out instead.
function Toasts({ behindTabBar = false }: { behindTabBar?: boolean }) {
  return (
    <Toaster
      limit={3}
      viewportClassName={
        behindTabBar
          ? 'bottom-[calc(2.75rem+1px+max(4px,env(safe-area-inset-bottom)))] [clip-path:inset(-100vh_-100vw_0_-100vw)] [--toast-inset:1rem] [--toast-fade:1]'
          : 'max-[1099px]:bottom-[calc(3.75rem+max(4px,env(safe-area-inset-bottom)))]'
      }
    />
  )
}
