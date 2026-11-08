// Ember's version (package.json) and which build this is: the start page hands over the hash that ties it to
// ui.bin (boot/index.html). The hash is undefined when running from the dev server.
export const EMBER_VERSION = __EMBER_VERSION__
export const emberBuildId = () => (window as unknown as { __EMBER__?: { build: string } }).__EMBER__?.build

export const emberBuild = () => `Ember ${EMBER_VERSION} · ${emberBuildId() ?? 'development'}`

// Ember's files on the light, as the start page removes them (boot/index.html): the start page goes last, so a
// removal that stops halfway still leaves a working one
export const EMBER_FILES = [
  '/ui.bin',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/index.htm.gz',
]

// What Ember keeps on this device: the start page's copy of the app and the "don't show again" choice
export function forgetEmber() {
  try {
    localStorage.removeItem('ember-skip-version')
    indexedDB.deleteDatabase('ember')
  } catch {
    // nothing kept, or storage is blocked
  }
}
