"""SAM_Toons · раскадровка: по кадру на каждый бит + лист раскадровки (HTML и PNG).

Кадр снимается в момент, когда действие бита уже произошло (75% длительности бита).
HTML-лист — для чтения и правок человеком, PNG-лист — чтобы его «смотрела» vision-модель критика.
"""
from __future__ import annotations

import base64
import html
import json
from pathlib import Path

from common import build_dir, engine_page, say


def _describe(b: dict) -> str:
    parts = []
    for a in b.get("do") or []:
        who = a.get("who") or a.get("prop") or ("камера" if "camera" in a else "звук" if "sfx" in a else "")
        what = ", ".join(f"{k}={json.dumps(v, ensure_ascii=False)}" for k, v in a.items() if k not in ("who", "prop"))
        parts.append(f"{who}: {what}")
    return "; ".join(parts)


def stills(film_path: Path, name: str, width: int = 960, height: int = 540, at: float = 0.75) -> dict:
    out = build_dir(film_path, "stills")
    for old in out.glob("*.png"):
        old.unlink()
    with engine_page(name, width, height) as page:
        info = page.evaluate("SAM.api.info()")
        for b in info["beats"]:
            t = b["t0"] + (b["t1"] - b["t0"]) * at
            url = page.evaluate(f"(SAM.api.draw({t}), document.getElementById('cv').toDataURL('image/png'))")
            (out / f"{b['id']}.png").write_bytes(base64.b64decode(url.split(",", 1)[1]))
        if page.errors:  # type: ignore[attr-defined]
            say("Ошибки движка:\n" + "\n".join(page.errors))  # type: ignore[attr-defined]
    _sheet_html(film_path, info)
    _sheet_png(film_path, info)
    say(f"Раскадровка: {len(info['beats'])} кадров → {film_path / 'build/storyboard.html'}")
    for w in info["warnings"]:
        say("⚠ " + w)
    return info


def _sheet_html(film_path: Path, info: dict) -> None:
    cards = []
    for b in info["beats"]:
        say_ = b.get("say")
        line = f"<p class=say><b>{html.escape(say_['who'])}:</b> {html.escape(say_['text'])}</p>" if say_ else ""
        acts = _describe(b)
        cards.append(f"""<figure><img src="stills/{b['id']}.png" alt="{b['id']}"><figcaption>
<div class=id>{b['id']} · {b['t0']:.1f}–{b['t1']:.1f} с · {b['t1'] - b['t0']:.1f} с</div>{line}
{f'<p class=acts>{html.escape(acts)}</p>' if acts else ''}</figcaption></figure>""")
    title = html.escape(info.get("title") or film_path.name)
    doc = f"""<!doctype html><html lang=ru><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>{title} · раскадровка</title><style>
:root{{--ink:#161616;--muted:#666;--line:#ddd;--bg:#f4f4f2;--card:#fff}}
@media (prefers-color-scheme:dark){{:root{{--ink:#eee;--muted:#aaa;--line:#333;--bg:#161616;--card:#222}}}}
body{{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}}
h1{{font-size:20px;margin:0 0 12px}} .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}}
figure{{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}}
img{{width:100%;display:block;background:#fff}} figcaption{{padding:8px 10px}} .id{{color:var(--muted);font-size:12px}}
.say{{margin:4px 0}} .acts{{margin:4px 0;color:var(--muted);font-size:12px;word-break:break-word}}
</style></head><body><h1>{title} — раскадровка · {info['duration']:.1f} с</h1><div class=grid>{''.join(cards)}</div></body></html>"""
    (film_path / "build/storyboard.html").write_text(doc, encoding="utf-8")


def _font(size: int):
    from PIL import ImageFont
    for f in ("DejaVuSans.ttf", "arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _sheet_png(film_path: Path, info: dict, cols: int = 4, tw: int = 480) -> None:
    from PIL import Image, ImageDraw
    beats = info["beats"]
    th, cap = tw * 9 // 16, 44
    rows = (len(beats) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (tw + 10) + 10, rows * (th + cap + 10) + 10), "#e9e9e6")
    d, f = ImageDraw.Draw(sheet), _font(15)
    for i, b in enumerate(beats):
        x, y = 10 + (i % cols) * (tw + 10), 10 + (i // cols) * (th + cap + 10)
        im = Image.open(film_path / "build/stills" / f"{b['id']}.png").convert("RGB").resize((tw, th))
        sheet.paste(im, (x, y))
        d.rectangle([x, y + th, x + tw, y + th + cap], fill="white")
        text = b["id"] + (f"  {b['say']['who']}: {b['say']['text']}" if b.get("say") else "  (действие)")
        d.text((x + 6, y + th + 4), text[:62], fill="black", font=f)
        if len(text) > 62:
            d.text((x + 6, y + th + 22), text[62:124], fill="black", font=f)
    sheet.save(film_path / "build/storyboard.png")
