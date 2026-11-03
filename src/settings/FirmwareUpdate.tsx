import { useEffect, useRef, useState, type ReactNode } from 'react'
import { refresh, toast, useStore } from '../store'
import { Switch } from '../components/controls'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Check, ChevronDown, Lock } from 'lucide-react'
import type { Info } from '../api/types'
import { BUILT_FOR } from '../lib/firmware'
import {
  compareVersions, download, latestRelease, revertFirmware, updateAccess, uploadFirmware, waitForRestart,
  type Release, type SaveResult, type UploadReply,
} from './api'
import { useCfg } from './config'
import { Row, Section, usePinAction } from './shared'

// Settings → Firmware update, with what the firmware's update page offers in WLED v16.0.1 (data/update.htm):
// the latest release from GitHub in one step, a firmware file, going back to the previous firmware and, on
// ESP32 and ESP32-S2, a bootloader. Installing shows its progress and waits for the light to restart.

type Job = { kind: 'release'; release: Release } | { kind: 'file'; file: File; skip: boolean } | { kind: 'revert' } | { kind: 'bootloader'; file: File }
type Kind = Job['kind']
type Failure = { kind: Kind; title: string; text: string }

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`

// The version in a firmware file's name, like the release files' WLED_16.0.1_ESP32.bin
const fileVersion = (name: string) => /_(\d+\.\d+\.\d+[^_]*)_/.exec(name)?.[1] ?? null

// The light's reasons, in this page's words
function reason(r: UploadReply): string {
  const text = r.reply?.text ?? ''
  if (r.status === 0) return 'The light stopped answering. Check that it\'s on and connected, then try again.'
  if (text.includes('not on local subnet')) return 'The light only takes updates from its own network. Set a settings PIN or turn off "Only allow updates from the same network" in Security and updates.'
  return text.replace("Enable 'Ignore firmware validation' to proceed anyway.", 'Turn on "Skip the firmware check" to install it anyway.') || `The light answered with HTTP ${r.status}.`
}

async function uptimeNow() {
  try { return ((await (await fetch('/json/info', { cache: 'no-store' })).json()) as Info).uptime } catch { return Infinity }
}

export function FirmwareUpdate() {
  const info = useStore((s) => s.info)
  const locked = useCfg((s) => s.cfg?.ota.lock ?? false)
  const [release, setRelease] = useState<Release | 'error' | null>(null) // null while checking
  const [step, setStep] = useState<{ label: string; progress?: number } | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [skip, setSkip] = useState(false)
  const [confirm, setConfirm] = useState<Job | null>(null) // what's waiting for its confirmation (kept while it closes)
  const [confirming, setConfirming] = useState(false)

  const repo = info?.repo && info.repo !== 'unknown' ? info.repo : null
  const buildType = info?.release ?? ''
  useEffect(() => {
    if (repo && buildType) latestRelease(repo, buildType).then(setRelease, () => setRelease('error'))
  }, [repo, buildType])
  const check = () => {
    setRelease(null)
    latestRelease(repo!, buildType).then(setRelease, () => setRelease('error'))
  }

  // reloading or closing the page would cut the upload off
  useEffect(() => {
    if (!step) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [step])

  const fail = (kind: Kind, title: string, text: string): SaveResult => { setStep(null); setFailure({ kind, title, text }); return 'error' }

  const install = async (job: Job): Promise<SaveResult> => {
    setFailure(null)
    setStep({ label: 'Checking the light…' })
    const access = await updateAccess()
    if (access === 'pin') { setStep(null); return 'pin' }
    if (access === 'locked') return fail(job.kind, 'Updates are locked', 'Unlock them in Security and updates first.')
    if (access === 'error') return fail(job.kind, 'Couldn\'t reach the light', 'Check that it\'s on and connected, then try again.')
    const before = await uptimeNow()

    let r: UploadReply
    if (job.kind === 'revert') {
      setStep({ label: 'Going back to the previous firmware…' })
      r = await revertFirmware()
      // without earlier firmware to go back to, the light serves its update page instead of a message
      if (r.ok && !r.reply?.title.startsWith('Reverted')) return fail('revert', 'Nothing to go back to', 'The light has no earlier firmware stored, for example after it was flashed over USB or has already gone back once.')
      if (!r.ok) return fail('revert', r.reply?.title.replace(/!$/, '') || 'Couldn\'t go back', reason(r))
    } else {
      let fw: File
      if (job.kind === 'release') {
        const f = job.release.file!
        setStep({ label: `Downloading ${f.name}`, progress: 0 })
        try {
          fw = await download(f.url, f.name, f.size, (progress) => setStep({ label: `Downloading ${f.name}`, progress }))
        } catch {
          return fail('release', 'Couldn\'t download the firmware', 'Check this device\'s internet connection, or download the file from the release page and install it below.')
        }
      } else fw = job.file
      const label = `Uploading ${fw.name}`
      setStep({ label, progress: 0 })
      r = await uploadFirmware(fw, { bootloader: job.kind === 'bootloader', skipValidation: job.kind === 'file' && job.skip, onProgress: (progress) => setStep({ label, progress }) })
      if (r.status === 401 && !r.reply?.text.includes('subnet')) { setStep(null); return r.reply?.text.includes('OTA') ? fail(job.kind, 'Updates are locked', 'Unlock them in Security and updates first.') : 'pin' }
      if (!r.ok) return fail(job.kind, r.reply?.title.replace(/!$/, '') || 'The update failed', reason(r))
    }

    setStep({ label: 'Installing and restarting…' })
    const back = await waitForRestart(before)
    setStep(null)
    if (!back) return fail(job.kind, 'The light isn\'t back yet', 'It may still be installing. Reload this page in a minute.')
    refresh()
    toast(job.kind === 'bootloader' ? 'Bootloader installed. The light has restarted.' : job.kind === 'revert' ? `Back on WLED ${back.ver}` : `Updated to WLED ${back.ver}`)
    if (job.kind === 'file') { setFile(null); setSkip(false) }
    return 'ok'
  }
  // failures are shown on the page, next to what was tried
  const action = usePinAction(install, () => {}, { verb: 'install', onFail: () => {} })

  if (!info) return <p className="text-sm text-muted-foreground">Loading…</p>
  const ota = (info.opt & 0x01) !== 0
  const esp32 = info.arch !== 'esp8266'
  const bootloader = info.arch === 'esp32' || info.arch === 'esp32-s2'
  const failed = (kind: Kind) => failure?.kind === kind && (
    <Alert variant="destructive"><AlertDescription><b className="font-medium">{failure.title}.</b> {failure.text}</AlertDescription></Alert>
  )
  const busy = step !== null || action.busy
  // firmware other than what this UI is built for is installed after a warning, a bootloader after a confirmation
  const start = (job: Job) => {
    const version = job.kind === 'release' ? job.release.version : job.kind === 'file' ? fileVersion(job.file.name) : null
    if ((job.kind === 'release' || job.kind === 'file') && version === BUILT_FOR) action.run(job)
    else { setConfirm(job); setConfirming(true) }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Firmware">
        <Row label="Installed"><span className="text-sm"><span className="font-mono">{info.brand} {info.ver}</span> <span className="text-muted-foreground">· build {info.vid}</span></span></Row>
        {info.release && (
          <Row label="Build type" hint={`Firmware files for this light end in _${info.release}.bin.`}>
            <span className="font-mono text-sm">{info.release}</span>
          </Row>
        )}
        {ota && !locked && !step && repo && buildType && <LatestRelease release={release} installed={info.ver} buildType={buildType} onCheck={check} disabled={busy}
          onInstall={(r) => start({ kind: 'release', release: r })} />}
        {failed('release')}
      </Section>

      {!ota ? (
        <Alert><AlertDescription>This build can't be updated over the network. Flash new firmware over USB instead.</AlertDescription></Alert>
      ) : locked ? (
        <Alert>
          <Lock aria-hidden />
          <AlertDescription>Updates are locked. Unlock them in <a className="underline underline-offset-2" href="#settings/sec">Security and updates</a> to install firmware.</AlertDescription>
        </Alert>
      ) : step ? (
        <Section title="Installing">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{step.label}</span>
            {step.progress !== undefined && <span className="font-mono text-xs text-muted-foreground">{Math.round(step.progress * 100)}%</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={step.label}
            aria-valuenow={step.progress !== undefined ? Math.round(step.progress * 100) : undefined}>
            <div className={step.progress !== undefined ? 'h-full rounded-full bg-primary transition-[width]' : 'h-full w-1/3 animate-pulse rounded-full bg-primary'}
              style={step.progress !== undefined ? { width: `${step.progress * 100}%` } : undefined} />
          </div>
          <p className="m-0 text-xs text-muted-foreground">Keep this page open until the light is back. Settings, presets and this interface stay as they are.</p>
        </Section>
      ) : (
        <>
          <Section title="Install from a file">
            <FilePick label="Firmware file" file={file} onPick={setFile} hint={info.release ? `A .bin file for ${info.release}` : 'A .bin file for this light'} />
            <Row label="Skip the firmware check" hint="Installs a file even if it's for another build type or not WLED. Only for builds you trust.">
              <Switch on={skip} label="Skip the firmware check" onChange={setSkip} />
            </Row>
            {failed('file')}
            <div className="flex justify-end">
              <Button variant="outline" disabled={!file || busy} onClick={() => file && start({ kind: 'file', file, skip })}>Install</Button>
            </div>
          </Section>

          {esp32 && (
            <Section title="Previous version">
              <Row label="Go back to the previous version" hint="Restarts with the firmware from before the last update, if it's still on the light.">
                <Button variant="outline" disabled={busy} onClick={() => start({ kind: 'revert' })}>Revert…</Button>
              </Row>
              {failed('revert')}
            </Section>
          )}

          {bootloader && <Bootloader sha={info.bootloaderSHA256} failure={failed('bootloader')} disabled={busy}
            onInstall={(file) => start({ kind: 'bootloader', file })} />}
        </>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>{confirm && <Confirm job={confirm} onConfirm={() => { setConfirming(false); action.run(confirm) }} />}</AlertDialogContent>
      </AlertDialog>
      {action.dialog}
    </div>
  )
}

// The confirmation before installing: for firmware this UI isn't built for (or that it can't tell), a warning
// and how to remove this UI if it stops working; for a bootloader, what a wrong one does.
function Confirm({ job, onConfirm }: { job: Job; onConfirm: () => void }) {
  const version = job.kind === 'release' ? job.release.version : job.kind === 'file' ? fileVersion(job.file.name) : null
  const warning = `This interface stays installed, but it's built for WLED ${BUILT_FOR} and may not work properly on ${version ? version : 'another version'}.`
  const [title, text, label] = {
    release: [`Update to WLED ${version}?`, `Settings and presets stay as they are. ${warning}`, `Update to ${version}`],
    file: [`Install ${job.kind === 'file' ? job.file.name : ''}?`,
      version ? `Settings and presets stay as they are. ${warning}` : `The file name doesn't say which version it is. Settings and presets stay as they are. ${warning}`, 'Install'],
    revert: ['Go back to the previous version?', `The light restarts with the firmware it had before the last update. Settings and presets stay as they are. ${warning}`, 'Revert and restart'],
    bootloader: ['Install this bootloader?', `${job.kind === 'bootloader' ? job.file.name : ''} replaces the light's bootloader. If it's the wrong one, the light won't start and has to be flashed over USB.`, 'Install bootloader'],
  }[job.kind]
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle className="break-all">{title}</AlertDialogTitle>
        <AlertDialogDescription>{text}</AlertDialogDescription>
      </AlertDialogHeader>
      {job.kind !== 'bootloader' && <RemoveUi />}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant={job.kind === 'bootloader' ? 'destructive' : 'default'} onClick={onConfirm}>{label}</AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

// How to go back to WLED's own interface if this one stops working: the firmware's file editor deletes
// /index.htm.gz with one address, and works without this UI (createEditHandler in wled_server.cpp). With a
// settings PIN it needs unlocking first, which the firmware's own settings pages do.
function RemoveUi() {
  const base = `${location.protocol}//${location.host}`
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
      <span>If this interface stops working, open this address to remove it. The light then shows WLED's own interface.</span>
      <span className="font-mono break-all text-foreground select-all">{base}/edit?func=delete&path=/index.htm.gz</span>
      <span>With a settings PIN, enter it here first:</span>
      <span className="font-mono break-all text-foreground select-all">{base}/settings/sec</span>
    </div>
  )
}

// What GitHub has: up to date, a newer release to install in one step, or (on a beta) an older one.
function LatestRelease({ release, installed, buildType, onCheck, onInstall, disabled }: {
  release: Release | 'error' | null; installed: string; buildType: string; onCheck: () => void; onInstall: (r: Release) => void; disabled: boolean
}) {
  const again = <Button variant="outline" disabled={disabled} onClick={onCheck}>Check again</Button>
  const notes = (r: Release, text: string) => <a className="underline underline-offset-2" href={r.page} target="_blank" rel="noreferrer">{text}</a>
  let body: ReactNode
  if (release === null) body = <p className="m-0 text-sm text-muted-foreground">Checking GitHub for updates…</p>
  else if (release === 'error') {
    body = <Row label="Couldn't check for updates" hint="GitHub didn't answer. This device needs internet access to check.">{again}</Row>
  } else {
    const cmp = compareVersions(release.version, installed)
    const missing = !release.file && (
      <>The release has no file for {buildType} (…_{release.version}_{buildType}.bin). Download one from the {notes(release, 'release page')} and install it below.</>
    )
    if (cmp > 0) {
      body = (
        <Row label={<span className="font-medium text-primary">{release.version} is available</span>}
          hint={missing || <>Downloads {release.file!.name} ({mb(release.file!.size)}) from GitHub and installs it. Settings, presets and this interface stay as they are. {notes(release, 'What\'s new')}</>}>
          {release.file && <Button disabled={disabled} onClick={() => onInstall(release)}>Update to {release.version}</Button>}
        </Row>
      )
    } else if (cmp === 0) {
      body = (
        <Row label={<span className="flex items-center gap-1.5"><Check className="size-4 text-ok" aria-hidden />Up to date</span>}
          hint={<>{release.version} is the latest release. {notes(release, 'Release notes')}</>}>
          {again}
        </Row>
      )
    } else {
      body = (
        <Row label="Newer than the latest release" hint={missing || <>The latest release is {release.version}. {notes(release, 'Release notes')}</>}>
          {release.file && <Button variant="outline" disabled={disabled} onClick={() => onInstall(release)}>Install {release.version}</Button>}
        </Row>
      )
    }
  }
  return <div className="border-t pt-3">{body}</div>
}

// A file chooser row: the chosen file's name and size under the label, Choose… on the right.
function FilePick({ label, hint, file, onPick }: { label: string; hint: string; file: File | null; onPick: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <Row label={label} hint={<span className="break-all">{file ? `${file.name} · ${mb(file.size)}` : hint}</span>}>
      {/* no accept=".bin": the stock page leaves it out because it stops uploads from the Android app */}
      <input ref={input} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f) }} />
      <Button variant="outline" onClick={() => input.current?.click()}>{file ? 'Change…' : 'Choose…'}</Button>
    </Row>
  )
}

// ESP32 and ESP32-S2 only; folded away, since a wrong bootloader keeps the light from starting.
function Bootloader({ sha, failure, disabled, onInstall }: { sha?: string; failure: ReactNode; disabled: boolean; onInstall: (f: File) => void }) {
  // it's shown again after installing, open if that failed
  const [open, setOpen] = useState(!!failure)
  const [file, setFile] = useState<File | null>(null)
  return (
    <Section title="Bootloader" action={
      <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Show'}<ChevronDown className={open ? 'rotate-180' : undefined} />
      </Button>
    }>
      {!open && <p className="m-0 text-xs text-muted-foreground">For advanced use. Most updates don't need a new bootloader.</p>}
      {open && (
        <>
          {sha && (
            <Row label="Current bootloader" stack hint="SHA-256">
              <span className="font-mono text-xs break-all select-all">{sha}</span>
            </Row>
          )}
          <Alert variant="destructive"><AlertDescription>Only install a verified ESP32 bootloader. A wrong one keeps the light from starting, and it then has to be flashed over USB.</AlertDescription></Alert>
          <FilePick label="Bootloader file" hint="A .bin file" file={file} onPick={setFile} />
          {failure}
          <div className="flex justify-end">
            <Button variant="outline" disabled={!file || disabled} onClick={() => { if (file) { onInstall(file); setFile(null) } }}>Install bootloader…</Button>
          </div>
        </>
      )}
    </Section>
  )
}
