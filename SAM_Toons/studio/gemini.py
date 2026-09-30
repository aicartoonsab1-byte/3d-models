"""SAM_Toons · Gemini API (Google): озвучка (Gemini TTS), видео (Veo), оценка кадров и роликов (Gemini с «зрением»).

Ключ — только в переменной окружения GEMINI_API_KEY (никогда не в файлах проекта и не в git).
Модели и лимиты — studio/gemini.json (свои правки — gemini.local.json рядом, он не в git).
Veo и TTS платные/лимитированные: каждый запрос записывается в build/gemini_usage.json, видео считается в секундах
и не выходит за дневной бюджет (daily_video_seconds).
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

from common import ROOT, say

API = "https://generativelanguage.googleapis.com/v1beta"
CFG_FILES = (ROOT / "studio/gemini.local.json", ROOT / "studio/gemini.json")
USAGE = ROOT / "build/gemini_usage.json"


def cfg() -> dict:
    base: dict = {}
    for p in reversed(CFG_FILES):
        if p.exists():
            base.update(json.loads(p.read_text(encoding="utf-8")))
    return base


def key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def available() -> bool:
    return bool(key()) or bool(cfg().get("mock"))


class GeminiError(RuntimeError):
    pass


def _req(method: str, url: str, body: dict | None = None, timeout: int = 300, raw: bool = False):
    k = key()
    if not k:
        raise GeminiError("нет ключа: задайте переменную окружения GEMINI_API_KEY (ключ берётся в Google AI Studio)")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"x-goog-api-key": k, "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                return b if raw else json.loads(b)
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:600]
            if e.code in (429, 500, 503) and attempt < 3:        # лимит/перегрузка — подождать и повторить
                wait = 20 * (attempt + 1); say(f"  Gemini {e.code}: ждём {wait} с…"); time.sleep(wait); continue
            raise GeminiError(f"{e.code}: {msg}")
        except urllib.error.URLError as e:
            if attempt < 3:
                time.sleep(5 * (attempt + 1)); continue
            raise GeminiError(f"нет связи с Gemini API: {e}")


# ---------------------------------------------------------------- учёт расхода
def _usage() -> dict:
    return json.loads(USAGE.read_text(encoding="utf-8")) if USAGE.exists() else {}


def _log(kind: str, amount: float):
    USAGE.parent.mkdir(parents=True, exist_ok=True)
    u = _usage(); day = dt.date.today().isoformat()
    u.setdefault(day, {}); u[day][kind] = round(u[day].get(kind, 0) + amount, 2)
    USAGE.write_text(json.dumps(u, ensure_ascii=False, indent=1), encoding="utf-8")


def video_seconds_left() -> float:
    used = _usage().get(dt.date.today().isoformat(), {}).get("video_s", 0)
    return max(0.0, float(cfg().get("daily_video_seconds", 64)) - used)


# ---------------------------------------------------------------- текст / оценка (Gemini видит картинки и видео)
def _part(p: Path) -> dict:
    mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".wav": "audio/wav"}[p.suffix.lower()]
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(p.read_bytes()).decode()}}


def ask(prompt: str, media: list[Path] | None = None, system: str | None = None, json_out: bool = True, model: str | None = None,
        temperature: float = 0.4):
    """Запрос к Gemini с картинками/видео (видео до ~20 МБ передаётся прямо в запросе). json_out — ответ строго JSON."""
    c = cfg()
    if c.get("mock"):
        return MOCK("ask", prompt=prompt, media=media)
    model = model or c["models"]["judge"]
    body = {"contents": [{"role": "user", "parts": [_part(p) for p in (media or [])] + [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature}}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    if json_out:
        body["generationConfig"]["responseMimeType"] = "application/json"
    r = _req("POST", f"{API}/models/{model}:generateContent", body)
    _log("text_calls", 1)
    try:
        txt = "".join(p.get("text", "") for p in r["candidates"][0]["content"]["parts"])
    except (KeyError, IndexError):
        raise GeminiError(f"пустой ответ: {json.dumps(r)[:400]}")
    return json.loads(txt) if json_out else txt


# ---------------------------------------------------------------- озвучка (Gemini TTS)
def tts(text: str, voice: str, style: str, out: Path, model: str | None = None) -> Path:
    """Реплика голосом Gemini. style — как сказать (по-русски, словами: «шёпотом, испуганно, быстро»). Пишет WAV 24 кГц."""
    import wave
    c = cfg()
    if c.get("mock"):
        return MOCK("tts", text=text, voice=voice, style=style, out=out)
    model = model or c["models"]["tts"]
    prompt = f"{style.strip()}: {text}" if style else text
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    r = _req("POST", f"{API}/models/{model}:generateContent", body)
    try:
        part = r["candidates"][0]["content"]["parts"][0]
        blob = part.get("inlineData") or part.get("inline_data")
        pcm = base64.b64decode(blob["data"]); mime = blob.get("mimeType", "audio/L16;rate=24000")
    except (KeyError, IndexError, TypeError):
        raise GeminiError(f"TTS не вернул звук: {json.dumps(r)[:400]}")
    rate = int(mime.split("rate=")[1].split(";")[0]) if "rate=" in mime else 24000
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
    _log("tts_chars", len(text))
    return out


# ---------------------------------------------------------------- видео (Veo)
def veo(prompt: str, out: Path, first_frame: Path | None = None, seconds: int = 8, negative: str | None = None,
        model: str | None = None, aspect: str = "16:9") -> Path:
    """Сгенерировать ролик Veo. first_frame — кадр-якорь (наш кадр из Blender): Veo начинает с него, поэтому персонаж
    и стиль совпадают с раскадровкой. Бюджет секунд в день проверяется до запроса."""
    c = cfg()
    if seconds > video_seconds_left():
        raise GeminiError(f"дневной лимит видео исчерпан ({c.get('daily_video_seconds')} с) — продолжим завтра")
    if c.get("mock"):
        r = MOCK("veo", prompt=prompt, out=out, first_frame=first_frame, seconds=seconds); _log("video_s", seconds); return r
    model = model or c["models"]["video"]
    inst: dict = {"prompt": prompt}
    if first_frame:
        inst["image"] = {"bytesBase64Encoded": base64.b64encode(first_frame.read_bytes()).decode(),
                         "mimeType": "image/jpeg" if first_frame.suffix.lower() in (".jpg", ".jpeg") else "image/png"}
    params = {"aspectRatio": aspect, "durationSeconds": seconds, **c.get("video_params", {})}
    if negative:
        params["negativePrompt"] = negative
    try:
        op = _req("POST", f"{API}/models/{model}:predictLongRunning", {"instances": [inst], "parameters": params})
    except GeminiError as e:
        if first_frame and "400" in str(e)[:4]:       # другой вариант поля картинки в некоторых версиях API
            inst["image"] = {"inlineData": {"mimeType": inst["image"]["mimeType"], "data": inst["image"]["bytesBase64Encoded"]}}
            op = _req("POST", f"{API}/models/{model}:predictLongRunning", {"instances": [inst], "parameters": params})
        else:
            raise
    name = op["name"]; t0 = time.time()
    while not op.get("done"):
        if time.time() - t0 > c.get("video_timeout", 900):
            raise GeminiError(f"Veo не ответил за {c.get('video_timeout', 900)} с ({name})")
        time.sleep(10); op = _req("GET", f"{API}/{name}")
    if op.get("error"):
        raise GeminiError(f"Veo: {op['error'].get('message', op['error'])}")
    _log("video_s", seconds)
    resp = op.get("response", {})
    samples = (resp.get("generateVideoResponse") or resp).get("generatedSamples") or resp.get("generatedVideos") or []
    if not samples:
        raise GeminiError(f"Veo не вернул видео (возможно, фильтр безопасности): {json.dumps(resp)[:400]}")
    v = samples[0].get("video", samples[0])
    if v.get("bytesBase64Encoded"):
        out.write_bytes(base64.b64decode(v["bytesBase64Encoded"]))
    else:
        out.write_bytes(_req("GET", v["uri"], raw=True, timeout=600))
    return out


def MOCK(kind, **kw):  # noqa: N802 — подменяется в тестах (cfg "mock": true)
    raise GeminiError("mock-режим: подмените gemini.MOCK")
