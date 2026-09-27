"""Общая библиотека для инструментов уровней: загрузка, физика шарика, поиск пути.

Физические константы ДОЛЖНЫ совпадать с Assets/_Project/Scripts/Core/Tuning.cs.
Если меняете одно — меняйте и другое.
"""
from __future__ import annotations

import json
import math
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEVELS_DIR = ROOT / "Assets/_Project/Resources/Levels"
PREVIEWS_DIR = ROOT / "Design/previews"
CAMPAIGN = "sharik"


def use_campaign(argv: list) -> list:
    """Разбирает «--campaign <id>» из аргументов: уровни берутся из Resources/Campaigns/<id>/levels,
    превью кладутся в Design/campaigns/<id>/previews. Возвращает argv без этого флага."""
    global LEVELS_DIR, PREVIEWS_DIR, CAMPAIGN
    if "--campaign" in argv:
        i = argv.index("--campaign")
        cid = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
        if cid != "sharik":
            CAMPAIGN = cid
            cj = ROOT / f"Assets/_Project/Resources/Campaigns/{cid}/campaign.json"
            if cj.exists():
                for k, d in (json.loads(cj.read_text(encoding="utf-8")).get("bosses") or {}).items():
                    BOSSES.setdefault(k, (d or {}).get("title", k))
            LEVELS_DIR = ROOT / f"Assets/_Project/Resources/Campaigns/{cid}/levels"
            PREVIEWS_DIR = ROOT / f"Design/campaigns/{cid}/previews"
    return argv

# ---- физика (синхронно с Tuning.cs) -------------------------------------
GRAVITY = 9.81 * 3.0          # Physics2D.gravity * gravityScale
RUN_SPEED = 6.0               # макс. скорость качения, тайлов/с
JUMP_SPEED = 14.5             # начальная вертикальная скорость прыжка (≈3.6 клетки вверх)
BALL_RADIUS = 0.45
SPLAT_SPEED = 17.0            # удар о землю быстрее этого → лепёшка (без смерти)

# ---- легенда --------------------------------------------------------------
LEGEND = {
    ".": "пусто",
    " ": "пусто",
    "#": "земля (твёрдый блок)",
    "=": "тонкая платформа (запрыгнуть снизу можно, стоять сверху можно)",
    "S": "старт шарика (ровно один)",
    "F": "выход-дверь (финиш уровня)",
    "R": "РУБИЛЬНИК (только в финальном уровне; вместо F)",
    "K": "чекпоинт-флажок",
    "*": "фрагмент кода (сюжетная находка, текст берётся из fragments[])",
    "^": "ЛОВУШКА: шипы (стоят на земле, по умолчанию спрятаны)",
    "C": "ЛОВУШКА: пресс (висит, по сигналу падает вниз до земли)",
    "T": "ЛОВУШКА: люк (твёрдый, по сигналу открывается)",
    "W": "ЛОВУШКА: вентилятор (стоит на земле, дует вверх на 5 клеток)",
    "J": "ЛОВУШКА: пружина (стоит на земле, подбрасывает вверх)",
    "B": "БОСС (стоит на земле; вид задаётся полем \"boss\": stag | watcher | worm | keeper)",
    "X": "рассыпающийся блок (твёрдый; если шарик задержится на нём ~0.6 с — осыпается на 4 с)",
    "O": "гриб-батут (твёрдый блок; мягкая посадка без лепёшки; прыжок с него в 1.45 раза сильнее ≈ 7 клеток вверх)",
    ">": "конвейер вправо (земля, тащит шарика на +2 кл/с)",
    "<": "конвейер влево (земля, тащит шарика на −2 кл/с)",
    "~": "лёд (земля, шарика заносит — медленно разгоняется и тормозит)",
    "@": "портал (пары по порядку слева направо: 1-й — вход, 2-й — выход; 3-й — вход, 4-й — выход…)",
}
BOSSES = {
    "stag": "Лунный Олень — стоит над дорогой (шарик катится под брюхом), топот подбрасывает шарик",
    "watcher": "Всевидящий — парит над дорогой, стреляет взглядом (лепёшка)",
    "worm": "Кодовый Червь — живёт в земле, выныривает прямо под шариком в радиусе 10 клеток",
    "keeper": "Хранитель — лежит у рубильника, рёвом отбрасывает шарик назад",
}
SOLID = set("#TX<>~O")          # что считается твёрдым в пассивном состоянии ловушек
MUSHROOM_POWERS = (1.45, 1.25)  # прыжок с гриба-батута (синхронно с Navigator.cs)
PLATFORM = set("=")
TRAPS = set("^CTWJB")
TRAP_NAMES = {"^": "spikes", "C": "crusher", "T": "trapdoor", "W": "fan", "J": "spring", "B": "boss"}
PALETTES = ["meadow", "cave", "city", "glitch", "void"]
MOODS = ["neutral", "happy", "scared", "angry", "sad", "awe", "pray", "dizzy",
         "suspicious", "determined", "glitch"]

MAX_W, MAX_H = 220, 40


@dataclass
class Level:
    path: Path
    data: dict
    grid: list[str] = field(default_factory=list)

    @property
    def w(self):
        return len(self.grid[0]) if self.grid else 0

    @property
    def h(self):
        return len(self.grid)

    # Координаты: x вправо, y ВВЕРХ (как в Unity). Строка 0 в JSON — верх уровня.
    def ch(self, x: int, y: int) -> str:
        if x < 0 or x >= self.w or y < 0:
            return "."
        if y >= self.h:
            return "."
        return self.grid[self.h - 1 - y][x]

    def find(self, c: str) -> list[tuple[int, int]]:
        out = []
        for row_i, row in enumerate(self.grid):
            for x, cc in enumerate(row):
                if cc == c:
                    out.append((x, self.h - 1 - row_i))
        return out

    def solid(self, x: int, y: int) -> bool:
        if x < 0 or x >= self.w:
            return True           # стены по краям уровня
        return self.ch(x, y) in SOLID

    def blocks_ball(self, x: int, y: int) -> bool:
        """Твёрдое для тела шарика (кроме платформ — сквозь них можно пролететь снизу)."""
        return self.solid(x, y)

    def portals(self) -> dict:
        """Вход → выход. Порталы парами по порядку слева направо (при равном x — сверху вниз)."""
        cells = sorted(self.find("@"), key=lambda c: (c[0], -c[1]))
        return {cells[i]: cells[i + 1] for i in range(0, len(cells) - 1, 2)}

    def landing_below(self, x: int, y: int):
        """Куда шарик упадёт из клетки (x,y): первая стоячая клетка вниз или None (бездна)."""
        for yy in range(y, -1, -1):
            if self.standable(x, yy):
                return (x, yy)
            if self.solid(x, yy):
                return None
        return None

    def standable(self, x: int, y: int) -> bool:
        """Клетка, в которой шарик может стоять (сам пустой, под ним опора)."""
        if not (0 <= x < self.w and 0 <= y < self.h):
            return False
        c = self.ch(x, y)
        if c in SOLID or c in PLATFORM:
            return False
        below = self.ch(x, y - 1)
        return below in SOLID or below in PLATFORM


def load(path: Path) -> Level:
    data = json.loads(path.read_text(encoding="utf-8"))
    return Level(path=path, data=data, grid=list(data.get("grid", [])))


def all_levels() -> list[Level]:
    # мини-игры ("mode": "pingpong" и т.п.) — не платформер, валидатор/автоплей их пропускают
    return [lv for lv in (load(p) for p in sorted(LEVELS_DIR.glob("*.json"))) if lv.data.get("mode", "platform") == "platform"]


def levels_dir():
    return LEVELS_DIR


# ---- симуляция прыжка -------------------------------------------------------
def _collides(lv: Level, cx: float, cy: float, vy: float) -> str | None:
    """Проверка круга шарика против тайлов. Возвращает 'solid' / 'land' / None."""
    r = BALL_RADIUS * 0.92
    for tx in range(math.floor(cx - r), math.floor(cx + r) + 1):
        for ty in range(math.floor(cy - r), math.floor(cy + r) + 1):
            c = lv.ch(tx, ty) if 0 <= tx < lv.w else "#"
            if c in SOLID or (0 > tx or tx >= lv.w):
                nx = min(max(cx, tx), tx + 1)
                ny = min(max(cy, ty), ty + 1)
                if (cx - nx) ** 2 + (cy - ny) ** 2 < r * r:
                    return "solid"
            elif c in PLATFORM and vy <= 0:
                # платформа держит только сверху: верх платформы на ty+1
                top = ty + 1
                if cy - r <= top <= cy - r + 0.35 and tx - 0.2 <= cx <= tx + 1.2:
                    return ("land", top)
    return None


def simulate(lv: Level, sx: int, sy: int, vx: float, jump: bool, dt: float = 1 / 60,
             tmax: float = 3.0, power: float = 1.0):
    """Бросок шарика из клетки (sx,sy). Возвращает (клетка_приземления, макс_скорость_падения) или None."""
    x, y = sx + 0.5, sy + BALL_RADIUS
    vy = JUMP_SPEED * power if jump else 0.0
    t = 0.0
    left_ground = jump
    while t < tmax:
        vy -= GRAVITY * dt
        nx, ny = x + vx * dt, y + vy * dt
        hit = _collides(lv, nx, ny, vy)
        land_top = None
        if isinstance(hit, tuple):
            hit, land_top = hit
        if hit == "solid":
            # пробуем скользить: сначала только по y, потом только по x
            if _collides(lv, x, ny, vy) != "solid":
                nx = x
                vx = 0.0
            elif _collides(lv, nx, y, vy) != "solid":
                if vy < 0:     # приземлились на твёрдое
                    cell = (math.floor(nx), math.floor(y - BALL_RADIUS + 0.05))
                    soft = lv.ch(cell[0], cell[1] - 1) == "O"   # гриб гасит удар
                    return (cell, 0.0 if soft else -vy) if lv.standable(*cell) else None
                ny = y
                vy = 0.0
            else:
                return None
        elif hit == "land" and left_ground:
            # стоим НАД платформой: клетка = верх платформы (а не сама платформа)
            cell = (math.floor(nx), land_top)
            if not lv.standable(*cell):
                cell = (math.floor(nx - 0.3) if lv.standable(math.floor(nx - 0.3), land_top) else math.floor(nx + 0.3), land_top)
            return (cell, -vy) if lv.standable(*cell) else None
        if ny < y and not left_ground:
            left_ground = True
        x, y = nx, ny
        if y < -2:
            return None
        t += dt
    return None


def neighbors(lv: Level, x: int, y: int):
    """Все клетки, куда шарик может попасть из стоячей клетки (x,y)."""
    out = {}
    # вход в портал — только телепорт (шарик проваливается в него, едва коснувшись)
    exit_ = lv.portals().get((x, y))
    if exit_:
        land = lv.landing_below(*exit_)
        if land:
            out[land] = ("portal", 0.0)
        return out
    # ходьба
    for dx in (-1, 1):
        if lv.standable(x + dx, y):
            out[(x + dx, y)] = ("walk", 0.0)
    # прыжки и скатывания с разной горизонтальной скоростью
    variants = [(True, 1.0), (True, 0.85), (True, 0.7), (True, 0.55), (False, 1.0)]
    if lv.ch(x, y - 1) == "O":                      # с гриба-батута — выше
        variants = [(True, p) for p in MUSHROOM_POWERS] + variants
    for jump, power in variants:
        for k in range(-8, 9):
            vx = RUN_SPEED * k / 8
            if not jump and abs(vx) < 1.0:
                continue
            res = simulate(lv, x, y, vx, jump, power=power)
            if res:
                cell, fall = res
                if cell != (x, y) and cell not in out:
                    out[cell] = ("jump" if jump else "drop", fall)
    return out


def solve(lv: Level):
    """BFS от S до F/R. Возвращает (путь, все_достижимые) — путь None, если непроходимо."""
    starts = lv.find("S")
    goals = set(lv.find("F") + lv.find("R"))
    if not starts or not goals:
        return None, set()
    start = starts[0]
    # шарик может «проваливаться» на опору под стартом
    while not lv.standable(*start) and start[1] > 0:
        start = (start[0], start[1] - 1)
    prev = {start: None}
    q = deque([start])
    found = None
    while q:
        cur = q.popleft()
        if cur in goals or (cur[0], cur[1] + 1) in goals:
            found = cur
            break
        for nb in neighbors(lv, *cur):
            if nb not in prev:
                prev[nb] = cur
                q.append(nb)
    if not found:
        return None, set(prev)
    path = []
    c = found
    while c is not None:
        path.append(c)
        c = prev[c]
    return list(reversed(path)), set(prev)
