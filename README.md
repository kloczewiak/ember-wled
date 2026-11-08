# Ember for WLED

Ember is a replacement for WLED's main control page, built with React, Vite and Tailwind. It talks to the
device's JSON API and WebSocket, the same way the stock UI does, and is served by the ESP from its own
filesystem. It isn't part of the WLED project.

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
npm run build         # writes dist/index.htm.gz and dist/ui.bin
```

Open `http://<device>/edit` and upload `dist/ui.bin`, then `dist/index.htm.gz`, to the filesystem root (in
that order, so nobody gets a new start page with an old app), and reload `http://<device>/`. To make it
installable as an app ("Add to Home Screen"), also upload `dist/manifest.json`, `dist/icon-192.png`,
`dist/icon-512.png` and `dist/apple-touch-icon.png`. `npm run gen:icons` redraws the icons.

The two files only work as a pair:

- `index.htm.gz` is Ember's start page (`boot/index.html`, about 5 kB), which WLED serves at `/`. It shows a
  splash, checks the light's WLED version against the one Ember was built for (`../wled-firmware`'s, or
  `WLED_VERSION`), and starts the app.
- `ui.bin` is the app: gzip of its CSS and JS, sent as plain bytes so the start page can show real progress
  and unpack it in the browser. The start page carries its hash and refuses a `ui.bin` from another build.

Each device keeps a copy of the app (IndexedDB), so later visits start almost instantly and don't download
`ui.bin` again until a new build is uploaded. On another WLED version the start page warns first, with
"Try opening Ember" (optionally not asking again for that version and build) and "Remove Ember". Removing
deletes Ember's files through the file editor (asking for the settings PIN if there is one) and the light
goes back to its standard interface.

WLED serves files on its filesystem in place of its built-in pages, so Ember replaces the stock UI at `/`
while `/cpal.htm`, the file editor and the settings pages that aren't rebuilt yet (`PARITY.md`) stay the
firmware's own. Firmware OTA updates keep the files; a filesystem reset removes them. To go back to the stock
UI by hand, delete `/index.htm.gz` in the file editor, or open
`http://<device>/edit?func=delete&path=/index.htm.gz` (with a settings PIN, enter it at
`http://<device>/settings/sec` first).

`npm run preview:mock` serves the built files with the fake device, the way the light does (start page at `/`,
`ui.bin` as plain bytes, deleting files behind the settings PIN). `MOCK_WLED_VER=16.1.0` makes it another WLED
version, and `GET /mock/ui-bin?other=1` makes it serve a `ui.bin` from another build.

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
