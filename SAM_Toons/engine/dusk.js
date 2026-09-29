// SAM_Toons · стиль «dusk» (film.style.look = "dusk"): сумеречная иллюстрация в духе референса —
// бирюзовое небо, тёмно-синие тени, тёплый охристый свет, чернильный контур, штриховка, «каракульный» мех,
// горящие жёлтые глаза, зерно печати и виньетка. Анимация та же (через кадр, неподвижные паузы).
// Здесь: палитра и фактуры, фон (небо, луны, дальние планы, болото), человек (Борис) и существа/растения болота.
(function () {
  const SAM = window.SAM;
  const { lerp, rng } = SAM;
  const R = Math.PI / 180;

  const C = {
    ink: "#10141c", sky0: "#3f8a86", sky1: "#8fc9b4", haze: "#9cc7b8", far: "#4a7076", mid: "#2b4553", near: "#1c2f3b",
    ground0: "#243a36", ground1: "#0f1a1d", water: "#1b3640", waterHi: "#7fb3a8",
    warm: "#e7a24e", ochre: "#b88b2d", ochreDk: "#7d5a1c", navy: "#243044", skin: "#e6c29b", skinDk: "#b98e6b",
    glow: "#f4ec9c", glowCore: "#fffbd8", green: "#6f9a3a", greenDk: "#3e5f22", greenLt: "#a6c45a",
    brown: "#7a5231", brownDk: "#4a3020", grey: "#7e8a92", greyDk: "#4e5860", shadow: "rgba(20,28,45,0.55)",
  };

  // ---------------------------------------------------------------- фактуры
  // «каракули»: много коротких изогнутых штрихов внутри фигуры — мех, мох, тень (как шерсть котов в референсе)
  function scribble(P, clipFn, [x0, y0, x1, y1], { color = C.ink, density = 3, len = 0.7, lw = 0.07, seed = 1, angle = null, alpha = 1 } = {}) {
    const c = P.c, r = rng(seed * 13 + 7), n = Math.min(900, Math.round((x1 - x0) * (y1 - y0) * density));
    c.save(); if (clipFn) { c.beginPath(); clipFn(); c.clip(); }
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), a = angle == null ? r() * Math.PI * 2 : angle + (r() - 0.5) * 0.6, l = len * (0.4 + r());
      c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    }
    c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = lw; c.lineCap = "round"; c.stroke(); c.restore();
  }
  // штриховка параллельными линиями (тень)
  function hatch(P, clipFn, [x0, y0, x1, y1], { color = C.ink, step = 0.35, angle = 60, lw = 0.05, alpha = 0.55, seed = 1 } = {}) {
    const c = P.c, r = rng(seed), dx = Math.cos(angle * R), dy = Math.sin(angle * R), L = Math.hypot(x1 - x0, y1 - y0);
    c.save(); c.beginPath(); clipFn(); c.clip(); c.beginPath();
    for (let d = -L; d < L; d += step) {
      const cx = (x0 + x1) / 2 - dy * d, cy = (y0 + y1) / 2 + dx * d, j = (r() - 0.5) * step * 0.4;
      c.moveTo(cx - dx * L + j, cy - dy * L); c.lineTo(cx + dx * L + j, cy + dy * L);
    }
    c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = lw; c.stroke(); c.restore();
  }
  function glow(P, x, y, rad, color = C.glow, a = 0.55) {
    const c = P.c, g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
    c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); c.restore();
  }
  const path = (c, pts, close = true) => { pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (close) c.closePath(); };
  // залить + обвести «от руки» (две чуть смещённые обводки — чернильный, неровный край)
  function ink(P, pts, fill, { seed = 1, lw = 1, close = true, rough = 0.05 } = {}) {
    const c = P.c;
    if (fill) { c.beginPath(); path(c, pts, close); c.fillStyle = fill; c.fill(); }
    for (let k = 0; k < 2; k++) {
      const r = rng(seed * 7 + k * 101 + P.boil * 3);
      c.beginPath(); path(c, pts.map(([x, y]) => [x + (r() - 0.5) * rough, y + (r() - 0.5) * rough]), close);
      c.strokeStyle = C.ink; c.globalAlpha = k ? 0.45 : 1; c.lineWidth = P.lw * lw * (k ? 0.6 : 1); c.stroke();
    }
    c.globalAlpha = 1;
  }
  // конечность со скруглёнными концами: чёрная толстая линия + цветная потоньше
  function limbInk(P, pts, w, col) {
    const c = P.c; c.lineCap = "round"; c.lineJoin = "round";
    for (const [lw, cc] of [[w + P.lw * 2, C.ink], [w, col]]) { c.beginPath(); path(c, pts, false); c.strokeStyle = cc; c.lineWidth = lw; c.stroke(); }
  }
  const oval = (cx, cy, rx, ry, n = 22, rot = 0) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; const x = Math.cos(a) * rx, y = Math.sin(a) * ry; return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]; });
  // гладкая ломаная → точки кривой (для стволов, хобота, лап)
  function bez(p0, p1, p2, n = 12) { const o = []; for (let i = 0; i <= n; i++) { const t = i / n; o.push([(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]]); } return o; }
  // «трубка» переменной толщины вдоль кривой (ствол, хобот, лапа) → многоугольник
  function tube(pts, w0, w1) {
    const L = [], Rr = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = lerp(w0, w1, i / (n - 1)) / 2;
      L.push([pts[i][0] - dy / l * w, pts[i][1] + dx / l * w]); Rr.push([pts[i][0] + dy / l * w, pts[i][1] - dx / l * w]);
    }
    return [...L, ...Rr.reverse()];
  }

  // ---------------------------------------------------------------- фон: небо, луны, дальние планы, туман, земля
  const cache = {};
  function background(P, S, cam, W, H, t) {
    const c = P.c, k = W / 100 * cam.zoom, set = S.set, sky = set.sky || {};
    // небо — в экранных координатах
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top || C.sky0); g.addColorStop(0.75, sky.bottom || C.sky1); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const rs = rng(77); c.beginPath();
    for (let i = 0; i < 260; i++) { const x = rs() * W, y = rs() * H * 0.6, l = W * (0.01 + rs() * 0.03); c.moveTo(x, y); c.lineTo(x + l, y + l * 0.08); }
    c.strokeStyle = "rgba(20,40,50,0.10)"; c.lineWidth = Math.max(1, W / 900); c.stroke();
    c.restore();
    // слой с параллаксом f (0 — бесконечно далеко, 1 — как земля)
    const layer = (f, fn) => { c.save(); c.setTransform(k, 0, 0, k, W / 2 - cam.x * f * k, H / 2 + cam.y * k); fn(); c.restore(); };
    layer(0.05, () => {
      for (const m of sky.moons || [{ x: 72, y: 44, r: 3.2 }, { x: 80, y: 38, r: 1.4 }]) { glow(P, m.x, -m.y, m.r * 3.2, C.glow, 0.35); ink(P, oval(m.x, -m.y, m.r, m.r), "#f1efc4", { seed: 3, lw: 0.6 }); scribble(P, () => { c.arc(m.x, -m.y, m.r, 0, 7); }, [m.x - m.r, -m.y - m.r, m.x + m.r, -m.y + m.r], { color: "#c9c49a", density: 2, len: 0.35, lw: 0.05, seed: 9 }); }
      const rb = rng(5); c.fillStyle = C.ink;   // летучие существа вдали
      for (let i = 0; i < (sky.birds ?? 4); i++) { const bx = 20 + rb() * 60 + Math.sin(t * 0.3 + i) * 2, by = -(36 + rb() * 14); c.beginPath(); c.moveTo(bx - 0.7, by); c.quadraticCurveTo(bx - 0.3, by - 0.35 - Math.abs(Math.sin(t * 4 + i)) * 0.3, bx, by); c.quadraticCurveTo(bx + 0.3, by - 0.35 - Math.abs(Math.sin(t * 4 + i)) * 0.3, bx + 0.7, by); c.lineWidth = 0.12; c.strokeStyle = C.ink; c.stroke(); }
    });
    const hills = (f, col, base, amp, seed, trees) => layer(f, () => {
      const key = `${S.id}_${seed}`, pts = cache[key] || (cache[key] = (() => { const r = rng(seed), o = [[-120, 20]]; for (let x = -120; x <= 220; x += 3) o.push([x, -base - amp * (0.5 + 0.5 * Math.sin(x * 0.07 + seed)) - r() * amp * 0.4]); o.push([220, 20]); return o; })());
      c.beginPath(); path(c, pts); c.fillStyle = col; c.fill();
      c.beginPath(); path(c, pts.slice(1, -1), false); c.strokeStyle = C.ink; c.globalAlpha = 0.7; c.lineWidth = P.lw * 0.8; c.stroke(); c.globalAlpha = 1;
      scribble(P, () => path(c, pts), [cam.x - 90, -base - amp * 1.4, cam.x + 90, 4], { color: C.ink, density: 0.9, len: 1.4, lw: 0.05, seed, angle: 0.15, alpha: 0.35 });
      if (trees) { const r = rng(seed + 1); for (let i = 0; i < trees; i++) { const x = -100 + r() * 300, h = base + amp + 3 + r() * 8; c.beginPath(); c.moveTo(x - 0.4, -base); c.quadraticCurveTo(x + 1.2, -h * 0.6, x, -h); c.quadraticCurveTo(x - 0.6, -h * 0.6, x + 0.4, -base); c.fillStyle = col; c.fill(); for (let j = 0; j < 4; j++) { const yy = -h + j * 1.4; c.beginPath(); c.moveTo(x, yy); c.quadraticCurveTo(x + 2 + j * 0.5, yy - 0.8, x + 3 + j, yy + 1.2); c.moveTo(x, yy); c.quadraticCurveTo(x - 2 - j * 0.5, yy - 0.6, x - 3 - j, yy + 1.4); c.lineWidth = 0.35; c.strokeStyle = col; c.stroke(); } } }
    });
    hills(0.25, C.far, 5, 5, 11, 10);
    // туман между планами
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    const horizon = H / 2 + cam.y * k, fg = c.createLinearGradient(0, horizon - H * 0.25, 0, horizon + 4);
    fg.addColorStop(0, "rgba(156,199,184,0)"); fg.addColorStop(1, "rgba(156,199,184,0.32)"); c.fillStyle = fg; c.fillRect(0, horizon - H * 0.25, W, H * 0.25 + 4);
    c.restore();
    hills(0.5, C.mid, 1.5, 3.5, 23, 8);
    // земля болота
    layer(1, () => {
      const x0 = cam.x - 80 / cam.zoom, x1 = cam.x + 80 / cam.zoom;
      const gg = c.createLinearGradient(0, 0, 0, 40); gg.addColorStop(0, C.ground0); gg.addColorStop(1, C.ground1);
      c.beginPath(); c.moveTo(x0, 0); for (let x = x0; x <= x1; x += 2) c.lineTo(x, Math.sin(x * 0.3) * 0.12); c.lineTo(x1, 60); c.lineTo(x0, 60); c.closePath(); c.fillStyle = gg; c.fill();
      c.beginPath(); c.moveTo(x0, 0); for (let x = x0; x <= x1; x += 2) c.lineTo(x, Math.sin(x * 0.3) * 0.12); c.strokeStyle = C.ink; c.lineWidth = P.lw; c.stroke();
      // кочки и травинки
      const r = rng(SAM.hash(S.id) % 997); c.beginPath();
      for (let i = 0; i < 260; i++) { const x = -80 + r() * 260, z = 0.3 + Math.pow(r(), 0.9) * 22, l = 0.4 + r() * 0.9; c.moveTo(x, z); c.quadraticCurveTo(x + 0.15, z - l * 0.6, x + (r() - 0.3) * 0.5, z - l); }
      c.strokeStyle = "rgba(10,20,22,0.7)"; c.lineWidth = 0.07; c.stroke();
      c.beginPath(); for (let i = 0; i < 160; i++) { const x = -80 + r() * 260, z = 0.5 + r() * 22; c.moveTo(x, z); c.lineTo(x + 0.25, z + 0.02); }
      c.strokeStyle = "rgba(167,214,194,0.35)"; c.lineWidth = 0.06; c.stroke();
    });
  }

  // зерно печати, тёплый свет, виньетка — поверх всего кадра (в экранных координатах)
  let grainTile = null;
  function overlay(P, S, W, H, t) {
    const c = P.c, light = S.set.light;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    if (light) { const g = c.createRadialGradient(W * light.x, H * light.y, 0, W * light.x, H * light.y, W * (light.r || 0.5)); g.addColorStop(0, "rgba(231,162,78,0.28)"); g.addColorStop(1, "rgba(231,162,78,0)"); c.globalCompositeOperation = "lighter"; c.fillStyle = g; c.fillRect(0, 0, W, H); c.globalCompositeOperation = "source-over"; }
    const v = c.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.75); v.addColorStop(0, "rgba(16,22,36,0)"); v.addColorStop(1, "rgba(10,14,26,0.72)"); c.fillStyle = v; c.fillRect(0, 0, W, H);
    if (!grainTile) {
      grainTile = document.createElement("canvas"); grainTile.width = grainTile.height = 256;
      const gc = grainTile.getContext("2d"), im = gc.createImageData(256, 256), r = rng(42);
      for (let i = 0; i < im.data.length; i += 4) { const d = r(); const v2 = d < 0.5 ? 0 : 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v2; im.data[i + 3] = Math.floor(Math.abs(d - 0.5) * 2 * 50); }
      gc.putImageData(im, 0, 0);
    }
    const sc = Math.max(1, W / 960);
    c.globalAlpha = 0.9; c.imageSmoothingEnabled = false; c.scale(sc, sc);
    c.fillStyle = c.createPattern(grainTile, "repeat"); c.fillRect(0, 0, W / sc, H / sc);
    c.restore();
  }

  // ---------------------------------------------------------------- человек (Борис): пальто, рюкзак, камера, мутирующая рука
  // st.morph: swell 0..1 — правая рука распухает; claw 0..1 — превращается в зелёную клешню богомола
  function drawHuman(P, st, cast) {
    const c = P.c, H = st.h, t = st.t, look = st.face, m = st.morph || {}, seed = st.seed;
    const p = SAM.poseState(st);
    const hipY = H * 0.44 * (p.hip / 0.4), leg = hipY / 2 * p.legK, shY = hipY + H * 0.31, shX = H * 0.12;
    const headR = H * 0.1, legW = H * 0.075, armW = H * 0.078;
    const seg = (x, y, len, a, side) => [x + side * Math.sin(a * R) * len, y + Math.cos(a * R) * len];
    const limb = (x, y, [a, b], l1, l2, side) => { const e = seg(x, y, l1, a, side), h = seg(e[0], e[1], l2, a + b, side); return [[x, y], e, h]; };
    c.save(); c.translate(st.x, st.y - p.lift * H);
    if (p.tilt && p.tilt < 80) { c.translate(0, -hipY); c.rotate(p.tilt * R * (look < 0 ? -1 : 1)); c.translate(0, hipY); }
    c.lineJoin = "round"; c.lineCap = "round";
    // ноги и ботинки
    for (const sd of [-1, 1]) {
      const l = limb(sd * H * 0.055, -hipY, sd < 0 ? p.legL : p.legR, leg, leg, sd);
      limbInk(P, l, legW, C.navy);
      const [fx, fy] = l[2], d = look || sd * 0.3;
      ink(P, [[fx - H * 0.04, fy - H * 0.03], [fx + d * H * 0.07, fy - H * 0.03], [fx + d * H * 0.09, fy + H * 0.012], [fx - H * 0.05, fy + H * 0.012]], C.brownDk, { seed: seed + 5 + sd });
    }
    // рюкзак
    const bx = -look * H * 0.1;
    ink(P, [[bx - H * 0.13, -shY + H * 0.02], [bx + H * 0.13, -shY + H * 0.02], [bx + H * 0.14, -hipY - H * 0.02], [bx - H * 0.14, -hipY - H * 0.02]], C.greyDk, { seed: seed + 9 });
    P.c.beginPath(); P.c.moveTo(bx + H * 0.08, -shY + H * 0.02); P.c.lineTo(bx + H * 0.12, -shY - H * 0.12); P.c.strokeStyle = C.ink; P.c.lineWidth = P.lw * 0.8; P.c.stroke(); P.dot(bx + H * 0.12, -shY - H * 0.12, H * 0.012, H * 0.012, C.warm);
    const arms = [-1, 1].map((sd) => limb(sd * shX, -shY + H * 0.02, sd < 0 ? p.armL : p.armR, H * 0.17, H * 0.16, sd));
    const drawArm = (sd) => {
      const a = arms[sd < 0 ? 0 : 1], right = sd > 0, sw = right ? (m.swell || 0) : 0, cl = right ? (m.claw || 0) : 0;
      if (cl < 0.95) limbInk(P, a, armW * (1 + sw * 0.5), C.ochre); else limbInk(P, [a[0], a[1]], armW, C.ochre);
      const [hx, hy] = a[2];
      if (cl > 0.02) claw(P, a[1], a[2], H * (0.2 + 0.18 * cl), cl, seed);
      if (cl < 0.6) {
        const hr = H * 0.038 * (1 + sw * 2.2) * (1 - cl), skin = sw > 0 ? mixCol(C.skin, "#d9807a", Math.min(1, sw * 1.2)) : C.skin;
        ink(P, oval(hx, hy, hr, hr * 0.95), skin, { seed: seed + 30 + sd });
        if (sw > 0.2) { c.save(); c.globalAlpha = sw; for (let i = 0; i < 3; i++) P.dot(hx + (i - 1) * hr * 0.4, hy - hr * 0.2 + (i % 2) * hr * 0.3, hr * 0.12, hr * 0.12, "#b8453d"); c.restore(); }
      }
      if (!right && cast.hold === "camera") {   // камера для влога в левой руке
        c.save(); c.translate(hx, hy); c.rotate(-0.3 * (look || 1));
        ink(P, [[-H * 0.05, -H * 0.035], [H * 0.05, -H * 0.035], [H * 0.05, H * 0.035], [-H * 0.05, H * 0.035]], "#1d222b", { seed: seed + 40 });
        P.dot(H * 0.02, 0, H * 0.018, H * 0.018, "#5d7a8a"); P.dot(-H * 0.032, -H * 0.02, H * 0.007, H * 0.007, Math.floor(t * 2) % 2 ? "#e0453a" : "#7a2520");
        c.restore();
      }
    };
    // дальняя рука — за пальто
    const far = look > 0 ? -1 : look < 0 ? 1 : 0;
    if (far) drawArm(far);
    // пальто: трапеция с воротником, пятна и штриховая тень
    const coat = [[-shX * 0.9, -shY - H * 0.02], [shX * 0.9, -shY - H * 0.02], [shX * 1.05, -shY + H * 0.06], [H * 0.19, -hipY * 0.45], [H * 0.05, -hipY * 0.4], [-H * 0.05, -hipY * 0.42], [-H * 0.19, -hipY * 0.45], [-shX * 1.05, -shY + H * 0.06]];
    ink(P, coat, C.ochre, { seed: seed + 50 });
    hatch(P, () => path(c, coat), [-H * 0.2, -shY, H * 0.2, -hipY * 0.4], { color: C.ochreDk, step: H * 0.022, angle: 70, lw: P.lw * 0.5, alpha: 0.6, seed });
    c.save(); c.beginPath(); path(c, coat); c.clip(); c.fillStyle = C.shadow; c.fillRect(look >= 0 ? -H * 0.25 : H * 0.02, -shY - H * 0.1, H * 0.23, shY); c.restore();
    const rs = rng(seed + 3); for (let i = 0; i < 7; i++) P.dot((rs() - 0.5) * H * 0.3, -hipY * 0.5 - rs() * (shY - hipY * 0.5), H * 0.008 + rs() * H * 0.006, H * 0.01, "#3b2a12");
    P.c.beginPath(); P.c.moveTo(0, -shY + H * 0.04); P.c.lineTo(look * H * 0.01, -hipY * 0.42); P.c.strokeStyle = C.ink; P.c.lineWidth = P.lw * 0.6; P.c.stroke();
    ink(P, [[-H * 0.07, -shY - H * 0.03], [0, -shY + H * 0.06], [H * 0.07, -shY - H * 0.03]], C.ochreDk, { seed: seed + 51, close: false });
    if (far) drawArm(-far); else { drawArm(-1); drawArm(1); }
    // голова: шея, лицо, волосы-каракули, щетина, очки-гогглы на лбу
    const hx = look * H * 0.015, hy = -shY - headR * 1.15;
    c.save(); c.translate(hx, hy + headR); c.rotate((p.headTilt + look * 3) * R); c.translate(-hx, -hy - headR);
    limbInk(P, [[hx, -shY + H * 0.01], [hx, hy + headR * 0.5]], H * 0.055, C.skinDk);
    const face = oval(hx, hy, headR * 0.92, headR, 26);
    ink(P, face, C.skin, { seed: seed + 61 });
    c.save(); c.beginPath(); path(c, face); c.clip(); c.fillStyle = "rgba(140,90,60,0.25)"; c.fillRect(look >= 0 ? hx - headR : hx + headR * 0.3, hy - headR, headR * 0.7, headR * 2);
    scribble(P, null, [hx - headR * 0.8, hy + headR * 0.35, hx + headR * 0.8, hy + headR * 1.0], { color: "#5a4535", density: 900 / (H * H) * 0.8, len: headR * 0.12, lw: P.lw * 0.35, seed: seed + 62, alpha: 0.8 });
    c.restore();
    // волосы: тёмная шапка каракулей сверху
    const hair = [...Array.from({ length: 12 }, (_, i) => { const a = Math.PI * (1.02 + i * 0.96 / 11); return [hx + Math.cos(a) * headR * 1.08, hy + Math.sin(a) * headR * 1.08]; }), [hx + headR * 0.85, hy - headR * 0.25], [hx + look * headR * 0.3, hy - headR * 0.55], [hx - headR * 0.85, hy - headR * 0.25]];
    ink(P, hair, "#20242c", { seed: seed + 63 });
    scribble(P, () => path(c, hair), [hx - headR * 1.1, hy - headR * 1.15, hx + headR * 1.1, hy - headR * 0.2], { color: "#3a4150", density: 900 / (H * H) * 1.2, len: headR * 0.25, lw: P.lw * 0.4, seed: seed + 64 });
    // гогглы на лбу
    for (const sx of [-1, 1]) ink(P, oval(hx + look * headR * 0.25 + sx * headR * 0.36, hy - headR * 0.62, headR * 0.22, headR * 0.17), "#5e8a96", { seed: seed + 65 + sx, lw: 0.8 });
    // лицо: большие глаза, брови, рот
    const lx = look * headR * 0.28, ey = hy - headR * 0.05, mood = st.mood;
    for (const sx of [-1, 1]) {
      const ex = hx + lx + sx * headR * 0.36;
      if (st.blink || mood === "pray") { c.beginPath(); c.moveTo(ex - headR * 0.14, ey); c.quadraticCurveTo(ex, ey + headR * 0.08, ex + headR * 0.14, ey); c.strokeStyle = C.ink; c.lineWidth = P.lw * 0.8; c.stroke(); continue; }
      const big = mood === "scared" || mood === "surprised" ? 1.25 : 1;
      ink(P, oval(ex, ey, headR * 0.17 * big, headR * 0.2 * big, 16), "#f4f1e6", { seed: seed + 70 + sx, lw: 0.7 });
      P.dot(ex + look * headR * 0.05, ey + headR * 0.02, headR * 0.075, headR * 0.09, C.ink); P.dot(ex + look * headR * 0.05 + headR * 0.03, ey - headR * 0.03, headR * 0.025, headR * 0.025, "#ffffff");
      const by = ey - headR * 0.3, tiltB = mood === "angry" ? -sx * 0.1 : mood === "sad" || mood === "scared" ? sx * 0.1 : 0, up = mood === "surprised" ? headR * 0.08 : 0;
      c.beginPath(); c.moveTo(ex - headR * 0.16, by - up - tiltB * headR); c.lineTo(ex + headR * 0.16, by - up + tiltB * headR); c.strokeStyle = C.ink; c.lineWidth = P.lw * 1.3; c.stroke();
    }
    const mx = hx + lx * 1.1, my = hy + headR * 0.52;
    c.beginPath();
    if (st.talk > 0.05) { c.ellipse(mx, my, headR * (0.12 + 0.05 * st.talk), headR * (0.04 + 0.2 * st.talk), 0, 0, 7); c.fillStyle = "#3a1c1c"; c.fill(); }
    else {
      if (mood === "happy" || mood === "sly") { c.moveTo(mx - headR * 0.2, my - headR * 0.03); c.quadraticCurveTo(mx, my + headR * 0.15, mx + headR * 0.2, my - headR * 0.05); }
      else if (mood === "sad" || mood === "scared") { c.moveTo(mx - headR * 0.15, my + headR * 0.05); c.quadraticCurveTo(mx, my - headR * 0.08, mx + headR * 0.15, my + headR * 0.05); }
      else if (mood === "surprised") c.ellipse(mx, my, headR * 0.07, headR * 0.1, 0, 0, 7);
      else { c.moveTo(mx - headR * 0.12, my); c.lineTo(mx + headR * 0.12, my + headR * 0.01); }
      c.strokeStyle = C.ink; c.lineWidth = P.lw; c.stroke();
    }
    c.restore();
    c.restore();
    const top = st.y - p.lift * H - shY - headR * 3.2;
    for (const e of st.emotes) { const age = t - e.t0, left = e.t1 - t, kk = age < 0.18 ? SAM.ease.back(age / 0.18) : left < 0.2 ? Math.max(0, left / 0.2) : 1; SAM.drawEmote(P, e.kind, st.x + headR * 1.2, top, headR * 1.1, kk, t, seed); }
  }
  function mixCol(a, b, k) { const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return "#" + pa.map((v, i) => Math.round(lerp(v, pb[i], k)).toString(16).padStart(2, "0")).join(""); }
  // зелёная клешня богомола (растёт из предплечья): сегмент с шипами и загнутым крюком
  function claw(P, elbow, hand, len, k, seed) {
    const c = P.c, dx = hand[0] - elbow[0], dy = hand[1] - elbow[1], a = Math.atan2(dy, dx);
    c.save(); c.translate(elbow[0], elbow[1]); c.rotate(a); c.globalAlpha = Math.min(1, k * 1.5);
    const w = len * 0.34;
    // бедро: толстый изогнутый сегмент
    const femur = [...bez([0, -w * 0.45], [len * 0.55, -w * 0.9], [len, -w * 0.2], 10), ...bez([len, w * 0.3], [len * 0.5, w * 0.75], [0, w * 0.45], 10)];
    ink(P, femur, C.green, { seed: seed + 80 });
    hatch(P, () => path(c, femur), [0, -w, len, w], { color: C.greenDk, step: w * 0.2, angle: 25, lw: P.lw * 0.5, alpha: 0.7, seed });
    // ряд шипов по внутреннему краю
    for (let i = 0; i < 5; i++) { const x = len * (0.15 + i * 0.16), y = w * (0.62 - i * 0.03); ink(P, [[x - w * 0.1, y - w * 0.05], [x + w * 0.02, y + w * 0.42], [x + w * 0.1, y - w * 0.06]], C.greenLt, { seed: seed + 81 + i, lw: 0.7 }); }
    // голень: складывается назад крюком
    const tib = [...bez([len * 0.95, -w * 0.15], [len * 0.6, w * 0.9], [len * 0.05, w * 1.05], 10), ...bez([len * 0.05, w * 1.3], [len * 0.7, w * 1.3], [len * 1.08, w * 0.25], 10)];
    ink(P, tib, C.greenLt, { seed: seed + 90 });
    ink(P, [[len * 0.05, w * 1.05], [-w * 0.35, w * 0.85], [len * 0.05, w * 1.3]], C.greenLt, { seed: seed + 91, lw: 0.8 });
    glow(P, len * 0.5, 0, len * 0.6, "#b8e07a", 0.18 * k);
    c.restore();
  }

  // ---------------------------------------------------------------- растения болота (props; origin — точка у земли)
  const def = (name, z, fn, back) => (SAM.PROPS[name] = { z, draw: fn, back });
  def("swamp_tree", "back", (P, p, t) => {
    const c = P.c, s = p.s, h = 20 * s, r = rng(p.seed);
    const trunk = bez([0, 0], [3 * s * (r() - 0.5) * 2, -h * 0.5], [(r() - 0.5) * 4 * s, -h], 14);
    ink(P, tube(trunk, 2.2 * s, 0.8 * s), C.near, { seed: p.seed });
    hatch(P, () => path(c, tube(trunk, 2.2 * s, 0.8 * s)), [-3 * s, -h, 3 * s, 0], { color: C.ink, step: 0.3, angle: 80, lw: 0.05, alpha: 0.5, seed: p.seed });
    for (let i = 0; i < 5; i++) {   // ветви с мхом и светящимися плодами
      const y = -h * (0.55 + i * 0.09), dir = i % 2 ? 1 : -1, len = (5 + r() * 5) * s, x0 = trunk[Math.round((0.55 + i * 0.09) * 14)][0];
      const br = bez([x0, y], [x0 + dir * len * 0.6, y - 2 * s], [x0 + dir * len, y + 1.5 * s], 8);
      ink(P, tube(br, 0.7 * s, 0.2 * s), C.near, { seed: p.seed + i });
      const sway = Math.sin(t * 0.8 + i) * 0.2;
      c.beginPath(); for (let j = 0; j < 6; j++) { const [bx, by] = br[2 + j % 6]; const l = (2 + r() * 4) * s; c.moveTo(bx, by); c.quadraticCurveTo(bx + sway, by + l * 0.5, bx + sway * 2, by + l); }
      c.strokeStyle = "#4d6f67"; c.lineWidth = 0.12 * s; c.stroke();
      if (p.glow !== false && i % 2 === 0) { const [gx, gy] = br[6]; glow(P, gx, gy + 1.5 * s, 2.2 * s, C.glow, 0.5); ink(P, oval(gx, gy + 1.5 * s, 0.45 * s, 0.55 * s, 10), C.glow, { seed: p.seed + 30 + i, lw: 0.6 }); }
    }
  });
  def("glow_plant", "back", (P, p, t) => {
    const c = P.c, s = p.s, r = rng(p.seed), n = p.n || 4;
    for (let i = 0; i < n; i++) {
      const h = (3 + r() * 4) * s, x = (r() - 0.5) * 3 * s, sw = Math.sin(t * 1.2 + i) * 0.3 * s;
      const stem = bez([x, 0], [x + (r() - 0.5) * 2 * s, -h * 0.5], [x + sw, -h], 8);
      c.beginPath(); path(c, stem, false); c.strokeStyle = C.greenDk; c.lineWidth = 0.18 * s; c.stroke();
      const [gx, gy] = stem[stem.length - 1], br = (0.45 + r() * 0.4) * s, pulse = 0.4 + 0.2 * Math.sin(t * 2 + i * 1.7);
      glow(P, gx, gy, br * 4.5, C.glow, pulse); ink(P, oval(gx, gy, br, br * 1.15, 12), C.glow, { seed: p.seed + i, lw: 0.7 }); P.dot(gx - br * 0.3, gy - br * 0.35, br * 0.25, br * 0.25, C.glowCore);
    }
    for (let i = 0; i < 3; i++) { const lx = (i - 1) * 1.1 * s, d = i - 1 || 0.6; ink(P, [...bez([lx, 0], [lx + d * 1.6 * s, -0.6 * s], [lx + d * 2.2 * s, -1.9 * s], 6), ...bez([lx + d * 2.2 * s, -1.9 * s], [lx + d * 0.4 * s, -1.6 * s], [lx, 0], 6)], C.greenDk, { seed: p.seed + 20 + i, lw: 0.8 }); }
  });
  def("reeds", "back", (P, p, t) => {
    const c = P.c, s = p.s, r = rng(p.seed);
    for (let i = 0; i < (p.n || 9); i++) { const x = (r() - 0.5) * 5 * s, h = (4 + r() * 5) * s, sw = Math.sin(t * 0.9 + i) * 0.35 * s; c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x, -h * 0.6, x + sw, -h); c.strokeStyle = C.greenDk; c.lineWidth = 0.14 * s; c.stroke(); if (i % 3 === 0) ink(P, oval(x + sw, -h - 0.5 * s, 0.22 * s, 0.7 * s, 10), C.brownDk, { seed: p.seed + i, lw: 0.6 }); }
  });
  def("shroom", "back", (P, p) => {
    const s = p.s, h = (p.h || 7) * s;
    ink(P, tube(bez([0, 0], [0.8 * s, -h * 0.5], [0, -h], 8), 0.9 * s, 0.6 * s), "#cdd8c8", { seed: p.seed });
    const cap = [[-3 * s, -h + 0.3 * s], ...Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (1 + i / 10); return [Math.cos(a) * 3 * s, -h + Math.sin(a) * 2.2 * s]; }), [3 * s, -h + 0.3 * s]];
    ink(P, cap, "#3f7a78", { seed: p.seed + 1 });
    hatch(P, () => path(P.c, cap), [-3 * s, -h - 2.4 * s, 3 * s, -h + 0.5 * s], { step: 0.25 * s, angle: 110, alpha: 0.35, seed: p.seed });
    const r = rng(p.seed); for (let i = 0; i < 5; i++) P.dot((r() - 0.5) * 4 * s, -h - 0.4 * s - r() * 1.4 * s, 0.25 * s, 0.2 * s, "#d9ead0");
  });
  def("pool", "back", (P, p, t) => {
    const c = P.c, w = (p.w || 14) * p.s, d = (p.d || 2.5) * p.s;
    const pts = oval(0, 0, w / 2, d / 2, 28);
    ink(P, pts, C.water, { seed: p.seed, lw: 0.8 });
    c.save(); c.beginPath(); path(c, pts); c.clip();
    const r = rng(p.seed); c.beginPath(); for (let i = 0; i < 14; i++) { const x = (r() - 0.5) * w, y = (r() - 0.5) * d * 0.8, l = 0.6 + r() * 2.5; c.moveTo(x, y); c.lineTo(x + l, y); }
    c.strokeStyle = C.waterHi; c.globalAlpha = 0.6; c.lineWidth = 0.1; c.stroke();
    for (let i = 0; i < 2; i++) { const ph = (t * 0.5 + i * 0.5) % 1; c.beginPath(); c.ellipse((i - 0.5) * w * 0.3, 0, ph * 2.5, ph * 0.6, 0, 0, 7); c.globalAlpha = 0.6 * (1 - ph); c.stroke(); }
    c.restore();
  });
  def("fern", "back", (P, p, t) => {
    const c = P.c, s = p.s;
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 ? 1 : -1, len = (3 + i) * s, pts = [];
      for (let j = 0; j <= 24; j++) { const u = j / 24, a = -Math.PI / 2 + dir * (u * 1.2 + Math.pow(u, 3) * 4), rr = len * (1 - u * 0.85); pts.push([dir * u * len * 0.5 + Math.cos(a) * rr * 0.2, -u * len + Math.sin(a) * rr * 0.05 + Math.sin(t + i) * 0.05]); }
      c.beginPath(); path(c, pts, false); c.strokeStyle = C.green; c.lineWidth = 0.16 * s; c.stroke();
      c.beginPath(); pts.forEach(([x, y], j) => { if (j % 3 === 0 && j < 20) { c.moveTo(x, y); c.lineTo(x + dir * 0.6 * s, y - 0.2 * s); } }); c.lineWidth = 0.1 * s; c.stroke();
    }
  });

  // ---------------------------------------------------------------- существа (props; flip: -1 — смотрит влево; run 0/1 — бежит)
  // тело богомола: брюшко-листок, длинная грудь, 4 ходильные ноги, хватательные передние лапы; голову рисует head(x, y)
  function mantisBody(P, p, t, { body = C.green, dark = C.greenDk, head }) {
    const c = P.c, s = p.s, run = p.run ?? 1, ph = t * 9 * run + p.seed;
    // ноги (дальние темнее)
    for (let i = 0; i < 4; i++) {
      const hipx = (i < 2 ? -0.6 : 0.8) * s, sw = Math.sin(ph + i * Math.PI / 2) * 1.2 * s * run, knee = [hipx + sw * 0.5 + (i < 2 ? -1 : 1) * 0.8 * s, -4.4 * s], foot = [hipx + sw + (i < 2 ? -1.6 : 1.4) * s, -Math.max(0, Math.sin(ph + i * Math.PI / 2)) * 0.8 * s * run];
      c.beginPath(); c.moveTo(hipx, -3.4 * s); c.lineTo(knee[0], knee[1]); c.lineTo(foot[0], foot[1]); c.strokeStyle = i % 2 ? dark : C.ink; c.lineWidth = 0.2 * s; c.stroke();
    }
    const bob = Math.abs(Math.sin(ph)) * 0.25 * s * run;
    c.save(); c.translate(0, -bob);
    const abd = [[0.3 * s, -3.6 * s], [-2 * s, -4.4 * s], [-5 * s, -3.8 * s], [-6 * s, -3 * s], [-4 * s, -2.7 * s], [-0.5 * s, -3 * s]];
    ink(P, abd, body, { seed: p.seed });
    hatch(P, () => path(c, abd), [-6 * s, -4.6 * s, 0.5 * s, -2.6 * s], { color: dark, step: 0.5 * s, angle: 95, lw: 0.08 * s, alpha: 0.7, seed: p.seed });
    const thorax = tube([[0, -3.4 * s], [1 * s, -5 * s], [1.8 * s, -6.4 * s]], 0.9 * s, 0.6 * s);
    ink(P, thorax, body, { seed: p.seed + 1 });
    // хватательные лапы
    const swing = Math.sin(ph * 0.5) * 0.3 * run;
    for (const off of [0, 0.35]) {
      const sh = [1.5 * s + off * s, -5.8 * s], el = [2.4 * s + off * s, -4.2 * s + swing * s], tip = [1.9 * s + off * s, -5.3 * s + swing * s];
      ink(P, tube([sh, el], 0.6 * s, 0.45 * s), off ? body : dark, { seed: p.seed + 2 });
      ink(P, tube([el, tip], 0.4 * s, 0.15 * s), off ? body : dark, { seed: p.seed + 3 });
    }
    head(1.9 * s, -6.7 * s);
    c.restore();
  }
  function mantisHeadBase(P, x, y, s, seed, col = C.green) {
    const pts = [[x - 0.9 * s, y - 0.6 * s], [x + 0.9 * s, y - 0.6 * s], [x + 0.2 * s, y + 0.9 * s], [x - 0.2 * s, y + 0.9 * s]];
    ink(P, pts, col, { seed });
    for (const sx of [-1, 1]) { glow(P, x + sx * 0.75 * s, y - 0.5 * s, 1.1 * s, C.glow, 0.35); ink(P, oval(x + sx * 0.75 * s, y - 0.5 * s, 0.42 * s, 0.5 * s, 12), C.glow, { seed: seed + sx, lw: 0.7 }); P.dot(x + sx * 0.8 * s, y - 0.45 * s, 0.14 * s, 0.14 * s, C.ink); }
    P.c.beginPath(); P.c.moveTo(x - 0.3 * s, y - 0.8 * s); P.c.quadraticCurveTo(x - 1 * s, y - 2.6 * s, x - 2 * s, y - 2.8 * s); P.c.moveTo(x + 0.3 * s, y - 0.8 * s); P.c.quadraticCurveTo(x + 0.6 * s, y - 2.7 * s, x + 1.4 * s, y - 3 * s); P.c.strokeStyle = C.ink; P.c.lineWidth = 0.08 * s; P.c.stroke();
  }
  def("mantis_trunk", "front", (P, p, t) => {
    const c = P.c, s = p.s; c.save(); c.scale(p.flip || 1, 1);
    mantisBody(P, p, t, { head: (x, y) => {
      ink(P, oval(x - 0.6 * s, y + 0.1 * s, 1.2 * s, 1.4 * s, 14), C.grey, { seed: p.seed + 5 });   // ухо слона
      mantisHeadBase(P, x, y, s, p.seed + 6);
      const sw = Math.sin(t * 3) * 0.8 * s;
      const tr = bez([x, y + 0.7 * s], [x + 2.5 * s, y + 2 * s + sw * 0.3], [x + 1.6 * s + sw, y + 4.5 * s], 14);
      ink(P, tube(tr, 0.7 * s, 0.35 * s), C.grey, { seed: p.seed + 7 });
      c.beginPath(); tr.forEach(([tx, ty], i) => { if (i % 2 === 0 && i > 1) { c.moveTo(tx - 0.25 * s, ty); c.lineTo(tx + 0.25 * s, ty + 0.05 * s); } }); c.strokeStyle = C.greyDk; c.lineWidth = 0.06 * s; c.stroke();
    } });
    c.restore();
  });
  def("mantis_deer", "front", (P, p, t) => {
    const c = P.c, n = p.n || 1;
    for (let k = n - 1; k >= 0; k--) {
      const q = { ...p, seed: p.seed + k * 17, s: p.s * (0.9 + (k % 3) * 0.08) };
      c.save(); c.translate(-k * 7.5 * p.s * (p.flip || 1), -(k % 2) * 0.8 * p.s); c.scale(p.flip || 1, 1);
      mantisBody(P, { ...q }, t + k * 0.13, { body: "#7c8a3e", dark: "#4b5324", head: (x, y) => {
        const s = q.s;
        for (const sx of [-1, 1]) {   // оленьи рога
          const base = [x + sx * 0.4 * s, y - 0.6 * s], top = [x + sx * 1.6 * s, y - 4 * s];
          c.beginPath(); c.moveTo(...base); c.quadraticCurveTo(x + sx * 0.3 * s, y - 2.5 * s, ...top);
          for (let j = 1; j <= 3; j++) { const bx = lerp(base[0], top[0], j / 4), by = lerp(base[1], top[1], j / 4); c.moveTo(bx, by); c.lineTo(bx + sx * 1 * s, by - 0.7 * s); }
          c.strokeStyle = "#d8c9a2"; c.lineWidth = 0.22 * s; c.stroke(); c.strokeStyle = C.ink; c.lineWidth = 0.06 * s; c.stroke();
        }
        mantisHeadBase(P, x, y, s, q.seed + 6, "#7c8a3e");
        ink(P, oval(x + 0.6 * s, y + 0.8 * s, 0.7 * s, 0.4 * s, 12), C.brown, { seed: q.seed + 9 }); P.dot(x + 1.1 * s, y + 0.75 * s, 0.12 * s, 0.1 * s, C.ink);
      } });
      c.restore();
    }
  });
  // маленький богомол (жалит Бориса): fly 0..1 — летит с размытыми крыльями
  def("mantis_small", "front", (P, p, t) => {
    const c = P.c; c.save(); c.scale(p.flip || 1, 1);
    if (p.fly) { c.save(); c.globalAlpha = 0.45 * p.fly; for (const a of [-0.5, 0.4]) { c.save(); c.translate(-1 * p.s, -5 * p.s); c.rotate(a + Math.sin(t * 40) * 0.3); ink(P, oval(-2 * p.s, 0, 2.2 * p.s, 0.7 * p.s, 14), "#cfe4d8", { seed: 5, lw: 0.4 }); c.restore(); } c.restore(); }
    mantisBody(P, { ...p, run: p.run ?? 0 }, t, { head: (x, y) => mantisHeadBase(P, x, y, p.s, p.seed + 6) });
    c.restore();
  });
  // капибара-кенгуру: зад и ноги кенгуру, перед — капибара; turn 0..1 — поворачивает морду к зрителю,
  // и видно, что вторая половина головы — богомол
  def("capykanga", "front", (P, p, t) => {
    const c = P.c, s = p.s, run = p.run ?? 1, ph = (t * 2.4 + p.seed * 0.1) % 1, air = run ? Math.sin(ph * Math.PI) : 0, turn = p.turn || 0;
    c.save(); c.scale(p.flip || 1, 1); c.translate(0, -air * 2.6 * s);
    const tail = tube(bez([-2.8 * s, -2.4 * s], [-5.5 * s, -1.6 * s + air * s], [-7 * s, -0.2 * s + air * 1.5 * s], 10), 1.3 * s, 0.25 * s);
    ink(P, tail, C.brown, { seed: p.seed });
    // задние ноги кенгуру: бедро + длинная ступня (в прыжке вытянута назад)
    const thigh = oval(-1.8 * s, -2.6 * s, 1.7 * s, 2.1 * s, 18, -0.4);
    const heel = [lerp(-1.4, -3.4, air) * s, lerp(-0.6, -0.9, air) * s], toe = [lerp(1.6, -1.2, air) * s, lerp(0, 0.6, air) * s];
    ink(P, tube([[-1.6 * s, -1.4 * s], heel, toe], 0.9 * s, 0.4 * s), C.brownDk, { seed: p.seed + 1 });
    ink(P, thigh, C.brown, { seed: p.seed + 2 });
    const body = oval(0.4 * s, -3.8 * s, 3.3 * s, 2 * s, 24, -0.12);
    ink(P, body, C.brown, { seed: p.seed + 3 });
    scribble(P, () => path(c, [...body]), [-3 * s, -6 * s, 4 * s, -1.6 * s], { color: C.brownDk, density: 2.2 / (s * s), len: 0.6 * s, lw: 0.07 * s, seed: p.seed, angle: 2.8 });
    // передние лапки капибары
    for (const dx of [2, 2.7]) limbInk(P, [[dx * s, -2.4 * s], [dx * s + 0.2 * s + air * 0.6 * s, -0.25 * s + air * 0.4 * s]], 0.5 * s, C.brownDk);
    // голова
    const hx = 3.6 * s, hy = -4.9 * s;
    if (turn < 0.5) {
      const head = [[hx - 1 * s, hy - 1.2 * s], [hx + 1.6 * s, hy - 1.1 * s], [hx + 2.3 * s, hy - 0.4 * s], [hx + 2.3 * s, hy + 0.7 * s], [hx - 0.2 * s, hy + 1.1 * s], [hx - 1.3 * s, hy + 0.4 * s]];
      ink(P, head, C.brown, { seed: p.seed + 5 });
      ink(P, oval(hx - 0.6 * s, hy - 1.3 * s, 0.35 * s, 0.3 * s, 10), C.brownDk, { seed: p.seed + 6, lw: 0.7 });
      P.dot(hx + 0.5 * s, hy - 0.4 * s, 0.16 * s, 0.16 * s, C.ink); P.dot(hx + 2.05 * s, hy - 0.05 * s, 0.12 * s, 0.08 * s, C.ink);
    } else {
      // анфас: левая половина — капибара, правая — богомол
      const k = Math.min(1, (turn - 0.5) * 2), cx = hx + 0.6 * s;
      const left = [[cx, hy - 1.4 * s], [cx - 1.4 * s, hy - 1.2 * s], [cx - 1.7 * s, hy + 0.2 * s], [cx - 1.1 * s, hy + 1.4 * s], [cx, hy + 1.6 * s]];
      ink(P, left, C.brown, { seed: p.seed + 7 });
      ink(P, oval(cx - 1.3 * s, hy - 1.4 * s, 0.35 * s, 0.3 * s, 10), C.brownDk, { seed: p.seed + 8, lw: 0.7 });
      P.dot(cx - 0.8 * s, hy - 0.3 * s, 0.17 * s, 0.17 * s, C.ink); P.dot(cx - 0.35 * s, hy + 0.95 * s, 0.1 * s, 0.07 * s, C.ink);
      c.save(); c.globalAlpha = k;
      const right = [[cx, hy - 1.4 * s], [cx + 1.9 * s, hy - 1.6 * s], [cx + 1.2 * s, hy + 0.2 * s], [cx + 0.35 * s, hy + 1.6 * s], [cx, hy + 1.6 * s]];
      ink(P, right, C.green, { seed: p.seed + 9 });
      hatch(P, () => path(c, right), [cx, hy - 1.7 * s, cx + 2 * s, hy + 1.7 * s], { color: C.greenDk, step: 0.25 * s, angle: 40, lw: 0.05 * s, alpha: 0.6, seed: p.seed });
      glow(P, cx + 1.1 * s, hy - 0.8 * s, 1.6 * s, C.glow, 0.5);
      ink(P, oval(cx + 1.05 * s, hy - 0.75 * s, 0.6 * s, 0.7 * s, 14), C.glow, { seed: p.seed + 10, lw: 0.8 }); P.dot(cx + 1.15 * s, hy - 0.7 * s, 0.18 * s, 0.18 * s, C.ink);
      c.beginPath(); c.moveTo(cx + 0.4 * s, hy - 1.5 * s); c.quadraticCurveTo(cx + 1 * s, hy - 3.2 * s, cx + 2.4 * s, hy - 3.4 * s); c.strokeStyle = C.ink; c.lineWidth = 0.08 * s; c.stroke();
      ink(P, [[cx + 0.1 * s, hy + 1.3 * s], [cx + 0.6 * s, hy + 1.9 * s], [cx + 0.2 * s, hy + 1.7 * s]], C.greenLt, { seed: p.seed + 11, lw: 0.7 });
      // рваный шов посередине
      c.beginPath(); c.moveTo(cx, hy - 1.4 * s); for (let i = 1; i <= 6; i++) c.lineTo(cx + (i % 2 ? 0.15 : -0.15) * s, hy - 1.4 * s + i * 0.5 * s); c.strokeStyle = C.ink; c.lineWidth = 0.07 * s; c.stroke();
      c.restore();
    }
    c.restore();
  });

  SAM.DUSK = { C, background, overlay, scribble, hatch, glow, ink };
  SAM.drawHuman = drawHuman;
})();
