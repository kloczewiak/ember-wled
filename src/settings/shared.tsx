import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '../store'
import { Card, SectionTitle, cx } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { postSettings, unlockSettings } from './api'

// A form's working copy next to the values it was loaded with; `dirty` drives the save bar.
export function useDraft<T>(loaded: T | null) {
  const [base, setBase] = useState(loaded)
  const [draft, setDraft] = useState(loaded)
  if (loaded !== base) { setBase(loaded); setDraft(loaded) }
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
    const warn = (e: BeforeUnloadEvent) => { if (unsaved.current) e.preventDefault() }
    addEventListener('beforeunload', warn)
    return () => { removeEventListener('beforeunload', warn); unsaved.current = false }
  }, [dirty])
}

export function Section({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </Card>
  )
}

// A labelled row: label and optional hint on the left, the control on the right (stacked on narrow cards).
export function Row({ label, hint, children, stack }: { label: ReactNode; hint?: ReactNode; children: ReactNode; stack?: boolean }) {
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

export const FieldError = ({ children }: { children?: ReactNode }) =>
  children ? <p className="m-0 text-xs text-destructive">{children}</p> : null

// Four 0–255 boxes, like the stock page's IP inputs (each "required", min 0, max 255).
export function IpInput({ value, onChange, label }: { value: number[]; onChange: (v: number[]) => void; label: string }) {
  return (
    <div className="flex items-center gap-1 font-mono" role="group" aria-label={label}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground">.</span>}
          <Input
            aria-label={`${label}, part ${i + 1}`}
            inputMode="numeric"
            className="w-14 text-center"
            value={Number.isNaN(value[i]) ? '' : String(value[i])}
            onChange={(e) => { const v = [...value]; v[i] = e.target.value === '' ? NaN : Number(e.target.value.replace(/\D/g, '')); onChange(v) }}
          />
        </span>
      ))}
    </div>
  )
}
export const ipValid = (v: number[]) => v.length === 4 && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)
export const ipText = (v: number[]) => v.map((x) => (Number.isNaN(x) ? '' : String(x))).join('.')

function PinDialog({ open, onSubmit, onCancel, wrong }: { open: boolean; onSubmit: (pin: string) => void; onCancel: () => void; wrong: boolean }) {
  const [pin, setPin] = useState('')
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Settings PIN</AlertDialogTitle>
          <AlertDialogDescription>This light has a settings PIN. Enter it to save.</AlertDialogDescription>
        </AlertDialogHeader>
        <Input autoFocus inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter' && pin.length === 4) onSubmit(pin) }} aria-label="PIN" />
        <FieldError>{wrong ? 'That PIN was rejected. Try again.' : undefined}</FieldError>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pin.length !== 4} onClick={() => onSubmit(pin)}>Unlock</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Saving with the firmware's form handler, including the PIN round trip: a 401 opens the PIN dialog, and
// the save is retried once the PIN is entered.
export function useSaver(page: string, onSaved: () => void) {
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<[string, string][] | null>(null)
  const [wrongPin, setWrongPin] = useState(false)

  const run = async (fields: [string, string][]) => {
    setSaving(true)
    const result = await postSettings(page, fields)
    setSaving(false)
    if (result === 'ok') { setPending(null); setWrongPin(false); toast('Settings saved'); onSaved(); return }
    if (result === 'pin') { setWrongPin(pending !== null); setPending(fields); return }
    setPending(null)
    toast(result === 'locked' ? 'Wi-Fi settings are locked. Unlock OTA in Security and updates first.' : 'Couldn\'t save the settings. Try again.', true)
  }
  const dialog = (
    <PinDialog
      open={pending !== null}
      wrong={wrongPin}
      onCancel={() => { setPending(null); setWrongPin(false) }}
      onSubmit={async (pin) => { await unlockSettings(pin); if (pending) run(pending) }}
    />
  )
  return { save: run, saving, dialog }
}

// On phones the settings screen puts a footer below the page's scroll area (like the tab bar on the controls)
// and passes it here; the save bar is drawn there, so it stays put instead of moving with the end of the page.
export const SaveBarSlot = createContext<HTMLElement | null>(null)

// The bar at the bottom of a settings page: what is unsaved, Discard and Save. The two buttons wrap to the
// next line together. Without a footer (wide screens) it sticks to the bottom of the page.
export function SaveBar({ dirty, saving, error, onSave, onDiscard, saveLabel = 'Save' }: {
  dirty: boolean; saving: boolean; error?: string | null; onSave: () => void; onDiscard: () => void; saveLabel?: string
}) {
  const slot = useContext(SaveBarSlot)
  const content = (
    <>
      <span className={cx('mr-auto text-sm', error ? 'text-destructive' : 'text-muted-foreground')}>
        {error ?? (dirty ? 'Unsaved changes' : 'No changes')}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={!dirty || saving} onClick={onDiscard}>Discard</Button>
        <Button disabled={!dirty || saving || !!error} onClick={onSave}>{saving ? 'Saving…' : saveLabel}</Button>
      </div>
    </>
  )
  if (slot) return createPortal(<div className="mx-auto flex max-w-2xl flex-wrap items-center justify-end gap-2 px-4 py-2">{content}</div>, slot)
  return (
    <div className="sticky bottom-[env(safe-area-inset-bottom)] z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/10">
      {content}
    </div>
  )
}
