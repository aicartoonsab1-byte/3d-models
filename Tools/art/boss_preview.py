#!/usr/bin/env python3
"""Превью антагонистов кампании: рисует силуэты из campaign.json так же, как игра (стиль Limbo).

    python3 Tools/art/boss_preview.py nosferatu     → Design/campaigns/nosferatu/bosses/<ключ>.png

Формат фигуры босса («shape») — в Design/CAMPAIGN_FORMAT.md. Координаты — в коробке 0..100 × 0..100,
которая растягивается на size = [ширина, высота] в клетках (1 клетка = 32 px в игре).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
TPX = 32


def draw_boss(defn: dict, frame: str = "idle", scale: int = 1) -> Image.Image:
    w_t, h_t = defn.get("size", [3, 3])
    W, H = int(w_t * TPX * scale), int(h_t * TPX * scale)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    atk = frame == "atk"
    dy = (defn.get("atk", {}).get("dy", -4) if atk else 0)
    sx, sy = W / 100.0, H / 100.0
    P = lambda x, y: (x * sx, (y + dy) * sy)
    sil = (7, 7, 7, 255)
    eyes = []
    for part in defn.get("shape", []):
        if "e" in part:
            cx, cy, rx, ry = part["e"]; (x0, y0), (x1, y1) = P(cx - rx, cy - ry), P(cx + rx, cy + ry)
            d.ellipse([x0, y0, x1, y1], fill=sil)
        elif "c" in part:
            cx, cy, r = part["c"]; (x0, y0), (x1, y1) = P(cx - r, cy - r), P(cx + r, cy + r)
            d.ellipse([x0, y0, x1, y1], fill=sil)
        elif "p" in part:
            pts = part["p"]; d.polygon([P(pts[i], pts[i + 1]) for i in range(0, len(pts) - 1, 2)], fill=sil)
        elif "l" in part:
            pts = part["l"]; wd = max(1, int(part.get("w", 2) * (sx + sy) / 2))
            d.line([P(pts[i], pts[i + 1]) for i in range(0, len(pts) - 1, 2)], fill=sil, width=wd, joint="curve")
        elif "eye" in part:
            eyes.append(part["eye"])
    if frame != "blink":
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        g = ImageDraw.Draw(glow)
        k = defn.get("atk", {}).get("eyes", 1.5) if atk else 1.0
        for (ex, ey, r) in eyes:
            (cx, cy) = P(ex, ey); rr = r * (sx + sy) / 2 * k
            g.ellipse([cx - rr * 2.2, cy - rr * 2.2, cx + rr * 2.2, cy + rr * 2.2], fill=(250, 248, 240, 90))
        glow = glow.filter(ImageFilter.GaussianBlur(3 * scale))
        img.alpha_composite(glow)
        d = ImageDraw.Draw(img)
        for (ex, ey, r) in eyes:
            (cx, cy) = P(ex, ey); rr = r * (sx + sy) / 2 * k
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(250, 248, 240, 255))
    return img


def main(argv):
    if not argv:
        print(__doc__); return 1
    cid = argv[0]
    cj = ROOT / f"Assets/_Project/Resources/Campaigns/{cid}/campaign.json"
    camp = json.loads(cj.read_text(encoding="utf-8"))
    out = ROOT / f"Design/campaigns/{cid}/bosses"
    out.mkdir(parents=True, exist_ok=True)
    for key, defn in (camp.get("bosses") or {}).items():
        if not defn.get("shape"):
            print(f"· {key}: без своей фигуры (будет стандартный силуэт «{defn.get('base', key)}»)"); continue
        frames = [draw_boss(defn, f, scale=2) for f in ("idle", "atk", "blink")]
        W = sum(f.width for f in frames) + 40 * 4
        H = max(f.height for f in frames) + 80
        bg = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        grad = ImageDraw.Draw(bg)
        for y in range(H):   # туманный градиент, как небо в игре
            v = int(90 + 110 * (1 - abs(y / H - 0.62) / 0.62))
            grad.line([(0, y), (W, y)], fill=(v, v, v - 4, 255))
        x = 40
        for f in frames:
            bg.alpha_composite(f, (x, H - f.height - 30)); x += f.width + 40
        grad.rectangle([0, H - 30, W, H], fill=(7, 7, 7, 255))
        p = out / f"{key}.png"
        bg.convert("RGB").save(p)
        print(f"→ {p.relative_to(ROOT)}  ({defn.get('title', key)}: покой / атака / моргает)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
