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


# ---------------------------------------------------------------- «фасолина» (стиль mult, как в референсе-мульте)
BEAN_K = {"UpLeg": 0.55, "Leg": 0.55, "Foot": 0.7, "ToeBase": 0.6, "Arm": 0.8, "ForeArm": 0.8, "Hand": 0.8,
          "LowerBack": 0.75, "Spine": 0.75, "Spine1": 0.75, "Neck": 0.5, "Neck1": 0.5, "Head": 0.5, "Shoulder": 0.8}


def _bean_k(name: str) -> float:
    for suffix in sorted(BEAN_K, key=len, reverse=True):
        if name.endswith(suffix) or name == suffix:
            return BEAN_K[suffix]
    return 1.0


def stylize_skeleton(rig, kfun=_bean_k):
    """Укоротить кости (ноги, руки, спину), не меняя их направлений: движения мокапа остаются верными,
    а пропорции становятся мультяшными — короткие ножки, большая голова."""
    _active(rig); bpy.ops.object.mode_set(mode="EDIT")
    eb = rig.data.edit_bones
    orig = {b.name: (b.head.copy(), b.tail.copy()) for b in eb}
    new_head = {}
    def place(b):
        oh, ot = orig[b.name]
        if b.parent is None:
            nh = oh.copy()
        else:
            ph = orig[b.parent.name][0]
            nh = new_head[b.parent.name] + (oh - ph) * kfun(b.parent.name)
        new_head[b.name] = nh
        for ch in b.children:
            place(ch)
    for b in eb:
        if b.parent is None:
            place(b)
    for b in eb:
        oh, ot = orig[b.name]
        b.head = new_head[b.name]; b.tail = new_head[b.name] + (ot - oh) * kfun(b.name)
    bpy.ops.object.mode_set(mode="OBJECT")


def build_bean(name: str, mocap_dir: Path, fps: int, spec: dict) -> dict:
    base = spec.get("base_clip", "93_07")
    bpy.ops.import_anim.bvh(filepath=str(mocap_dir / f"{base}.bvh"), global_scale=mocap.UNIT, use_fps_scale=True,
                            update_scene_fps=False, update_scene_duration=False, rotate_mode="QUATERNION")
    rig = bpy.context.object; rig.name = name
    rig.animation_data.action = None
    stylize_skeleton(rig)
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    B = rig.data.bones
    h = lambda b: B[b].head_local.copy(); t = lambda b: B[b].tail_local.copy()
    up = Vector((0, 0, 1))
    right = (h("RightUpLeg") - h("LeftUpLeg")); right.z = 0; right.normalize()
    fwd = up.cross(right).normalized()
    s = spec.get("size", 1.0)
    V, E, RR = [], [], []
    def add(p, r):
        V.append(p); RR.append(r * s); return len(V) - 1
    hips = add(h("Hips") + up * 0.03, 0.2); belly = add(h("Spine"), 0.2); chest = add(t("Spine1") - up * 0.04, 0.16); neck = add(h("Neck1"), 0.1)
    E += [(hips, belly), (belly, chest), (chest, neck)]
    for sd in ("Left", "Right"):
        th = add(h(f"{sd}UpLeg"), 0.105); kn = add(h(f"{sd}Leg"), 0.095); an = add(h(f"{sd}Foot"), 0.09)
        toe = add(h(f"{sd}ToeBase") + fwd * 0.02, 0.09)
        E += [(hips, th), (th, kn), (kn, an), (an, toe)]
        sh = add(h(f"{sd}Arm"), 0.075); el = add(h(f"{sd}ForeArm"), 0.068); wr = add(h(f"{sd}Hand"), 0.064)
        hd = add(t(f"{sd}Hand"), 0.07)
        E += [(chest, sh), (sh, el), (el, wr), (wr, hd)]
    body = skin_mesh(f"{name}_body", V, E, RR, hips)
    red = spec.get("red", [])
    body.data.materials.append(toon(f"{name}_body{'_accent' if 'shirt' in red else ''}", PAL["white"]))
    _active(body); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    # голова: большая, почти шар; лицо — точки и чёрточка
    foot_z = min(h("LeftToeBase").z, h("LeftFoot").z) - 0.09 * s
    body_h = h("Neck1").z - foot_z
    r = 0.44 * body_h * spec.get("head", 1.0)
    hc = h("Neck1") + up * r * 0.82
    head = _sphere(f"{name}_head", hc, r, toon(f"{name}_skin", PAL["white"]), (1, 1, 1.02), 32)
    parts = [head]
    on = lambda d: hc + d.normalized() * r * 0.985          # точка на поверхности головы в направлении d
    ink = toon(f"{name}_pupil", PAL["ink"])
    eyes = []
    for sgn in (-1, 1):
        e = _sphere(f"{name}_eye{sgn}", on(fwd + right * 0.3 * sgn + up * 0.06), r * 0.045, ink, (1, 0.5, 1.25), 10)
        parts.append(e); eyes.append(e)
    mouth = _sphere(f"{name}_mouth", on(fwd - up * 0.3), r * 0.1, toon(f"{name}_mouth", PAL["ink"]), (1, 0.3, 0.18), 12)
    parts.append(mouth)
    if spec.get("hair", "tuft") == "tuft":
        tm = toon(f"{name}_tuft", PAL["ink"])
        for dx in (-0.12, 0.0, 0.12):
            base_ = on(up + fwd * 0.1 + right * dx); tip = base_ + (up + right * dx * 1.5 - fwd * 0.1).normalized() * r * 0.22
            o = skin_mesh(f"{name}_tuft", [tuple(base_), tuple(tip)], [(0, 1)], [r * 0.018, r * 0.01]); o.data.materials.append(tm); parts.append(o)
    for p in parts:
        _parent_bone(p, rig, "Head")
    if "scarf" in red:   # красный шарф — акцент
        import bmesh as _bm
        me = bpy.data.meshes.new(f"{name}_scarf"); bm = _bm.new()
        _bm.ops.create_circle(bm, cap_ends=False, segments=24, radius=0.14 * s); bm.to_mesh(me); bm.free()
        sc = _obj(f"{name}_scarf", me); sc.location = h("Neck1") - up * 0.02
        sk = sc.modifiers.new("sk", "SKIN")
        for v in sc.data.skin_vertices[0].data:
            v.radius = (0.035 * s, 0.035 * s)
        sc.data.materials.append(toon(f"{name}_scarf", PAL["white"]))
        tail = skin_mesh(f"{name}_scarftail", [tuple(h("Neck1") + fwd * 0.12 + right * 0.06), tuple(h("Neck1") + fwd * 0.16 + right * 0.1 - up * 0.2)], [(0, 1)], [0.035 * s, 0.03 * s])
        tail.data.materials.append(toon(f"{name}_scarf", PAL["white"]))
        _parent_bone(sc, rig, "Neck"); _parent_bone(tail, rig, "Neck")
    if spec.get("hold") == "camera":
        me = bpy.data.meshes.new(f"{name}_vcam"); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.to_mesh(me); bm.free()
        vc = _obj(f"{name}_vcam", me); vc.scale = (0.11, 0.06, 0.08); vc.location = t("LeftHand"); vc.data.materials.append(toon(f"{name}_vcamm", PAL["white"]))
        lens = _sphere(f"{name}_lens_accent", t("LeftHand") + fwd * 0.035, 0.018, toon(f"{name}_lens_accent", PAL["white"]), (1, 1, 1), 10)
        _parent_bone(vc, rig, "LeftHand"); _parent_bone(lens, rig, "LeftHand")
    return {"rig": rig, "mouth": mouth, "eyes": eyes, "forward": fwd, "head": head}


def build_claw(b: dict, side: str = "Right", s: float = 1.6):
    """Клешня богомола на месте кисти (сначала невидима, scale=0): толстое бедро с шипами + загнутая голень-крюк."""
    rig = b["rig"]; B = rig.data.bones
    wr = B[f"{side}Hand"].head_local.copy(); d = (B[f"{side}Hand"].tail_local - B[f"{side}ForeArm"].head_local).normalized()
    up = Vector((0, 0, 1)); side_v = d.cross(up).normalized()
    L = 0.32 * s
    p0 = wr - d * 0.02; p1 = wr + d * L * 0.6 + up * 0.04; p2 = wr + d * L
    hook = [p2, p2 + up * 0.1 * s - d * 0.05 * s, p2 + up * 0.08 * s - d * 0.22 * s]
    V = [p0, p1, p2] + hook[1:]; E = [(0, 1), (1, 2), (2, 3), (3, 4)]; RR = [0.06 * s, 0.075 * s, 0.05 * s, 0.035 * s, 0.015 * s]
    # шипы по нижнему краю
    for i in range(4):
        base = p0.lerp(p2, 0.2 + i * 0.2); V += [base - up * 0.05 * s, base - up * 0.12 * s + d * 0.03 * s]
        n = len(V); E += [(1 if i < 2 else 2, n - 2), (n - 2, n - 1)]; RR += [0.018 * s, 0.006 * s]
    claw = skin_mesh(f"{rig.name}_claw", V, E, RR)
    claw.data.materials.append(toon(f"{rig.name}_claw_mantis", PAL["green"], PAL["green_dk"]))
    # пивот в запястье, чтобы клешня «вырастала» из руки
    bpy.context.view_layer.update()
    _active(claw); bpy.context.scene.cursor.location = wr
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    _parent_bone(claw, rig, f"{side}ForeArm")
    claw.scale = (0.001, 0.001, 0.001)
    b["claw"] = claw
    return claw


def arm_morph(b: dict, keys: list[dict], fps: int, side: str = "Right"):
    """Превращение руки: keys=[{"t", "swell": 0..1, "claw": 0..1}].
    swell — предплечье и кисть раздуваются (кости масштабируются, оболочка тянется за ними);
    claw — кисть исчезает, из запястья «выскакивает» клешня (с небольшим перелётом масштаба — «хлопок»)."""
    rig = b["rig"]; pb = rig.pose.bones
    fa, hd = pb[f"{side}ForeArm"], pb[f"{side}Hand"]
    claw = b.get("claw") or build_claw(b, side)
    for k in keys:
        f = k["t"] * fps + 1; sw = k.get("swell", 0.0); cl = k.get("claw", 0.0)
        g = 1 + 1.3 * sw * (1 - cl)
        fa.scale = (g, 1 + 0.15 * sw * (1 - cl), g); fa.keyframe_insert("scale", frame=f)
        hs = (1 + 1.6 * sw) * (1 - cl) + 0.001
        hd.scale = (hs, hs, hs); hd.keyframe_insert("scale", frame=f)
        c = max(0.001, cl)
        claw.scale = (c, c, c); claw.keyframe_insert("scale", frame=f)
    for fc in claw.animation_data.action.fcurves:          # клешня выскакивает с перелётом — «хлопок»
        for kp in fc.keyframe_points:
            kp.interpolation = "BACK"
