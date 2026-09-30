"""SAM_Toons · серия целиком: episode.json → озвучка → рендер планов в Blender → звук → монтаж → MP4 + субтитры.

  python studio/sam.py episode swamp_ep1                 # вся серия (планы, которые не менялись, берутся из кэша)
  python studio/sam.py episode swamp_ep1 --draft         # черновик 480×270 — быстро посмотреть монтаж и тайминг
  python studio/sam.py episode swamp_ep1 --shots s3,s4   # перерисовать только эти планы (остальные — из кэша)

Формат episode.json — docs/EPISODE_FORMAT.md. Главное: время можно писать относительно реплик плана —
"L2" (начало 2-й реплики), "L2e" (её конец), "L2e+0.3", "end", "end-1.5"; длительность плана — сама.
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from audio import SR, mix_timeline
from common import ROOT, build_dir, ffmpeg, say
from voice import voice_film

WORKERS = int(os.environ.get("SAM_WORKERS", max(1, min(6, (os.cpu_count() or 2) - 1))))   # параллельных Blender на план
TIME_KEYS = {"t", "t0", "t1", "at", "turn_at", "land", "leave", "nod"}
LINE_GAP, LEAD, TAIL = 0.25, 0.45, 0.7


# ---------------------------------------------------------------- время относительно реплик
def resolve_time(v, lines: list[dict], end: float | None = None):
    if isinstance(v, (int, float)) or v is None:
        return v
    m = re.fullmatch(r"\s*(L(\d+)(e?)|end)\s*([+-]\s*[\d.]+)?\s*", str(v))
    if not m:
        raise ValueError(f"не понимаю время «{v}» (примеры: 1.5, L2, L2e+0.3, end-1)")
    if m.group(1) == "end":
        if end is None:
            return v              # «end» раскроется вторым проходом, когда станет известна длительность плана
        base = end
    else:
        i = int(m.group(2)) - 1
        if i >= len(lines):
            raise ValueError(f"в плане нет реплики L{i + 1}")
        base = lines[i]["t0"] + (lines[i]["dur"] if m.group(3) else 0)
    return round(base + (float(m.group(4).replace(" ", "")) if m.group(4) else 0.0), 3)


def walk_times(obj, lines, end=None):
    """Заменить выражения времени во всей структуре плана на секунды."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in TIME_KEYS:
                out[k] = resolve_time(v, lines, end)
            elif k in ("fly", "turn") and isinstance(v, list):
                out[k] = [[resolve_time(p[0], lines, end), *p[1:]] for p in v]
            elif k == "last_stop" and isinstance(v, list):
                out[k] = [v[0], resolve_time(v[1], lines, end), resolve_time(v[2], lines, end)]
            elif k == "until":
                out[k] = resolve_time(v, lines, end)
            else:
                out[k] = walk_times(v, lines, end)
        return out
    if isinstance(obj, list):
        return [walk_times(x, lines, end) for x in obj]
    return obj


def layout_lines(shot: dict, manifest: dict) -> list[dict]:
    """Реплики плана: где начинаются и сколько длятся (по озвучке). По умолчанию идут одна за другой."""
    out, t = [], LEAD
    for i, ln in enumerate(shot.get("lines", [])):
        m = manifest["lines"].get(f"{shot['id']}_{i + 1}", {})
        dur = m.get("dur", 0.3 + len(ln["text"]) / 14)
        t0 = resolve_time(ln["at"], out) if "at" in ln else t
        out.append({**ln, "t0": t0, "dur": dur, "file": m.get("file"), "env": m.get("env", [])})
        t = t0 + dur + ln.get("gap", LINE_GAP)
    return out


def seg_durations(actor: dict):
    """«until» у сегмента → длительность от его начала (сегменты идут подряд)."""
    t = 0.0
    for sg in actor.get("segments", []):
        if "at" in sg:
            t = sg["at"]
        if "until" in sg:
            sg["dur"] = max(0.2, sg.pop("until") - t)
        t += sg.get("dur", 2.0) + sg.get("hold", 0.0)
    return t


# ---------------------------------------------------------------- рамка камеры блогера (REC)
def rec_overlay(frame: Path, t: float, w: int, h: int):
    from PIL import Image, ImageDraw
    from storyboard import _font
    im = Image.open(frame).convert("RGB"); d = ImageDraw.Draw(im)
    m, L, lw = int(w * 0.04), int(w * 0.07), max(2, w // 320)
    ink = (22, 22, 24)
    for (x, y, dx, dy) in ((m, m, 1, 1), (w - m, m, -1, 1), (m, h - m, 1, -1), (w - m, h - m, -1, -1)):
        d.line([(x, y), (x + dx * L, y)], fill=ink, width=lw); d.line([(x, y), (x, y + dy * L)], fill=ink, width=lw)
    f = _font(max(12, h // 22))
    if int(t * 2) % 2 == 0:
        r = h // 45; cx, cy = m + L // 2 + r, m + L // 2 + r
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ink, width=lw, fill=(22, 22, 24))
    d.text((m + L // 2 + h // 14, m + L // 2 - 2), "REC", fill=ink, font=f)
    tc = f"00:{int(t // 60):02d}:{int(t % 60):02d}:{int((t % 1) * 25):02d}"
    d.text((w - m - L // 2 - f.getlength(tc), m + L // 2 - 2), tc, fill=ink, font=f)
    bx, by = w - m - L // 2 - h // 12, h - m - L // 2 - h // 30
    d.rectangle([bx, by, bx + h // 14, by + h // 30], outline=ink, width=lw); d.rectangle([bx + h // 14, by + h // 120, bx + h // 14 + lw * 2, by + h // 40], fill=ink)
    im.save(frame, quality=94)


# ---------------------------------------------------------------- серия
def code_version() -> str:
    h = hashlib.sha1()
    for p in sorted((ROOT / "blender").rglob("*.py")) + [ROOT / "blender/moves.json"]:
        h.update(p.read_bytes())
    return h.hexdigest()[:10]


def run_episode(d: Path, draft: bool = False, only: list[str] | None = None, stills: bool = False) -> Path:
    ep = json.loads((d / "episode.json").read_text(encoding="utf-8"))
    from episode_check import check_episode
    err, warn = check_episode(ep)
    for w in warn:
        say("⚠ " + w)
    if err:
        for e in err:
            say("✗ " + e)
        raise SystemExit(f"episode.json: ошибок {len(err)} — исправьте до рендера")
    fps = ep.get("fps", 25)
    size = [480, 270] if draft else ep.get("size", [960, 540])
    style = {**ep.get("style", {}), **({"twos": True} if draft else {})}
    cast = ep.get("cast", {})
    shots = ep["shots"]
    # 1) озвучка всех реплик серии (одна «сцена» = один план)
    film = {"fps": fps, "style": ep.get("voice_style", {}), "cast": cast,
            "scenes": [{"id": s["id"], "beats": [{"say": {"who": l["who"], "text": l["text"], "mood": l.get("mood")}} for l in s.get("lines", [])]} for s in shots]}
    manifest = voice_film(d, film) if any(s.get("lines") for s in shots) else {"lines": {}}
    ver = code_version()
    tag = "draft" if draft else "final"
    timeline, offset, videos, srt, sheet = [], 0.0, [], [], []
    for s in shots:
        sid = s["id"]
        lines = layout_lines(s, manifest)
        spec = copy.deepcopy({k: v for k, v in s.items() if k not in ("lines", "sfx", "overlay", "id", "note")})
        spec = walk_times(spec, lines)
        # актёры: состав из cast + липсинк их реплик
        for name, a in spec.get("actors", {}).items():
            a.update({k: v for k, v in cast.get(name, {}).items() if k not in ("voice", "name")} | {k: v for k, v in a.items()})
            a["lines"] = [{"t0": l["t0"], "env": l["env"]} for l in lines if l["who"] == name]
        # длительность плана: конец последней реплики, камеры, движений (сегменты «until: end» не в счёт)
        ends = [l["t0"] + l["dur"] + TAIL for l in lines] + [k["t"] for k in spec.get("camera", []) if isinstance(k["t"], (int, float))]
        for a in spec.get("actors", {}).values():
            probe = copy.deepcopy(a)
            probe["segments"] = [g for g in probe.get("segments", []) if not isinstance(g.get("until"), str)]
            ends.append(seg_durations(probe))
        dur = float(s["duration"]) if isinstance(s.get("duration"), (int, float)) else round(max([1.0] + ends), 2)
        spec = walk_times(spec, lines, dur)
        for a in spec.get("actors", {}).values():
            seg_durations(a)
        spec.update({"duration": dur, "fps": fps, "size": size, "samples": ep.get("samples", 1), "style": style})
        spec.setdefault("set", ep.get("set", {}))
        if "card" in s:
            spec["card"] = s["card"]
        if stills:
            if only is None or sid in only:
                sheet.append((s, dur, lines, still_frames(build_dir(d, "shot_stills", sid), spec, fps)))
            offset += dur
            continue
        # 2) рендер плана (кэш по содержимому спецификации и версии кода)
        sdir = build_dir(d, "shots", f"{sid}_{tag}")
        stamp = hashlib.sha1((json.dumps(spec, sort_keys=True) + ver + json.dumps(s.get("overlay"))).encode()).hexdigest()[:12]
        video = sdir / "shot.mp4"
        need = not (video.exists() and (sdir / "stamp").exists() and (sdir / "stamp").read_text() == stamp)
        if only is not None and sid not in only and video.exists():
            need = False
        if need:
            say(f"▶ план {sid}: {dur:.1f} с — рендер…")
            render_shot(sdir, spec, s.get("overlay"), fps)
            (sdir / "stamp").write_text(stamp)
        else:
            say(f"✓ план {sid}: {dur:.1f} с — из кэша")
        videos.append(video)
        # 3) звук этого плана на общей дорожке
        for l in lines:
            if l.get("file"):
                timeline.append({"kind": "voice", "t": offset + l["t0"], "file": l["file"]})
            srt.append((offset + l["t0"], offset + l["t0"] + l["dur"], l["text"]))
        for fx in s.get("sfx", []):
            timeline.append({"kind": "sfx", "t": offset + resolve_time(fx["at"], lines, dur), "name": fx["name"], "vol": fx.get("vol", 1.0)})
        cpath = sdir / "contacts.json"
        if cpath.exists() and s.get("footsteps", ep.get("footsteps", "squelch")):
            for c in json.loads(cpath.read_text()):
                timeline.append({"kind": "sfx", "t": offset + c["t"], "name": s.get("footsteps", ep.get("footsteps", "squelch")), "vol": 0.45})
        if s.get("ambience", True):
            timeline.append({"kind": "amb", "t0": offset, "t1": offset + dur, "name": ep.get("ambience", "swamp")})
        offset += dur
    if stills:
        return contact_sheet(d, sheet)
    # 4) монтаж: планы подряд + общая звуковая дорожка + субтитры
    out = d / "build" / (f"episode_{tag}.mp4")
    lst = d / "build" / "concat.txt"
    lst.write_text("".join(f"file '{v.as_posix()}'\n" for v in videos), encoding="utf-8")
    audio = mix_timeline(d, timeline, offset, ep)
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-i", str(audio),
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out)], check=True)
    (d / "build" / "episode.srt").write_text(to_srt(srt), encoding="utf-8")
    say(f"Готово: {out}  ({offset:.1f} с, планов: {len(shots)})")
    return out


def still_frames(sdir: Path, spec: dict, fps: int) -> list[tuple[float, Path]]:
    """Несколько кадров плана (начало, реплики, конец) — быстро проверить кадр и мизансцену без полного рендера."""
    for f in sdir.glob("*.jpg"):
        f.unlink()
    n = int(round(spec["duration"] * fps))
    picks = sorted({max(1, min(n, int(n * q))) for q in (0.08, 0.35, 0.62, 0.92)})
    (sdir / "spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    blender = shutil.which("blender") or "blender"
    r = subprocess.run([blender, "-b", "--factory-startup", "-P", str(ROOT / "blender/shot.py"), "--", str(sdir / "spec.json"), str(sdir),
                        "--pick", ",".join(map(str, picks))], capture_output=True, text=True)
    if "SHOT_DONE" not in r.stdout:
        say(r.stdout[-3000:] + r.stderr[-3000:]); raise SystemExit(f"Blender не отрендерил кадры {sdir.name}")
    say(f"  кадры {sdir.name}: {picks}")
    return [((f - 1) / fps, sdir / f"f_{f:04d}.jpg") for f in picks]


def contact_sheet(d: Path, sheet: list) -> Path:
    """Лист раскадровки серии: ряд на план — кадры + реплики."""
    from PIL import Image, ImageDraw
    from storyboard import _font
    tw, th = 320, 180; pad = 8; txt_w = 420
    W = pad + 4 * (tw + pad) + txt_w; H = pad + len(sheet) * (th + pad)
    im = Image.new("RGB", (W, H), (255, 255, 255)); dr = ImageDraw.Draw(im)
    f, fb = _font(14), _font(17)
    for r, (s, dur, lines, frames) in enumerate(sheet):
        y = pad + r * (th + pad)
        for c, (t, p) in enumerate(frames):
            if p.exists():
                im.paste(Image.open(p).convert("RGB").resize((tw, th)), (pad + c * (tw + pad), y))
            dr.text((pad + c * (tw + pad) + 4, y + th - 18), f"{t:.1f}s", fill=(200, 0, 0), font=f)
        x = pad + 4 * (tw + pad); dr.text((x, y), f"{s['id']} · {dur:.1f} с · {s.get('note', '')}"[:60], fill=(0, 0, 0), font=fb)
        yy = y + 24
        for l in lines:
            for chunk in [l["text"][i:i + 52] for i in range(0, len(l["text"]), 52)][:2]:
                dr.text((x, yy), (f"{l['t0']:.1f} {l['who']}: " if chunk == l["text"][:52] else "   ") + chunk, fill=(40, 40, 40), font=f); yy += 17
    out = d / "build" / "episode_sheet.jpg"
    im.save(out, quality=88)
    say(f"Раскадровка серии: {out}")
    return out


def render_shot(sdir: Path, spec: dict, overlay, fps: int):
    fdir = sdir / "frames"
    if fdir.exists():
        shutil.rmtree(fdir)
    fdir.mkdir(parents=True)
    (sdir / "spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    blender = shutil.which("blender") or "blender"
    # Freestyle рисует линии на одном ядре — запускаем несколько Blender, каждый берёт свою долю кадров
    W = max(1, min(WORKERS, int(round(spec["duration"] * fps)) // 20))
    procs = []
    for k in range(W):
        cmd = [blender, "-b", "--factory-startup", "-P", str(ROOT / "blender/shot.py"), "--", str(sdir / "spec.json"), str(fdir), "--part", f"{k}/{W}"]
        if k == 0:
            cmd += ["--contacts", str(sdir / "contacts.json")]
        procs.append(subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True))
    for p in procs:
        out, err = p.communicate()
        if "SHOT_DONE" not in out:
            say(out[-3000:] + err[-3000:]); raise SystemExit(f"Blender не отрендерил план {sdir.name}")
    n = int(round(spec["duration"] * fps))
    if spec.get("style", {}).get("twos"):
        for i in range(2, n + 1, 2):
            src = fdir / f"f_{i - 1:04d}.jpg"
            if src.exists():
                shutil.copy(src, fdir / f"f_{i:04d}.jpg")
    if overlay == "rec":
        w, h = spec["size"]
        for i in range(1, n + 1):
            f = fdir / f"f_{i:04d}.jpg"
            if f.exists():
                rec_overlay(f, (i - 1) / fps, w, h)
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-framerate", str(fps), "-i", str(fdir / "f_%04d.jpg"), "-frames:v", str(n),
                    "-vf", "noise=alls=3:allf=u", "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(fps), str(sdir / "shot.mp4")], check=True)


def to_srt(items) -> str:
    def ts(x):
        return f"{int(x // 3600):02d}:{int(x % 3600 // 60):02d}:{int(x % 60):02d},{int((x % 1) * 1000):03d}"
    return "\n".join(f"{i + 1}\n{ts(a)} --> {ts(b)}\n{t}\n" for i, (a, b, t) in enumerate(items))
