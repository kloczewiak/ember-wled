import { useState, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button as UiButton } from '@/components/ui/button'
import { Card as UiCard, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Slider as UiSlider } from '@/components/ui/slider'
import { Switch as UiSwitch } from '@/components/ui/switch'
import { Toggle } from '@/components/ui/toggle'
import {
  Check as CheckIcon,
  ChevronDown,
  Dices,
  Ellipsis,
  Eye,
  Info,
  List,
  Moon,
  Pencil,
  Play,
  Plus,
  Power,
  RefreshCw,
  Repeat,
  Search,
  SlidersHorizontal,
  Snowflake,
  Square,
  Star,
  Trash2,
  X,
} from 'lucide-react'

// The app's controls, built on the shadcn components in ./ui. Panels use these rather than the
// shadcn components directly, so WLED-specific behaviour (commit-on-release sliders etc.) lives in one place.

export const cx = cn

// A slider that shows its value while dragging and reports it once on release, like the stock UI
// (sending every intermediate value would flood the ESP).
export function Slider({
  value,
  min = 0,
  max = 255,
  step = 1,
  onCommit,
  onInput,
  track,
  label,
  className,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  onCommit: (v: number) => void
  onInput?: (v: number) => void
  track?: string // custom track background, e.g. a gradient
  label: string
  className?: string
}) {
  const [local, setLocal] = useState<number | null>(null)
  const first = (v: number | readonly number[]) => (typeof v === 'number' ? v : v[0])
  return (
    <UiSlider
      aria-label={label}
      className={className}
      min={min}
      max={max}
      step={step}
      value={[local ?? value]}
      trackStyle={track ? { background: track } : undefined}
      onValueChange={(v) => {
        const n = first(v)
        setLocal(n)
        onInput?.(n)
      }}
      onValueCommitted={(v) => {
        setLocal(null)
        onCommit(first(v))
      }}
    />
  )
}

// `display` overrides the shown value; without it the raw value is shown, following the thumb while dragging.
// Classes for a block of sliders that share columns (`grouped` LabeledSliders): labels as wide as the longest
// one, the slider takes the rest, values at their own width.
export const sliderGridCls = 'grid grid-cols-[max-content_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1'

// A slider with its label on the left and value on the right. On its own it uses fixed columns; `grouped`
// rows use the columns of a surrounding sliderGridCls grid, and their values are up to 3 digits.
export function LabeledSlider({
  label,
  display,
  onInput,
  onCommit,
  grouped,
  ...props
}: Parameters<typeof Slider>[0] & { display?: ReactNode; grouped?: boolean }) {
  const [live, setLive] = useState<number | null>(null)
  return (
    <div
      className={cn(
        'items-center gap-x-3 text-xs text-muted-foreground',
        grouped ? 'col-span-3 grid grid-cols-subgrid' : 'grid grid-cols-[88px_1fr_52px]',
      )}
    >
      <span className={grouped ? undefined : 'truncate'}>{label}</span>
      <Slider
        label={label}
        {...props}
        onInput={(v) => {
          setLive(v)
          onInput?.(v)
        }}
        onCommit={(v) => {
          setLive(null)
          onCommit(v)
        }}
      />
      <span className={cn('text-right font-mono text-foreground', grouped && 'w-[3ch]')}>
        {display ?? live ?? props.value}
      </span>
    </div>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return <UiSwitch checked={on} onCheckedChange={onChange} aria-label={label} />
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <UiCard className={className}>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">{children}</CardContent>
    </UiCard>
  )
}

// The title sits at the top of its card; buttons on the right hang below it rather than pushing it down.
// With `wrap`, the buttons in `right` (a fragment) sit in the title's row one by one: those that don't fit
// beside the title wrap onto lines of their own, starting at the left.
export function SectionTitle({ children, right, wrap }: { children: ReactNode; right?: ReactNode; wrap?: boolean }) {
  return (
    <div className={cn('flex items-start', wrap ? 'flex-wrap gap-1.5' : 'justify-between gap-2')}>
      <h2
        className={cn(
          'm-0 font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground',
          wrap && 'grow pr-1',
        )}
      >
        {children}
      </h2>
      {right}
    </div>
  )
}

type BtnProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

const VARIANTS = { default: 'outline', primary: 'default', ghost: 'ghost', danger: 'destructive' } as const

export function Button({ variant = 'default', size = 'md', className, ...props }: BtnProps) {
  return (
    <UiButton variant={VARIANTS[variant]} size={size === 'sm' ? 'default' : 'lg'} className={className} {...props} />
  )
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <UiButton variant="outline" size="icon-lg" aria-label={label} title={label} className={className} {...props}>
      {children}
    </UiButton>
  )
}

// A pressable filter/option chip.
// A chip that is on is filled with the primary colour: the outline toggle's own "on" (a slightly lighter fill)
// is hard to tell apart when several chips sit side by side.
export const chipOnCls = 'aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground'

export function Chip({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={on}
      onPressedChange={onClick}
      title={title}
      className={cn('shrink-0', chipOnCls)}
    >
      {children}
    </Toggle>
  )
}

export function Check({
  checked,
  onChange,
  children,
  className,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children?: ReactNode
  className?: string
}) {
  return (
    <Label className={cn('min-h-8 font-normal', className)}>
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {children}
    </Label>
  )
}

// An input with its unit inside the box, after the value (or before it with `unitStart`), like the hex
// field's "#". `className` sizes the box, `inputClassName` styles the text.
export function UnitInput({
  unit,
  unitStart,
  className,
  inputClassName,
  ...props
}: Omit<ComponentProps<'input'>, 'className'> & {
  unit: string
  unitStart?: boolean
  className?: string
  inputClassName?: string
}) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon align={unitStart ? 'inline-start' : 'inline-end'}>
        <InputGroupText>{unit}</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput className={inputClassName} {...props} />
    </InputGroup>
  )
}

// Classes for plain inputs, textareas and selects, matching shadcn's Input.
export const inputCls =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

export function Field({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1 text-[11px] text-muted-foreground', className)}>
      {label}
      {children}
    </label>
  )
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pr-9 pl-9"
      />
      {value && (
        <button
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- icons (lucide)

// data-icon="inline-start" / "inline-end" tells a button its icon leads or trails, for the padding
type IconProps = { className?: string; 'data-icon'?: 'inline-start' | 'inline-end' }
const icon =
  (C: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean; 'data-icon'?: string }>) =>
  ({ className, 'data-icon': dataIcon }: IconProps) => <C className={className} aria-hidden data-icon={dataIcon} />

export const Icon = {
  power: icon(Power),
  moon: icon(Moon),
  sync: icon(RefreshCw),
  eye: icon(Eye),
  info: icon(Info),
  settings: icon(SlidersHorizontal),
  search: icon(Search),
  plus: icon(Plus),
  x: icon(X),
  trash: icon(Trash2),
  edit: icon(Pencil),
  snow: icon(Snowflake),
  chevron: icon(ChevronDown),
  more: icon(Ellipsis),
  play: icon(Play),
  stop: icon(Square),
  check: icon(CheckIcon),
  repeat: icon(Repeat),
  list: icon(List),
  star: icon(Star),
  dice: icon(Dices),
}
