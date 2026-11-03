import { useRef, useState } from 'react'
import { toast, useStore } from '../store'
import { Switch } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Download, ExternalLink, Lock, Upload } from 'lucide-react'
import { uploadFile, type Cfg } from './api'
import { refreshCfg, useCfg, useCfgForm } from './config'
import { ChoiceChip, Row, SaveBar, Section, useLeaveGuard, usePinAction, useSaver } from './shared'

// Settings → Security and updates, with the same options as the firmware's page in WLED v16.0.1
// (data/settings_sec.htm, saved by set.cpp). Factory reset is a separate action here rather than a checkbox
// that takes effect on Save.

type PinMode = 'keep' | 'change' | 'remove'
type Form = { pinMode: PinMode; pin: string; lock: boolean; pass: string; lockWifi: boolean; sameSubnet: boolean }

const toForm = (c: Cfg): Form => ({
  pinMode: 'keep', pin: '', pass: '', lock: c.ota.lock, lockWifi: c.ota['lock-wifi'], sameSubnet: c.ota['same-subnet'],
})

// The PIN can't be read back. set.cpp keeps it when "0000" is posted (what the stock page prefills when a PIN
// is set) and removes it when the field is empty, so "0000" itself can't be a PIN.
const pinField = (f: Form) => (f.pinMode === 'keep' ? '0000' : f.pinMode === 'remove' ? '' : f.pin)

// The light ignores the lock settings unless it's unlocked or the passphrase is right; with OTA unlocked a
// typed passphrase becomes the new one.
function toFields(f: Form, c: Cfg): [string, string][] {
  const on = (k: string, v: boolean | undefined): [string, string][] => (v ? [[k, 'on']] : [])
  return [
    ['PIN', pinField(f)],
    ...on('NO', f.lock), ['OP', f.pass], ...on('OW', f.lockWifi),
    // ArduinoOTA is only offered by builds that include it, which the JSON API doesn't tell; keep it as it is
    ...on('AO', c.ota.aota), ...on('SU', f.sameSubnet),
  ]
}

export function SecSettings() {
  const { base: loaded, draft: f, patch, dirty, discard, error, retry, cfg, reloadAfterSave } = useCfgForm(toForm)
  const info = useStore((s) => s.info)
  useLeaveGuard(dirty)
  const posted = useRef<Form | null>(null) // what was saved, to check against what the light stored
  const { save, saving, dialog } = useSaver('sec', async () => {
    await reloadAfterSave()
    // a wrong passphrase (or a retry within 3 s, PIN_RETRY_COOLDOWN) is ignored without an error, so check
    // what the light stored
    const ota = useCfg.getState().cfg?.ota
    const sent = posted.current
    if (ota && sent && loaded?.lock && (ota.lock !== sent.lock || ota['lock-wifi'] !== sent.lockWifi || ota['same-subnet'] !== sent.sameSubnet))
      toast('Wrong passphrase, so the update settings weren\'t changed. Wait a few seconds before trying again.', true)
    else toast('Settings saved')
  }, true)

  if (error && !f) return <p className="text-sm text-muted-foreground">Couldn't load the settings. <Button variant="link" onClick={retry}>Try again</Button></p>
  if (!f || !loaded || !cfg) return <p className="text-sm text-muted-foreground">Loading settings…</p>

  const locked = loaded.lock
  const lockChanged = f.lock !== loaded.lock || f.lockWifi !== loaded.lockWifi || f.sameSubnet !== loaded.sameSubnet
  const errors = [
    f.pinMode === 'change' && !/^\d{4}$/.test(f.pin) && 'The new PIN must be 4 digits.',
    f.pinMode === 'change' && f.pin === '0000' && 'The PIN can\'t be 0000.',
    locked && lockChanged && !f.pass && 'Enter the passphrase to change the update settings.',
  ].filter(Boolean) as string[]
  const name = cfg.id.name
  const file = (kind: string) => `wled_${kind}${name === 'WLED' ? '' : `_${name}`}.json`
  const otaBuild = info ? (info.opt & 0x01) !== 0 : true

  return (
    <div className="flex flex-col gap-4">
      <Section title="Settings PIN">
        <p className="m-0 text-xs text-muted-foreground">Asked for before settings are saved. A PIN that's set can't be shown.</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Settings PIN">
          {([['keep', 'Keep'], ['change', 'Change'], ['remove', 'Remove']] as const).map(([m, label]) => (
            <ChoiceChip key={m} on={f.pinMode === m} onChange={() => patch({ pinMode: m, pin: '' })}>{label}</ChoiceChip>
          ))}
        </div>
        {f.pinMode === 'change' && (
          <Row label="New PIN" hint="4 digits">
            <Input className="w-24 font-mono" type="password" inputMode="numeric" maxLength={4} autoComplete="off" value={f.pin}
              aria-label="New PIN" onChange={(e) => patch({ pin: e.target.value.replace(/\D/g, '') })} />
          </Row>
        )}
        {f.pinMode === 'remove' && <p className="m-0 text-sm text-muted-foreground">Settings will save without a PIN.</p>}
        <Alert><AlertDescription>The PIN is sent unencrypted. Don't use one you use for anything else, like a bank card, door or SIM.</AlertDescription></Alert>
      </Section>

      {otaBuild && (
        <Section title="Updates and lock">
          {locked && (
            <Alert>
              <Lock aria-hidden />
              <AlertDescription>Locked. Enter the passphrase to change the update settings. The PIN, backups and factory reset work without it.</AlertDescription>
            </Alert>
          )}
          <Row label="Lock updates" hint="Blocks firmware updates. Changing these settings then needs the passphrase.">
            <Switch on={f.lock} label="Lock updates" onChange={(lock) => patch({ lock })} />
          </Row>
          <Row label="Passphrase" stack
            hint={locked ? 'The passphrase set when the light was locked.' : cfg.ota.pskl ? `Set (${cfg.ota.pskl} characters). Type a new one to replace it.` : 'Type one to set it.'}>
            <Input type="password" maxLength={32} autoComplete="off" value={f.pass} aria-label="Passphrase"
              placeholder={locked ? 'Passphrase' : '•'.repeat(cfg.ota.pskl)} onChange={(e) => patch({ pass: e.target.value })} />
          </Row>
          <Row label="Also lock Wi-Fi settings" hint="While updates are locked.">
            <Switch on={f.lockWifi} label="Also lock Wi-Fi settings" onChange={(lockWifi) => patch({ lockWifi })} />
          </Row>
          <Row label="Only allow updates from the same network" hint="With several VLANs (an IoT or guest network), set a PIN or turn this off. Off is less secure.">
            <Switch on={f.sameSubnet} label="Only allow updates from the same network" onChange={(sameSubnet) => patch({ sameSubnet })} />
          </Row>
          <Row label="Firmware" hint={info ? `WLED ${info.ver}${info.release ? ` · ${info.release}` : ''} · build ${info.vid}` : undefined}>
            <Button variant="outline" nativeButton={false} render={<a href="/update" />}>Update <ExternalLink /></Button>
          </Row>
          <Alert><AlertDescription>Settings are sent unencrypted, so someone on the same network could read them. Lock updates when you're not updating.</AlertDescription></Alert>
        </Section>
      )}

      <Section title="Backup and restore">
        <p className="m-0 text-xs text-muted-foreground">Passwords aren't included in backups. Restoring overwrites what's on the light; a broken file may need a factory reset.</p>
        <BackupRow label="Presets" path="/presets.json" file={file('presets')} />
        <BackupRow label="Configuration" path="/cfg.json" file={file('cfg')} hint="Restoring restarts the light." />
      </Section>

      <FactoryReset />

      <Section title="About">
        <p className="m-0 text-sm text-muted-foreground">
          WLED {info?.ver} by Christian Schwinne and contributors, © 2016–2024. Licensed under the EUPL v1.2.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a className="underline underline-offset-2" href="https://github.com/wled-dev/WLED/" target="_blank" rel="noreferrer">GitHub</a>
          <a className="underline underline-offset-2" href="https://kno.wled.ge/about/contributors/" target="_blank" rel="noreferrer">Contributors and thanks</a>
          <a className="underline underline-offset-2" href="https://github.com/wled-dev/WLED/blob/main/LICENSE" target="_blank" rel="noreferrer">Licence</a>
        </div>
      </Section>

      <SaveBar dirty={dirty} saving={saving} errors={errors} onDiscard={discard}
        onSave={() => { posted.current = f; save(toFields(f, cfg)) }} />
      {dialog}
    </div>
  )
}

// Download and restore of one file. JSON is checked before uploading, like the stock page.
function BackupRow({ label, path, file, hint }: { label: string; path: string; file: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<{ file: File; body: Blob; invalid: boolean } | null>(null)
  const restore = usePinAction(async (body: Blob) => {
    const { result } = await uploadFile(body, path)
    if (result === 'ok') toast(path === '/cfg.json' ? 'Configuration restored. The light is restarting.' : `${label} restored`)
    return result
  }, () => {
    setPicked(null)
    if (path === '/cfg.json') setTimeout(refreshCfg, 10000) // after the restart
  })
  const pick = async (f: File) => {
    try {
      setPicked({ file: f, body: new Blob([JSON.stringify(JSON.parse(await f.text()))], { type: 'application/json' }), invalid: false })
    } catch {
      setPicked({ file: f, body: f, invalid: true })
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-48 flex-1">
        <div className="text-sm">{label}</div>
        <div className="text-xs break-all text-muted-foreground">{file}{hint && <span className="break-normal"> · {hint}</span>}</div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" nativeButton={false} render={<a href={path} download={file} />}><Download /> Back up</Button>
        <input ref={input} type="file" accept=".json,application/json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f) }} />
        <Button variant="outline" disabled={restore.busy} onClick={() => input.current?.click()}><Upload /> Restore…</Button>
      </div>
      <AlertDialog open={picked !== null} onOpenChange={(o) => { if (!o) setPicked(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {label.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              {picked?.invalid && `${picked.file.name} isn't valid JSON. `}
              {picked && !picked.invalid && `${picked.file.name} `}
              {picked?.invalid ? 'Upload it anyway?' : `replaces the light's current ${label.toLowerCase()}${path === '/cfg.json' ? ', then the light restarts. Passwords on the light are kept' : ''}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (picked) { setPicked(null); restore.run(picked.body) } }}>{picked?.invalid ? 'Upload anyway' : 'Restore'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {restore.dialog}
    </div>
  )
}

// set.cpp formats the filesystem when RS is posted to the Security page and restarts the light.
// RS formats the whole filesystem, so this UI (/index.htm.gz) goes too and the firmware's built-in stock UI is
// served again
function FactoryReset() {
  const [confirming, setConfirming] = useState(false)
  const { save, saving, dialog } = useSaver('sec', () => toast('Factory reset. The light restarts as the WLED-AP access point.'), true)
  return (
    <Section title="Factory reset" className="ring-destructive/40">
      <Row label="Erase everything" hint="Every file on the light is erased: settings, presets and this interface. It restarts as the WLED-AP access point with the stock WLED interface, to be set up again.">
        <Button variant="destructive" disabled={saving} onClick={() => setConfirming(true)}>Reset…</Button>
      </Row>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Factory reset?</AlertDialogTitle>
            <AlertDialogDescription>
              Every file on this light is erased: settings (Wi-Fi too), presets, custom palettes and this interface, which
              goes back to the stock WLED one until you upload it again. The light restarts as the WLED-AP access point and
              this page loses its connection. Consider backing up first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { setConfirming(false); save([['RS', 'on']]) }}>Erase and restart</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {dialog}
    </Section>
  )
}
