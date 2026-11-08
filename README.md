# Ember for WLED

Ember is a new interface for [WLED](https://kno.wled.ge) lights. It replaces WLED's main page and most of its settings with a cleaner, easier app that runs right on the light: no extra hardware, account or cloud service.

Ember isn't part of the WLED project. It's a separate interface that talks to WLED the same way WLED's own interface does, and it leaves your firmware alone.

<!-- Screenshots go here: the main page on a phone and on a desktop, and a settings page. -->

## Why use Ember

- **A cleaner, modern interface.** A design that's comfortable on a phone and on a desktop, with a layout made for each.
- **What you see is what the light does.** The strip preview shows each effect in its real colours, and controls only appear when the current effect actually uses them.
- **Settings you can understand.** Options are explained in plain language and only show up when they apply to your hardware. Presets are picked by name and pins from a map, instead of typed in as numbers.
- **Hardware setup without guesswork.** See how your LED outputs are laid out, how much current they draw compared with your power supply, and which pins are free. Problems are pointed out before you save.
- **Instant navigation.** Controls and settings are one app, so switching between them is instant, with no page reloading in between. Add it to your phone's home screen to use it like a regular app.

It also has an editor for custom palettes with a live preview on the strip, and installs new WLED releases for you from the settings, with progress and a check that the light came back.

**Easy to try, easy to remove.** Ember is two files on the light. Installing it doesn't change your firmware, settings, presets or palettes, and you can remove it from the settings at any time to go back to WLED's own interface.

## Requirements

- **WLED 16.0.1.** Ember is built and tested for this release. On another version it warns you first and lets you open it anyway.
- **About 300 kB free** on the light's file system.
- **A recent browser:** Safari 16.4, Firefox 113, Chrome 80 or newer (or anything based on them).

Ember is developed on an ESP32. The ESP8266 hasn't been tested yet.

The first time you open Ember on a phone or computer, it takes a few seconds longer than WLED's own interface, because the whole app is downloaded once and kept on that device. After that it opens as quickly as WLED's interface does.

## Installing

1. Get Ember's files, `index.htm.gz` and `ui.bin`, from a release.
2. Open the light's file editor at `http://<your light>/edit`.
3. Upload `ui.bin` first, then `index.htm.gz`.
4. Open `http://<your light>/`. Ember starts.

To add Ember to your phone's home screen with its own icon, also upload `manifest.json`, `icon-192.png`, `icon-512.png` and `apple-touch-icon.png` from the release.

If the light has a settings PIN, the file editor only says "Access Denied" until you unlock it: enter the PIN in WLED's settings first, at `http://<your light>/settings/sec`. It stays unlocked for 15 minutes.

## Updating

Upload the new `ui.bin`, then the new `index.htm.gz`, the same way. Each phone or computer picks up the new version the next time it opens Ember.

The two files always come as a pair from the same version. If they don't match, Ember says so instead of starting.

## Removing

Open **Settings → Security and updates → Remove Ember**. Ember deletes its files and the light shows WLED's own interface again.

If Ember won't open at all, delete `index.htm.gz` and `ui.bin` in the file editor (`http://<your light>/edit`), plus `manifest.json` and the icons if you uploaded them. Ember's start screen also has a **Remove Ember** button whenever something's wrong.

Removing Ember keeps your settings, presets and palettes.

## What's still WLED's own

A few pages aren't part of Ember yet and open WLED's own versions: 2D setup, usermods and DMX output, as well as the file editor and WLED's other built-in tools. The goal is to replace them all over time.

## Troubleshooting

- **The "Ember was built for WLED …" warning.** The light runs a different WLED version than the one Ember was tested with. Ember may still work fine: choose **Try opening Ember**, and tick "Don't show this again" to stop being asked. If something doesn't work, use **Remove Ember**, or install an Ember version built for your WLED version.
- **"Ember can't start: its start page (index.htm.gz) and app file (ui.bin) come from different builds."** Upload both files from the same release.
- **"Ember can't start: its app file (ui.bin) isn't on this light."** Upload `ui.bin` again.
- **"This browser is too old to run Ember."** Update the browser, or use another device.
- **Firmware updates** keep Ember installed. A factory reset erases it along with everything else.
- **Starting fresh on one device:** clearing the site data for the light's address in your browser removes Ember's saved copy there, and it's downloaded again on the next visit.

## Privacy

Ember runs entirely in your browser and talks only to your light, except for a few features that need the internet:

- **WLED updates:** opening Settings → Firmware update asks GitHub for the latest WLED release, and installing one downloads it through WLED's download server.
- **"Get location"** for sunrise and sunset times opens WLED's location page.
- **The palette collection**, when you start a new palette from it, is downloaded from WLED's website.

WLED's own interface uses the same services for the same features. Ember doesn't collect or send anything else.

## Building it yourself

See [DEVELOPMENT.md](DEVELOPMENT.md).

## Licence

Not chosen yet.
