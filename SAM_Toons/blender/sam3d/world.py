"""SAM_Toons · Blender · болото: земля с кочками, лужи, камыши, светящиеся растения, болотные деревья
с мхом и светящимися плодами, дальние холмы (воздушная перспектива), луны, камера и свет."""
from __future__ import annotations

import math
import random

import bpy
import bmesh
from mathutils import Vector

from .character import _obj, _sphere, skin_mesh
from .look import PAL, toon


def ground(size=60, seed=1, flat=False):
    me = bpy.data.meshes.new("ground"); bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=90, y_segments=90, size=size / 2)
    r = random.Random(seed)
    for v in bm.verts:
        x, y = v.co.x, v.co.y
        v.co.z = 0.0 if flat else 0.06 * math.sin(x * 1.3 + r.random()) * math.cos(y * 1.1) + (0.25 * max(0, (y - 6) / 20) ** 2)
    bm.to_mesh(me); bm.free()
    g = _obj("ground", me); g.data.materials.append(toon("ground", PAL["ground"], PAL["ground_dk"]))
    for p in g.data.polygons:
        p.use_smooth = True
    return g


def pool(x, y, w, d):
    me = bpy.data.meshes.new("pool"); bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=36, radius=1)
    bm.to_mesh(me); bm.free()
    o = _obj("pool", me); o.location = (x, y, 0.035); o.scale = (w / 2, d / 2, 1)
    o.data.materials.append(toon("water", PAL["water"], (0.06, 0.13, 0.16)))
    return o


def reeds(x, y, n=9, h=1.2, seed=2):
    r = random.Random(seed); mat = toon("reed", PAL["green_dk"], (0.13, 0.2, 0.08)); head = toon("cattail", PAL["brown_dk"])
    for i in range(n):
        px, py = x + (r.random() - 0.5) * 0.8, y + (r.random() - 0.5) * 0.5
        hh = h * (0.6 + r.random() * 0.6); bend = (r.random() - 0.5) * 0.3
        o = skin_mesh("reed", [(px, py, 0), (px + bend * 0.4, py, hh * 0.5), (px + bend, py, hh)], [(0, 1), (1, 2)], [0.018, 0.014, 0.008])
        o.data.materials.append(mat)
        if i % 3 == 0:
            _sphere("cattail", (px + bend, py, hh + 0.06), 0.035, head, (1, 1, 3.2), 10)


def glow_plant(x, y, n=5, h=0.9, seed=3):
    r = random.Random(seed); stem = toon("stem", PAL["green_dk"]); bulb = toon("bulb", (0.95, 0.85, 0.35), emit=1.4)
    lights = []
    for i in range(n):
        px, py = x + (r.random() - 0.5) * 0.6, y + (r.random() - 0.5) * 0.4
        hh = h * (0.5 + r.random() * 0.7); sway = (r.random() - 0.5) * 0.25
        o = skin_mesh("stem", [(px, py, 0), (px + sway * 0.3, py, hh * 0.5), (px + sway, py, hh)], [(0, 1), (1, 2)], [0.02, 0.016, 0.012])
        o.data.materials.append(stem)
        _sphere("bulb", (px + sway, py, hh + 0.07), 0.07 + r.random() * 0.05, bulb, (1, 1, 1.15), 14)
    L = bpy.data.lights.new("plant_glow", "POINT"); L.energy = 60; L.color = PAL["glow"]; L.shadow_soft_size = 0.4
    lo = bpy.data.objects.new("plant_glow", L); bpy.context.collection.objects.link(lo); lo.location = (x, y, h * 0.9)
    return lo


def swamp_tree(x, y, h=5.0, seed=4, fruit=True):
    r = random.Random(seed)
    trunk_pts = [(x, y, 0), (x + 0.2, y, h * 0.35), (x - 0.15, y, h * 0.7), (x + 0.1, y, h)]
    V, E, RR = list(trunk_pts), [(0, 1), (1, 2), (2, 3)], [0.32, 0.22, 0.15, 0.08]
    tips = []
    for i in range(5):
        k = 0.5 + i * 0.1; base_i = 1 if k < 0.6 else 2
        bx, by, bz = x + (0.2 if base_i == 1 else -0.15), y, h * k
        d = 1 if i % 2 else -1; L = 1.4 + r.random() * 1.2
        V += [(bx, by, bz), (bx + d * L * 0.6, by + (r.random() - 0.5) * 0.4, bz + 0.35), (bx + d * L, by, bz - 0.1)]
        a = len(V) - 3; E += [(base_i, a), (a, a + 1), (a + 1, a + 2)]; RR += [0.1, 0.06, 0.03]
        tips.append(V[a + 1]); tips.append(V[a + 2])
    t = skin_mesh("tree", V, E, RR); t.data.materials.append(toon("bark", PAL["near"], (0.06, 0.1, 0.13)))
    moss = toon("moss", (0.3, 0.43, 0.4), (0.18, 0.27, 0.26)); fr = toon("fruit", (0.95, 0.85, 0.35), emit=1.3)
    for i, (tx, ty, tz) in enumerate(tips):
        for j in range(3):
            mx = tx + (r.random() - 0.5) * 0.4; L = 0.4 + r.random() * 0.9
            o = skin_mesh("moss", [(mx, ty, tz), (mx + 0.03, ty, tz - L)], [(0, 1)], [0.012, 0.006]); o.data.materials.append(moss)
        if fruit and i % 2 == 0:
            _sphere("fruit", (tx, ty, tz - 0.25), 0.07, fr, (1, 1, 1.2), 10)
    return t


def hills(dist=25, color=None, height=3.0, seed=5, width=120):
    me = bpy.data.meshes.new("hills"); bm = bmesh.new(); r = random.Random(seed)
    n = 80; prev = None
    top = []
    for i in range(n + 1):
        x = -width / 2 + width * i / n
        z = height * (0.5 + 0.5 * math.sin(x * 0.11 + seed)) + r.random() * height * 0.25
        a = bm.verts.new((x, dist, -1)); b = bm.verts.new((x, dist, z)); top.append((a, b))
    for i in range(n):
        bm.faces.new((top[i][0], top[i + 1][0], top[i + 1][1], top[i][1]))
    bm.to_mesh(me); bm.free()
    o = _obj("hills", me); c = color or PAL["far"]; o.data.materials.append(toon(f"hill{seed}", c, tuple(v * 0.85 for v in c), emit=1.0))
    return o


def moons():
    m = toon("moon", PAL["moon"], emit=1.1)
    _sphere("moon1", (14, 60, 22), 3.0, m); _sphere("moon2", (22, 62, 18), 1.2, m)


def camera(loc, look_at, lens=32):
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); bpy.context.collection.objects.link(cam)
    cam.data.lens = lens; cam.location = loc; bpy.context.scene.camera = cam
    tgt = bpy.data.objects.new("cam_target", None); bpy.context.collection.objects.link(tgt); tgt.location = look_at
    tc = cam.constraints.new("TRACK_TO"); tc.target = tgt; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"
    return cam, tgt


def key_path(obj, keys, fps, prop="location"):
    """Плавная траектория: keys = [(t, (x, y, z)), ...], Безье с мягким разгоном/торможением."""
    for t, v in keys:
        setattr(obj, prop, v); obj.keyframe_insert(prop, frame=int(round(t * fps)) + 1)
    if obj.animation_data and obj.animation_data.action:
        for fc in obj.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"; kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"


def lights():
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(55), math.radians(10), math.radians(40)); sun.data.energy = 3.5
    sun.data.color = (1.0, 0.86, 0.66)


def speckles(n=1800, x=(-25, 25), y=(-6, 30), seed=11):
    """«Зерно» бумаги как в референсе: тысячи крошечных чёрточек и точек прямо на земле (двигаются вместе с миром)."""
    r = random.Random(seed); me = bpy.data.meshes.new("speckles"); bm = bmesh.new()
    for _ in range(n):
        cx, cy = r.uniform(*x), r.uniform(*y); a = r.uniform(0, math.pi); L = r.uniform(0.01, 0.045); w = 0.005
        dx, dy = math.cos(a) * L, math.sin(a) * L; nx, ny = -math.sin(a) * w, math.cos(a) * w
        vs = [bm.verts.new((cx - dx + nx, cy - dy + ny, 0.012)), bm.verts.new((cx + dx + nx, cy + dy + ny, 0.012)),
              bm.verts.new((cx + dx - nx, cy + dy - ny, 0.012)), bm.verts.new((cx - dx - nx, cy - dy - ny, 0.012))]
        bm.faces.new(vs)
    bm.to_mesh(me); bm.free()
    o = _obj("speckles", me); o.data.materials.append(toon("speck_tuft", PAL["ink"]))
    return o
