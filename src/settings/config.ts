import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { loadCfg, type Cfg } from './api'
import { useDraft } from './shared'

// The light's config (/json/cfg), shared by the settings menu and pages so switching pages shows it at
// once. It's refreshed in the background whenever a page opens, since it can change outside this screen
// (the firmware's own pages, another browser, a reboot).

export const useCfg = create<{ cfg: Cfg | null; error: boolean }>(() => ({ cfg: null, error: false }))

let inflight: Promise<void> | null = null

// Fetches the config; calls while a request is running share it.
export function refreshCfg(): Promise<void> {
  inflight ??= loadCfg()
    .then((cfg) => useCfg.setState({ cfg, error: false }))
    .catch(() => {
      if (!useCfg.getState().cfg) useCfg.setState({ error: true })
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

// A settings page's form over the shared config: it starts from the cached config, refreshes it when the
// page opens, and takes newer values from the light unless you're in the middle of editing.
export function useCfgForm<T>(toForm: (cfg: Cfg) => T) {
  const cfg = useCfg((s) => s.cfg)
  const error = useCfg((s) => s.error)
  const [loaded, setLoaded] = useState<T | null>(() => (cfg ? toForm(cfg) : null))
  const [seen, setSeen] = useState(cfg)
  // set after a save, so the form takes what the light stored even though it differs from the old values
  const [adoptNext, setAdoptNext] = useState(false)
  const form = useDraft(loaded)
  if (cfg !== seen) {
    setSeen(cfg)
    if (cfg && (!form.dirty || adoptNext)) {
      setLoaded(toForm(cfg))
      setAdoptNext(false)
    }
  }
  useEffect(() => {
    refreshCfg()
  }, [])
  return {
    ...form,
    cfg,
    error,
    retry: refreshCfg,
    reloadAfterSave: () => {
      setAdoptNext(true)
      return refreshCfg()
    },
  }
}
