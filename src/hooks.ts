import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { setLiveFilter, useStore } from './store'
import { useUi } from './ui'
import { refreshCfg, useCfg } from './settings/config'
import { ledModel, ledOutputFrame } from './lib/ledoutput'
import { parseFxMeta } from './api/fxmeta'
import type { Segment } from './api/types'

// The segment the controls act on: the first selected one, or the main segment when none is selected.
// Light capabilities (RGB / white / CCT / 2D) are combined over all selected segments, as in the stock UI.
export function useSelection() {
  const state = useStore((s) => s.state)
  const info = useStore((s) => s.info)
  return useMemo(() => {
    let main: Segment | null = null
    let hasRGB = false, hasWhite = false, hasCCT = false, has2D = false, segLmax = 0
    for (const seg of state?.seg ?? []) {
      const w = seg.stop - seg.start
      const h = seg.stopY !== undefined ? seg.stopY - (seg.startY ?? 0) : 1
      if (w * h > segLmax) segLmax = w * h
      if (seg.sel) {
        if (!main || (main.id === state!.mainseg && !main.sel)) main = seg
        hasRGB ||= !!(seg.lc & 1)
        hasWhite ||= !!(seg.lc & 2)
        hasCCT ||= !!(seg.lc & 4)
        has2D ||= w > 1 && h > 1
      } else if (!main && seg.id === state!.mainseg) main = seg
    }
    if (main && !main.sel) {
      hasRGB = !!(main.lc & 1)
      hasWhite = !!(main.lc & 2)
      hasCCT = !!(main.lc & 4)
      has2D = main.stop - main.start > 1 && (main.stopY !== undefined ? main.stopY - (main.startY ?? 0) : 1) > 1
    }
    const mw = info?.leds.matrix?.w ?? 0
    const mh = info?.leds.matrix?.h ?? 0
    return { main, hasRGB, hasWhite, hasCCT, has2D, segLmax, isMatrix: mw > 0 && mh > 0, mw, mh }
  }, [state, info])
}

export function useFxMeta(fx: number | undefined) {
  const fxdata = useStore((s) => s.fxdata)
  return useMemo(() => parseFxMeta(fx ?? 0, fxdata[fx ?? 0]), [fx, fxdata])
}

export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => matchMedia(query).matches,
  )
}

export function useHash() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return hash
}

// A value that follows `value` but can be edited locally until the next change from outside.
export function useDraft<T>(value: T) {
  const [draft, setDraft] = useState(value)
  const [prev, setPrev] = useState(value)
  if (value !== prev) { setPrev(value); setDraft(value) }
  return [draft, setDraft] as const
}

// Centres a listbox on its selected option once `ready` turns true, scrolling only the list itself.
export function useScrollToSelected<T extends HTMLElement>(ready: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const list = ref.current
    const sel = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !sel) return
    const top = sel.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
    list.scrollTop = top - (list.clientHeight - sel.offsetHeight) / 2
  }, [ready])
  return ref
}

// Accurate Peek: while Peek and the option are on, live frames are turned into what the LEDs really get.
// It needs the light's config (gamma, brightness factor, current limits), loaded when it's turned on.
export function useAccuratePeek() {
  const peek = useStore((s) => s.peek)
  const accurate = useUi((s) => s.accuratePeek)
  const on = peek && accurate
  const cfg = useCfg((s) => s.cfg)
  const bri = useStore((s) => s.state?.bri ?? 0)
  const info = useStore((s) => s.info)
  useEffect(() => { if (on) refreshCfg() }, [on])
  useEffect(() => {
    if (!on || !cfg || !info) return
    const model = ledModel(cfg, bri, info)
    setLiveFilter((frame) => ledOutputFrame(frame, model))
    return () => setLiveFilter(null)
  }, [on, cfg, bri, info])
}
