"""SAM_Toons · Blender · «рисованный» вид: мультяшные материалы (2–3 тона без градиентов), контур Freestyle
с неровной линией «от руки», небо-градиент, свечение. Палитра — как в стиле dusk 2D-движка."""
from __future__ import annotations

import bpy

PAL = {
    "ink": (0.063, 0.078, 0.11), "sky_top": (0.25, 0.54, 0.52), "sky_low": (0.56, 0.79, 0.71),
    "ochre": (0.72, 0.55, 0.18), "ochre_dk": (0.42, 0.28, 0.10), "navy": (0.14, 0.19, 0.27), "skin": (0.9, 0.76, 0.61),
    "skin_dk": (0.66, 0.48, 0.38), "hair": (0.12, 0.13, 0.17), "boot": (0.29, 0.19, 0.12), "grey": (0.33, 0.37, 0.4),
    "ground": (0.15, 0.24, 0.22), "ground_dk": (0.07, 0.11, 0.12), "water": (0.10, 0.21, 0.25), "far": (0.29, 0.44, 0.46),
    "mid": (0.17, 0.27, 0.33), "near": (0.11, 0.18, 0.23), "green": (0.43, 0.6, 0.23), "green_dk": (0.24, 0.37, 0.13),
    "brown": (0.48, 0.32, 0.19), "brown_dk": (0.29, 0.19, 0.12), "glow": (0.96, 0.93, 0.61), "white": (0.95, 0.94, 0.9),
    "black": (0.03, 0.03, 0.04), "moon": (0.95, 0.94, 0.77),
}


def toon(name: str, color, shadow=None, emit: float = 0.0, steps: int = 2):
    """Материал «как нарисовано»: свет/тень — ровными заливками (Shader to RGB → ColorRamp constant)."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    if emit:
        e = nt.nodes.new("ShaderNodeEmission"); e.inputs[0].default_value = (*color, 1); e.inputs[1].default_value = emit
        nt.links.new(e.outputs[0], out.inputs[0]); return m
    shadow = shadow or tuple(c * 0.55 for c in color)
    d = nt.nodes.new("ShaderNodeBsdfDiffuse")
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    els[0].position = 0.0; els[0].color = (*shadow, 1)
    els[1].position = 0.35; els[1].color = (*color, 1)
    if steps > 2:
        e3 = els.new(0.8); e3.color = (*[min(1, c * 1.12) for c in color], 1)
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(d.outputs[0], s2r.inputs[0]); nt.links.new(s2r.outputs[0], bw.inputs[0]); nt.links.new(bw.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], em.inputs[0]); nt.links.new(em.outputs[0], out.inputs[0])
    return m


def world_sky(top=None, low=None):
    w = bpy.context.scene.world or bpy.data.worlds.new("World"); bpy.context.scene.world = w
    w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld"); bg = nt.nodes.new("ShaderNodeBackground")
    tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.25; ramp.color_ramp.elements[0].color = (*(low or PAL["sky_low"]), 1)
    ramp.color_ramp.elements[1].position = 0.95; ramp.color_ramp.elements[1].color = (*(top or PAL["sky_top"]), 1)
    nt.links.new(tc.outputs["Window"], sep.inputs[0]); nt.links.new(sep.outputs[1], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], bg.inputs[0]); nt.links.new(bg.outputs[0], out.inputs[0])
    bg.inputs[1].default_value = 1.0


def freestyle(thickness: float = 2.4, wobble: float = 1.6):
    sc = bpy.context.scene; sc.render.use_freestyle = True
    sc.render.line_thickness_mode = "RELATIVE"      # толщина растёт с разрешением кадра
    vl = bpy.context.view_layer; vl.use_freestyle = True; fs = vl.freestyle_settings
    fs.as_render_pass = False
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new("ink")
    ls.select_by_visibility = True; ls.select_by_edge_types = True
    ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True; ls.select_contour = True
    fs.crease_angle = 2.3
    st = ls.linestyle or bpy.data.linestyles.new("ink")
    ls.linestyle = st
    st.color = PAL["ink"]; st.thickness = thickness
    st.caps = "ROUND"; st.chaining = "PLAIN"
    for m in list(st.geometry_modifiers):
        if m.type != "SAMPLING":
            st.geometry_modifiers.remove(m)
    n = st.geometry_modifiers.new("hand", "PERLIN_NOISE_1D"); n.frequency = 8; n.amplitude = wobble; n.octaves = 2
    tm = st.thickness_modifiers.new("taper", "ALONG_STROKE")
    tm.mapping = "CURVE"; tm.blend = "MULTIPLY"
    cv = tm.curve.curves[0]; cv.points[0].location = (0, 0.35); cv.points[-1].location = (1, 0.4)
    cv.points.new(0.5, 1.0); tm.curve.update()
    return ls


def render_settings(w: int, h: int, fps: int, samples: int = 4):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.fps = fps
    sc.eevee.taa_render_samples = samples
    sc.eevee.use_bloom = True; sc.eevee.bloom_intensity = 0.06; sc.eevee.bloom_threshold = 0.9
    sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
    sc.render.image_settings.file_format = "JPEG"; sc.render.image_settings.quality = 94
