"""SAM_Toons · Blender · сборка и рендер сцены по JSON (запускается внутри Blender):
  blender -b --factory-startup -P blender/shot.py -- <shot.json> <manifest.json|-> <папка кадров> [--frames a-b]
Сцена: декорации болота, Борис (сегменты мокапа), капибара-кенгуру (прыжки), камера, липсинк реплик."""
import json, math, sys
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "blender"))
from sam3d import character, creature, look, mocap, world  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
shot = json.loads(Path(args[0]).read_text(encoding="utf-8"))
manifest = json.loads(Path(args[1]).read_text(encoding="utf-8")) if args[1] != "-" else {"lines": {}}
out = Path(args[2]); out.mkdir(parents=True, exist_ok=True)
rng = [int(x) for x in args[args.index("--frames") + 1].split("-")] if "--frames" in args else None
MC = ROOT / "models/mocap"; FPS = shot.get("fps", 25); W, H = shot.get("size", [960, 540])

bpy.ops.wm.read_factory_settings(use_empty=True)
style = shot.get("style", {})
look.MODE = style.get("look", "dusk")
mult = look.MODE == "mult"
look.render_settings(W, H, FPS, shot.get("samples", 4)); look.world_sky(); world.lights()
lineset = look.freestyle(*( (style.get("line", 1.75), style.get("wobble", 0.6)) if mult else (2.4, 1.6) ))
if mult:
    lineset.linestyle.color = (0.02, 0.02, 0.025)
st = shot.get("set", {})
world.ground(flat=mult); world.hills(28, look.PAL["far"], 4, 5); world.hills(18, look.PAL["mid"], 2.2, 9)
if not mult:
    world.moons()
if mult:
    # крапинки бумаги — без контура (иначе каждую обведёт Freestyle)
    nol = bpy.data.collections.new("noline"); bpy.context.scene.collection.children.link(nol)
    sp = world.speckles(style.get("speckles", 2200), y=(-6, 14))     # вдали крапинки сливаются в серую дымку — там их нет
    for c in sp.users_collection:
        c.objects.unlink(sp)
    nol.objects.link(sp)
    lineset.select_by_collection = True; lineset.collection = nol; lineset.collection_negation = "EXCLUSIVE"
for p in st.get("pools", []): world.pool(*p)
for i, p in enumerate(st.get("reeds", [])): world.reeds(*p, seed=i + 2)
for i, p in enumerate(st.get("glow", [])): world.glow_plant(*p, seed=i + 3)
for i, p in enumerate(st.get("trees", [])):
    (world.puff_tree(*p, seed=i + 4) if mult else world.swamp_tree(*p, seed=i + 4))
for i, p in enumerate(st.get("bushes", [])): world.bush(*p, seed=i + 6)

frames = int(shot["duration"] * FPS)
bd = shot["boris"]
b = (character.build_bean if mult else character.build_human)("boris", MC, FPS, {k: v for k, v in bd.items() if k not in ("segments", "start")})
mocap.bake(b["rig"], bd["segments"], MC, FPS, tuple(bd.get("start", (0, 0))))
lines = []
for i, ln in enumerate(shot.get("lines", [])):
    m = manifest["lines"].get(ln.get("id", f"b_{i + 1}"))
    if m and ln["who"] == "boris":
        lines.append({"t0": ln["t"], "env": m["env"]})
character.lipsync(b["mouth"], lines, FPS)
character.blinks([e for e in b["eyes"]], frames, FPS)
if "capy" in shot:
    c = shot["capy"]; cap = creature.build_capykanga(s=c.get("scale", 1.0))
    h = c["hops"]; creature.hop_path(cap, h["from"], h["to"], h["y"], h["t0"], h["t1"], FPS, turn_at=h.get("turn_at"))
keys = shot["camera"]
cam, tgt = world.camera(tuple(keys[0]["pos"]), tuple(keys[0]["look"]), shot.get("lens", 30))
world.key_path(cam, [(k["t"], tuple(k["pos"])) for k in keys], FPS)
world.key_path(tgt, [(k["t"], tuple(k["look"])) for k in keys], FPS)
sc = bpy.context.scene
sc.frame_start, sc.frame_end = (rng if rng else (1, frames))
sc.frame_step = 2 if style.get("twos") and not rng else 1   # «через кадр», как рисованная анимация: пропущенные кадры дублируются при сборке
sc.render.filepath = str(out / "f_")
bpy.ops.render.render(animation=True)
print("SHOT_DONE", sc.frame_start, sc.frame_end)
