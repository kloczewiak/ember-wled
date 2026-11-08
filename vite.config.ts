import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { mockWled } from './mock/plugin'

// `npm run dev` proxies API calls to a real device (WLED_HOST, default wled-filip.local);
// `npm run dev:mock` serves a fake device from mock/plugin.ts instead.
const host = process.env.WLED_HOST ?? 'wled-filip.local'
const mock = process.env.WLED_MOCK === '1'

// The light gets two files (see boot/index.html): index.htm.gz, the small start page WLED serves at /, and
// ui.bin, the app (gzip of its CSS, a NUL and its JS, taken from the single-file build). The start page carries
// the hash of ui.bin, so the two only work as a pair, and the WLED version this build targets: the firmware
// checkout's (../wled-firmware), or WLED_VERSION.
const fnv = (bytes: Uint8Array) => {
  let h = 0x811c9dc5
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}
function emberOutput(): Plugin {
  return {
    name: 'ember-output',
    apply: 'build',
    closeBundle() {
      const dist = (f: string) => resolve(__dirname, 'dist', f)
      const html = readFileSync(dist('index.html'), 'utf8')
      const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
      const js = /<script type="module"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1]
      if (!js) throw new Error('ember-output: no inline module script in dist/index.html')
      const bin = gzipSync(Buffer.from(`${css}\0${js}`, 'utf8'), { level: 9 })
      const hash = fnv(bin)
      writeFileSync(dist('ui.bin'), bin)

      const wled =
        process.env.WLED_VERSION ??
        (JSON.parse(readFileSync(resolve(__dirname, '../wled-firmware/package.json'), 'utf8')).version as string)
      const boot = readFileSync(resolve(__dirname, 'boot/index.html'), 'utf8')
        .replaceAll('__EMBER_HASH__', hash)
        .replaceAll('__EMBER_WLED__', wled)
        .replaceAll('__EMBER_SIZE__', String(bin.length))
      const bootGz = gzipSync(Buffer.from(boot, 'utf8'), { level: 9 })
      writeFileSync(dist('index.htm.gz'), bootGz)
      console.log(
        `Ember ${hash} for WLED ${wled}: index.htm.gz ${(bootGz.length / 1024).toFixed(1)} kB, ui.bin ${(bin.length / 1024).toFixed(1)} kB`,
      )
    },
  }
}

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  plugins: [react(), tailwindcss(), viteSingleFile(), emberOutput(), ...(mock ? [mockWled()] : [])],
  server: mock
    ? undefined
    : {
        proxy: {
          ...Object.fromEntries(
            [
              '/json',
              '/presets.json',
              '/cfg.json',
              '/upload',
              '/reset',
              '/win',
              '/edit',
              '/settings',
              '/update',
              '/cpal.htm',
              '/pixelforge.htm',
            ].map((p) => [p, { target: `http://${host}`, changeOrigin: true }]),
          ),
          // custom palette files (palette0.json, palette1.json, …)
          '^/palette\\d+\\.json$': { target: `http://${host}`, changeOrigin: true },
          '/ws': { target: `ws://${host}`, ws: true, changeOrigin: true },
        },
      },
})
