"""SAM_Toons · финальный рендер: движок рисует кадры в безголовом Chromium → ffmpeg → MP4 со звуком."""
from __future__ import annotations

import base64
import math
import subprocess
import time
from pathlib import Path

from audio import mix
from common import engine_page, ffmpeg, say


def render(d: Path, name: str, film: dict, width: int = 1920, height: int = 1080, out: Path | None = None, batch: int = 6) -> Path:
    out = out or d / "build" / ("film.mp4" if width >= 1920 else f"film_{height}p.mp4")
    with engine_page(name, width, height) as page:
        info = page.evaluate("SAM.api.info()")
        fps = int(info["fps"])
        audio = mix(d, film, info)
        frames = math.ceil(info["duration"] * fps)
        say(f"Рендер «{info.get('title')}»: {info['duration']:.1f} с, {frames} кадров {width}×{height} @ {fps}")
        cmd = [ffmpeg(), "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(fps), "-c:v", "png", "-i", "-",
               "-i", str(audio), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
               "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out)]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        t0, step = time.time(), max(1, frames // 10)
        for i in range(0, frames, batch):
            n = min(batch, frames - i)
            for url in page.evaluate(f"SAM.api.frames({i}, {n}, {fps})"):
                proc.stdin.write(base64.b64decode(url.split(",", 1)[1]))
            if (i // batch) % max(1, step // batch) == 0:
                el = time.time() - t0
                say(f"  {i + n}/{frames} кадров · {el:.0f} с" + (f" · осталось ~{el / (i + n) * (frames - i - n):.0f} с" if i else ""))
        proc.stdin.close(); proc.wait()
        if page.errors:  # type: ignore[attr-defined]
            say("Ошибки движка:\n" + "\n".join(page.errors[:10]))  # type: ignore[attr-defined]
    if proc.returncode:
        raise SystemExit("ffmpeg завершился с ошибкой")
    say(f"Готово: {out}  ({time.time() - t0:.0f} с)")
    return out
