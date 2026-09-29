#!/usr/bin/env python3
"""Скачать записи движений (BVH, база CMU Graphics Lab — бесплатно для любого использования) в models/mocap/.

  python blender/get_mocap.py              # подборка для мультфильмов (список ниже)
  python blender/get_mocap.py 79_73 18_08  # конкретные записи
  python blender/get_mocap.py --index      # оглавление всей базы (2548 записей) → models/mocap/index.txt

Оглавление ищет нужное: «scared», «walk», «gesture», «point»… Номер записи = <субъект>_<дубль>.
"""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "models/mocap"
RAW = "https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master"

# подборка: что это и какой кусок (секунды) хорош для игры персонажа — см. каталог blender/tools/catalog.py
KIT = {
    "93_07": "бодрая ходьба",
    "82_08": "стоит, потом спокойно идёт (ходьба 8–14 с)",
    "77_01": "осматривается; 1.5–5 с — наклоняется к земле, 5.7–7.4 — стоит и смотрит",
    "79_73": "испуг",
    "79_78": "снимает на камеру (влог), 1.9–9.5 с",
    "18_08": "объясняет с жестами",
    "79_88": "отмахивается от мухи",
    "79_69": "очень рад",
    "79_71": "грустит",
    "79_94": "поигрывает мускулами (рассматривает руку)",
    "69_73": "подходит и наклоняется, поднимает предмет",
    "13_28": "машет, указывает, регулирует движение",
}


def fetch(name: str) -> None:
    subj = name.split("_")[0].zfill(3)
    out = DEST / f"{name}.bvh"
    if out.exists():
        print(f"  есть: {name}"); return
    print(f"  качаю {name} …", flush=True)
    urllib.request.urlretrieve(f"{RAW}/data/{subj}/{name}.bvh", out)


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    if "--index" in args:
        urllib.request.urlretrieve(f"{RAW}/cmu-mocap-index-text.txt", DEST / "index.txt")
        print(f"Оглавление: {DEST / 'index.txt'}"); return
    for n in args or KIT:
        fetch(n)
    print("Готово. Каталог кадров: blender -b --factory-startup -P blender/tools/catalog.py")


if __name__ == "__main__":
    main()
