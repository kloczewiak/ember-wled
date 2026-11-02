# Effect colours on the Default palette

`fxcolors.ts` says how each effect looks when its segment's palette is **Default** (palette 0). The segment
bar (`segfill.ts`) uses it to draw a segment in roughly the colours its LEDs show, without streaming the live
colours like Peek does.

Default isn't a real palette. The firmware resolves it each time an effect asks for a colour, and effects ask
in different ways (`wled00/FX.cpp`, `wled00/FX_fcn.cpp`):

- `color_from_palette(…, mcol)` with `mcol` 0–2 returns the segment's colour 1–3 on palette 0. Most effects
  do this, so the default for an unlisted effect is **colour 1**.
- `color_from_palette(…, 255)`, or using the palette directly (`SEGPALETTE`, `_currentPalette`), gets the
  effect's own default palette: `pal=N` in its metadata, or Party Colors (6) when it has none. → `'palette'`
- `color_wheel()` on palette 0 is the hue wheel, a full rainbow. → `'rainbow'`
- Some effects check `SEGMENT.palette == 0` themselves and use their own colours. → `'colors'` or fixed
  colours.

The file only matters for palette 0. With any other palette selected, the bar shows that palette. Each effect
is described with its default options; a few look different with other options (see the list in the root
`TODO.md`).

## After every firmware update

The table is written by hand from the firmware source, so it has to be checked whenever the firmware changes.

1. Check out the new release in `../wled-firmware` (a release tag, not the dev branch).
2. Run `npm run audit:fx-colors`. It lists, per effect, where its colours come from (`wheel`,
   `palAlways`, `palColour`, `palVariable`, `segcolor`, `palBranch`), including what the helpers it calls
   do, in four groups: hue-wheel candidates, always-palette candidates, effects whose `mcol` is computed, and
   effects that check for palette 0 themselves.
3. Go through the candidates in the code and compare them with the table. The script can't see conditions,
   so read each one with the effect's default options in mind:
   - `color_wheel` only under `if (SEGMENT.palette)`, a check option or a random-colour mode doesn't make the
     effect a rainbow on palette 0 (Wipe, Dissolve, Chase, Bouncing Balls, Sinelon and Fireworks 1D in
     v16.0.1).
   - A `255` palette call that only runs with an option on doesn't make it a palette effect (Meteor uses
     `mcol` 0 unless Smooth is on).
   - An effect that checks for palette 0 itself often uses its own colours there: hue colours (Juggle, Color
     Clouds), colours 1-3 (Popcorn, the Balls effects) or a built-in palette (Pacifica).
4. Update the table, set `FX_COLORS_FIRMWARE` to the release you checked, and update the version in
   `README.md` (Firmware-specific data).
