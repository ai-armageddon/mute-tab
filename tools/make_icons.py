#!/usr/bin/env python3
"""Render the Mute Tab toolbar icons.

Draws a speaker glyph (plus sound waves, or a cancellation slash) into
supersampled RGBA buffers and writes them out as PNGs. No third party
dependencies so the icons can be regenerated anywhere.

Usage: python3 tools/make_icons.py
"""

import math
import os
import struct
import zlib

BLUE = (0x4C, 0x8D, 0xFF)
RED = (0xEF, 0x44, 0x44)

# All geometry is in a 0..1 square, y pointing down.
SPEAKER_BOX = (0.20, 0.40, 0.36, 0.60)
SPEAKER_CONE = ((0.36, 0.40), (0.58, 0.18), (0.58, 0.82), (0.36, 0.60))
WAVE_CENTER = (0.40, 0.50)
WAVE_RADII = (0.30, 0.39)
WAVE_HALF_THICKNESS = 0.028
WAVE_SPREAD_DEG = 42.0
# Deliberately steep: a 45 degree slash runs parallel to the cone edges and
# dissolves the silhouette at small sizes.
SLASH = (0.34, 0.06, 0.74, 0.94)
SLASH_RADIUS = 0.042
SLASH_GAP = 0.066

SIZES = {16: 8, 32: 8, 48: 6, 128: 4}


def in_box(x, y, box):
    x0, y0, x1, y1 = box
    return x0 <= x <= x1 and y0 <= y <= y1


def in_polygon(x, y, points):
    inside = False
    count = len(points)
    for i in range(count):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % count]
        if (y1 > y) != (y2 > y):
            crossing = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < crossing:
                inside = not inside
    return inside


def in_capsule(x, y, segment, radius):
    ax, ay, bx, by = segment
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    t = 0.0 if length_sq == 0 else ((x - ax) * dx + (y - ay) * dy) / length_sq
    t = max(0.0, min(1.0, t))
    return math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= radius


def in_arc(x, y, radius):
    cx, cy = WAVE_CENTER
    dx, dy = x - cx, y - cy
    distance = math.hypot(dx, dy)
    if abs(distance - radius) > WAVE_HALF_THICKNESS:
        return False
    if abs(math.degrees(math.atan2(dy, dx))) <= WAVE_SPREAD_DEG:
        return True
    # Round caps at the two ends of the arc band.
    spread = math.radians(WAVE_SPREAD_DEG)
    for sign in (-1.0, 1.0):
        ex = cx + radius * math.cos(sign * spread)
        ey = cy + radius * math.sin(sign * spread)
        if math.hypot(x - ex, y - ey) <= WAVE_HALF_THICKNESS:
            return True
    return False


def sample(x, y, muted):
    """Return the colour at a point, or None for transparent.

    Both states share the same speaker-and-waves silhouette so the toolbar
    icon reads as one glyph toggling, not two unrelated pictures.
    """
    color = RED if muted else BLUE
    if muted:
        if in_capsule(x, y, SLASH, SLASH_RADIUS):
            return color
        # Transparent gap so the slash stays readable over the glyph.
        if in_capsule(x, y, SLASH, SLASH_GAP):
            return None
    if in_box(x, y, SPEAKER_BOX) or in_polygon(x, y, SPEAKER_CONE):
        return color
    if any(in_arc(x, y, radius) for radius in WAVE_RADII):
        return color
    return None


def render(size, supersample, muted):
    rows = []
    total = supersample * supersample
    step = 1.0 / (size * supersample)
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = 0
            covered = 0
            for sy in range(supersample):
                y = (py * supersample + sy + 0.5) * step
                for sx in range(supersample):
                    x = (px * supersample + sx + 0.5) * step
                    color = sample(x, y, muted)
                    if color is None:
                        continue
                    r += color[0]
                    g += color[1]
                    b += color[2]
                    covered += 1
            if covered:
                row += bytes((r // covered, g // covered, b // covered,
                              round(255 * covered / total)))
            else:
                row += b'\x00\x00\x00\x00'
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    raw = b''.join(b'\x00' + row for row in rows)
    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', header)
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as handle:
        handle.write(png)


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, 'icons')
    os.makedirs(out_dir, exist_ok=True)
    for prefix, muted in (('icon', False), ('muted', True)):
        for size, supersample in SIZES.items():
            path = os.path.join(out_dir, f'{prefix}{size}.png')
            write_png(path, size, render(size, supersample, muted))
            print('wrote', os.path.relpath(path, os.getcwd()))


if __name__ == '__main__':
    main()
