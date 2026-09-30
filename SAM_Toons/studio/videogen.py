"""SAM_Toons · одна точка входа для нейро-видео: кто генерирует и кто оценивает.

studio/videogen.json:
  "backend": "comfyui" — локально и бесплатно (ComfyUI + MiniMax H3 или другая модель, studio/comfy.py)
             "veo"     — Google Veo через Gemini API (платно, studio/gemini.py)
  "brain":   "ollama"  — шоураннер и оценщик на локальных моделях (studio/agents.json), бесплатно
             "gemini"  — они же на Gemini (нужен GEMINI_API_KEY)
Оценщик Ollama не принимает видео, поэтому ему даётся лист из 6 кадров дубля.
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

from common import ROOT, ffmpeg

CFG = ROOT / "studio/videogen.json"
LOCAL = ROOT / "studio/videogen.local.json"


def cfg() -> dict:
    c = json.loads(CFG.read_text(encoding="utf-8")) if CFG.exists() else {}
    if LOCAL.exists():
        c.update(json.loads(LOCAL.read_text(encoding="utf-8")))
    return c


def errors() -> tuple:
    import comfy
    import gemini
    return (gemini.GeminiError, comfy.ComfyError, SystemExit, ValueError)


def seconds_left() -> float:
    if cfg().get("backend") == "veo":
        import gemini
        return gemini.video_seconds_left()
    return float("inf")          # своё железо: ограничено только временем


def video(prompt: str, out: Path, first_frame: Path | None, seconds: int, negative: str, fast: bool = False) -> Path:
    c = cfg()
    if c.get("backend") == "veo":
        import gemini
        return gemini.veo(prompt, out, first_frame=first_frame, seconds=seconds, negative=negative,
                          model=gemini.cfg()["models"]["video_fast" if fast else "video"])
    import comfy
    return comfy.generate(c.get("comfyui", {}), prompt, out, first_frame, seconds, negative)


def _strip(clip: Path) -> Path:
    """Лист из 6 кадров ролика — чтобы локальная vision-модель «посмотрела» видео."""
    from PIL import Image
    tmp = Path(tempfile.mkdtemp())
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", str(clip), "-vf", "fps=1.2,scale=426:-2", "-frames:v", "6",
                    str(tmp / "k_%02d.jpg")], check=True)
    ims = [Image.open(p) for p in sorted(tmp.glob("k_*.jpg"))]
    if not ims:
        raise ValueError(f"не удалось прочитать кадры из {clip}")
    w, h = ims[0].size
    sheet = Image.new("RGB", (w * 3, h * ((len(ims) + 2) // 3)), "white")
    for i, im in enumerate(ims):
        sheet.paste(im, ((i % 3) * w, (i // 3) * h))
    p = tmp / "strip.jpg"; sheet.save(p, quality=90)
    return p


def ask(prompt: str, media: list[Path] | None = None, system: str | None = None, temperature: float = 0.4, role: str = "critic") -> dict:
    """Вопрос «мозгу» (шоураннер/оценщик), ответ — JSON."""
    if cfg().get("brain") == "gemini":
        import gemini
        return gemini.ask(prompt, media=media, system=system, temperature=temperature,
                          model=gemini.cfg()["models"].get("director") if role == "director" else None)
    import agents
    imgs = [(_strip(m) if m.suffix.lower() in (".mp4", ".mov", ".webm") else m) for m in (media or [])]
    note = "\n(Видео передано листом кадров: слева направо, сверху вниз.)" if any(m.suffix.lower() == ".mp4" for m in media or []) else ""
    return agents.chat_json(role, system or "Answer JSON only.", prompt + note, {"type": "object"}, images=imgs or None, temperature=temperature)
