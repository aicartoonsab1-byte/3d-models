  // ================================================================ ГРАФИКА В ДУХЕ LIMBO
  // Вклеивается в game.js сборщиком (маркер @@NIGHT@@).
  // Серый туманный мир: чёрные силуэты на переднем плане, фон — слои силуэтов, светлеющие в дымке,
  // полосы тумана, косые лучи, зерно плёнки, мерцание и виньетка. Глаза существ светятся в темноте.
  // Бледное «солнце» в дымке — на самом деле глаз-наблюдатель: открывается с прозрением шарика.
  // Единственный цвет в мире — свечение шарика (настроение и состояние).

  const TPX = 32;
  const SIL = "#070707";
  const GLOW = {
    neutral: [255, 233, 196], happy: [255, 205, 80], scared: [150, 214, 255], angry: [255, 70, 50], sad: [80, 120, 255],
    awe: [200, 150, 255], pray: [255, 244, 176], dizzy: [255, 140, 210], suspicious: [185, 255, 100], determined: [255, 150, 45],
    glitch: [60, 240, 160],
  };
  // Небо по актам: [верх, дымка у горизонта, низ]
  const SKIES = {
    meadow: ["#5d5d58", "#c9c9c1", "#7d7d77"], cave: ["#1d1d1b", "#5e5d57", "#2c2c29"], city: ["#55595b", "#b9bdbd", "#6f7374"],
    glitch: ["#4f4f4c", "#bdbdb5", "#6c6c67"], void: ["#0b0b0b", "#2a2a28", "#121212"],
  };
  let seedN = 1;
  const rnd = () => { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; };
  const rgb = (c, al) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;

  // ---------------------------------------------------------------- спрайты → силуэты (x2) со светящимися глазами
  // Координаты глаз в исходных спрайтах (x, y, радиус) — из Tools/art/generate_sprites.py
  const EYES = {
    boss_stag_idle: [[40, 12, 1.6]], boss_stag_atk: [[40, 6, 1.8]],
    boss_watcher_idle: [[24, 26, 3.2], [11, 20, 1], [36, 20, 1], [14, 33, 1], [33, 33, 1], [24, 14, 1]],
    boss_watcher_atk: [[24, 26, 4], [11, 20, 1.2], [36, 20, 1.2], [14, 33, 1.2], [33, 33, 1.2], [24, 14, 1.2]],
    boss_worm_peek: [[12, 9, 2]], boss_worm_idle: [[12, 6, 2]], boss_worm_atk: [[12, 6, 2.4]],
    boss_keeper_idle: [[54, 17, 2.2]], boss_keeper_atk: [[54, 17, 2.8]],
    trap_crusher: [[8, 6, 2]], deco_1: [[12, 6, 0.8]], deco_2: [[8, 5, 1.2]],
    mech_portal_0: [[7.5, 16, 2.2]], mech_portal_1: [[7.5, 16, 1.6]],
    obj_switch_off: [[8, 8, 1.4], [23, 8, 1.4]], obj_switch_on: [[8, 8, 1.8], [23, 8, 1.8]],
    obj_checkpoint_on: [[7, 1.5, 1.8]],
  };
  const NS = {};
  function nightSprite(name) {
    if (NS[name]) return NS[name];
    const im = IMG[name]; if (!im) return null;
    const w = im.width, h = im.height, out = document.createElement("canvas");
    out.width = w * 2; out.height = h * 2;
    const oc = out.getContext("2d");
    oc.imageSmoothingEnabled = false;
    oc.drawImage(im, 0, 0, w * 2, h * 2);
    oc.globalCompositeOperation = "source-in";
    // светящиеся штуки (осколок, кусочки шарика, искры) — светлые; всё остальное — чёрный силуэт
    const bright = name === "obj_fragment" || name === "ball_blob" || name === "fx_pixel" || name === "fx_gaze";
    oc.fillStyle = bright ? "#f2efe8" : SIL; oc.fillRect(0, 0, w * 2, h * 2);
    oc.globalCompositeOperation = "source-over";
    for (const [ex, ey, r] of EYES[name] || []) {
      const g = oc.createRadialGradient(ex * 2 + 1, ey * 2 + 1, 0, ex * 2 + 1, ey * 2 + 1, r * 2 + 3);
      g.addColorStop(0, "rgba(250,248,240,1)"); g.addColorStop(0.5, "rgba(250,248,240,0.9)"); g.addColorStop(1, "rgba(250,248,240,0)");
      oc.fillStyle = g; oc.fillRect(ex * 2 - r * 2 - 3, ey * 2 - r * 2 - 3, r * 4 + 8, r * 4 + 8);
    }
    if (name === "obj_exit") {           // дверной проём светится изнутри
      const g = oc.createLinearGradient(0, 18, 0, h * 2);
      g.addColorStop(0, "rgba(235,232,222,0.95)"); g.addColorStop(1, "rgba(235,232,222,0.35)");
      oc.fillStyle = g; oc.fillRect(8, 20, 18, h * 2 - 20);
    }
    return (NS[name] = out);
  }

  function vnoise(x, y) {
    const hh = (i, j) => { let n = i * 374761393 + j * 668265263; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) & 1023) / 1023; };
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = hh(xi, yi), b = hh(xi + 1, yi), c = hh(xi, yi + 1), d = hh(xi + 1, yi + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  }

  // ---------------------------------------------------------------- рельеф: чёрный органичный силуэт с травой и корнями
  const BAKE = new Set(["#", "<", ">", "~"]);
  function bakeWorld() {
    const W = L.w, H = L.h, R = 8, fw = W * R, fh = (H + 2) * R;
    const field = new Float32Array(fw * fh), tmp = new Float32Array(fw * fh);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (BAKE.has(at(x, y)))
      for (let yy = 0; yy < R; yy++) for (let xx = 0; xx < R; xx++) field[((H - 1 - y) * R + yy + R) * fw + x * R + xx] = 1;
    const blur = (a, b, r) => {
      for (let y = 0; y < fh; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * fw + Math.max(0, Math.min(fw - 1, x))];
        for (let x = 0; x < fw; x++) { b[y * fw + x] = s / (2 * r + 1); s += a[y * fw + Math.min(fw - 1, x + r + 1)] - a[y * fw + Math.max(0, x - r)]; } }
      for (let x = 0; x < fw; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.max(0, Math.min(fh - 1, y)) * fw + x];
        for (let y = 0; y < fh; y++) { a[y * fw + x] = s / (2 * r + 1); s += b[Math.min(fh - 1, y + r + 1) * fw + x] - b[Math.max(0, y - r) * fw + x]; } }
    };
    blur(field, tmp, 2); blur(field, tmp, 2);
    const F = (px, py) => {
      const fx = px / TPX * R - 0.5, fy = py / TPX * R - 0.5 + R;
      const x0 = Math.max(0, Math.min(fw - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(fh - 2, Math.floor(fy)));
      const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
      const a = field[y0 * fw + x0], b = field[y0 * fw + x0 + 1], c = field[(y0 + 1) * fw + x0], e = field[(y0 + 1) * fw + x0 + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
    };
    const cw = W * TPX, ch = H * TPX;
    const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    const cx = cv.getContext("2d"), img = cx.createImageData(cw, ch), o = img.data;
    const inside = (px, py) => F(px, py) + (vnoise(px / 30, py / 24) - 0.5) * 0.45 + (vnoise(px / 8 + 50, py / 8) - 0.5) * 0.1 >= 0.5;
    for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
      if (!inside(px, py)) continue;
      const j = (py * cw + px) * 4; o[j] = 7; o[j + 1] = 7; o[j + 2] = 7; o[j + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    // трава на верхних кромках, корни под навесами, камешки
    seedN = 13 + W * 3;
    cx.fillStyle = SIL; cx.strokeStyle = SIL;
    for (let px = 0; px < cw; px += 2) {
      for (let py = 1; py < ch - 1; py++) {
        const here = inside(px, py), up = inside(px, py - 1);
        if (here && !up) {                                   // верхняя кромка
          const r = rnd();
          if (r < 0.55) {                                    // травинки
            const hgt = 2 + rnd() * (r < 0.1 ? 11 : 6), lean = (rnd() - 0.5) * 3;
            cx.lineWidth = r < 0.1 ? 1.5 : 1;
            cx.beginPath(); cx.moveTo(px, py + 1); cx.quadraticCurveTo(px + lean * 0.3, py - hgt * 0.6, px + lean, py - hgt); cx.stroke();
          } else if (r > 0.992) { cx.beginPath(); cx.ellipse(px, py, 3 + rnd() * 4, 2 + rnd() * 2, 0, Math.PI, 0); cx.fill(); }   // камень
          break;
        }
        if (!here && up && rnd() < 0.08) {                   // корни свисают с потолка
          const len = 4 + rnd() * 16;
          cx.lineWidth = 1;
          cx.beginPath(); cx.moveTo(px, py - 1); cx.quadraticCurveTo(px + (rnd() - 0.5) * 6, py + len * 0.5, px + (rnd() - 0.5) * 4, py + len); cx.stroke();
        }
      }
    }
    // лёд — мокрый блик на кромке
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === "~") {
      const sx = x * TPX, sy = (H - 1 - y) * TPX;
      const g = cx.createLinearGradient(sx, 0, sx + TPX, 0);
      g.addColorStop(0, "rgba(200,205,205,0)"); g.addColorStop(0.5, "rgba(200,205,205,0.55)"); g.addColorStop(1, "rgba(200,205,205,0)");
      cx.fillStyle = g; cx.fillRect(sx, sy + 1, TPX, 2);
    }
    L.night = { world: cv };
    bakeBackdrop();
  }

  // ---------------------------------------------------------------- фон: слои силуэтов в тумане
  function drawTree(c, x, base, h, w) {
    c.beginPath(); c.moveTo(x - w, base); c.quadraticCurveTo(x - w * 0.3, base - h * 0.5, x - w * 0.25, base - h);
    c.lineTo(x + w * 0.25, base - h); c.quadraticCurveTo(x + w * 0.3, base - h * 0.5, x + w, base); c.fill();
    c.lineWidth = Math.max(1, w * 0.18);
    for (let i = 0; i < 5; i++) {        // голые ветви
      const by = base - h * (0.45 + rnd() * 0.5), dir = rnd() < 0.5 ? -1 : 1, len = h * (0.15 + rnd() * 0.25);
      c.beginPath(); c.moveTo(x, by); c.quadraticCurveTo(x + dir * len * 0.5, by - len * 0.2, x + dir * len, by - len * 0.5 - rnd() * 10); c.stroke();
    }
  }
  function bakeLayer(kind, pal, shade, seed) {
    const W = 1400, H = 360, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c = cv.getContext("2d"); seedN = seed;
    c.fillStyle = shade; c.strokeStyle = shade;
    const ground = (h0) => { c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 20) c.lineTo(x, h0 + Math.sin(x / 140 + seed) * 14 + vnoise(x / 60, seed) * 16); c.lineTo(W, H); c.fill(); };
    if (pal === "meadow" || pal === "glitch") {
      ground(kind === "far" ? 250 : kind === "mid" ? 275 : 300);
      const n = kind === "far" ? 14 : kind === "mid" ? 9 : 6;
      for (let i = 0; i < n; i++) {
        const x = (i + rnd() * 0.7) * W / n, s = kind === "far" ? 0.55 : kind === "mid" ? 0.8 : 1.1;
        drawTree(c, x, (kind === "far" ? 262 : kind === "mid" ? 290 : 320), (160 + rnd() * 140) * s, (6 + rnd() * 6) * s);
      }
      if (pal === "glitch") { c.clearRect(rnd() * W, 0, 90, H); c.clearRect(rnd() * W, 0, 50, H); }
    } else if (pal === "cave") {
      for (let x = 0; x < W; x += 30 + rnd() * 50) {       // сталактиты и сталагмиты
        const w = 12 + rnd() * 30, hTop = 40 + rnd() * (kind === "far" ? 90 : 140), hBot = 30 + rnd() * 110;
        c.beginPath(); c.moveTo(x - w, 0); c.lineTo(x, hTop); c.lineTo(x + w, 0); c.fill();
        c.beginPath(); c.moveTo(x - w, H); c.lineTo(x + rnd() * 6, H - hBot); c.lineTo(x + w, H); c.fill();
      }
      c.fillRect(0, 0, W, 18);
      ground(kind === "near" ? 320 : 300);
    } else if (pal === "city") {
      ground(kind === "far" ? 280 : 300);
      for (let x = 0; x < W; x += 60 + rnd() * 90) {       // фабрики, трубы, краны
        const w = 30 + rnd() * 70, top = (kind === "far" ? 120 : 160) + rnd() * 100;
        c.fillRect(x, top, w, H - top);
        if (rnd() < 0.6) c.fillRect(x + w * 0.3, top - 60 - rnd() * 80, 8 + rnd() * 6, 90);
        if (rnd() < 0.3) { c.lineWidth = 3; c.beginPath(); c.moveTo(x, top - 30); c.lineTo(x + 160, top - 90); c.lineTo(x + 170, top - 20); c.stroke(); }
      }
      c.lineWidth = 6; c.beginPath(); c.moveTo(0, 230); for (let x = 0; x < W; x += 80) c.lineTo(x, 230 + (x % 160 ? 10 : -6)); c.stroke();   // трубопровод
    } else if (pal === "void") {
      for (let i = 0; i < 7; i++) {                          // парящие обломки
        const x = rnd() * W, y = 60 + rnd() * 220, s = 10 + rnd() * 34;
        c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y - s * 0.2); c.lineTo(x + s * 0.4, y + s * 0.9); c.fill();
      }
    }
    return cv;
  }
  function bakeBackdrop() {
    const pal = L.pal, sk = SKIES[pal] || SKIES.meadow;
    // тон силуэтов: дальний — почти небо, ближний — тёмный
    const mix = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`; };
    const layers = [
      { cv: bakeLayer("far", pal, mix(sk[1], "#070707", 0.28), 11), f: 0.15, blur: 3 },
      { cv: bakeLayer("mid", pal, mix(sk[1], "#070707", 0.55), 23), f: 0.35, blur: 1.5 },
      { cv: bakeLayer("near", pal, mix(sk[1], "#070707", 0.8), 37), f: 0.6, blur: 0 },
    ];
    // размытие дальних слоёв (где поддерживается ctx.filter)
    for (const l of layers) if (l.blur) {
      const b = document.createElement("canvas"); b.width = l.cv.width; b.height = l.cv.height;
      const bc = b.getContext("2d");
      try { bc.filter = `blur(${l.blur}px)`; } catch (e) { }
      bc.drawImage(l.cv, 0, 0); l.cv = b;
    }
    // зерно плёнки — несколько кадров, меняются каждый кадр
    const grain = [];
    for (let k = 0; k < 4; k++) {
      const g = document.createElement("canvas"); g.width = 320; g.height = 180;
      const gc = g.getContext("2d"), id = gc.createImageData(320, 180);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 26; }
      gc.putImageData(id, 0, 0); grain.push(g);
    }
    // небо (градиент с дымкой у горизонта) и виньетка — заранее
    const sky = document.createElement("canvas"); sky.width = T.VW; sky.height = T.VH;
    const sc = sky.getContext("2d"), sg = sc.createLinearGradient(0, 0, 0, T.VH);
    sg.addColorStop(0, sk[0]); sg.addColorStop(0.62, sk[1]); sg.addColorStop(1, sk[2]);
    sc.fillStyle = sg; sc.fillRect(0, 0, T.VW, T.VH);
    const vig = document.createElement("canvas"); vig.width = T.VW; vig.height = T.VH;
    const vc = vig.getContext("2d"), vg = vc.createRadialGradient(T.VW / 2, T.VH * 0.55, T.VH * 0.25, T.VW / 2, T.VH * 0.55, T.VW * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(0.7, "rgba(0,0,0,0.35)"); vg.addColorStop(1, "rgba(0,0,0,0.85)");
    vc.fillStyle = vg; vc.fillRect(0, 0, T.VW, T.VH);
    Object.assign(L.night, { layers, grain, sky, vig, fogPhase: Math.random() * 10 });
  }

  // ---------------------------------------------------------------- «солнце» в дымке — глаз наблюдателя
  function stageNowSafe() { try { return stageNow(); } catch (e) { return L.data.awareness || 0; } }
  function drawSunEye(c, t) {
    const aw = stageNowSafe();
    const ex = T.VW * 0.7 - ((CO.cx * TPX * 0.05) % 200), ey = 95 + Math.sin(t * 0.2) * 3;
    const flash = L.eyeFlash && t < L.eyeFlash ? 1 : 0;
    // бледный диск в тумане
    const R = 46 + aw * 6 + flash * 10;
    const g = c.createRadialGradient(ex, ey, 0, ex, ey, R * 2.4);
    g.addColorStop(0, `rgba(245,244,238,${0.85 + flash * 0.15})`); g.addColorStop(0.35, "rgba(235,234,228,0.35)"); g.addColorStop(1, "rgba(235,234,228,0)");
    c.fillStyle = g; c.fillRect(ex - R * 2.4, ey - R * 2.4, R * 4.8, R * 4.8);
    if (aw < 3) return;
    // с 3-й стадии прозрения диск открывается — это глаз. Зрачок следит за курсором наблюдателя.
    const open = Math.min(1, (aw - 2) / 2) * (Math.sin(t * 0.33) > 0.993 ? 0.1 : 1);
    const rx = R * 1.1, ry = R * 0.5 * open;
    c.save();
    c.beginPath(); c.ellipse(ex, ey, rx, Math.max(0.5, ry), 0, 0, Math.PI * 2); c.clip();
    c.fillStyle = "rgba(250,249,244,0.9)"; c.fillRect(ex - rx, ey - rx, rx * 2, rx * 2);
    const target = mouse.world || { x: ball.x, y: ball.y }, tp = toScreen(target.x, target.y);
    const ang = Math.atan2(tp.y - ey, tp.x - ex), d = Math.min(1, Math.hypot(tp.x - ex, tp.y - ey) / 320);
    const px = ex + Math.cos(ang) * rx * 0.35 * d, py = ey + Math.sin(ang) * ry * 0.3 * d;
    const pg = c.createRadialGradient(px, py, 0, px, py, R * 0.42);
    pg.addColorStop(0, "rgba(10,10,10,1)"); pg.addColorStop(0.75, "rgba(10,10,10,0.95)"); pg.addColorStop(1, "rgba(10,10,10,0)");
    c.fillStyle = pg; c.beginPath(); c.arc(px, py, R * 0.42, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // ---------------------------------------------------------------- свечение шарика (цвет = настроение, яркость = состояние)
  const glowState = { c: [255, 233, 196], r: 1 };
  function glowTarget() {
    let mood = ball.mood || "neutral";
    const emo = ball.emo && game.time < ball.emo.until ? ball.emo : null;
    let k = emo ? emo.k : 0.4, bright = 1;
    if (ball.state === "splat" || ball.state === "dead") { bright = 0.15 + Math.random() * 0.08; mood = "sad"; }
    if (ball.state === "reform") bright = 0.4 + (1 - Math.max(0, ball.timer) / 0.45) * 0.9;
    if (brain && brain.thinking) bright *= 0.85 + 0.25 * Math.sin(game.time * 6);
    let c = GLOW[mood] || GLOW.neutral;
    if (mood === "glitch") c = Math.floor(game.time * 10) % 2 ? GLOW.glitch : [255, 60, 240];
    const courage = typeof MIND !== "undefined" ? MIND.traits.courage : 0.5;
    const aware = typeof MIND !== "undefined" ? MIND.traits.awareness / 5 : 0.2;
    return { c, r: (0.8 + k * 0.5 + aware * 0.4) * (0.85 + courage * 0.3) * bright };
  }
  function updateGlow(dt) {
    const g = glowTarget(), a = Math.min(1, dt * 4);
    for (let i = 0; i < 3; i++) glowState.c[i] += (g.c[i] - glowState.c[i]) * a;
    glowState.r += (g.r - glowState.r) * a;
  }

  // ---------------------------------------------------------------- кадр: фон и рельеф
  function renderNight(dt) {
    const t = game.time, N = L.night; if (!N) return;
    updateGlow(dt || 1 / 60);
    const darkT = game.cutscene && L.dissolve >= 0 ? Math.min(1, L.dissolve) : 0;
    ctx.drawImage(N.sky, 0, 0);
    if (!L.swHidden) drawSunEye(ctx, t);
    // косые лучи света
    if (L.pal !== "void") {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        const x0 = T.VW * (0.45 + i * 0.18) - ((CO.cx * TPX * 0.08) % 300), a = 0.045 + 0.02 * Math.sin(t * 0.4 + i);
        const g = ctx.createLinearGradient(x0, 0, x0 - 160, T.VH);
        g.addColorStop(0, `rgba(255,255,250,${a})`); g.addColorStop(1, "rgba(255,255,250,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + 40 + i * 10, 0); ctx.lineTo(x0 - 110, T.VH); ctx.lineTo(x0 - 200, T.VH); ctx.fill();
      }
      ctx.restore();
    }
    // слои силуэтов с параллаксом и полосами тумана между ними
    const vy = (CO.cy - L.h / 2) * TPX * 0.12;
    N.layers.forEach((l, i) => {
      const w = l.cv.width, off = ((CO.cx * TPX * l.f) % w + w) % w;
      ctx.drawImage(l.cv, -off, vy * (i + 1) * 0.6); ctx.drawImage(l.cv, w - off, vy * (i + 1) * 0.6);
      const fy = 180 + i * 50 + Math.sin(t * 0.15 + i + N.fogPhase) * 12, fx = (t * (6 + i * 4)) % T.VW;
      const fg = ctx.createLinearGradient(0, fy - 50, 0, fy + 50);
      fg.addColorStop(0, "rgba(220,220,214,0)"); fg.addColorStop(0.5, `rgba(220,220,214,${L.pal === "void" ? 0.05 : 0.16})`); fg.addColorStop(1, "rgba(220,220,214,0)");
      ctx.fillStyle = fg; ctx.fillRect(0, fy - 50, T.VW, 100);
      ctx.globalAlpha = 0.08; ctx.fillStyle = "#ddd"; ctx.fillRect(fx - T.VW, fy - 8, T.VW * 0.4, 16); ctx.globalAlpha = 1;
    });
    // рельеф — чёрный силуэт
    const sx = Math.round((CO.cx - T.VW / TPX / 2) * TPX), sy = Math.round((L.h - CO.cy - T.VH / TPX / 2) * TPX);
    ctx.globalAlpha = 1 - darkT * 0.9;
    ctx.drawImage(N.world, sx, sy, T.VW, T.VH, 0, 0, T.VW, T.VH);
    ctx.globalAlpha = 1;
    if (darkT > 0) {                          // выключение мира: всё тонет в белом тумане
      ctx.fillStyle = `rgba(215,215,210,${darkT * 0.85})`; ctx.fillRect(0, 0, T.VW, T.VH);
    }
  }

  // Плёнка (виньетка, зерно, мерцание) — ПОД шариком; затем цветной ореол и сам шарик поверх:
  // в сером мире он остаётся единственным чистым цветом.
  function renderGlow() {
    const N = L.night;
    if (N) {
      ctx.drawImage(N.vig, 0, 0);
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(N.grain[Math.floor(game.time * 24) % N.grain.length], 0, 0, T.VW, T.VH);
      ctx.restore();
      const fl = 0.03 * Math.sin(game.time * 23) * Math.sin(game.time * 7.3);
      ctx.fillStyle = fl > 0 ? `rgba(255,255,255,${fl})` : `rgba(0,0,0,${-fl})`; ctx.fillRect(0, 0, T.VW, T.VH);
    }
    if (ball && (ball.visible || ball.pancake || ball.blobs)) {
      const p = toScreen(ball.x, ball.y), R = 150 * glowState.r, c = glowState.c;
      // цветная дымка (обычное смешивание — видна и на светлом тумане)
      const tint = ctx.createRadialGradient(p.x, p.y, 6, p.x, p.y, R * 0.75);
      tint.addColorStop(0, rgb(c, 0.42)); tint.addColorStop(0.4, rgb(c, 0.16)); tint.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = tint; ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2);
      // яркое ядро свечения
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const h = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, R * 0.35);
      h.addColorStop(0, rgb(c, 0.6)); h.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = h; ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2);
      ctx.restore();
      drawBall();
    }
  }

  // Сам шарик: светящийся шар с лицом (единственный цвет в сером мире)
  function drawBall() {
    const c = glowState.c;
    if (ball.visible) {
      const p = toScreen(ball.x, ball.y - T.R);
      const emo = ball.emo && game.time < ball.emo.until ? ball.emo : null;
      if (emo && (emo.mood === "scared" || emo.mood === "angry") && emo.k > 0.4) p.x += Math.round((Math.random() - 0.5) * 4 * emo.k);
      let sx = ball.sx, sy = ball.sy;
      if (!ball.grounded && ball.alive()) { const s = Math.min(0.18, Math.abs(ball.vy) / 30); sx *= 1 - s * 0.6; sy *= 1 + s; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sx, sy);
      const r = T.R * TPX;
      const core = ctx.createRadialGradient(-r * 0.3, -r - r * 0.3, 1, 0, -r, r);
      core.addColorStop(0, "rgba(255,255,250,1)"); core.addColorStop(0.45, rgb(c.map((v) => Math.min(255, v + 40)), 1)); core.addColorStop(1, rgb(c.map((v) => v * 0.55), 1));
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, -r, r, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(0, -r); ctx.rotate(ball.roll);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < 5; i++) { const a = i * 1.26; ctx.fillRect(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, 1.5, 1.5); }
      ctx.restore();
      if (ball.lookLeft) ctx.scale(-1, 1);
      ctx.globalAlpha = 0.85; ctx.drawImage(IMG["face_" + ball.mood] || IMG.face_neutral, -16, -32, 32, 32); ctx.globalAlpha = 1;
      ctx.restore();
    }
    if (ball.pancake) {
      const k = Math.min(1, ball.pancake.t / 0.25), e = 1 - Math.pow(1 - k, 3);
      const p = toScreen(ball.x, ball.pancake.up ? ball.y + T.R - 0.2 : ball.y - T.R + 0.12);
      ctx.fillStyle = rgb(c.map((v) => v * 0.6), 0.95);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 26 * (0.6 + 0.48 * e), 3.5 * (2.2 - 1.3 * e), 0, 0, Math.PI * 2); ctx.fill();
    }
    if (ball.blobs) {
      const k = 1 - Math.max(0, ball.timer) / 0.45, e = k * k * (3 - 2 * k);
      for (const b of ball.blobs) {
        const p = toScreen(ball.x + b.x * (1 - e), ball.y + b.y * (1 - e) + Math.sin(e * Math.PI) * 0.4);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 7);
        g.addColorStop(0, "rgba(255,255,250,1)"); g.addColorStop(1, rgb(c, 0));
        ctx.fillStyle = g; ctx.fillRect(p.x - 7, p.y - 7, 14, 14);
      }
    }
    if (ball.bits) for (const b of ball.bits) { const p = toScreen(ball.x + b.x, ball.y + b.y); ctx.fillStyle = rgb(c, 0.9); ctx.fillRect(p.x, p.y, 2, 2); }
  }

  // ---------------------------------------------------------------- свои существа кампании (силуэт из фигур + светящиеся глаза)
  // Формат — Design/CAMPAIGN_FORMAT.md; тот же рисунок, что Tools/art/boss_preview.py.
  const CB = {};
  function customBossCanvas(def, frame) {
    const key = JSON.stringify(def.shape).length + ":" + (def.title || "") + ":" + frame;
    if (CB[key]) return CB[key];
    const [wt, ht] = def.size || [3, 3], W = Math.round(wt * TPX), H = Math.round(ht * TPX);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H + 8;
    const c = cv.getContext("2d"), atk = frame === "atk";
    const dy = atk ? ((def.atk && def.atk.dy) != null ? def.atk.dy : -4) : 0;
    const sx = W / 100, sy = H / 100, P = (x, y) => [x * sx, (y + dy) * sy + 8];
    c.fillStyle = SIL; c.strokeStyle = SIL; c.lineCap = "round"; c.lineJoin = "round";
    const eyes = [];
    for (const part of def.shape || []) {
      if (part.e) { const [cx, cy, rx, ry] = part.e, [x, y] = P(cx, cy); c.beginPath(); c.ellipse(x, y, rx * sx, ry * sy, 0, 0, Math.PI * 2); c.fill(); }
      else if (part.c) { const [cx, cy, r] = part.c, [x, y] = P(cx, cy); c.beginPath(); c.ellipse(x, y, r * sx, r * sy, 0, 0, Math.PI * 2); c.fill(); }
      else if (part.p) { c.beginPath(); for (let i = 0; i + 1 < part.p.length; i += 2) { const [x, y] = P(part.p[i], part.p[i + 1]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.fill(); }
      else if (part.l) { c.lineWidth = Math.max(1, (part.w || 2) * (sx + sy) / 2); c.beginPath(); for (let i = 0; i + 1 < part.l.length; i += 2) { const [x, y] = P(part.l[i], part.l[i + 1]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
      else if (part.eye) eyes.push(part.eye);
    }
    if (frame !== "blink") {
      const k = atk ? ((def.atk && def.atk.eyes) || 1.5) : 1;
      for (const [ex, ey, r] of eyes) {
        const [x, y] = P(ex, ey), rr = r * (sx + sy) / 2 * k;
        const g = c.createRadialGradient(x, y, 0, x, y, rr * 2.6);
        g.addColorStop(0, "rgba(250,248,240,1)"); g.addColorStop(0.4, "rgba(250,248,240,0.9)"); g.addColorStop(1, "rgba(250,248,240,0)");
        c.fillStyle = g; c.fillRect(x - rr * 2.6, y - rr * 2.6, rr * 5.2, rr * 5.2);
      }
    }
    return (CB[key] = cv);
  }
  function drawCustomBoss(t, frame, wx, wy, peek, flip) {
    const cv = customBossCanvas(t.def, frame), p = toScreen(wx, wy);
    ctx.save(); ctx.translate(p.x, p.y); if (flip) ctx.scale(-1, 1);
    if (peek) { ctx.beginPath(); ctx.rect(-cv.width / 2, -cv.height / 2, cv.width, cv.height * 0.45); ctx.clip(); }
    ctx.drawImage(cv, Math.round(-cv.width / 2), Math.round(-cv.height / 2) - 4);
    ctx.restore();
  }
