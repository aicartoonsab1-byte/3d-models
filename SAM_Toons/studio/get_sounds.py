#!/usr/bin/env python3
"""Скачать настоящие звуки с Freesound.org (только CC0 — можно всё, без указания автора) в sounds/<имя>/.

Нужен бесплатный ключ API: зарегистрируйтесь на freesound.org → https://freesound.org/apiv2/apply → «Client secret/Api key».
  set FREESOUND_TOKEN=ваш_ключ            (Windows)   |   export FREESOUND_TOKEN=ваш_ключ   (Linux/Mac)
  python studio/get_sounds.py                    # все звуки из списка CUES ниже
  python studio/get_sounds.py squelch "mud footstep squelch" 4   # свой звук: имя, запрос (англ.), сколько вариантов

Скачиваются превью высокого качества (MP3 ~128 кбит/с) — для мультфильма этого достаточно.
В film.json / shot.json звук вызывается по имени: {"sfx": "squelch"}; фон — "ambience": "swamp".
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOUNDS = ROOT / "sounds"
API = "https://freesound.org/apiv2/search/text/"

# имя → (запрос на английском, сколько вариантов, макс. длительность, с)
CUES = {
    "amb_swamp":   ("swamp night frogs insects ambience", 2, 120),
    "squelch":     ("mud footstep squelch", 6, 2),
    "sink":        ("sinking in mud squelch", 2, 4),
    "boing":       ("cartoon boing spring", 3, 2),
    "splash":      ("small splash puddle", 3, 3),
    "click":       ("insect mandible click", 3, 1.5),
    "trumpet":     ("elephant trumpet", 2, 4),
    "whoosh":      ("whoosh pass by", 3, 2),
    "stampede":    ("stampede herd running", 2, 8),
    "buzz":        ("insect buzz fly by", 2, 3),
    "sting":       ("zap sting cartoon", 2, 1.5),
    "inflate":     ("balloon inflate rubber squeak", 2, 4),
    "crunch":      ("crunch shell crack", 3, 2),
    "pop":         ("cartoon pop", 3, 1),
    "gasp":        ("male gasp surprised", 2, 2),
    "sniff":       ("sniff smell nose", 2, 2),
    "music_sting": ("comedy pizzicato bassoon short", 2, 12),
}


def search(token: str, query: str, max_dur: float, n: int) -> list[dict]:
    q = {"query": query, "filter": f'license:"Creative Commons 0" duration:[0.2 TO {max_dur}]',
         "fields": "id,name,previews,duration", "page_size": str(max(n * 2, 6)), "sort": "rating_desc", "token": token}
    with urllib.request.urlopen(API + "?" + urllib.parse.urlencode(q), timeout=30) as r:
        return json.load(r).get("results", [])[:n]


def fetch(token: str, name: str, query: str, n: int, max_dur: float) -> None:
    d = SOUNDS / name; d.mkdir(parents=True, exist_ok=True)
    if any(d.iterdir()):
        print(f"  есть: {name}"); return
    res = search(token, query, max_dur, n)
    if not res:
        print(f"  ⚠ {name}: ничего не нашлось по «{query}»"); return
    for i, s in enumerate(res):
        url = s["previews"]["preview-hq-mp3"]
        urllib.request.urlretrieve(url, d / f"{i + 1:02d}_{s['id']}.mp3")
    (d / "SOURCE.txt").write_text("\n".join(f"freesound.org/s/{s['id']} — {s['name']} (CC0)" for s in res), encoding="utf-8")
    print(f"  {name}: {len(res)} вариантов")


def main() -> None:
    token = os.environ.get("FREESOUND_TOKEN")
    if not token:
        sys.exit(__doc__)
    a = sys.argv[1:]
    if a:
        fetch(token, a[0], a[1], int(a[2]) if len(a) > 2 else 3, float(a[3]) if len(a) > 3 else 10); return
    for name, (q, n, dur) in CUES.items():
        fetch(token, name, q, n, dur)
    print(f"Готово: {SOUNDS}")


if __name__ == "__main__":
    main()
