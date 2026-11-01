"""Draws the app icon (a glowing orange light bulb on the zinc background) as PNGs in public/.

No image libraries needed: each pixel's coverage comes from its distance to the glyph's strokes,
which gives smooth edges. Run with `python3 scripts/gen-icons.py` (or `npm run gen:icons`).
"""
import math, os, struct, zlib

BG = (9, 9, 11)        # zinc-950, the dark theme background
FG = (255, 159, 67)    # #ff9f43, the theme orange
SIZES = {'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180}

# Bulb on a 24-unit grid (y points down), in the style of lucide's line icons.
CX, CY, R = 12, 9, 6.5          # the glass: a circle open at the bottom
GAP = (50, 130)                 # degrees (90 = straight down) where the glass meets the neck
HALF = 1.15                     # stroke half-width in grid units
def arc_point(a): return (CX + R * math.cos(math.radians(a)), CY + R * math.sin(math.radians(a)))
LEFT, RIGHT = arc_point(GAP[1]), arc_point(GAP[0])
SEGMENTS = [
    (LEFT, (9, 17)), (RIGHT, (15, 17)),  # neck
    ((9, 17), (15, 17)),                 # top of the screw base
    ((9.5, 20), (14.5, 20)),             # base rings
    ((10.75, 23), (13.25, 23)),
]

def seg_dist(u, v, a, b):
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(u - ax - t * dx, v - ay - t * dy)

def arc_dist(u, v):
    ang = math.degrees(math.atan2(v - CY, u - CX)) % 360
    if GAP[0] < ang < GAP[1]:  # inside the opening: distance to the nearer end of the arc
        return min(math.hypot(u - px, v - py) for px, py in (LEFT, RIGHT))
    return abs(math.hypot(u - CX, v - CY) - R)

def pixel(x, y, s):
    k = s * 0.6 / 24           # glyph fills ~60% of the icon, safe for round and squircle masks
    o = s * 0.2 - 0.5 * k      # centre the glyph (it spans y 2.5..23) on the icon
    u, v = (x - s * 0.2) / k, (y - o) / k
    # soft glow behind the glass, so the bulb reads as lit
    g = max(0.0, 1 - math.hypot(u - CX, v - CY) / 11) ** 2 * 0.32
    d = (min(arc_dist(u, v), *(seg_dist(u, v, a, b) for a, b in SEGMENTS)) - HALF) * k
    a = max(g, min(max(0.5 - d, 0), 1))
    return bytes(round(b + (f - b) * a) for b, f in zip(BG, FG))

def png(path, s):
    rows = [b'\x00' + b''.join(pixel(x + 0.5, y + 0.5, s) for x in range(s)) for y in range(s)]
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', s, s, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

out = os.path.join(os.path.dirname(__file__), '..', 'public')
for name, s in SIZES.items():
    png(os.path.join(out, name), s)
    print(name, s, os.path.getsize(os.path.join(out, name)), 'bytes')
