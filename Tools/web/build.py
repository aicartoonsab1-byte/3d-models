#!/usr/bin/env python3
"""Собирает браузерный прототип «Шарика» в один HTML: Web/sharik.html.

Берёт те же уровни, спрайты и фразы, что и Unity-версия, встраивает их (спрайты — data URI).
    python3 Tools/web/build.py
"""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "Assets/_Project/Resources"
OUT = ROOT / "Web/sharik.html"


def main():
    sprites = {p.stem: "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
               for p in sorted((RES / "Sprites").glob("*.png"))}
    levels = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((RES / "Levels").glob("*.json"))]
    phrases = json.loads((RES / "Brain/phrases_ru.json").read_text(encoding="utf-8"))["entries"]
    persona = (RES / "Brain/persona_ru.txt").read_text(encoding="utf-8")
    data = json.dumps({"sprites": sprites, "levels": levels, "phrases": phrases, "persona": persona},
                      ensure_ascii=False, separators=(",", ":"))
    html = (ROOT / "Tools/web/template.html").read_text(encoding="utf-8")
    for k, v in sprites.items():
        html = html.replace("{{" + k + "}}", v)
    html = html.replace("{{DATA}}", data.replace("</", "<\\/"))
    game = (ROOT / "Tools/web/game.js").read_text(encoding="utf-8")
    mind = (ROOT / "Tools/web/mind.js").read_text(encoding="utf-8")
    marker = "  // @@MIND@@"
    assert marker in game, "в game.js нет маркера @@MIND@@"
    game = game.replace(marker, mind + "\n" + marker, 1)
    night = (ROOT / "Tools/web/night.js").read_text(encoding="utf-8")
    assert "  // @@NIGHT@@" in game, "в game.js нет маркера @@NIGHT@@"
    game = game.replace("  // @@NIGHT@@", night + "\n  // @@NIGHT@@", 1)
    html = html.replace("{{GAME}}", game)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"→ {OUT.relative_to(ROOT)}  ({OUT.stat().st_size // 1024} КБ, уровней: {len(levels)}, спрайтов: {len(sprites)})")


if __name__ == "__main__":
    main()
