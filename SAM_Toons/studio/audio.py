"""SAM_Toons · звуки и сведение: процедурные шумы (без библиотек звуков) + реплики + музыка → build/audio.wav."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import numpy as np

from common import build_dir, ffmpeg, say
from voice import SR, read_wav, write_wav

rng = np.random.default_rng(7)


def _t(sec: float) -> np.ndarray:
    return np.arange(int(sec * SR)) / SR


def _env(n: int, a: float = 0.01, r: float = 0.2) -> np.ndarray:
    t = np.arange(n) / SR; dur = n / SR
    return np.clip(t / max(a, 1e-4), 0, 1) * np.clip((dur - t) / max(r, 1e-4), 0, 1)


def _lowpass(x: np.ndarray, k: np.ndarray | float) -> np.ndarray:
    """Однополюсный фильтр; k — коэффициент (0..1), может меняться во времени."""
    y = np.empty_like(x); acc = 0.0
    kk = np.broadcast_to(np.asarray(k, dtype=np.float32), x.shape)
    for i in range(len(x)):
        acc += kk[i] * (x[i] - acc); y[i] = acc
    return y


def _tone(freq, t: np.ndarray, kind: str = "sine") -> np.ndarray:
    ph = 2 * np.pi * np.cumsum(np.broadcast_to(freq, t.shape)) / SR
    if kind == "saw":
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    if kind == "square":
        return np.sign(np.sin(ph))
    return np.sin(ph)


def sfx_whoosh():
    t = _t(0.9); n = rng.standard_normal(len(t)).astype(np.float32)
    k = 0.02 + 0.25 * np.sin(np.pi * t / t[-1]) ** 2
    return _lowpass(n, k) * np.sin(np.pi * t / t[-1]) ** 1.5 * 1.6


def sfx_pop():
    t = _t(0.12); return _tone(700 - 3500 * t, t) * np.exp(-t * 35) * 0.8


def sfx_ding():
    t = _t(1.4); return (_tone(1318, t) + 0.5 * _tone(2637, t) + 0.25 * _tone(3951, t)) * np.exp(-t * 3.2) * 0.35


def sfx_ufo():
    t = _t(2.4); f = 420 + 380 * np.sin(np.pi * t / t[-1]) + 25 * np.sin(2 * np.pi * 7 * t)
    return (_tone(f, t) + 0.3 * _tone(f * 1.5, t)) * _env(len(t), 0.3, 0.6) * (0.8 + 0.2 * np.sin(2 * np.pi * 11 * t)) * 0.3


def sfx_beam():
    t = _t(1.3); out = np.zeros_like(t)
    for i, f0 in enumerate((600, 900, 1350)):
        out += _tone(f0 + 900 * t + 40 * np.sin(2 * np.pi * (9 + i) * t), t) / (i + 1)
    return out * _env(len(t), 0.05, 0.5) * 0.25


def sfx_thud():
    t = _t(0.35); return (_tone(90 - 60 * t, t) * np.exp(-t * 14) + rng.standard_normal(len(t)) * np.exp(-t * 60) * 0.3) * 0.9


def sfx_boing():
    t = _t(0.7); return _tone(220 + 120 * np.sin(2 * np.pi * 9 * t) * np.exp(-t * 4), t) * np.exp(-t * 5) * 0.6


def sfx_beep():
    t = _t(0.16); return _tone(880, t, "square") * _env(len(t), 0.005, 0.02) * 0.2


def sfx_fail():
    """«Вау-вау-вау-ваааа» — грустный тромбон."""
    notes = [(311, 0.38), (294, 0.38), (277, 0.38), (262, 1.3)]
    parts = []
    for i, (f, d) in enumerate(notes):
        t = _t(d); vib = 1 + (0.012 * np.sin(2 * np.pi * 5.5 * t) * (t > 0.3) if i == 3 else 0)
        x = _tone(f * vib, t, "saw")
        x = _lowpass(x.astype(np.float32), 0.08 + 0.1 * np.exp(-t * 3))
        parts.append(x * _env(len(t), 0.03, 0.12 if i < 3 else 0.5))
    return np.concatenate(parts) * 0.9


def sfx_pray():
    t = _t(1.6); return sum(_tone(f, t) for f in (523, 659, 784)) * _env(len(t), 0.4, 0.8) * 0.12


SFX = {name[4:]: fn for name, fn in globals().items() if name.startswith("sfx_")}


def render_sfx(d: Path) -> None:
    out = build_dir(d, "sfx")
    for name, fn in SFX.items():
        write_wav(out / f"{name}.wav", fn().astype(np.float32))


def _decode(path: Path) -> np.ndarray:
    with tempfile.TemporaryDirectory() as tmp:
        w = Path(tmp) / "m.wav"
        subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-sample_fmt", "s16", str(w)], check=True)
        return read_wav(w)


SOUNDS = Path(__file__).resolve().parents[1] / "sounds"
_AUDIO_EXT = (".wav", ".mp3", ".ogg", ".flac")


def library(name: str) -> list[Path]:
    """Настоящие записи звука: sounds/<name>/*.wav|mp3|ogg (скачивает studio/get_sounds.py)."""
    d = SOUNDS / name
    return sorted(p for p in d.glob("*") if p.suffix.lower() in _AUDIO_EXT) if d.is_dir() else []


def sound(name: str, variant: int = 0) -> np.ndarray | None:
    """Звук по имени: сначала запись из библиотеки (варианты по очереди — чтобы шаги не звучали одинаково),
    а если записи нет — синтез кодом (запасной вариант)."""
    files = library(name)
    if files:
        x = _decode(files[variant % len(files)])
        return x / (np.abs(x).max() or 1) * 0.8
    fn = SFX.get(name)
    return fn().astype(np.float32) if fn else None


def mix(d: Path, film: dict, info: dict) -> Path:
    """Собрать звуковую дорожку по разложенному времени (info — из движка)."""
    render_sfx(d)
    n = int((info["duration"] + 0.5) * SR)
    voice = np.zeros(n, np.float32); fx = np.zeros(n, np.float32)
    vdir = d / "build/voice"
    missing = 0
    for l in info["lines"]:
        if not l.get("file"):
            missing += 1; continue
        x = read_wav(vdir / l["file"]); i = int(l["t0"] * SR)
        seg = x[: max(0, n - i)]; voice[i:i + len(seg)] += seg
    count: dict[str, int] = {}
    for s in info["sfx"]:
        k = count[s["name"]] = count.get(s["name"], -1) + 1
        x = sound(s["name"], k)
        if x is None:
            say(f"⚠ неизвестный звук: {s['name']} (нет ни sounds/{s['name']}/, ни синтеза)"); continue
        x = x * float(s.get("vol", 1)) * 0.7; i = int(s["t"] * SR)
        seg = x[: max(0, n - i)]; fx[i:i + len(seg)] += seg
    # фон (атмосфера места) — петлёй подо всей сценой, тише под речью
    amb = film.get("ambience") or info.get("ambience")
    if amb:
        files = library(f"amb_{amb}")
        if files:
            bed = np.concatenate([_decode(f) for f in files]); bed = np.tile(bed, n // len(bed) + 1)[:n]
            fx += bed / (np.abs(bed).max() or 1) * float(film.get("ambience_volume", 0.18))
        else:
            say(f"⚠ нет фона sounds/amb_{amb}/ — скачайте: python studio/get_sounds.py")
    out = voice + fx
    m = film.get("music")
    if m and (d / m["file"]).exists():
        mus = _decode(d / m["file"]); mus = np.tile(mus, n // len(mus) + 1)[:n] * float(m.get("volume", 0.15))
        # приглушить музыку под речью
        win = np.ones(int(0.3 * SR), np.float32) / int(0.3 * SR)
        duck = np.convolve((np.abs(voice) > 0.01).astype(np.float32), win, mode="same")
        out += mus * (1 - 0.6 * np.clip(duck * 3, 0, 1))
    out = np.tanh(out * 1.1) * 0.95
    path = d / "build/audio.wav"
    write_wav(path, out)
    if missing:
        say(f"⚠ {missing} реплик без озвучки (запусти: sam.py voice)")
    return path
