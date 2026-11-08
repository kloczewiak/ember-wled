import { create } from 'zustand'
import { applyAccent, DEFAULT_ACCENT } from './lib/accent'
import { fromHex, toHex } from './lib/color'

// Local UI preferences and selections that are not part of the device state.

type ColorMode = 'wheel' | 'hsv' | 'rgb'

interface Ui {
  csel: number // selected color slot (0-2)
  colorMode: ColorMode
  sheet: null | 'more'
  setCsel: (i: number) => void
  setColorMode: (m: ColorMode) => void
  setSheet: (s: Ui['sheet']) => void
  stock: StockComp // the stock UI settings this UI follows (see below)
  setStockCfg: (cfg: Json) => void // stores the whole wledUiCfg object and applies it at once
  accuratePeek: boolean // Peek shows the colours as the LEDs get them (lib/ledoutput.ts)
  setAccuratePeek: (on: boolean) => void
  accent: string // accent colour as RRGGBB (lib/accent.ts)
  setAccent: (hex: string) => void
}

const read = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

// Settings → User Interface (a firmware page) saves its options under `wledUiCfg` in this origin's
// localStorage, for the stock UI. The ones that apply here are read on load: that page is a separate
// navigation, so coming back from it reloads the app.
//
// That page builds its form from the stored object and has no defaults of its own; the stock main page
// writes them on every load (index.js). Since this UI replaces the stock page, it writes them too, or a
// fresh storage (e.g. an iOS home-screen app) gets an empty, unusable settings page.
const STOCK_UI_DEFAULTS = {
  theme: {
    base: 'dark',
    bg: { url: '', rnd: false, rndGrayscale: false, rndBlur: false },
    alpha: { bg: 0.6, tab: 0.8 },
    color: { bg: '' },
  },
  comp: {
    colors: { picker: true, rgb: false, quick: true, hex: false },
    labels: true,
    pcmbot: false,
    pid: true,
    seglen: false,
    segpwr: false,
    segexp: false,
    css: true,
    hdays: false,
    fxdef: true,
    on: 0,
    off: 0,
    idsort: false,
  },
}

export type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)
// saved values win over defaults, nested objects are merged (like the stock UI's mergeDeep)
function mergeDeep(defaults: Json, saved: unknown): Json {
  if (!isObj(saved)) return structuredClone(defaults)
  const out: Json = { ...saved }
  for (const [k, v] of Object.entries(defaults))
    out[k] = isObj(v) ? mergeDeep(v, saved[k]) : k in saved ? asDefaultType(v, saved[k]) : v
  return out
}
// The stock settings page saves its number fields as strings (settings_ui.htm stores each input's .value),
// so "0" or "0.6" are read back as numbers where the default is one.
function asDefaultType(def: unknown, value: unknown) {
  return typeof def === 'number' && typeof value === 'string' && value.trim() !== '' && isFinite(Number(value))
    ? Number(value)
    : value
}

// The full stock UI settings object (saved values over defaults), for Settings → User interface.
export function readStockUiCfg(): Json {
  let saved: unknown = null
  try {
    saved = JSON.parse(localStorage.getItem('wledUiCfg') ?? 'null')
  } catch {
    /* corrupt: replaced by defaults */
  }
  return mergeDeep(STOCK_UI_DEFAULTS, saved)
}
export function writeStockUiCfg(cfg: Json) {
  localStorage.setItem('wledUiCfg', JSON.stringify(cfg))
}

export interface StockComp {
  pid: boolean
  fxdef: boolean
  on: number
  off: number
  seglen: boolean
  segpwr: boolean
  segexp: boolean
  idsort: boolean
}
function stockUiCfg(): StockComp {
  const cfg = readStockUiCfg()
  try {
    writeStockUiCfg(cfg)
  } catch {
    /* storage unavailable */
  }
  return toComp(cfg)
}
function toComp(cfg: Json): StockComp {
  const comp = cfg.comp as Json
  return {
    pid: comp.pid !== false,
    fxdef: comp.fxdef !== false,
    seglen: comp.seglen === true,
    segpwr: comp.segpwr === true,
    segexp: comp.segexp === true,
    idsort: comp.idsort === true,
    on: Number(comp.on) || 0,
    off: Number(comp.off) || 0,
  }
}

// shows an accent on the page (the settings page also previews unsaved ones with it)
export const showAccent = (hex: string) => applyAccent(hex === DEFAULT_ACCENT ? null : fromHex(hex))
const storedAccent = fromHex(read('wledUiAccent', ''))
const accent = storedAccent ? toHex(storedAccent) : DEFAULT_ACCENT
showAccent(accent)

export const useUi = create<Ui>((set) => ({
  csel: 0,
  colorMode: read('wledUiColorMode', 'wheel') as ColorMode,
  sheet: null,
  setCsel: (csel) => set({ csel }),
  setColorMode: (colorMode) => {
    try {
      localStorage.setItem('wledUiColorMode', colorMode)
    } catch {
      /* ignore */
    }
    set({ colorMode })
  },
  setSheet: (sheet) => set({ sheet }),
  stock: stockUiCfg(),
  setStockCfg: (cfg) => {
    writeStockUiCfg(cfg) // throws if storage is unavailable; the caller reports it
    set({ stock: toComp(cfg) })
  },
  // on unless turned off: no key yet (a new device, or one that only used the stock UI) or storage that can't be
  // read means on; '0', or '' from builds that stored off that way, means off
  accuratePeek: !['0', ''].includes(read('wledUiAccuratePeek', '1')),
  setAccuratePeek: (accuratePeek) => {
    localStorage.setItem('wledUiAccuratePeek', accuratePeek ? '1' : '0') // throws if storage is unavailable; the caller reports it
    set({ accuratePeek })
  },
  accent,
  setAccent: (accent) => {
    localStorage.setItem('wledUiAccent', accent === DEFAULT_ACCENT ? '' : accent) // throws if storage is unavailable; the caller reports it
    showAccent(accent)
    set({ accent })
  },
}))
