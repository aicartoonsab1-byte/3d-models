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


# ---------------------------------------------------------------- болото (серия 1): синтез без библиотек
def _band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Полосовой фильтр через БПФ (быстро и для длинного фона)."""
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x)).astype(np.float32)


def _noise(sec: float) -> np.ndarray:
    return rng.standard_normal(int(sec * SR)).astype(np.float32)


def _bubble(f0: float = 300, dur: float = 0.09) -> np.ndarray:
    """Пузырь в трясине: синус со скользящей вверх частотой и быстрым затуханием."""
    t = _t(dur); return _tone(f0 * (1 + 2.5 * t / dur), t) * np.exp(-t * 45) * np.clip(t / 0.004, 0, 1)


def sfx_squelch():
    """Хлюп шага по грязи: мокрый шум + пара пузырей."""
    t = _t(0.28); n = _band(_noise(0.28), 150, 1800) * np.exp(-t * 16) * 1.4
    out = n.copy()
    for k in range(3):
        b = _bubble(rng.uniform(180, 420), rng.uniform(0.05, 0.1)); i = int(rng.uniform(0.0, 0.12) * SR)
        out[i:i + len(b)] += b[: len(out) - i] * 0.5
    return out * 0.8


def sfx_sink():
    """Долгое чавканье: нога уходит в трясину."""
    t = _t(1.4); base = _band(_noise(1.4), 80, 900) * (0.4 + 0.6 * np.sin(np.pi * t / t[-1])) * 0.9
    for k in range(14):
        b = _bubble(rng.uniform(120, 300), rng.uniform(0.06, 0.14)); i = int(rng.uniform(0, 1.25) * SR)
        base[i:i + len(b)] += b[: len(base) - i] * rng.uniform(0.3, 0.8)
    return base * _env(len(t), 0.05, 0.3)


def sfx_splash():
    """Плюх в лужу: удар + брызги."""
    t = _t(0.9); hit = _tone(110 - 70 * t, t) * np.exp(-t * 18)
    spray = _band(_noise(0.9), 600, 6000) * np.exp(-t * 6) * np.clip(t / 0.02, 0, 1)
    out = hit + spray * 0.7
    for k in range(8):
        b = _bubble(rng.uniform(300, 900), 0.05); i = int(rng.uniform(0.08, 0.6) * SR)
        out[i:i + len(b)] += b[: len(out) - i] * 0.3
    return out * 0.9


def sfx_click():
    """Сухое «щёлк-щёлк» жвал богомола."""
    out = np.zeros(int(0.32 * SR), np.float32)
    for at in (0.0, 0.17):
        t = _t(0.03); c = _band(_noise(0.03), 1800, 7000) * np.exp(-t * 260) + _tone(2400, t) * np.exp(-t * 300) * 0.5
        i = int(at * SR); out[i:i + len(c)] += c
    return out * 1.2


def sfx_trumpet():
    """Трубный рёв слона: пила с вибрато, подъём и срыв высоты."""
    t = _t(1.5); f = 260 + 160 * np.sin(np.pi * np.clip(t / 1.1, 0, 1)) - 60 * np.clip((t - 1.1) / 0.4, 0, 1) + 12 * np.sin(2 * np.pi * 7 * t)
    x = _tone(f, t, "saw") + 0.4 * _tone(f * 2.01, t, "saw")
    x = _band(x.astype(np.float32), 150, 3500) + _band(_noise(1.5), 800, 3000) * 0.15
    return x * _env(len(t), 0.06, 0.35) * 0.5


def sfx_whoosh_by():
    """Свист ветра мимо камеры."""
    t = _t(1.1); n = _noise(1.1)
    lo = _band(n, 200, 1200); hi = _band(n, 1200, 5000); m = np.sin(np.pi * t / t[-1]) ** 3
    return (lo * m + hi * m ** 2 * 0.6) * 1.6


def sfx_stampede():
    """Стадо: частый глухой топот, нарастает и уходит, с брызгами грязи."""
    dur = 4.0; out = np.zeros(int(dur * SR), np.float32)
    rumble = _band(_noise(dur), 30, 160) * 2.0; tt = _t(dur); env = np.sin(np.pi * tt / dur) ** 1.2
    out += rumble * env
    tp = 0.0
    while tp < dur - 0.3:
        s = sfx_thud() * rng.uniform(0.3, 0.8); i = int(tp * SR); out[i:i + len(s)] += s[: len(out) - i] * env[i]
        if rng.random() < 0.3:
            q = sfx_squelch() * 0.4; out[i:i + len(q)] += q[: len(out) - i] * env[i]
        tp += rng.uniform(0.05, 0.13)
    return out * 0.7


def sfx_buzz():
    """Тонкое «з-з-з» подлёта малыша-богомола (приближается)."""
    t = _t(1.6); f = 330 + 30 * np.sin(2 * np.pi * 3 * t)
    x = _tone(f, t, "saw") * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t))
    return _band(x.astype(np.float32), 250, 4000) * (t / t[-1]) ** 1.5 * _env(len(t), 0.02, 0.1) * 0.35


def sfx_sting():
    """Укус: щелчок + «пш-ш» ожога."""
    t = _t(0.7); c = _band(_noise(0.7), 2000, 8000)
    return (c * np.exp(-t * 90) * 1.2 + _band(_noise(0.7), 3000, 9000) * np.exp(-t * 5) * np.clip(t / 0.05, 0, 1) * 0.35)


def sfx_inflate():
    """Рука надувается: резиновый скрип шарика, высота ползёт вверх."""
    t = _t(1.8); f = 180 + 260 * (t / t[-1]) ** 1.3 + 25 * np.sin(2 * np.pi * 13 * t)
    x = _tone(f, t, "square") * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 6 * t)))
    return _band(x.astype(np.float32), 200, 2500) * _env(len(t), 0.1, 0.1) * 0.3


def sfx_crunch():
    """Хруст панциря."""
    out = np.zeros(int(0.6 * SR), np.float32)
    for k in range(9):
        t = _t(0.04); c = _band(_noise(0.04), 900, 6000) * np.exp(-t * 120)
        i = int(rng.uniform(0, 0.45) * SR); out[i:i + len(c)] += c * rng.uniform(0.5, 1)
    return out * 1.1


def sfx_sniff():
    """Шмыг носом — два коротких вдоха."""
    out = np.zeros(int(0.5 * SR), np.float32)
    for at in (0.0, 0.2):
        t = _t(0.16); s = _band(_noise(0.16), 1500, 6000) * np.sin(np.pi * t / t[-1]) ** 2
        i = int(at * SR); out[i:i + len(s)] += s
    return out * 0.6


def _pluck(f: float, dur: float) -> np.ndarray:
    """Пиццикато: щипок струны (Карплус-Стронг)."""
    n = int(dur * SR); p = int(SR / f); buf = rng.uniform(-1, 1, p).astype(np.float32)
    out = np.empty(n, np.float32)
    for i in range(n):
        out[i] = buf[i % p]; buf[i % p] = 0.497 * (buf[i % p] + buf[(i + 1) % p])
    return out


def _bassoon(f: float, dur: float) -> np.ndarray:
    t = _t(dur); x = _tone(f * (1 + 0.006 * np.sin(2 * np.pi * 5 * t)), t, "saw")
    return _band(x.astype(np.float32), 60, 1400) * _env(len(t), 0.03, 0.08)


def sfx_music_sting():
    """Короткая шкодная тема: пиццикато на цыпочках + фагот «бу-бум»."""
    notes = [(392, 0.0), (440, 0.18), (392, 0.36), (330, 0.54), (349, 0.9), (392, 1.08), (262, 1.44)]
    out = np.zeros(int(2.6 * SR), np.float32)
    for f, at in notes:
        x = _pluck(f, 0.5); i = int(at * SR); out[i:i + len(x)] += x * 0.5
    for f, at, d in ((98, 0.0, 0.3), (131, 0.54, 0.3), (98, 1.44, 0.9)):
        x = _bassoon(f, d); i = int(at * SR); out[i:i + len(x)] += x * 0.5
    return out


def sfx_pop_big():
    """Хлопок превращения."""
    t = _t(0.5); return (_tone(160 - 120 * t, t) * np.exp(-t * 12) + _band(_noise(0.5), 400, 5000) * np.exp(-t * 30)) * 0.9


def amb_swamp(sec: float) -> np.ndarray:
    """Ночное болото: ветер в камыше, сверчки, лягушки, пузыри, редкий далёкий крик."""
    n = int(sec * SR); tt = np.arange(n) / SR
    out = _band(_noise(sec), 120, 900) * 0.05 * (0.7 + 0.3 * np.sin(2 * np.pi * tt / 7.3))          # ветер
    cr = _tone(4300, tt) * (np.sin(2 * np.pi * 28 * tt) > 0.3) * (np.sin(2 * np.pi * 0.7 * tt) > -0.2) # сверчки
    out += cr.astype(np.float32) * 0.012
    tp = rng.uniform(0, 1)
    while tp < sec - 0.5:                                                                               # лягушки «ква-ква»
        f0 = rng.uniform(140, 260)
        for r in range(rng.integers(2, 5)):
            t = _t(0.11); c = _tone(f0 * (1 + 0.4 * t / 0.11), t, "square") * np.sin(np.pi * t / 0.11)
            c = _band(c.astype(np.float32), 200, 1600) * 0.05; i = int((tp + r * 0.16) * SR); out[i:i + len(c)] += c[: n - i]
        tp += rng.uniform(1.2, 3.5)
    tp = rng.uniform(0, 2)
    while tp < sec - 0.3:                                                                               # пузыри
        b = _bubble(rng.uniform(150, 400), rng.uniform(0.06, 0.12)) * 0.06; i = int(tp * SR); out[i:i + len(b)] += b[: n - i]
        tp += rng.uniform(0.3, 2.0)
    tp = rng.uniform(6, 12)
    while tp < sec - 2:                                                                                 # далёкий крик
        t = _t(1.3); c = _tone(700 + 300 * np.sin(np.pi * t / 1.3) - 200 * t, t) * _env(len(t), 0.1, 0.6)
        c = _band(c.astype(np.float32), 300, 2000) * 0.025; i = int(tp * SR); out[i:i + len(c)] += c[: n - i]
        tp += rng.uniform(14, 25)
    return out


AMB = {"swamp": amb_swamp}


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
    if not fn:
        return None
    x = fn().astype(np.float32); pk = float(np.abs(x).max()) or 1
    return x * (0.9 / pk) if pk > 0.9 else x


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


def _bed(name: str, sec: float) -> np.ndarray | None:
    """Фоновая атмосфера: запись sounds/amb_<name>/ петлёй, иначе синтез."""
    files = library(f"amb_{name}")
    n = int(sec * SR)
    if files:
        bed = np.concatenate([_decode(f) for f in files]); bed = bed / (np.abs(bed).max() or 1)
        start = int(rng.uniform(0, max(1, len(bed) - n))) if len(bed) > n else 0
        return np.tile(bed, n // len(bed) + 2)[start:start + n] * 0.5
    fn = AMB.get(name)
    return fn(sec) * 2.5 if fn else None


def mix_timeline(d: Path, timeline: list[dict], total: float, ep: dict) -> Path:
    """Сведение серии. timeline: {"kind":"voice","t","file"} · {"kind":"sfx","t","name","vol"} · {"kind":"amb","t0","t1","name"}.
    Речь сверху, звуки под ней, фон приглушается под речью (ducking), в конце — мягкий лимитер."""
    n = int((total + 0.5) * SR)
    voice = np.zeros(n, np.float32); fx = np.zeros(n, np.float32); bed = np.zeros(n, np.float32)
    vdir = d / "build/voice"; count: dict[str, int] = {}; cache: dict = {}
    for e in sorted(timeline, key=lambda e: e.get("t", e.get("t0", 0))):
        if e["kind"] == "voice":
            x = read_wav(vdir / e["file"]); i = int(e["t"] * SR); seg = x[: max(0, n - i)]; voice[i:i + len(seg)] += seg
        elif e["kind"] == "sfx":
            k = count[e["name"]] = count.get(e["name"], -1) + 1
            files = library(e["name"])
            key = (e["name"], k % len(files)) if files else (e["name"], k % 3)
            if key not in cache:
                cache[key] = sound(e["name"], k)
            x = cache[key]
            if x is None:
                say(f"⚠ неизвестный звук: {e['name']}"); continue
            # лёгкий разброс высоты и громкости — повторяющиеся шаги не звучат как пулемёт
            if e["name"] in ("squelch", "thud", "click"):
                r = rng.uniform(0.9, 1.12); idx = np.arange(0, len(x) - 1, r); x = np.interp(idx, np.arange(len(x)), x).astype(np.float32)
            x = x * float(e.get("vol", 1.0)) * 0.7 * rng.uniform(0.85, 1.0)
            i = max(0, int(e["t"] * SR)); seg = x[: max(0, n - i)]; fx[i:i + len(seg)] += seg
        elif e["kind"] == "amb":
            i0, i1 = int(e["t0"] * SR), min(n, int(e["t1"] * SR))
            b = _bed(e["name"], (i1 - i0) / SR + 0.01)
            if b is None:
                continue
            b = b[: i1 - i0]; fade = min(len(b) // 2, int(0.15 * SR))
            if fade:
                b[:fade] *= np.linspace(0, 1, fade); b[-fade:] *= np.linspace(1, 0, fade)
            bed[i0:i0 + len(b)] += b
    # ducking: огибающая речи → фон тише на 50%, звуки на 20%
    hop = int(0.02 * SR); env = np.abs(voice[: n // hop * hop]).reshape(-1, hop).max(1)
    act = (env > 0.02).astype(np.float32); k = int(0.35 / 0.02)
    act = np.convolve(act, np.ones(k) / k, mode="same"); act = np.clip(act * 2.5, 0, 1)
    act = np.repeat(act, hop); act = np.pad(act, (0, n - len(act)), mode="edge")
    out = voice + fx * (1 - 0.2 * act) + bed * float(ep.get("ambience_volume", 1.0)) * (1 - 0.5 * act)
    m = ep.get("music")
    if m and (d / m["file"]).exists():
        mus = _decode(d / m["file"]); mus = np.tile(mus, n // len(mus) + 1)[:n] * float(m.get("volume", 0.15))
        out += mus * (1 - 0.6 * act)
    peak = np.abs(out).max() or 1
    out = out / max(1.0, peak / 1.4)          # грубая нормализация, дальше мягкое ограничение
    out = np.tanh(out * 1.1) * 0.93
    path = d / "build/audio.wav"
    write_wav(path, out.astype(np.float32))
    say(f"Звук: {total:.1f} с, событий: {len(timeline)} → {path}")
    return path
