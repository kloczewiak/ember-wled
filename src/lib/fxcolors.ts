// How effects look on the Default palette (palette 0), for the segment bar (lib/segfill.ts).
// Hand-maintained from the firmware source: re-check it after every firmware update, see fxcolors.md.

export const FX_COLORS_FIRMWARE = 'v16.0.1'

type Rgb = [number, number, number]

// rainbow: the hue wheel (Segment::color_wheel)
// palette: the effect's own default palette ("pal=" in its metadata), or Party Colors when it has none
// colors:  the segment's colours 1-3
// Rgb[]:   fixed colours built into the effect
export type DefaultLook = 'rainbow' | 'palette' | 'colors' | Rgb[]

// Effects not listed here show colour 1 on the Default palette, which is what color_from_palette() returns
// for palette 0 with mcol 0-2.
export const DEFAULT_PALETTE_LOOK: Record<number, DefaultLook> = {
  4: 'rainbow', // Wipe Random
  5: 'rainbow', // Random Colors
  7: 'rainbow', // Dynamic
  8: 'rainbow', // Colorloop
  9: 'rainbow', // Rainbow
  14: 'rainbow', // Theater Rainbow
  19: 'rainbow', // Dissolve Rnd
  24: 'rainbow', // Strobe Rainbow
  26: 'rainbow', // Blink Rainbow
  29: 'rainbow', // Chase Random
  30: 'rainbow', // Chase Rainbow
  32: 'rainbow', // Chase Flash Rnd
  33: 'rainbow', // Rainbow Runner
  34: [[255, 0, 0], [238, 187, 0], [0, 238, 0], [0, 119, 204]], // Colorful: its own colours (intensity <= 160)
  36: 'rainbow', // Sweep Random
  38: 'colors', // Aurora: waves pick colour 1, 2 or 3 at random
  39: 'rainbow', // Stream
  64: 'palette', // Juggle
  65: 'rainbow', // Palette: draws with color_wheel(), so palette 0 is the hue wheel
  66: 'palette', // Fire 2012
  74: 'palette', // Colortwinkles
  76: 'palette', // Meteor (with Gradient off)
  78: 'palette', // Railway
  79: 'palette', // Ripple
  80: 'palette', // Twinklefox
  81: 'palette', // Twinklecat
  87: 'palette', // Glitter
  89: 'rainbow', // Fireworks Starburst
  94: 'rainbow', // Sinelon Rainbow
  95: 'colors', // Popcorn: colour 1, 2 or 3 at random (only colour 1 while colour 3 is black)
  99: 'rainbow', // Ripple Rainbow
  // Pacifica: its own ocean palette (pacifica_palette_1)
  101: [[0, 34, 41], [0, 30, 47], [0, 25, 52], [0, 25, 56], [0, 20, 63], [0, 20, 67], [0, 176, 71], [0, 176, 76],
    [0, 0, 79], [0, 0, 84], [0, 0, 98], [0, 0, 111], [0, 0, 122], [0, 0, 133], [71, 147, 138], [100, 208, 142]],
  104: 'palette', // Sunrise
  107: 'palette', // Noise Pal
  110: 'palette', // Flow
  112: 'palette', // Dancing Shadows
  113: 'palette', // Washing Machine
  114: 'palette', // Rotozoomer
  115: 'palette', // Blends
  117: 'rainbow', // Dynamic Smooth
  118: 'palette', // Spaceships
  119: 'palette', // Crazy Bees
  120: 'palette', // Ghost Rider
  123: 'rainbow', // Drift Rose: hue colours on palette 0
  124: 'rainbow', // Distortion Waves: its own RGB colours on palette 0
  125: 'palette', // Soap
  126: 'palette', // Octopus
  127: 'palette', // Waving Cell
  146: 'palette', // Noise2D
  149: 'palette', // Firenoise
  150: 'palette', // Squared Swirl
  152: 'palette', // DNA
  162: 'palette', // Pulser
  164: 'palette', // Drift
  165: 'palette', // Waverly
  167: 'palette', // Colored Bursts
  173: 'palette', // Tartan
  174: 'palette', // Polar Lights
  175: 'palette', // Swirl
  177: 'palette', // Frizzles
  178: 'palette', // Plasma Ball
  179: 'palette', // Flow Stripe
  181: 'palette', // Sindots
  182: 'palette', // DNA Spiral
  183: 'palette', // Black Hole (with option 1 off)
  219: 'palette', // Slow Transition
}
