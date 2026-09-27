#!/usr/bin/env python3
"""Генератор 8-битных спрайтов для игры «Шарик».

Рисует все спрайты попиксельно и кладёт PNG в Assets/_Project/Resources/Sprites.
Любой спрайт потом можно перерисовать руками в Aseprite/LibreSprite — главное
сохранить имя файла и размер (PPU = 16, 1 тайл = 16×16 px).

Запуск:  python3 Tools/art/generate_sprites.py
Результат: PNG-файлы + контактный лист Design/art/sprites_sheet.png (увеличенный x4).
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "Assets/_Project/Resources/Sprites"
SHEET = ROOT / "Design/art/sprites_sheet.png"

T = (0, 0, 0, 0)


def hexc(h: str, a: int = 255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


# Ограниченная палитра в духе NES.
P = {
    "black": hexc("#0f0f1b"),
    "outline": hexc("#3a1a10"),
    "white": hexc("#fcfcfc"),
    "grey": hexc("#9a9aa8"),
    "dgrey": hexc("#565668"),
    "lgrey": hexc("#c8c8d4"),
    # пластилиновый шарик
    "ball": hexc("#f28c3c"),
    "ball_d": hexc("#c25a24"),
    "ball_l": hexc("#ffc88a"),
    "ball_spot": hexc("#d9692c"),
    "cheek": hexc("#ff6f7d"),
    "tear": hexc("#5fb4ff"),
    # металл
    "steel": hexc("#8c96a8"),
    "steel_d": hexc("#4c5468"),
    "steel_l": hexc("#d8e0ec"),
    "red": hexc("#e03c3c"),
    "red_d": hexc("#8c1c1c"),
    "yellow": hexc("#fcd83c"),
    "yellow_d": hexc("#b08c1c"),
    "green": hexc("#3cc85a"),
    "green_d": hexc("#1c7c34"),
    "wood": hexc("#a8683c"),
    "wood_d": hexc("#6c3c1c"),
    "wood_l": hexc("#d09060"),
    "cyan": hexc("#3cf0f0"),
    "magenta": hexc("#f03cc8"),
}

# Палитры уровней: верх земли, земля, тёмная земля, детали, фон (небо), холмы, холмы тёмные.
PALETTES = {
    "meadow": dict(top="#4cd04c", top_d="#249c34", fill="#a0643c", fill_d="#6c3c24", speck="#c8905c",
                   sky="#78b4fc", hill="#58a85c", hill_d="#3c7c48", plat="#d09060", plat_d="#8c5830"),
    "cave":   dict(top="#8c8cb4", top_d="#5c5c84", fill="#4c4c6c", fill_d="#2c2c44", speck="#6c6c94",
                   sky="#1c1c34", hill="#2c2c4c", hill_d="#20203c", plat="#8c8cb4", plat_d="#4c4c6c"),
    "city":   dict(top="#b4b4c0", top_d="#7c7c8c", fill="#a84c3c", fill_d="#6c2c24", speck="#d06c58",
                   sky="#fc9c6c", hill="#5c4c6c", hill_d="#3c3050", plat="#9aa0b0", plat_d="#5c6070"),
    "glitch": dict(top="#3cf0c8", top_d="#1c9c8c", fill="#4c2c6c", fill_d="#2c1844", speck="#f03cc8",
                   sky="#10081c", hill="#281444", hill_d="#1c0c30", plat="#f03cc8", plat_d="#8c1c7c"),
    "void":   dict(top="#fcfcfc", top_d="#9a9aa8", fill="#1c1c24", fill_d="#0c0c10", speck="#3cf03c",
                   sky="#000000", hill="#0c0c14", hill_d="#08080c", plat="#3cf03c", plat_d="#1c7c1c"),
}

sprites: dict[str, Image.Image] = {}


def new(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), T)


def px(img: Image.Image, x: int, y: int, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), c)


def rect(img, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px(img, x, y, c)


def hline(img, x0, x1, y, c):
    rect(img, x0, y, x1, y, c)


def disc_mask(w, h, cx, cy, rx, ry):
    return {(x, y) for y in range(h) for x in range(w)
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0}


def outline_of(mask):
    return {(x, y) for (x, y) in mask
            if any((x + dx, y + dy) not in mask for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}


def save(name: str, img: Image.Image):
    sprites[name] = img
    img.save(OUT / f"{name}.png")


# ---------------------------------------------------------------- шарик
def blob(w, h, cx, cy, rx, ry, base, dark, light, outline):
    img = new(w, h)
    m = disc_mask(w, h, cx, cy, rx, ry)
    edge = outline_of(m)
    for (x, y) in m:
        # свет сверху-слева, тень снизу-справа
        nx = (x + 0.5 - cx) / rx
        ny = (y + 0.5 - cy) / ry
        shade = nx * 0.45 + ny * 0.75
        c = base
        if shade > 0.55:
            c = dark
        elif shade < -0.75:
            c = light
        px(img, x, y, c)
    for (x, y) in edge:
        px(img, x, y, outline)
    return img, m


def make_ball():
    img, m = blob(16, 16, 8, 8, 7, 7, P["ball"], P["ball_d"], P["ball_l"], P["outline"])
    # блик
    px(img, 4, 4, P["white"]); px(img, 5, 4, P["ball_l"]); px(img, 4, 5, P["ball_l"])
    save("ball_body", img)

    # пятнышки (крутятся при качении — видно, что шар катится)
    spots = new(16, 16)
    for (x, y) in [(10, 5), (11, 5), (10, 6), (5, 11), (6, 11), (11, 11), (7, 3)]:
        if (x, y) in m and (x, y) not in outline_of(m):
            px(spots, x, y, P["ball_spot"])
    save("ball_spots", spots)

    # лепёшка
    pan = new(28, 8)
    pm = disc_mask(28, 8, 14, 5.2, 13.5, 3.3)
    for (x, y) in pm:
        c = P["ball"] if y < 5 else P["ball_d"]
        if y <= 2:
            c = P["ball_l"]
        px(pan, x, y, c)
    for (x, y) in outline_of(pm):
        px(pan, x, y, P["outline"])
    for x in (4, 9, 19, 23):   # потёки
        px(pan, x, 7, P["ball_d"])
    save("ball_pancake", pan)

    # кусочек пластилина (для сборки обратно в шар)
    b = new(6, 6)
    for (x, y) in disc_mask(6, 6, 3, 3, 2.9, 2.9):
        px(b, x, y, P["ball_d"] if x + y > 5 else P["ball"])
    px(b, 2, 1, P["ball_l"])
    save("ball_blob", b)


def eyes(img, lx, rx, y, kind="dot", c=None):
    c = c or P["black"]
    for ex in (lx, rx):
        if kind == "dot":
            rect(img, ex, y, ex, y + 1, c)
        elif kind == "big":
            rect(img, ex - 1, y - 1, ex, y + 1, P["white"])
            rect(img, ex, y, ex, y + 1, c)
        elif kind == "closed":
            hline(img, ex - 1, ex, y + 1, c)
        elif kind == "happy":
            px(img, ex - 1, y + 1, c); px(img, ex, y, c); px(img, ex + 1, y + 1, c)
        elif kind == "x":
            px(img, ex - 1, y - 1, c); px(img, ex + 1, y - 1, c); px(img, ex, y, c)
            px(img, ex - 1, y + 1, c); px(img, ex + 1, y + 1, c)
        elif kind == "narrow":
            hline(img, ex - 1, ex + 1, y + 1, c); px(img, ex, y, c)
        elif kind == "star":
            px(img, ex, y - 1, P["yellow"]); px(img, ex - 1, y, P["yellow"]); px(img, ex, y, P["white"])
            px(img, ex + 1, y, P["yellow"]); px(img, ex, y + 1, P["yellow"])


def make_faces():
    # Лицо рисуется поверх ball_body; зрачки смотрят вправо (движение). Влево — flipX.
    faces = {}

    f = new(16, 16); eyes(f, 7, 11, 6); hline(f, 8, 10, 11, P["outline"]); faces["neutral"] = f

    f = new(16, 16); eyes(f, 7, 11, 6, "happy")
    hline(f, 7, 11, 10, P["outline"]); hline(f, 8, 10, 11, P["red_d"])
    px(f, 5, 9, P["cheek"]); px(f, 13, 9, P["cheek"]); faces["happy"] = f

    f = new(16, 16); eyes(f, 7, 11, 6, "big")
    rect(f, 8, 10, 10, 12, P["outline"]); px(f, 9, 11, P["red_d"])
    px(f, 13, 5, P["tear"]); px(f, 13, 6, P["tear"]); faces["scared"] = f

    f = new(16, 16); eyes(f, 7, 11, 7)
    px(f, 6, 5, P["outline"]); px(f, 7, 6, P["outline"]); px(f, 12, 5, P["outline"]); px(f, 11, 6, P["outline"])
    hline(f, 7, 11, 11, P["outline"]); px(f, 7, 10, P["outline"]); px(f, 11, 10, P["outline"])
    faces["angry"] = f

    f = new(16, 16); eyes(f, 7, 11, 6)
    px(f, 6, 5, P["outline"]); px(f, 12, 5, P["outline"])
    hline(f, 8, 10, 11, P["outline"]); px(f, 7, 12, P["outline"]); px(f, 11, 12, P["outline"])
    px(f, 7, 8, P["tear"]); px(f, 7, 9, P["tear"]); faces["sad"] = f

    f = new(16, 16); eyes(f, 7, 11, 6, "star"); rect(f, 8, 10, 10, 12, P["outline"]); faces["awe"] = f

    f = new(16, 16); eyes(f, 7, 11, 6, "closed"); hline(f, 8, 10, 11, P["outline"])
    px(f, 9, 1, P["yellow"]); hline(f, 7, 11, 0, P["yellow"]); faces["pray"] = f  # нимб-ниточка

    f = new(16, 16); eyes(f, 6, 11, 6, "x"); hline(f, 7, 10, 11, P["outline"]); px(f, 11, 12, P["outline"])
    faces["dizzy"] = f

    f = new(16, 16); eyes(f, 7, 11, 6, "narrow"); hline(f, 9, 11, 11, P["outline"]); faces["suspicious"] = f

    f = new(16, 16); eyes(f, 7, 11, 7)
    hline(f, 6, 8, 5, P["outline"]); hline(f, 10, 12, 5, P["outline"])
    hline(f, 7, 11, 11, P["outline"]); px(f, 11, 10, P["outline"]); faces["determined"] = f

    # «глитч»-лицо для поздних уровней: глаза-пиксели цвета матрицы
    f = new(16, 16); eyes(f, 7, 11, 6, c=P["green"]); hline(f, 7, 11, 11, P["green"]); px(f, 9, 10, P["green"])
    faces["glitch"] = f

    for k, v in faces.items():
        save(f"face_{k}", v)


# ---------------------------------------------------------------- тайлы
def make_tiles():
    rng = random.Random(7)
    for name, pal in PALETTES.items():
        c = {k: hexc(v) for k, v in pal.items()}

        fill = new(16, 16)
        rect(fill, 0, 0, 15, 15, c["fill"])
        for _ in range(9):
            x, y = rng.randrange(16), rng.randrange(16)
            px(fill, x, y, c["speck"])
            px(fill, (x + 1) % 16, y, c["fill_d"])
        if name == "city":  # кирпичная кладка
            rect(fill, 0, 0, 15, 15, c["fill"])
            for y in (3, 7, 11, 15):
                hline(fill, 0, 15, y, c["fill_d"])
            for y0, off in ((0, 0), (4, 4), (8, 0), (12, 4)):
                for x in range(off, 16, 8):
                    rect(fill, x, y0, x, y0 + 2, c["fill_d"])
        if name == "glitch":
            for _ in range(4):
                x, y = rng.randrange(14), rng.randrange(16)
                hline(fill, x, x + 2, y, c["speck"])
        if name == "void":
            rect(fill, 0, 0, 15, 15, c["fill"])
            for y in range(0, 16, 4):
                for x in range(rng.randrange(3), 16, 5):
                    px(fill, x, y, c["speck"])  # «цифровой дождь»
        save(f"tile_{name}_fill", fill)

        top = fill.copy()
        rect(top, 0, 0, 15, 3, c["top"])
        for x in range(16):
            h = 4 + (1 if (x * 7 + 3) % 5 == 0 else 0)
            rect(top, x, 3, x, h - 1, c["top_d"])
        for x in (2, 6, 11, 14):
            px(top, x, 0, c["top_d"])
        save(f"tile_{name}_top", top)

        plat = new(16, 16)
        rect(plat, 0, 0, 15, 4, c["plat"])
        hline(plat, 0, 15, 4, c["plat_d"])
        for x in (0, 8):
            rect(plat, x, 1, x, 3, c["plat_d"])
        rect(plat, 2, 5, 3, 7, c["plat_d"]); rect(plat, 12, 5, 13, 7, c["plat_d"])
        save(f"tile_{name}_platform", plat)

        # фон: холмы 64×32, тайлится по горизонтали
        hills = new(64, 32)
        for x in range(64):
            hgt = 14 + 7 * math.sin(x / 64 * 2 * math.pi) + 3 * math.sin(x / 64 * 6 * math.pi)
            if name == "city":
                hgt = [12, 20, 16, 24, 10, 18, 22, 14][x // 8]
            for y in range(32 - int(hgt), 32):
                px(hills, x, y, c["hill"] if y > 32 - hgt + 2 else c["hill_d"])
            if name == "city" and x % 4 == 1:
                for y in range(32 - int(hgt) + 3, 30, 4):
                    px(hills, x, y, hexc("#fcd83c") if (x + y) % 3 else c["hill_d"])
        save(f"bg_hills_{name}", hills)


def make_cloud():
    img = new(32, 16)
    m = set()
    for cx, cy, r in ((9, 10, 6), (16, 7, 7), (23, 10, 6)):
        m |= disc_mask(32, 16, cx, cy, r, r * 0.8)
    m = {p for p in m if p[1] < 15}
    for (x, y) in m:
        px(img, x, y, P["white"] if y < 11 else P["lgrey"])
    save("bg_cloud", img)


# ---------------------------------------------------------------- ловушки
def make_traps():
    # шипы
    on = new(16, 16)
    for i in range(4):
        x0 = i * 4
        for h in range(8):            # треугольный зуб 4 px в основании, 8 px высотой
            y = 13 - h
            half = 2 - h // 3
            for x in range(x0 + 2 - half, x0 + 2 + max(half, 1)):
                px(on, x, y, P["steel_l"] if x < x0 + 2 else P["steel"])
        px(on, x0 + 1 + (1 if i % 2 else 0), 6, P["white"])
    rect(on, 0, 14, 15, 15, P["steel_d"])
    save("trap_spikes_on", on)
    off = new(16, 16)
    rect(off, 0, 14, 15, 15, P["steel_d"])
    for i in range(4):
        rect(off, i * 4 + 1, 13, i * 4 + 2, 13, P["steel"])
    save("trap_spikes_off", off)

    # пресс
    cr = new(16, 16)
    rect(cr, 0, 0, 15, 15, P["steel"])
    rect(cr, 0, 0, 15, 1, P["steel_l"]); rect(cr, 0, 14, 15, 15, P["steel_d"])
    rect(cr, 0, 0, 0, 15, P["steel_l"]); rect(cr, 15, 0, 15, 15, P["steel_d"])
    for (x, y) in ((2, 2), (13, 2), (2, 12), (13, 12)):
        px(cr, x, y, P["steel_d"])
    # злые глазки у пресса
    rect(cr, 4, 6, 5, 7, P["red"]); rect(cr, 10, 6, 11, 7, P["red"])
    hline(cr, 3, 6, 5, P["black"]); hline(cr, 9, 12, 5, P["black"])
    for x in range(1, 15, 3):
        rect(cr, x, 15, x + 1, 15, P["black"])
    save("trap_crusher", cr)
    chain = new(16, 16)
    for y in range(0, 16, 4):
        rect(chain, 7, y, 8, y + 2, P["dgrey"]); px(chain, 7, y + 1, P["grey"])
    save("trap_chain", chain)

    # люк
    tc = new(16, 16)
    rect(tc, 0, 0, 15, 5, P["wood"]); hline(tc, 0, 15, 0, P["wood_l"]); hline(tc, 0, 15, 5, P["wood_d"])
    for x in (3, 8, 13):
        rect(tc, x, 1, x, 4, P["wood_d"])
    rect(tc, 0, 6, 15, 15, (0, 0, 0, 0))
    px(tc, 1, 2, P["steel_l"]); px(tc, 14, 2, P["steel_l"])
    save("trap_trapdoor_closed", tc)
    to = new(16, 16)
    rect(to, 0, 0, 2, 15, P["wood"]); rect(to, 0, 0, 0, 15, P["wood_l"]); rect(to, 2, 0, 2, 15, P["wood_d"])
    rect(to, 13, 0, 15, 15, P["wood"]); rect(to, 15, 0, 15, 15, P["wood_d"])
    save("trap_trapdoor_open", to)

    # вентилятор (2 кадра)
    for i in range(2):
        fan = new(16, 16)
        rect(fan, 0, 11, 15, 15, P["steel_d"]); hline(fan, 0, 15, 11, P["steel"])
        rect(fan, 6, 8, 9, 10, P["dgrey"])
        blades = [(1, 6, 5, 7), (10, 6, 14, 7)] if i == 0 else [(3, 5, 6, 7), (9, 7, 12, 8)]
        for b in blades:
            rect(fan, *b, P["lgrey"])
        px(fan, 7, 9, P["red"]); px(fan, 8, 9, P["red"])
        save(f"trap_fan_{i}", fan)
    wind = new(4, 4)
    px(wind, 1, 0, P["white"]); px(wind, 2, 1, P["lgrey"]); px(wind, 1, 2, P["lgrey"])
    save("fx_wind", wind)

    # пружина
    sp = new(16, 16)
    rect(sp, 0, 13, 15, 15, P["steel_d"])
    for y in (11, 9):
        hline(sp, 3, 12, y, P["steel_l"]); hline(sp, 3, 12, y + 1, P["steel"])
    rect(sp, 1, 7, 14, 8, P["red"]); hline(sp, 1, 14, 7, hexc("#ff7c7c"))
    save("trap_spring_idle", sp)
    sl = new(16, 16)
    rect(sl, 0, 13, 15, 15, P["steel_d"])
    for y in (11, 8, 5):
        hline(sl, 4, 11, y, P["steel_l"]); hline(sl, 4, 11, y + 1, P["steel"])
    rect(sl, 1, 1, 14, 2, P["red"]); hline(sl, 1, 14, 1, hexc("#ff7c7c"))
    save("trap_spring_launch", sl)


# ---------------------------------------------------------------- объекты уровня
def make_objects():
    # дверь-выход 16×32
    d = new(16, 32)
    rect(d, 1, 2, 14, 31, P["wood_d"])
    rect(d, 3, 4, 12, 31, P["black"])
    for y in range(5, 31):
        for x in range(4, 12):
            if (x + y) % 7 == 0:
                px(d, x, y, hexc("#fcfcaa", 120))
    rect(d, 0, 0, 15, 2, P["wood"]); hline(d, 0, 15, 0, P["wood_l"])
    # табличка EXIT
    rect(d, 4, 6, 11, 9, P["green_d"]); hline(d, 5, 10, 7, P["green"])
    save("obj_exit", d)

    # чекпоинт-флажок
    for state, col in (("off", P["grey"]), ("on", P["green"])):
        f = new(16, 16)
        rect(f, 3, 1, 3, 15, P["dgrey"])
        for y in range(1, 7):
            hline(f, 4, 4 + (7 - y) if y > 3 else 4 + y + 3, y, col)
        rect(f, 1, 15, 5, 15, P["dgrey"])
        save(f"obj_checkpoint_{state}", f)

    # рубильник 32×32
    for state in ("off", "on"):
        r = new(32, 32)
        rect(r, 4, 4, 27, 31, P["steel_d"]); rect(r, 5, 5, 26, 30, P["steel"])
        rect(r, 5, 5, 26, 5, P["steel_l"])
        for x in range(6, 26, 4):  # жёлто-чёрная полоса
            rect(r, x, 27, x + 1, 29, P["yellow"]); rect(r, x + 2, 27, x + 3, 29, P["black"])
        rect(r, 12, 14, 19, 19, P["black"])
        lamp = P["red"] if state == "off" else P["green"]
        rect(r, 7, 7, 9, 9, lamp); rect(r, 22, 7, 24, 9, lamp)
        # рукоять
        if state == "off":
            rect(r, 15, 2, 16, 16, P["dgrey"]); rect(r, 12, 0, 19, 3, P["red"]); hline(r, 12, 19, 0, hexc("#ff7c7c"))
        else:
            rect(r, 15, 16, 16, 29, P["dgrey"]); rect(r, 12, 28, 19, 31, P["red"]); hline(r, 12, 19, 28, hexc("#ff7c7c"))
        save(f"obj_switch_{state}", r)

    # фрагмент кода (глитч-осколок) 8×8
    g = new(8, 8)
    for (x, y, c) in ((3, 0, "cyan"), (2, 1, "cyan"), (3, 1, "white"), (4, 1, "magenta"), (1, 2, "magenta"),
                      (2, 2, "white"), (3, 2, "cyan"), (4, 2, "white"), (5, 2, "cyan"), (2, 3, "cyan"),
                      (3, 3, "white"), (4, 3, "magenta"), (6, 3, "green"), (3, 4, "magenta"), (4, 4, "cyan"),
                      (3, 5, "cyan"), (0, 6, "green"), (3, 6, "white"), (5, 7, "green")):
        px(g, x, y, P[c])
    save("obj_fragment", g)

    # белый пиксель — для вспышек, частиц и затемнения
    w = new(4, 4); rect(w, 0, 0, 3, 3, P["white"]); save("fx_pixel", w)


def contact_sheet():
    names = sorted(sprites)
    cell = 36
    cols = 10
    rows = math.ceil(len(names) / cols)
    sheet = Image.new("RGBA", (cols * cell * 4, rows * cell * 4), hexc("#2a2a3a"))
    for i, n in enumerate(names):
        im = sprites[n]
        s = max(1, min(cell // max(im.width, 1), cell // max(im.height, 1)))
        im2 = im.resize((im.width * s * 4, im.height * s * 4), Image.NEAREST)
        x = (i % cols) * cell * 4 + (cell * 4 - im2.width) // 2
        y = (i // cols) * cell * 4 + (cell * 4 - im2.height) // 2
        sheet.alpha_composite(im2, (x, y))
    SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(SHEET)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    make_ball()
    make_faces()
    make_tiles()
    make_cloud()
    make_traps()
    make_objects()
    contact_sheet()
    print(f"Сгенерировано спрайтов: {len(sprites)} → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
