#!/usr/bin/env python3
"""Рендер превью уровня в PNG теми же спрайтами, что и в игре.

    python3 Tools/levels/render.py                 # все уровни → Design/previews/<id>.png
    python3 Tools/levels/render.py 02_*.json --path  # с точками найденного пути шарика

Агенты используют превью, чтобы «увидеть» уровень (Read по PNG).
"""
from __future__ import annotations

import fnmatch
import sys

from PIL import Image, ImageDraw

from levellib import PLATFORM, ROOT, SOLID, all_levels, solve

SPR = ROOT / "Assets/_Project/Resources/Sprites"
OUT = ROOT / "Design/previews"
_cache: dict[str, Image.Image] = {}


def spr(name: str) -> Image.Image:
    if name not in _cache:
        _cache[name] = Image.open(SPR / f"{name}.png").convert("RGBA")
    return _cache[name]


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


SKY = {"meadow": "#efe3c8", "cave": "#231c18", "city": "#f0a193", "glitch": "#efe3c8", "void": "#0e0b0a"}


def variant(x, y):  # синхронно с LevelBuilder.Variant
    h = (x * 73 + y * 31) % 11
    return "_b" if h == 0 else "_c" if h == 5 else ""


def deco_ok(lv, x, y):  # синхронно с LevelBuilder.Deco
    if (x * 37 + y * 11) % 9 != 0:
        return False
    return all(lv.ch(x + dx, y + dy) in ".#" for dx in range(-2, 3) for dy in range(0, 3))


def render(lv, with_path=False, scale=2):
    pal = lv.data.get("palette", "meadow")
    W, H = lv.w * 16, lv.h * 16
    img = Image.new("RGBA", (W, H), hexrgb(SKY.get(pal, "#efe3c8")) + (255,))
    hills = spr(f"bg_hills_{pal}")
    for x in range(0, W, hills.width):
        img.alpha_composite(hills, (x, H - hills.height - 16 * 2))

    def put(name, x, y, dx=0, dy=0):
        s = spr(name)
        px = x * 16 + (16 - s.width) // 2 + dx
        py = (lv.h - 1 - y) * 16 + (16 - s.height) + dy
        img.alpha_composite(s, (px, py))

    trap_no = 0
    labels = []
    for x in range(lv.w):          # слева направо — как нумерует игра (TrapController)
        for y in range(lv.h):
            c = lv.ch(x, y)
            if c == "#":
                top = lv.ch(x, y + 1) not in SOLID
                put(f"tile_{pal}_{'top' if top else 'fill'}{variant(x, y)}", x, y)
                if top and lv.ch(x, y + 1) == "." and deco_ok(lv, x, y):
                    put(f"deco_{(x * 7 + y) % 4}", x, y + 1)
            elif c == "=":
                put(f"tile_{pal}_platform", x, y)
            elif c == "X":
                put("mech_crumble", x, y)
            elif c == "O":
                put("mech_bounce", x, y, dy=-6)
            elif c == ">":
                put("mech_conv_r_0", x, y)
            elif c == "<":
                put("mech_conv_l_0", x, y)
            elif c == "~":
                put("mech_ice", x, y)
            elif c == "@":
                entr = (x, y) in lv.portals()
                put("mech_portal_0" if entr else "mech_portal_1", x, y)
            elif c == "S":
                put("ball_body", x, y, dy=-1)
                put("face_neutral", x, y, dy=-1)
            elif c == "F":
                put("obj_exit", x, y)
            elif c == "R":
                put("obj_switch_off", x, y)
            elif c == "K":
                put("obj_checkpoint_off", x, y)
            elif c == "*":
                put("obj_fragment", x, y, dy=-4)
            elif c == "B":
                trap_no += 1
                kind = lv.data.get("boss", "stag")
                name = "boss_worm_peek" if kind == "worm" else f"boss_{kind}_idle"
                spr_ = spr(name)
                lift = 40 if kind == "watcher" else 0
                bx = x * 16 + 8 - spr_.width // 2
                by = (lv.h - 1 - y) * 16 + 16 - spr_.height - lift
                img.alpha_composite(spr_, (bx, by))
                labels.append((x, y + spr_.height // 16 + (2 if kind == "watcher" else 0), trap_no))
            elif c in "^CTWJ":
                trap_no += 1
                name = {"^": "trap_spikes_on", "C": "trap_crusher", "T": "trap_trapdoor_closed",
                        "W": "trap_fan_0", "J": "trap_spring_idle"}[c]
                if c == "C":
                    put("trap_chain", x, y + 1)
                put(name, x, y)
                labels.append((x, y, trap_no))
    d = ImageDraw.Draw(img)
    for (x, y, n) in labels:
        px, py = x * 16 + 1, (lv.h - 1 - y) * 16 - 9
        d.rectangle([px, py, px + 8, py + 8], fill=(20, 20, 30, 220))
        d.text((px + 2, py - 1), str(n % 10), fill=(252, 216, 60, 255))
    if with_path:
        path, _ = solve(lv)
        if path:
            pts = [(x * 16 + 8, (lv.h - 1 - y) * 16 + 10) for (x, y) in path]
            d.line(pts, fill=(255, 60, 60, 200), width=1)
            for p in pts:
                d.ellipse([p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1], fill=(255, 255, 255, 255))
    # сетка по 10 клеток — удобно для отладки координат
    for x in range(0, lv.w, 10):
        d.line([(x * 16, 0), (x * 16, 3)], fill=(255, 255, 255, 160))
        d.text((x * 16 + 2, 0), str(x), fill=(255, 255, 255, 200))
    return img.resize((W * scale, H * scale), Image.NEAREST)


def main(argv):
    with_path = "--path" in argv
    masks = [a for a in argv if not a.startswith("--")]
    OUT.mkdir(parents=True, exist_ok=True)
    for lv in all_levels():
        if masks and not any(fnmatch.fnmatch(lv.path.name, m) for m in masks):
            continue
        out = OUT / f"{lv.path.stem}.png"
        render(lv, with_path).convert("RGB").save(out)
        print(f"→ {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1:])
