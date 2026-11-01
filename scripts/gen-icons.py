"""Draws the app icon (orange power symbol on the zinc background) as PNGs in public/.

No image libraries needed: each pixel's coverage comes from signed distances to the glyph's
strokes, which gives smooth edges. Run with `python3 scripts/gen-icons.py`.
"""
import math, os, struct, zlib

BG = (9, 9, 11)        # zinc-950, the dark theme background
FG = (255, 159, 67)    # #ff9f43, the theme orange
SIZES = {'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180}

def coverage(x, y, s):
    # lucide "power" geometry on a 24-unit grid, scaled to fill ~58% of the icon (safe for round masks)
    k = s * 0.58 / 24
    ox = oy = s * 0.21
    u, v = (x - ox) / k, (y - oy) / k
    half = 1.15  # stroke half-width in grid units
    # vertical line from (12,3) to (12,12)
    vy = min(max(v, 3), 12)
    d_line = math.hypot(u - 12, v - vy)
    # arc centred at (12,13) with radius 8, open at the top (-45°..225° measured from +x, going down)
    ang = math.degrees(math.atan2(v - 13, u - 12)) % 360
    if 225 < ang < 315:  # the gap at the top: distance to the nearer arc end
        ends = [(12 + 8 * math.cos(math.radians(a)), 13 + 8 * math.sin(math.radians(a))) for a in (225, 315)]
        d_arc = min(math.hypot(u - ex, v - ey) for ex, ey in ends)
    else:
        d_arc = abs(math.hypot(u - 12, v - 13) - 8)
    d = (min(d_line, d_arc) - half) * k  # in pixels, negative inside the stroke
    return min(max(0.5 - d, 0), 1)

def png(path, s):
    rows = []
    for y in range(s):
        row = bytearray(b'\x00')
        for x in range(s):
            a = coverage(x + 0.5, y + 0.5, s)
            row += bytes(round(b + (f - b) * a) for b, f in zip(BG, FG))
        rows.append(bytes(row))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', s, s, 8, 2, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

out = os.path.join(os.path.dirname(__file__), '..', 'public')
for name, s in SIZES.items():
    png(os.path.join(out, name), s)
    print(name, s, os.path.getsize(os.path.join(out, name)), 'bytes')
