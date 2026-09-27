#!/usr/bin/env python3
"""Автопрогон уровня «инстинктом» шарика — порт логики Navigator.cs + упрощённая физика.

Валидатор (validate.py) отвечает на вопрос «существует ли путь». Этот скрипт отвечает на другой:
«дойдёт ли сам шарик, со своими рефлексами и импульсивными ошибками». Ловушки пассивны (игрок не мешает).

    python3 Tools/levels/autoplay.py              # все уровни, 5 прогонов на каждый
    python3 Tools/levels/autoplay.py 03_*.json -n 20 -v
"""
from __future__ import annotations

import argparse
import fnmatch
import math
import random
import sys

from levellib import (BALL_RADIUS as R, GRAVITY as G, JUMP_SPEED, MUSHROOM_POWERS, PLATFORM, RUN_SPEED, SOLID,
                      SPLAT_SPEED, Level, all_levels)

CONVEYOR = 2.0        # синхронно с Tuning.ConveyorSpeed
ICE_ACC = 0.25        # доля ускорения на льду
CRUMBLE_T, CRUMBLE_BACK = 0.6, 4.0

DT = 1 / 60
GROUND_ACC, AIR_ACC = 38.0, 16.0


class Sim:
    def __init__(self, lv: Level, rng: random.Random, impulsivity: float):
        self.lv, self.rng = lv, rng
        self.imp = impulsivity
        sx, sy = lv.find("S")[0]
        self.spawn = (sx + 0.5, sy + R + 0.02)
        self.x, self.y = self.spawn
        self.vx = self.vy = 0.0
        self.grounded = False
        self.aimed = False
        g = (lv.find("F") + lv.find("R"))[0]
        self.goal = (g[0] + 0.5, g[1] + 0.5)
        self.checkpoints = sorted(lv.find("K"))
        self.deaths = self.splats = 0
        self.t = 0.0
        self.peak_fall = 0.0
        self.intent, self.intent_until = "forward", 0.0
        self.stuck_ref, self.stuck_since, self.stuck_tries = self.x, 0.0, 0
        self.deaths_at: dict[int, int] = {}
        self.log: list[str] = []
        self.crumbled: dict = {}      # клетка → время восстановления
        self.touch: dict = {}         # клетка → сколько стоим на ней
        self.portals = lv.portals()
        self.portal_cd = 0.0

    # --- мир
    def solid(self, x, y):
        if x < 0 or x >= self.lv.w:
            return True
        if (x, y) in self.crumbled and self.crumbled[(x, y)] > self.t:
            return False
        return self.lv.ch(x, y) in SOLID

    def support(self, x, y):
        return self.solid(x, y) or self.lv.ch(x, y) in PLATFORM

    def standable(self, x, y):
        return 0 <= x < self.lv.w and 0 <= y < self.lv.h and not self.support(x, y) and self.support(x, y - 1)

    def floor_below(self, x, y):
        for yy in range(y - 1, -1, -1):
            if self.support(x, yy):
                return yy + 1
        return None

    def hits_solid(self, cx, cy):
        r = R * 0.98
        for tx in range(math.floor(cx - r), math.floor(cx + r) + 1):
            for ty in range(math.floor(cy - r), math.floor(cy + r) + 1):
                if self.solid(tx, ty):
                    nx, ny = min(max(cx, tx), tx + 1), min(max(cy, ty), ty + 1)
                    if (cx - nx) ** 2 + (cy - ny) ** 2 < r * r:
                        return True
        return False

    def platform_under(self, cx, old_bottom, new_bottom):
        for tx in (math.floor(cx - R * 0.6), math.floor(cx), math.floor(cx + R * 0.6)):
            ty = math.floor(new_bottom)
            if self.lv.ch(tx, ty) in PLATFORM and old_bottom >= ty + 1 - 1e-3 and new_bottom < ty + 1:
                return ty + 1
        return None

    # --- инстинкт (порт Navigator.Steer / TryAimedJump)
    def stand_cell(self):
        return math.floor(self.x), math.floor(self.y - R + 0.1)

    POWERS = (1.0, 0.85, 0.7, 0.55)   # как Navigator.Powers

    def try_aimed(self, cx, cy, d, min_dy=-6):
        mush = self.lv.ch(cx, cy - 1) == "O"
        powers = (MUSHROOM_POWERS + self.POWERS) if mush else self.POWERS
        best, vx, power = None, 0.0, 1.0
        for dx in range(1, 7):
            for dy in range(7 if mush else 3, min_dy - 1, -1):
                tx, ty = cx + d * dx, cy + dy
                if not self.standable(tx, ty) or (dx == 1 and dy == 0):
                    continue
                for k, pw in enumerate(powers):
                    v0 = JUMP_SPEED * pw
                    disc = v0 ** 2 - 2 * G * (dy + 0.15)
                    if disc < 0:
                        break
                    t = (v0 + math.sqrt(disc)) / G
                    need = ((tx + 0.5) - self.x) / t
                    if abs(need) > RUN_SPEED * 1.15 or not self.arc_clear(need, v0, t):
                        continue
                    score = dx + max(0, -dy) * 0.6 - max(0, dy) * 0.2 + k * 0.3
                    if best is None or score < best:
                        best, vx, power = score, need, pw
                    break
        return best is not None, vx, power

    def arc_clear(self, vx, v0, tend):
        t = 0.05
        while t < tend - 0.05:
            px, py = self.x + vx * t, self.y + v0 * t - 0.5 * G * t * t
            if self.solid(math.floor(px), math.floor(py)) or self.solid(math.floor(px), math.floor(py + R * 0.8)):
                return False
            t += 0.05
        return True

    def steer(self, d, speed_mul, yolo=False):
        target = 0.0
        if not self.grounded:
            return None, target
        cx, cy = self.stand_cell()
        nx = cx + d
        target = d * RUN_SPEED * speed_mul
        wall = self.solid(nx, cy)
        pit = not self.support(nx, cy - 1) and self.floor_below(nx, cy) is None
        # на грибе-батуте: если впереди (1–3 кл.) стена выше обычного прыжка — прыгаем с гриба сразу
        if self.lv.ch(cx, cy - 1) == "O" and not wall:
            for k in (2, 3):
                x2 = cx + d * k
                if self.solid(x2, cy) and self.solid(x2, cy + 3):
                    ok, vx, pw = self.try_aimed(cx, cy, d, min_dy=3)
                    if ok:
                        return (vx, pw), target
                    break
        if not (wall or pit):
            return None, target
        edge = (cx + 1) - self.x if d > 0 else self.x - cx
        if wall and edge < R + 0.15:          # как Navigator: отступить от стены перед прыжком
            return None, -d * RUN_SPEED * 0.6 * 0.5
        trig = 0.75 if wall else 0.35 + (0.75 - 0.35) * self.imp * self.rng.random()
        if edge > trig and not wall:
            return None, target
        ok, vx, pw = self.try_aimed(cx, cy, d)
        if ok:
            return (vx * (1 + self.rng.gauss(0, 1) * 0.12 * self.imp), pw), target
        if wall:
            return (d * RUN_SPEED * 0.5, 1.0), target
        return None, (target if yolo else 0.0)

    # --- шаг
    def die(self, why):
        self.deaths += 1
        cell = math.floor(self.x) // 4
        self.deaths_at[cell] = self.deaths_at.get(cell, 0) + 1
        if self.deaths_at[cell] >= 2:
            self.imp = max(0.05, self.imp * 0.6)
        cp = [c for c in self.checkpoints if c[0] + 0.5 <= self.x + 0.5]
        self.x, self.y = (cp[-1][0] + 0.5, cp[-1][1] + R + 0.02) if cp else self.spawn
        self.vx = self.vy = 0
        self.t += 1.1 + 0.5
        self.log.append(f"t={self.t:5.1f} смерть ({why}) у x={math.floor(self.x)}")
        self.stuck_since = self.t

    def step(self):
        d = 1 if self.goal[0] >= self.x else -1
        # намерения при застревании (как BallBrain.CheckStuck)
        if self.intent != "forward" and self.t >= self.intent_until:
            self.intent = "forward"
        if self.intent in ("forward", "yolo"):
            if abs(self.x - self.stuck_ref) > 1.2:
                self.stuck_ref, self.stuck_since, self.stuck_tries = self.x, self.t, 0
            elif self.t - self.stuck_since > 8:   # Tuning.StuckSeconds
                self.stuck_tries += 1
                self.stuck_since = self.t
                k = self.stuck_tries % 3
                self.intent, self.intent_until = ("back", self.t + 0.8) if k == 1 else ("yolo", self.t + 3) if k == 2 else ("pray", self.t + 2)
                self.log.append(f"t={self.t:5.1f} застрял у x={math.floor(self.x)} → {self.intent}")
        else:
            self.stuck_ref, self.stuck_since = self.x, self.t

        jump_vx, target = None, 0.0
        if self.intent == "forward":
            jump_vx, target = self.steer(d, 0.5)   # Tuning.WalkMul
        elif self.intent == "yolo":
            jump_vx, target = self.steer(d, 0.95, yolo=True)   # Tuning.YoloMul
        elif self.intent == "back":
            jump_vx, target = self.steer(-d, 0.4)   # Tuning.BackMul

        if jump_vx is not None and self.grounded:
            jvx, pw = jump_vx
            self.vy = JUMP_SPEED * pw
            self.vx = max(-RUN_SPEED * 1.25, min(RUN_SPEED * 1.25, jvx))
            self.aimed = True
            self.grounded = False
        elif not (self.aimed and not self.grounded):
            under = self.lv.ch(math.floor(self.x), math.floor(self.y - R - 0.05)) if self.grounded else "."
            if under == ">":
                target += CONVEYOR
            elif under == "<":
                target -= CONVEYOR
            acc = GROUND_ACC if self.grounded else AIR_ACC
            if under == "~":
                acc *= ICE_ACC
            dv = target - self.vx
            self.vx += max(-acc * DT, min(acc * DT, dv))

        self.vy -= G * DT
        if not self.grounded:
            self.peak_fall = max(self.peak_fall, -self.vy)   # учитываем и последний кадр перед ударом
        # x
        nx = self.x + self.vx * DT
        if self.hits_solid(nx, self.y):
            self.vx = 0.0
        else:
            self.x = nx
        # y
        ny = self.y + self.vy * DT
        landed_on = None
        if self.vy <= 0:
            landed_on = self.platform_under(self.x, self.y - R, ny - R)
        if landed_on is not None:
            ny = landed_on + R
            self.land()
        elif self.hits_solid(self.x, ny):
            if self.vy < 0:
                ny = math.floor(ny - R) + 1 + R
                if self.hits_solid(self.x, ny):
                    ny = self.y
                self.land()
            else:
                self.vy = 0.0
                ny = self.y
        else:
            if self.grounded and self.vy < -2:
                self.grounded = False
            elif not self.grounded:
                pass
        self.y = ny
        # опора под ногами
        # опора: как контакт в Unity с нормалью > 0.55 — считается и угол блока под краем круга
        fy = math.floor(self.y - R - 0.05)
        under = any(self.support(math.floor(self.x + ox), fy) for ox in (-R * 0.55, 0.0, R * 0.55))
        if self.vy <= 0 and under and (self.y - R) - fy - 1 < 0.06:
            if not self.grounded and self.vy < -0.5:
                self.land()
            self.grounded = True
            self.vy = 0.0 if self.vy < 0 else self.vy
        else:
            if self.grounded:
                self.grounded = False
        if not self.grounded:
            self.peak_fall = max(self.peak_fall, -self.vy)
        # рассыпающиеся блоки
        if self.grounded:
            cell = (math.floor(self.x), math.floor(self.y - R - 0.05))
            if self.lv.ch(*cell) == "X":
                self.touch[cell] = self.touch.get(cell, 0) + DT
                if self.touch[cell] > CRUMBLE_T:
                    self.crumbled[cell] = self.t + CRUMBLE_BACK
                    self.touch[cell] = 0
                    self.grounded = False
            for c in list(self.touch):
                if c != cell:
                    self.touch[c] = 0
        # порталы: вход переносит к выходу
        if self.portal_cd <= self.t:
            here = (math.floor(self.x), math.floor(self.y - R + 0.1))
            if here in self.portals:
                ex = self.portals[here]
                self.x, self.y = ex[0] + 0.5, ex[1] + R + 0.02
                self.portal_cd = self.t + 1.2
                self.log.append(f"t={self.t:5.1f} портал {here}→{ex}")
        if self.y < -3:
            self.die("бездна")
        self.t += DT

    def land(self):
        soft = self.lv.ch(math.floor(self.x), math.floor(self.y - R - 0.05)) == "O"   # гриб гасит удар
        if self.peak_fall > SPLAT_SPEED and not soft:
            self.splats += 1
            self.t += 1.3 + 0.5
            self.log.append(f"t={self.t:5.1f} лепёшка у x={math.floor(self.x)} (удар {self.peak_fall:.1f})")
        self.peak_fall = 0.0
        self.vy = 0.0
        self.aimed = False
        self.grounded = True

    def done(self):
        return abs(self.x - self.goal[0]) < 0.9 and abs(self.y - self.goal[1]) < 1.5


def run(lv: Level, n: int, verbose: bool, limit: float = 400.0):
    awareness = lv.data.get("awareness", 0)
    results = []
    for i in range(n):
        s = Sim(lv, random.Random(i * 7919 + 13), 0.8 + (0.35 - 0.8) * awareness / 5)
        while s.t < limit and not s.done():
            s.step()
        results.append(s)
        if verbose:
            status = "ДОШЁЛ" if s.done() else "НЕ ДОШЁЛ"
            print(f"  прогон {i + 1}: {status} за {s.t:.0f} с, смертей {s.deaths}, лепёшек {s.splats}, x={s.x:.1f}")
            for line in s.log[:12]:
                print("     ", line)
    ok = [s for s in results if s.done()]
    return ok, results


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("masks", nargs="*")
    ap.add_argument("-n", type=int, default=5)
    ap.add_argument("-v", action="store_true")
    a = ap.parse_args(argv)
    bad = 0
    for lv in all_levels():
        if a.masks and not any(fnmatch.fnmatch(lv.path.name, m) for m in a.masks):
            continue
        if not lv.find("S") or not (lv.find("F") + lv.find("R")):
            continue
        print(f"== {lv.path.name}")
        ok, res = run(lv, a.n, a.v)
        rate = len(ok) / len(res)
        avg_t = sum(s.t for s in ok) / len(ok) if ok else 0
        avg_d = sum(s.deaths for s in res) / len(res)
        avg_s = sum(s.splats for s in res) / len(res)
        worst = max((s.x for s in res if not s.done()), default=None)
        mark = "OK " if rate >= 0.8 else "!! "
        if rate < 0.8:
            bad += 1
        print(f"[{mark}] дошёл {len(ok)}/{len(res)}  ср. время {avg_t:.0f} с  ср. смертей {avg_d:.1f}  ср. лепёшек {avg_s:.1f}"
              + (f"  застревает около x={worst:.0f}" if worst is not None else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
