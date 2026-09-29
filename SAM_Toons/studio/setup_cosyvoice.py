#!/usr/bin/env python3
"""Подключить Fun-CosyVoice3-0.5B к студии.

  python studio/setup_cosyvoice.py --python <python.exe окружения cosyvoice> [--download] [--no-fp16]

--download  скачать модель (~2–3 ГБ) в models/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B
            через huggingface_hub (или modelscope), запуская их внутри окружения cosyvoice.
Затем скрипт пробно загружает модель и записывает пути в studio/engines.local.json.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT / "models/CosyVoice"
MODEL = REPO / "pretrained_models/Fun-CosyVoice3-0.5B"
CFG = ROOT / "studio/engines.local.json"
HF_ID = "FunAudioLLM/Fun-CosyVoice3-0.5B-2512"

DOWNLOAD = f"""
import sys
try:
    from huggingface_hub import snapshot_download
    snapshot_download('{HF_ID}', local_dir=r'{MODEL}')
except Exception as e:
    print('huggingface_hub не сработал:', e, '— пробую modelscope', file=sys.stderr)
    from modelscope import snapshot_download
    snapshot_download('{HF_ID}', local_dir=r'{MODEL}')
"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--python", required=True, help="python окружения, куда установлены зависимости CosyVoice")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--no-fp16", action="store_true")
    a = ap.parse_args()
    py = Path(a.python)
    if not py.exists():
        sys.exit(f"Нет такого python: {py}")
    if not (REPO / "cosyvoice").exists():
        sys.exit(f"Нет репозитория CosyVoice в {REPO}.\n  git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git \"{REPO}\"")
    if not (REPO / "third_party/Matcha-TTS/matcha").exists():
        sys.exit("Нет подмодуля Matcha-TTS: в папке models/CosyVoice выполни  git submodule update --init --recursive")
    if a.download:
        print("Качаю модель…", flush=True)
        subprocess.run([str(py), "-c", DOWNLOAD], check=True)
    if not (MODEL / "cosyvoice3.yaml").exists():
        sys.exit(f"Модель не найдена в {MODEL} (запусти с --download)")
    fp16 = not a.no_fp16
    print("Пробная загрузка модели…", flush=True)
    cmd = [str(py), str(ROOT / "studio/cosy_worker.py"), "--repo", str(REPO), "--model", str(MODEL), "--check"] + (["--fp16"] if fp16 else [])
    if subprocess.run(cmd, cwd=REPO).returncode:
        sys.exit("Модель не загрузилась — см. ошибку выше (чаще всего не хватает пакета из requirements.txt CosyVoice)")
    CFG.write_text(json.dumps({"cosyvoice": {"python": str(py), "repo": str(REPO), "model": str(MODEL), "fp16": fp16}}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Готово: {CFG}\nДальше — образцы голосов:  python studio/sam.py ref narrator запись.wav --text \"что сказано в записи\"")


if __name__ == "__main__":
    main()
