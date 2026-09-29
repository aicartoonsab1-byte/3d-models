"""SAM_Toons · озвучка реплик локальными TTS-движками + данные для движения губ.

Движки (все офлайн и бесплатные), берётся первый установленный из пресета голоса:
  cosyvoice — Fun-CosyVoice3-0.5B: клон голоса по образцу voices/<имя>.wav (+ .txt с текстом образца),
            эмоции через инструкцию; работает в своём окружении (см. docs/COSYVOICE.md)
  piper   — нейросетевые голоса, лучший вариант для Windows/Linux (pip install piper-tts, модели в models/piper/)
  rhvoice — 13 русских дикторов (Linux: apt install rhvoice rhvoice-russian)
  espeak  — роботизированный запасной вариант (espeak-ng)
Результат: build/voice/lines/*.wav и build/voice/manifest.json — длительность каждой реплики и
«громкость рта» по кадрам (env), по ней движок открывает рот персонажа.
"""
from __future__ import annotations

import functools
import hashlib
import json
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

from common import MODELS, ROOT, build_dir, ffmpeg, say

PRESETS = json.loads((ROOT / "studio/voices.json").read_text(encoding="utf-8"))
VOICES = ROOT / "voices"                          # образцы голосов для клонирования
ENGINES_CFG = ROOT / "studio/engines.local.json"   # пути к окружению CosyVoice на этом ПК (не в git)
# «живая» манера по умолчанию (замерено по референсу разговорного мульта, см. lively.py).
# Переопределяется в film.json: style.voice = {"tempo", "range", "pitch"} и style.narrator = {...}; у персонажа — cast.<id>.lively (или false).
LIVELY_CHAR = {"tempo": 1.45, "range": 1.4, "pitch": 4.0}
LIVELY_NARR = {"tempo": 1.22, "range": 1.25, "pitch": 1.0}
COSY_MOOD = {  # настроение → инструкция CosyVoice3 (из списка, на котором модель обучена)
    "happy": "请非常开心地说一句话。", "sad": "请非常伤心地说一句话。", "angry": "请非常生气地说一句话。",
    "pray": "Please say a sentence in a very soft voice.", "tired": "Please say a sentence in a very soft voice.",
}


def applio_cfg() -> dict | None:
    """Applio (RVC, замена голоса) на этом ПК: studio/engines.local.json → {"applio": {"dir": "C:/Applio"}}."""
    if not ENGINES_CFG.exists():
        return None
    a = json.loads(ENGINES_CFG.read_text(encoding="utf-8")).get("applio")
    if not a:
        return None
    d = Path(a["dir"])
    a.setdefault("python", str(next((p for p in (d / "env/python.exe", d / "env/bin/python") if p.exists()), d / "env/python.exe")))
    return a if a.get("mock") or (Path(a["python"]).exists() and (d / "core.py").exists()) else None


def rvc_model(name: str) -> tuple[Path, Path | None]:
    pth = MODELS / "rvc" / f"{name}.pth"
    idx = MODELS / "rvc" / f"{name}.index"
    return pth, (idx if idx.exists() else None)


def rvc_batch(model: str, opts: dict, files: list[Path], out_dir: Path) -> None:
    """Перекрасить пачку wav в голос RVC-модели через Applio (модель грузится один раз на пачку)."""
    a = applio_cfg(); pth, idx = rvc_model(model)
    inp = out_dir / "in"; outp = out_dir / "out"; inp.mkdir(parents=True, exist_ok=True); outp.mkdir(exist_ok=True)
    for f in files:
        shutil.copy(f, inp / f.name)
    say(f"  Applio: {len(files)} реплик → голос «{model}»…")
    if a.get("mock"):
        for f in files:
            shutil.copy(f, outp / f"{f.stem}_output.wav")
        return
    cmd = [a["python"], "core.py", "batch-infer", "--input-folder", str(inp), "--output-folder", str(outp),
           "--pth-path", str(pth), "--index-path", str(idx or ""), "--pitch", str(int(opts.get("pitch", 0))),
           "--index-rate", str(opts.get("index_rate", 0.5)), "--protect", str(opts.get("protect", 0.33)),
           "--f0-method", opts.get("f0", "rmvpe"), "--export-format", "WAV"]
    if subprocess.run(cmd, cwd=a["dir"]).returncode:
        raise SystemExit("Applio завершился с ошибкой (см. вывод выше)")


def cosy_cfg() -> dict | None:
    if not ENGINES_CFG.exists():
        return None
    c = json.loads(ENGINES_CFG.read_text(encoding="utf-8")).get("cosyvoice")
    if not c:
        return None
    c.setdefault("repo", str(MODELS / "CosyVoice"))
    c.setdefault("model", str(MODELS / "CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B"))
    return c if Path(c["python"]).exists() and (c.get("mock") or Path(c["model"]).exists()) else None
SR = 48000
MOOD = {  # настроение → (полутоны, темп)
    "happy": (1.0, 1.05), "sad": (-1.0, 0.92), "angry": (-0.5, 1.08), "scared": (2.0, 1.12), "surprised": (1.5, 1.0),
    "pray": (0.0, 0.93), "sly": (-0.5, 0.95), "tired": (-1.5, 0.88), "love": (0.5, 0.95), "dizzy": (0.5, 0.9),
}
FX = {
    "alien": "vibrato=f=7:d=0.35,aecho=0.8:0.6:25:0.35",
    "radio": "highpass=f=300,lowpass=f=3200,acompressor",
    "reverb": "aecho=0.8:0.7:60|95:0.25|0.15",
    "robot": "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75",
    "giant": "lowpass=f=2500,aecho=0.8:0.8:40:0.3",
    "chipmunk": "highpass=f=200",
}


# ---------------------------------------------------------------- движки
@functools.cache
def _piper_voice(model: str):
    from piper import PiperVoice  # type: ignore
    return PiperVoice.load(str(MODELS / "piper" / f"{model}.onnx"))


def available(e: dict) -> bool:
    kind = e["engine"]
    if kind == "cosyvoice":
        return cosy_cfg() is not None and (VOICES / f"{e['ref']}.wav").exists()
    if kind == "piper":
        try:
            import piper  # noqa: F401  # type: ignore
        except ImportError:
            return False
        return (MODELS / "piper" / f"{e['model']}.onnx").exists()
    if kind == "rhvoice":
        return bool(shutil.which("RHVoice-test"))
    if kind == "espeak":
        return bool(shutil.which("espeak-ng") or shutil.which("espeak"))
    return False


def pick(preset_name: str) -> tuple[dict, dict]:
    pr = PRESETS.get(preset_name) or PRESETS["man"]
    for e in pr["engines"]:
        if available(e):
            return pr, e
    raise SystemExit(f"Для голоса «{preset_name}» не установлен ни один движок: {[e['engine'] for e in pr['engines']]}")


def synth_raw(e: dict, text: str, out: Path) -> None:
    kind = e["engine"]
    if kind == "piper":
        v = _piper_voice(e["model"])
        with wave.open(str(out), "wb") as wf:
            (v.synthesize_wav if hasattr(v, "synthesize_wav") else v.synthesize)(text, wf)
    elif kind == "rhvoice":
        subprocess.run(["RHVoice-test", "-p", e["voice"], "-o", str(out)], input=text.encode("utf-8"), check=True, capture_output=True)
    elif kind == "espeak":
        exe = shutil.which("espeak-ng") or shutil.which("espeak")
        subprocess.run([exe, "-v", e["voice"], "-s", "150", "-w", str(out), text], check=True, capture_output=True)


def _atempo(k: float) -> str:
    parts = []
    while k > 2.0:
        parts.append("atempo=2.0"); k /= 2.0
    while k < 0.5:
        parts.append("atempo=0.5"); k /= 0.5
    parts.append(f"atempo={k:.4f}")
    return ",".join(parts)


def post(raw: Path, out: Path, pitch: float, tempo: float, fx: list[str]) -> None:
    r = 2 ** (pitch / 12)
    chain = [f"aresample={SR}", f"asetrate={SR}*{r:.5f}", f"aresample={SR}", _atempo(tempo / r)]
    chain += [FX[f] for f in fx if f in FX]
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", str(raw), "-ac", "1", "-af", ",".join(chain), "-ar", str(SR), "-sample_fmt", "s16", str(out)], check=True)


# ---------------------------------------------------------------- звук → числа
def read_wav(p: Path) -> np.ndarray:
    with wave.open(str(p), "rb") as wf:
        data = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        if wf.getnchannels() > 1:
            data = data.reshape(-1, wf.getnchannels()).mean(axis=1)
    return data


def write_wav(p: Path, x: np.ndarray, sr: int = SR) -> None:
    with wave.open(str(p), "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr)
        wf.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def trim_and_level(x: np.ndarray) -> np.ndarray:
    """Срезать тишину по краям (оставив 60 мс) и выровнять громкость."""
    a = np.abs(x); th = max(1e-4, a.max() * 0.02)
    idx = np.nonzero(a > th)[0]
    if len(idx):
        pad = int(0.06 * SR); x = x[max(0, idx[0] - pad): idx[-1] + pad]
    rms = np.sqrt(np.mean(x ** 2)) or 1
    return np.clip(x * (0.12 / rms), -0.98, 0.98)


def mouth_env(x: np.ndarray, fps: int) -> list[float]:
    """Громкость по кадрам → открытие рта 0..1 (4 ступени, как у рисованных мультов)."""
    hop = SR // fps
    n = max(1, len(x) // hop)
    rms = np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2)) for i in range(n)])
    ref = np.percentile(rms, 90) or 1
    v = np.clip(rms / ref, 0, 1)
    v = np.convolve(v, [0.25, 0.5, 0.25], mode="same")
    q = np.where(v < 0.15, 0, np.where(v < 0.45, 0.35, np.where(v < 0.75, 0.7, 1.0)))
    return [float(round(k, 2)) for k in q]


# ---------------------------------------------------------------- фильм
def film_lines(film: dict) -> list[dict]:
    out = []
    for si, sc in enumerate(film.get("scenes", [])):
        sid = sc.get("id") or f"s{si + 1}"
        for bi, b in enumerate(sc.get("beats", [])):
            if b.get("say"):
                out.append({"id": f"{sid}_{bi + 1}", **b["say"]})
    return out


def cosy_batch(items: list[dict]) -> None:
    """Озвучить пакет реплик CosyVoice одним запуском модели."""
    c = cosy_cfg()
    with tempfile.TemporaryDirectory() as tmp:
        job = Path(tmp) / "job.json"
        job.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
        cmd = [c["python"], str(ROOT / "studio/cosy_worker.py"), "--repo", c["repo"], "--model", c["model"], "--job", str(job)]
        cmd += ["--fp16"] if c.get("fp16", True) else []
        cmd += ["--mock"] if c.get("mock") else []
        say(f"  CosyVoice: {len(items)} реплик (модель грузится один раз)…")
        r = subprocess.run(cmd, cwd=c["repo"] if Path(c["repo"]).exists() else None)
        if r.returncode:
            raise SystemExit("CosyVoice завершился с ошибкой (см. вывод выше)")


def voice_film(d: Path, film: dict, force: bool = False) -> dict:
    fps = int(film.get("fps", 25))
    vdir = build_dir(d, "voice"); ldir = build_dir(d, "voice", "lines")
    cast = film.get("cast", {})
    manifest = {"fps": fps, "lines": {}}
    lines = film_lines(film)
    plan = []
    style = film.get("style", {})
    import lively as lv
    can_liven = lv.available()
    if not can_liven:
        say("⚠ нет parselmouth (pip install praat-parselmouth) — интонация не оживляется, только темп")
    for l in lines:
        who = l["who"]; c = cast.get(who, {})
        preset_name = c.get("voice") or ("narrator" if who == "narrator" else "man")
        pr, eng = pick(preset_name)
        mood = l.get("mood") or ""
        cosy = eng["engine"] == "cosyvoice"
        # у движка в пресете могут быть свои pitch/tempo (клон голоса обычно не сдвигаем)
        pitch, tempo = eng.get("pitch", pr.get("pitch", 0)) + c.get("pitch", 0), eng.get("tempo", pr.get("tempo", 1.0)) * c.get("tempo", 1.0)
        instruct = COSY_MOOD.get(mood) if cosy else None
        mp, mt = MOOD.get(mood, (0.0, 1.0))
        if not cosy:
            pitch, tempo = pitch + mp, tempo * mt
        else:
            tempo *= mt                                   # темп CosyVoice меняет сам, без искажения голоса
        fx = pr.get("fx", []) + c.get("fx", [])
        text = l["text"].replace("+", "")
        # оживление: у клона CosyVoice манеру даёт сам образец, у остальных движков — lively.py
        base = LIVELY_NARR if who == "narrator" else LIVELY_CHAR
        liv = None if cosy or c.get("lively") is False else {**base, **style.get("narrator" if who == "narrator" else "voice", {}), **(c.get("lively") or {})}
        if liv:
            tempo *= liv.get("tempo", 1.0)
            if not can_liven:
                pitch += liv.get("pitch", 0)
        # замена голоса через Applio (RVC): cast.<id>.rvc или пресет.rvc = {"model": "<имя .pth в models/rvc>", "pitch": 0, ...}
        rvc = c.get("rvc", pr.get("rvc"))
        if rvc and not (applio_cfg() and (applio_cfg().get("mock") or rvc_model(rvc["model"])[0].exists())):
            say(f"⚠ {l['id']}: голос RVC «{rvc['model']}» недоступен (нет Applio или models/rvc/{rvc['model']}.pth) — без замены голоса")
            rvc = None
        key = hashlib.sha1(json.dumps([text, eng, pitch, tempo, fx, instruct, liv if can_liven else None, rvc], ensure_ascii=False).encode()).hexdigest()[:14]
        plan.append({"l": l, "eng": eng, "pitch": pitch, "tempo": tempo, "fx": fx, "text": text, "instruct": instruct, "liv": liv if can_liven else None, "rvc": rvc, "wav": ldir / f"{key}.wav"})

    todo = [p for p in plan if force or not p["wav"].exists()]
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        cosy = [p for p in todo if p["eng"]["engine"] == "cosyvoice"]
        if cosy:
            items = []
            for i, p in enumerate(cosy):
                ref = VOICES / f"{p['eng']['ref']}.wav"; txt = ref.with_suffix(".txt")
                p["raw"] = tmp / f"cosy{i}.wav"
                items.append({"text": p["text"], "out": str(p["raw"]), "ref": str(ref), "speed": round(p["tempo"], 3),
                              "ref_text": txt.read_text(encoding="utf-8").strip() if txt.exists() else "", "instruct": p["instruct"]})
            cosy_batch(items)
        for i, p in enumerate(todo):
            if "raw" not in p:
                p["raw"] = tmp / f"raw{i}.wav"; synth_raw(p["eng"], p["text"], p["raw"])
            cooked = tmp / f"cooked{i}.wav"
            pitch = p["pitch"]
            if p["liv"]:
                alive = tmp / f"alive{i}.wav"
                if lv.liven(p["raw"], alive, p["text"], p["liv"].get("range", 1.0), p["liv"].get("pitch", 0) + pitch):
                    p["raw"], pitch = alive, 0          # высоту уже сдвинул Praat (чище, чем asetrate)
            post(p["raw"], cooked, pitch, 1.0 if p["eng"]["engine"] == "cosyvoice" else p["tempo"], p["fx"])
            p["cooked"] = cooked
            e = p["eng"]
            say(f"  [{i + 1}/{len(todo)}] {p['l']['id']} {p['l']['who']} ({e['engine']}:{e.get('ref') or e.get('model') or e.get('voice')}): {p['text']}")
        # замена голоса RVC пачками — по одной на модель
        by_model: dict[str, list[dict]] = {}
        for p in todo:
            if p["rvc"]:
                by_model.setdefault(json.dumps(p["rvc"], sort_keys=True), []).append(p)
        for j, (mk, group) in enumerate(by_model.items()):
            opts = json.loads(mk); work = tmp / f"rvc{j}"
            files = []
            for k, p in enumerate(group):
                f = tmp / f"line{j}_{k}.wav"; shutil.copy(p["cooked"], f); files.append(f)
            rvc_batch(opts["model"], opts, files, work)
            for f, p in zip(files, group):
                p["cooked"] = work / "out" / f"{f.stem}_output.wav"
        for p in todo:
            write_wav(p["wav"], trim_and_level(read_wav(p["cooked"])))

    used = set()
    for p in plan:
        x = read_wav(p["wav"]); l = p["l"]
        manifest["lines"][l["id"]] = {"file": f"lines/{p['wav'].name}", "dur": round(len(x) / SR, 3), "text": l["text"], "who": l["who"], "env": mouth_env(x, fps)}
        used.add(p["wav"].name)
    for old in ldir.glob("*.wav"):
        if old.name not in used:
            old.unlink()
    (vdir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    total = sum(v["dur"] for v in manifest["lines"].values())
    say(f"Озвучка: {len(lines)} реплик, {total:.1f} с речи → {vdir / 'manifest.json'}")
    return manifest


def import_ref(name: str, src: Path, text: str | None = None) -> Path:
    """Образец голоса для клонирования: моно 24 кГц, тишина по краям срезана, не длиннее 15 с."""
    VOICES.mkdir(exist_ok=True)
    out = VOICES / f"{name}.wav"
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "24000", "-t", "15",
                    "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                    "-sample_fmt", "s16", str(out)], check=True)
    if text:
        out.with_suffix(".txt").write_text(text.strip(), encoding="utf-8")
    with wave.open(str(out)) as wf:
        dur = wf.getnframes() / wf.getframerate()
    say(f"Образец «{name}»: {dur:.1f} с → {out}" + ("" if text else "  (без текста — режим cross-lingual; с текстом тембр точнее: --text)"))
    if dur < 3:
        say("⚠ образец короче 3 с — клон будет неточным, лучше 5–15 с чистой речи")
    return out


def list_engines() -> None:
    for name, pr in PRESETS.items():
        if name.startswith("_"):
            continue
        ok = [e for e in pr["engines"] if available(e)]
        e = ok[0] if ok else None
        say(f"  {name:10s} → " + (f"{e['engine']}:{e.get('ref') or e.get('model') or e.get('voice')}" if e else "НЕТ ДВИЖКА"))
    say("CosyVoice: " + ("подключён" if cosy_cfg() else "не настроен (docs/COSYVOICE.md)") + f"; образцы голосов: {sorted(p.stem for p in VOICES.glob('*.wav')) or 'нет'}")
