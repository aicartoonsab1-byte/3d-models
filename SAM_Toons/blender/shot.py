"""SAM_Toons · Blender · рендер одного плана (запускается внутри Blender):
  blender -b --factory-startup -P blender/shot.py -- <spec.json> <папка кадров> [--frames a-b | --pick 10,40,80] [--contacts contacts.json]
spec.json — план с уже расставленными временами (см. sam3d/stage3d.py). Старый формат shot.json
(boris/capy/lines + manifest) переводится автоматически: blender -P shot.py -- <shot.json> <manifest|-> <папка>."""
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "blender"))
from sam3d import stage3d  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
spec = json.loads(Path(args[0]).read_text(encoding="utf-8"))
if "boris" in spec:     # старый формат одной сцены (films/swamp_3d, swamp_mult)
    manifest = json.loads(Path(args[1]).read_text(encoding="utf-8")) if args[1] != "-" else {"lines": {}}
    out = Path(args[2])
    b = dict(spec.pop("boris")); lines = []
    for i, ln in enumerate(spec.get("lines", [])):
        m = manifest["lines"].get(ln.get("id", f"b_{i + 1}"))
        if m and ln["who"] == "boris":
            lines.append({"t0": ln["t"], "env": m["env"]})
    b["lines"] = lines
    b.setdefault("kind", "bean" if spec.get("style", {}).get("look") == "mult" else "human")
    spec["actors"] = {"boris": b}
    if "capy" in spec:
        spec["creatures"] = [{"type": "capykanga", **spec.pop("capy")}]
else:
    out = Path(args[1])
out.mkdir(parents=True, exist_ok=True)
rng = [int(x) for x in args[args.index("--frames") + 1].split("-")] if "--frames" in args else None
contacts = Path(args[args.index("--contacts") + 1]) if "--contacts" in args else None

info = stage3d.build_shot(spec, contacts)
sc = bpy.context.scene
if "--pick" in args:          # отдельные кадры для раскадровки/проверки: --pick 10,40,80
    for f in [int(x) for x in args[args.index("--pick") + 1].split(",")]:
        sc.frame_set(f); sc.render.filepath = str(out / f"f_{f:04d}"); bpy.ops.render.render(write_still=True)
    print("SHOT_DONE pick"); sys.exit(0)
sc.frame_start, sc.frame_end = (rng if rng else (1, info["frames"]))
sc.frame_step = 2 if spec.get("style", {}).get("twos") and not rng else 1   # «через кадр»: пропуски дублируются при сборке
sc.render.filepath = str(out / "f_")
bpy.ops.render.render(animation=True)
print("SHOT_DONE", sc.frame_start, sc.frame_end)
