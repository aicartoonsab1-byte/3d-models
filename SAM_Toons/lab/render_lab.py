"""SAM_Toons · лаборатория стилей: HTML-страница рисует кадр по времени t (window.LAB.frame(t) → dataURL JPEG),
этот скрипт собирает кадры в MP4.

  python lab/render_lab.py lab/style_flat.html --sec 8 --out build/lab/flat.mp4 [--w 1280 --h 720 --fps 25]
"""
from __future__ import annotations

import argparse
import base64
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "studio"))
from common import ffmpeg  # noqa: E402


def launch(pw):
    import os
    try:
        return pw.chromium.launch()
    except Exception:
        found = sorted(Path(os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")).glob("chromium-*/chrome-linux/chrome"))
        if not found:
            raise
        return pw.chromium.launch(executable_path=str(found[-1]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html"); ap.add_argument("--sec", type=float, default=8); ap.add_argument("--out", required=True)
    ap.add_argument("--w", type=int, default=1280); ap.add_argument("--h", type=int, default=720); ap.add_argument("--fps", type=int, default=25)
    ap.add_argument("--still", type=float, help="только один кадр в этот момент → .jpg")
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    out = Path(a.out); out.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        b = launch(pw); page = b.new_page(viewport={"width": a.w, "height": a.h})
        errs = []; page.on("pageerror", lambda e: errs.append(str(e))); page.on("console", lambda m: m.type == "error" and errs.append(m.text))
        page.goto(Path(a.html).resolve().as_uri() + f"?w={a.w}&h={a.h}")
        try:
            page.wait_for_function("window.LAB && window.LAB.ready === true", timeout=20000)
        except Exception:
            sys.exit("Страница не запустилась:\n" + "\n".join(errs))
        if a.still is not None:
            out.write_bytes(base64.b64decode(page.evaluate(f"LAB.frame({a.still})").split(",", 1)[1])); b.close()
            print(out); return
        n = int(round(a.sec * a.fps))
        p = subprocess.Popen([ffmpeg(), "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(a.fps), "-c:v", "mjpeg", "-i", "-",
                              "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)], stdin=subprocess.PIPE)
        for i in range(n):
            p.stdin.write(base64.b64decode(page.evaluate(f"LAB.frame({i / a.fps})").split(",", 1)[1]))
        p.stdin.close(); p.wait(); b.close()
    if errs:
        print("Ошибки страницы:\n" + "\n".join(errs[:10]))
    print(out)


if __name__ == "__main__":
    main()
