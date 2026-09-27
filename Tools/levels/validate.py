#!/usr/bin/env python3
"""Валидатор уровней «Шарика».

Проверяет схему JSON, правила расстановки и ПРОХОДИМОСТЬ: симулирует прыжки
шарика с теми же константами физики, что и в Unity, и ищет путь от S до F/R
при пассивных ловушках (шипы спрятаны, люки закрыты, пресс наверху).

Запуск:
    python3 Tools/levels/validate.py              # все уровни
    python3 Tools/levels/validate.py 03_*.json    # по маске
    python3 Tools/levels/validate.py --json       # машиночитаемый отчёт (для агентов)
Код возврата 1, если есть ошибки.
"""
from __future__ import annotations

import fnmatch
import json
import sys

from levellib import (BOSSES, LEGEND, LEVELS_DIR, MAX_H, MAX_W, MOODS, PALETTES, PLATFORM, SOLID, SPLAT_SPEED,
                      TRAP_NAMES, TRAPS, Level, all_levels, neighbors, solve)

REQUIRED = {"id": str, "order": int, "title": str, "act": int, "awareness": int, "palette": str,
            "storyBeat": str, "intro": list, "outro": list, "lines": list, "fragments": list, "grid": list}


def check(lv: Level) -> dict:
    errors, warnings, info = [], [], []
    d = lv.data

    for k, t in REQUIRED.items():
        if k not in d:
            errors.append(f"нет поля '{k}'")
        elif not isinstance(d[k], t):
            errors.append(f"поле '{k}' должно быть {t.__name__}")
    if errors:
        return dict(file=lv.path.name, ok=False, errors=errors, warnings=warnings, info=info)

    if d["id"] != lv.path.stem:
        errors.append(f"id '{d['id']}' не совпадает с именем файла '{lv.path.stem}'")
    if not 0 <= d["awareness"] <= 5:
        errors.append("awareness должен быть 0..5")
    if d["palette"] not in PALETTES:
        errors.append(f"palette должна быть одной из {PALETTES}")

    g = lv.grid
    if not g:
        errors.append("пустой grid")
        return dict(file=lv.path.name, ok=False, errors=errors, warnings=warnings, info=info)
    widths = {len(r) for r in g}
    if len(widths) != 1:
        errors.append(f"строки grid разной длины: {sorted(widths)}")
        return dict(file=lv.path.name, ok=False, errors=errors, warnings=warnings, info=info)
    if lv.w > MAX_W or lv.h > MAX_H:
        errors.append(f"уровень слишком большой: {lv.w}×{lv.h} (макс {MAX_W}×{MAX_H})")
    if lv.h < 10:
        errors.append("высота уровня должна быть ≥ 10 строк (камера видит ~11 клеток)")
    bad = {c for r in g for c in r if c not in LEGEND}
    if bad:
        errors.append(f"неизвестные символы в grid: {''.join(sorted(bad))}")

    s, f, r = lv.find("S"), lv.find("F"), lv.find("R")
    if len(s) != 1:
        errors.append(f"должен быть ровно один S (найдено {len(s)})")
    if len(f) + len(r) != 1:
        errors.append(f"должен быть ровно один финиш F или рубильник R (найдено F={len(f)}, R={len(r)})")
    if r and not d.get("final", False):
        errors.append("R (рубильник) разрешён только в уровне с \"final\": true")
    if d.get("final") and not r:
        errors.append("финальный уровень должен содержать R")

    stars = lv.find("*")
    if len(stars) != len(d["fragments"]):
        errors.append(f"число '*' в grid ({len(stars)}) ≠ длине fragments ({len(d['fragments'])})")

    for i, line in enumerate(d["lines"]):
        if not isinstance(line, dict) or "x" not in line or "text" not in line:
            errors.append(f"lines[{i}] должен быть объектом {{x, text, mood?}}")
            continue
        if not 0 <= line["x"] < lv.w:
            errors.append(f"lines[{i}].x={line['x']} вне уровня")
        if line.get("mood", "neutral") not in MOODS:
            errors.append(f"lines[{i}].mood должен быть одним из {MOODS}")
        if len(line["text"]) > 140:
            warnings.append(f"lines[{i}] длиннее 140 символов — не влезет в облако")
    for key in ("intro", "outro"):
        for i, t in enumerate(d[key]):
            if not isinstance(t, str):
                errors.append(f"{key}[{i}] должен быть строкой")
            elif len(t) > 140:
                warnings.append(f"{key}[{i}] длиннее 140 символов")

    # ---- расстановка ловушек
    trap_cells = []
    for c in TRAPS:
        for (x, y) in lv.find(c):
            trap_cells.append((c, x, y))
            below = lv.ch(x, y - 1)
            if c in "^WJB" and below not in SOLID and below not in PLATFORM:
                errors.append(f"{TRAP_NAMES[c]} в ({x},{y}) висит в воздухе — под ним нужна земля")
            if c == "C":
                free = 0
                yy = y - 1
                while yy >= 0 and lv.ch(x, yy) not in SOLID and lv.ch(x, yy) not in PLATFORM:
                    free += 1
                    yy -= 1
                if free < 2:
                    errors.append(f"пресс в ({x},{y}): под ним нужно ≥2 пустых клеток")
                if yy < 0:
                    warnings.append(f"пресс в ({x},{y}) падает в бездну — под ним нет пола")
            if c == "T":
                if lv.ch(x, y - 1) in SOLID:
                    warnings.append(f"люк в ({x},{y}): под ним твёрдо — открывать бессмысленно")
                if lv.ch(x, y + 1) in SOLID:
                    errors.append(f"люк в ({x},{y}) замурован сверху")
    portals = lv.find("@")
    if len(portals) % 2:
        errors.append(f"порталов @ должно быть чётное число (пары вход→выход), найдено {len(portals)}")
    for a, b in lv.portals().items():
        if lv.landing_below(*b) is None:
            errors.append(f"выход портала {b} висит над бездной — шарик провалится")
    for (x, y) in lv.find("X"):
        if lv.ch(x, y + 1) in SOLID:
            warnings.append(f"рассыпающийся блок ({x},{y}) закрыт сверху — на нём нельзя стоять")
    bosses = lv.find("B")
    if len(bosses) > 1:
        errors.append("на уровне может быть только один босс B")
    if bosses and d.get("boss") not in BOSSES:
        errors.append(f"есть B, но поле boss должно быть одним из {list(BOSSES)}")
    if d.get("boss") and not bosses:
        warnings.append("поле boss задано, но в grid нет клетки B")
    if not trap_cells and not d.get("final"):
        warnings.append("на уровне нет ни одной ловушки — игроку нечем мешать")

    # ---- проходимость
    if not errors:
        path, reach = solve(lv)
        if path is None:
            errors.append("УРОВЕНЬ НЕПРОХОДИМ: от S нельзя добраться до F/R (при спрятанных ловушках)")
            far = max(reach, key=lambda p: p[0]) if reach else None
            if far:
                info.append(f"самая правая достижимая клетка: {far} — застревание где-то после неё")
        else:
            info.append(f"путь найден: {len(path)} шагов")
            back = sum(max(0, path[i][0] - path[i + 1][0]) for i in range(len(path) - 1))
            if back > 6:
                warnings.append(f"путь требует идти влево на {back} клеток — инстинкт шарика "
                                "любит двигаться вправо, он может запутаться")
            # падения-лепёшки на пути
            for a, b in zip(path, path[1:]):
                kind, fall = neighbors(lv, *a).get(b, ("?", 0))
                if fall > SPLAT_SPEED:
                    info.append(f"эффектное падение-лепёшка {a}→{b} (скорость {fall:.1f})")
            # ловушки рядом с путём
            # колонки пути — включая всё, над чем шарик пролетает между точками приземления
            pcols = set()
            for a, b in zip(path, path[1:] or path):
                pcols.update(range(min(a[0], b[0]), max(a[0], b[0]) + 1))
            for (c, x, y) in trap_cells:
                if not any(abs(x - px) <= 2 for px in pcols):
                    warnings.append(f"{TRAP_NAMES[c]} в ({x},{y}) далеко от пути шарика — не сработает")
            for (x, y) in lv.find("K"):
                if (x, y) not in reach and (x, y - 1) not in reach:
                    warnings.append(f"чекпоинт K в ({x},{y}) недостижим")
            for (x, y) in stars:
                if (x, y) not in reach and not any((x, yy) in reach for yy in range(y - 3, y + 1)):
                    warnings.append(f"фрагмент * в ({x},{y}) скорее всего недостижим")

    return dict(file=lv.path.name, ok=not errors, errors=errors, warnings=warnings, info=info,
                size=f"{lv.w}x{lv.h}", traps=len(trap_cells))


def main(argv):
    as_json = "--json" in argv
    masks = [a for a in argv if not a.startswith("--")]
    levels = all_levels()
    if masks:
        levels = [lv for lv in levels if any(fnmatch.fnmatch(lv.path.name, m.split('/')[-1]) for m in masks)]
    reports = [check(lv) for lv in levels]

    # глобальные проверки порядка
    orders = [lv.data.get("order") for lv in levels]
    if not masks and len(set(orders)) != len(orders):
        reports.append(dict(file="*", ok=False, errors=["повторяющиеся значения order"], warnings=[], info=[]))

    if as_json:
        print(json.dumps(reports, ensure_ascii=False, indent=2))
    else:
        for r in reports:
            mark = "OK " if r["ok"] else "ERR"
            print(f"[{mark}] {r['file']}  {r.get('size', '')}  ловушек: {r.get('traps', '-')}")
            for e in r["errors"]:
                print(f"   ✗ {e}")
            for w in r["warnings"]:
                print(f"   ! {w}")
            for i in r["info"]:
                print(f"   · {i}")
        if not reports:
            print(f"Нет уровней в {LEVELS_DIR}")
    return 0 if all(r["ok"] for r in reports) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
