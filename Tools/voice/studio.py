#!/usr/bin/env python3
"""Голосовая студия «Шарика»: озвучка реплик голосами, которые описывает пользователь.

Как это работает. Пользователь словами описывает голос («старый ворчливый дед с эхом», «писклявый робот»),
агент переводит описание в ПРОФИЛЬ: движок, диктор, высота, темп, эффекты. Профили лежат в Tools/voice/profiles.json.
Кто каким голосом говорит, задаёт «каст»: campaign.json → "voices": {"hero": "<профиль>", "narrator": "<профиль>"}
(для основной игры — Tools/voice/cast.json). Студия заранее озвучивает все написанные реплики кампании
в пакет Web/voice/<кампания>.js. Игра проигрывает запись, а если записи нет (живые мысли Claude) —
говорит прежним голосом браузера.

Движки (ставятся в систему; в облачной сессии: apt-get install rhvoice rhvoice-russian espeak-ng sox ffmpeg):
  rhvoice — 13 русских дикторов: aleksandr anna arina artemiy elena evgeniy-rus irina mikhail pavel tatiana victoria vitaliy yuriy
  espeak  — роботический синтез; варианты: ru, ru+m1..m7, ru+f1..f5, ru+croak, ru+whisper, ru+klatt …
Эффекты (sox): robot, chipmunk, giant, telephone, radio, reverb, cave, hall, whisper, old, drunk.

Команды:
  python3 Tools/voice/studio.py voices                            # движки, дикторы, эффекты, профили
  python3 Tools/voice/studio.py sample <профиль> "текст" [-o f.mp3] [--mood happy]
  python3 Tools/voice/studio.py catalog [-o Design/voice/catalog.mp3]   # все дикторы подряд — чтобы выбрать на слух
  python3 Tools/voice/studio.py analyze ref.mp3 [--save имя]      # референс: высота, интонация, полоса → ближайший диктор и профиль
  python3 Tools/voice/studio.py render <кампания|all> [--force]    # озвучить реплики → Web/voice/<id>.js
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "Assets/_Project/Resources"
PROFILES = Path(__file__).with_name("profiles.json")
CAST_MAIN = Path(__file__).with_name("cast.json")
OUT = ROOT / "Web/voice"
CACHE = ROOT / "Tools/voice/.cache"

RHV = ["aleksandr", "anna", "arina", "artemiy", "elena", "evgeniy-rus", "irina", "mikhail", "pavel",
       "tatiana", "victoria", "vitaliy", "yuriy"]
FX = {   # эффекты sox
    "robot": ["overdrive", "6", "flanger", "0", "2", "0", "71", "0.5", "sine", "25", "lin", "echo", "0.8", "0.7", "12", "0.4"],
    "chipmunk": ["pitch", "700"],
    "giant": ["pitch", "-600", "reverb", "30"],
    "telephone": ["highpass", "400", "lowpass", "3200", "overdrive", "4"],
    "radio": ["highpass", "300", "lowpass", "3000", "overdrive", "10", "tremolo", "60", "15"],
    "reverb": ["reverb", "35"],
    "cave": ["reverb", "80", "50", "100", "100", "20", "4"],
    "hall": ["reverb", "60", "40", "80"],
    "whisper": ["highpass", "900", "tremolo", "180", "25"],
    "old": ["highpass", "250", "lowpass", "3500", "tremolo", "4", "10", "overdrive", "3"],
    "drunk": ["bend", ".1,-150,.5", "tremolo", "3", "30"],
}
MOOD = {   # настроение → (полутоны, темп)
    "happy": (1.5, 1.06), "scared": (2.5, 1.14), "angry": (-1, 1.1), "sad": (-1.5, 0.9), "pray": (0.5, 0.9),
    "awe": (1.0, 0.95), "dizzy": (0.5, 0.93), "suspicious": (-0.5, 0.95), "determined": (-0.5, 1.02), "glitch": (-4, 0.92),
}


class Silent(Exception):
    """В тексте нечего произносить («...», «01001»)."""


def need(tool: str):
    if not shutil.which(tool):
        sys.exit(f"Нет «{tool}». Установите: apt-get install rhvoice rhvoice-russian espeak-ng sox ffmpeg")


def profiles() -> dict:
    return json.loads(PROFILES.read_text(encoding="utf-8"))


def synth(prof: dict, text: str, out_mp3: Path, mood: str | None = None):
    """Текст → mp3 по профилю."""
    need("sox"); need("ffmpeg")
    with tempfile.TemporaryDirectory() as td:
        raw, fx = Path(td) / "raw.wav", Path(td) / "fx.wav"
        eng = prof.get("engine", "rhvoice")
        if eng == "rhvoice":
            need("RHVoice-test")
            subprocess.run(["RHVoice-test", "-p", prof.get("speaker", "aleksandr"), "-o", str(raw)],
                           input=text.encode("utf-8"), check=True, capture_output=True)
        elif eng == "espeak":
            need("espeak-ng")
            subprocess.run(["espeak-ng", "-v", prof.get("speaker", "ru"), "-s", str(int(165 * prof.get("tempo", 1.0))),
                            "-w", str(raw), text], check=True, capture_output=True)
        else:
            sys.exit(f"Неизвестный движок {eng}")
        if not raw.exists() or raw.stat().st_size < 2000:
            raise Silent(text)
        semi, tempo = prof.get("pitch", 0.0), prof.get("tempo", 1.0) if eng != "espeak" else 1.0
        if mood and prof.get("moods", True):
            ms, mt = MOOD.get(mood, (0, 1))
            semi += ms * prof.get("moodScale", 1.0); tempo *= 1 + (mt - 1) * prof.get("moodScale", 1.0)
        chain = []
        if abs(semi) > 0.05: chain += ["pitch", str(int(semi * 100))]
        if abs(tempo - 1) > 0.01: chain += ["tempo", "-s", f"{tempo:.3f}"]
        for f in prof.get("fx", []):
            chain += FX.get(f, [])
        chain += ["norm", "-1"]
        subprocess.run(["sox", str(raw), "-r", "22050", "-c", "1", str(fx)] + chain, check=True, capture_output=True)
        out_mp3.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(fx), "-ac", "1", "-ar", "22050", "-b:a", "40k", str(out_mp3)], check=True)


# ---------------------------------------------------------------- какие реплики озвучивать
def campaign_data(cid: str):
    if cid == "sharik":
        c = {"id": "sharik", "hero": {"name": "Шарик"}, "phrases": json.loads((RES / "Brain/phrases_ru.json").read_text(encoding="utf-8"))["entries"]}
        levels = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((RES / "Levels").glob("*.json"))]
        c["voices"] = json.loads(CAST_MAIN.read_text(encoding="utf-8")) if CAST_MAIN.exists() else {}
        return c, levels
    cj = RES / f"Campaigns/{cid}/campaign.json"
    c = json.loads(cj.read_text(encoding="utf-8"))
    levels = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((cj.parent / "levels").glob("*.json"))]
    return c, levels


def lines_of(cid: str):
    """[(роль, текст, настроение)] — всё, что написано заранее."""
    c, levels = campaign_data(cid)
    hero = (c.get("hero") or {}).get("name", "Шарик")
    fill = lambda t: t.replace("{hero}", hero)
    out = []
    for p in c.get("phrases", []):
        out += [("hero", t, p.get("mood")) for t in p.get("lines", [])]
    for lv in levels:
        out += [("hero", t, "neutral") for t in lv.get("intro", [])]
        out += [("hero", t, "happy") for t in lv.get("outro", [])]
        for l in lv.get("lines", []):
            if isinstance(l, dict) and l.get("text"): out.append(("hero", l["text"], l.get("mood")))
        out += [("hero", t, "awe") for t in lv.get("fragments", [])]
        if lv.get("narration"): out.append(("narrator", fill(lv["narration"]), None))
        if lv.get("chapter"): out.append(("narrator", fill(lv["chapter"]), None))
        elif cid != "sharik" and lv.get("storyBeat"): out.append(("narrator", fill(lv["storyBeat"]), None))
        pong = lv.get("pong") or {}
        for pool in (pong.get("lines") or {}).values(): out += [("hero", t, None) for t in pool]
        out += [("hero", t, "happy") for t in pong.get("outroWin", [])] + [("hero", t, "sad") for t in pong.get("outroLose", [])]
    for pool in (c.get("narrator") or {}).values():
        out += [("narrator", fill(t), None) for t in pool]
    if cid == "sharik":   # общие реплики рассказчика из narrator.js
        import re
        js = (ROOT / "Tools/web/narrator.js").read_text(encoding="utf-8")
        block = js[js.index("const NARR_LINES"):js.index("const NARR = {")]
        out += [("narrator", fill(t), None) for t in re.findall(r'"([^"]{8,})"', block)]
    seen, uniq = set(), []
    for r, t, m in out:
        if t and (r, t) not in seen: seen.add((r, t)); uniq.append((r, t, m))
    return c, uniq


def render(cid: str, force=False):
    c, lines = lines_of(cid)
    cast, profs = c.get("voices") or {}, profiles()
    if not cast: print(f"· {cid}: нет каста (campaign.json → \"voices\") — пропускаю"); return
    pack = {"id": cid, "cast": cast, "clips": {}}
    total = 0
    for role, text, mood in lines:
        pname = cast.get(role)
        if not pname or pname not in profs: continue
        prof = profs[pname]
        key = hashlib.sha1(json.dumps([prof, text, mood], ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
        mp3 = CACHE / cid / f"{key}.mp3"
        if force or not mp3.exists():
            try:
                synth(prof, text, mp3, mood)
            except (Silent, subprocess.CalledProcessError):
                print(f"  · пропускаю (нечего произносить): {text[:40]}"); continue
        data = mp3.read_bytes(); total += len(data)
        pack["clips"][role + "|" + text] = "data:audio/mpeg;base64," + base64.b64encode(data).decode()
    OUT.mkdir(parents=True, exist_ok=True)
    # .js, а не .json: так пакет грузится тегом <script> и из файла на диске, и из опубликованной страницы
    out = OUT / f"{cid}.js"
    out.write_text("window.SHARIK_VOICE=window.SHARIK_VOICE||{};SHARIK_VOICE[" + json.dumps(cid) + "]=" +
                   json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    old = OUT / f"{cid}.json"
    if old.exists(): old.unlink()
    print(f"→ {out.relative_to(ROOT)}  реплик: {len(pack['clips'])}, {total // 1024} КБ звука, "
          f"герой: {cast.get('hero')}, рассказчик: {cast.get('narrator')}")


# ---------------------------------------------------------------- разбор референса: подобрать похожий голос (не клонирование)
def _load_mono(path: Path):
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype("float32") / 32768.0, 16000


def voice_stats(path: Path) -> dict:
    """Средняя высота голоса (Гц), разброс интонации (полутоны), доля голосовых кадров, «яркость» и полоса частот."""
    import numpy as np
    x, sr = _load_mono(path)
    fr, hop = 640, 320
    f0s, voiced, cents = [], 0, []
    for i in range(0, len(x) - fr, hop):
        w = x[i:i + fr] * np.hanning(fr)
        if np.sqrt((w ** 2).mean()) < 0.01: continue
        ac = np.correlate(w, w, "full")[fr - 1:]
        lo, hi = sr // 400, sr // 60
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.35 * ac[0]:
            f0s.append(sr / k); voiced += 1
        spec = np.abs(np.fft.rfft(w)); fq = np.fft.rfftfreq(fr, 1 / sr)
        cents.append((spec * fq).sum() / (spec.sum() + 1e-9))
    f0 = np.array(f0s) if f0s else np.array([0.0])
    spec = np.abs(np.fft.rfft(x[: sr * 20])); fq = np.fft.rfftfreq(len(x[: sr * 20]), 1 / sr)
    cum = np.cumsum(spec) / (spec.sum() + 1e-9)
    # темп: слоговые пики огибающей речевой полосы (300–3000 Гц), на секунду речи
    X = np.fft.rfft(x); fqx = np.fft.rfftfreq(len(x), 1 / sr); X[(fqx < 300) | (fqx > 3000)] = 0
    band = np.fft.irfft(X, len(x))
    env = np.sqrt(np.convolve(band ** 2, np.ones(160) / 160, "same"))[::160]          # 10 мс
    env = np.convolve(env, np.ones(5) / 5, "same")
    thr = np.percentile(env, 60); speech = env > np.percentile(env, 35)
    peaks, last = 0, -99
    for i in range(1, len(env) - 1):
        if env[i] > thr and env[i] >= env[i - 1] and env[i] > env[i + 1] and i - last >= 10:
            peaks += 1; last = i
    rate = peaks / max(1.0, speech.sum() / 100)
    return {"rate": float(rate), "f0": float(np.median(f0)), "f0_spread_semi": float(12 * np.log2((np.percentile(f0, 90) + 1) / (np.percentile(f0, 10) + 1))),
            "voiced": voiced, "brightness": float(np.median(cents)) if cents else 0.0,
            "band_low": float(fq[np.searchsorted(cum, 0.02)]), "band_high": float(fq[np.searchsorted(cum, 0.98)]), "seconds": len(x) / sr}


def analyze(ref: Path):
    """Сравнить референс с дикторами и предложить профиль."""
    import math
    r = voice_stats(ref)
    print(f"референс: темп ~{r['rate']:.1f} слог/с, высота ~{r['f0']:.0f} Гц, интонация ±{r['f0_spread_semi']:.1f} пт, яркость {r['brightness']:.0f} Гц, "
          f"полоса {r['band_low']:.0f}–{r['band_high']:.0f} Гц, {r['seconds']:.1f} с")
    best = []
    with tempfile.TemporaryDirectory() as td:
        for sp in RHV:
            m = Path(td) / f"{sp}.mp3"
            synth({"engine": "rhvoice", "speaker": sp}, "Здравствуйте. Я расскажу вам одну историю про маленький круглый шарик.", m)
            st = voice_stats(m)
            semi = 12 * math.log2(max(r["f0"], 50) / max(st["f0"], 50))
            score = abs(semi) + 0.004 * abs(r["brightness"] - st["brightness"])
            best.append((score, sp, semi, st))
    best.sort()
    print("ближайшие дикторы:")
    for score, sp, semi, st in best[:4]:
        print(f"  {sp:12} свой {st['f0']:.0f} Гц → сдвиг {semi:+.1f} пт (оценка {score:.2f})")
    _, sp, semi, st0 = best[0]
    tempo = round(max(0.75, min(1.3, r["rate"] / max(0.5, st0["rate"]))), 2)
    print(f"темп диктора {sp}: {st0['rate']:.1f} слог/с → tempo {tempo}")
    fx = []
    if r["band_high"] < 4200: fx.append("telephone")
    prof = {"engine": "rhvoice", "speaker": sp, "pitch": round(max(-8, min(8, semi)), 1), "tempo": tempo, "fx": fx,
            "moodScale": round(min(1.5, max(0.3, r["f0_spread_semi"] / 8)), 2), "desc": f"подобран по референсу {ref.name}"}
    print("предлагаемый профиль:", json.dumps(prof, ensure_ascii=False))
    return prof


def main(argv):
    ap = argparse.ArgumentParser(description="Голосовая студия «Шарика»")
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("voices")
    s = sub.add_parser("sample"); s.add_argument("profile"); s.add_argument("text"); s.add_argument("-o", default=None); s.add_argument("--mood", default=None)
    k = sub.add_parser("catalog"); k.add_argument("-o", default=str(ROOT / "Design/voice/catalog.mp3"))
    r = sub.add_parser("render"); r.add_argument("campaign"); r.add_argument("--force", action="store_true")
    z = sub.add_parser("analyze"); z.add_argument("ref"); z.add_argument("--save", default=None, help="сохранить как профиль с этим именем")
    a = ap.parse_args(argv)
    if a.cmd == "voices":
        print("rhvoice:", " ".join(RHV)); print("espeak: ru, ru+m1..m7, ru+f1..f5, ru+croak, ru+whisper")
        print("эффекты:", " ".join(FX)); print("профили:")
        for n, p in profiles().items(): print(f"  {n:16} {p.get('engine')}/{p.get('speaker')} pitch {p.get('pitch', 0)} tempo {p.get('tempo', 1)} fx {p.get('fx', [])} — {p.get('desc', '')}")
    elif a.cmd == "sample":
        prof = profiles()[a.profile]
        out = Path(a.o or ROOT / f"Design/voice/sample_{a.profile}.mp3")
        synth(prof, a.text, out, a.mood); print(f"→ {out}")
    elif a.cmd == "catalog":
        need("sox")
        with tempfile.TemporaryDirectory() as td:
            parts = []
            for i, sp in enumerate(RHV + ["espeak:ru+m3", "espeak:ru+croak"]):
                eng, spk = ("espeak", sp.split(":")[1]) if sp.startswith("espeak:") else ("rhvoice", sp)
                p = Path(td) / f"{i:02d}.mp3"
                synth({"engine": eng, "speaker": spk}, f"Голос номер {i + 1}, {spk.replace('+', ' ')}. Мама говорит, что я круглый.", p)
                wav = Path(td) / f"{i:02d}.wav"; subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(p), "-ar", "22050", "-ac", "1", str(wav)], check=True)
                parts.append(str(wav))
            sil = Path(td) / "sil.wav"; subprocess.run(["sox", "-n", "-r", "22050", "-c", "1", str(sil), "trim", "0", "0.6"], check=True)
            seq = []
            for pth in parts: seq += [pth, str(sil)]
            allw = Path(td) / "all.wav"; subprocess.run(["sox"] + seq + [str(allw)], check=True)
            Path(a.o).parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(allw), "-b:a", "48k", a.o], check=True)
        print(f"→ {a.o}")
    elif a.cmd == "analyze":
        prof = analyze(Path(a.ref))
        if a.save:
            allp = profiles(); allp[a.save] = prof
            PROFILES.write_text(json.dumps(allp, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"); print(f"сохранён профиль «{a.save}»")
    elif a.cmd == "render":
        ids = ["sharik"] + sorted(p.parent.name for p in (RES / "Campaigns").glob("*/campaign.json")) if a.campaign == "all" else [a.campaign]
        for cid in ids: render(cid, a.force)
    else:
        ap.print_help()


if __name__ == "__main__":
    main(sys.argv[1:])
