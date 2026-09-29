"""SAM_Toons · озвучка через Fun-CosyVoice3-0.5B. Запускается ОТДЕЛЬНЫМ Python-окружением CosyVoice
(у модели свои версии torch и прочего), поэтому студия не импортирует этот файл, а вызывает его процессом:

  <python окружения cosyvoice> cosy_worker.py --repo models/CosyVoice --model <папка модели> --job job.json

job.json — список реплик: [{"text", "out", "ref", "ref_text", "instruct", "speed"}].
  ref       — образец голоса (wav 3–15 с)
  ref_text  — что сказано в образце; если есть — режим zero-shot (точнее тембр), иначе cross-lingual
  instruct  — как говорить (эмоция); тогда режим instruct2
Модель грузится один раз на весь пакет. --check только загружает модель. --mock пишет тон вместо речи (проверка связки).
"""
from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import time
import wave
from pathlib import Path

PROMPT = "You are a helpful assistant."


def mock_wav(path: str, text: str) -> None:
    sr, dur = 24000, 0.3 + len(text) / 14
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr)
        wf.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * 220 * i / sr) * (0.5 + 0.5 * math.sin(2 * math.pi * 4 * i / sr)))) for i in range(int(sr * dur))))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--job")
    ap.add_argument("--fp16", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--mock", action="store_true")
    a = ap.parse_args()
    job = json.loads(Path(a.job).read_text(encoding="utf-8")) if a.job else []

    if a.mock:
        for i, it in enumerate(job):
            mock_wav(it["out"], it["text"]); print(f"OK {i + 1}/{len(job)}", flush=True)
        return

    repo = Path(a.repo).resolve()
    sys.path[:0] = [str(repo), str(repo / "third_party/Matcha-TTS")]
    import torch
    import torchaudio
    from cosyvoice.cli.cosyvoice import AutoModel

    t0 = time.time()
    m = AutoModel(model_dir=a.model, fp16=a.fp16 and torch.cuda.is_available())
    print(f"MODEL {time.time() - t0:.1f}s cuda={torch.cuda.is_available()} sr={m.sample_rate}", flush=True)
    if a.check:
        return
    for i, it in enumerate(job):
        text, ref, speed = it["text"], it["ref"], float(it.get("speed", 1.0))
        if it.get("instruct"):
            gen = m.inference_instruct2(text, f"{PROMPT} {it['instruct']}<|endofprompt|>", ref, stream=False, speed=speed)
        elif it.get("ref_text"):
            gen = m.inference_zero_shot(text, f"{PROMPT}<|endofprompt|>{it['ref_text']}", ref, stream=False, speed=speed)
        else:
            gen = m.inference_cross_lingual(f"{PROMPT}<|endofprompt|>{text}", ref, stream=False, speed=speed)
        speech = torch.cat([j["tts_speech"] for j in gen], dim=1)
        torchaudio.save(it["out"], speech.cpu(), m.sample_rate)
        print(f"OK {i + 1}/{len(job)}", flush=True)


if __name__ == "__main__":
    main()
