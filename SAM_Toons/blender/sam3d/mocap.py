"""SAM_Toons · Blender · мокап: склейка записей движений (BVH из базы CMU) в одно действие персонажа.

Персонаж живёт на скелете CMU (31 кость). Сегмент = кусок записи: откуда/докуда в исходнике, когда в фильме,
куда смотрит (face, градусы: 0 — к камере, 90 — вправо по экрану), с какой скоростью. Сегменты стыкуются:
следующий начинается там, где остановился предыдущий (корень «приклеен»), а на стыке позы плавно
перетекают (blend). Всё запекается в одно действие с кватернионами — без рывков и переворотов.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

UNIT = 0.063            # единица BVH базы CMU → метры (рост ≈ 1.75 м)
_clips: dict[str, "Clip"] = {}


class Clip:
    """Запись движения: временный скелет в сцене (скрыт), значения каналов берём из его F-кривых."""

    def __init__(self, path: Path, fps: int):
        bpy.ops.import_anim.bvh(filepath=str(path), global_scale=UNIT, use_fps_scale=True, update_scene_fps=False,
                                update_scene_duration=False, rotate_mode='QUATERNION', frame_start=1)
        self.arm = bpy.context.object
        self.arm.name = f"clip_{path.stem}"
        self.arm.hide_render = True          # не скрываем во вьюпорте: скрытые объекты Blender не пересчитывает
        self.act = self.arm.animation_data.action
        self.fps = fps
        self.frames = self.act.frame_range[1]
        self.curves: dict[tuple[str, str], list] = {}
        for fc in self.act.fcurves:
            bone = fc.data_path.split('"')[1]; prop = fc.data_path.rsplit(".", 1)[1]
            self.curves.setdefault((bone, prop), [None] * 4)[fc.array_index] = fc
        b = self.arm.data.bones
        self.leg = b["LeftUpLeg"].length + b["LeftLeg"].length

    # в базе CMU первый кадр каждой записи — T-поза: время записи отсчитываем после неё
    SKIP = 0.1

    @property
    def duration(self) -> float:
        return (self.frames - 1) / self.fps - self.SKIP

    def rot(self, bone: str, t: float) -> Quaternion:
        fcs = self.curves.get((bone, "rotation_quaternion"))
        if not fcs:
            return Quaternion()
        f = 1 + (t + self.SKIP) * self.fps
        return Quaternion([fc.evaluate(f) for fc in fcs]).normalized()

    def loc(self, t: float) -> Vector:
        fcs = self.curves.get(("Hips", "location"))
        f = 1 + (t + self.SKIP) * self.fps
        return Vector([fc.evaluate(f) for fc in fcs[:3]])

    def world(self, t: float, bone: str) -> Vector:
        """Положение кости в пространстве скелета записи (для курса и опоры)."""
        sc = bpy.context.scene; f = 1 + (t + self.SKIP) * self.fps
        sc.frame_set(int(f), subframe=f - int(f))
        return self.arm.pose.bones[bone].head.copy()

    def heading(self, t: float) -> float:
        """Куда смотрит тело (угол в плоскости XY, радианы): перпендикуляр к линии бёдер."""
        l, r = self.world(t, "LeftUpLeg"), self.world(t, "RightUpLeg")
        right = (r - l); right.z = 0
        fwd = Vector((0, 0, 1)).cross(right)
        return math.atan2(fwd.y, fwd.x)


def clip(name: str, root: Path, fps: int) -> Clip:
    if name not in _clips:
        _clips[name] = Clip(root / f"{name}.bvh", fps)
    return _clips[name]


MOVES = {}


def resolve_move(sg: dict) -> dict:
    """{"move": "vlog", "dur": 3} → {"clip", "from", "to", "hold"} по библиотеке blender/moves.json.
    dur короче куска — берётся начало; длиннее — последняя поза держится (hold)."""
    if "move" not in sg:
        return sg
    if not MOVES:
        import json
        MOVES.update(json.loads((Path(__file__).resolve().parents[1] / "moves.json").read_text(encoding="utf-8")))
    m = MOVES.get(sg["move"])
    if not m:
        raise KeyError(f"нет движения «{sg['move']}» в blender/moves.json")
    out = {**sg, "clip": m["clip"], "from": m["from"] + sg.get("offset", 0.0), "to": m["to"]}
    if "dur" in sg:
        speed = sg.get("speed", 1.0); avail = (m["to"] - out["from"]) / speed
        if sg["dur"] <= avail:
            out["to"] = out["from"] + sg["dur"] * speed
        else:
            out["hold"] = sg["dur"] - avail
    return out


def bake(rig: bpy.types.Object, segments: list[dict], root: Path, fps: int, start_xy=(0.0, 0.0)) -> int:
    """Склеить сегменты в одно действие скелета rig. Возвращает число кадров.

    segment: {"clip": "93_07", "from": 0.2, "to": 1.9, "at": 0.0, "face": 90, "speed": 1.0, "blend": 0.3, "hold": 0}
    face — направление взгляда в сцене: 0 — к камере (−Y), 90 — вправо (+X), −90 — влево, 180 — от камеры.
    hold — сколько секунд держать последнюю позу после конца куска.
    """
    segments = [resolve_move(sg) for sg in segments]
    rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}
    hips_rest = rest["Hips"]; hips_rest_inv = hips_rest.inverted()
    base_leg = rig.data.bones["LeftUpLeg"].length + rig.data.bones["LeftLeg"].length
    anchor = Vector((start_xy[0], start_xy[1], 0))
    plan = []
    for sg in segments:
        c = clip(sg["clip"], root, fps)
        t0, t1 = sg.get("from", 0.0), min(sg.get("to", c.duration), c.duration)
        speed = sg.get("speed", 1.0)
        length = (t1 - t0) / speed + sg.get("hold", 0.0)
        # поворот: курс записи в начале куска → нужное направление (face 0 = к камере, т. е. −Y)
        want = math.radians(-90 + sg.get("face", 0))
        yaw = want - c.heading(t0)
        scale = base_leg / c.leg
        p0 = c.world(t0, "Hips")
        plan.append({**sg, "c": c, "t0": t0, "t1": t1, "speed": speed, "len": length, "yaw": yaw, "scale": scale,
                     "p0": p0, "anchor": anchor.copy(), "at": sg.get("at", plan[-1]["at"] + plan[-1]["len"] if plan else 0.0)})
        # где закончится корень этого куска → начало следующего
        p1 = c.world(t1, "Hips")
        d = (p1 - p0) * scale; d.z = 0
        d.rotate(Matrix.Rotation(yaw, 3, "Z"))
        anchor = anchor + d
    total = max(p["at"] + p["len"] for p in plan)
    n = int(math.ceil(total * fps)) + 1
    bones = [b.name for b in rig.pose.bones]
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"

    def pose_of(p, t):
        c = p["c"]; ts = min(p["t1"], p["t0"] + max(0.0, t - p["at"]) * p["speed"])
        Y = Matrix.Rotation(p["yaw"], 4, "Z")
        # корень: смещение от начала куска, повёрнутое и приклеенное к «якорю»
        hp = c.world(ts, "Hips")
        off = (hp - p["p0"]) * p["scale"]; z = hp.z * p["scale"]; off.z = 0
        off.rotate(Matrix.Rotation(p["yaw"], 3, "Z"))
        target = p["anchor"] + off; target.z = z
        rots = {b: c.rot(b, ts) for b in bones}
        # поворот корня в пространстве скелета: L' = rest⁻¹ · Y · rest · L
        L = Matrix.LocRotScale(Vector((0, 0, 0)), rots["Hips"], None)
        rots["Hips"] = (hips_rest_inv @ Y @ hips_rest @ L).to_quaternion()
        return target, rots

    # действие персонажа (с нуля)
    rig.animation_data_create()
    act = bpy.data.actions.new(f"{rig.name}_perf")
    rig.animation_data.action = act
    fc = {}
    for b in bones:
        fc[(b, "q")] = [act.fcurves.new(f'pose.bones["{b}"].rotation_quaternion', index=i, action_group=b) for i in range(4)]
    fc[("Hips", "l")] = [act.fcurves.new('pose.bones["Hips"].location', index=i, action_group="Hips") for i in range(3)]
    for curves in fc.values():
        for cv in curves:
            cv.keyframe_points.add(n)
    prev = {}
    for f in range(n):
        t = f / fps
        active = [p for p in plan if p["at"] - p.get("blend", 0.3) <= t <= p["at"] + p["len"] + 1e-6] or [min(plan, key=lambda p: abs(p["at"] - t))]
        poses = []
        for p in active:
            w = 1.0 if t >= p["at"] else max(0.0, 1 - (p["at"] - t) / max(1e-3, p.get("blend", 0.3)))
            poses.append((w, *pose_of(p, max(t, p["at"]))))
        # смешать: по очереди slerp к следующему куску
        w0, loc, rots = poses[0]
        for w, l2, r2 in poses[1:]:
            k = w
            loc = loc.lerp(l2, k)
            rots = {b: rots[b].slerp(r2[b], k) for b in bones}
        # корень → в локальные координаты кости Hips
        local = hips_rest_inv @ Matrix.Translation(loc)
        lv = local.to_translation()
        for b in bones:
            q = rots[b]
            if b in prev and prev[b].dot(q) < 0:
                q = -q          # непрерывность кватернионов (без «переворотов»)
            prev[b] = q
            for i in range(4):
                kp = fc[(b, "q")][i].keyframe_points[f]; kp.co = (f + 1, q[i]); kp.interpolation = "LINEAR"
        for i in range(3):
            kp = fc[("Hips", "l")][i].keyframe_points[f]; kp.co = (f + 1, lv[i]); kp.interpolation = "LINEAR"
    for curves in fc.values():
        for cv in curves:
            cv.update()
    return n
