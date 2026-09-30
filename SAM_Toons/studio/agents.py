"""SAM_Toons · агенты на локальных моделях (Ollama): сценарист → режиссёр → критик.

  python studio/sam.py write    <серия> --idea "тема и короткий сюжет"   # → script.md (читаете и правите руками)
  python studio/sam.py direct   <серия>                                # script.md → episode.json, сцена за сценой, с проверкой
  python studio/sam.py critique <серия> [--rounds 2]                   # кадры плана → оценка по чек-листу → правки episode.json

Модели и адрес Ollama — studio/agents.json (или agents.local.json рядом, он не в git). Всё локально, без внешних сервисов.
Принцип: агенты пишут данные (script.md, episode.json), рисует всегда движок. Валидатор (episode_check.py) ловит ошибки,
и агент исправляет их сам — до MAX_FIX попыток на сцену.
"""
from __future__ import annotations

import base64
import copy
import json
import re
import urllib.request
from pathlib import Path

from common import ROOT, say

CFG_FILES = (ROOT / "studio/agents.local.json", ROOT / "studio/agents.json")
MAX_FIX = 3

# ---------------------------------------------------------------- доступ к модели
def cfg() -> dict:
    for p in CFG_FILES:
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    return {}


def chat(role: str, system: str, user: str, schema: dict | None = None, images: list[Path] | None = None, temperature: float = 0.7) -> str:
    """Один запрос к Ollama (/api/chat). schema — JSON-схема ответа (Ollama «structured outputs»)."""
    c = cfg(); model = c.get("models", {}).get(role) or c.get("models", {}).get("default", "qwen3:8b")
    if c.get("mock"):
        return MOCK(role, system, user, schema)
    msg = {"role": "user", "content": user}
    if images:
        msg["images"] = [base64.b64encode(p.read_bytes()).decode() for p in images]
    body = {"model": model, "stream": False, "messages": [{"role": "system", "content": system}, msg],
            "options": {"temperature": temperature, "num_ctx": c.get("num_ctx", 16384)}}
    if schema:
        body["format"] = schema
    if c.get("think") is False:
        body["think"] = False
    req = urllib.request.Request(c.get("url", "http://127.0.0.1:11434") + "/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=c.get("timeout", 900)) as r:
            out = json.loads(r.read())["message"]["content"]
    except OSError as e:
        raise SystemExit(f"Нет связи с Ollama ({e}). Запустите Ollama и скачайте модель: ollama pull {model}")
    return re.sub(r"<think>.*?</think>", "", out, flags=re.S).strip()


def chat_json(role, system, user, schema, **kw) -> dict:
    txt = chat(role, system, user, schema, **kw)
    m = re.search(r"\{.*\}", txt, re.S)
    try:
        return json.loads(m.group(0) if m else txt)
    except json.JSONDecodeError as e:
        raise ValueError(f"модель вернула не JSON: {e}: {txt[:300]}")


MOCK = lambda *a: (_ for _ in ()).throw(SystemExit("mock-режим задаётся только в тестах"))  # noqa: E731


# ---------------------------------------------------------------- 1. сценарист
WRITER_SYS = """Ты — сценарист коротких смешных мультфильмов для YouTube (горизонтальные ролики до 5 минут).
Стиль: чёрная линия на белом, персонажи-«фасолины», рассказчик за кадром с сухой иронией.
Правила хорошего сценария:
- ХОЛОДНОЕ ОТКРЫТИЕ: первые 5–8 секунд — самый странный момент серии (крючок), потом титр «… НАЗАД».
- Ясный конфликт к 30-й секунде. У героя есть черта характера, которая его подводит.
- Каждая сцена заканчивается панчлайном. Есть сквозной гэг, который повторяется и в финале переворачивается.
- Реплики короткие, разговорные, до 140 символов, у каждого персонажа свой голос. Никаких пересказов того, что видно.
- Смешное — из точных деталей и контраста (невозмутимость против абсурда), паузы пишутся в ремарках.
- Финал хочется пересмотреть; последняя фраза рассказчика — подколка.
Пиши по-русски, в формате Markdown как в примере."""


def write_script(d: Path, idea: str) -> Path:
    example = (ROOT / "films/swamp_ep1/script.md").read_text(encoding="utf-8")
    user = f"Тема и короткий сюжет от автора:\n{idea}\n\nПример формата и уровня (другая серия, не копируй шутки):\n\n{example}\n\nНапиши новый сценарий."
    say("Сценарист пишет…")
    txt = chat("writer", WRITER_SYS, user, temperature=0.9)
    d.mkdir(parents=True, exist_ok=True)
    out = d / "script.md"
    if out.exists():
        out.rename(d / "script.prev.md")
    out.write_text(txt.strip() + "\n", encoding="utf-8")
    say(f"Сценарий: {out}\nПрочитайте и поправьте, потом: python studio/sam.py direct {d.name}")
    return out


# ---------------------------------------------------------------- 2. режиссёр
def split_scenes(md: str) -> list[tuple[str, str]]:
    """script.md → [(заголовок, текст)] по заголовкам «## …» (раздел «Звук» и шапка — общий контекст)."""
    parts = re.split(r"^## +", md, flags=re.M)
    out = []
    for p in parts[1:]:
        title, _, body = p.partition("\n")
        if re.match(r"(?i)звук|музыка|примечани", title.strip()):
            continue
        out.append((title.strip(), body.strip()))
    return out


SHOT_SCHEMA = {"type": "object", "required": ["shots"], "properties": {"shots": {"type": "array", "items": {"type": "object", "required": ["id"]}}}}


def director_sys() -> str:
    from episode_check import vocab
    V = vocab()
    fmt = (ROOT / "docs/EPISODE_FORMAT.md").read_text(encoding="utf-8")
    return f"""Ты — режиссёр-постановщик 3D-мультфильма «под рисунок» (Blender). Переводишь сцену сценария в планы (shots) episode.json.
Отвечай ТОЛЬКО JSON вида {{"shots": [ … ]}}. Каждый план — объект формата ниже.
Режиссура:
- смена плана каждые 3–10 с; общий план → средний → крупный; реакция героя — отдельным планом;
- реплики — дословно из сценария, каждая в плане, где её говорят; время действий привязывай к репликам (L1e+0.3);
- паузы из ремарок — это время между репликами (at: "L1e+1.5");
- звук на каждое событие (шаг в грязь, щелчок, удар); камера почти всегда медленно едет (2+ ключа);
- актёр стоит в пределах x −2…2, y −0.5…1; камера на y −2.5 (крупно) … −9 (общий), высота 1.1–2.
Словарь движка (другого нет!):
- движения: {', '.join(V['moves'])}
- существа: {', '.join(V['creatures'])}
- звуки: {', '.join(V['sfx'])}

Формат:
{fmt}"""


def direct(d: Path) -> Path:
    from episode_check import check_episode
    md = (d / "script.md").read_text(encoding="utf-8")
    scenes = split_scenes(md)
    if not scenes:
        raise SystemExit("В script.md нет сцен (заголовков «## …»)")
    epath = d / "episode.json"
    base = json.loads(epath.read_text(encoding="utf-8")) if epath.exists() else {}
    ep = {k: v for k, v in base.items() if k != "shots"} or {
        "title": md.splitlines()[0].lstrip("# ").strip(), "script": "script.md", "fps": 25, "size": [960, 540], "samples": 1,
        "style": {"look": "mult", "line": 1.75, "wobble": 0.6, "twos": True}, "ambience": "swamp", "footsteps": "squelch",
        "cast": _cast_from_script(md), "set": json.loads((ROOT / "films/swamp_ep1/episode.json").read_text(encoding="utf-8"))["set"]}
    ep["shots"] = []
    system = director_sys()
    example = json.dumps(json.loads((ROOT / "films/swamp_ep1/episode.json").read_text(encoding="utf-8"))["shots"][4], ensure_ascii=False)
    for i, (title, body) in enumerate(scenes):
        say(f"Режиссёр: сцена {i + 1}/{len(scenes)} — {title}")
        user = (f"Персонажи (cast): {json.dumps(ep['cast'], ensure_ascii=False)}\nУже есть планы: {[s['id'] for s in ep['shots']]}\n"
                f"Пример одного плана: {example}\n\nСЦЕНА «{title}»:\n{body}\n\nСделай планы этой сцены. id — латиницей, уникальные (sc{i + 1}a, sc{i + 1}b…).")
        shots = None
        for attempt in range(MAX_FIX + 1):
            try:
                got = chat_json("director", system, user, SHOT_SCHEMA, temperature=0.4)["shots"]
            except (ValueError, KeyError) as e:
                user += f"\n\nОшибка: {e}. Ответь строго JSON {{\"shots\": [...]}}."; continue
            err, _ = check_episode({**ep, "shots": ep["shots"] + got})
            err = [e for e in err if any(e.startswith(s.get("id", "?")) for s in got)]
            if not err:
                shots = got; break
            say(f"  проверка нашла {len(err)} ошибок — исправляет (попытка {attempt + 1})")
            user += f"\n\nТвой ответ:\n{json.dumps({'shots': got}, ensure_ascii=False)}\n\nОшибки валидатора — исправь и верни ВСЕ планы сцены заново:\n" + "\n".join(err[:25])
        if shots is None:
            raise SystemExit(f"Режиссёр не справился со сценой «{title}» за {MAX_FIX + 1} попыток — поправьте сцену или модель")
        ep["shots"] += shots
    if epath.exists():
        epath.rename(d / "episode.prev.json")
    epath.write_text(json.dumps(ep, ensure_ascii=False, indent=1), encoding="utf-8")
    say(f"episode.json: {len(ep['shots'])} планов. Проверка кадров: python studio/sam.py episode {d.name} --stills")
    return epath


def _cast_from_script(md: str) -> dict:
    names = set(re.findall(r"\*\*([А-ЯЁA-Z]{2,})\*\*", md))
    cast = {}
    for n in sorted(names):
        key = "narrator" if n.startswith("РАССКАЗ") else _translit(n)
        cast[key] = {"voice": "narrator"} if key == "narrator" else {"voice": "man_young", "hold": "camera", "hair": "tuft", "name": n.title()}
    return cast


def _translit(s: str) -> str:
    t = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя", ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))
    return "".join(t.get(ch, ch) for ch in s.lower())


# ---------------------------------------------------------------- 3. критик
CHECKLIST = """Чек-лист (оценка 1–5 по каждому пункту):
1. hook — первые 5 секунд цепляют (странное, смешное, вопрос).
2. clarity — в каждом кадре понятно, кто главный и куда смотреть; персонаж целиком или осмысленно обрезан.
3. staging — существа/предметы, о которых говорят, видны в кадре в нужный момент.
4. pacing — нет планов длиннее 10 с без события; паузы перед панчлайнами есть.
5. punchlines — каждая сцена заканчивается шуткой; реплики короткие и смешные.
6. consistency — персонажи и места одинаковые от плана к плану; направление взгляда и движения не прыгает.
7. style — чистая чёрная линия на белом, без каши из линий, крупные простые формы."""

CRITIC_SCHEMA = {"type": "object", "required": ["scores", "issues", "patches"], "properties": {
    "scores": {"type": "object"}, "issues": {"type": "array", "items": {"type": "string"}},
    "patches": {"type": "array", "items": {"type": "object", "required": ["shot", "path", "value"],
                                           "properties": {"shot": {"type": "string"}, "path": {"type": "string"}, "value": {}}}}}}


def critique(d: Path, rounds: int = 2) -> dict:
    """Критик смотрит лист ключевых кадров + episode.json, ставит оценки и предлагает правки (патчи). Правки проходят проверку."""
    from episode import run_episode
    from episode_check import check_episode
    epath = d / "episode.json"
    report = {"rounds": []}
    for r in range(rounds):
        sheet = run_episode(d, draft=True, stills=True)
        ep = json.loads(epath.read_text(encoding="utf-8"))
        system = f"Ты — строгий критик и шоураннер мультсериала. Смотришь лист раскадровки (ряд = план, 4 кадра, справа реплики) и episode.json.\n{CHECKLIST}\nПравки давай патчами к episode.json: shot — id плана, path — путь внутри плана через «/» (например camera/0/pos, actors/boris/segments/1/move, lines/0/text), value — новое значение. Только то, что реально улучшит серию; не больше 12 патчей."
        user = f"episode.json:\n{json.dumps(ep, ensure_ascii=False)}\n\nСценарий:\n{(d / 'script.md').read_text(encoding='utf-8') if (d / 'script.md').exists() else ''}"
        say(f"Критик: круг {r + 1}/{rounds}…")
        res = chat_json("critic", system, user, CRITIC_SCHEMA, images=[sheet], temperature=0.3)
        applied, rejected = apply_patches(ep, res.get("patches", []))
        err, _ = check_episode(ep)
        if err:
            say(f"  правки критика ломают серию ({len(err)} ошибок) — не применяю: " + "; ".join(err[:3]))
            applied = []
        else:
            epath.write_text(json.dumps(ep, ensure_ascii=False, indent=1), encoding="utf-8")
        report["rounds"].append({"scores": res.get("scores"), "issues": res.get("issues"), "applied": applied, "rejected": rejected})
        say(f"  оценки: {res.get('scores')}\n  замечания: " + "\n   - ".join([""] + res.get("issues", [])) + f"\n  правок применено: {len(applied)}")
        if not applied:
            break
    (d / "build").mkdir(exist_ok=True)
    (d / "build/critique.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return report


def apply_patches(ep: dict, patches: list[dict]) -> tuple[list, list]:
    shots = {s["id"]: s for s in ep["shots"]}
    ok, bad = [], []
    for p in patches:
        s = shots.get(p.get("shot"))
        keys = [k for k in str(p.get("path", "")).split("/") if k]
        if not s or not keys:
            bad.append({**p, "why": "нет такого плана или пути"}); continue
        before = copy.deepcopy(s)
        try:
            cur = s
            for k in keys[:-1]:
                cur = cur[int(k)] if isinstance(cur, list) else cur.setdefault(k, {})
            last = keys[-1]
            if isinstance(cur, list):
                cur[int(last)] = p["value"]
            else:
                cur[last] = p["value"]
            ok.append(p)
        except (KeyError, IndexError, ValueError, TypeError) as e:
            s.clear(); s.update(before); bad.append({**p, "why": str(e)})
    return ok, bad
