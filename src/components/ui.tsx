import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// A range slider that shows its value while dragging and reports it once on release, like the stock UI
// (sending every intermediate value would flood the ESP).
export function Slider({
  value, min = 0, max = 255, step, onCommit, onInput, track, label, className,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  onCommit: (v: number) => void
  onInput?: (v: number) => void
  track?: string
  label: string
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [local, setLocal] = useState<number | null>(null)
  const commit = useRef(onCommit)
  useEffect(() => { commit.current = onCommit })
  useEffect(() => {
    const el = ref.current!
    const done = () => { commit.current(Number(el.value)); setLocal(null) }
    el.addEventListener('change', done)
    return () => el.removeEventListener('change', done)
  }, [])
  const v = local ?? value
  const pct = ((v - min) / (max - min)) * 100
  return (
    <input
      ref={ref}
      type="range"
      className={cx('sl', className)}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={v}
      onChange={(e) => { const n = Number(e.target.value); setLocal(n); onInput?.(n) }}
      style={{ '--p': `${pct}%`, ...(track ? { '--t': track } : {}) } as React.CSSProperties}
    />
  )
}

// `display` overrides the shown value; without it the raw value is shown, following the thumb while dragging.
export function LabeledSlider({ label, display, onInput, onCommit, ...props }: Parameters<typeof Slider>[0] & { display?: ReactNode }) {
  const [live, setLive] = useState<number | null>(null)
  return (
    <label className="grid grid-cols-[88px_1fr_52px] items-center gap-3 text-xs text-muted">
      <span className="truncate">{label}</span>
      <Slider label={label} {...props}
        onInput={(v) => { setLive(v); onInput?.(v) }}
        onCommit={(v) => { setLive(null); onCommit(v) }} />
      <span className="text-right font-mono text-fg">{display ?? live ?? props.value}</span>
    </label>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-line-strong')}
    >
      <span className={cx('absolute top-0.5 size-5 rounded-full bg-white transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('flex flex-col gap-3 rounded-2xl bg-surface p-4', className)}>{children}</section>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-2">
      <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {right}
    </div>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger'; active?: boolean; size?: 'sm' | 'md' }

export function Button({ variant = 'default', active, size = 'md', className, ...props }: BtnProps) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border transition-colors',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-10 px-3.5 text-[13px]',
        variant === 'primary' && 'border-transparent bg-accent font-semibold text-on-accent hover:brightness-110',
        variant === 'default' && (active ? 'border-accent bg-hover text-fg' : 'border-line bg-transparent text-fg hover:bg-hover'),
        variant === 'ghost' && 'border-transparent bg-transparent text-muted hover:bg-hover hover:text-fg',
        variant === 'danger' && 'border-danger-line bg-transparent text-danger hover:bg-danger-line/30',
        className,
      )}
    />
  )
}

export function IconButton({ label, children, active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...props}
      className={cx(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors',
        active ? 'border-accent bg-hover text-fg' : 'border-line bg-surface text-fg hover:bg-hover',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={cx(
        'h-8 shrink-0 rounded-full border px-3 text-xs transition-colors',
        on ? 'border-accent bg-hover text-fg' : 'border-line text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

export function Check({ checked, onChange, children, className }: { checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; className?: string }) {
  return (
    <label className={cx('flex min-h-9 cursor-pointer items-center gap-2.5 text-[13px]', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-[18px] shrink-0 accent-accent" />
      {children}
    </label>
  )
}

export const inputCls = 'h-10 w-full rounded-lg border border-line bg-bg px-2.5 text-sm outline-none focus:border-accent'

export function Field({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-1 text-[11px] text-muted', className)}>
      {label}
      {children}
    </label>
  )
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg bg-bg px-3 text-muted">
      <Icon.search className="size-4 shrink-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange('')} className="text-muted hover:text-fg">
          <Icon.x className="size-4" />
        </button>
      )}
    </label>
  )
}

// ---------------------------------------------------------------- icons (stroke icons, 24px grid)

const svg = (paths: ReactNode) => ({ className = 'size-[18px]' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    {paths}
  </svg>
)

export const Icon = {
  power: svg(<><path d="M12 3v9" /><path d="M6.3 6.3a8 8 0 1 0 11.4 0" /></>),
  moon: svg(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />),
  sync: svg(<><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></>),
  eye: svg(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  info: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>),
  nodes: svg(<><rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /></>),
  settings: svg(<><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>),
  search: svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  plus: svg(<path d="M12 5v14M5 12h14" />),
  x: svg(<path d="M6 6l12 12M18 6 6 18" />),
  trash: svg(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />),
  edit: svg(<path d="M4 20h4L19 9l-4-4L4 16z" />),
  snow: svg(<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" />),
  chevron: svg(<path d="m6 9 6 6 6-6" />),
  more: svg(<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>),
  play: svg(<path d="M7 5v14l11-7z" />),
  stop: svg(<rect x="6" y="6" width="12" height="12" rx="1" />),
  check: svg(<path d="m5 12 5 5 9-10" />),
  repeat: svg(<><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>),
  list: svg(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />),
  star: svg(<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />),
  dice: svg(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01" /></>),
}
