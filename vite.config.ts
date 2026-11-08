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

// WLED serves /index.htm from its filesystem (gzipped if index.htm.gz exists), so emit that next to index.html.
function wledOutput(): Plugin {
  return {
    name: 'wled-output',
    apply: 'build',
    closeBundle() {
      const html = readFileSync(resolve(__dirname, 'dist/index.html'))
      const gz = gzipSync(html, { level: 9 })
      writeFileSync(resolve(__dirname, 'dist/index.htm.gz'), gz)
      console.log(
        `index.htm.gz: ${(gz.length / 1024).toFixed(1)} kB (${(html.length / 1024).toFixed(1)} kB uncompressed)`,
      )
    },
  }
}

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  plugins: [react(), tailwindcss(), viteSingleFile(), wledOutput(), ...(mock ? [mockWled()] : [])],
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
