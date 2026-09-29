"""SAM_Toons · озвучка реплик локальными TTS-движками + данные для движения губ.

Движки (все офлайн и бесплатные), берётся первый установленный из пресета голоса:
  piper   — нейросетевые голоса, лучший вариант для Windows/Linux (pip install piper-tts, модели в models/piper/)
  rhvoice — 13 русских дикторов (Linux: apt install rhvoice rhvoice-russian)
  espeak  — роботизированный запасной вариант (espeak-ng)
Результат: build/voice/lines/*.wav и build/voice/manifest.json — длительность каждой реплики и
«громкость рта» по кадрам (env), по ней движок открывает рот персонажа.
"""
from __future__ import annotations

import functools
import hashlib
import json
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

from common import MODELS, ROOT, build_dir, ffmpeg, say

PRESETS = json.loads((ROOT / "studio/voices.json").read_text(encoding="utf-8"))
SR = 48000
MOOD = {  # настроение → (полутоны, темп)
    "happy": (1.0, 1.05), "sad": (-1.0, 0.92), "angry": (-0.5, 1.08), "scared": (2.0, 1.12), "surprised": (1.5, 1.0),
    "pray": (0.0, 0.93), "sly": (-0.5, 0.95), "tired": (-1.5, 0.88), "love": (0.5, 0.95), "dizzy": (0.5, 0.9),
}
FX = {
    "alien": "vibrato=f=7:d=0.35,aecho=0.8:0.6:25:0.35",
    "radio": "highpass=f=300,lowpass=f=3200,acompressor",
    "reverb": "aecho=0.8:0.7:60|95:0.25|0.15",
    "robot": "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75",
    "giant": "lowpass=f=2500,aecho=0.8:0.8:40:0.3",
    "chipmunk": "highpass=f=200",
}


# ---------------------------------------------------------------- движки
@functools.cache
def _piper_voice(model: str):
    from piper import PiperVoice  # type: ignore
    return PiperVoice.load(str(MODELS / "piper" / f"{model}.onnx"))


def available(e: dict) -> bool:
    kind = e["engine"]
    if kind == "piper":
        try:
            import piper  # noqa: F401  # type: ignore
        except ImportError:
            return False
        return (MODELS / "piper" / f"{e['model']}.onnx").exists()
    if kind == "rhvoice":
        return bool(shutil.which("RHVoice-test"))
    if kind == "espeak":
        return bool(shutil.which("espeak-ng") or shutil.which("espeak"))
    return False


def pick(preset_name: str) -> tuple[dict, dict]:
    pr = PRESETS.get(preset_name) or PRESETS["man"]
    for e in pr["engines"]:
        if available(e):
            return pr, e
    raise SystemExit(f"Для голоса «{preset_name}» не установлен ни один движок: {[e['engine'] for e in pr['engines']]}")


def synth_raw(e: dict, text: str, out: Path) -> None:
    kind = e["engine"]
    if kind == "piper":
        v = _piper_voice(e["model"])
        with wave.open(str(out), "wb") as wf:
            (v.synthesize_wav if hasattr(v, "synthesize_wav") else v.synthesize)(text, wf)
    elif kind == "rhvoice":
        subprocess.run(["RHVoice-test", "-p", e["voice"], "-o", str(out)], input=text.encode("utf-8"), check=True, capture_output=True)
    elif kind == "espeak":
        exe = shutil.which("espeak-ng") or shutil.which("espeak")
        subprocess.run([exe, "-v", e["voice"], "-s", "150", "-w", str(out), text], check=True, capture_output=True)


def _atempo(k: float) -> str:
    parts = []
    while k > 2.0:
        parts.append("atempo=2.0"); k /= 2.0
    while k < 0.5:
        parts.append("atempo=0.5"); k /= 0.5
    parts.append(f"atempo={k:.4f}")
    return ",".join(parts)


def post(raw: Path, out: Path, pitch: float, tempo: float, fx: list[str]) -> None:
    r = 2 ** (pitch / 12)
    chain = [f"aresample={SR}", f"asetrate={SR}*{r:.5f}", f"aresample={SR}", _atempo(tempo / r)]
    chain += [FX[f] for f in fx if f in FX]
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", str(raw), "-ac", "1", "-af", ",".join(chain), "-ar", str(SR), "-sample_fmt", "s16", str(out)], check=True)


# ---------------------------------------------------------------- звук → числа
def read_wav(p: Path) -> np.ndarray:
    with wave.open(str(p), "rb") as wf:
        data = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        if wf.getnchannels() > 1:
            data = data.reshape(-1, wf.getnchannels()).mean(axis=1)
    return data


def write_wav(p: Path, x: np.ndarray, sr: int = SR) -> None:
    with wave.open(str(p), "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr)
        wf.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def trim_and_level(x: np.ndarray) -> np.ndarray:
    """Срезать тишину по краям (оставив 60 мс) и выровнять громкость."""
    a = np.abs(x); th = max(1e-4, a.max() * 0.02)
    idx = np.nonzero(a > th)[0]
    if len(idx):
        pad = int(0.06 * SR); x = x[max(0, idx[0] - pad): idx[-1] + pad]
    rms = np.sqrt(np.mean(x ** 2)) or 1
    return np.clip(x * (0.12 / rms), -0.98, 0.98)


def mouth_env(x: np.ndarray, fps: int) -> list[float]:
    """Громкость по кадрам → открытие рта 0..1 (4 ступени, как у рисованных мультов)."""
    hop = SR // fps
    n = max(1, len(x) // hop)
    rms = np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2)) for i in range(n)])
    ref = np.percentile(rms, 90) or 1
    v = np.clip(rms / ref, 0, 1)
    v = np.convolve(v, [0.25, 0.5, 0.25], mode="same")
    q = np.where(v < 0.15, 0, np.where(v < 0.45, 0.35, np.where(v < 0.75, 0.7, 1.0)))
    return [float(round(k, 2)) for k in q]


# ---------------------------------------------------------------- фильм
def film_lines(film: dict) -> list[dict]:
    out = []
    for si, sc in enumerate(film.get("scenes", [])):
        sid = sc.get("id") or f"s{si + 1}"
        for bi, b in enumerate(sc.get("beats", [])):
            if b.get("say"):
                out.append({"id": f"{sid}_{bi + 1}", **b["say"]})
    return out


def voice_film(d: Path, film: dict, force: bool = False) -> dict:
    fps = int(film.get("fps", 25))
    vdir = build_dir(d, "voice"); ldir = build_dir(d, "voice", "lines")
    cast = film.get("cast", {})
    manifest = {"fps": fps, "lines": {}}
    used = set()
    lines = film_lines(film)
    for i, l in enumerate(lines):
        who = l["who"]; c = cast.get(who, {})
        preset_name = c.get("voice") or ("narrator" if who == "narrator" else "man")
        pr, eng = pick(preset_name)
        mp, mt = MOOD.get(l.get("mood") or "", (0.0, 1.0))
        pitch, tempo = pr.get("pitch", 0) + c.get("pitch", 0) + mp, pr.get("tempo", 1.0) * c.get("tempo", 1.0) * mt
        fx = pr.get("fx", []) + c.get("fx", [])
        text = l["text"].replace("+", "")
        key = hashlib.sha1(json.dumps([text, eng, pitch, tempo, fx], ensure_ascii=False).encode()).hexdigest()[:14]
        wav = ldir / f"{key}.wav"
        if force or not wav.exists():
            with tempfile.TemporaryDirectory() as tmp:
                raw, cooked = Path(tmp) / "raw.wav", Path(tmp) / "cooked.wav"
                synth_raw(eng, text, raw)
                post(raw, cooked, pitch, tempo, fx)
                write_wav(wav, trim_and_level(read_wav(cooked)))
            say(f"  [{i + 1}/{len(lines)}] {l['id']} {who} ({eng['engine']}:{eng.get('model') or eng.get('voice')}): {text}")
        x = read_wav(wav)
        manifest["lines"][l["id"]] = {"file": f"lines/{wav.name}", "dur": round(len(x) / SR, 3), "text": l["text"], "who": who, "env": mouth_env(x, fps)}
        used.add(wav.name)
    for old in ldir.glob("*.wav"):
        if old.name not in used:
            old.unlink()
    (vdir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    total = sum(v["dur"] for v in manifest["lines"].values())
    say(f"Озвучка: {len(lines)} реплик, {total:.1f} с речи → {vdir / 'manifest.json'}")
    return manifest


def list_engines() -> None:
    for name, pr in PRESETS.items():
        if name.startswith("_"):
            continue
        ok = [e for e in pr["engines"] if available(e)]
        e = ok[0] if ok else None
        say(f"  {name:10s} → " + (f"{e['engine']}:{e.get('model') or e.get('voice')}" if e else "НЕТ ДВИЖКА"))
