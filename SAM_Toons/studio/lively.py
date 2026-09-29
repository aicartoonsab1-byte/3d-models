"""SAM_Toons · «оживление» синтезированной речи — чтобы TTS звучал как живой смешной мульт, а не диктор.

Замеры референса (разговорный мульт): 8–13 слогов в секунду, голоса высокие (медиана 230–380 Гц),
интонация скачет на 12–17 полутонов. Обычный TTS: 4–6 слогов/с и ровная интонация.
Что делаем (Praat через parselmouth, PSOLA — голос не «плывёт»):
  range  — растягиваем интонацию вокруг средней высоты (1.0 — как есть, 1.6 — заметно живее);
  pitch  — сдвиг высоты в полутонах («мультяшность»);
  контур — у вопроса подъём в конце, у восклицания ударный пик в начале фразы;
Темп меняет уже ffmpeg (atempo) в voice.post — он не трогает высоту.
Если parselmouth не установлен, этот шаг тихо пропускается.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np


def available() -> bool:
    try:
        import parselmouth  # noqa: F401
        return True
    except ImportError:
        return False


def liven(inp: Path, out: Path, text: str, rng: float = 1.6, pitch: float = 0.0) -> bool:
    """Переписать интонацию файла inp → out. Возвращает False, если голос не удалось разобрать."""
    import parselmouth
    from parselmouth.praat import call

    snd = parselmouth.Sound(str(inp))
    dur = snd.get_total_duration()
    manip = call(snd, "To Manipulation", 0.01, 60, 600)
    tier = call(manip, "Extract pitch tier")
    n = int(call(tier, "Get number of points"))
    if n < 3:
        return False
    ts = np.array([call(tier, "Get time from index", i) for i in range(1, n + 1)])
    fs = np.array([call(tier, "Get value at index", i) for i in range(1, n + 1)])
    med = float(np.median(fs))
    st = 12 * np.log2(fs / med) * rng + pitch               # полутоны от средней высоты
    u = ts / max(dur, 1e-3)
    t = text.strip()
    if t.endswith("?") or t.endswith("?!"):
        st += np.clip((u - 0.7) / 0.3, 0, 1) * 5            # вопрос — подъём в конце
    if "!" in t:
        st += np.exp(-((u - 0.3) / 0.18) ** 2) * 2.5        # восклицание — ударный пик
    elif not t.endswith("?"):
        st -= np.clip((u - 0.8) / 0.2, 0, 1) * 1.5          # повествование — лёгкий спад к точке
    st = np.clip(st, -14, 16)
    call(tier, "Remove points between", 0, dur)
    for ti, s in zip(ts, st):
        call(tier, "Add point", float(ti), float(med * 2 ** (s / 12)))
    call([tier, manip], "Replace pitch tier")
    res = call(manip, "Get resynthesis (overlap-add)")
    call(res, "Scale peak", 0.95)
    res.save(str(out), "WAV")
    return True
