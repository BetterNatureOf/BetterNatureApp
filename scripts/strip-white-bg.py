#!/usr/bin/env python3
"""
Strip the white background from project logo PNGs in place.

The original PNGs were exported with a white plate behind the artwork.
That looked fine on its own but read as a hard rectangle as soon as we
dropped the logos onto colored cards in the app + on the website.
mix-blend-mode: multiply hid it on the web, but the multiply darkened
brand pinks/greens unevenly and the app's react-native-image doesn't
honor the blend mode at all on native — so the cleanest fix is to bake
real transparency into the PNGs themselves.

Run after dropping new logos in:

    python3 scripts/strip-white-bg.py

The script processes every file in the LOGO_PATHS list. Tolerance is
how close to pure white a pixel must be to start getting alpha-faded.
240 catches anti-aliased halos without eating into pastel artwork.
"""
from PIL import Image
import os

TOLERANCE = 240  # pixels with min(r,g,b) >= this start fading transparent

LOGO_PATHS = [
    'src/assets/projects/iris.png',
    'src/assets/projects/hydro.png',
    'src/assets/projects/evergreen.png',
    'website/projects/iris.png',
    'website/projects/hydro.png',
    'website/projects/evergreen.png',
]

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def strip(path):
    full = os.path.join(REPO_ROOT, path)
    if not os.path.exists(full):
        print(f"SKIP  {path}  (not found)")
        return
    img = Image.open(full).convert('RGBA')
    px = img.load()
    w, h = img.size
    touched = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r >= TOLERANCE and g >= TOLERANCE and b >= TOLERANCE:
                # Soft fade so anti-aliased edges don't become a hard cut.
                # pure white (255) → fully transparent
                # ~tolerance → keeps most of its existing alpha
                whiteness = min(r, g, b)
                new_a = int(a * (255 - whiteness) / (255 - TOLERANCE))
                px[x, y] = (r, g, b, max(0, min(new_a, a)))
                touched += 1
    img.save(full, 'PNG', optimize=True)
    print(f"OK    {path:36s}  {touched:>7d} px → transparent  ({w}x{h})")


if __name__ == '__main__':
    for p in LOGO_PATHS:
        strip(p)
    print("\nDone.")
