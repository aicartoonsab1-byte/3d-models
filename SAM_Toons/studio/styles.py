"""SAM_Toons · стили рисовки поверх одного и того же 3D-кадра.

Blender отдаёт на кадр три слоя: линию (режим mult), карту категорий (режим ids: персонаж, существо, богомол, трава,
деревья, земля, вода, холмы, небо… — каждое своим кодовым цветом) и глубину (mist). Стиль — это функция, которая из этих
слоёв рисует кадр: акварель, Limbo, мел, комикс… Персонажи, движение и композиция одинаковы во всех стилях,
меняется только «рука художника». Работает на любом кадре, значит и на всей серии.

  python studio/styles.py board swamp_ep1 s3a 215    # 10 стилей одного кадра → docs/styles/
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "studio"))

# категории — как в blender/sam3d/look.py (ID_COLORS), значения в sRGB после рендера
CATS = {"sky": (0, 0, 0), "ink": (1, 0, 0), "char": (0, 1, 0), "prop": (0, 0, 1), "creature": (1, 1, 0), "mantis": (1, 0, 1),
        "plant": (0, 1, 1), "flower": (1, 0.5, 0), "glow": (0.5, 0, 1), "tree": (0, 0.5, 0), "ground": (0.5, 0.5, 0.5),
        "water": (0, 0, 0.5), "hill": (0.5, 0, 0), "moon": (0.5, 0.5, 1), "white": (1, 1, 1)}
NAMES = list(CATS)


def _srgb(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055) * 255


class Frame:
    """Слои одного кадра: ink (0..1, 1 — чернила), cat (индекс категории), depth (0 близко … 1 далеко)."""

    def __init__(self, line: Path, ids: Path, mist: Path):
        g = np.asarray(Image.open(line).convert("L"), np.float32) / 255
        self.ink = np.clip((0.88 - g) / 0.62, 0, 1)
        rgb = np.asarray(Image.open(ids).convert("RGB"), np.float32)
        pal = np.stack([_srgb(CATS[n]) for n in NAMES])
        d = ((rgb[:, :, None, :] - pal[None, None]) ** 2).sum(-1)
        self.cat = d.argmin(-1)
        m = np.asarray(Image.open(mist), np.float32); self.depth = m / (m.max() or 1)
        self.h, self.w = self.ink.shape
        self.rng = np.random.default_rng(3)

    def mask(self, *names) -> np.ndarray:
        return np.isin(self.cat, [NAMES.index(n) for n in names]).astype(np.float32)

    def paint(self, colors: dict, default=(1, 1, 1)) -> np.ndarray:
        """Заливка по категориям: colors = {категория: (r,g,b) 0..1}."""
        lut = np.array([colors.get(n, default) for n in NAMES], np.float32)
        return lut[self.cat]

    # -- фактуры
    def noise(self, scale: float, seed: int = 0) -> np.ndarray:
        r = np.random.default_rng(seed)
        small = r.random((max(2, int(self.h / scale)), max(2, int(self.w / scale)))).astype(np.float32)
        return np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((self.w, self.h), Image.BICUBIC), np.float32) / 255

    def paper(self, strength=0.06, seed=1) -> np.ndarray:
        n = 0.6 * self.noise(3, seed) + 0.4 * self.noise(40, seed + 1)
        fib = self.noise(1.2, seed + 2)
        return 1 - strength * (n * 0.8 + (fib > 0.93) * 0.6)

    def grain(self, amount=0.05, seed=4) -> np.ndarray:
        return np.random.default_rng(seed).normal(0, amount, (self.h, self.w)).astype(np.float32)

    def vignette(self, power=0.45) -> np.ndarray:
        y, x = np.mgrid[0:self.h, 0:self.w]
        r = np.sqrt(((x - self.w / 2) / (self.w / 2)) ** 2 + ((y - self.h / 2) / (self.h / 2)) ** 2)
        return np.clip(1 - power * r ** 2.2, 0, 1)

    def blur(self, a: np.ndarray, r: float) -> np.ndarray:
        """Почти гауссово размытие: три прохода «скользящего среднего» по обеим осям (numpy, любые значения)."""
        k = max(1, int(round(r * 1.15)))
        out = a.astype(np.float32)
        for axis in (0, 1):
            for _ in range(3):
                pad = [(0, 0)] * out.ndim; pad[axis] = (k + 1, k)
                c = np.cumsum(np.pad(out, pad, mode="edge"), axis=axis, dtype=np.float64)
                hi = np.take(c, np.arange(2 * k + 1, c.shape[axis]), axis=axis)
                lo = np.take(c, np.arange(0, c.shape[axis] - 2 * k - 1), axis=axis)
                out = ((hi - lo) / (2 * k + 1)).astype(np.float32)
        return out

    def thick(self, ink: np.ndarray, size=3) -> np.ndarray:
        return np.asarray(Image.fromarray((ink * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(size)), np.float32) / 255

    def shift(self, a, dx, dy):
        return np.roll(np.roll(a, dy, 0), dx, 1)


def _ink_over(img, ink, color=(0.05, 0.05, 0.07)):
    return img * (1 - ink[..., None]) + np.asarray(color, np.float32) * ink[..., None]


def _sky_grad(f: Frame, top, bottom):
    t = np.linspace(0, 1, f.h, dtype=np.float32)[:, None, None]
    return np.asarray(top, np.float32) * (1 - t) + np.asarray(bottom, np.float32) * t + np.zeros((1, f.w, 1), np.float32)


def _clip(a):
    return (np.clip(a, 0, 1) * 255).astype(np.uint8)


# ---------------------------------------------------------------- 10 стилей
def s_mult(f: Frame):
    """Мульт: тонкая чёрная линия на белом (как референс)."""
    img = np.ones((f.h, f.w, 3), np.float32) * f.paper(0.035)[..., None]
    return _ink_over(img, f.ink)


def s_mult_red(f: Frame):
    """Мульт + красный акцент: всё чёрно-белое, красным — только «чужое» (богомолье) и светящееся."""
    img = np.ones((f.h, f.w, 3), np.float32) * f.paper(0.035)[..., None]
    red = f.mask("mantis", "glow", "flower")
    img = img * (1 - 0.9 * red[..., None]) + np.array([0.86, 0.13, 0.12]) * 0.9 * red[..., None]
    return _ink_over(img, f.ink)


def s_watercolor(f: Frame):
    """Акварель: прозрачные заливки с затёками и тёмной кромкой, сепия-линия, бумага."""
    pal = {"sky": (0.78, 0.88, 0.93), "char": (0.99, 0.9, 0.78), "prop": (0.6, 0.62, 0.7), "creature": (0.86, 0.68, 0.48),
           "mantis": (0.6, 0.8, 0.45), "plant": (0.55, 0.72, 0.5), "flower": (0.97, 0.75, 0.8), "glow": (1, 0.9, 0.5),
           "tree": (0.6, 0.78, 0.55), "ground": (0.87, 0.84, 0.7), "water": (0.55, 0.72, 0.85), "hill": (0.72, 0.78, 0.86),
           "moon": (0.97, 0.95, 0.85), "ink": (0.3, 0.22, 0.18)}
    base = f.paint(pal)
    wet = f.blur(base, 2.5)
    edge = np.abs(base - f.blur(base, 6)).sum(-1)
    gran = 0.9 + 0.2 * f.noise(6, 7)[..., None]
    img = 1 - (1 - wet) * gran * (1 + 1.6 * np.clip(edge, 0, 0.5)[..., None])
    img = img * f.paper(0.08, 2)[..., None]
    ink = f.blur(f.ink, 0.6) * 0.75
    return _ink_over(img, ink, (0.25, 0.17, 0.12))


def s_limbo(f: Frame):
    """Limbo: чёрные силуэты в сером тумане, светящиеся глаза, виньетка и зерно."""
    fog = _sky_grad(f, (0.78, 0.78, 0.76), (0.55, 0.55, 0.53))
    obj = 1 - f.mask("sky", "moon")
    k = np.clip(f.depth ** 1.3 * 0.95, 0, 0.9)[..., None]
    sil = np.asarray((0.03, 0.03, 0.03), np.float32) * (1 - k) + fog * k
    img = fog * (1 - obj[..., None]) + sil * obj[..., None]
    eyes = f.mask("ink") * (f.depth < 0.35)
    img = img * (1 - eyes[..., None]) + eyes[..., None] * 0.97
    glow = f.blur(eyes, 3) * 0.7
    img = img + glow[..., None]
    img = f.blur(img, 0.6) * f.vignette(0.7)[..., None] + f.grain(0.035)[..., None]
    return img


def s_dusk(f: Frame):
    """Сумерки: бирюзовое небо, охра, тёмные силуэты дальнего плана, чёрная линия."""
    pal = {"char": (0.93, 0.8, 0.62), "prop": (0.3, 0.33, 0.36), "creature": (0.72, 0.55, 0.3), "mantis": (0.45, 0.62, 0.25),
           "plant": (0.2, 0.33, 0.2), "flower": (0.96, 0.92, 0.6), "glow": (0.98, 0.92, 0.55), "tree": (0.13, 0.2, 0.22),
           "ground": (0.16, 0.25, 0.22), "water": (0.1, 0.22, 0.26), "hill": (0.2, 0.32, 0.36), "moon": (0.96, 0.94, 0.78),
           "ink": (0.06, 0.07, 0.1)}
    sky = _sky_grad(f, (0.25, 0.54, 0.52), (0.62, 0.82, 0.72))
    img = f.paint(pal)
    s = f.mask("sky")[..., None]
    img = img * (1 - s) + sky * s
    haze = (np.clip(f.depth - 0.3, 0, 1) * 0.5 * (1 - s[..., 0]))[..., None]
    img = img * (1 - haze) + np.array([0.45, 0.66, 0.62]) * haze
    return _ink_over(img, f.thick(f.ink, 3) * 0.9, (0.05, 0.07, 0.1)) + f.grain(0.02)[..., None]


def s_pencil(f: Frame):
    """Карандаш: графитовая линия в два-три прохода, штриховка, тёплая бумага."""
    img = np.ones((f.h, f.w, 3), np.float32) * np.array([0.97, 0.95, 0.9]) * f.paper(0.07, 5)[..., None]
    g = np.maximum.reduce([f.ink, f.shift(f.ink, 1, 1) * 0.6, f.shift(f.ink, -2, 0) * 0.35])
    g = g * (0.75 + 0.25 * f.noise(1.5, 9))
    y, x = np.mgrid[0:f.h, 0:f.w]
    hatch = ((x + y) % 7 < 1).astype(np.float32)
    cross = ((x - y) % 9 < 1).astype(np.float32)
    shade = f.mask("water", "tree") * np.maximum(hatch, cross) * 0.45 + f.mask("hill", "creature", "mantis") * hatch * 0.3 \
        + f.mask("ground") * hatch * 0.12 * (f.noise(30, 3) > 0.5)
    shade = shade * (0.6 + 0.4 * f.noise(2, 11))
    ink = np.clip(np.maximum(g, shade), 0, 1)
    return _ink_over(img, ink * 0.85, (0.22, 0.22, 0.24))


def s_chalk(f: Frame):
    """Мел на доске: белая «крошащаяся» линия, лёгкая меловая заливка героев."""
    board = np.array([0.12, 0.18, 0.15]) * (0.85 + 0.3 * f.noise(60, 2))[..., None] + f.grain(0.015)[..., None]
    smudge = f.blur(f.ink, 8)[..., None] * 0.12
    crumb = (f.noise(0.9, 13) > 0.25).astype(np.float32)
    ink = f.thick(f.ink, 3) * crumb * 0.95
    fill = (f.mask("char", "creature", "mantis", "flower", "moon") * (f.noise(1.3, 17) > 0.55) * 0.18)[..., None]
    img = board + smudge + fill
    return img * (1 - ink[..., None]) + np.array([0.94, 0.95, 0.9]) * ink[..., None]


def s_neon(f: Frame):
    """Неон: светящиеся линии на чёрном, цвет — по тому, что обведено."""
    col = {"char": (0.4, 1, 1), "prop": (0.4, 1, 1), "ink": (1, 1, 1), "creature": (1, 0.8, 0.2), "mantis": (0.6, 1, 0.3),
           "plant": (0.3, 1, 0.6), "flower": (1, 0.4, 0.8), "glow": (1, 0.95, 0.4), "tree": (0.3, 0.9, 0.5), "ground": (0.5, 0.3, 1),
           "water": (0.3, 0.6, 1), "hill": (0.8, 0.3, 1), "moon": (1, 1, 0.8), "sky": (0.5, 0.3, 1)}
    near = f.paint(col)
    near = np.asarray(Image.fromarray(_clip(near)).filter(ImageFilter.MaxFilter(5)), np.float32) / 255     # цвет «с обеих сторон» линии
    ink = f.ink * (1 - 0.8 * f.mask("ground") * (f.depth > 0.05))       # крапинки земли гасим
    lines = near * ink[..., None]
    glow = f.blur(lines, 4) * 2.2 + f.blur(lines, 12) * 1.6
    bg = np.array([0.02, 0.01, 0.05]) + _sky_grad(f, (0.0, 0.0, 0.03), (0.05, 0.0, 0.08))
    return bg + lines * 1.3 + glow


def s_comic(f: Frame):
    """Комикс: яркие плоские цвета, толстый контур, растровые точки в небе и на земле."""
    pal = {"sky": (0.55, 0.82, 1), "char": (1, 0.87, 0.7), "prop": (0.9, 0.2, 0.2), "creature": (0.95, 0.6, 0.2), "mantis": (0.35, 0.8, 0.25),
           "plant": (0.2, 0.7, 0.35), "flower": (1, 0.35, 0.55), "glow": (1, 0.95, 0.2), "tree": (0.25, 0.75, 0.35),
           "ground": (0.95, 0.85, 0.45), "water": (0.2, 0.5, 0.95), "hill": (0.45, 0.65, 0.95), "moon": (1, 1, 0.8), "ink": (0.05, 0.05, 0.05)}
    img = f.paint(pal)
    y, x = np.mgrid[0:f.h, 0:f.w]
    cell = 9; cx = (x % cell) - cell / 2; cy = (y % cell) - cell / 2
    dots = ((cx ** 2 + cy ** 2) < (cell * 0.32) ** 2).astype(np.float32)
    zone = f.mask("sky") * (y / f.h < 0.35) + f.mask("ground") * (1 - f.depth) * 0.9
    img = img * (1 - (dots * zone * 0.22)[..., None])
    ink = f.thick(f.ink * (1 - 0.85 * f.mask("ground")), 5)
    return _ink_over(img, np.clip(ink * 1.3, 0, 1), (0.04, 0.04, 0.05))


def s_oldfilm(f: Frame):
    """Старый мульт 30-х: чёрные тела и белые лица, толстый контур, сепия, зерно и царапины."""
    base = np.ones((f.h, f.w), np.float32) * 0.93
    black = f.mask("creature", "mantis", "tree", "prop")
    body = f.mask("char") * (np.arange(f.h)[:, None] > _head_line(f))
    base = base * (1 - black) + 0.08 * black
    base = base * (1 - body) + 0.08 * body
    base = base - 0.18 * f.mask("hill") - 0.08 * f.mask("ground") * (1 - f.depth) - 0.3 * f.mask("water")
    ink = f.thick(f.ink * (1 - 0.7 * f.mask("ground")), 3)
    g = base * (1 - ink) + 0.05 * ink
    g = g * f.vignette(0.8) + f.grain(0.06)
    r = np.random.default_rng(8)
    for _ in range(9):                                       # царапины плёнки
        x0 = r.integers(0, f.w); g[:, x0:x0 + 1] += r.uniform(-0.25, 0.3)
    g = np.clip(g, 0, 1)
    return np.stack([g * 1.0, g * 0.9, g * 0.72], -1) + 0.03


def _head_line(f: Frame) -> float:
    """Где у персонажа кончается голова (для «белое лицо, чёрное тело»): самая широкая часть силуэта сверху."""
    m = f.mask("char")
    rows = m.sum(1); ys = np.nonzero(rows > 0)[0]
    if not len(ys):
        return f.h
    top = ys[0]; widest = top + int(np.argmax(rows[top:top + f.h // 3]))
    return widest + (widest - top) * 0.95


STYLES = [("mult", "1. Мульт — чёрная линия на белом", s_mult), ("mult_red", "2. Мульт + красный акцент", s_mult_red),
          ("watercolor", "3. Акварель", s_watercolor), ("limbo", "4. Limbo — силуэты в тумане", s_limbo),
          ("dusk", "5. Сумерки — цветная иллюстрация", s_dusk), ("pencil", "6. Карандашный набросок", s_pencil),
          ("chalk", "7. Мел на доске", s_chalk), ("neon", "8. Неон", s_neon), ("comic", "9. Комикс", s_comic),
          ("oldfilm", "10. Старый мульт 30-х", s_oldfilm)]


def render(style: str, f: Frame) -> Image.Image:
    fn = {k: fn for k, _, fn in STYLES}[style]
    return Image.fromarray(_clip(fn(f)))


# ---------------------------------------------------------------- лист выбора стиля
def passes(spec: dict, frame: int, out: Path, size=(1280, 720)) -> Frame:
    """Отрендерить в Blender линию и карту категорий одного кадра плана."""
    out.mkdir(parents=True, exist_ok=True)
    for mode in ("mult", "ids"):
        s = json.loads(json.dumps(spec)); s["size"] = list(size); s["style"] = {**s.get("style", {}), "look": mode, "twos": False}
        (out / f"{mode}.json").write_text(json.dumps(s), encoding="utf-8")
        r = subprocess.run(["blender", "-b", "--factory-startup", "-P", str(ROOT / "blender/shot.py"), "--", str(out / f"{mode}.json"),
                            str(out / mode), "--pick", str(frame)], capture_output=True, text=True)
        if "SHOT_DONE" not in r.stdout:
            raise SystemExit(r.stdout[-2000:] + r.stderr[-2000:])
    n = f"{frame:04d}"
    return Frame(out / "mult" / f"f_{n}.jpg", out / "ids" / f"f_{n}.png", out / "ids" / f"mist_{n}.png")


def board(f: Frame, out_dir: Path) -> Path:
    from storyboard import _font
    out_dir.mkdir(parents=True, exist_ok=True)
    tw, th, pad, cap = 620, 349, 14, 34
    sheet = Image.new("RGB", (pad + 2 * (tw + pad), pad + 5 * (th + cap + pad)), (250, 250, 248)); d = ImageDraw.Draw(sheet)
    font = _font(22)
    for i, (key, title, _) in enumerate(STYLES):
        im = render(key, f); im.save(out_dir / f"{i + 1:02d}_{key}.jpg", quality=90)
        x, y = pad + (i % 2) * (tw + pad), pad + (i // 2) * (th + cap + pad)
        d.text((x + 2, y + 4), title, fill=(20, 20, 20), font=font)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + cap))
    p = out_dir / "styles_board.jpg"; sheet.save(p, quality=88)
    return p


if __name__ == "__main__":
    if len(sys.argv) >= 5 and sys.argv[1] == "board":
        film, shot, frame = sys.argv[2], sys.argv[3], int(sys.argv[4])
        d = ROOT / "films" / film
        spec = next(p for p in sorted((d / "build/shots").glob(f"{shot}_*/spec.json")))
        fr = passes(json.loads(spec.read_text(encoding="utf-8")), frame, d / "build/style_passes")
        print(board(fr, ROOT / "docs/styles"))
    else:
        print(__doc__)
