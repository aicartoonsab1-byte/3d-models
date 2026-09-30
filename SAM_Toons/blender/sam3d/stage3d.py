"""SAM_Toons · Blender · сборка одного плана (shot) по спецификации.

Спецификация (все времена уже в секундах от начала плана — их расставляет studio/episode.py):
{
  "duration": 6.0, "fps": 25, "size": [960, 540], "samples": 1, "style": {"look": "mult", "line": 1.75},
  "set": {"trees": [[x, y, h]], "bushes": [[x, y, w]], "reeds": [[x, y]], "pools": [[x, y, w, d]], "glow": [[x, y]]},
  "actors": {"boris": {"kind": "bean", "start": [x, y], "segments": [{"move": "walk", "dur": 2.5, "face": 90}, ...],
                       "hold": "camera", "morph": [{"t": 3, "swell": 1}], "sink": [{"t": 1, "z": -0.15}],
                       "lines": [{"t0": 0.5, "env": [...]}]}},
  "creatures": [{"type": "capykanga", "hops": {...}}, {"type": "mantis_trunk", "run": {...}}, {"type": "mantis_deer", ...},
                {"type": "mantis_baby", "fly": [[t, [x, y, z]], ...], "land": t, "leave": t, "target": ["boris", "RightHand"]},
                {"type": "flower", "x": 1, "y": 0.5, "h": 1.1, "turn": [[t, deg], ...]}],
  "camera": [{"t": 0, "pos": [x, y, z], "look": [x, y, z]}], "lens": 30,
  "card": {"lines": ["ТРИ ЧАСА", "НАЗАД"]}          # титровая карточка вместо сцены
}
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

from . import character, creature, look, mocap, world

ROOT = Path(__file__).resolve().parents[2]
MC = ROOT / "models/mocap"


def setup(spec: dict):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    style = spec.get("style", {})
    look.MODE = style.get("look", "mult")
    fps = spec.get("fps", 25); w, h = spec.get("size", [960, 540])
    look.render_settings(w, h, fps, spec.get("samples", 1)); look.world_sky(); world.lights()
    if look.MODE == "ids":
        return fps          # служебный проход для стилей: без линий
    ls = look.freestyle(*((style.get("line", 1.75), style.get("wobble", 0.6)) if look.MODE == "mult" else (2.4, 1.6)))
    if look.MODE == "mult":
        ls.linestyle.color = (0.02, 0.02, 0.025)
    return fps


def build_set(st: dict, mult: bool, speckles: bool = True):
    world.ground(flat=mult)
    if st.get("hills", True):
        world.hills(28, look.PAL["far"], 4, 5); world.hills(18, look.PAL["mid"], 2.2, 9)
    if mult and speckles:
        world.speckle_ground(ROOT / "blender/textures/speckle.png")
    else:
        world.moons()
    for p in st.get("pools", []): world.pool(*p)
    for i, p in enumerate(st.get("reeds", [])): world.reeds(*p, seed=i + 2)
    for i, p in enumerate(st.get("glow", [])): world.glow_plant(*p, seed=i + 3)
    for i, p in enumerate(st.get("trees", [])):
        (world.puff_tree(*p, seed=i + 4) if mult else world.swamp_tree(*p, seed=i + 4))
    for i, p in enumerate(st.get("bushes", [])): world.bush(*p, seed=i + 6)


CARD_FONTS = ("C:/Windows/Fonts/comic.ttf", "C:/Windows/Fonts/segoepr.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "C:/Windows/Fonts/arialbd.ttf")


def card_font(want: str | None = None):
    """Шрифт с кириллицей (встроенный шрифт Blender её не знает — буквы пропадают)."""
    for f in ([want] if want else []) + list(CARD_FONTS):
        if f and Path(f).exists():
            return bpy.data.fonts.load(f, check_existing=True)
    return None


def build_card(card: dict, fps: int):
    """Титровая карточка: крупные буквы чёрной заливкой на белом, как надписи от руки в референсе."""
    font = card_font(card.get("font"))
    for i, line in enumerate(card["lines"]):
        cu = bpy.data.curves.new(f"card{i}", "FONT"); cu.body = line
        if font:
            cu.font = font; cu.align_x = "CENTER"; cu.align_y = "CENTER"
        cu.size = card.get("size", 0.9) * (1.0 if i == 0 else 0.8); cu.extrude = 0.0
        o = bpy.data.objects.new(f"card{i}", cu); bpy.context.collection.objects.link(o)
        o.location = (0, 0, -i * card.get("size", 0.9) * 1.1 + (len(card["lines"]) - 1) * 0.5)
        o.rotation_euler = (math.radians(90), 0, 0)
        o.data.materials.append(look.toon(f"card{i}_ink", look.PAL["ink"]))   # буквы — чёрной заливкой
        # лёгкое «дыхание» надписи — чтобы кадр не был мёртвым
        o.keyframe_insert("scale", frame=1); o.scale = (1.03, 1.03, 1.03); o.keyframe_insert("scale", frame=int(card.get("duration", 2) * fps))
    cam, tgt = world.camera((0, -6, 0.3), (0, 0, 0.3), 40)


def foot_contacts(rig, frames: int, fps: int) -> list[dict]:
    """Моменты, когда стопа встаёт на землю (для звука шагов). Уровень «земли» — скользящий минимум за ±0,6 с,
    поэтому шаги находятся и когда актёр проваливается в трясину или стоит на кочке."""
    out = []
    sc = bpy.context.scene
    zs = {"Left": [], "Right": []}
    for f in range(1, frames + 1):
        sc.frame_set(f)
        for side in zs:
            zs[side].append((rig.matrix_world @ rig.pose.bones[f"{side}Foot"].head).z)
    w = int(0.6 * fps)
    for side, z in zs.items():
        up = False; last = -99
        for i in range(len(z)):
            lo = min(z[max(0, i - w): i + w + 1])
            if z[i] > lo + 0.045:
                up = True
            elif up and z[i] < lo + 0.015 and i - last > fps * 0.25:
                out.append({"t": round(i / fps, 3), "foot": side}); up = False; last = i
    return sorted(out, key=lambda e: e["t"])


def build_shot(spec: dict, contacts_path: Path | None = None) -> dict:
    fps = setup(spec)
    frames = int(round(spec["duration"] * fps))
    if "card" in spec:
        build_card({**spec["card"], "duration": spec["duration"]}, fps)
        return {"frames": frames}
    mult = look.MODE in ("mult", "ids")
    build_set(spec.get("set", {}), mult, speckles=look.MODE == "mult")
    rigs, info = {}, {"frames": frames, "contacts": []}
    for name, a in spec.get("actors", {}).items():
        kind = a.get("kind", "bean" if mult else "human")
        b = (character.build_bean if kind == "bean" else character.build_human)(name, MC, fps, {k: v for k, v in a.items() if k not in ("segments", "start")})
        if a.get("morph"):
            character.build_claw(b, a.get("morph_side", "Right"))      # до запекания движения: клешня крепится к кости в позе покоя
        mocap.bake(b["rig"], a["segments"], MC, fps, tuple(a.get("start", (0, 0))))
        character.lipsync(b["mouth"], a.get("lines", []), fps)
        character.blinks(b["eyes"], frames, fps, seed=hash(name) % 97)
        if a.get("morph"):
            character.arm_morph(b, a["morph"], fps, a.get("morph_side", "Right"))
        for k in a.get("sink", []):
            b["rig"].location.z = k["z"]; b["rig"].keyframe_insert("location", index=2, frame=k["t"] * fps + 1)
        rigs[name] = b["rig"]
        if contacts_path:
            info["contacts"] += [{**c, "who": name} for c in foot_contacts(b["rig"], frames, fps)]
    for i, c in enumerate(spec.get("creatures", [])):
        t = c["type"]; nm = c.get("id", f"{t}{i}")
        if t == "capykanga":
            cap = creature.build_capykanga(nm, s=c.get("scale", 1.0)); h = c["hops"]
            creature.hop_path(cap, h["from"], h["to"], h["y"], h["t0"], h["t1"], fps, turn_at=h.get("turn_at"))
        elif t in ("mantis_trunk", "mantis_deer"):
            n = c.get("n", 1)
            for j in range(n):
                r = c["run"]; jit = (j * 0.37) % 1
                m = creature.build_mantis(f"{nm}_{j}", "trunk" if t == "mantis_trunk" else "deer", s=c.get("scale", 1.0) * (0.9 + 0.2 * jit))
                dx = -j * c.get("spread", 1.4) * (1 if r["to"] > r["from"] else -1)
                last = j == n - 1
                creature.run_path(m, r["from"] + dx, r["to"] + dx, r["y"] + (j % 3 - 1) * 0.6, r["t0"] + j * 0.12, r["t1"] + j * 0.12, fps,
                                  stride=c.get("stride", 0.24), trunk=(t == "mantis_trunk"),
                                  stop=tuple(c["last_stop"]) if last and c.get("last_stop") else None,
                                  nod=c.get("nod") if last else None)
        elif t == "mantis_baby":
            m = creature.build_mantis(nm, "baby", s=c.get("scale", 0.18))
            tgt = c.get("target")
            creature.fly_to(m, [(k[0], tuple(k[1])) for k in c["fly"]], fps,
                            target=(rigs[tgt[0]], tgt[1]) if tgt and tgt[0] in rigs else None, land=c.get("land"), leave=c.get("leave"))
        elif t == "flower":
            pv = creature.build_flower(nm, c["x"], c["y"], c.get("h", 1.1), c.get("scale", 1.0))
            if c.get("turn"):
                creature.flower_turn(pv, c["turn"], fps)
    keys = spec["camera"]
    cam, tgt = world.camera(tuple(keys[0]["pos"]), tuple(keys[0]["look"]), spec.get("lens", 30))
    world.key_path(cam, [(k["t"], tuple(k["pos"])) for k in keys], fps)
    world.key_path(tgt, [(k["t"], tuple(k["look"])) for k in keys], fps)
    if spec.get("shake"):
        for sk in spec["shake"]:     # тряска камеры (топот стада)
            for i in range(int(sk["dur"] * fps / 2)):
                f = sk["t"] + i * 2 / fps; a = sk.get("amp", 0.04) * (1 - i / max(1, sk["dur"] * fps / 2))
                cam.delta_location = (math.sin(i * 2.3) * a, 0, math.cos(i * 3.1) * a); cam.keyframe_insert("delta_location", frame=f * fps + 1)
            cam.delta_location = (0, 0, 0); cam.keyframe_insert("delta_location", frame=(sk["t"] + sk["dur"]) * fps + 2)
    if contacts_path:
        contacts_path.write_text(json.dumps(info["contacts"]), encoding="utf-8")
    return info
