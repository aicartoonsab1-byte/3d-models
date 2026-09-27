  // ================================================================ ГРАФИКА «МУЛЬТ» (в духе самодельных мультов-притч ТО «420»)
  // Вклеивается в game.js сборщиком сразу после limbo.js. Референс — «Мифологическая мифология»:
  // белый лист, тонкая неровная чёрная линия от руки, никакой заливки цветом. Объём и фактура — только штрихами:
  // чёрточки «- -» и «' ' '» на земле, кудрявые кусты-облачка, горы контуром со снежной шапкой, вулкан с дымом.
  // Линии «кипят» (2 кадра, ~6 раз в секунду). Единственное цветное пятно — шарик: пастельный цвет = настроение.
  // Солнце с рожицей; с 3-й стадии прозрения оно оказывается Всевидящим Оком.

  const INK = "#141414", PAPER = "#fdfdfb";
  const boilK = () => Math.floor(game.time * 6) % 2;          // кадр «кипения» линий
  let mseed = 1;
  const mr = () => { mseed = (mseed * 16807) % 2147483647; return (mseed - 1) / 2147483646; };
  const LW = 1.3;                                               // толщина линии в пикселях буфера (640×360)

  // Неровная линия «от руки»: ломаная с дрожанием
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
  // штрих-чёрточки: группа из 2–3 коротких линий (как на земле в мультах)
  function dashes(c, x, y, kind) {
    c.beginPath();
    if (kind === "dot") { c.moveTo(x, y); c.lineTo(x + 0.8, y + 0.8); c.moveTo(x + 4, y + 1); c.lineTo(x + 4.8, y + 1.8); c.stroke(); return; }
    const n = kind === "tick" ? 1 + Math.floor(mr() * 2) : 2 + Math.floor(mr() * 2);
    for (let i = 0; i < n; i++) {
      if (kind === "tick") { const xx = x + i * 4; c.moveTo(xx, y); c.lineTo(xx - 1 - mr(), y + 2.5 + mr() * 2); }
      else { const xx = x + i * (7 + mr() * 3); c.moveTo(xx, y + (mr() - 0.5)); c.lineTo(xx + 4 + mr() * 3, y + (mr() - 0.5)); }
    }
    c.stroke();
  }
  // кудрявый куст/крона: цепочка полуокружностей по контуру + пара завитков внутри
  function bush(c, cx, by, w, h, seed) {
    mseed = seed;
    const n = Math.max(4, Math.round(w / 9)), pts = [];
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = Math.PI * (1 - t), x = cx + Math.cos(a) * w / 2, y = by - Math.sin(a) * h;
      pts.push([x, y]);
    }
    c.moveTo(pts[0][0], by);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const nx = (y0 - y1), ny = (x1 - x0), d = Math.hypot(nx, ny) || 1, bulge = 4 + mr() * 3;
      c.quadraticCurveTo(mx - nx / d * bulge, my - ny / d * bulge, x1, y1);
    }
    c.lineTo(pts[pts.length - 1][0], by);
    c.fillStyle = PAPER; c.fill(); c.stroke();
    c.beginPath();
    for (let i = 0; i < 3; i++) { const x = cx + (mr() - 0.5) * w * 0.6, y = by - h * (0.3 + mr() * 0.4); c.moveTo(x - 3, y); c.quadraticCurveTo(x, y - 4, x + 3, y); }
    c.stroke();
  }

  // ---------------------------------------------------------------- спрайты: белый силуэт, чёрный контур и тёмные детали
  const MS = {};
  function multSprite(name) {
    if (MS[name]) return MS[name];
    const im = IMG[name]; if (!im) return null;
    const w = im.width * 2, h = im.height * 2, pad = 2;
    const out = document.createElement("canvas"); out.width = w + pad * 2; out.height = h + pad * 2;
    const oc = out.getContext("2d"); oc.imageSmoothingEnabled = false; oc.drawImage(im, pad, pad, w, h);
    const id = oc.getImageData(0, 0, out.width, out.height), d = id.data, W = out.width, H = out.height;
    const a = (x, y) => x < 0 || y < 0 || x >= W || y >= H ? 0 : d[(y * W + x) * 4 + 3];
    const res = new Uint8ClampedArray(d.length);
    const bright = name === "obj_fragment" || name === "fx_pixel";
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const j = (y * W + x) * 4;
      if (a(x, y) < 40) continue;
      const edge = a(x - 1, y) < 40 || a(x + 1, y) < 40 || a(x, y - 1) < 40 || a(x, y + 1) < 40;
      const lum = d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11;
      const ink = edge || lum < 95;
      const v = ink ? 20 : bright ? 255 : 253;
      res[j] = v; res[j + 1] = v; res[j + 2] = ink ? 20 : bright ? 190 : 251; res[j + 3] = 255;
    }
    id.data.set(res); oc.putImageData(id, 0, 0);
    return (MS[name] = out);
  }

  // ---------------------------------------------------------------- рельеф: белый лист, неровный контур, чёрточки-штрихи
  const MBAKE = new Set(["#", "<", ">", "~"]);
  function multBake() {
    const W = L.w, H = L.h, cw = W * TPX, ch = H * TPX;
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
      const inside = new Uint8Array(cw * ch);
      for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
        const v = base[py * cw + px];
        if (v <= 0.02) continue;
        if (v >= 0.98) { inside[py * cw + px] = 1; continue; }
        inside[py * cw + px] = v + (vnoise(px / 7 + f * 31, py / 7 + f * 13) - 0.5) * 0.35 >= 0.5 ? 1 : 0;
      }
      const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
      const cx = cv.getContext("2d"), img = cx.createImageData(cw, ch), o = img.data;
      const out = (i) => !inside[i];
      for (let py = 1; py < ch - 1; py++) for (let px = 1; px < cw - 1; px++) {
        const i = py * cw + px; if (!inside[i]) continue;
        // контур ~1–2 px: толщина «гуляет», как у руки с фломастером
        let edge = out(i - 1) || out(i + 1) || out(i - cw) || out(i + cw);
        if (!edge && vnoise(px / 13 + f * 5, py / 13) > 0.62) edge = out(i - 2) || out(i + 2) || out(i - 2 * cw) || out(i + 2 * cw) || out(i - cw - 1) || out(i + cw + 1);
        const j = i * 4, v = edge ? 20 : 253;
        o[j] = v; o[j + 1] = v; o[j + 2] = edge ? 20 : 251; o[j + 3] = 255;
      }
      cx.putImageData(img, 0, 0);
      // фактура: группы чёрточек в толще земли, травинки-закорючки на кромке
      mseed = 31 + f * 101 + W;
      cx.strokeStyle = INK; cx.lineWidth = 1; cx.lineCap = "round";
      const depthAt = (px, py) => { let d = 0; for (let yy = py; yy > 0 && inside[yy * cw + px] && d < 40; yy--) d++; return d; };
      for (let i = 0; i < W * H * 0.22; i++) {
        const px = Math.floor(mr() * cw), py = Math.floor(mr() * ch);
        if (!inside[py * cw + px]) continue;
        const dd = depthAt(px, py);
        if (dd < 10 || !inside[py * cw + Math.min(cw - 1, px + 22)]) continue;
        const r = mr(); dashes(cx, px, py, r < 0.5 ? "tick" : r < 0.8 ? "dot" : "dash");
      }
      if (L.pal === "meadow" || L.pal === "glitch") {
        for (let px = 2; px < cw - 2; px += 4) for (let py = 1; py < ch; py++) {
          if (inside[py * cw + px] && !inside[(py - 1) * cw + px]) {
            if (mr() < 0.12) { cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px - 1 + mr() * 2, py - 3 - mr() * 3); cx.moveTo(px + 2, py); cx.lineTo(px + 3 + mr() * 2, py - 2 - mr() * 3); cx.stroke(); }
            break;
          }
        }
      }
      // лёд — двойная волнистая линия по кромке
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === "~") {
        const sx = x * TPX, sy = (H - 1 - y) * TPX;
        cx.beginPath(); cx.moveTo(sx + 3, sy + 7); cx.quadraticCurveTo(sx + 10, sy + 5, sx + 16, sy + 7); cx.quadraticCurveTo(sx + 22, sy + 9, sx + 29, sy + 7); cx.stroke();
      }
      frames.push(cv);
    }
    L.mult = { frames };
    multBackdrop();
  }

  // ---------------------------------------------------------------- фон: горы со снежными шапками, вулкан с дымом, кусты, деревья, дома
  function multLayer(kind) {
    const W = 1400, H = 360, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c = cv.getContext("2d"); mseed = kind === "far" ? 5 : 9;
    c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = INK; c.lineWidth = kind === "far" ? 1 : 1.2;
    const far = kind === "far", base = far ? 250 : 292;
    const ground = () => {
      const pts = [[-10, H + 10]];
      for (let x = -10; x <= W + 10; x += 50) pts.push([x, base + Math.sin(x / (far ? 190 : 120) + mseed) * (far ? 10 : 8)]);
      pts.push([W + 10, H + 10]);
      wobblePath(c, pts, 2, false, far ? 11 : 13); c.fillStyle = PAPER; c.fill(); c.stroke();
      c.lineWidth = 1; for (let i = 0; i < 14; i++) dashes(c, mr() * W, base + 14 + mr() * (H - base - 20), mr() < 0.6 ? "tick" : "dot");
      c.lineWidth = far ? 1 : 1.2;
    };
    const mountain = (x, w, h, snow, seed) => {
      const pk = [x, base - h];
      wobblePath(c, [[x - w, base + 4], [x - w * 0.45, base - h * 0.55], pk, [x + w * 0.5, base - h * 0.5], [x + w, base + 4]], 3, false, seed);
      c.fillStyle = PAPER; c.fill(); c.stroke();
      if (snow) {                                                   // зубчатая снежная шапка
        c.beginPath(); c.moveTo(x - w * 0.18, base - h * 0.8);
        for (let i = 1; i <= 5; i++) c.lineTo(x - w * 0.18 + i * w * 0.07, base - h * (i % 2 ? 0.74 : 0.82));
        c.stroke();
      }
      c.beginPath(); for (let i = 0; i < 4; i++) { const sx = x + (mr() - 0.3) * w * 0.8, sy = base - h * (0.2 + mr() * 0.4); c.moveTo(sx, sy); c.lineTo(sx + 4, sy + 7); } c.stroke();
    };
    const volcano = (x, w, h) => {
      wobblePath(c, [[x - w, base + 4], [x - w * 0.12, base - h], [x + w * 0.12, base - h], [x + w, base + 4]], 3, false, 71);
      c.fillStyle = PAPER; c.fill(); c.stroke();
      c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(x + i * 3, base - h + 2); c.lineTo(x + i * 7, base - h + 16 + Math.abs(i) * 3); } c.stroke();
      for (let i = 0; i < 7; i++) {                                 // столб дыма — кудрявые клубы
        const sy = base - h - 10 - i * 16, sx = x + Math.sin(i * 0.9) * 8 + i * 3;
        bush(c, sx, sy + 8, 26 - i * 1.5, 12, 200 + i);
      }
    };
    const pal = L.pal;
    if (pal === "meadow" || pal === "glitch") {
      if (far) {
        for (let i = 0; i < 3; i++) mountain(200 + i * 460 + mr() * 80, 110 + mr() * 70, 100 + mr() * 70, true, 30 + i);
        volcano(560, 70, 95);
        ground();
      } else {
        ground();
        for (let i = 0; i < 5; i++) {
          const x = (i + 0.2 + mr() * 0.6) * W / 5;
          if (mr() < 0.5) bush(c, x, base + 6, 30 + mr() * 40, 16 + mr() * 12, i * 17 + 3);
          else {                                                    // дерево: ствол двумя линиями и крона-куст
            const th = 40 + mr() * 30;
            c.beginPath(); c.moveTo(x - 4, base + 6); c.lineTo(x - 3, base - th); c.moveTo(x + 4, base + 6); c.lineTo(x + 3, base - th); c.stroke();
            bush(c, x, base - th + 8, 50 + mr() * 20, 30 + mr() * 10, i * 13 + 5);
          }
        }
      }
      if (pal === "glitch") {                                       // «ошибка мира»: заштрихованные прямоугольники не на своём месте
        c.lineWidth = 1;
        for (let i = 0; i < 3; i++) { const x = mr() * W, y = 40 + mr() * 160, w = 40 + mr() * 70, h = 14 + mr() * 24; c.fillStyle = PAPER; c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h); c.beginPath(); for (let k = 0; k < w; k += 5) { c.moveTo(x + k, y + h); c.lineTo(Math.min(x + w, x + k + h), y); } c.stroke(); }
      }
    } else if (pal === "cave") {
      for (let x = 0; x < W; x += 40 + mr() * 60) {
        const w = 12 + mr() * 22, hT = 30 + mr() * (far ? 70 : 110);
        wobblePath(c, [[x - w, -5], [x - w * 0.3, hT * 0.6], [x, hT], [x + w * 0.4, hT * 0.5], [x + w, -5]], 2, false, x | 0); c.fillStyle = PAPER; c.fill(); c.stroke();
        c.beginPath(); c.moveTo(x - 2, hT * 0.3); c.lineTo(x - 1, hT * 0.5); c.stroke();
      }
      ground();
      if (!far) for (let i = 0; i < 8; i++) { const x = mr() * W; wobblePath(c, [[x - 14, base + 4], [x - 6, base - 20 - mr() * 20], [x + 8, base + 4]], 2, false, i + 90); c.fillStyle = PAPER; c.fill(); c.stroke(); }
    } else if (pal === "city") {
      ground();
      for (let x = 0; x < W; x += 60 + mr() * 60) {
        const w = 40 + mr() * 50, top = (far ? 150 : 185) + mr() * 60, by = base + 6;
        wobblePath(c, [[x, by], [x, top], [x + w / 2, top - 22 - mr() * 14], [x + w, top], [x + w, by]], 2, false, x | 0); c.fillStyle = PAPER; c.fill(); c.stroke();
        if (mr() < 0.5) { c.strokeRect(x + w * 0.7, top - 26, 7, 16); for (let k = 0; k < 3; k++) bush(c, x + w * 0.73 + k * 4, top - 30 - k * 12, 12, 6, x + k); }
        for (let wy = top + 12; wy < by - 18; wy += 22) for (let wx = x + 8; wx < x + w - 12; wx += 16) if (mr() < 0.5) {
          c.strokeRect(wx, wy, 7, 9); c.beginPath(); c.moveTo(wx + 3.5, wy); c.lineTo(wx + 3.5, wy + 9); c.stroke();
        }
      }
    } else if (pal === "void") {
      for (let i = 0; i < 7; i++) {
        const x = mr() * W, y = 50 + mr() * 200, s = 14 + mr() * 30;
        wobblePath(c, [[x - s, y], [x + s, y - s * 0.3], [x + s * 0.5, y + s * 0.9], [x - s * 0.4, y + s * 0.6]], 2, true, i + 90); c.fillStyle = PAPER; c.fill(); c.stroke();
        dashes(c, x - s * 0.3, y + s * 0.3, "tick");
      }
    }
    return cv;
  }
  function multBackdrop() {
    const sky = document.createElement("canvas"); sky.width = T.VW; sky.height = T.VH;
    const sc = sky.getContext("2d"); sc.fillStyle = PAPER; sc.fillRect(0, 0, T.VW, T.VH);
    const clouds = [];
    mseed = 77;
    if (L.pal !== "cave") for (let i = 0; i < 3; i++) clouds.push({ x: mr() * 900, y: 25 + mr() * 70, s: 0.6 + mr() * 0.6, seed: i * 13 + 5 });
    L.mult.layers = [{ cv: multLayer("far"), f: 0.2 }, { cv: multLayer("near"), f: 0.45 }];
    Object.assign(L.mult, { sky, clouds });
  }

  function drawCloud(c, x, y, s, seed) {
    c.strokeStyle = INK; c.lineWidth = LW;
    bush(c, x, y, 90 * s, 22 * s, seed + boilK());
    c.beginPath(); c.moveTo(x - 40 * s, y); c.lineTo(x + 40 * s, y); c.strokeStyle = PAPER; c.stroke(); c.strokeStyle = INK;
  }

  // ---------------------------------------------------------------- солнце с рожицей → Всевидящее Око
  function drawSunFace(c, t) {
    const aw = stageNowSafe(), flash = L.eyeFlash && t < L.eyeFlash;
    const ex = T.VW * 0.74 - ((CO.cx * TPX * 0.04) % 160), ey = 62 + Math.sin(t * 0.3) * 2, R = 22 + (flash ? 3 : 0);
    c.lineWidth = LW; c.strokeStyle = INK; c.lineCap = "round"; c.fillStyle = PAPER;
    if (aw < 3) {
      c.beginPath();
      for (let i = 0; i < 12; i++) {                                   // лучи-чёрточки
        const a = i / 12 * Math.PI * 2 + t * 0.15, r0 = R + 5, r1 = R + 11 + (i % 2) * 5;
        c.moveTo(ex + Math.cos(a) * r0, ey + Math.sin(a) * r0); c.lineTo(ex + Math.cos(a) * r1, ey + Math.sin(a) * r1);
      }
      c.stroke();
      wobblePath(c, blobPts(ex, ey, R, R, 16, 3 + boilK(), 0.04), 1.5, true, 3 + boilK()); c.fill(); c.stroke();
      const bp = toScreen(ball ? ball.x : 0, ball ? ball.y : 0), dx = Math.sign(bp.x - ex) * 2;
      c.fillStyle = INK; c.beginPath(); c.arc(ex - 7 + dx, ey - 4, 1.8, 0, 7); c.arc(ex + 7 + dx, ey - 4, 1.8, 0, 7); c.fill();
      c.beginPath(); c.arc(ex, ey + 1, 9, 0.2 * Math.PI, (flash ? 1 : 0.8) * Math.PI); c.stroke();
      return;
    }
    // Око: треугольник с сиянием-чёрточками и глаз; зрачок следит за курсором наблюдателя
    const open = Math.min(1, (aw - 2) / 2) * (Math.sin(t * 0.33) > 0.993 ? 0.1 : 1);
    c.beginPath(); for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (i - 6.5) * 0.22, r0 = R * 2.1, r1 = R * 2.5 + (i % 2) * 6; c.moveTo(ex + Math.cos(a) * r0, ey + R * 0.3 + Math.sin(a) * r0); c.lineTo(ex + Math.cos(a) * r1, ey + R * 0.3 + Math.sin(a) * r1); } c.stroke();
    wobblePath(c, [[ex, ey - R * 1.9], [ex + R * 1.8, ey + R * 1.2], [ex - R * 1.8, ey + R * 1.2]], 2, true, 8 + boilK()); c.fill(); c.stroke();
    const rx = R * 1.15, ry = R * 0.6 * open;
    c.beginPath(); c.ellipse(ex, ey, rx, Math.max(1, ry), 0, 0, Math.PI * 2); c.fill(); c.stroke();
    if (open > 0.3) {
      const target = mouse.world || { x: ball.x, y: ball.y }, tp = toScreen(target.x, target.y);
      const ang = Math.atan2(tp.y - ey, tp.x - ex), px = ex + Math.cos(ang) * rx * 0.4, py = ey + Math.sin(ang) * ry * 0.35;
      c.save(); c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); c.clip();
      c.beginPath(); c.arc(px, py, R * 0.42, 0, 7); c.stroke();
      c.beginPath(); for (let k = -R; k < R; k += 3) { c.moveTo(px + k, py - R * 0.42); c.lineTo(px + k + R * 0.3, py + R * 0.42); }   // штриховка радужки
      c.save(); c.beginPath(); c.arc(px, py, R * 0.42, 0, 7); c.clip(); c.stroke(); c.restore();
      c.fillStyle = flash ? "#c0281c" : INK; c.beginPath(); c.arc(px, py, R * 0.18, 0, 7); c.fill();
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
    if (darkT > 0) { ctx.fillStyle = `rgba(253,253,251,${darkT})`; ctx.fillRect(0, 0, T.VW, T.VH); }   // мир стирают ластиком — остаётся чистый лист
  }
  function multOver() {
    if (ball && (ball.visible || ball.pancake || ball.blobs)) multBall();
  }

  // ---------------------------------------------------------------- шарик: белый кругляш с контуром, лёгкий пастельный цвет = настроение
  const CLAY = {
    neutral: [246, 196, 160], happy: [252, 222, 120], scared: [168, 206, 240], angry: [240, 130, 110], sad: [150, 168, 228], awe: [200, 170, 240],
    pray: [246, 232, 170], dizzy: [244, 170, 214], suspicious: [180, 222, 140], determined: [248, 176, 110], glitch: [120, 236, 196],
  };
  const clay = [246, 196, 160];
  function moodColor() {
    let mood = ball.mood || "neutral";
    const emo = ball.emo && game.time < ball.emo.until ? ball.emo : null; if (emo) mood = emo.mood;
    let c = CLAY[mood] || CLAY.neutral;
    if (mood === "glitch") c = Math.floor(game.time * 10) % 2 ? CLAY.glitch : [255, 140, 240];
    for (let i = 0; i < 3; i++) clay[i] += (c[i] - clay[i]) * 0.08;
    return clay;
  }
  // рожица: глаза-точки (как у человечков в тех мультах), брови и рот рисуют эмоцию
  function drawFace(c, r, mood, look) {
    const lx = look * r * 0.1;
    c.fillStyle = INK;
    const eye = (ex, closed) => {
      if (closed) { c.beginPath(); c.arc(ex, -r * 0.2, r * 0.14, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); return; }
      if (mood === "dizzy" || mood === "glitch") { c.beginPath(); c.moveTo(ex - 2.5, -r * 0.3); c.lineTo(ex + 2.5, -r * 0.1); c.moveTo(ex + 2.5, -r * 0.3); c.lineTo(ex - 2.5, -r * 0.1); c.stroke(); return; }
      if (mood === "scared" || mood === "awe") { c.beginPath(); c.arc(ex + lx, -r * 0.2, r * 0.17, 0, 7); c.stroke(); c.beginPath(); c.arc(ex + lx, -r * 0.2, 1, 0, 7); c.fill(); return; }
      c.beginPath(); c.arc(ex + lx, -r * 0.2, 1.6, 0, 7); c.fill();
    };
    const closed = mood === "pray";
    eye(-r * 0.3, closed); eye(r * 0.3, closed || (mood === "suspicious" && Math.floor(game.time * 2) % 3 === 0));
    c.beginPath();                                                        // брови
    if (mood === "angry" || mood === "determined") { c.moveTo(-r * 0.5, -r * 0.55); c.lineTo(-r * 0.12, -r * 0.42); c.moveTo(r * 0.5, -r * 0.55); c.lineTo(r * 0.12, -r * 0.42); }
    else if (mood === "sad" || mood === "scared") { c.moveTo(-r * 0.5, -r * 0.42); c.lineTo(-r * 0.15, -r * 0.56); c.moveTo(r * 0.5, -r * 0.42); c.lineTo(r * 0.15, -r * 0.56); }
    else if (mood === "suspicious") { c.moveTo(r * 0.12, -r * 0.52); c.lineTo(r * 0.5, -r * 0.48); }
    c.stroke();
    c.beginPath();                                                        // рот
    const my = r * 0.3;
    if (mood === "happy") { c.arc(0, my - r * 0.12, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    else if (mood === "sad") { c.arc(0, my + r * 0.2, r * 0.2, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); }
    else if (mood === "scared" || mood === "awe") { c.ellipse(0, my, r * 0.1, r * (mood === "awe" ? 0.17 : 0.11), 0, 0, 7); c.stroke(); }
    else if (mood === "angry" || mood === "determined") { c.moveTo(-r * 0.2, my); c.lineTo(r * 0.2, my); c.stroke(); }
    else if (mood === "pray") { c.arc(0, my, r * 0.06, 0, 7); c.stroke(); }
    else if (mood === "dizzy" || mood === "glitch") { c.moveTo(-r * 0.22, my); for (let i = 1; i <= 5; i++) c.lineTo(-r * 0.22 + i * r * 0.09, my + (i % 2 ? 2 : -2)); c.stroke(); }
    else { c.moveTo(-r * 0.14, my); c.quadraticCurveTo(0, my + 2, r * 0.16, my - 1); c.stroke(); }
  }
  function multBall() {
    const col = moodColor(), fill = rgb(col, 1);
    ctx.lineWidth = LW + 0.2; ctx.strokeStyle = INK; ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (ball.visible) {
      const p = toScreen(ball.x, ball.y - T.R);
      const emo = ball.emo && game.time < ball.emo.until ? ball.emo : null;
      if (emo && (emo.mood === "scared" || emo.mood === "angry") && emo.k > 0.4) p.x += Math.round((Math.random() - 0.5) * 4 * emo.k);
      let sx = ball.sx, sy = ball.sy;
      if (!ball.grounded && ball.alive()) { const s = Math.min(0.18, Math.abs(ball.vy) / 30); sx *= 1 - s * 0.6; sy *= 1 + s; }
      const r = T.R * TPX + 1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sx, sy); ctx.translate(0, -r);
      ctx.fillStyle = fill;
      wobblePath(ctx, blobPts(0, 0, r, r, 16, 21 + boilK(), 0.05), 1, true, 5 + boilK()); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.rotate(ball.roll);                                   // пара штрихов — видно, что катится
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r * 0.45, r * 0.3); ctx.lineTo(r * 0.6, r * 0.45); ctx.moveTo(r * 0.3, r * 0.5); ctx.lineTo(r * 0.42, r * 0.66); ctx.stroke();
      ctx.restore();
      ctx.lineWidth = 1.2;
      drawFace(ctx, r, (emo && emo.mood) || ball.mood || "neutral", ball.lookLeft ? -1 : 1);
      ctx.restore();
    }
    if (ball.pancake) {
      const k = Math.min(1, ball.pancake.t / 0.25), e = 1 - Math.pow(1 - k, 3);
      const p = toScreen(ball.x, ball.pancake.up ? ball.y + T.R - 0.2 : ball.y - T.R + 0.12);
      const w = 26 * (0.6 + 0.48 * e), h = 4 * (2.2 - 1.3 * e);
      ctx.fillStyle = fill; wobblePath(ctx, blobPts(p.x, p.y, w, h, 14, 4 + boilK(), 0.1), 1, true, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; for (const dx of [-5, 5]) { ctx.beginPath(); ctx.arc(p.x + dx + Math.sin(game.time * 9 + dx), p.y - h * 0.3, 1.3, 0, 7); ctx.fill(); }
    }
    if (ball.blobs) {
      const k = 1 - Math.max(0, ball.timer) / 0.45, e = k * k * (3 - 2 * k);
      ctx.fillStyle = fill; ctx.lineWidth = 1;
      for (const b of ball.blobs) {
        const p = toScreen(ball.x + b.x * (1 - e), ball.y + b.y * (1 - e) + Math.sin(e * Math.PI) * 0.4);
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 7); ctx.fill(); ctx.stroke();
      }
    }
    if (ball.bits) for (const b of ball.bits) { const p = toScreen(ball.x + b.x, ball.y + b.y); ctx.fillStyle = INK; ctx.fillRect(p.x, p.y, 2, 2); }
  }

  // ---------------------------------------------------------------- свои существа кампании: белая фигура, общий контур, глаза-кружки
  const MCB = {};
  function multBossCanvas(def, frame) {
    const key = JSON.stringify(def.shape).length + ":" + (def.title || "") + ":" + frame + ":" + boilK();
    if (MCB[key]) return MCB[key];
    const [wt, ht] = def.size || [3, 3], W = Math.round(wt * TPX), H = Math.round(ht * TPX), pad = 4;
    const cv = document.createElement("canvas"); cv.width = W + pad * 2; cv.height = H + 8 + pad * 2;
    const c = cv.getContext("2d"), atk = frame === "atk";
    const dy = atk ? ((def.atk && def.atk.dy) != null ? def.atk.dy : -4) : 0;
    const sx = W / 100, sy = H / 100, P = (x, y) => [x * sx + pad, (y + dy) * sy + 8 + pad];
    c.lineCap = "round"; c.lineJoin = "round";
    const j = boilK() ? 0.6 : -0.6;
    const pass = (outline) => {
      c.fillStyle = outline ? INK : PAPER; c.strokeStyle = c.fillStyle;
      const ow = outline ? 2.6 : 0;
      for (const part of def.shape || []) {
        if (part.e || part.c) { const [cx, cy, rx, ry] = part.e || [part.c[0], part.c[1], part.c[2], part.c[2]], [x, y] = P(cx, cy); c.beginPath(); c.ellipse(x + j, y, rx * sx + ow / 2, ry * sy + ow / 2, 0, 0, Math.PI * 2); c.fill(); }
        else if (part.p) { c.lineWidth = ow; c.beginPath(); for (let i = 0; i + 1 < part.p.length; i += 2) { const [x, y] = P(part.p[i], part.p[i + 1]); i ? c.lineTo(x + (i % 4 ? j : -j), y) : c.moveTo(x, y); } c.closePath(); c.fill(); if (ow) c.stroke(); }
        else if (part.l) { c.lineWidth = Math.max(1, (part.w || 2) * (sx + sy) / 2) + ow; c.beginPath(); for (let i = 0; i + 1 < part.l.length; i += 2) { const [x, y] = P(part.l[i], part.l[i + 1]); i ? c.lineTo(x + j, y) : c.moveTo(x, y); } c.stroke(); }
      }
    };
    pass(true); pass(false);
    // штрихи внутри фигуры — как объём в тех мультах
    mseed = (def.title || "x").length * 7 + boilK();
    c.strokeStyle = INK; c.lineWidth = 1;
    for (let i = 0; i < Math.round(wt * ht * 1.5); i++) {
      const x = pad + mr() * W, y = pad + 8 + mr() * H;
      const d = c.getImageData(x | 0, y | 0, 1, 1).data;
      if (d[3] > 200 && d[0] > 200) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3, y + 4); c.stroke(); }
    }
    const eyes = (def.shape || []).filter((p) => p.eye).map((p) => p.eye);
    const k = atk ? ((def.atk && def.atk.eyes) || 1.5) : 1;
    c.lineWidth = 1.2; c.strokeStyle = INK; c.fillStyle = PAPER;
    const E = eyes.map(([ex, ey, r]) => { const [x, y] = P(ex, ey); return [x, y, Math.max(2.5, r * (sx + sy) / 2 * k * 1.3)]; });
    for (const [x, y, rr] of E) {
      if (frame === "blink") { c.beginPath(); c.moveTo(x - rr, y); c.lineTo(x + rr, y); c.stroke(); continue; }
      c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); c.stroke();
    }
    MCB[key] = { cv, eyes: E };
    return MCB[key];
  }
  function multBoss(t, frame, wx, wy, peek, flip) {
    const B = multBossCanvas(t.def, frame), cv = B.cv, p = toScreen(wx, wy);
    ctx.save(); ctx.translate(p.x, p.y); if (flip) ctx.scale(-1, 1);
    if (peek) { ctx.beginPath(); ctx.rect(-cv.width / 2, -cv.height / 2, cv.width, cv.height * 0.45); ctx.clip(); }
    const ox = Math.round(-cv.width / 2), oy = Math.round(-cv.height / 2) - 4;
    ctx.drawImage(cv, ox, oy);
    if (frame !== "blink" && ball) {                                       // зрачки-точки следят за шариком
      const bp = toScreen(ball.x, ball.y);
      ctx.fillStyle = frame === "atk" ? "#c0281c" : INK;
      for (const [x, y, rr] of B.eyes) {
        let dx = bp.x - (p.x + (flip ? -1 : 1) * (ox + x)), dy = bp.y - (p.y + oy + y); const d = Math.hypot(dx, dy) || 1;
        if (flip) dx = -dx;
        ctx.beginPath(); ctx.arc(ox + x + dx / d * rr * 0.45, oy + y + dy / d * rr * 0.45, Math.max(1.1, rr * 0.4), 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- переключатель стиля
  const LIMBO = { name: "limbo", sprite: nightSprite, bake: bakeWorld, bg: renderNight, over: renderGlow, ball: drawBall, boss: drawCustomBoss,
                  darkFill: "rgba(2,2,2,0.92)", conv: "rgba(90,90,86,0.9)" };
  const MULT = { name: "mult", sprite: multSprite, bake: multBake, bg: multBg, over: multOver, ball: () => { }, boss: multBoss,
                 darkFill: "rgba(0,0,0,0.42)", conv: INK };
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
