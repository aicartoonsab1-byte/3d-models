"""Конструктор ASCII-сеток уровней — чтобы не набирать строки руками и не ошибаться с шириной.

Координаты как в игре: x вправо от 0, y ВВЕРХ от 0 (низ уровня).

Пример:
    import sys; sys.path.insert(0, "Tools/levels")
    from gridkit import Grid
    g = Grid(80, 13)
    g.ground(0, 20, 4)          # земля в колонках 0..20 высотой 4 (верх земли на y=4, шарик стоит на y=4)
    g.ground(24, 79, 4)         # яма в колонках 21..23
    g.put("S", 2, 4)            # старт на земле
    g.put("^", 30, 4)           # шипы на земле
    g.platform(40, 44, 7)       # платформа '=' на y=7
    g.put("C", 50, 8)           # пресс висит над землёй
    g.put("F", 78, 4)
    rows = g.rows()             # → list[str] для поля "grid"
    g.save("Assets/_Project/Resources/Levels/99_test.json", meta)   # meta — dict без grid
"""
from __future__ import annotations

import json
from pathlib import Path


class Grid:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.cells = [["."] * w for _ in range(h)]   # cells[y][x], y вверх

    def _ok(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def put(self, ch: str, x: int, y: int):
        if not self._ok(x, y):
            raise ValueError(f"({x},{y}) вне уровня {self.w}×{self.h}")
        self.cells[y][x] = ch
        return self

    def get(self, x: int, y: int) -> str:
        return self.cells[y][x] if self._ok(x, y) else "."

    def fill(self, x0: int, x1: int, y0: int, y1: int, ch: str = "#"):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if self._ok(x, y):
                    self.cells[y][x] = ch
        return self

    def ground(self, x0: int, x1: int, height: int):
        """Столбы земли от низа до height-1 включительно. Шарик стоит на клетках y = height.
        Только ДОБАВЛЯЕТ землю. Чтобы понизить столб или вырезать ямку — fill(x0, x1, y0, y1, ".")."""
        return self.fill(x0, x1, 0, height - 1, "#")

    def pit(self, x0: int, x1: int):
        """Бездонная яма: очистить колонки целиком."""
        return self.fill(x0, x1, 0, self.h - 1, ".")

    def platform(self, x0: int, x1: int, y: int):
        return self.fill(x0, x1, y, y, "=")

    def block(self, x0: int, x1: int, y0: int, y1: int):
        """Висящий/нависающий блок земли."""
        return self.fill(x0, x1, y0, y1, "#")

    def floor_y(self, x: int) -> int:
        """Первая свободная клетка над самой верхней землёй в колонке x (куда ставить объекты)."""
        for y in range(self.h - 1, -1, -1):
            if self.cells[y][x] in "#=T":
                return y + 1
        return 0

    def rows(self) -> list[str]:
        return ["".join(self.cells[y]) for y in range(self.h - 1, -1, -1)]

    def show(self):
        for i, r in enumerate(self.rows()):
            print(f"{self.h - 1 - i:2} {r}")

    def save(self, path: str | Path, meta: dict):
        data = dict(meta)
        data["grid"] = self.rows()
        Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
