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
