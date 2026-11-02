// WLED's estimated current (info.leds.pwr, in mA), shown the same way in the header and the More sheet.
export function formatCurrent(mA: number) {
  return mA >= 1000 ? `${(mA / 1000).toFixed(1)} A` : `${mA} mA`
}
