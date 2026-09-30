"""SAM_Toons · видео через Veo (Gemini) под руководством агента-шоураннера.

  python studio/sam.py veo swamp_ep1 --plan          # шоураннер выбирает планы и пишет промпты → build/veo/plan.json (видео не тратит)
  python studio/sam.py veo swamp_ep1                 # генерация по плану: кадр-якорь из Blender → Veo → оценка → пересъёмка
  python studio/sam.py veo swamp_ep1 --shots s3a,s4  # только эти планы
  python studio/sam.py episode swamp_ep1 --veo       # монтаж: принятые ролики Veo вместо планов Blender, звук — наш

Как устроено (генераций у Veo мало, поэтому каждая на счету):
1. Раскадровка уже есть: кадры планов из Blender (`episode --stills`). Первый кадр плана — якорь: Veo стартует с него,
   поэтому персонаж, место и стиль совпадают с раскадровкой и между планами.
2. Шоураннер (Gemini) смотрит серию и дневной бюджет секунд, выбирает планы, где Veo даёт больше всего
   (существа, действие, эмоция), и пишет промпт на английском по «библии стиля» из episode.json → veo.
3. Перед каждой генерацией — дешёвая проверка промпта против кадра-якоря (не тратит видео).
4. Дубль → оценщик (Gemini смотрит ролик + якорь + промпт) ставит баллы и, если дубль плох, пишет исправленный промпт.
   Пересъёмка до max_takes или пока не кончится бюджет; берётся лучший дубль, а если все плохи — остаётся Blender.
5. Состояние — build/veo/state.json: при исчерпании лимита работа продолжается со следующего запуска.
Звук всегда наш: реплики Gemini TTS + звуки + фон; звук Veo не используется (реплики в Veo не совпали бы с озвучкой).
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import gemini
from common import build_dir, ffmpeg, say

VEO_LENGTHS = (4, 6, 8)

STYLE_DEFAULT = ("Hand-drawn 2D doodle cartoon. Thin, slightly wobbly black ink lines on a pure white background. "
                 "No color, no gray fills, no shading, no gradients. Minimalist, like a notebook animation, animated on twos. "
                 "Characters are bean-shaped little people with a big perfectly round head, two tiny dot eyes, a small mouth, "
                 "three short hair strands on top. Keep exactly the drawing style, characters and layout of the first frame.")
NEGATIVE_DEFAULT = "color, shading, gray fill, gradient, 3D render, photorealistic, text, subtitles, watermark, logo, extra limbs, morphing faces"


# ---------------------------------------------------------------- подготовка
def _shots_info(d: Path, ep: dict) -> list[dict]:
    """Планы с длительностью, репликами и кадрами-якорями (из episode --stills)."""
    from episode import layout_lines
    man = d / "build/voice/manifest.json"
    manifest = json.loads(man.read_text(encoding="utf-8")) if man.exists() else {"lines": {}}
    out = []
    for s in ep["shots"]:
        if "card" in s:
            continue
        lines = layout_lines(s, manifest)
        dur = s.get("duration") if isinstance(s.get("duration"), (int, float)) else max([3.0] + [l["t0"] + l["dur"] + 0.7 for l in lines])
        spec = d / "build/shot_stills" / s["id"] / "spec.json"
        if spec.exists():
            dur = json.loads(spec.read_text(encoding="utf-8"))["duration"]
        stills = sorted((d / "build/shot_stills" / s["id"]).glob("f_*.jpg"))
        out.append({"id": s["id"], "note": s.get("note", ""), "dur": round(dur, 2), "lines": [f"{l['who']}: {l['text']}" for l in lines],
                    "creatures": [c["type"] for c in s.get("creatures", [])], "anchor": str(stills[0]) if stills else None,
                    "stills": [str(p) for p in stills]})
    return out


def _lengths(dur: float) -> list[int]:
    """Разбить план на куски, которые умеет Veo (4/6/8 с)."""
    parts, left = [], dur
    while left > 0.3:
        n = next((L for L in VEO_LENGTHS if L >= left), VEO_LENGTHS[-1]); parts.append(n); left -= n
    return parts


def priority(sh: dict) -> float:
    """Где Veo даёт больше всего: существа и действие важнее говорящей головы."""
    return 3 * len(sh["creatures"]) + (2 if any(w in sh["note"].lower() for w in ("проносится", "стадо", "скачет", "садится", "превра", "надува", "выходит")) else 0) + 0.1 * len(sh["lines"])


# ---------------------------------------------------------------- 1. шоураннер: что снимать в Veo и как
SHOWRUNNER_SYS = """You are the showrunner of a comedic hand-drawn cartoon series. Veo video generations are scarce (a daily budget in seconds),
so you decide which shots are worth generating with Veo and write precise Veo prompts. The rest stays as the existing 3D line render.
Priorities: shots with creatures, big physical action, transformations and visual gags first; static talking shots last.
Each Veo clip starts from the given first frame (our storyboard still), so describe MOTION and ACTING over the clip, camera move,
timing beats (0-2s, 2-5s…), and keep the style bible. Characters must not speak on camera (voices are added later): lips closed or tiny mouth moves.
No text on screen. English prompts, 60–120 words each. Answer JSON only."""


def make_plan(d: Path, only: list[str] | None = None) -> dict:
    ep = json.loads((d / "episode.json").read_text(encoding="utf-8"))
    veo = ep.get("veo", {})
    shots = [s for s in _shots_info(d, ep) if not only or s["id"] in only]
    if any(s["anchor"] is None for s in shots):
        from episode import run_episode
        say("Нет кадров-якорей — рисую раскадровку (episode --stills)…")
        run_episode(d, draft=True, only=[s["id"] for s in shots if s["anchor"] is None], stills=True)
        shots = [s for s in _shots_info(d, ep) if not only or s["id"] in only]
    budget = gemini.video_seconds_left()
    ranked = sorted(shots, key=priority, reverse=True)
    user = {"style_bible": veo.get("style", STYLE_DEFAULT), "characters": veo.get("characters", {}),
            "budget_seconds_today": budget, "clip_lengths": list(VEO_LENGTHS),
            "shots": [{k: s[k] for k in ("id", "note", "dur", "lines", "creatures")} | {"segments_needed": _lengths(s["dur"])} for s in ranked],
            "script": (d / "script.md").read_text(encoding="utf-8")[:6000] if (d / "script.md").exists() else ""}
    schema_hint = '{"shots":[{"id":"s3a","use_veo":true,"why":"…","segments":[{"seconds":8,"prompt":"…"}]}],"note":"…"}'
    try:
        plan = gemini.ask(json.dumps(user, ensure_ascii=False) + "\n\nReturn JSON like " + schema_hint, system=SHOWRUNNER_SYS,
                          model=gemini.cfg()["models"].get("director"), temperature=0.6)
    except gemini.GeminiError as e:
        raise SystemExit(f"Шоураннер (Gemini) недоступен: {e}")
    # страховка: сегменты — только допустимой длины, план не длиннее самого плана
    info = {s["id"]: s for s in shots}
    for p in plan.get("shots", []):
        if p["id"] not in info:
            continue
        need = _lengths(info[p["id"]]["dur"])
        segs = p.get("segments") or []
        p["segments"] = [{"seconds": need[i], "prompt": (segs[i] if i < len(segs) else segs[-1])["prompt"]} for i in range(len(need))] if segs else []
    plan["shots"] = [p for p in plan.get("shots", []) if p["id"] in info]
    out = build_dir(d, "veo") / "plan.json"
    out.write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    use = [p for p in plan["shots"] if p.get("use_veo")]
    total = sum(sg["seconds"] for p in use for sg in p["segments"])
    say(f"План Veo: {len(use)} планов, {total} с видео (сегодня доступно {budget:.0f} с) → {out}")
    for p in plan["shots"]:
        say(f"  {'▶' if p.get('use_veo') else '·'} {p['id']}: {p.get('why', '')}")
    return plan


# ---------------------------------------------------------------- 2. оценщик
JUDGE_SYS = """You are a strict animation supervisor. You compare a generated video clip with the storyboard first frame and the prompt.
Score 0–10: style (thin black line on white, no color/shading), character (same design as the first frame, no morphing),
action (does what the prompt and the shot note ask, readable staging), artifacts (10 = none: no melting, flicker, extra limbs, text),
overall. If overall < 7, write fix_prompt: an improved full Veo prompt that addresses the problems. Answer JSON only:
{"style":0,"character":0,"action":0,"artifacts":0,"overall":0,"problems":["…"],"fix_prompt":"…"}"""


def preflight(prompt: str, anchor: Path, note: str, style: str) -> str:
    """Дешёвая проверка промпта по кадру-якорю до генерации (видео не тратится)."""
    q = (f"Storyboard first frame attached. Shot note: {note}\nStyle bible: {style}\nDraft Veo prompt:\n{prompt}\n\n"
         "Check that the prompt matches what is visible in the frame (characters, their positions, setting) and the style. "
         'Return JSON {"ok": true/false, "prompt": "corrected full prompt"}.')
    try:
        r = gemini.ask(q, media=[anchor], temperature=0.2)
        return r.get("prompt") or prompt
    except gemini.GeminiError as e:
        say(f"  (проверка промпта пропущена: {e})"); return prompt


def judge(clip: Path, anchor: Path, prompt: str, note: str, lines: list[str]) -> dict:
    q = f"Shot note: {note}\nDialogue (added later as voice-over): {lines}\nPrompt used:\n{prompt}\nFirst file: storyboard first frame. Second file: generated clip."
    r = gemini.ask(q, media=[anchor, clip], system=JUDGE_SYS, temperature=0.2)
    r["overall"] = float(r.get("overall", 0))
    return r


# ---------------------------------------------------------------- 3. съёмка
def _last_frame(clip: Path, out: Path) -> Path:
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-sseof", "-0.1", "-i", str(clip), "-frames:v", "1", "-q:v", "2", str(out)], check=True)
    return out


def shoot(d: Path, only: list[str] | None = None, fast: bool = False) -> dict:
    ep = json.loads((d / "episode.json").read_text(encoding="utf-8"))
    veo = ep.get("veo", {}); style = veo.get("style", STYLE_DEFAULT); negative = veo.get("negative", NEGATIVE_DEFAULT)
    c = gemini.cfg(); max_takes = int(c.get("max_takes", 3)); accept = float(c.get("accept_score", 7))
    model = c["models"]["video_fast" if fast else "video"]
    pdir = build_dir(d, "veo"); ppath = pdir / "plan.json"
    plan = json.loads(ppath.read_text(encoding="utf-8")) if ppath.exists() else make_plan(d, only)
    spath = pdir / "state.json"
    state = json.loads(spath.read_text(encoding="utf-8")) if spath.exists() else {}
    info = {s["id"]: s for s in _shots_info(d, ep)}
    todo = [p for p in plan["shots"] if p.get("use_veo") and (not only or p["id"] in only)]
    for p in todo:
        sid = p["id"]; st = state.setdefault(sid, {"segments": {}})
        if st.get("done"):
            say(f"✓ {sid}: уже снят"); continue
        sh = info[sid]; sdir = build_dir(d, "veo", sid)
        anchor = Path(sh["anchor"])
        for k, seg in enumerate(p["segments"]):
            ss = st["segments"].setdefault(str(k), {"takes": []})
            if ss.get("best"):
                anchor = _last_frame(Path(ss["best"]), sdir / f"seg{k}_last.jpg"); continue
            prompt = ss.get("next_prompt") or preflight(f"{style}\n\n{seg['prompt']}", anchor, sh["note"], style)
            while len(ss["takes"]) < max_takes:
                if gemini.video_seconds_left() < seg["seconds"]:
                    spath.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
                    say(f"⏸ Дневной лимит Veo исчерпан — остановились на {sid} (сегмент {k + 1}). Запустите ту же команду завтра.")
                    return state
                n = len(ss["takes"]) + 1; clip = sdir / f"seg{k}_take{n}.mp4"
                say(f"▶ {sid} сегмент {k + 1}/{len(p['segments'])}, дубль {n}: Veo {seg['seconds']} с…")
                try:
                    gemini.veo(prompt, clip, first_frame=anchor, seconds=seg["seconds"], negative=negative, model=model)
                except gemini.GeminiError as e:
                    say(f"  Veo: {e}")
                    if "лимит" in str(e):
                        spath.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8"); return state
                    ss["takes"].append({"file": None, "prompt": prompt, "error": str(e)}); continue
                sc = judge(clip, anchor, prompt, sh["note"], sh["lines"])
                ss["takes"].append({"file": str(clip), "prompt": prompt, "score": sc})
                say(f"  оценка {sc['overall']:.1f}/10 · стиль {sc.get('style')} · персонаж {sc.get('character')} · действие {sc.get('action')}"
                    + (f" · проблемы: {'; '.join(sc.get('problems', [])[:3])}" if sc.get("problems") else ""))
                spath.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
                if sc["overall"] >= accept:
                    break
                prompt = sc.get("fix_prompt") or prompt; ss["next_prompt"] = prompt
            good = [t for t in ss["takes"] if t.get("file")]
            best = max(good, key=lambda t: t["score"]["overall"]) if good else None
            if not best or best["score"]["overall"] < c.get("min_score", 5):
                say(f"✗ {sid}: хорошего дубля нет — план остаётся из Blender"); st["fallback"] = True; break
            ss["best"] = best["file"]
            anchor = _last_frame(Path(best["file"]), sdir / f"seg{k}_last.jpg")      # следующий сегмент продолжает с последнего кадра
        if not st.get("fallback") and all(st["segments"].get(str(k), {}).get("best") for k in range(len(p["segments"]))):
            st["done"] = True; st["clip"] = str(_join(sdir, [Path(st["segments"][str(k)]["best"]) for k in range(len(p["segments"]))], sh["dur"]))
            say(f"✓ {sid}: принят → {st['clip']}")
        spath.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    left = gemini.video_seconds_left()
    say(f"Veo: готово планов {sum(1 for v in state.values() if v.get('done'))}; на сегодня осталось {left:.0f} с видео")
    return state


def _join(sdir: Path, clips: list[Path], dur: float) -> Path:
    """Склеить сегменты плана и подогнать под длительность плана (лишнее срезать, не хватает — стоп-кадр)."""
    lst = sdir / "join.txt"; lst.write_text("".join(f"file '{p.as_posix()}'\n" for p in clips), encoding="utf-8")
    out = sdir / "accepted.mp4"
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-an",
                    "-vf", f"tpad=stop_mode=clone:stop_duration={dur},trim=duration={dur},setpts=PTS-STARTPTS",
                    "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(out)], check=True)
    return out


def accepted_clip(d: Path, sid: str) -> Path | None:
    sp = d / "build/veo/state.json"
    if not sp.exists():
        return None
    st = json.loads(sp.read_text(encoding="utf-8")).get(sid, {})
    p = Path(st["clip"]) if st.get("done") and st.get("clip") else None
    return p if p and p.exists() else None


def conform(src: Path, dst: Path, dur: float, w: int, h: int, fps: int) -> Path:
    """Ролик Veo → размер и частота серии, точная длительность плана, без звука."""
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", str(src), "-an",
                    "-vf", f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:white,fps={fps},"
                           f"tpad=stop_mode=clone:stop_duration={dur},trim=duration={dur},setpts=PTS-STARTPTS",
                    "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", str(dst)], check=True)
    return dst
