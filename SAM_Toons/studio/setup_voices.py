#!/usr/bin/env python3
"""Скачать русские голоса Piper в models/piper/ (один раз, ~60 МБ на голос).

Сначала с HuggingFace (rhasspy/piper-voices), а если он недоступен — те же модели из релизов
sherpa-onnx на GitHub (архив .tar.bz2, из него берутся .onnx и .onnx.json).
"""
from __future__ import annotations

import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "models/piper"
HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU"
GH = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models"
VOICES = ["dmitri", "denis", "ruslan", "irina"]


def from_hf(v: str) -> None:
    for ext in (".onnx", ".onnx.json"):
        name = f"ru_RU-{v}-medium{ext}"
        urllib.request.urlretrieve(f"{HF}/{v}/medium/{name}", DEST / name)


def from_github(v: str) -> None:
    pack = f"vits-piper-ru_RU-{v}-medium"
    with tempfile.TemporaryDirectory() as tmp:
        arc = Path(tmp) / f"{pack}.tar.bz2"
        urllib.request.urlretrieve(f"{GH}/{pack}.tar.bz2", arc)
        with tarfile.open(arc) as tf:
            for m in tf.getmembers():
                if m.name.endswith((".onnx", ".onnx.json")) and f"ru_RU-{v}-medium" in m.name:
                    m.name = Path(m.name).name
                    tf.extract(m, DEST)


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for v in VOICES:
        if (DEST / f"ru_RU-{v}-medium.onnx").exists() and (DEST / f"ru_RU-{v}-medium.onnx.json").exists():
            print(f"  есть: {v}")
            continue
        print(f"  качаю {v} …", flush=True)
        try:
            from_hf(v)
        except Exception as e:  # noqa: BLE001
            print(f"    HuggingFace недоступен ({e}), беру с GitHub…", flush=True)
            try:
                from_github(v)
            except Exception as e2:  # noqa: BLE001
                for f in DEST.glob(f"ru_RU-{v}-medium*"):
                    f.unlink()
                sys.exit(f"Не скачался голос {v}: {e2}")
    print("Голоса Piper готовы. Проверка: python studio/sam.py voices")


if __name__ == "__main__":
    main()
