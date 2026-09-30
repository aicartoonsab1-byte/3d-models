"""SAM_Toons · ComfyUI как локальный генератор видео (MiniMax H3 и любые другие модели) — бесплатно, на своём ПК.

ComfyUI запускается отдельно (обычно http://127.0.0.1:8188). SAM_Toons отправляет ему сохранённый граф (workflow в формате API),
подставив промпт, кадр-якорь из Blender, длительность и seed, ждёт результат и забирает mp4.

Граф: в ComfyUI соберите/откройте рабочий граф H3 (image → video), проверьте, что он работает, затем
  Workflow → Export (API) → сохраните в studio/comfy_workflows/h3_i2v.json.
Места для подстановки находятся сами (узел MiniMaxH3ImageToVideo, его LoadImage, текст промпта, seed) — или явно:
в любом текстовом поле графа можно написать {{prompt}}, {{negative}}, {{image}}, {{seconds}}, {{frames}}, {{seed}}.
"""
from __future__ import annotations

import json
import random
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ComfyError(RuntimeError):
    pass


def _http(url: str, data: bytes | None = None, headers: dict | None = None, timeout: int = 60):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise ComfyError(f"ComfyUI {e.code}: {e.read().decode('utf-8', 'replace')[:800]}")
    except OSError as e:
        raise ComfyError(f"нет связи с ComfyUI ({url}): {e}. Запустите ComfyUI.")


def alive(url: str) -> bool:
    try:
        _http(url + "/system_stats", timeout=5); return True
    except ComfyError:
        return False


def upload_image(url: str, path: Path) -> str:
    """Положить картинку во входную папку ComfyUI (POST /upload/image). Возвращает имя для узла LoadImage."""
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{path.name}\"\r\n"
            f"Content-Type: image/{'png' if path.suffix == '.png' else 'jpeg'}\r\n\r\n").encode() + path.read_bytes() + \
        f"\r\n--{b}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{b}--\r\n".encode()
    r = json.loads(_http(url + "/upload/image", body, {"Content-Type": f"multipart/form-data; boundary={b}"}))
    return (r.get("subfolder", "") + "/" if r.get("subfolder") else "") + r["name"]


# ---------------------------------------------------------------- подстановка в граф
def _link(v):
    return isinstance(v, list) and len(v) == 2 and isinstance(v[0], str)


def fill(wf: dict, vals: dict) -> dict:
    """Подставить значения в граф (формат API): сначала явные {{метки}}, потом автопоиск узлов H3."""
    wf = json.loads(json.dumps(wf))
    marks = 0
    for node in wf.values():
        for k, v in list(node.get("inputs", {}).items()):
            if isinstance(v, str) and "{{" in v:
                for key, val in vals.items():
                    tag = "{{" + key + "}}"
                    if v.strip() == tag and not isinstance(val, str):
                        v = val; break                         # число целиком (seconds, frames, seed)
                    if isinstance(v, str):
                        v = v.replace(tag, str(val))
                node["inputs"][k] = v; marks += 1
    if marks:
        return wf
    # автопоиск: узел H3 «картинка → видео» и то, что к нему подключено
    h3 = [n for n in wf.values() if "MiniMaxH3" in n.get("class_type", "") and "ToVideo" in n["class_type"]]
    if not h3:
        raise ComfyError("в графе нет узла MiniMaxH3…ToVideo и нет меток {{prompt}}/{{image}} — см. studio/comfy.py")
    for n in h3:
        ins = n["inputs"]
        if "prompt" in ins:
            _set_text(wf, n, "prompt", vals["prompt"])
        for key in ("first_frame", "ref_images.ref_image_0", "image"):
            if key in ins and _link(ins[key]):
                src = wf[ins[key][0]]
                if src.get("class_type") == "LoadImage":
                    src["inputs"]["image"] = vals["image"]
                break
        for key in ("length", "num_frames", "frames"):
            if key in ins and not _link(ins[key]):
                ins[key] = vals["frames"]
    for n in wf.values():                                  # длительность через «PrimitiveFloat» секунд, как в примерах H3
        if n.get("class_type") == "PrimitiveFloat" and n["inputs"].get("value") in (5, 5.0, 8, 8.0):
            n["inputs"]["value"] = float(vals["seconds"])
        for key in ("seed", "noise_seed"):
            if key in n.get("inputs", {}) and not _link(n["inputs"][key]):
                n["inputs"][key] = vals["seed"]
    return wf


def _set_text(wf, node, key, text):
    v = node["inputs"][key]
    if not _link(v):
        node["inputs"][key] = text; return
    src = wf[v[0]]
    for k in ("text", "value", "string", "prompt"):
        if k in src.get("inputs", {}):
            if _link(src["inputs"][k]):
                _set_text(wf, src, k, text)
            else:
                src["inputs"][k] = text
            return


# ---------------------------------------------------------------- запуск
def generate(cfg: dict, prompt: str, out: Path, first_frame: Path | None, seconds: float, negative: str = "") -> Path:
    url = cfg.get("url", "http://127.0.0.1:8188").rstrip("/")
    wpath = ROOT / cfg.get("workflow", "studio/comfy_workflows/h3_i2v.json")
    if not wpath.exists():
        raise ComfyError(f"нет графа {wpath}. В ComfyUI: откройте рабочий граф H3 → Workflow → Export (API) → сохраните туда.")
    wf = json.loads(wpath.read_text(encoding="utf-8"))
    if "nodes" in wf:
        raise ComfyError(f"{wpath.name} сохранён как обычный граф, а нужен формат API: Workflow → Export (API)")
    fps = cfg.get("fps", 24)
    image = upload_image(url, first_frame) if first_frame else ""
    frames = int(round(seconds * fps)); frames += (1 - frames % 8) % 8          # H3/LTX-подобные модели любят 8k+1 кадров
    wf = fill(wf, {"prompt": prompt, "negative": negative, "image": image, "seconds": seconds, "frames": frames,
                   "seed": random.randint(1, 2 ** 31)})
    cid = uuid.uuid4().hex
    r = json.loads(_http(url + "/prompt", json.dumps({"prompt": wf, "client_id": cid}).encode(), {"Content-Type": "application/json"}))
    if r.get("node_errors"):
        raise ComfyError(f"граф не принят: {json.dumps(r['node_errors'], ensure_ascii=False)[:800]}")
    pid = r["prompt_id"]; t0 = time.time()
    while True:
        h = json.loads(_http(f"{url}/history/{pid}"))
        if pid in h:
            h = h[pid]; break
        if time.time() - t0 > cfg.get("timeout", 7200):
            raise ComfyError(f"ComfyUI не закончил за {cfg.get('timeout', 7200)} с")
        time.sleep(5)
    st = h.get("status", {})
    if st.get("status_str") == "error":
        msgs = [m for m in st.get("messages", []) if m[0] == "execution_error"]
        raise ComfyError(f"ошибка в графе: {json.dumps(msgs, ensure_ascii=False)[:800]}")
    files = []
    for o in h.get("outputs", {}).values():
        for key in ("videos", "gifs", "images", "video"):
            for f in o.get(key, []) if isinstance(o.get(key), list) else []:
                if str(f.get("filename", "")).lower().endswith((".mp4", ".webm", ".mov", ".gif")):
                    files.append(f)
    if not files:
        raise ComfyError("граф не выдал видео — нужен узел SaveVideo / VHS_VideoCombine")
    f = files[-1]
    q = urllib.parse.urlencode({"filename": f["filename"], "subfolder": f.get("subfolder", ""), "type": f.get("type", "output")})
    out.write_bytes(_http(f"{url}/view?{q}", timeout=600))
    return out
