  // ================================================================ ГРАФИКА «МУЛЬТ» (в духе самодельных мультов ТО «420»)
  // Вклеивается в game.js сборщиком сразу после limbo.js. Нарисовано «от руки»:
  // плоские грязноватые цвета, толстый неровный чёрный контур, линии «кипят» (перерисовываются ~6 раз в секунду),
  // бумажная фактура. Шарик — цветной пластилиновый колобок с глазами-блюдцами, цвет — его настроение.
  // Солнце с рожицей; с 3-й стадии прозрения оно оказывается Всевидящим Оком.

  const INK = "#17110d";
  const MPAL = {   // небо [верх, низ], дальние холмы, ближние, земля, верхний слой (трава), штрих
    meadow: { sky: ["#a9cfd6", "#efe6c6"], far: "#a8bf97", near: "#86a568", fill: "#a2774c", top: "#79a342", hatch: "#7b5634" },
    cave:   { sky: ["#3e3530", "#6d5a48"], far: "#5d4d40", near: "#4a3d33", fill: "#6b5341", top: "#8e7862", hatch: "#4c3a2d" },
    city:   { sky: ["#c7c0ac", "#eee2c2"], far: "#aaa08b", near: "#8b816e", fill: "#857a6c", top: "#a79c8a", hatch: "#62584c" },
    glitch: { sky: ["#8fa3a6", "#dcd6c0"], far: "#8aa0a0", near: "#6f8a86", fill: "#8c6c4f", top: "#b07a4f", hatch: "#664b34" },
    void:   { sky: ["#241f2a", "#4b3f52"], far: "#3a3242", near: "#2e2735", fill: "#4a3f52", top: "#6d5e78", hatch: "#2c2433" },
  };
  const mp = () => MPAL[L.pal] || MPAL.meadow;
  const boilK = () => Math.floor(game.time * 6) % 2;          // кадр «кипения» линий
  let mseed = 1;
  const mr = () => { mseed = (mseed * 16807) % 2147483647; return (mseed - 1) / 2147483646; };

  // Неровный контур: ломаная с дрожанием (для обводок «от руки»)
  function wobblePath(c, pts, amp, closed, seed) {
    mseed = seed || 7;
    c.beginPath();
    pts.forEach(([x, y], i) => { const dx = (mr() - 0.5) * amp, dy = (mr() - 0.5) * amp; i ? c.lineTo(x + dx, y + dy) : c.moveTo(x + dx, y + dy); });
    if (closed) c.closePath();
  }
  function blobPts(cx, cy, rx, ry, n, seed, rough = 0.12) {
    mseed = seed; const out = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 1 + (mr() - 0.5) * rough * 2; out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    return out;
  }

  // ---------------------------------------------------------------- спрайты: родные цвета + толстый чёрный контур (2 кадра кипения)
  const MS = {};
  function multSprite(name) {
    const k = boilK(), key = name + ":" + k;
    if (MS[key]) return MS[key];
    const im = IMG[name]; if (!im) return null;
    const w = im.width * 2, h = im.height * 2, pad = 3;
    const base = document.createElement("canvas"); base.width = w; base.height = h;
    const bc = base.getContext("2d"); bc.imageSmoothingEnabled = false; bc.drawImage(im, 0, 0, w, h);
    const ink = document.createElement("canvas"); ink.width = w; ink.height = h;
    const ic = ink.getContext("2d"); ic.drawImage(base, 0, 0); ic.globalCompositeOperation = "source-in"; ic.fillStyle = INK; ic.fillRect(0, 0, w, h);
    const out = document.createElement("canvas"); out.width = w + pad * 2; out.height = h + pad * 2;
    const oc = out.getContext("2d");
    const offs = k ? [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -1], [1, 2], [2, -2], [-1, 2]] : [[-2, 0], [2, 1], [0, -2], [1, 2], [-2, 2], [2, -1], [-1, -2], [2, 2]];
    for (const [dx, dy] of offs) oc.drawImage(ink, pad + dx, pad + dy);
    oc.drawImage(base, pad, pad);
    return (MS[key] = out);
  }

  // ---------------------------------------------------------------- рельеф: плоская заливка, верхний слой, чёрный неровный контур
  const MBAKE = new Set(["#", "<", ">", "~"]);
  function multBake() {
    const W = L.w, H = L.h, cw = W * TPX, ch = H * TPX, P = mp();
    const R = 8, fw = W * R, fh = (H + 2) * R;
    const field = new Float32Array(fw * fh), tmp = new Float32Array(fw * fh);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (MBAKE.has(at(x, y)))
      for (let yy = 0; yy < R; yy++) for (let xx = 0; xx < R; xx++) field[((H - 1 - y) * R + yy + R) * fw + x * R + xx] = 1;
    const blur = (a, b, r) => {
      for (let y = 0; y < fh; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * fw + Math.max(0, Math.min(fw - 1, x))];
        for (let x = 0; x < fw; x++) { b[y * fw + x] = s / (2 * r + 1); s += a[y * fw + Math.min(fw - 1, x + r + 1)] - a[y * fw + Math.max(0, x - r)]; } }
      for (let x = 0; x < fw; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.max(0, Math.min(fh - 1, y)) * fw + x];
        for (let y = 0; y < fh; y++) { a[y * fw + x] = s / (2 * r + 1); s += b[Math.min(fh - 1, y + r + 1) * fw + x] - b[Math.max(0, y - r) * fw + x]; } }
    };
    blur(field, tmp, 1);
    const F = (px, py) => {
      const fx = px / TPX * R - 0.5, fy = py / TPX * R - 0.5 + R;
      const x0 = Math.max(0, Math.min(fw - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(fh - 2, Math.floor(fy)));
      const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
      const a = field[y0 * fw + x0], b = field[y0 * fw + x0 + 1], c = field[(y0 + 1) * fw + x0], e = field[(y0 + 1) * fw + x0 + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
    };
    const base = new Float32Array(cw * ch);
    for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) base[py * cw + px] = F(px, py);
    const frames = [];
    for (let f = 0; f < 2; f++) {
      // маска «внутри»: свой шум кромки на каждый кадр кипения
      const inside = new Uint8Array(cw * ch);
      for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
        const v = base[py * cw + px];
        if (v <= 0.02) continue;
        if (v >= 0.98) { inside[py * cw + px] = 1; continue; }
        inside[py * cw + px] = v + (vnoise(px / 7 + f * 31, py / 7 + f * 13) - 0.5) * 0.35 >= 0.5 ? 1 : 0;
      }
      const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
      const cx = cv.getContext("2d"), img = cx.createImageData(cw, ch), o = img.data;
      const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const cFill = hex(P.fill), cTop = hex(P.top), cInk = hex(INK);
      const depth = new Int16Array(cw);                                 // сколько пикселей от верхней кромки
      for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
        const i = py * cw + px;
        if (!inside[i]) { depth[px] = 0; continue; }
        depth[px]++;
        const edge = !inside[i - 1] || !inside[i + 1] || (py > 0 && !inside[i - cw]) || (py < ch - 1 && !inside[i + cw]) ||
                     (px > 1 && !inside[i - 2]) || (px < cw - 2 && !inside[i + 2]) || (py > 1 && !inside[i - 2 * cw]) || (py < ch - 2 && !inside[i + 2 * cw]);
        const col = edge ? cInk : depth[px] < 9 + ((px * 7) % 5 === 0 ? 2 : 0) ? cTop : cFill;
        const j = i * 4; o[j] = col[0]; o[j + 1] = col[1]; o[j + 2] = col[2]; o[j + 3] = 255;
      }
      cx.putImageData(img, 0, 0);
      // небрежные штрихи, камешки, травинки
      mseed = 31 + f * 101 + W;
      cx.lineCap = "round";
      for (let i = 0; i < W * H * 0.35; i++) {
        const px = mr() * cw, py = mr() * ch;
        if (!inside[(py | 0) * cw + (px | 0)] || depth[px | 0] < 0) continue;
        const dd = (() => { let d = 0; for (let yy = py | 0; yy > 0 && inside[yy * cw + (px | 0)]; yy--) d++; return d; })();
        if (dd < 16) continue;
        if (mr() < 0.7) { cx.strokeStyle = P.hatch; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px + 5 + mr() * 4, py - 4 - mr() * 3); cx.stroke(); }
        else { cx.fillStyle = P.hatch; cx.strokeStyle = INK; cx.lineWidth = 1; cx.beginPath(); cx.ellipse(px, py, 3 + mr() * 3, 2 + mr() * 2, 0, 0, Math.PI * 2); cx.fill(); cx.stroke(); }
      }
      if (L.pal === "meadow" || L.pal === "glitch") {
        cx.strokeStyle = INK; cx.lineWidth = 1.3;
        for (let px = 2; px < cw - 2; px += 3) for (let py = 1; py < ch; py++) {
          if (inside[py * cw + px] && !inside[(py - 1) * cw + px]) { if (mr() < 0.28) { const hh = 3 + mr() * 6; cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px + (mr() - 0.5) * 4, py - hh); cx.stroke(); } break; }
        }
      }
      // лёд — белые блики-чёрточки
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === "~") {
        const sx = x * TPX, sy = (H - 1 - y) * TPX;
        cx.strokeStyle = "#f4f7f7"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(sx + 6, sy + 8); cx.lineTo(sx + 16, sy + 7); cx.moveTo(sx + 20, sy + 10); cx.lineTo(sx + 25, sy + 9); cx.stroke();
      }
      frames.push(cv);
    }
    L.mult = { frames };
    multBackdrop();
  }

  // ---------------------------------------------------------------- фон: криво нарисованные холмы, деревья-леденцы, дома, облака
  function multLayer(kind) {
    const P = mp(), W = 1400, H = 360, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c = cv.getContext("2d"); mseed = kind === "far" ? 5 : 9;
    c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = INK; c.lineWidth = kind === "far" ? 2 : 3;
    const col = kind === "far" ? P.far : P.near, base = kind === "far" ? 250 : 292;
    const hill = () => {
      const pts = [[-10, H + 10]];
      for (let x = -10; x <= W + 10; x += 40) pts.push([x, base + Math.sin(x / (kind === "far" ? 170 : 110) + mseed) * (kind === "far" ? 26 : 16)]);
      pts.push([W + 10, H + 10]);
      wobblePath(c, pts, 3, true, kind === "far" ? 11 : 13); c.fillStyle = col; c.fill(); c.stroke();
    };
    if (L.pal === "meadow" || L.pal === "glitch") {
      hill();
      const n = kind === "far" ? 9 : 6;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.2 + mr() * 0.6) * W / n, s = kind === "far" ? 0.6 : 1, by = base + 10;
        const th = (40 + mr() * 40) * s;
        c.fillStyle = "#6b4a2e"; wobblePath(c, [[x - 4 * s, by], [x - 3 * s, by - th], [x + 3 * s, by - th], [x + 4 * s, by]], 2, true, i + 40); c.fill(); c.stroke();
        c.fillStyle = kind === "far" ? "#8fae72" : "#6e9a45";
        wobblePath(c, blobPts(x, by - th - 16 * s, (22 + mr() * 10) * s, (18 + mr() * 8) * s, 12, i * 7 + 3, 0.18), 2, true, i + 60); c.fill(); c.stroke();
      }
      if (L.pal === "glitch") {               // «ошибка мира»: куски фона залиты не теми цветами
        for (let i = 0; i < 3; i++) { c.fillStyle = ["#ff3fd2", "#39f2c4", "#f2e039"][i]; c.globalAlpha = 0.55; c.fillRect(mr() * W, mr() * 200, 40 + mr() * 80, 12 + mr() * 30); }
        c.globalAlpha = 1;
      }
    } else if (L.pal === "cave") {
      for (let x = 0; x < W; x += 40 + mr() * 60) {
        const w = 14 + mr() * 26, hT = 30 + mr() * (kind === "far" ? 80 : 120);
        c.fillStyle = col; wobblePath(c, [[x - w, -5], [x, hT], [x + w, -5]], 3, true, x | 0); c.fill(); c.stroke();
      }
      hill();
    } else if (L.pal === "city") {
      hill();
      for (let x = 0; x < W; x += 70 + mr() * 70) {
        const w = 40 + mr() * 50, top = (kind === "far" ? 140 : 180) + mr() * 70, by = base + 20;
        c.fillStyle = col; wobblePath(c, [[x, by], [x, top], [x + w / 2, top - 22 - mr() * 14], [x + w, top], [x + w, by]], 3, true, x | 0); c.fill(); c.stroke();
        c.fillStyle = kind === "far" ? "#d8cf9a" : "#e8d27a";
        for (let wy = top + 12; wy < by - 18; wy += 22) for (let wx = x + 8; wx < x + w - 12; wx += 16) if (mr() < 0.55) { c.fillRect(wx, wy, 7, 9); c.strokeRect(wx, wy, 7, 9); }
      }
    } else if (L.pal === "void") {
      for (let i = 0; i < 6; i++) {
        const x = mr() * W, y = 60 + mr() * 200, s = 14 + mr() * 30;
        c.fillStyle = col; wobblePath(c, [[x - s, y], [x + s, y - s * 0.3], [x + s * 0.5, y + s * 0.9], [x - s * 0.4, y + s * 0.6]], 3, true, i + 90); c.fill(); c.stroke();
      }
    }
    return cv;
  }
  function multBackdrop() {
    const P = mp();
    const sky = document.createElement("canvas"); sky.width = T.VW; sky.height = T.VH;
    const sc = sky.getContext("2d"), g = sc.createLinearGradient(0, 0, 0, T.VH);
    g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]); sc.fillStyle = g; sc.fillRect(0, 0, T.VW, T.VH);
    // бумага: крупные пятна и мелкий шум, тёплый оттенок
    const paper = document.createElement("canvas"); paper.width = T.VW; paper.height = T.VH;
    const pc = paper.getContext("2d"), id = pc.createImageData(T.VW, T.VH);
    for (let y = 0; y < T.VH; y++) for (let x = 0; x < T.VW; x++) {
      const v = vnoise(x / 40, y / 40) * 0.6 + Math.random() * 0.4, j = (y * T.VW + x) * 4;
      id.data[j] = 120; id.data[j + 1] = 90; id.data[j + 2] = 50; id.data[j + 3] = v * 34;
    }
    pc.putImageData(id, 0, 0);
    const clouds = [];
    mseed = 77;
    if (L.pal !== "cave") for (let i = 0; i < 4; i++) clouds.push({ x: mr() * 900, y: 30 + mr() * 90, s: 0.6 + mr() * 0.7, seed: i * 13 + 5 });
    L.mult.layers = [{ cv: multLayer("far"), f: 0.2 }, { cv: multLayer("near"), f: 0.45 }];
    Object.assign(L.mult, { sky, paper, clouds });
  }

  function drawCloud(c, x, y, s, seed) {
    c.fillStyle = L.pal === "void" ? "#5c4f66" : "#fbf8ee"; c.strokeStyle = INK; c.lineWidth = 2;
    const pts = [];
    for (let i = 0; i < 7; i++) { const a = Math.PI + i / 6 * Math.PI; pts.push([x + Math.cos(a) * 46 * s, y + Math.sin(a) * 20 * s]); }
    pts.push([x + 40 * s, y + 8 * s], [x - 40 * s, y + 8 * s]);
    wobblePath(c, pts, 3, true, seed + boilK()); c.fill(); c.stroke();
  }

  // ---------------------------------------------------------------- солнце с рожицей → Всевидящее Око
  function drawSunFace(c, t) {
    const aw = stageNowSafe(), flash = L.eyeFlash && t < L.eyeFlash;
    const ex = T.VW * 0.74 - ((CO.cx * TPX * 0.04) % 160), ey = 66 + Math.sin(t * 0.3) * 2, R = 26 + (flash ? 4 : 0);
    c.lineWidth = 2.5; c.strokeStyle = INK; c.lineCap = "round";
    if (aw < 3) {
      c.fillStyle = L.pal === "void" || L.pal === "cave" ? "#d9c89a" : "#ffd84a";
      for (let i = 0; i < 10; i++) {                                   // лучи-палочки
        const a = i / 10 * Math.PI * 2 + t * 0.2; c.beginPath();
        c.moveTo(ex + Math.cos(a) * (R + 4), ey + Math.sin(a) * (R + 4)); c.lineTo(ex + Math.cos(a) * (R + 14 + (i % 2) * 5), ey + Math.sin(a) * (R + 14 + (i % 2) * 5)); c.stroke();
      }
      wobblePath(c, blobPts(ex, ey, R, R, 14, 3 + boilK(), 0.05), 2, true, 3 + boilK()); c.fill(); c.stroke();
      // рожица: смотрит на шарик, ухмыляется
      const bp = toScreen(ball ? ball.x : 0, ball ? ball.y : 0), dx = Math.sign(bp.x - ex) * 2;
      c.fillStyle = INK; c.beginPath(); c.arc(ex - 8 + dx, ey - 5, 2.6, 0, 7); c.arc(ex + 8 + dx, ey - 5, 2.6, 0, 7); c.fill();
      c.beginPath(); c.arc(ex, ey + 2, 11, 0.2 * Math.PI, (flash ? 1 : 0.8) * Math.PI); c.stroke();
      return;
    }
    // Око: треугольник-сияние и глаз, зрачок следит за курсором наблюдателя
    const open = Math.min(1, (aw - 2) / 2) * (Math.sin(t * 0.33) > 0.993 ? 0.1 : 1);
    c.fillStyle = "rgba(255,216,74,0.35)"; wobblePath(c, [[ex, ey - R * 1.9], [ex + R * 1.8, ey + R * 1.2], [ex - R * 1.8, ey + R * 1.2]], 3, true, 8 + boilK()); c.fill(); c.stroke();
    const rx = R * 1.15, ry = R * 0.6 * open;
    c.fillStyle = "#fbf8ee"; c.beginPath(); c.ellipse(ex, ey, rx, Math.max(1, ry), 0, 0, Math.PI * 2); c.fill(); c.stroke();
    if (open > 0.3) {
      const target = mouse.world || { x: ball.x, y: ball.y }, tp = toScreen(target.x, target.y);
      const ang = Math.atan2(tp.y - ey, tp.x - ex), px = ex + Math.cos(ang) * rx * 0.4, py = ey + Math.sin(ang) * ry * 0.35;
      c.save(); c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); c.clip();
      c.fillStyle = flash ? "#d8382a" : "#4f86b8"; c.beginPath(); c.arc(px, py, R * 0.42, 0, 7); c.fill(); c.stroke();
      c.fillStyle = INK; c.beginPath(); c.arc(px, py, R * 0.2, 0, 7); c.fill();
      c.restore();
    }
  }

  // ---------------------------------------------------------------- кадр: фон и рельеф
  function multBg(dt) {
    const M = L.mult; if (!M) return;
    updateGlow(dt || 1 / 60);
    const t = game.time, darkT = game.cutscene && L.dissolve >= 0 ? Math.min(1, L.dissolve) : 0;
    ctx.drawImage(M.sky, 0, 0);
    for (const cl of M.clouds) drawCloud(ctx, ((cl.x - CO.cx * TPX * 0.05 + t * 4) % 1000 + 1000) % 1000 - 100, cl.y, cl.s, cl.seed);
    if (!L.swHidden) drawSunFace(ctx, t);
    const vy = (CO.cy - L.h / 2) * TPX * 0.12;
    M.layers.forEach((l, i) => {
      const w = l.cv.width, off = ((CO.cx * TPX * l.f) % w + w) % w, j = boilK() && i ? 1 : 0;
      ctx.drawImage(l.cv, -off + j, vy * (i + 1) * 0.6); ctx.drawImage(l.cv, w - off + j, vy * (i + 1) * 0.6);
    });
    const sx = Math.round((CO.cx - T.VW / TPX / 2) * TPX), sy = Math.round((L.h - CO.cy - T.VH / TPX / 2) * TPX);
    ctx.globalAlpha = 1 - darkT * 0.9;
    ctx.drawImage(M.frames[boilK()], sx, sy, T.VW, T.VH, 0, 0, T.VW, T.VH);
    ctx.globalAlpha = 1;
    if (darkT > 0) { ctx.fillStyle = `rgba(250,246,232,${darkT})`; ctx.fillRect(0, 0, T.VW, T.VH); }   // мир стирают ластиком — остаётся бумага
  }
  function multOver() {
    const M = L.mult;
    if (M) ctx.drawImage(M.paper, 0, 0);
    if (ball && (ball.visible || ball.pancake || ball.blobs)) multBall();
  }

  // ---------------------------------------------------------------- шарик: пластилиновый колобок, глаза-блюдца, рожица по настроению
  // пластилин: насыщенные цвета по настроению (плавно перетекают, как свечение в Лимбо)
  const CLAY = {
    neutral: [233, 142, 92], happy: [248, 196, 58], scared: [118, 178, 228], angry: [222, 64, 46], sad: [92, 118, 204], awe: [168, 118, 222],
    pray: [238, 214, 128], dizzy: [236, 120, 188], suspicious: [138, 196, 78], determined: [240, 128, 40], glitch: [60, 220, 160],
  };
  const clay = [233, 142, 92];
  function moodColor() {
    let mood = ball.mood || "neutral";
    const emo = ball.emo && game.time < ball.emo.until ? ball.emo : null; if (emo) mood = emo.mood;
    let c = CLAY[mood] || CLAY.neutral;
    if (mood === "glitch") c = Math.floor(game.time * 10) % 2 ? CLAY.glitch : [255, 60, 240];
    for (let i = 0; i < 3; i++) clay[i] += (c[i] - clay[i]) * 0.08;
    const dim = ball.state === "splat" || ball.state === "dead" ? 0.75 : 1;
    return clay.map((v) => v * dim);
  }
  function drawFace(c, r, mood, look) {
    const lx = look * r * 0.12;
    const eye = (ex, closed) => {
      if (closed) { c.beginPath(); c.arc(ex, -r * 0.2, r * 0.22, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); return; }
      c.fillStyle = "#fbf8ee"; c.beginPath(); c.ellipse(ex, -r * 0.22, r * 0.27, r * 0.33, 0, 0, 7); c.fill(); c.stroke();
      if (mood === "dizzy" || mood === "glitch") { c.beginPath(); c.moveTo(ex - 4, -r * 0.3); c.lineTo(ex + 4, -r * 0.14); c.moveTo(ex + 4, -r * 0.3); c.lineTo(ex - 4, -r * 0.14); c.stroke(); return; }
      const pr = mood === "scared" || mood === "awe" ? r * 0.08 : r * 0.13;
      c.fillStyle = INK; c.beginPath(); c.arc(ex + lx + r * 0.05 * look, -r * 0.18, pr, 0, 7); c.fill();
    };
    const closed = mood === "pray";
    eye(-r * 0.3, closed); eye(r * 0.3, closed || (mood === "suspicious" && Math.floor(game.time * 2) % 3 === 0));
    c.beginPath();                                                        // брови
    if (mood === "angry" || mood === "determined") { c.moveTo(-r * 0.55, -r * 0.62); c.lineTo(-r * 0.12, -r * 0.48); c.moveTo(r * 0.55, -r * 0.62); c.lineTo(r * 0.12, -r * 0.48); }
    else if (mood === "sad" || mood === "scared") { c.moveTo(-r * 0.55, -r * 0.5); c.lineTo(-r * 0.15, -r * 0.64); c.moveTo(r * 0.55, -r * 0.5); c.lineTo(r * 0.15, -r * 0.64); }
    else if (mood === "suspicious") { c.moveTo(r * 0.12, -r * 0.6); c.lineTo(r * 0.55, -r * 0.55); }
    c.stroke();
    c.beginPath();                                                        // рот
    const my = r * 0.35;
    if (mood === "happy") { c.arc(0, my - r * 0.12, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    else if (mood === "sad") { c.arc(0, my + r * 0.2, r * 0.22, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); }
    else if (mood === "scared" || mood === "awe") { c.fillStyle = "#5a1a14"; c.ellipse(0, my, r * 0.13, r * (mood === "awe" ? 0.2 : 0.14), 0, 0, 7); c.fill(); c.stroke(); }
    else if (mood === "angry" || mood === "determined") { c.moveTo(-r * 0.22, my); c.lineTo(r * 0.22, my); c.stroke(); if (mood === "angry") { c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(i * r * 0.09, my - 2); c.lineTo(i * r * 0.09, my + 2); } c.stroke(); } }
    else if (mood === "pray") { c.arc(0, my, r * 0.07, 0, 7); c.stroke(); }
    else if (mood === "dizzy" || mood === "glitch") { c.moveTo(-r * 0.25, my); for (let i = 1; i <= 5; i++) c.lineTo(-r * 0.25 + i * r * 0.1, my + (i % 2 ? 3 : -3)); c.stroke(); }
    else { c.moveTo(-r * 0.16, my); c.quadraticCurveTo(0, my + 3, r * 0.18, my - 1); c.stroke(); }
  }
  function multBall() {
    const col = moodColor(), fill = rgb(col, 1), dark = rgb(col.map((v) => v * 0.7), 1);
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (ball.visible) {
      const p = toScreen(ball.x, ball.y - T.R);
      const emo = ball.emo && game.time < ball.emo.until ? ball.emo : null;
      if (emo && (emo.mood === "scared" || emo.mood === "angry") && emo.k > 0.4) p.x += Math.round((Math.random() - 0.5) * 4 * emo.k);
      let sx = ball.sx, sy = ball.sy;
      if (!ball.grounded && ball.alive()) { const s = Math.min(0.18, Math.abs(ball.vy) / 30); sx *= 1 - s * 0.6; sy *= 1 + s; }
      const r = T.R * TPX + 1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sx, sy); ctx.translate(0, -r);
      ctx.fillStyle = fill;
      wobblePath(ctx, blobPts(0, 0, r, r, 16, 21 + boilK(), 0.06), 1.2, true, 5 + boilK()); ctx.fill();
      ctx.save(); ctx.clip();                                              // тень снизу и блик — как на пластилине
      ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(r * 0.25, r * 0.55, r, r * 0.6, 0, 0, 7); ctx.fill();
      ctx.restore();
      ctx.stroke();
      ctx.save(); ctx.rotate(ball.roll);                                   // отпечатки пальцев — видно, что катится
      ctx.strokeStyle = rgb(col.map((v) => v * 0.6), 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(r * 0.45, r * 0.15, 3, 0.2, 2.6); ctx.moveTo(-r * 0.5, r * 0.3); ctx.arc(-r * 0.5, r * 0.3, 2.5, 3, 5.5); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.5, 3, 2, -0.6, 0, 7); ctx.fill();
      ctx.lineWidth = 1.8;
      const look = ball.lookLeft ? -1 : 1;
      drawFace(ctx, r, (emo && emo.mood) || ball.mood || "neutral", look);
      ctx.restore();
    }
    if (ball.pancake) {
      const k = Math.min(1, ball.pancake.t / 0.25), e = 1 - Math.pow(1 - k, 3);
      const p = toScreen(ball.x, ball.pancake.up ? ball.y + T.R - 0.2 : ball.y - T.R + 0.12);
      const w = 26 * (0.6 + 0.48 * e), h = 4 * (2.2 - 1.3 * e);
      ctx.fillStyle = fill; wobblePath(ctx, blobPts(p.x, p.y, w, h, 14, 4 + boilK(), 0.1), 1.5, true, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fbf8ee"; ctx.lineWidth = 1.5;                        // глаза-блюдца на блине
      for (const dx of [-6, 6]) { ctx.beginPath(); ctx.ellipse(p.x + dx, p.y - h * 0.6, 4, 3, 0, 0, 7); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = INK; for (const dx of [-6, 6]) { ctx.beginPath(); ctx.arc(p.x + dx + Math.sin(game.time * 9 + dx) * 1.5, p.y - h * 0.6, 1.3, 0, 7); ctx.fill(); }
      ctx.lineWidth = 2.5;
    }
    if (ball.blobs) {
      const k = 1 - Math.max(0, ball.timer) / 0.45, e = k * k * (3 - 2 * k);
      ctx.fillStyle = fill; ctx.lineWidth = 1.5;
      for (const b of ball.blobs) {
        const p = toScreen(ball.x + b.x * (1 - e), ball.y + b.y * (1 - e) + Math.sin(e * Math.PI) * 0.4);
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill(); ctx.stroke();
      }
    }
    if (ball.bits) for (const b of ball.bits) { const p = toScreen(ball.x + b.x, ball.y + b.y); ctx.fillStyle = fill; ctx.fillRect(p.x - 1, p.y - 1, 3, 3); }
  }

  // ---------------------------------------------------------------- свои существа кампании: заливка + общий чёрный контур + глаза-блюдца
  const MCB = {};
  function multBossCanvas(def, frame) {
    const key = JSON.stringify(def.shape).length + ":" + (def.title || "") + ":" + frame + ":" + boilK();
    if (MCB[key]) return MCB[key];
    const [wt, ht] = def.size || [3, 3], W = Math.round(wt * TPX), H = Math.round(ht * TPX), pad = 6;
    const cv = document.createElement("canvas"); cv.width = W + pad * 2; cv.height = H + 8 + pad * 2;
    const c = cv.getContext("2d"), atk = frame === "atk";
    const dy = atk ? ((def.atk && def.atk.dy) != null ? def.atk.dy : -4) : 0;
    const sx = W / 100, sy = H / 100, P = (x, y) => [x * sx + pad, (y + dy) * sy + 8 + pad];
    c.lineCap = "round"; c.lineJoin = "round";
    const j = boilK() ? 0.8 : -0.8;
    const pass = (outline) => {
      c.fillStyle = outline ? INK : (def.color || "#4a3a33"); c.strokeStyle = c.fillStyle;
      const ow = outline ? 5 : 0;
      for (const part of def.shape || []) {
        if (part.e || part.c) { const [cx, cy, rx, ry] = part.e || [part.c[0], part.c[1], part.c[2], part.c[2]], [x, y] = P(cx, cy); c.beginPath(); c.ellipse(x + j, y, rx * sx + ow / 2, ry * sy + ow / 2, 0, 0, Math.PI * 2); c.fill(); }
        else if (part.p) { c.lineWidth = ow; c.beginPath(); for (let i = 0; i + 1 < part.p.length; i += 2) { const [x, y] = P(part.p[i], part.p[i + 1]); i ? c.lineTo(x + (i % 4 ? j : -j), y) : c.moveTo(x, y); } c.closePath(); c.fill(); if (ow) c.stroke(); }
        else if (part.l) { c.lineWidth = Math.max(1, (part.w || 2) * (sx + sy) / 2) + ow; c.beginPath(); for (let i = 0; i + 1 < part.l.length; i += 2) { const [x, y] = P(part.l[i], part.l[i + 1]); i ? c.lineTo(x + j, y) : c.moveTo(x, y); } c.stroke(); }
      }
    };
    pass(true); pass(false);
    const eyes = (def.shape || []).filter((p) => p.eye).map((p) => p.eye);
    const k = atk ? ((def.atk && def.atk.eyes) || 1.5) : 1;
    c.lineWidth = 1.5; c.strokeStyle = INK;
    for (const [ex, ey, r] of eyes) {
      const [x, y] = P(ex, ey), rr = Math.max(2.5, r * (sx + sy) / 2 * k * 1.3);
      if (frame === "blink") { c.beginPath(); c.moveTo(x - rr, y); c.lineTo(x + rr, y); c.stroke(); continue; }
      c.fillStyle = atk ? "#ffe9a8" : "#fbf8ee"; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); c.stroke();
    }
    MCB[key] = { cv, eyes: eyes.map(([ex, ey, r]) => { const [x, y] = P(ex, ey); return [x, y, Math.max(2.5, r * (sx + sy) / 2 * k * 1.3)]; }), pad, frame };
    return MCB[key];
  }
  function multBoss(t, frame, wx, wy, peek, flip) {
    const B = multBossCanvas(t.def, frame), cv = B.cv, p = toScreen(wx, wy);
    ctx.save(); ctx.translate(p.x, p.y); if (flip) ctx.scale(-1, 1);
    if (peek) { ctx.beginPath(); ctx.rect(-cv.width / 2, -cv.height / 2, cv.width, cv.height * 0.45); ctx.clip(); }
    const ox = Math.round(-cv.width / 2), oy = Math.round(-cv.height / 2) - 4;
    ctx.drawImage(cv, ox, oy);
    if (frame !== "blink" && ball) {                                       // зрачки следят за шариком
      const bp = toScreen(ball.x, ball.y);
      ctx.fillStyle = frame === "atk" ? "#c0281c" : INK;
      for (const [x, y, rr] of B.eyes) {
        let dx = bp.x - (p.x + (flip ? -1 : 1) * (ox + x)), dy = bp.y - (p.y + oy + y); const d = Math.hypot(dx, dy) || 1;
        if (flip) dx = -dx;
        ctx.beginPath(); ctx.arc(ox + x + dx / d * rr * 0.45, oy + y + dy / d * rr * 0.45, Math.max(1.2, rr * 0.45), 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- переключатель стиля
  const LIMBO = { name: "limbo", sprite: nightSprite, bake: bakeWorld, bg: renderNight, over: renderGlow, ball: drawBall, boss: drawCustomBoss,
                  darkFill: "rgba(2,2,2,0.92)", conv: "rgba(90,90,86,0.9)" };
  const MULT = { name: "mult", sprite: multSprite, bake: multBake, bg: multBg, over: multOver, ball: () => { }, boss: multBoss,
                 darkFill: "rgba(28,20,14,0.9)", conv: INK };
  const STYLES = { limbo: LIMBO, mult: MULT };
  let styleName = "mult";
  try { styleName = localStorage.getItem("sharik_style") || "mult"; } catch (e) { }
  if (!STYLES[styleName]) styleName = "mult";
  const STY = () => STYLES[styleName];
  function setStyle(n) {
    if (!STYLES[n]) return; styleName = n;
    try { localStorage.setItem("sharik_style", n); } catch (e) { }
    document.body.dataset.style = n;
    if (typeof L !== "undefined" && L && L.w) STY().bake();
  }
