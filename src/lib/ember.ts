// Ember's version (package.json) and which build this is: the start page hands over the hash that ties it to
// ui.bin (boot/index.html). The hash is undefined when running from the dev server.
export const EMBER_VERSION = __EMBER_VERSION__
export const emberBuildId = () => (window as unknown as { __EMBER__?: { build: string } }).__EMBER__?.build

export const emberBuild = () => `Ember ${EMBER_VERSION} · ${emberBuildId() ?? 'development'}`
