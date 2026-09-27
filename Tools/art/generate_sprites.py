#!/usr/bin/env python3
"""Генератор пиксельных спрайтов для игры «Шарик».

СТИЛЬ: «мистическая гравюра» — три краски, как в шелкографии:
  кремовая бумага · чёрная тушь · коралловый акцент.
Существа — чёрные силуэты с узорами внутри: полумесяцы, точки, глаза, потёки,
коралловые рога и отростки, пучки травы у ног.

Все спрайты рисуются кодом попиксельно и кладутся в Assets/_Project/Resources/Sprites.
Любой можно перерисовать вручную в Aseprite/LibreSprite — главное сохранить имя и размер
(PPU = 16: 1 тайл = 16×16 px).

Запуск:  python3 Tools/art/generate_sprites.py
Результат: PNG + контактный лист Design/art/sprites_sheet.png.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "Assets/_Project/Resources/Sprites"
SHEET = ROOT / "Design/art/sprites_sheet.png"

T = (0, 0, 0, 0)


def hexc(h: str, a: int = 255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


# ---- Три краски (+ оттенки) -------------------------------------------------
INK = hexc("#1c1714")        # тушь
INK_L = hexc("#3b302a")      # тушь разбавленная (дальние планы)
PAPER = hexc("#efe3c8")      # бумага
PAPER_D = hexc("#d8c6a0")    # бумага в тени
CREAM = hexc("#faf3e1")      # светлые узоры на туши
CORAL = hexc("#e2615c")      # коралл
CORAL_D = hexc("#a83f3d")
CORAL_L = hexc("#f0a193")

# Палитры актов: цвет неба, земли, узоров на земле, «травы»/кромки, платформ.
PALETTES = {
    # Акт I–II: бумажный день — чёрная земля на кремовом небе
    "meadow": dict(sky=PAPER, fill=INK, orn=CREAM, orn2=CORAL, edge=INK, plat=INK, plat_orn=CORAL,
                   hill=PAPER_D, hill_orn=INK_L),
    # Акт III: негатив — кремовая земля в тёмной пещере
    "cave": dict(sky=hexc("#231c18"), fill=PAPER_D, orn=INK, orn2=CORAL_D, edge=PAPER, plat=PAPER,
                 plat_orn=CORAL, hill=hexc("#2e2520"), hill_orn=hexc("#4a3d34")),
    # Акт IV: коралловый закат, чёрный город
    "city": dict(sky=CORAL_L, fill=INK, orn=CREAM, orn2=CORAL, edge=INK, plat=INK, plat_orn=CREAM,
                 hill=hexc("#c9766d"), hill_orn=INK_L),
    # Акт V–VI: мир трескается — бумага, тушь и сдвинутые коралловые полосы
    "glitch": dict(sky=PAPER, fill=INK, orn=CORAL, orn2=CREAM, edge=INK, plat=CORAL, plat_orn=INK,
                   hill=PAPER_D, hill_orn=CORAL_L),
    # Финал: пустота, только звёзды-точки
    "void": dict(sky=hexc("#0e0b0a"), fill=INK, orn=CREAM, orn2=CORAL, edge=CREAM, plat=CREAM,
                 plat_orn=CORAL, hill=hexc("#16110f"), hill_orn=hexc("#2a221e")),
}

sprites: dict[str, Image.Image] = {}


# ============================================================================ примитивы
def new(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), T)


def px(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((int(x), int(y)), c)


def rect(img, x0, y0, x1, y1, c):
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            px(img, x, y, c)


def hline(img, x0, x1, y, c):
    rect(img, x0, y, x1, y, c)


def vline(img, x, y0, y1, c):
    rect(img, x, y0, x, y1, c)


def ellipse(img, x0, y0, x1, y1, c):
    ImageDraw.Draw(img).ellipse([x0, y0, x1, y1], fill=c)


def poly(img, pts, c):
    ImageDraw.Draw(img).polygon(pts, fill=c)


def line(img, pts, c, w=1):
    ImageDraw.Draw(img).line(pts, fill=c, width=w)


def disc_mask(w, h, cx, cy, rx, ry):
    return {(x, y) for y in range(h) for x in range(w)
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0}


def outline_of(mask):
    return {(x, y) for (x, y) in mask
            if any((x + dx, y + dy) not in mask for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}


def crescent(img, cx, cy, r, c, facing=1):
    """Полумесяц: круг минус смещённый круг."""
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            d1 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2
            d2 = (x + 0.5 - cx - facing * r * 0.55) ** 2 + (y + 0.5 - cy + r * 0.2) ** 2
            if d1 <= r * r and d2 > (r * 0.85) ** 2:
                px(img, x, y, c)


def eye(img, cx, cy, w, h, white=CREAM, iris=None, pupil=INK):
    """Мистический глаз: миндалина, радужка, зрачок."""
    for y in range(int(cy - h), int(cy + h) + 1):
        for x in range(int(cx - w), int(cx + w) + 1):
            if ((x - cx) / (w + 0.5)) ** 2 + ((y - cy) / (h + 0.5)) ** 2 <= 1:
                px(img, x, y, white)
    if iris:
        rect(img, cx - 1, cy - 1, cx + 1, cy + 1, iris)
    px(img, cx, cy, pupil)


def closed_eye(img, cx, cy, w, c=CREAM):
    hline(img, cx - w, cx + w, cy, c)
    for i in range(-w + 1, w, 2):
        px(img, cx + i, cy + 1, c)          # ресницы


def sparkle(img, cx, cy, c, r=2):
    vline(img, cx, cy - r, cy + r, c)
    hline(img, cx - r, cx + r, cy, c)


def dots(img, mask, c, n, rng, avoid=None):
    pts = [p for p in mask if avoid is None or p not in avoid]
    for p in rng.sample(pts, min(n, len(pts))):
        px(img, *p, c)


def tufts(img, xs, y, c):
    """Пучки травы под ногами — как штрихи пером."""
    for x in xs:
        px(img, x - 1, y, c); px(img, x, y - 1, c); px(img, x + 1, y, c); px(img, x + 2, y - 1, c)


def drip(img, x, y, length, c):
    vline(img, x, y, y + length - 1, c)
    px(img, x, y + length, c)


def save(name: str, img: Image.Image):
    sprites[name] = img
    img.save(OUT / f"{name}.png")


# ============================================================================ шарик
def make_ball():
    img = new(16, 16)
    m = disc_mask(16, 16, 8, 8, 7, 7)
    for (x, y) in m:
        nx, ny = (x + 0.5 - 8) / 7, (y + 0.5 - 8) / 7
        s = nx * 0.45 + ny * 0.75
        px(img, x, y, CORAL_D if s > 0.55 else CORAL_L if s < -0.75 else CORAL)
    for p in outline_of(m):
        px(img, *p, INK)
    px(img, 4, 4, CREAM); px(img, 5, 4, CORAL_L)
    save("ball_body", img)

    spots = new(16, 16)                    # кремовые точки — как узоры на существах с постера
    inner = m - outline_of(m)
    for p in [(10, 5), (11, 10), (5, 11), (7, 3), (12, 7), (4, 8)]:
        if p in inner:
            px(spots, *p, CREAM)
    crescent(spots, 9, 11, 2.2, CORAL_D)
    save("ball_spots", spots)

    pan = new(28, 8)
    pm = disc_mask(28, 8, 14, 5.2, 13.5, 3.3)
    for (x, y) in pm:
        px(pan, x, y, CORAL_L if y <= 2 else CORAL if y < 5 else CORAL_D)
    for p in outline_of(pm):
        px(pan, *p, INK)
    for x in (6, 13, 20):
        px(pan, x, 4, CREAM)
    for x in (4, 9, 19, 23):
        px(pan, x, 7, CORAL_D)
    save("ball_pancake", pan)

    b = new(6, 6)
    for (x, y) in disc_mask(6, 6, 3, 3, 2.9, 2.9):
        px(b, x, y, CORAL_D if x + y > 5 else CORAL)
    px(b, 2, 1, CORAL_L)
    save("ball_blob", b)


def face_eyes(img, lx, rx, y, kind="dot", c=INK):
    for ex in (lx, rx):
        if kind == "dot":
            rect(img, ex, y, ex, y + 1, c)
        elif kind == "big":
            rect(img, ex - 1, y - 1, ex, y + 1, CREAM); rect(img, ex, y, ex, y + 1, c)
        elif kind == "closed":
            hline(img, ex - 1, ex, y + 1, c)
        elif kind == "happy":
            px(img, ex - 1, y + 1, c); px(img, ex, y, c); px(img, ex + 1, y + 1, c)
        elif kind == "x":
            for dx, dy in ((-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)):
                px(img, ex + dx, y + dy, c)
        elif kind == "narrow":
            hline(img, ex - 1, ex + 1, y + 1, c); px(img, ex, y, c)
        elif kind == "star":
            sparkle(img, ex, y, CREAM, 1); px(img, ex, y, INK)
        elif kind == "mystic":                 # глаз-миндалина, как у существ
            hline(img, ex - 1, ex + 1, y, CREAM); hline(img, ex - 1, ex + 1, y + 1, CREAM); px(img, ex, y, c); px(img, ex, y + 1, c)


def make_faces():
    F = {}
    f = new(16, 16); face_eyes(f, 7, 11, 6); hline(f, 8, 10, 11, INK); F["neutral"] = f
    f = new(16, 16); face_eyes(f, 7, 11, 6, "happy"); hline(f, 7, 11, 10, INK); hline(f, 8, 10, 11, CORAL_D)
    px(f, 5, 9, CORAL_L); px(f, 13, 9, CORAL_L); F["happy"] = f
    f = new(16, 16); face_eyes(f, 7, 11, 6, "big"); rect(f, 8, 10, 10, 12, INK); px(f, 9, 11, CORAL_D)
    px(f, 13, 5, CREAM); px(f, 13, 6, CREAM); F["scared"] = f
    f = new(16, 16); face_eyes(f, 7, 11, 7)
    px(f, 6, 5, INK); px(f, 7, 6, INK); px(f, 12, 5, INK); px(f, 11, 6, INK)
    hline(f, 7, 11, 11, INK); px(f, 7, 10, INK); px(f, 11, 10, INK); F["angry"] = f
    f = new(16, 16); face_eyes(f, 7, 11, 6); px(f, 6, 5, INK); px(f, 12, 5, INK)
    hline(f, 8, 10, 11, INK); px(f, 7, 12, INK); px(f, 11, 12, INK); px(f, 7, 8, CREAM); px(f, 7, 9, CREAM)
    F["sad"] = f
    f = new(16, 16); face_eyes(f, 7, 11, 6, "star"); rect(f, 8, 10, 10, 12, INK); F["awe"] = f
    f = new(16, 16); face_eyes(f, 7, 11, 6, "closed"); hline(f, 8, 10, 11, INK)
    crescent(f, 9, 1.5, 1.6, CREAM); F["pray"] = f   # полумесяц-нимб
    f = new(16, 16); face_eyes(f, 6, 11, 6, "x"); hline(f, 7, 10, 11, INK); px(f, 11, 12, INK); F["dizzy"] = f
    f = new(16, 16); face_eyes(f, 7, 11, 6, "narrow"); hline(f, 9, 11, 11, INK); F["suspicious"] = f
    f = new(16, 16); face_eyes(f, 7, 11, 7); hline(f, 6, 8, 5, INK); hline(f, 10, 12, 5, INK)
    hline(f, 7, 11, 11, INK); px(f, 11, 10, INK); F["determined"] = f
    f = new(16, 16); face_eyes(f, 7, 11, 6, "mystic"); hline(f, 7, 11, 11, INK); px(f, 9, 12, CREAM)
    sparkle(f, 3, 3, CREAM, 1); F["glitch"] = f       # «третий глаз» прозрения
    for k, v in F.items():
        save(f"face_{k}", v)


# ============================================================================ тайлы
def make_tiles():
    for name, pal in PALETTES.items():
        for vi, suffix in enumerate(("", "_b", "_c")):
            rng = random.Random(hash((name, vi)) & 0xffff)
            fill = new(16, 16)
            rect(fill, 0, 0, 15, 15, pal["fill"])
            full = {(x, y) for x in range(16) for y in range(16)}
            if name == "city":                      # окна чёрных домов
                for y in range(2, 16, 5):
                    for x in range(2 + (y // 5) % 2 * 2, 15, 5):
                        rect(fill, x, y, x + 1, y + 2, pal["orn"] if rng.random() < 0.6 else pal["orn2"])
            elif name == "glitch":                  # сдвинутые полосы
                for _ in range(3):
                    y = rng.randrange(16); x = rng.randrange(10)
                    hline(fill, x, x + rng.randrange(3, 7), y, pal["orn"])
                dots(fill, full, pal["orn2"], 3, rng)
            elif name == "void":
                dots(fill, full, pal["orn"], 3, rng)
                if vi == 1:
                    sparkle(fill, 8, 8, pal["orn"], 1)
            else:
                dots(fill, full, pal["orn"], 4, rng)
                if vi == 1:
                    crescent(fill, 8, 9, 3, pal["orn"])
                if vi == 2:
                    eye(fill, 8, 8, 3, 1, white=pal["orn"], iris=pal["orn2"], pupil=pal["fill"])
                if name == "meadow" and vi == 0:
                    px(fill, 12, 4, pal["orn2"])
            save(f"tile_{name}_fill{suffix}", fill)

            top = fill.copy()
            rect(top, 0, 0, 15, 2, T)
            if name in ("meadow", "glitch"):
                # трава-штрихи пером над чёрной землёй
                for x in range(0, 16):
                    h = 3 if (x * 5 + vi * 3) % 7 == 0 else 2 if (x * 3 + vi) % 4 == 0 else 1 if x % 2 == 0 else 0
                    for k in range(h):
                        px(top, x, 2 - k, pal["edge"])
                if vi == 2:
                    # коралловый росток
                    vline(top, 11, 0, 3, CORAL); px(top, 10, 0, CORAL); px(top, 12, 1, CORAL)
            elif name == "cave":
                hline(top, 0, 15, 3, pal["edge"]); hline(top, 0, 15, 2, INK_L)
                for x in (3, 9, 14):
                    px(top, x, 1, INK_L)
            elif name == "city":
                hline(top, 0, 15, 3, pal["orn"])        # крыша-карниз
                for x in range(0, 16, 4):
                    rect(top, x, 1, x + 1, 2, pal["fill"])
            elif name == "void":
                hline(top, 0, 15, 3, pal["edge"])
                px(top, 5, 2, pal["orn2"])
            save(f"tile_{name}_top{suffix}", top)

        plat = new(16, 16)
        rect(plat, 0, 0, 15, 4, pal["plat"])
        for x in (2, 7, 12):
            px(plat, x, 2, pal["plat_orn"])
        for x in (1, 13):
            drip(plat, x, 5, 2 + x % 3, pal["plat"])     # потёки туши
        save(f"tile_{name}_platform", plat)

        # дальний план 64×32
        hills = new(64, 32)
        rng = random.Random(len(name))
        for x in range(64):
            if name == "city":
                hgt = [12, 22, 15, 26, 10, 19, 24, 14][x // 8]
            elif name == "cave":
                hgt = 8 + 5 * math.sin(x / 64 * 4 * math.pi) + (x % 7 == 0) * 3
            else:
                hgt = 13 + 6 * math.sin(x / 64 * 2 * math.pi) + 3 * math.sin(x / 64 * 6 * math.pi)
            for y in range(32 - int(hgt), 32):
                px(hills, x, y, pal["hill"])
            top_y = 32 - int(hgt)
            if name in ("meadow", "glitch") and x % 3 == 0:
                px(hills, x, top_y - 1, pal["hill_orn"])      # травинки на холмах
            if name == "city" and x % 4 == 1:
                for y in range(top_y + 3, 30, 4):
                    px(hills, x, y, CREAM if (x + y) % 3 else pal["hill_orn"])
        if name == "cave":   # сталактиты сверху
            for x in range(2, 64, 9):
                for y in range(0, 4 + x % 5):
                    px(hills, x, y, pal["hill"]); px(hills, x + 1, y, pal["hill"])
        if name in ("meadow",):
            # далёкий силуэт рогатого зверя на холме
            ellipse(hills, 38, 12, 46, 16, pal["hill_orn"])
            for lx in (39, 45):
                vline(hills, lx, 16, 19, pal["hill_orn"])
            vline(hills, 46, 9, 12, pal["hill_orn"]); px(hills, 47, 8, pal["hill_orn"]); px(hills, 45, 8, pal["hill_orn"])
        if name == "void":
            rng2 = random.Random(3)
            for _ in range(12):
                px(hills, rng2.randrange(64), rng2.randrange(32), pal["hill_orn"])
        save(f"bg_hills_{name}", hills)


def make_cloud():
    # «облако» — плывущий полумесяц с точками, как орнамент на постере
    img = new(32, 16)
    crescent(img, 12, 8, 6.5, INK, facing=1)
    for (x, y) in ((22, 4), (25, 8), (21, 11), (27, 12), (4, 3)):
        px(img, x, y, INK)
    sparkle(img, 26, 3, CORAL, 1)
    px(img, 18, 13, CORAL)
    save("bg_cloud", img)


# ============================================================================ ловушки
def make_traps():
    on = new(16, 16)
    for i in range(4):
        x0 = i * 4
        for h in range(8):
            y = 13 - h
            half = 2 - h // 3
            for x in range(x0 + 2 - half, x0 + 2 + max(half, 1)):
                px(on, x, y, INK)
        px(on, x0 + 2, 5, CORAL)                         # окровавленный кончик
        px(on, x0 + 1, 12, CREAM)
    rect(on, 0, 14, 15, 15, INK)
    save("trap_spikes_on", on)
    off = new(16, 16)
    rect(off, 0, 14, 15, 15, INK)
    for i in range(4):
        rect(off, i * 4 + 1, 13, i * 4 + 2, 13, INK); px(off, i * 4 + 2, 12, CORAL)
    save("trap_spikes_off", off)

    # пресс — чёрный идол с глазом и коралловыми клыками
    cr = new(16, 16)
    rect(cr, 0, 0, 15, 14, INK)
    for x in (2, 13):
        px(cr, x, 2, CREAM)
    eye(cr, 8, 6, 4, 2, white=CREAM, iris=CORAL, pupil=INK)
    for x in range(1, 15, 3):
        px(cr, x, 15, CORAL); px(cr, x + 1, 15, CORAL)
    hline(cr, 3, 12, 11, CREAM)
    for x in range(3, 13, 2):
        px(cr, x, 12, CREAM)
    save("trap_crusher", cr)
    chain = new(16, 16)
    for y in range(0, 16, 4):
        rect(chain, 7, y, 8, y + 2, INK); px(chain, 8, y + 1, CORAL_D)
    save("trap_chain", chain)

    tc = new(16, 16)
    rect(tc, 0, 0, 15, 5, INK)
    for x in (4, 11):
        crescent(tc, x, 2.5, 2, CREAM)
    save("trap_trapdoor_closed", tc)
    to = new(16, 16)
    rect(to, 0, 0, 2, 15, INK); rect(to, 13, 0, 15, 15, INK)
    px(to, 1, 4, CREAM); px(to, 14, 4, CREAM)
    save("trap_trapdoor_open", to)

    for i in range(2):
        fan = new(16, 16)
        rect(fan, 1, 11, 14, 15, INK); px(fan, 4, 13, CREAM); px(fan, 11, 13, CREAM)
        ellipse(fan, 6, 7, 9, 10, INK)
        blades = [(1, 7, 5, 8), (10, 7, 14, 8)] if i == 0 else [(3, 5, 6, 7), (9, 8, 12, 9)]
        for b in blades:
            rect(fan, *b, CORAL)
        px(fan, 7, 8, CREAM)
        save(f"trap_fan_{i}", fan)
    wind = new(4, 4)
    px(wind, 1, 0, INK); px(wind, 2, 1, INK); px(wind, 1, 2, INK_L)
    save("fx_wind", wind)

    sp = new(16, 16)
    rect(sp, 0, 13, 15, 15, INK)
    for y in (11, 9):
        hline(sp, 4, 11, y, INK)
    rect(sp, 1, 7, 14, 8, CORAL); px(sp, 4, 7, CREAM)
    save("trap_spring_idle", sp)
    sl = new(16, 16)
    rect(sl, 0, 13, 15, 15, INK)
    for y in (11, 8, 5):
        hline(sl, 5, 10, y, INK); px(sl, 4 + (y % 2), y + 1, INK)
    rect(sl, 1, 1, 14, 2, CORAL); px(sl, 4, 1, CREAM)
    save("trap_spring_launch", sl)


# ============================================================================ объекты
def make_objects():
    # дверь-выход: чёрная арка-портал с глазом и полумесяцем
    d = new(16, 32)
    ellipse(d, 0, 0, 15, 14, INK)
    rect(d, 0, 7, 15, 31, INK)
    ellipse(d, 3, 4, 12, 14, PAPER)
    rect(d, 3, 9, 12, 31, PAPER)
    for y in range(12, 31, 3):
        px(d, 7 + (y % 2), y, PAPER_D)
    crescent(d, 8, 9, 3, CORAL)
    eye(d, 8, 2, 2, 1, white=CREAM, iris=None, pupil=INK)
    tufts(d, (1, 13), 31, INK)
    save("obj_exit", d)

    # чекпоинт: чёрный тотем со свечой
    for state in ("off", "on"):
        f = new(16, 16)
        rect(f, 5, 6, 10, 15, INK)
        eye(f, 7, 10, 1, 1, white=CREAM, pupil=INK)
        px(f, 8, 13, CREAM)
        vline(f, 7, 3, 5, CREAM)
        if state == "on":
            ellipse(f, 6, 0, 8, 3, CORAL); px(f, 7, 1, CREAM)
        tufts(f, (4, 11), 15, INK)
        save(f"obj_checkpoint_{state}", f)

    # рубильник 32×32 — древний механизм мира
    for state in ("off", "on"):
        r = new(32, 32)
        rect(r, 4, 6, 27, 31, INK)
        crescent(r, 10, 12, 3, CREAM)
        eye(r, 22, 12, 3, 1, white=CREAM, iris=CORAL, pupil=INK)
        for x in range(6, 26, 3):
            px(r, x, 28, CREAM)
        rect(r, 12, 17, 19, 21, PAPER)
        lamp = CORAL if state == "off" else CREAM
        rect(r, 7, 7, 8, 8, lamp); rect(r, 23, 7, 24, 8, lamp)
        if state == "off":
            rect(r, 15, 2, 16, 18, INK); rect(r, 12, 0, 19, 3, CORAL); px(r, 13, 0, CREAM)
        else:
            rect(r, 15, 19, 16, 30, INK); rect(r, 12, 28, 19, 31, CORAL); px(r, 13, 28, CREAM)
        for x in (5, 26):
            drip(r, x, 31, 0, INK)
        save(f"obj_switch_{state}", r)

    g = new(8, 8)       # осколок кода — коралловая искра с глазом
    sparkle(g, 3, 3, CORAL, 3)
    rect(g, 2, 2, 4, 4, CORAL)
    px(g, 3, 3, CREAM)
    px(g, 6, 6, INK); px(g, 0, 7, INK)
    save("obj_fragment", g)

    w = new(4, 4); rect(w, 0, 0, 3, 3, CREAM); save("fx_pixel", w)

    # взгляд Всевидящего (снаряд), пыль и ударная волна
    o = new(8, 8); ellipse(o, 0, 0, 7, 7, CORAL); ellipse(o, 2, 2, 5, 5, CREAM); px(o, 3, 3, INK); px(o, 4, 4, INK)
    save("fx_gaze", o)
    du = new(8, 8)
    for (x, y) in ((1, 5), (2, 4), (4, 6), (5, 3), (6, 5), (3, 2)):
        px(du, x, y, INK)
    save("fx_dust", du)
    sh = new(32, 8)
    for x in range(32):
        y = 6 - int(3 * math.sin(x / 31 * math.pi))
        px(sh, x, y, INK); px(sh, x, y + 1, CORAL if x % 4 == 0 else INK)
    save("fx_shock", sh)


# ============================================================================ декор-обитатели
def make_deco():
    # 0: грибок с полумесяцем
    d = new(16, 16)
    ellipse(d, 2, 3, 13, 9, INK); rect(d, 2, 7, 13, 8, INK)
    crescent(d, 8, 5.5, 2, CREAM)
    rect(d, 6, 9, 9, 14, CORAL); px(d, 7, 11, CREAM); px(d, 8, 13, CORAL_D)
    tufts(d, (4, 11), 15, INK)
    save("deco_0", d)
    # 1: маленький рогатый зверёк
    d = new(16, 16)
    ellipse(d, 3, 7, 12, 12, INK)
    for lx in (4, 6, 9, 11):
        vline(d, lx, 12, 15, INK)
    ellipse(d, 10, 4, 14, 8, INK)
    vline(d, 11, 1, 4, CORAL); vline(d, 13, 2, 4, CORAL); px(d, 10, 1, CORAL)
    px(d, 12, 6, CREAM)
    for (x, y) in ((5, 9), (8, 8), (7, 10)):
        px(d, x, y, CREAM)
    save("deco_1", d)
    # 2: цветок-глаз
    d = new(16, 16)
    vline(d, 8, 8, 15, INK); px(d, 7, 12, INK); px(d, 6, 11, INK)
    for (cx, cy) in ((4, 5), (12, 5), (8, 1), (8, 9)):
        ellipse(d, cx - 2, cy - 2, cx + 2, cy + 2, CORAL)
    ellipse(d, 5, 2, 11, 8, INK)
    eye(d, 8, 5, 2, 1, white=CREAM, pupil=INK)
    save("deco_2", d)
    # 3: улитка со спиралью
    d = new(16, 16)
    ellipse(d, 3, 4, 12, 13, CREAM)
    for a in range(0, 540, 20):
        r = 4.5 * (1 - a / 600)
        px(d, 7.5 + r * math.cos(math.radians(a)), 8.5 + r * math.sin(math.radians(a)), INK)
    ellipse(d, 1, 11, 15, 14, INK)
    vline(d, 14, 7, 11, INK); px(d, 15, 7, INK); px(d, 13, 6, INK); px(d, 14, 9, CREAM)
    px(d, 4, 12, CORAL); px(d, 9, 13, CORAL)
    save("deco_3", d)


# ============================================================================ боссы
def boss_stag(frame: str) -> Image.Image:
    """Лунный Олень: высокий чёрный зверь, шарик катится у него под брюхом."""
    img = new(48, 64)
    rear = frame == "atk"
    lift = 6 if rear else 0
    # ноги
    for lx, front in ((10, False), (15, False), (32, True), (37, True)):
        if front and rear:
            line(img, [(lx, 40 - lift), (lx + 4, 48 - lift), (lx + 1, 52 - lift)], INK, 2)
        else:
            rect(img, lx, 40, lx + 1, 61, INK)
            px(img, lx - 1, 62, INK); px(img, lx + 2, 62, INK); hline(img, lx - 1, lx + 2, 63, INK)
            px(img, lx, 50, CREAM)
    # тело
    ellipse(img, 5, 27 - lift, 42, 44 - lift, INK)
    crescent(img, 20, 35 - lift, 5.5, CREAM)
    rng = random.Random(1)
    body = [(x, y) for x in range(8, 40) for y in range(30 - lift, 42 - lift) if img.getpixel((x, y)) == INK]
    for p in rng.sample(body, 14):
        px(img, *p, CREAM)
    for x in (9, 14, 28, 36):
        drip(img, x, 44 - lift, 2 + x % 3, INK)
    # хвост
    line(img, [(6, 30 - lift), (2, 26 - lift), (3, 23 - lift)], INK, 2)
    # шея и голова
    poly(img, [(31, 32 - lift), (38, 30 - lift), (41, 14 - lift), (35, 14 - lift)], INK)
    ellipse(img, 33, 9 - lift, 46, 18 - lift, INK)
    px(img, 46, 14 - lift, INK)
    if frame == "blink":
        closed_eye(img, 40, 12 - lift, 2)
    else:
        eye(img, 40, 12 - lift, 2, 1, white=CREAM, iris=CORAL if rear else None, pupil=INK)
    crescent(img, 38, 4 - lift, 1.5, CREAM)
    # коралловые рога
    for base, sign in ((37, -1), (42, 1)):
        pts = [(base, 9 - lift), (base + sign * 2, 5 - lift), (base + sign * 3, 0)]
        line(img, pts, CORAL, 1)
        line(img, [(base + sign * 2, 5 - lift), (base + sign * 5, 3 - lift)], CORAL, 1)
        line(img, [(base + sign * 2, 7 - lift), (base + sign * 4, 6 - lift)], CORAL, 1)
    if rear:
        for (x, y) in ((44, 22), (46, 26), (2, 18)):
            sparkle(img, x, y, CORAL, 1)
    tufts(img, (4, 22, 28, 44), 63, INK)
    return img


def boss_watcher(frame: str) -> Image.Image:
    """Всевидящий: парящий холм-существо, покрытый глазами. Он и есть «тот, кто смотрит»."""
    img = new(48, 48)
    ellipse(img, 4, 10, 43, 42, INK)
    for x in range(7, 42, 4):
        drip(img, x, 40, 2 + (x * 7) % 5, INK)
    crescent(img, 24, 4, 3.5, CORAL)
    sparkle(img, 8, 5, INK, 2); sparkle(img, 40, 7, INK, 1)
    # малые глаза по кругу
    for (x, y) in ((11, 20), (36, 20), (14, 33), (33, 33), (24, 14)):
        if frame == "blink":
            closed_eye(img, x, y, 2)
        else:
            eye(img, x, y, 2, 1, white=CREAM, pupil=INK)
    # большой глаз
    if frame == "blink":
        closed_eye(img, 24, 26, 7)
    else:
        eye(img, 24, 26, 8, 5, white=CREAM)
        ellipse(img, 20, 22, 28, 30, CORAL)
        ellipse(img, 22, 24, 26, 28, INK) if frame != "atk" else rect(img, 24, 23, 24, 29, INK)
        px(img, 21, 23, CREAM)
    if frame == "atk":
        for a in range(0, 360, 45):
            x = 24 + 12 * math.cos(math.radians(a)); y = 26 + 9 * math.sin(math.radians(a))
            px(img, x, y, CORAL); px(img, 24 + 14 * math.cos(math.radians(a)), 26 + 11 * math.sin(math.radians(a)), CORAL)
    rng = random.Random(2)
    body = [(x, y) for x in range(6, 42) for y in range(12, 40) if img.getpixel((x, y)) == INK]
    for p in rng.sample(body, 18):
        px(img, *p, CREAM)
    return img


def boss_worm(frame: str) -> Image.Image:
    """Кодовый Червь: сегменты с коралловыми полосами, вырывается из-под земли."""
    if frame == "peek":
        img = new(24, 16)
        ellipse(img, 4, 4, 19, 19, INK)
        eye(img, 12, 9, 3, 2, white=CREAM, iris=CORAL, pupil=INK)
        for x in (6, 17):
            px(img, x, 6, CREAM)
        hline(img, 0, 23, 15, INK); px(img, 2, 14, INK); px(img, 21, 14, INK)
        return img
    img = new(24, 48)
    for i, y in enumerate(range(44, 10, -6)):
        w = 8 + (i % 2)
        ellipse(img, 12 - w, y - 5, 12 + w, y + 3, INK)
        hline(img, 12 - w + 2, 12 + w - 2, y - 1, CORAL)
        px(img, 12 - w + 3, y - 3, CREAM); px(img, 12 + w - 4, y + 1, CREAM)
    ellipse(img, 3, 0, 20, 16, INK)
    eye(img, 12, 6, 3, 2, white=CREAM, iris=CORAL, pupil=INK)
    rect(img, 7, 11, 16, 14, CORAL if frame == "atk" else INK)
    for x in range(7, 17, 2):
        px(img, x, 11, CREAM)
    line(img, [(5, 2), (2, -2)], CORAL); line(img, [(18, 2), (21, -2)], CORAL)
    return img


def boss_keeper(frame: str) -> Image.Image:
    """Хранитель: огромный лежащий зверь со звездой-глазом. Охраняет рубильник."""
    img = new(64, 40)
    ellipse(img, 2, 12, 54, 39, INK)
    rect(img, 2, 30, 54, 39, INK)
    # узор: ряд кремовых треугольников-гор и полумесяцы
    for x in range(8, 48, 8):
        poly(img, [(x, 30), (x + 3, 24), (x + 6, 30)], CREAM)
        px(img, x + 3, 27, INK)
    for x in (14, 34):
        crescent(img, x, 18, 3, CORAL)
    rng = random.Random(4)
    body = [(x, y) for x in range(6, 52) for y in range(14, 36) if img.getpixel((x, y)) == INK]
    for p in rng.sample(body, 16):
        px(img, *p, CREAM)
    for x in range(6, 54, 7):
        tufts(img, (x,), 39, INK)
    # голова
    ellipse(img, 44, 8, 63, 30, INK)
    cx, cy = 54, 17
    # звезда-глаз
    for a in range(0, 360, 30):
        r = 7 if a % 60 == 0 else 5
        line(img, [(cx, cy), (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))], CREAM)
    if frame == "blink":
        ellipse(img, cx - 2, cy - 2, cx + 2, cy + 2, INK); hline(img, cx - 2, cx + 2, cy, CREAM)
    else:
        ellipse(img, cx - 2, cy - 2, cx + 2, cy + 2, CORAL if frame == "atk" else INK)
        px(img, cx, cy, CREAM)
    # коралловые ветвистые рога
    for base, sign in ((48, -1), (58, 1)):
        line(img, [(base, 9), (base + sign * 3, 3), (base + sign * 2, 0)], CORAL)
        line(img, [(base + sign * 2, 5), (base + sign * 6, 2)], CORAL)
    if frame == "atk":
        # рёв: раскрытая пасть и коралловые штрихи ярости над головой
        rect(img, 55, 25, 62, 28, CORAL)
        for x in range(56, 62, 2):
            px(img, x, 25, CREAM)
        for (x, y) in ((42, 4), (40, 8), (62, 3)):
            sparkle(img, x, y, CORAL, 1)
    return img


def make_bosses():
    for f in ("idle", "blink", "atk"):
        save(f"boss_stag_{f}", boss_stag(f))
        save(f"boss_watcher_{f}", boss_watcher(f))
        save(f"boss_keeper_{f}", boss_keeper(f))
    save("boss_worm_peek", boss_worm("peek"))
    save("boss_worm_idle", boss_worm("idle"))
    save("boss_worm_atk", boss_worm("atk"))


def contact_sheet():
    names = sorted(sprites)
    cell = 64
    cols = 12
    rows = math.ceil(len(names) / cols)
    sheet = Image.new("RGBA", (cols * cell * 2, rows * cell * 2), PAPER)
    for i, n in enumerate(names):
        im = sprites[n]
        s = max(1, min(cell // im.width, cell // im.height))
        im2 = im.resize((im.width * s * 2, im.height * s * 2), Image.NEAREST)
        x = (i % cols) * cell * 2 + (cell * 2 - im2.width) // 2
        y = (i // cols) * cell * 2 + (cell * 2 - im2.height) // 2
        # тёмные фоны — под тёмные спрайты палитр cave/void
        if "cave" in n or "void" in n:
            ImageDraw.Draw(sheet).rectangle([(i % cols) * cell * 2, (i // cols) * cell * 2,
                                             (i % cols + 1) * cell * 2 - 2, (i // cols + 1) * cell * 2 - 2],
                                            fill=PALETTES["cave" if "cave" in n else "void"]["sky"])
        if "city" in n:
            ImageDraw.Draw(sheet).rectangle([(i % cols) * cell * 2, (i // cols) * cell * 2,
                                             (i % cols + 1) * cell * 2 - 2, (i // cols + 1) * cell * 2 - 2],
                                            fill=PALETTES["city"]["sky"])
        sheet.alpha_composite(im2, (x, y))
    SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(SHEET)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()
    make_ball()
    make_faces()
    make_tiles()
    make_cloud()
    make_traps()
    make_objects()
    make_deco()
    make_bosses()
    contact_sheet()
    print(f"Сгенерировано спрайтов: {len(sprites)} → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
