"""SAM_Toons · Blender · капибара-кенгуру: перед — капибара, зад и ноги — кенгуру, половина морды — богомол.

Скелет строится кодом, тело — мягкая оболочка с автоматическими весами. Прыжки анимированы по принципам
анимации: подготовка (присед) → толчок с вытягиванием → дуга полёта → приземление со сжатием; хвост и
голова запаздывают (перекрытие действия), тело наклоняется по траектории."""
from __future__ import annotations

import math

import bpy
import bmesh
from mathutils import Euler, Vector

from .character import _active, _obj, _parent_bone, _sphere, skin_mesh
from .look import PAL, toon


def build_capykanga(name="capy", s=1.0):
    arm = bpy.data.armatures.new(name); rig = _obj(name, arm) if False else bpy.data.objects.new(name, arm)
    bpy.context.collection.objects.link(rig); _active(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    def bone(n, h, t, parent=None):
        b = eb.new(n); b.head = Vector(h) * s; b.tail = Vector(t) * s
        if parent:
            b.parent = eb[parent]
        return n
    bone("root", (0, 0, 0), (0, 0, 0.3))
    bone("body", (-0.35, 0, 0.62), (0.3, 0, 0.66), "root")
    bone("neck", (0.3, 0, 0.66), (0.48, 0, 0.78), "body")
    bone("head", (0.48, 0, 0.78), (0.78, 0, 0.74), "neck")
    for i, (h, t) in enumerate([((-0.4, 0, 0.58), (-0.7, 0, 0.45)), ((-0.7, 0, 0.45), (-0.98, 0, 0.3)), ((-0.98, 0, 0.3), (-1.25, 0, 0.2))]):
        bone(f"tail{i}", h, t, "body" if i == 0 else f"tail{i - 1}")
    for sd, y in (("L", 0.12), ("R", -0.12)):
        bone(f"thigh{sd}", (-0.25, y, 0.55), (-0.05, y, 0.32), "body")
        bone(f"shin{sd}", (-0.05, y, 0.32), (-0.3, y, 0.12), f"thigh{sd}")
        bone(f"foot{sd}", (-0.3, y, 0.12), (0.12, y, 0.02), f"shin{sd}")
        bone(f"arm{sd}", (0.25, y * 0.8, 0.5), (0.3, y * 0.8, 0.18), "body")
    bpy.ops.object.mode_set(mode="OBJECT")
    B = rig.data.bones
    P = lambda n, w="head": (B[n].head_local if w == "head" else B[n].tail_local).copy()
    V, E, RR = [], [], []
    def add(p, r):
        V.append(p); RR.append(r * s); return len(V) - 1
    rear = add(P("body"), 0.3); mid = add((P("body") + P("body", "tail")) / 2 + Vector((0, 0, 0.02)), 0.3); chest = add(P("body", "tail"), 0.24)
    nk = add(P("neck", "tail"), 0.14)
    E += [(rear, mid), (mid, chest), (chest, nk)]
    prev = rear
    for i, r in enumerate((0.12, 0.09, 0.06)):
        v = add(P(f"tail{i}", "tail"), r); E.append((prev, v)); prev = v
    for sd in "LR":
        th = add(P(f"thigh{sd}") + Vector((0, 0, 0.02)), 0.17); kn = add(P(f"shin{sd}"), 0.08); an = add(P(f"foot{sd}"), 0.05); toe = add(P(f"foot{sd}", "tail"), 0.035)
        E += [(rear, th), (th, kn), (kn, an), (an, toe)]
        a0 = add(P(f"arm{sd}"), 0.06); a1 = add(P(f"arm{sd}", "tail"), 0.04); E += [(chest, a0), (a0, a1)]
    body = skin_mesh(f"{name}_body", V, E, RR, rear)
    fur = toon(f"{name}_fur", PAL["brown"], PAL["brown_dk"]); body.data.materials.append(fur)
    _active(body); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    # голова: левая половина (со стороны +Y, при беге от зрителя скрыта) — богомол
    hc = (P("head") + P("head", "tail")) / 2
    head = _sphere(f"{name}_head", hc, 0.2 * s, fur, (1.35, 1, 0.95), 24)
    mant = toon(f"{name}_mantis", PAL["green"], PAL["green_dk"]); head.data.materials.append(mant)
    for p in head.data.polygons:
        if p.center.y > 0.01:
            p.material_index = 1
    parts = [head]
    snout = _sphere(f"{name}_snout", hc + Vector((0.2, -0.05, -0.04)) * s, 0.12 * s, fur, (1.2, 0.8, 0.9), 16); parts.append(snout)
    black = toon("pupil_blk", PAL["black"], PAL["black"])
    parts.append(_sphere(f"{name}_eyeR", hc + Vector((0.12, -0.17, 0.06)) * s, 0.03 * s, black, (1, 1, 1), 10))
    parts.append(_sphere(f"{name}_earR", hc + Vector((-0.1, -0.12, 0.17)) * s, 0.05 * s, fur, (1, 0.6, 1), 10))
    parts.append(_sphere(f"{name}_nose", hc + Vector((0.34, -0.06, 0.0)) * s, 0.03 * s, black, (1, 1.3, 0.8), 10))
    glow = toon(f"{name}_compound", PAL["glow"], emit=2.5)
    eye = _sphere(f"{name}_eyeM", hc + Vector((0.08, 0.17, 0.08)) * s, 0.1 * s, glow, (1, 1, 1.2), 16); parts.append(eye)
    parts.append(_sphere(f"{name}_pupilM", hc + Vector((0.1, 0.26, 0.08)) * s, 0.03 * s, black, (1, 1, 1), 10))
    for dx in (0.0, 0.08):
        a = skin_mesh(f"{name}_ant", [tuple(hc + Vector((dx - 0.05, 0.08, 0.17)) * s), tuple(hc + Vector((dx - 0.2, 0.2, 0.45)) * s), tuple(hc + Vector((dx - 0.45, 0.25, 0.55)) * s)],
                      [(0, 1), (1, 2)], [0.012 * s, 0.009 * s, 0.005 * s])
        a.data.materials.append(mant); parts.append(a)
    mand = skin_mesh(f"{name}_mand", [tuple(hc + Vector((0.22, 0.08, -0.1)) * s), tuple(hc + Vector((0.32, 0.14, -0.2)) * s)], [(0, 1)], [0.03 * s, 0.012 * s])
    mand.data.materials.append(toon("mand", PAL["green_dk"])); parts.append(mand)
    for p in parts:
        _parent_bone(p, rig, "head")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    return rig


def hop_path(rig, x0, x1, y, t0, t1, fps, hop=0.55, height=0.55, turn_at=None, turn_dur=0.5):
    """Прыжки от x0 к x1. Каждый прыжок: присед → толчок → полёт по дуге → приземление со сжатием."""
    pb = rig.pose.bones
    n = max(1, int((t1 - t0) / hop))
    def K(obj, prop, t, v):
        setattr(obj, prop, v); obj.keyframe_insert(prop, frame=t * fps + 1)
    for i in range(n + 1):
        ts = t0 + i * hop; x = x0 + (x1 - x0) * i / n
        land = ts; crouch = ts + hop * 0.12; take = ts + hop * 0.3; apex = ts + hop * 0.62
        # корень: земля → присед → воздух
        K(rig, "location", land, (x, y, 0.0))
        if i < n:
            xn = x0 + (x1 - x0) * (i + 1) / n
            K(rig, "location", crouch, (x + (xn - x) * 0.05, y, -0.08))
            K(rig, "location", take, (x + (xn - x) * 0.25, y, 0.08))
            K(rig, "location", apex, (x + (xn - x) * 0.6, y, height))
        # тело: наклон вниз при толчке, вверх в полёте; сжатие при приземлении
        body = pb["body"]
        K(body, "rotation_euler", land, Euler((math.radians(8), 0, 0)))
        K(body, "scale", land, (1.08, 1.0, 0.9))
        if i < n:
            K(body, "rotation_euler", crouch, Euler((math.radians(14), 0, 0)))
            K(body, "scale", crouch, (1.1, 1.0, 0.86))
            K(body, "rotation_euler", take, Euler((math.radians(-16), 0, 0)))
            K(body, "scale", take, (0.94, 1.0, 1.1))
            K(body, "rotation_euler", apex, Euler((math.radians(-4), 0, 0)))
            K(body, "scale", apex, (1.0, 1.0, 1.0))
        # ноги: подогнуты при приседе, вытянуты при толчке, поджаты в полёте
        for sd in "LR":
            K(pb[f"thigh{sd}"], "rotation_euler", land, Euler((math.radians(-15), 0, 0)))
            K(pb[f"shin{sd}"], "rotation_euler", land, Euler((math.radians(20), 0, 0)))
            if i < n:
                K(pb[f"thigh{sd}"], "rotation_euler", crouch, Euler((math.radians(-30), 0, 0)))
                K(pb[f"shin{sd}"], "rotation_euler", crouch, Euler((math.radians(35), 0, 0)))
                K(pb[f"thigh{sd}"], "rotation_euler", take, Euler((math.radians(35), 0, 0)))
                K(pb[f"shin{sd}"], "rotation_euler", take, Euler((math.radians(-30), 0, 0)))
                K(pb[f"thigh{sd}"], "rotation_euler", apex, Euler((math.radians(-40), 0, 0)))
                K(pb[f"shin{sd}"], "rotation_euler", apex, Euler((math.radians(40), 0, 0)))
        # хвост запаздывает (перекрытие): поднят после толчка, опущен после приземления
        for j in range(3):
            lag = 0.06 * (j + 1)
            K(pb[f"tail{j}"], "rotation_euler", land + lag, Euler((math.radians(10 + 5 * j), 0, 0)))
            if i < n:
                K(pb[f"tail{j}"], "rotation_euler", take + lag, Euler((math.radians(-14 - 6 * j), 0, 0)))
        K(pb["neck"], "rotation_euler", land + 0.05, Euler((math.radians(10), 0, 0)))
        if i < n:
            K(pb["neck"], "rotation_euler", apex + 0.05, Euler((math.radians(-8), 0, 0)))
    if turn_at is not None:   # остановиться и повернуть морду к зрителю — видна половина-богомол
        head = pb["head"]
        K(head, "rotation_euler", turn_at, Euler((0, 0, 0)))
        K(head, "rotation_euler", turn_at + turn_dur * 0.7, Euler((math.radians(-8), 0, math.radians(-100))))
        K(head, "rotation_euler", turn_at + turn_dur, Euler((math.radians(-4), 0, math.radians(-88))))
    for fc in rig.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"; kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"


# ---------------------------------------------------------------- богомолы (слон, олень, малыш)
def _bones(rig, spec):
    """spec: [(имя, голова, хвост, родитель)] — создать кости в режиме правки."""
    _active(rig); bpy.ops.object.mode_set(mode="EDIT")
    eb = rig.data.edit_bones
    for n, h, t, par in spec:
        b = eb.new(n); b.head = Vector(h); b.tail = Vector(t)
        if par:
            b.parent = eb[par]
    bpy.ops.object.mode_set(mode="OBJECT")


def build_mantis(name="mantis", kind="trunk", s=1.0):
    """Богомол: тонкая грудь, брюшко-листок, треугольная голова с глазищами, хватательные передние лапы,
    четыре ходильные ноги. kind: trunk — хобот и уши слона; deer — оленьи рога и морда; baby — малыш с крыльями."""
    arm = bpy.data.armatures.new(name); rig = bpy.data.objects.new(name, arm); bpy.context.collection.objects.link(rig)
    k = s
    H = 0.9 * k   # высота груди над землёй
    spec = [("root", (0, 0, 0), (0, 0, 0.2 * k), None),
            ("thorax", (-0.1 * k, 0, H), (0.35 * k, 0, H + 0.45 * k), "root"),
            ("abdomen", (-0.1 * k, 0, H), (-0.9 * k, 0, H - 0.1 * k), "root"),
            ("head", (0.35 * k, 0, H + 0.45 * k), (0.55 * k, 0, H + 0.55 * k), "thorax")]
    for sd, y in (("L", 0.12 * k), ("R", -0.12 * k)):
        spec += [(f"raptor{sd}", (0.3 * k, y * 0.6, H + 0.35 * k), (0.5 * k, y, H + 0.05 * k), "thorax"),
                 (f"raptor2{sd}", (0.5 * k, y, H + 0.05 * k), (0.4 * k, y, H + 0.3 * k), f"raptor{sd}")]
        for i, x in enumerate((0.05, -0.15)):
            spec += [(f"leg{i}{sd}", (x * k, y * 0.4, H), (x * k + (0.25 if i == 0 else -0.25) * k, y * 2.2, H * 0.55), "root"),
                     (f"shin{i}{sd}", (x * k + (0.25 if i == 0 else -0.25) * k, y * 2.2, H * 0.55), (x * k + (0.35 if i == 0 else -0.4) * k, y * 2.6, 0.02), f"leg{i}{sd}")]
    if kind == "trunk":
        spec += [("trunk0", (0.55 * k, 0, H + 0.45 * k), (0.72 * k, 0, H + 0.2 * k), "head"),
                 ("trunk1", (0.72 * k, 0, H + 0.2 * k), (0.78 * k, 0, H - 0.1 * k), "trunk0"),
                 ("trunk2", (0.78 * k, 0, H - 0.1 * k), (0.9 * k, 0, H - 0.3 * k), "trunk1")]
    _bones(rig, spec)
    B = rig.data.bones
    P = lambda n, w="head": (B[n].head_local if w == "head" else B[n].tail_local).copy()
    V, E, RR = [], [], []
    def add(p, r):
        V.append(p); RR.append(r * k); return len(V) - 1
    th0 = add(P("thorax"), 0.07); th1 = add(P("thorax", "tail"), 0.05); E.append((th0, th1))
    ab1 = add((P("abdomen") + P("abdomen", "tail")) / 2 + Vector((0, 0, 0.05 * k)), 0.14); ab2 = add(P("abdomen", "tail"), 0.05)
    E += [(th0, ab1), (ab1, ab2)]
    for sd in "LR":
        r0 = add(P(f"raptor{sd}"), 0.04); r1 = add(P(f"raptor{sd}", "tail"), 0.045); r2 = add(P(f"raptor2{sd}", "tail"), 0.02)
        E += [(th1, r0), (r0, r1), (r1, r2)]
        for i in range(2):
            l0 = add(P(f"leg{i}{sd}"), 0.022); l1 = add(P(f"shin{i}{sd}"), 0.018); l2 = add(P(f"shin{i}{sd}", "tail"), 0.012)
            E += [(th0, l0), (l0, l1), (l1, l2)]
    body = skin_mesh(f"{name}_body", V, E, RR, th0)
    body.data.materials.append(toon(f"{name}_mantis_body", PAL["green"], PAL["green_dk"]))
    _active(body); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    # голова: треугольная, с огромными глазами по бокам
    hc = P("head") + Vector((0.08 * k, 0, 0.02 * k))
    head = _sphere(f"{name}_head", hc, 0.1 * k, toon(f"{name}_mantis_head", PAL["green"], PAL["green_dk"]), (1.1, 1.3, 0.9), 18)
    parts = [head]
    eye_r = 0.07 * k * (1.5 if kind == "baby" else 1.0)
    for sd in (-1, 1):
        parts.append(_sphere(f"{name}_eye", hc + Vector((0.02 * k, 0.12 * k * sd, 0.04 * k)), eye_r, toon(f"{name}_eyewhite", PAL["white"]), (1, 1, 1.15), 14))
        parts.append(_sphere(f"{name}_pupil", hc + Vector((0.07 * k, (0.12 * k + eye_r * 0.4) * sd, 0.04 * k)), eye_r * 0.35, toon("pupil_blk", PAL["black"]), (1, 1, 1), 10))
        ant = skin_mesh(f"{name}_ant", [tuple(hc + Vector((0.05 * k, 0.04 * k * sd, 0.08 * k))), tuple(hc + Vector((0.2 * k, 0.15 * k * sd, 0.4 * k))),
                                          tuple(hc + Vector((0.1 * k, 0.3 * k * sd, 0.6 * k)))], [(0, 1), (1, 2)], [0.01 * k, 0.007 * k, 0.004 * k])
        ant.data.materials.append(toon(f"{name}_mantis_ant", PAL["green_dk"])); parts.append(ant)
    if kind == "trunk":
        for sd in (-1, 1):   # слоновьи уши
            parts.append(_sphere(f"{name}_ear", hc + Vector((-0.08 * k, 0.16 * k * sd, 0.02 * k)), 0.16 * k, toon(f"{name}_ear", PAL["grey"]), (0.35, 1, 1.2), 16))
    if kind == "deer":
        horn = toon(f"{name}_antler", PAL["white"])
        for sd in (-1, 1):
            b0 = hc + Vector((-0.02 * k, 0.05 * k * sd, 0.08 * k)); b1 = b0 + Vector((-0.1 * k, 0.15 * k * sd, 0.45 * k)); b2 = b1 + Vector((-0.1 * k, 0.1 * k * sd, 0.3 * k))
            t1 = b1 + Vector((0.15 * k, 0.05 * k * sd, 0.15 * k)); t2 = (b0 + b1) / 2 + Vector((0.14 * k, 0.03 * k * sd, 0.1 * k))
            a = skin_mesh(f"{name}_antler", [tuple(b0), tuple(b1), tuple(b2), tuple(t1), tuple(t2), tuple((b0 + b1) / 2)], [(0, 5), (5, 1), (1, 2), (1, 3), (5, 4)],
                          [0.018 * k, 0.014 * k, 0.008 * k, 0.008 * k, 0.008 * k, 0.016 * k])
            a.data.materials.append(horn); parts.append(a)
        parts.append(_sphere(f"{name}_muzzle", hc + Vector((0.1 * k, 0, -0.05 * k)), 0.06 * k, toon(f"{name}_muzzle", PAL["brown"]), (1.4, 0.8, 0.8), 12))
    for p in parts:
        _parent_bone(p, rig, "head")
    if kind == "trunk":
        tr = skin_mesh(f"{name}_trunk", [tuple(P("trunk0")), tuple(P("trunk1")), tuple(P("trunk2")), tuple(P("trunk2", "tail"))],
                       [(0, 1), (1, 2), (2, 3)], [0.06 * k, 0.05 * k, 0.04 * k, 0.03 * k])
        tr.data.materials.append(toon(f"{name}_trunkm", PAL["grey"]))
        _active(tr); rig.select_set(True); bpy.context.view_layer.objects.active = rig
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    if kind == "baby":
        wing = toon(f"{name}_wing", PAL["white"])
        names = []
        for sd in (-1, 1):
            w = _sphere(f"{name}_wing", P("thorax", "tail") + Vector((-0.25 * k, 0.12 * k * sd, 0.1 * k)), 0.3 * k, wing, (1, 0.35, 0.08), 14)
            w.rotation_euler = (math.radians(20 * sd), 0, 0)
            _parent_bone(w, rig, "thorax"); names.append(w.name)
        rig["wings"] = ",".join(names)
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    return rig


def _K(obj, prop, t, v, fps):
    setattr(obj, prop, v); obj.keyframe_insert(prop, frame=t * fps + 1)


def run_path(rig, x0, x1, y, t0, t1, fps, stride=0.28, stop=None, nod=None, trunk=False, z=0.0):
    """Бег по прямой. Ноги ходят крест-накрест (дуги шага), тело подпрыгивает, голова и хобот запаздывают.
    stop=(x, t_stop, t_go) — остановиться; nod=t — кивнуть рогами (вежливо!)."""
    pb = rig.pose.bones
    direction = 1 if x1 > x0 else -1
    rig.rotation_euler = (0, 0, 0 if direction > 0 else math.pi)
    path = [(t0, x0)]
    if stop:
        sx, ts, tg = stop; path += [(ts, sx), (tg, sx)]
    path.append((t1, x1))
    for t, x in path:
        _K(rig, "location", t, (x, y, z), fps)
    # шаговый цикл
    t = t0; step = stride
    i = 0
    while t < t1:
        moving = not (stop and stop[1] <= t < stop[2])
        amp = 1.0 if moving else 0.0
        for n, (leg, ph) in enumerate((("leg0L", 0), ("leg1R", 0), ("leg0R", 1), ("leg1L", 1))):
            a = (1 if (i + ph) % 2 == 0 else -1) * math.radians(28) * amp
            _K(pb[leg], "rotation_euler", t, Euler((a, 0, 0)), fps)
        _K(pb["thorax"], "rotation_euler", t, Euler((math.radians(4 * (1 if i % 2 else -1)) * amp, 0, 0)), fps)
        _K(pb["root"], "location", t, (0, 0, 0.03 * amp if i % 2 else 0), fps)
        _K(pb["head"], "rotation_euler", t + step * 0.3, Euler((math.radians(6 * (1 if i % 2 else -1)) * amp, 0, 0)), fps)
        if trunk:
            for j in range(3):
                _K(pb[f"trunk{j}"], "rotation_euler", t + 0.05 * (j + 1), Euler((math.radians(18 * (1 if (i + j) % 2 else -1)), 0, 0)), fps)
        t += step; i += 1
    if nod is not None:
        for dt, a in ((0, 0), (0.25, 30), (0.5, -5), (0.75, 25), (1.0, 0)):
            _K(pb["head"], "rotation_euler", nod + dt, Euler((math.radians(a), 0, 0)), fps)
    _smooth(rig)


def _smooth(obj):
    ad = obj.animation_data
    if ad and ad.action:
        for fc in ad.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"; kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"


def fly_to(rig, keys, fps, target=None, land=None, leave=None):
    """Полёт малыша: keys=[(t, (x,y,z))]; крылья трепещут в полёте. target=(rig, кость): с land по leave
    сидит на этой кости (например, на руке Бориса) — плавная «посадка» через Copy Location."""
    for t, p in keys:
        _K(rig, "location", t, p, fps)
    wings = [bpy.data.objects[n] for n in rig.get("wings", "").split(",") if n]
    t_end = keys[-1][0]; t = keys[0][0]; i = 0
    while t <= t_end:
        sitting = land is not None and land <= t < (leave or 1e9)
        for w in wings:
            _K(w, "scale", t, (1, 0.35, 0.08) if (i % 2 or sitting) else (1, 0.35, 0.02), fps)
        t += 1 / fps * 2; i += 1
    if target and land is not None:
        c = rig.constraints.new("COPY_LOCATION"); c.target = target[0]; c.subtarget = target[1]
        c.influence = 0; c.keyframe_insert("influence", frame=(land - 0.25) * fps + 1)
        c.influence = 1; c.keyframe_insert("influence", frame=land * fps + 1)
        if leave:
            c.keyframe_insert("influence", frame=leave * fps + 1)
            c.influence = 0; c.keyframe_insert("influence", frame=(leave + 0.3) * fps + 1)
    _smooth(rig)


# ---------------------------------------------------------------- цветок, который поворачивается (и обижается)
def build_flower(name, x, y, h=1.1, s=1.0):
    stem = skin_mesh(f"{name}_stem", [(x, y, 0), (x + 0.05, y, h * 0.5), (x, y, h)], [(0, 1), (1, 2)], [0.025 * s, 0.02 * s, 0.018 * s])
    stem.data.materials.append(toon(f"{name}_stemm", PAL["green_dk"]))
    pivot = bpy.data.objects.new(f"{name}_pivot", None); bpy.context.collection.objects.link(pivot); pivot.location = (x, y, h)
    white = toon(f"{name}_petal", PAL["white"])
    core = _sphere(f"{name}_core", (x, y - 0.03, h + 0.02), 0.11 * s, toon(f"{name}_bulb", PAL["glow"], emit=1.2), (1, 0.45, 1), 18)
    parts = [core]
    for i in range(7):   # лепестки веером вокруг сердцевины, в плоскости «лица» цветка
        a = i / 7 * math.tau + 0.3
        p = _sphere(f"{name}_pet", (x + math.cos(a) * 0.2 * s, y, h + 0.02 + math.sin(a) * 0.2 * s), 0.1 * s, white, (1.5, 0.25, 0.7), 12)
        p.rotation_euler = (0, -a, 0); parts.append(p)
    for p in parts:
        bpy.context.view_layer.update()
        mw = p.matrix_world.copy(); p.parent = pivot; p.matrix_world = mw
    return pivot


def flower_turn(pivot, keys, fps):
    """keys=[(t, угол_градусы)] — поворот «головы» цветка вокруг стебля (0 — смотрит в камеру)."""
    for t, a in keys:
        _K(pivot, "rotation_euler", t, Euler((0, 0, math.radians(a))), fps)
    _smooth(pivot)
