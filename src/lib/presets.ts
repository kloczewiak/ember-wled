import type { Preset } from '../api/types'

// Playlists first, then names starting with a letter or digit, then the rest (stock UI ordering);
// by ID with "Sort presets by ID" (Settings → User interface).
export const comparePresets =
  (idsort: boolean) =>
  ([ia, a]: [string, Preset], [ib, b]: [string, Preset]) => {
    if (idsort || !a.n || !b.n) return Number(ia) - Number(ib)
    const rank = (p: Preset) => (p.playlist ? '<' : /^[\p{L}\p{N}]/u.test(p.n!) ? '=' : '>')
    return (rank(a) + a.n).localeCompare(rank(b) + b.n, undefined, { numeric: true })
  }
