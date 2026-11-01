export type RGB = { r: number; g: number; b: number }
export type HSV = { h: number; s: number; v: number } // h 0-360, s/v 0-100

export function hsvToRgb({ h, s, v }: HSV): RGB {
  s /= 100; v /= 100
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))))
  }
  return { r: f(5), g: f(3), b: f(1) }
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? (d / max) * 100 : 0, v: max * 100 }
}

export const toHex = ({ r, g, b }: RGB) => [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()

export function fromHex(hex: string): RGB | null {
  const m = hex.replace(/^#/, '').match(/^([0-9a-f]{6})/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 }
}

export const rgbCss = ({ r, g, b }: RGB) => `rgb(${r},${g},${b})`

// Colour temperature approximation (Tanner Helland / Neil Bartlett), the same model iro.js uses in the stock UI.
export function kelvinToRgb(kelvin: number): RGB {
  const t = kelvin / 100
  let r: number, g: number, b: number
  if (t < 66) {
    r = 255
    g = -155.25485562709179 - 0.44596950469579133 * (t - 2) + 104.49216199393888 * Math.log(t - 2)
    b = t < 20 ? 0 : -254.76935184120902 + 0.8274096064007395 * (t - 10) + 115.67994401066147 * Math.log(t - 10)
  } else {
    r = 351.97690566805693 + 0.114206453784165 * (t - 55) - 40.25366309332127 * Math.log(t - 55)
    g = 325.4494125711974 + 0.07943456536662342 * (t - 50) - 28.0852963507957 * Math.log(t - 50)
    b = 255
  }
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v)))
  return { r: c(r), g: c(g), b: c(b) }
}

// Inverse of kelvinToRgb by binary search on the blue/red ratio.
export function rgbToKelvin({ r, b }: RGB): number {
  let lo = 1900, hi = 40000, k = 6550
  for (let i = 0; i < 20; i++) {
    k = (lo + hi) / 2
    const c = kelvinToRgb(k)
    if (c.b / c.r >= b / Math.max(r, 1)) hi = k
    else lo = k
  }
  return Math.round(k)
}

// Perceived brightness, for choosing black or white text on a colour.
export const luma = ({ r, g, b }: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b
