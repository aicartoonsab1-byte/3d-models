"""SAM_Toons · валидатор film.json. По нему будут «сверяться» агенты: пишут JSON → check → чинят ошибки.

Словарь (позы, настроения, эмоции, предметы) читается прямо из движка, чтобы не было двух источников правды.
"""
from __future__ import annotations

import json
import re

from audio import SFX
from common import ROOT

MAX_LINE = 140


def vocab() -> dict:
    ch = (ROOT / "engine/character.js").read_text(encoding="utf-8")
    pr = (ROOT / "engine/props.js").read_text(encoding="utf-8") + (ROOT / "engine/dusk.js").read_text(encoding="utf-8")
    arr = lambda name: json.loads(re.search(rf"SAM\.{name} = (\[.*?\]);", ch).group(1))  # noqa: E731
    poses_block = ch[ch.index("const POSES = {"): ch.index("function poseAt")]
    return {
        "poses": re.findall(r"^\s{4}(\w+): \(", poses_block, re.M),
        "moods": arr("MOODS"), "emotes": arr("EMOTES"), "hair": arr("HAIR"), "extra": arr("EXTRA"), "red": arr("RED_PARTS"),
        "props": re.findall(r'def\("(\w+)"', pr), "sfx": sorted(SFX), "faces": ["front", "left", "right"],
        "ease": ["linear", "inout", "in", "out", "back", "bounce"],
    }


def check(film: dict) -> tuple[list[str], list[str]]:
    V = vocab(); err: list[str] = []; warn: list[str] = []
    cast = film.get("cast") or {}
    if not film.get("scenes"):
        err.append("нет ни одной сцены (scenes)")
    for cid, c in cast.items():
        if c.get("hair") and c["hair"] not in V["hair"]:
            err.append(f"cast.{cid}: причёска «{c['hair']}» — есть только {V['hair']}")
        for e in c.get("red", []):
            if e not in V["red"]:
                err.append(f"cast.{cid}: красной может быть только часть из {V['red']}, а не «{e}»")
        for e in c.get("extra", []):
            if e not in V["extra"]:
                err.append(f"cast.{cid}: аксессуар «{e}» — есть только {V['extra']}")
    seen = set()
    for si, sc in enumerate(film.get("scenes") or []):
        sid = sc.get("id") or f"s{si + 1}"
        if sid in seen:
            err.append(f"{sid}: повтор id сцены")
        seen.add(sid)
        actors = sc.get("actors") or {}
        props = {p.get("id") or f"{p.get('type')}{i + 1}": p for i, p in enumerate((sc.get("set") or {}).get("props") or [])}
        for pid, p in props.items():
            if p.get("type") not in V["props"]:
                err.append(f"{sid}: предмет «{pid}» неизвестного типа «{p.get('type')}» — есть {V['props']}")
        for aid, a in actors.items():
            if aid not in cast:
                err.append(f"{sid}: персонаж «{aid}» не описан в cast")
            if a.get("pose") and a["pose"] not in V["poses"]:
                err.append(f"{sid}.{aid}: поза «{a['pose']}» — есть {V['poses']}")
            if a.get("mood") and a["mood"] not in V["moods"]:
                err.append(f"{sid}.{aid}: настроение «{a['mood']}» — есть {V['moods']}")
        if not sc.get("beats"):
            err.append(f"{sid}: нет битов (beats)")
        for bi, b in enumerate(sc.get("beats") or []):
            where = f"{sid}_{bi + 1}"
            s = b.get("say")
            if s:
                who = s.get("who")
                if who != "narrator" and who not in actors and who not in props:
                    err.append(f"{where}: говорит «{who}», но его нет в сцене (ни в actors, ни в props)")
                if who not in cast and who != "narrator":
                    warn.append(f"{where}: у «{who}» нет записи в cast — голос по умолчанию")
                if not s.get("text"):
                    err.append(f"{where}: пустая реплика")
                elif len(s["text"]) > MAX_LINE:
                    warn.append(f"{where}: реплика длиннее {MAX_LINE} символов — разбей на два бита")
                if s.get("mood") and s["mood"] not in V["moods"]:
                    err.append(f"{where}: настроение «{s['mood']}» — есть {V['moods']}")
            for a in b.get("do") or []:
                subj = [k for k in ("who", "prop", "camera", "sfx") if k in a]
                if len(subj) != 1:
                    err.append(f"{where}: действие {json.dumps(a, ensure_ascii=False)} должно иметь ровно одно из who/prop/camera/sfx")
                    continue
                k = subj[0]
                if k == "who":
                    if a["who"] not in actors:
                        err.append(f"{where}: «{a['who']}» нет в actors сцены")
                    for key, allowed in (("pose", "poses"), ("mood", "moods"), ("emote", "emotes"), ("face", "faces")):
                        if key in a and a[key] not in V[allowed]:
                            err.append(f"{where}: {key} «{a[key]}» — есть {V[allowed]}")
                elif k == "prop" and a["prop"] not in props:
                    err.append(f"{where}: предмета «{a['prop']}» нет в set.props сцены (есть {list(props)})")
                elif k == "sfx" and a["sfx"] not in V["sfx"]:
                    err.append(f"{where}: звук «{a['sfx']}» — есть {V['sfx']}")
                elif k == "camera":
                    cam = a["camera"]
                    if cam != "shake" and not (isinstance(cam, dict) and set(cam) <= {"x", "y", "zoom", "on"}):
                        err.append(f"{where}: camera — объект {{x,y,zoom,on}} или \"shake\"")
                    if isinstance(cam, dict) and cam.get("on") and cam["on"] not in actors and cam["on"] not in props:
                        err.append(f"{where}: camera.on «{cam['on']}» нет в сцене")
                if a.get("ease") and a["ease"] not in V["ease"]:
                    err.append(f"{where}: ease «{a['ease']}» — есть {V['ease']}")
    return err, warn
