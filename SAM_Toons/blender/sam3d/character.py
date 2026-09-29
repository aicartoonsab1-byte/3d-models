"""SAM_Toons · Blender · персонаж-человек на скелете мокапа CMU.

Тело — одна мягкая оболочка (модификатор Skin по костям → сглаживание) с автоматическими весами:
при движении сгибается как резиновое, а не ломается в суставах. Поверх — пальто (свои веса: колышется
вслед за ногами), большая мультяшная голова с глазами, бровями, ртом (липсинк) и морганием, волосы,
гогглы, рюкзак, камера в руке.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

from . import mocap
from .look import PAL, toon

# радиусы оболочки у суставов (метры, рост ≈ 1.75)
R = {"pelvis": 0.15, "belly": 0.155, "chest": 0.16, "neck": 0.055, "shoulder": 0.062, "elbow": 0.048, "wrist": 0.038,
     "hand": 0.046, "thigh": 0.088, "knee": 0.062, "ankle": 0.046, "foot": 0.055, "toe": 0.045}


def _obj(name, mesh):
    o = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(o); return o


def _active(o):
    for x in bpy.context.selected_objects:
        x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o


def _parent_bone(obj, rig, bone):
    """Прикрепить объект к кости, сохранив положение (как Ctrl+P → Bone)."""
    bpy.context.view_layer.update()              # у только что созданного объекта matrix_world ещё не посчитана
    mw = obj.matrix_world.copy()
    obj.parent = rig; obj.parent_type = "BONE"; obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = mw


def _sphere(name, center, r, mat, scale=(1, 1, 1), seg=24):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    bm.to_mesh(me); bm.free()
    o = _obj(name, me); o.location = center; o.scale = scale
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def skin_mesh(name, verts, edges, radii, root_index=0):
    """Оболочка по «проволочному скелету»: вершины + рёбра + радиусы → Skin → Subsurf (применяются)."""
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], edges, [])
    o = _obj(name, me)
    o.modifiers.new("skin", "SKIN")
    for i, r in enumerate(radii):
        o.data.skin_vertices[0].data[i].radius = (r, r)
    o.data.skin_vertices[0].data[root_index].use_root = True
    sub = o.modifiers.new("sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
    _active(o)
    bpy.ops.object.modifier_apply(modifier="skin")
    bpy.ops.object.modifier_apply(modifier="sub")
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def _nearest_bone(p, segs):
    best, bd = None, 1e9
    for name, a, b in segs:
        ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
        d = (a + ab * t - p).length
        if d < bd:
            best, bd = name, d
    return best


def build_human(name: str, mocap_dir: Path, fps: int, spec: dict) -> dict:
    """Создать персонажа. Возвращает {'rig', 'mouth', 'eyes', 'forward'}."""
    base = spec.get("base_clip", "93_07")
    bpy.ops.import_anim.bvh(filepath=str(mocap_dir / f"{base}.bvh"), global_scale=mocap.UNIT, use_fps_scale=True,
                            update_scene_fps=False, update_scene_duration=False, rotate_mode="QUATERNION")
    rig = bpy.context.object; rig.name = name
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    B = rig.data.bones
    h = lambda b: B[b].head_local.copy()
    t = lambda b: B[b].tail_local.copy()
    up = Vector((0, 0, 1))
    right = (h("RightUpLeg") - h("LeftUpLeg")); right.z = 0; right.normalize()
    fwd = up.cross(right).normalized()

    # --- «проволочный скелет» тела
    V, E, RR = [], [], []
    def add(p, r):
        V.append(p); RR.append(r); return len(V) - 1
    hips = add(h("Hips") + up * 0.02, R["pelvis"])
    belly = add(h("Spine") , R["belly"])
    chest = add(t("Spine1") - up * 0.06, R["chest"])
    neck = add(h("Neck1") + up * 0.02, R["neck"])
    E += [(hips, belly), (belly, chest), (chest, neck)]
    for s in ("Left", "Right"):
        th = add(h(f"{s}UpLeg"), R["thigh"]); kn = add(h(f"{s}Leg"), R["knee"]); an = add(h(f"{s}Foot"), R["ankle"])
        toe = add(h(f"{s}ToeBase") + fwd * 0.02, R["foot"]); tip = add(t(f"{s}ToeBase"), R["toe"])
        E += [(hips, th), (th, kn), (kn, an), (an, toe), (toe, tip)]
        sh = add(h(f"{s}Arm"), R["shoulder"]); el = add(h(f"{s}ForeArm"), R["elbow"]); wr = add(h(f"{s}Hand"), R["wrist"])
        hd = add(t(f"{s}Hand") + (t(f"{s}Hand") - h(f"{s}Hand")).normalized() * 0.03, R["hand"])
        E += [(chest, sh), (sh, el), (el, wr), (wr, hd)]
    body = skin_mesh(f"{name}_body", V, E, RR, hips)

    # материалы по «ближайшей кости»: ноги — брюки, стопы — ботинки, кисти и шея — кожа, остальное — пальто
    segs = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in B if b.length > 1e-4]
    mats = {"coat": toon(f"{name}_coat", PAL["ochre"], PAL["ochre_dk"]), "pants": toon(f"{name}_pants", PAL["navy"]),
            "boot": toon(f"{name}_boot", PAL["boot"]), "skin": toon(f"{name}_skin", PAL["skin"], PAL["skin_dk"])}
    order = list(mats)
    for m in mats.values():
        body.data.materials.append(m)
    region = lambda bone: ("boot" if "Foot" in bone or "Toe" in bone else "pants" if "Leg" in bone and "Up" not in bone else
                           "pants" if "UpLeg" in bone else "skin" if "Hand" in bone or "Finger" in bone or "Thumb" in bone or "Neck" in bone else "coat")
    for p in body.data.polygons:
        p.material_index = order.index(region(_nearest_bone(p.center, segs)))

    _active(body); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    # --- пальто: расклешённый конус от пояса до колен, веса — вручную (колышется вслед за бёдрами)
    top_z = h("Hips").z + 0.12; bot_z = h("LeftLeg").z + 0.02
    me = bpy.data.meshes.new(f"{name}_coat"); bm = bmesh.new()
    rings, seg = 6, 28
    cc = (h("Hips") + h("Spine")) * 0.5
    vs = []
    for i in range(rings + 1):
        u = i / rings; z = top_z + (bot_z - top_z) * u; r = 0.175 + 0.1 * u ** 1.3
        ring = []
        for j in range(seg):
            a = j / seg * math.tau
            ring.append(bm.verts.new((cc.x + math.cos(a) * r, cc.y + math.sin(a) * r * 0.85, z)))
        vs.append(ring)
    for i in range(rings):
        for j in range(seg):
            bm.faces.new((vs[i][j], vs[i][(j + 1) % seg], vs[i + 1][(j + 1) % seg], vs[i + 1][j]))
    bm.to_mesh(me); bm.free()
    coat = _obj(f"{name}_coatskirt", me); coat.data.materials.append(mats["coat"])
    sol = coat.modifiers.new("thick", "SOLIDIFY"); sol.thickness = 0.012
    for p in coat.data.polygons:
        p.use_smooth = True
    gH = coat.vertex_groups.new(name="Hips"); gL = coat.vertex_groups.new(name="LeftUpLeg"); gR = coat.vertex_groups.new(name="RightUpLeg")
    for v in coat.data.vertices:
        u = (top_z - v.co.z) / max(1e-6, top_z - bot_z)
        side = (v.co - cc).dot(right) / 0.25            # −1 левый бок … +1 правый
        leg = min(0.75, u * 0.9)
        wl = leg * max(0.0, min(1.0, 0.5 - side * 0.8)); wr = leg * max(0.0, min(1.0, 0.5 + side * 0.8))
        gH.add([v.index], max(0.0, 1 - wl - wr), "REPLACE"); gL.add([v.index], wl, "REPLACE"); gR.add([v.index], wr, "REPLACE")
    coat.parent = rig; am = coat.modifiers.new("arm", "ARMATURE"); am.object = rig
    coat.modifiers.move(len(coat.modifiers) - 1, 0)

    # --- голова: крупная (мультяшные пропорции), лицо смотрит «вперёд» скелета
    hc = h("Head") + up * 0.13 + fwd * 0.02
    head = _sphere(f"{name}_head", hc, 0.155, mats["skin"], (1, 1, 1.08))
    parts = [head]
    hair_m = toon(f"{name}_hair", PAL["hair"], (0.05, 0.05, 0.07))
    hair = _sphere(f"{name}_hair", hc + up * 0.05 - fwd * 0.02, 0.162, hair_m, (1.02, 1.02, 0.8)); parts.append(hair)
    # срезаем нижнюю половину «шапки» волос, чтобы открыть лицо
    bm = bmesh.new(); bm.from_mesh(hair.data)
    kill = [v for v in bm.verts if v.co.z < -0.02 or (v.co.dot(fwd) > 0.08 and v.co.z < 0.07)]
    bmesh.ops.delete(bm, geom=kill, context="VERTS"); bm.to_mesh(hair.data); bm.free()
    sol = hair.modifiers.new("thick", "SOLIDIFY"); sol.thickness = 0.02
    white = toon(f"{name}_eyewhite", PAL["white"], (0.75, 0.75, 0.72)); black = toon(f"{name}_pupil", PAL["black"], PAL["black"])
    eyes = []
    for sgn in (-1, 1):
        ec = hc + fwd * 0.122 + right * (0.062 * sgn) + up * 0.012
        e = _sphere(f"{name}_eye{sgn}", ec, 0.046, white, (1, 0.7, 1.3), 16); parts.append(e); eyes.append(e)
        pu = _sphere(f"{name}_pupil{sgn}", ec + fwd * 0.032, 0.022, black, (1, 0.6, 1.3), 12); parts.append(pu); eyes.append(pu)
        brow = _sphere(f"{name}_brow{sgn}", ec + up * 0.075 + fwd * 0.012, 0.036, hair_m, (1.0, 0.4, 0.26), 12)
        brow.rotation_euler = (0, math.radians(8 * sgn), math.atan2(right.y, right.x)); parts.append(brow)
    mouth = _sphere(f"{name}_mouth", hc + fwd * 0.142 - up * 0.07, 0.03, toon(f"{name}_mouthm", (0.23, 0.1, 0.1), (0.15, 0.06, 0.06)), (1.0, 0.5, 0.25), 12)
    parts.append(mouth)
    nose = _sphere(f"{name}_nose", hc + fwd * 0.155 - up * 0.02, 0.022, mats["skin"], (1, 1, 1), 12); parts.append(nose)
    # гогглы на лбу
    gog_m = toon(f"{name}_goggle", (0.37, 0.54, 0.59), (0.2, 0.3, 0.34))
    for sgn in (-1, 1):
        g = _sphere(f"{name}_gog{sgn}", hc + fwd * 0.115 + right * (0.058 * sgn) + up * 0.105, 0.036, gog_m, (1, 0.6, 1), 14)
        parts.append(g)
    for p in parts:
        _parent_bone(p, rig, "Head")
    # рюкзак и камера
    pack = _sphere(f"{name}_pack", h("Spine1") - fwd * 0.2, 0.15, toon(f"{name}_packm", PAL["grey"], (0.2, 0.23, 0.26)), (1.1, 0.55, 1.3), 12)
    _parent_bone(pack, rig, "Spine1")
    out = {"rig": rig, "mouth": mouth, "eyes": eyes, "forward": fwd, "head": head}
    if spec.get("hold") == "camera":
        cam_m = toon(f"{name}_cam", (0.1, 0.11, 0.14), (0.05, 0.05, 0.07))
        me = bpy.data.meshes.new(f"{name}_vcam"); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
        vc = _obj(f"{name}_vcam", me); vc.scale = (0.1, 0.05, 0.07); vc.location = t("LeftHand"); vc.data.materials.append(cam_m)
        _parent_bone(vc, rig, "LeftHand")
    return out


def lipsync(mouth, lines: list[dict], fps: int):
    """Рот по громкости реплик: lines = [{t0, env: [0..1 на кадр]}]."""
    base = mouth.scale.copy()
    mouth.keyframe_insert("scale", frame=1)
    for ln in lines:
        f0 = int(ln["t0"] * fps) + 1
        for i, v in enumerate(ln["env"]):
            mouth.scale = (base.x * (1 + 0.15 * v), base.y, base.z * (1 + 3.2 * v))
            mouth.keyframe_insert("scale", frame=f0 + i)
        mouth.scale = base; mouth.keyframe_insert("scale", frame=f0 + len(ln["env"]) + 1)


def blinks(eyes, frames: int, fps: int, seed: int = 3):
    import random
    r = random.Random(seed); f = int(fps * (1 + r.random() * 2))
    base = [e.scale.copy() for e in eyes]
    for e in eyes:
        e.keyframe_insert("scale", frame=1)
    while f < frames:
        for e, b in zip(eyes, base):
            e.scale = b; e.keyframe_insert("scale", frame=f)
            e.scale = (b.x, b.y, b.z * 0.08); e.keyframe_insert("scale", frame=f + 2)
            e.scale = b; e.keyframe_insert("scale", frame=f + 4)
        f += int(fps * (2.2 + r.random() * 2.5))
