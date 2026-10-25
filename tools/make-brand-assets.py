"""Builds the built-in HaitiViral icons, logo images and iPhone launch screens in public/.

Usage: python3 tools/make-brand-assets.py path/to/PlusJakartaSans-ExtraBold.ttf
The mark is a navy rounded square with a rising arrow; the word mark is "Haiti" (navy) + "Viral" (red).
A logo uploaded in Admin → Settings → Brand images replaces the header logo without running this.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

NAVY = (15, 23, 42)
RED = (210, 16, 52)
BG = (245, 246, 251)
ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
FONT = sys.argv[1]
SS = 4  # supersampling for smooth edges


def mark(size: int, pad: float = 0.0, radius: float = 0.24, bg=None) -> Image.Image:
    """Navy rounded square with a white rising arrow; pad = empty margin around it (maskable icons)."""
    S = size * SS
    img = Image.new("RGBA", (S, S), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    inset = int(S * pad)
    box = (inset, inset, S - inset, S - inset)
    w = box[2] - box[0]
    d.rounded_rectangle(box, radius=int(w * radius), fill=NAVY)
    # Arrow drawn on a 24-unit grid inside the square (same shape as the mockup icon).
    u = w / 24 * 0.78
    ox, oy = box[0] + (w - 24 * u) / 2, box[1] + (w - 24 * u) / 2
    P = lambda x, y: (ox + x * u, oy + y * u)
    stroke = int(2.6 * u)
    line = [P(3, 17), P(9, 11), P(13, 15), P(21, 7)]
    head = [P(15, 7), P(21, 7), P(21, 13)]
    for pts in (line, head):
        d.line(pts, fill="white", width=stroke, joint="curve")
        for x, y in (pts[0], pts[-1]):
            r = stroke / 2
            d.ellipse((x - r, y - r, x + r, y + r), fill="white")
    return img.resize((size, size), Image.LANCZOS)


def wordmark(height: int) -> Image.Image:
    """Mark + "HaitiViral" on a transparent background."""
    H = height * SS
    font = ImageFont.truetype(FONT, int(H * 0.62))
    m = mark(height).resize((H, H), Image.LANCZOS)
    a, b = "Haiti", "Viral"
    wa = font.getlength(a)
    wb = font.getlength(b)
    gap = int(H * 0.28)
    img = Image.new("RGBA", (int(H + gap + wa + wb + H * 0.05), H), (0, 0, 0, 0))
    img.paste(m, (0, 0), m)
    d = ImageDraw.Draw(img)
    y = H / 2
    d.text((H + gap, y), a, font=font, fill=NAVY, anchor="lm")
    d.text((H + gap + wa, y), b, font=font, fill=RED, anchor="lm")
    return img.resize((img.width // SS, height), Image.LANCZOS)


def save(img: Image.Image, rel: str, **kw):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, **kw)


# App icons (opaque, as iOS and Android expect)
for size, rel in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png"), (48, "favicon-48.png")]:
    full = Image.new("RGBA", (size, size), NAVY)
    full.alpha_composite(mark(size, radius=0))
    save(full.convert("RGB"), rel, optimize=True)
save(mark(512, pad=0.1, radius=0, bg=NAVY).convert("RGB"), "icon-maskable-512.png", optimize=True)
# Notification badge: white arrow shape on transparent (Android tints it)
badge = mark(96)
alpha = badge.split()[0].point(lambda v: 255 if v > 200 else 0)
mono = Image.new("RGBA", (96, 96), (255, 255, 255, 0))
mono.putalpha(alpha)
save(mono, "badge-96.png", optimize=True)

# Logos used by the header, emails and launch screens
save(wordmark(72), "brand/logo.png", optimize=True)
save(mark(96), "brand/mark.png", optimize=True)
save(wordmark(240), "brand/logo-full.png", optimize=True)

# iPhone / iPad launch screens: light background, centered logo
for name in sorted(os.listdir(os.path.join(ROOT, "splash"))):
    w, h = (int(v) for v in name.removesuffix(".png").split("x"))
    logo = wordmark(int(w * 0.15))
    canvas = Image.new("RGB", (w, h), BG)
    canvas.paste(logo, ((w - logo.width) // 2, (h - logo.height) // 2), logo)
    save(canvas, f"splash/{name}", optimize=True)

# Vector favicon
svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5.5" fill="#0F172A"/>'
    '<g transform="translate(2.64 2.64) scale(0.78)" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">'
    '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></g></svg>\n'
)
open(os.path.join(ROOT, "icon.svg"), "w").write(svg)
print(json.dumps({"ok": True}))
