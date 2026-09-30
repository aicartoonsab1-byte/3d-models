#!/usr/bin/env python3
"""SAM_Toons — студия рисованных кодом мультфильмов. Всё локально и бесплатно.

  python studio/sam.py check  <фильм>          # проверить film.json (позы, предметы, реплики)
  python studio/sam.py voice  <фильм> [--force] # озвучить реплики → build/voice
  python studio/sam.py stills <фильм>          # раскадровка: кадр на бит → build/storyboard.html/.png
  python studio/sam.py render <фильм> [--half] # MP4 со звуком → build/film.mp4
  python studio/sam.py make   <фильм> [--half] # всё подряд: check → voice → stills → render
  python studio/sam.py serve  [--port 8000]    # живой плеер в браузере
  python studio/sam.py voices                  # какие голоса доступны на этом ПК
  python studio/sam.py ref <голос> <файл> [--text "что сказано"]  # образец голоса для клонирования (CosyVoice)
  python studio/sam.py vocab                   # словарь движка: позы, эмоции, предметы, звуки
  python studio/sam.py shot <папка> [--frames 1-50]  # сцена в Blender (shot.json): мокап, 3D «под рисунок» → build/shot.mp4
  python studio/sam.py write <серия> --idea "..."   # агент-сценарист → script.md (Ollama)
  python studio/sam.py direct <серия>               # агент-режиссёр: script.md → episode.json с проверкой
  python studio/sam.py critique <серия> [--rounds 2] # агент-критик: кадры → оценки → правки episode.json
  python studio/sam.py episode <фильм> [--draft|--stills] [--shots s1,s2]  # серия целиком в Blender (episode.json) → build/episode_*.mp4

<фильм> — имя папки в films/ (например ufo_casino) или путь к папке с film.json.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from common import ROOT, film_dir, load_film, say, serve  # noqa: E402


def cmd_check(d: Path, film: dict) -> bool:
    from check import check
    err, warn = check(film)
    for e in err:
        say("✗ " + e)
    for w in warn:
        say("⚠ " + w)
    say("✓ film.json в порядке" if not err else f"Ошибок: {len(err)}")
    return not err


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["check", "voice", "stills", "render", "make", "serve", "voices", "vocab", "ref", "shot", "episode", "write", "direct", "critique"])
    ap.add_argument("film", nargs="?")
    ap.add_argument("src", nargs="?", help="для ref: аудиофайл с образцом голоса")
    ap.add_argument("--text", help="для ref: текст, произнесённый в образце")
    ap.add_argument("--force", action="store_true", help="переозвучить всё заново")
    ap.add_argument("--half", action="store_true", help="рендер 960×540 (быстрый черновик)")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--frames", help="для shot: диапазон кадров (проба)")
    ap.add_argument("--idea", help="для write: тема и короткий сюжет")
    ap.add_argument("--rounds", type=int, default=2, help="для critique: сколько кругов правок")
    ap.add_argument("--draft", action="store_true", help="для episode: черновик 480×270")
    ap.add_argument("--stills", action="store_true", help="для episode: только ключевые кадры планов → build/episode_sheet.jpg")
    ap.add_argument("--shots", help="для episode: перерисовать только эти планы (через запятую)")
    a = ap.parse_args()

    if a.cmd == "voices":
        from voice import list_engines
        return list_engines()
    if a.cmd == "ref":
        from voice import import_ref
        if not (a.film and a.src):
            ap.error("ref <имя голоса> <аудиофайл> [--text ...]")
        return import_ref(a.film, Path(a.src), a.text) and None
    if a.cmd == "shot":
        from blender_shot import run_shot
        d = Path(a.film) if Path(a.film).exists() else ROOT / "films" / a.film
        return run_shot(d, a.frames) and None
    if a.cmd in ("write", "direct", "critique"):
        import agents
        d = Path(a.film) if Path(a.film).exists() else ROOT / "films" / a.film
        if a.cmd == "write":
            if not a.idea:
                ap.error("write <серия> --idea \"тема и короткий сюжет\"")
            return agents.write_script(d, a.idea) and None
        return (agents.direct(d) if a.cmd == "direct" else agents.critique(d, a.rounds)) and None
    if a.cmd == "episode":
        from episode import run_episode
        d = Path(a.film) if Path(a.film).exists() else ROOT / "films" / a.film
        return run_episode(d, a.draft, a.shots.split(",") if a.shots else None, a.stills) and None
    if a.cmd == "vocab":
        from check import vocab
        return say(json.dumps(vocab(), ensure_ascii=False, indent=1))
    if a.cmd == "serve":
        with serve(ROOT, a.port) as url:
            say(f"Плеер: {url}/engine/player.html?film={a.film or 'ufo_casino'}   (Ctrl+C — выход)")
            try:
                while True:
                    time.sleep(3600)
            except KeyboardInterrupt:
                return
    if not a.film:
        ap.error("укажи фильм")
    d = film_dir(a.film); film = load_film(d); name = d.name if d.parent == ROOT / "films" else str(d)
    size = (960, 540) if a.half else (1920, 1080)

    if a.cmd in ("check", "make") and not cmd_check(d, film):
        sys.exit(1)
    if a.cmd in ("voice", "make"):
        from voice import voice_film
        voice_film(d, film, a.force)
    if a.cmd in ("stills", "make"):
        from storyboard import stills
        stills(d, name)
    if a.cmd in ("render", "make"):
        from render import render
        render(d, name, film, *size)


if __name__ == "__main__":
    main()
