"""SAM_Toons · проверка episode.json до рендера: движения, существа, звуки, выражения времени, длина реплик.
Словари берутся из кода (blender/moves.json, studio/audio.py), так что валидатор не отстаёт от движка.
Ошибки — рендер не запускается; предупреждения — стоит посмотреть. Этим же пользуются агенты-режиссёры."""
from __future__ import annotations

import json
import re

from common import ROOT

CREATURES = {"capykanga": ("hops",), "mantis_trunk": ("run",), "mantis_deer": ("run",), "mantis_baby": ("fly",), "flower": ("x", "y")}
OVERLAYS = {None, "rec"}
TIME_RE = re.compile(r"\s*(L(\d+)e?|end)\s*([+-]\s*[\d.]+)?\s*")
BONES = {"LeftHand", "RightHand", "Head", "LeftForeArm", "RightForeArm", "Spine1"}


def vocab() -> dict:
    from audio import AMB, SFX, library, SOUNDS
    moves = [k for k in json.loads((ROOT / "blender/moves.json").read_text(encoding="utf-8")) if not k.startswith("_")]
    sounds = set(SFX) | ({p.name for p in SOUNDS.iterdir() if p.is_dir()} if SOUNDS.exists() else set())
    return {"moves": moves, "sfx": sorted(sounds), "ambience": sorted(set(AMB) | {s[4:] for s in sounds if s.startswith("amb_")}),
            "creatures": sorted(CREATURES)}


def check_episode(ep: dict) -> tuple[list[str], list[str]]:
    V = vocab(); err, warn = [], []
    cast = ep.get("cast", {})
    ids = set()

    def t_ok(v, where, nlines):
        if isinstance(v, (int, float)):
            if v < 0:
                err.append(f"{where}: отрицательное время {v}")
            return
        m = TIME_RE.fullmatch(str(v))
        if not m:
            err.append(f"{where}: не понимаю время «{v}» (примеры: 1.5, L2, L2e+0.3, end-1)")
        elif m.group(2) and int(m.group(2)) > nlines:
            err.append(f"{where}: ссылка на реплику L{m.group(2)}, а в плане их {nlines}")

    for i, s in enumerate(ep.get("shots", [])):
        sid = s.get("id") or f"#{i + 1}"
        if sid in ids:
            err.append(f"{sid}: id плана повторяется")
        ids.add(sid)
        lines = s.get("lines", [])
        n = len(lines)
        for j, l in enumerate(lines):
            w = f"{sid} L{j + 1}"
            if l.get("who") not in cast:
                err.append(f"{w}: персонаж «{l.get('who')}» не описан в cast")
            if len(l.get("text", "")) > 140:
                err.append(f"{w}: реплика длиннее 140 символов ({len(l['text'])})")
            if not l.get("text", "").strip():
                err.append(f"{w}: пустая реплика")
            if "at" in l:
                t_ok(l["at"], w, j)          # реплика может ссылаться только на предыдущие
        if "card" in s:
            if not s["card"].get("lines"):
                err.append(f"{sid}: у титра нет строк")
            if not isinstance(s.get("duration"), (int, float)):
                warn.append(f"{sid}: у титра стоит задать duration")
            continue
        if not s.get("camera"):
            err.append(f"{sid}: нет камеры (camera)")
        for k, c in enumerate(s.get("camera", [])):
            t_ok(c.get("t"), f"{sid} camera[{k}]", n)
            for key in ("pos", "look"):
                if not (isinstance(c.get(key), list) and len(c[key]) == 3):
                    err.append(f"{sid} camera[{k}]: {key} должно быть [x, y, z]")
            if c.get("pos") and c["pos"][1] > -1.0:
                warn.append(f"{sid} camera[{k}]: камера стоит близко к линии действия (y={c['pos'][1]}) — персонаж может не влезть")
        for name, a in s.get("actors", {}).items():
            if name not in cast:
                err.append(f"{sid}: актёр «{name}» не описан в cast")
            if not a.get("segments"):
                err.append(f"{sid} {name}: нет движений (segments)")
            for k, g in enumerate(a.get("segments", [])):
                w = f"{sid} {name} seg{k + 1}"
                if "move" in g and g["move"] not in V["moves"]:
                    err.append(f"{w}: нет движения «{g['move']}». Есть: {', '.join(V['moves'])}")
                if "move" not in g and "clip" not in g:
                    err.append(f"{w}: нужен move (или clip/from/to)")
                if "until" in g:
                    t_ok(g["until"], w, n)
                if "dur" not in g and "until" not in g:
                    warn.append(f"{w}: нет dur/until — возьмётся весь кусок записи")
            for k, m in enumerate(a.get("morph", [])):
                t_ok(m.get("t"), f"{sid} {name} morph[{k}]", n)
            for k, m in enumerate(a.get("sink", [])):
                t_ok(m.get("t"), f"{sid} {name} sink[{k}]", n)
        for k, c in enumerate(s.get("creatures", [])):
            w = f"{sid} creature[{k}]"
            if c.get("type") not in CREATURES:
                err.append(f"{w}: неизвестное существо «{c.get('type')}». Есть: {', '.join(sorted(CREATURES))}"); continue
            for req in CREATURES[c["type"]]:
                if req not in c:
                    err.append(f"{w} ({c['type']}): не хватает «{req}»")
            for key in ("hops", "run"):
                for tk in ("t0", "t1", "turn_at"):
                    if key in c and tk in c[key]:
                        t_ok(c[key][tk], f"{w}.{key}.{tk}", n)
            for p in c.get("fly", []) + c.get("turn", []):
                t_ok(p[0], f"{w} ключ", n)
            tgt = c.get("target")
            if tgt and (tgt[0] not in s.get("actors", {}) or tgt[1] not in BONES):
                err.append(f"{w}: target {tgt} — нужен актёр этого плана и кость из {sorted(BONES)}")
        for k, fx in enumerate(s.get("sfx", [])):
            if fx.get("name") not in V["sfx"]:
                err.append(f"{sid} sfx[{k}]: нет звука «{fx.get('name')}». Есть: {', '.join(V['sfx'])}")
            t_ok(fx.get("at"), f"{sid} sfx[{k}]", n)
        for k, sh in enumerate(s.get("shake", [])):
            t_ok(sh.get("t"), f"{sid} shake[{k}]", n)
        if s.get("overlay") not in OVERLAYS:
            err.append(f"{sid}: overlay «{s['overlay']}» — есть только rec")
        if not lines and not s.get("sfx") and not s.get("creatures"):
            warn.append(f"{sid}: план без реплик, звуков и существ — не затянут ли он?")
    if ep.get("ambience") and ep["ambience"] not in V["ambience"]:
        warn.append(f"фон «{ep['ambience']}» не найден ни в sounds/amb_*, ни в синтезе — будет тишина")
    return err, warn
