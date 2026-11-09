import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toast, useStore } from '../store'
import { useUi } from '../ui'
import { comparePresets } from '../lib/presets'
import { Card, chipOnCls, SectionTitle, cx, UnitInput } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Toggle } from '@/components/ui/toggle'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { postSettings, unlockSettings, type SaveResult } from './api'

// A form's working copy next to the values it was loaded with; `dirty` drives the save bar.
export function useDraft<T>(loaded: T | null) {
  const [base, setBase] = useState(loaded)
  const [draft, setDraft] = useState(loaded)
  if (loaded !== base) {
    setBase(loaded)
    setDraft(loaded)
  }
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(base)
  const patch = (p: Partial<T>) => setDraft((d) => (d ? { ...d, ...p } : d))
  return { base, draft, setDraft, patch, dirty, discard: () => setDraft(base) }
}

// Unsaved changes on the open settings page, checked by the settings navigation before leaving it.
export const unsaved = { current: false }
export const confirmLeave = () => !unsaved.current || confirm('Discard your unsaved changes?')

// Warns before leaving the page (reload, closing the tab, following a link out) with unsaved changes.
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    unsaved.current = dirty
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      if (unsaved.current) e.preventDefault()
    }
    addEventListener('beforeunload', warn)
    return () => {
      removeEventListener('beforeunload', warn)
      unsaved.current = false
    }
  }, [dirty])
}

// A settings card. `action` sits next to the title, e.g. the switch that turns the whole section on.
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <SectionTitle right={action}>{title}</SectionTitle>
      {children}
    </Card>
  )
}

// A labelled row: label and optional hint on the left, the control on the right (stacked on narrow cards).
export function Row({
  label,
  hint,
  children,
  stack,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  stack?: boolean
}) {
  return (
    <div className={cx('flex gap-x-4 gap-y-1.5', stack ? 'flex-col' : 'items-center justify-between')}>
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

// A number box that holds NaN while empty, so validation can report it. `unit` shows inside the box, after
// the value (or before it with `unitStart`).
export function NumberInput({
  value,
  onChange,
  label,
  min,
  max,
  step,
  unit,
  unitStart,
  className,
  invalid,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  min?: number
  max?: number
  step?: number
  unit?: string
  unitStart?: boolean
  className?: string
  invalid?: boolean
}) {
  const props = {
    type: 'number',
    min,
    max,
    step,
    'aria-label': label,
    'aria-invalid': invalid || undefined,
    value: Number.isNaN(value) ? '' : value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange(e.target.value === '' ? NaN : Number(e.target.value)),
  }
  return unit ? (
    <UnitInput className={cx('w-28', className)} unit={unit} unitStart={unitStart} {...props} />
  ) : (
    <Input className={cx('w-24', className)} {...props} />
  )
}

// An on/off chip for picking several of a set (groups, weekdays), filled when on like the main UI's chips.
export function ChoiceChip({
  on,
  onChange,
  label,
  children,
  className,
}: {
  on: boolean
  onChange: (on: boolean) => void
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={on}
      onPressedChange={onChange}
      aria-label={label}
      className={cx(chipOnCls, className)}
    >
      {children}
    </Toggle>
  )
}

// Whether a number is a whole number within a range (the stock pages' min/max on integer inputs).
export const intIn = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max

// Passwords never leave the light, only their length (pskl). An empty field keeps the stored password: we
// post asterisks of its length, which set.cpp treats as "unchanged" (as the stock pages' prefilled fields
// do). `remove` posts an empty password instead, like clearing the field on the stock page.
export type Secret = { pw: string; pskl: number; remove: boolean }
export const keepSecret = (pskl: number): Secret => ({ pw: '', pskl, remove: false })
export const secretField = (s: Secret) => (s.remove ? '' : s.pw === '' ? '*'.repeat(s.pskl) : s.pw)

// A password field whose stored value shows as placeholder dots. Remove (only when one is stored) clears it.
export function PasswordInput({
  secret,
  maxLength,
  label,
  onChange,
}: {
  secret: Secret
  maxLength: number
  label: string
  onChange: (p: Partial<Secret>) => void
}) {
  const placeholder = secret.remove ? 'Will be removed' : secret.pskl ? '•'.repeat(secret.pskl) : 'No password'
  return (
    <div className="flex gap-2">
      <Input
        type="password"
        maxLength={maxLength}
        value={secret.pw}
        placeholder={placeholder}
        aria-label={label}
        disabled={secret.remove}
        onChange={(e) => onChange({ pw: e.target.value })}
      />
      {secret.pskl > 0 && (
        <Button
          variant="outline"
          onClick={() => onChange(secret.remove ? { remove: false } : { remove: true, pw: '' })}
        >
          {secret.remove ? 'Undo' : 'Remove'}
        </Button>
      )}
    </div>
  )
}

// Preset IDs the stock pages accept (0 is the default action).
export const presetIdValid = (v: number) => intIn(v, 0, 250)

// A preset chosen by name, where the stock pages want its ID typed in, sorted like the presets list ("Sort
// presets by ID"). Sorted by ID the options lead with the ID ("1: Morning", "None: default action"), sorted by
// name they lead with the name ("Morning (1)", "Default action (none)"). 0 is the default action, described
// by `none`, and what that default does by `does` when it does something ("Default action (Random colour)"). "Type an ID…" switches to a number box, which is also how an ID that isn't a saved preset opens,
// so loading a page never changes it.
export function PresetSelect({
  value,
  onChange,
  label,
  none,
  does,
  className,
}: {
  value: number
  onChange: (id: number) => void
  label: string
  none: string
  does?: string
  className?: string
}) {
  const presets = useStore((s) => s.presets)
  const idsort = useUi((s) => s.stock.idsort)
  const list = Object.entries(presets ?? {})
    .filter(([id, p]) => id !== '0' && p && typeof p === 'object')
    .sort(comparePresets(idsort))
  const name = (id: number) => presets?.[id]?.n || `Preset ${id}`
  const known = value === 0 || !!presets?.[value]
  // typing when chosen; otherwise for an ID that isn't a saved preset, once the presets have loaded
  const [typed, setTyping] = useState<boolean | null>(null)
  const typing = typed ?? (presets !== null && !known)
  if (typing) {
    return (
      <div className={cx('flex items-center gap-2', className)}>
        <NumberInput label={label} min={0} max={250} value={value} onChange={onChange} />
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {value === 0
            ? does
              ? `${none} (${does})`
              : none
            : presets?.[value]
              ? name(value)
              : presetIdValid(value)
                ? 'Not a saved preset'
                : 'Enter 0–250'}
        </span>
        <Button
          variant="outline"
          onClick={() => {
            setTyping(false)
            if (Number.isNaN(value)) onChange(0)
          }}
        >
          Choose
        </Button>
      </div>
    )
  }
  return (
    <NativeSelect
      className={cx('w-full', className)}
      value={value}
      aria-label={label}
      onChange={(e) => (e.target.value === 'type' ? setTyping(true) : onChange(Number(e.target.value)))}
    >
      <option value={0}>
        {idsort
          ? does
            ? `${none}: ${does}`
            : `None: ${none[0].toLowerCase()}${none.slice(1)}`
          : `${none} (${does ?? 'none'})`}
      </option>
      {!known && (
        <option value={value}>{idsort ? `${value}: not a saved preset` : `Not a saved preset (${value})`}</option>
      )}
      {list.map(([id]) => (
        <option key={id} value={id}>
          {idsort ? `${id}: ${name(Number(id))}` : `${name(Number(id))} (${id})`}
        </option>
      ))}
      <option value="type">Type an ID…</option>
    </NativeSelect>
  )
}

export const FieldError = ({ children }: { children?: ReactNode }) =>
  children ? <p className="m-0 text-xs text-destructive">{children}</p> : null

// Four 0–255 boxes for an IP address, empty while unset (NaN). Three digits move on to the next box of the same
// address (not out of it: the last box keeps the focus), as do typing a dot or a fourth digit; Backspace in an
// empty box goes back one, and a pasted address fills the boxes from this one. `placeholder` shows a default in
// the empty boxes.
export function IpInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: number[]
  onChange: (v: number[]) => void
  label: string
  placeholder?: number[]
}) {
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  // moving on selects the next box, so typing replaces it; going back puts the caret at the end, so Backspace
  // keeps deleting one digit at a time
  const focus = (i: number, back = false) => {
    const el = boxes.current[i]
    if (!el) return
    el.focus()
    if (back) el.setSelectionRange(el.value.length, el.value.length)
    else el.select()
  }
  const num = (t: string) => {
    const d = t.replace(/\D/g, '').slice(0, 3)
    return d === '' ? NaN : Number(d)
  }
  return (
    <div className="flex items-center gap-1 font-mono" role="group" aria-label={label}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground">.</span>}
          <Input
            ref={(el) => {
              boxes.current[i] = el
            }}
            aria-label={`${label}, part ${i + 1}`}
            inputMode="numeric"
            className="w-14 text-center"
            placeholder={placeholder ? String(placeholder[i]) : undefined}
            value={Number.isNaN(value[i]) ? '' : String(value[i])}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && e.currentTarget.value === '' && i > 0) {
                e.preventDefault()
                focus(i - 1, true)
              }
            }}
            onChange={(e) => {
              const v = [...value]
              const parts = e.target.value.split('.')
              if (parts.length === 1) {
                // a digit typed into a full box starts the next one (the last box just keeps three)
                const d = parts[0].replace(/\D/g, '')
                v[i] = num(d)
                if (d.length > 3 && i < 3) v[i + 1] = num(d.slice(3))
                onChange(v)
                if (d.length >= 3 && i < 3) focus(i + 1)
              } else if (parts.length === 2 && parts[1] === '') {
                // a dot typed after the number
                v[i] = num(parts[0])
                onChange(v)
                if (!Number.isNaN(v[i]) && i < 3) focus(i + 1)
              } else {
                // a pasted address
                const fill = parts.slice(0, 4 - i)
                fill.forEach((p, j) => (v[i + j] = num(p)))
                onChange(v)
                focus(i + fill.length - 1)
              }
            }}
          />
        </span>
      ))}
    </div>
  )
}
export const ipValid = (v: number[]) => v.length === 4 && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)
// an address left empty: all four boxes empty, or all zeros, as the firmware stores "not set"
export const ipEmpty = (v: number[]) => v.every((x) => Number.isNaN(x) || x === 0)
export const ipText = (v: number[]) => v.map((x) => (Number.isNaN(x) ? '' : String(x))).join('.')

// After a wrong PIN the light ignores every PIN for 3 s, even the right one (PIN_RETRY_COOLDOWN in
// checkSettingsPIN), so Unlock waits that out from `wrongAt`.
function PinDialog({
  open,
  onSubmit,
  onCancel,
  wrongAt,
  verb,
}: {
  open: boolean
  onSubmit: (pin: string) => void
  onCancel: () => void
  wrongAt: number
  verb: string
}) {
  const [pin, setPin] = useState('')
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    const left = wrongAt + 3100 - Date.now()
    if (!wrongAt || left <= 0) return
    const start = setTimeout(() => setWaiting(true), 0)
    const end = setTimeout(() => setWaiting(false), left)
    return () => {
      clearTimeout(start)
      clearTimeout(end)
      setWaiting(false)
    }
  }, [wrongAt])
  const ready = pin.length === 4 && !waiting
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel()
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Settings PIN</AlertDialogTitle>
          <AlertDialogDescription>This light has a settings PIN. Enter it to {verb}.</AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          autoFocus
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready) onSubmit(pin)
          }}
          aria-label="PIN"
        />
        <FieldError>{wrongAt ? 'That PIN was rejected. Try again.' : undefined}</FieldError>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!ready} onClick={() => onSubmit(pin)}>
            Unlock
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Runs something the light may refuse until the settings PIN is entered (a settings form, an upload): a 401
// opens the PIN dialog, and the action is retried once the PIN is entered. `verb` finishes the dialog's
// "Enter it to …"; `onFail` replaces the error toast.
export function usePinAction<A>(
  action: (a: A) => Promise<SaveResult>,
  onDone: (a: A) => void,
  { verb = 'save', onFail }: { verb?: string; onFail?: (result: SaveResult) => void } = {},
) {
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ a: A } | null>(null)
  const [wrongAt, setWrongAt] = useState(0)

  const run = async (a: A, retry = false) => {
    setBusy(true)
    const result = await action(a)
    setBusy(false)
    if (result === 'ok') {
      setPending(null)
      setWrongAt(0)
      onDone(a)
      return
    }
    if (result === 'pin') {
      setWrongAt(retry ? Date.now() : 0)
      setPending({ a })
      return
    }
    setPending(null)
    if (onFail) {
      onFail(result)
      return
    }
    toast(
      result === 'locked'
        ? 'Wi-Fi settings are locked. Unlock OTA in Security and updates first.'
        : "Couldn't save the settings. Try again.",
      true,
    )
  }
  const dialog = (
    <PinDialog
      open={pending !== null}
      wrongAt={wrongAt}
      verb={verb}
      onCancel={() => {
        setPending(null)
        setWrongAt(0)
      }}
      // closes while the action runs again (an upload can take a while), and opens again if the PIN was wrong
      onSubmit={async (pin) => {
        if (!pending) return
        setPending(null)
        await unlockSettings(pin)
        run(pending.a, true)
      }}
    />
  )
  return { run, busy, dialog }
}

// Saving with the firmware's form handler, including the PIN round trip. `quiet` leaves the "saved" message
// to the page.
export function useSaver(page: string, onSaved: () => void, quiet = false) {
  const { run, busy, dialog } = usePinAction(
    (fields: [string, string][]) => postSettings(page, fields),
    () => {
      if (!quiet) toast('Settings saved')
      onSaved()
    },
  )
  return { save: run, saving: busy, dialog }
}

// On wide screens the settings screen shows a page's intro under its title, outside the scroll area: the area's
// rounded corners (made to fit the cards) would cut into text at its top. Phones keep it at the top of the page.
export const IntroSlot = createContext<HTMLElement | null>(null)
export function PageIntro({ children }: { children: ReactNode }) {
  const slot = useContext(IntroSlot)
  return slot ? createPortal(children, slot) : children
}

// On phones the settings screen puts a footer below the page's scroll area (like the tab bar on the controls)
// and passes it here; the save bar is drawn there, so it stays put instead of moving with the end of the page.
export const SaveBarSlot = createContext<HTMLElement | null>(null)

// The bar at the bottom of a settings page: what is unsaved, or what has to be fixed before saving (a bulleted
// list when there's more than one), then Discard and Save. The two buttons wrap to the next line together.
// Without a footer (wide screens) it sticks to the bottom of the page.
export function SaveBar({
  dirty,
  saving,
  errors = [],
  onSave,
  onDiscard,
  saveLabel = 'Save',
}: {
  dirty: boolean
  saving: boolean
  errors?: string[]
  onSave: () => void
  onDiscard: () => void
  saveLabel?: string
}) {
  const slot = useContext(SaveBarSlot)
  const content = (
    <>
      {errors.length > 1 ? (
        <ul className="m-0 mr-auto min-w-0 list-disc pl-4 text-sm text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : (
        <span className={cx('mr-auto min-w-0 text-sm', errors.length ? 'text-destructive' : 'text-muted-foreground')}>
          {errors[0] ?? (dirty ? 'Unsaved changes' : 'No changes')}
        </span>
      )}
      <div className="flex gap-2">
        <Button variant="outline" disabled={!dirty || saving} onClick={onDiscard}>
          Discard
        </Button>
        <Button disabled={!dirty || saving || errors.length > 0} onClick={onSave}>
          {saving ? 'Saving…' : saveLabel}
        </Button>
      </div>
    </>
  )
  if (slot)
    return createPortal(
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-end gap-2 px-4 py-2">{content}</div>,
      slot,
    )
  return (
    <div className="sticky bottom-[env(safe-area-inset-bottom)] z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/10">
      {content}
    </div>
  )
}
