// Parses an effect's metadata string from /json/fxdata (the part after '@' in the firmware's effect name):
// "sliders;colors;palette;flags;defaults", e.g. "Cooling,Spark rate,,2D Blur,Boost;;!;1;pal=35".
// Rules follow setEffectParameters() in the stock UI (wled00/data/index.js).

export type SliderKey = 'sx' | 'ix' | 'c1' | 'c2' | 'c3'
export type OptionKey = 'o1' | 'o2' | 'o3'

export interface FxMeta {
  sliders: { key: SliderKey; label: string; max: number }[]
  options: { key: OptionKey; label: string }[]
  // label per color slot, or null when the effect doesn't use that slot
  colors: (string | null)[]
  palette: { shown: boolean; label: string }
  flags: string
  usesPalette: boolean
}

const SLIDER_KEYS: SliderKey[] = ['sx', 'ix', 'c1', 'c2', 'c3']
const SLIDER_NAMES = ['Effect speed', 'Effect intensity', 'Custom 1', 'Custom 2', 'Custom 3']
const OPTION_KEYS: OptionKey[] = ['o1', 'o2', 'o3']
const COLOR_NAMES = ['Fx', 'Bg', 'Cs']

const isNumeric = (s: string) => s !== '' && !isNaN(Number(s))
const split = (s: string | undefined) => (s === undefined || s === '' ? [] : s.split(','))

export function parseFxMeta(id: number, raw: string | undefined): FxMeta {
  // the stock UI replaces Solid's metadata with ";!;" (one color, nothing else)
  const str = id === 0 ? ';!;' : (raw ?? '')
  const defined = str.length > 0
  const parts = str === '' ? [] : str.split(';')
  const sl = split(parts[0])
  const co = split(parts[1])
  const pa = split(parts[2])

  const sliders: FxMeta['sliders'] = []
  SLIDER_KEYS.forEach((key, i) => {
    const shown = (!defined && i < (id < 128 ? 2 : 5)) || (sl[i] !== undefined && sl[i] !== '')
    if (!shown) return
    const label = sl[i] && sl[i] !== '!' ? sl[i] : SLIDER_NAMES[i]
    sliders.push({ key, label, max: key === 'c3' ? 31 : 255 })
  })

  const options: FxMeta['options'] = []
  OPTION_KEYS.forEach((key, i) => {
    const v = sl[5 + i]
    if (v !== undefined && v !== '') options.push({ key, label: v !== '!' ? v : `Check ${i + 1}` })
  })

  const colors = [0, 1, 2].map((i) => {
    if (co[i] !== undefined && co[i] !== '') return co[i] !== '!' ? co[i] : COLOR_NAMES[i]
    return defined ? null : `Color ${i + 1}`
  })

  let palLabel = pa[0] ?? ''
  if (palLabel.indexOf('=') > 0) palLabel = palLabel.slice(0, palLabel.indexOf('='))
  const palShown = !defined || (pa.length > 0 && pa[0] !== '' && !isNumeric(pa[0]))

  let flags = parts[3] === undefined || parts[3] === '' ? '1' : parts[3]
  if (id === 0) flags = ''
  const usesPalette = !defined || (pa.length > 0 && pa[0] !== '' && !isNumeric(pa[0]))

  return {
    sliders,
    options,
    colors,
    palette: { shown: palShown, label: palShown && palLabel !== '!' && palLabel !== '' ? palLabel : 'Color palette' },
    flags,
    usesPalette,
  }
}
