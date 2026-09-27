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
    # кампании: основная «Шарик» + все Resources/Campaigns/<id>/campaign.json с их уровнями
    campaigns = [{"id": "sharik", "title": "Шарик", "source": "", "hero": {"name": "Шарик"},
                  "logline": "Светящийся шарик катится сам, думает вслух и расплющивается в лепёшку. Вы — глаз в небе.",
                  "persona": persona, "levels": levels}]
    for cj in sorted((RES / "Campaigns").glob("*/campaign.json")):
        try:
            c = json.loads(cj.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"! {cj.relative_to(ROOT)} не читается: {e}"); continue
        lv = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((cj.parent / "levels").glob("*.json"))]
        if not lv:
            print(f"! кампания {c.get('id')} без уровней — пропускаю"); continue
        c["levels"] = lv
        c["persona"] = (c.get("hero") or {}).get("persona", persona)
        campaigns.append(c)
    data = json.dumps({"sprites": sprites, "levels": levels, "phrases": phrases, "persona": persona, "campaigns": campaigns},
                      ensure_ascii=False, separators=(",", ":"))
    html = (ROOT / "Tools/web/template.html").read_text(encoding="utf-8")
    for k, v in sprites.items():
        html = html.replace("{{" + k + "}}", v)
    html = html.replace("{{DATA}}", data.replace("</", "<\\/"))
    game = (ROOT / "Tools/web/game.js").read_text(encoding="utf-8")
    mind = (ROOT / "Tools/web/mind.js").read_text(encoding="utf-8")
    marker = "  // @@MIND@@"
    assert marker in game, "в game.js нет маркера @@MIND@@"
    mind += "\n" + (ROOT / "Tools/web/narrator.js").read_text(encoding="utf-8")
    game = game.replace(marker, mind + "\n" + marker, 1)
    night = (ROOT / "Tools/web/limbo.js").read_text(encoding="utf-8")
    night += "\n" + (ROOT / "Tools/web/mult.js").read_text(encoding="utf-8")
    night += "\n" + (ROOT / "Tools/web/pong.js").read_text(encoding="utf-8")
    assert "  // @@NIGHT@@" in game, "в game.js нет маркера @@NIGHT@@"
    game = game.replace("  // @@NIGHT@@", night + "\n  // @@NIGHT@@", 1)
    html = html.replace("{{GAME}}", game)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"→ {OUT.relative_to(ROOT)}  ({OUT.stat().st_size // 1024} КБ, кампаний: {len(campaigns)}, "
          f"уровней: {sum(len(c['levels']) for c in campaigns)}, спрайтов: {len(sprites)})")


if __name__ == "__main__":
    main()
