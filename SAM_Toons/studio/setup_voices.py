#!/usr/bin/env python3
"""Скачать русские голоса Piper в models/piper/ (один раз, ~60 МБ на голос)."""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "models/piper"
BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU"
VOICES = ["dmitri", "denis", "ruslan", "irina"]


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for v in VOICES:
        for ext in (".onnx", ".onnx.json"):
            name = f"ru_RU-{v}-medium{ext}"
            out = DEST / name
            if out.exists() and out.stat().st_size > 0:
                print(f"  есть: {name}")
                continue
            print(f"  качаю {name} …", flush=True)
            try:
                urllib.request.urlretrieve(f"{BASE}/{v}/medium/{name}", out)
            except Exception as e:  # noqa: BLE001
                out.unlink(missing_ok=True)
                sys.exit(f"Не скачалось {name}: {e}")
    print("Голоса Piper готовы. Проверка: python studio/sam.py voices")


if __name__ == "__main__":
    main()
