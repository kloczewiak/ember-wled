import { useEffect, type ReactNode } from 'react'
import { init, useStore } from './store'
import { useHash, useMedia } from './hooks'
import { Header } from './components/Header'
import { LivePreview, RealtimeBanner } from './components/Live'
import { ColorPanel } from './components/ColorPanel'
import { PalettePanel } from './components/PalettePanel'
import { EffectList, EffectPanel, EffectParams } from './components/EffectPanel'
import { SegmentsPanel } from './components/SegmentsPanel'
import { PresetsPanel } from './components/PresetsPanel'
import { MoreSheet } from './components/MoreSheet'
import { Card, cx } from './components/controls'
import { Toaster } from '@/components/ui/toast'

// Tab names match the stock UI's location hashes, so existing bookmarks keep working.
const TABS = ['Colors', 'Effects', 'Segments', 'Presets'] as const
type Tab = (typeof TABS)[number]

export default function App() {
  const ready = useStore((s) => !!s.state && !!s.info)
  const conn = useStore((s) => s.conn)
  const peek = useStore((s) => s.peek)
  const wide = useMedia('(min-width: 1100px)')

  useEffect(() => { init() }, [])

  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className={cx('size-3 rounded-full', conn === 'error' ? 'bg-danger' : 'animate-pulse bg-primary')} />
        <p className="m-0 text-muted-foreground">{conn === 'error' ? 'Could not reach WLED. Retrying…' : 'Connecting to WLED…'}</p>
        <Toasts />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {wide ? (
        <>
          <Header wide />
          {/* vertical spacing between these comes from the gap, not from their own padding */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 pt-4">
            {peek && <div className="px-4"><LivePreview /></div>}
            <RealtimeBanner />
            <DesktopLayout />
          </div>
        </>
      ) : (
        <PhoneLayout top={<><Header wide={false} />{peek && <div className="px-4"><LivePreview className="mx-auto max-w-2xl" /></div>}<RealtimeBanner /></>} />
      )}
      <MoreSheet />
      <Toasts />
    </div>
  )
}

function DesktopLayout() {
  return (
    <main className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)_420px] gap-4 px-4 pb-4">
      <div className="scroll-thin flex min-h-0 flex-col gap-4 overflow-y-auto rounded-xl">
        <ColorPanel className="shrink-0" />
        <PalettePanel className="min-h-80 flex-1" />
      </div>
      <EffectPanel />
      <div className="scroll-thin flex min-h-0 flex-col gap-4 overflow-y-auto rounded-xl">
        <SegmentsPanel className="shrink-0" />
        <PresetsPanel className="shrink-0" />
      </div>
    </main>
  )
}

// Phones: the header stays put and each tab scrolls under it. On short screens (landscape) that leaves
// too little room, so the whole page scrolls as one instead and the header scrolls away; only the
// tab bar stays pinned.
function PhoneLayout({ top }: { top: ReactNode }) {
  const hash = useHash()
  const tab: Tab = TABS.find((t) => `#${t}` === hash) ?? 'Colors'
  const short = useMedia('(max-height: 560px)')

  const content = (
    <>
      {tab === 'Colors' && <><ColorPanel className="shrink-0" /><PalettePanel className="shrink-0" /></>}
      {tab === 'Effects' && (short
        ? <><Card className="shrink-0"><EffectParams /></Card><EffectList /></>
        : <EffectList className="flex-1" />)}
      {tab === 'Segments' && <SegmentsPanel />}
      {tab === 'Presets' && <PresetsPanel />}
    </>
  )

  if (short) {
    return (
      <>
        {/* keyed by tab so each tab opens scrolled to the top */}
        <div key={tab} className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {top}
          <main className="px-4 pb-4">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">{content}</div>
          </main>
        </div>
        <TabBar tab={tab} />
      </>
    )
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {top}
        <main key={tab} className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          {/* only the Effects tab is pinned to the screen height (its list scrolls inside); the others scroll inside
              a rounded area as wide as the content column, so cards keep their rounded corners as they scroll out */}
          <div className={cx('mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col', tab !== 'Effects' && 'scroll-thin overflow-y-auto rounded-xl')}>
            <div className={cx('flex flex-col gap-4', tab === 'Effects' && 'h-full')}>{content}</div>
          </div>
        </main>
      </div>
      {tab === 'Effects' && (
        <section aria-label="Effect settings" className="shrink-0 rounded-t-2xl bg-surface px-4 pb-3 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,.4)]">
          <EffectParams className="mx-auto max-w-2xl" />
        </section>
      )}
      <TabBar tab={tab} />
    </>
  )
}

function TabBar({ tab }: { tab: Tab }) {
  return (
    <nav aria-label="Sections" className="grid shrink-0 grid-cols-4 border-t bg-background pb-[max(4px,env(safe-area-inset-bottom))]">
      {TABS.map((t) => (
        <a
          key={t}
          href={`#${t}`}
          aria-current={t === tab ? 'page' : undefined}
          className={cx('flex h-14 flex-col items-center justify-center gap-1.5 text-xs font-medium no-underline', t === tab ? 'text-fg' : 'text-muted-foreground')}
        >
          <span className={cx('h-1 w-9 rounded-full', t === tab ? 'bg-primary' : 'bg-transparent')} />
          {t === 'Colors' ? 'Color' : t}
        </a>
      ))}
    </nav>
  )
}

// On phones the toasts sit above the tab bar (the phone layout is used below 1100px, see `wide`).
function Toasts() {
  return <Toaster limit={3} viewportClassName="max-[1099px]:bottom-20" />
}
