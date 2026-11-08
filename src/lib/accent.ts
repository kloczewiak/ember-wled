import type { RGB } from './color'

// The accent colour (Settings → User interface): shadcn's --primary and the text drawn on it. The picked
// colour keeps its hue and chroma; its lightness is clamped so the accent stays visible on the dark
// background and text on it stays readable.

export const DEFAULT_ACCENT = 'FF9F43'

const L_MIN = 0.65
const L_MAX = 0.85

// sRGB (0-255) to OKLCH (Björn Ottosson's OKLab)
function oklch({ r, g, b }: RGB) {
  const lin = (v: number) => {
    v /= 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { L, C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

export function accentVars(rgb: RGB) {
  const { L, C, H } = oklch(rgb)
  const l = Math.min(L_MAX, Math.max(L_MIN, L))
  const f = (n: number) => n.toFixed(3)
  return {
    primary: `oklch(${f(l)} ${f(C)} ${f(H)})`,
    // dark text on light accents (like the default orange's), white on the rest
    foreground: l >= 0.72 ? `oklch(0.189 0.026 ${f(H)})` : 'oklch(0.985 0 0)',
    // how the colour shown differs from the one picked
    adjusted: Math.abs(l - L) < 0.005 ? null : l > L ? ('lighter' as const) : ('darker' as const),
  }
}

// Sets the accent on the page; the default leaves index.css's own values.
export function applyAccent(rgb: RGB | null) {
  const s = document.documentElement.style
  if (!rgb) {
    s.removeProperty('--primary')
    s.removeProperty('--primary-foreground')
    return
  }
  const v = accentVars(rgb)
  s.setProperty('--primary', v.primary)
  s.setProperty('--primary-foreground', v.foreground)
}
