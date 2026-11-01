import { create } from 'zustand'

// Local UI preferences and selections that are not part of the device state.

type ColorMode = 'wheel' | 'hsv' | 'rgb'

interface Ui {
  csel: number // selected color slot (0-2)
  colorMode: ColorMode
  sheet: null | 'more'
  setCsel: (i: number) => void
  setColorMode: (m: ColorMode) => void
  setSheet: (s: Ui['sheet']) => void
}

const read = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

// Settings → User Interface (a firmware page) saves its options under `wledUiCfg` in this origin's
// localStorage, for the stock UI. The ones that apply here are read on load: that page is a separate
// navigation, so coming back from it reloads the app.
interface StockComp { pid: boolean; fxdef: boolean; on: number; off: number; seglen: boolean; segpwr: boolean; segexp: boolean; idsort: boolean }
const STOCK_DEFAULTS: StockComp = { pid: true, fxdef: true, on: 0, off: 0, seglen: false, segpwr: false, segexp: false, idsort: false }
function stockUiCfg(): StockComp {
  try {
    const comp = JSON.parse(localStorage.getItem('wledUiCfg') ?? '{}')?.comp ?? {}
    return { ...STOCK_DEFAULTS, ...comp, on: Number(comp.on) || 0, off: Number(comp.off) || 0 }
  } catch { return STOCK_DEFAULTS }
}
export const stockCfg = stockUiCfg()

export const useUi = create<Ui>((set) => ({
  csel: 0,
  colorMode: read('wledUiColorMode', 'wheel') as ColorMode,
  sheet: null,
  setCsel: (csel) => set({ csel }),
  setColorMode: (colorMode) => {
    try { localStorage.setItem('wledUiColorMode', colorMode) } catch { /* ignore */ }
    set({ colorMode })
  },
  setSheet: (sheet) => set({ sheet }),
}))
