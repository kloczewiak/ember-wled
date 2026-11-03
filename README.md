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
To make it installable as an app ("Add to Home Screen"), also upload `dist/manifest.json`, `dist/icon-192.png`,
`dist/icon-512.png` and `dist/apple-touch-icon.png`. `npm run gen:icons` redraws the icons.
WLED serves files on its filesystem in place of its built-in pages, so this UI replaces the stock one at `/`
while `/cpal.htm`, the file editor and the settings pages that aren't rebuilt yet (`PARITY.md`) stay the
firmware's own.
Firmware OTA updates keep the file; a filesystem reset removes it. To go back to the stock UI, delete
`/index.htm.gz` in the file editor, or open `http://<device>/edit?func=delete&path=/index.htm.gz` (with a
settings PIN, enter it at `http://<device>/settings/sec` first).

## Firmware-specific data

This UI targets **WLED v16.0.1**, the firmware release checked out in `../wled-firmware`. Some of it is
copied or derived from that firmware's source, so check these after every firmware update:

| What | Last checked against | How to update |
| --- | --- | --- |
| Effect colours on the Default palette (`src/lib/fxcolors.ts`), used by the segment bar | v16.0.1 | Follow `src/lib/fxcolors.md` (`npm run audit:fx-colors` lists what to review) |
| Mock effect and palette lists (`mock/fixtures.json`) | v16.0.1 | `npm run gen:fixtures` |
| Settings pages and the rest of the stock UI's behaviour | v16.0.1 | Diff `wled00/data` and `wled00/set.cpp` against the previous release; gaps go in `PARITY.md` |
| The version the UI says it's built for, e.g. when going back to older firmware (`BUILT_FOR` in `src/lib/firmware.ts`) | v16.0.1 | Set it once the rows above are checked |

## Layout

- `src/store.ts`: connection (WebSocket with HTTP fallback), loading, live view, toasts
- `src/api/`: API types, the effect metadata parser, and the command merge used for optimistic updates
- `src/components/`: one panel per section (Color, Palette, Effect, Segments, Presets, More sheet)
- `src/settings/`: the settings screen (`#settings`). Pages read `/json/cfg` and save by posting the firmware's own
  settings form fields to `/settings/<page>`, so the firmware's handler (`set.cpp`) validates and applies them
- `mock/`: the fake device used by `npm run dev:mock`
