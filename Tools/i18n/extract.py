#!/usr/bin/env python3
"""Собрать все русские тексты игры для перевода.

    python3 Tools/i18n/extract.py      → Design/i18n/src_<часть>.json (списки строк)
Части: core (интерфейс и код: game.js, mind.js, narrator.js, pong.js, template.html), sharik, gump, nosferatu.
Переводы лежат в Assets/_Project/Resources/Locale/<язык>/<часть>.json как {"русский текст": "перевод"}.
Плейсхолдеры {hero} {name} {what} {n} {level} и HTML-теги сохраняются как есть.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "Assets/_Project/Resources"
CYR = re.compile(r"[А-Яа-яЁё]")
sys.path.insert(0, str(ROOT / "Tools/voice"))


def walk(o, out):
    if isinstance(o, str):
        if CYR.search(o): out.append(o)
    elif isinstance(o, list):
        for x in o: walk(x, out)
    elif isinstance(o, dict):
        for k, v in o.items():
            if k in ("grid", "shape", "id", "voices", "palette", "boss", "base", "key", "mood"): continue
            walk(v, out)


def js_strings(path):
    src = path.read_text(encoding="utf-8")
    src = re.sub(r"//[^\n]*", "", src)          # без комментариев
    out = []
    for m in re.finditer(r'"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`', src):
        s = m.group(1) if m.group(1) is not None else m.group(2)
        if s and CYR.search(s):
            if m.group(2) is not None:              # шаблон: ${...} → {0}, {1}…
                i = [0]
                def sub(_):
                    i[0] += 1; return "{" + str(i[0] - 1) + "}"
                s = re.sub(r"\$\{[^}]*\}", sub, s)
            out.append(s)
    return out


def html_texts(path):
    src = path.read_text(encoding="utf-8")
    src = re.sub(r"<style>.*?</style>|<script>.*?</script>", "", src, flags=re.S)
    out = [t.strip() for t in re.findall(r">([^<>]+)<", src) if CYR.search(t)]
    out += re.findall(r'(?:aria-label|title|placeholder)="([^"]*[А-Яа-яЁё][^"]*)"', src)
    return out


def main():
    dst = ROOT / "Design/i18n"; dst.mkdir(parents=True, exist_ok=True)
    parts = {}
    core = []
    for f in ["game.js", "mind.js", "narrator.js", "pong.js", "mult.js", "limbo.js"]:
        core += js_strings(ROOT / "Tools/web" / f)
    core += html_texts(ROOT / "Tools/web/template.html")
    parts["core"] = core
    # основная игра
    sh = []
    walk(json.loads((RES / "Brain/phrases_ru.json").read_text(encoding="utf-8")), sh)
    sh.append((RES / "Brain/persona_ru.txt").read_text(encoding="utf-8"))
    for p in sorted((RES / "Levels").glob("*.json")): walk(json.loads(p.read_text(encoding="utf-8")), sh)
    parts["sharik"] = sh
    for cj in sorted((RES / "Campaigns").glob("*/campaign.json")):
        out = []
        walk(json.loads(cj.read_text(encoding="utf-8")), out)
        for p in sorted((cj.parent / "levels").glob("*.json")): walk(json.loads(p.read_text(encoding="utf-8")), out)
        parts[cj.parent.name] = out
    for name, lst in parts.items():
        seen, uniq = set(), []
        for s in lst:
            if len(s) > 600: continue                  # характеры для нейросети не переводим: ей говорим «отвечай по-английски»
            if name == "core" and (len(s.strip()) < 2 or s.startswith("<") or s in ("аоуыэяёюие",)): continue
            if s not in seen: seen.add(s); uniq.append(s)
        have = {}
        loc = RES / f"Locale/en/{name}.json"
        if loc.exists(): have = json.loads(loc.read_text(encoding="utf-8"))
        todo = [s for s in uniq if s not in have]
        (dst / f"src_{name}.json").write_text(json.dumps(uniq, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{name:10} строк: {len(uniq):4}  без перевода: {len(todo)}")


if __name__ == "__main__":
    main()
