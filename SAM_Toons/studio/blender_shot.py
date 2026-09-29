"""SAM_Toons · сцена в Blender: озвучка реплик → рендер кадров в Blender → сведение звука → MP4.

  python studio/sam.py shot <папка с shot.json> [--frames 1-50]
Кадры: build/frames/, видео: build/shot.mp4 (с зерном и виньеткой, как у рисованной печати)."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from audio import mix
from common import ROOT, build_dir, ffmpeg, say
from voice import voice_film


def run_shot(d: Path, frames: str | None = None) -> Path:
    shot = json.loads((d / "shot.json").read_text(encoding="utf-8"))
    fps = shot.get("fps", 25)
    # 1) озвучка: реплики сцены как «мини-фильм» для голосовой студии
    for i, ln in enumerate(shot.get("lines", [])):
        ln.setdefault("id", f"b_{i + 1}")
    film = {"fps": fps, "style": shot.get("style", {}), "cast": shot.get("cast", {}),
            "scenes": [{"id": "b", "beats": [{"say": {"who": l["who"], "text": l["text"], "mood": l.get("mood")}} for l in shot.get("lines", [])]}]}
    manifest = voice_film(d, film) if shot.get("lines") else {"lines": {}}
    mpath = d / "build/voice/manifest.json"
    for ln, (lid, m) in zip(shot.get("lines", []), manifest["lines"].items()):
        if ln.get("t") is not None and ln["t"] + m["dur"] > shot["duration"]:
            say(f"⚠ реплика «{ln['text'][:30]}…» не влезает в сцену ({ln['t'] + m['dur']:.1f} с > {shot['duration']} с)")
    # 2) рендер в Blender
    fdir = build_dir(d, "frames")
    if not frames:
        for f in fdir.glob("*.jpg"):
            f.unlink()
    blender = shutil.which("blender") or "blender"
    cmd = [blender, "-b", "--factory-startup", "-P", str(ROOT / "blender/shot.py"), "--", str(d / "shot.json"), str(mpath) if mpath.exists() else "-", str(fdir)]
    if frames:
        cmd += ["--frames", frames]
    say("Blender: рендер кадров…")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if "SHOT_DONE" not in r.stdout:
        say(r.stdout[-3000:] + r.stderr[-3000:]); raise SystemExit("Blender не отрендерил сцену")
    if frames:
        say(f"Кадры {frames} → {fdir}"); return fdir
    # «через кадр»: отрендерены нечётные кадры — чётные повторяют предыдущий
    if shot.get("style", {}).get("twos"):
        n = int(shot["duration"] * fps)
        for i in range(2, n + 1, 2):
            src, dst = fdir / f"f_{i - 1:04d}.jpg", fdir / f"f_{i:04d}.jpg"
            if src.exists():
                shutil.copy(src, dst)
    # 3) звук: реплики в свои моменты + звуки
    info = {"duration": shot["duration"], "sfx": shot.get("sfx", []),
            "lines": [{"t0": ln["t"], "file": m["file"]} for ln, m in zip(shot.get("lines", []), manifest["lines"].values())]}
    audio = mix(d, film, info)
    # 4) видео: кадры + звук, зерно печати и виньетка
    out = d / "build/shot.mp4"
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-framerate", str(fps), "-i", str(fdir / "f_%04d.jpg"), "-i", str(audio),
                    "-vf", "noise=alls=4:allf=u" if shot.get("style", {}).get("look") == "mult" else "noise=alls=9:allf=u,vignette=PI/4.2", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out)], check=True)
    say(f"Готово: {out}")
    return out
