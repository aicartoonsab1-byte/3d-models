"""SAM_Toons · общие вещи студии: пути, ffmpeg, локальный веб-сервер и браузер с движком."""
from __future__ import annotations

import contextlib
import functools
import http.server
import json
import os
import shutil
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILMS = ROOT / "films"
MODELS = ROOT / "models"


def film_dir(name: str) -> Path:
    d = Path(name)
    if not d.is_absolute() and not (d / "film.json").exists():
        d = FILMS / name
    if not (d / "film.json").exists():
        sys.exit(f"Нет фильма: {d / 'film.json'}")
    return d


def load_film(d: Path) -> dict:
    return json.loads((d / "film.json").read_text(encoding="utf-8"))


def build_dir(d: Path, *sub: str) -> Path:
    p = d.joinpath("build", *sub)
    p.mkdir(parents=True, exist_ok=True)
    return p


@functools.cache
def ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit("Нужен ffmpeg: pip install imageio-ffmpeg (или поставить ffmpeg в систему)")


def say(msg: str) -> None:
    print(msg, flush=True)


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):  # noqa: D401
        pass


@contextlib.contextmanager
def serve(root: Path = ROOT, port: int = 0):
    """Раздаёт папку проекта по http (плееру нужен fetch для film.json)."""
    handler = functools.partial(_Quiet, directory=str(root))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", port), handler) as srv:
        th = threading.Thread(target=srv.serve_forever, daemon=True)
        th.start()
        try:
            yield f"http://127.0.0.1:{srv.server_address[1]}"
        finally:
            srv.shutdown()


@contextlib.contextmanager
def engine_page(film: str, width: int = 1920, height: int = 1080):
    """Открывает плеер в безголовом Chromium и возвращает страницу с готовым SAM.api."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Нужен Playwright: pip install playwright && playwright install chromium")
    with serve() as url, sync_playwright() as pw:
        args = {}
        exe = os.environ.get("SAM_CHROMIUM")
        if exe:
            args["executable_path"] = exe
        try:
            browser = pw.chromium.launch(**args)
        except Exception:
            # облачная сессия: браузер Playwright уже лежит здесь
            pw_dir = Path(os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers"))
            found = sorted(pw_dir.glob("chromium-*/chrome-linux/chrome"))
            if exe or not found:
                raise
            fallback = found[-1]
            browser = pw.chromium.launch(executable_path=str(fallback))
        page = browser.new_page(viewport={"width": width, "height": height})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{url}/engine/player.html?film={film}&mode=render&w={width}&h={height}")
        try:
            page.wait_for_function("window.SAM_READY === true", timeout=20000)
        except Exception:
            sys.exit("Движок не запустился:\n" + "\n".join(errors))
        page.errors = errors  # type: ignore[attr-defined]
        try:
            yield page
        finally:
            browser.close()
