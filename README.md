# WLED UI

A replacement for WLED's main control page, built with React, Vite and Tailwind. It talks to the device's
JSON API and WebSocket, the same way the stock UI does, and builds into a single gzipped file that the ESP
serves from its own filesystem.

## Development

```bash
npm install
npm run dev:mock      # fake device in the dev server (mock/plugin.ts), no hardware needed
npm run dev           # proxies API calls to a real device
WLED_HOST=192.168.1.42 npm run dev
```

`npm run dev` defaults to `wled-filip.local`. mDNS names can be slow or fail to resolve from Node, so set
`WLED_HOST` to the device's IP if the proxy times out (`.claude/launch.json` does this for the preview). `npm run gen:fixtures` refreshes the mock's effect and palette
lists from `../wled-firmware/wled00`.

## Putting it on the device

```bash
npm run build         # writes dist/index.htm.gz
```

Open `http://<device>/edit`, upload `dist/index.htm.gz` to the filesystem root and reload `http://<device>/`.
WLED serves files on its filesystem in place of its built-in pages, so this UI replaces the stock one at `/`
while Settings, Update, `/cpal.htm` and the rest stay the firmware's own pages.
Firmware OTA updates keep the file; a filesystem reset removes it. To go back to the stock UI, delete
`/index.htm.gz` in the file editor.

## Layout

- `src/store.ts`: connection (WebSocket with HTTP fallback), loading, live view, toasts
- `src/api/`: API types, the effect metadata parser, and the command merge used for optimistic updates
- `src/components/`: one panel per section (Color, Palette, Effect, Segments, Presets, More sheet)
- `mock/`: the fake device used by `npm run dev:mock`
