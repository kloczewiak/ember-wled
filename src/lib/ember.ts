// Which Ember build this is: its start page hands over the hash that ties it to ui.bin (boot/index.html).
// Undefined when running from the dev server.
export const emberBuildId = () => (window as unknown as { __EMBER__?: { build: string } }).__EMBER__?.build

export const emberBuild = () => {
  const id = emberBuildId()
  return id ? `Ember · build ${id}` : 'Ember · development'
}
