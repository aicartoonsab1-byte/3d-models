"""Каталог движений: для каждой записи из models/mocap — лист из кадров с тайм-кодом (Борис, лицом к камере).
Запуск: blender -b --factory-startup -P blender/tools/catalog.py -- [имена записей]
Результат: models/mocap/catalog/<запись>.jpg — по нему выбирают from/to для сегментов."""
import sys, math
from pathlib import Path
import bpy
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "blender"))
from sam3d import character, mocap, look, world

MC = ROOT / "models/mocap"; OUT = MC / "catalog"; OUT.mkdir(exist_ok=True)
names = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sorted(p.stem for p in MC.glob("*.bvh"))
FPS = 25
bpy.ops.wm.read_factory_settings(use_empty=True)
look.render_settings(320, 240, FPS, 1); look.world_sky(); world.lights(); world.ground(20)
b = character.build_human("boris", MC, FPS, {})
cam, tgt = world.camera((0, -4.2, 1.0), (0, 0, 0.85), 30)
sc = bpy.context.scene
for name in names:
    c = mocap.clip(name, MC, FPS)
    mocap.bake(b["rig"], [{"clip": name, "from": 0, "to": c.duration, "face": 0}], MC, FPS, (0, 0))
    n = 12; tiles = []
    for i in range(n):
        t = c.duration * i / (n - 1)
        sc.frame_set(int(t * FPS) + 1)
        # камера следит за персонажем
        hp = b["rig"].matrix_world @ b["rig"].pose.bones["Hips"].head
        tgt.location = (hp.x, hp.y, 0.85); cam.location = (hp.x, hp.y - 4.2, 1.0)
        f = f"/tmp/cat_{name}_{i}.jpg"; sc.render.filepath = f; bpy.ops.render.render(write_still=True); tiles.append((t, f))
    import subprocess, json
    subprocess.run(["python3", "-c", f"""
from PIL import Image, ImageDraw
tiles={json.dumps(tiles)}
W,H=320,240; o=Image.new('RGB',(W*6,H*2),'white'); d=ImageDraw.Draw(o)
for i,(t,f) in enumerate(tiles):
    im=Image.open(f); o.paste(im,((i%6)*W,(i//6)*H)); d.text(((i%6)*W+6,(i//6)*H+6),f'{{t:.1f}} s',fill='black')
o.save('{OUT}/{name}.jpg')
"""], check=False)
    print("CATALOG", name, round(c.duration, 1))
