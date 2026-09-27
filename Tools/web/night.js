  // ================================================================ НОЧНАЯ ГРАФИКА «СТИППЛИНГ»
  // Вклеивается в game.js сборщиком (маркер @@NIGHT@@).
  // Мир — белые точки на чёрном (пунктирная гравюра), мягкие облачные формы, царапины плёнки, пылинки,
  // огромный глаз-наблюдатель в небе (зрачок следит за курсором игрока).
  // Единственный цвет — свечение шарика: зависит от настроения и состояния и подкрашивает точки мира вокруг.

  const NIGHT_BG = "#050505";
  const DOT = [233, 230, 223];               // цвет точек (тёплый белый)
  // Цвет свечения по настроению
  const GLOW = {
    neutral: [255, 233, 196], happy: [255, 205, 80], scared: [150, 214, 255], angry: [255, 70, 50], sad: [80, 120, 255],
    awe: [200, 150, 255], pray: [255, 244, 176], dizzy: [255, 140, 210], suspicious: [185, 255, 100], determined: [255, 150, 45],
    glitch: [60, 240, 160],
  };
  let seedN = 1;
  const rnd = () => { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; };

  // ---------------------------------------------------------------- спрайты → точечная техника (x2)
  // Каждый пиксель исходного спрайта становится 2×2 субпикселями: тёмная «подложка» (силуэт закрывает фон)
  // и белые точки с вероятностью по яркости исходной краски; кромка силуэта — плотная (лунный контур).
  const NS = {};
  function lum(r, g, b) { return (0.3 * r + 0.59 * g + 0.11 * b) / 255; }
  function nightSprite(name) {
    if (NS[name]) return NS[name];
    const im = IMG[name]; if (!im) return null;
    const w = im.width, h = im.height;
    const src = document.createElement("canvas"); src.width = w; src.height = h;
    const sc = src.getContext("2d"); sc.drawImage(im, 0, 0);
    const d = sc.getImageData(0, 0, w, h).data;
    const out = document.createElement("canvas"); out.width = w * 2; out.height = h * 2;
    const oc = out.getContext("2d"), od = oc.createImageData(w * 2, h * 2), o = od.data;
    seedN = 7 + name.length * 131;
    const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (d[i + 3] < 40) continue;
      const L0 = lum(d[i], d[i + 1], d[i + 2]);
      const edge = !A(x - 1, y) || !A(x + 1, y) || !A(x, y - 1) || !A(x, y + 1);
      const topEdge = !A(x, y - 1);
      // тёмная краска — редкие точки, светлая — густые; верхняя кромка «освещена луной»
      let p = 0.1 + L0 * 0.8;
      if (edge) p = Math.max(p, topEdge ? 0.95 : 0.65);
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const j = ((y * 2 + sy) * w * 2 + (x * 2 + sx)) * 4;
        const lit = rnd() < p;
        const v = lit ? 0.75 + 0.25 * rnd() : 0;
        o[j] = lit ? DOT[0] * v : 10; o[j + 1] = lit ? DOT[1] * v : 10; o[j + 2] = lit ? DOT[2] * v : 11; o[j + 3] = 255;
      }
    }
    oc.putImageData(od, 0, 0);
    return (NS[name] = out);
  }

  // плавный «value noise» — облачные бугры на краях рельефа
  function vnoise(x, y) {
    const h = (i, j) => { let n = i * 374761393 + j * 668265263; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) & 1023) / 1023; };
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  }

  // ---------------------------------------------------------------- мир: облачные формы из точек
  const TPX = 32;                                 // пикселей на клетку в ночной графике (= T.PPU)
  const BAKE = new Set(["#", "<", ">", "~"]);    // что запекается в «рельеф»; X, T, O, = — отдельные объекты
  function bakeWorld() {
    const W = L.w, H = L.h, R = 8;                // поле 8 точек на клетку
    const fw = W * R, fh = (H + 2) * R;
    const field = new Float32Array(fw * fh);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (BAKE.has(at(x, y))) {
      for (let yy = 0; yy < R; yy++) for (let xx = 0; xx < R; xx++) field[((H - 1 - y) * R + yy + R) * fw + x * R + xx] = 1;
    }
    // размываем маску — квадраты становятся облаками
    const tmp = new Float32Array(fw * fh);
    const blur = (a, b, r) => {
      for (let y = 0; y < fh; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * fw + Math.max(0, Math.min(fw - 1, x))];
        for (let x = 0; x < fw; x++) { b[y * fw + x] = s / (2 * r + 1); s += a[y * fw + Math.min(fw - 1, x + r + 1)] - a[y * fw + Math.max(0, x - r)]; } }
      for (let x = 0; x < fw; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.max(0, Math.min(fh - 1, y)) * fw + x];
        for (let y = 0; y < fh; y++) { a[y * fw + x] = s / (2 * r + 1); s += b[Math.min(fh - 1, y + r + 1) * fw + x] - b[Math.max(0, y - r) * fw + x]; } }
    };
    blur(field, tmp, 2); blur(field, tmp, 2); blur(field, tmp, 2);
    const F = (px, py) => {        // билинейно из поля по координатам в пикселях ночного холста
      const fx = px / TPX * R - 0.5, fy = py / TPX * R - 0.5 + R;
      const x0 = Math.max(0, Math.min(fw - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(fh - 2, Math.floor(fy)));
      const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
      const a = field[y0 * fw + x0], b = field[y0 * fw + x0 + 1], c = field[(y0 + 1) * fw + x0], e = field[(y0 + 1) * fw + x0 + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
    };
    const cw = W * TPX, ch = H * TPX;
    const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    const cx = cv.getContext("2d"), img = cx.createImageData(cw, ch), o = img.data;
    seedN = 99 + W * 7 + H;
    for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
      // облачные бугры: шум двух масштабов сдвигает порог (коллизия остаётся клеточной)
      const bump = (vnoise(px / 30, py / 24) - 0.5) * 0.5 + (vnoise(px / 9 + 50, py / 9) - 0.5) * 0.14;
      const f = F(px, py) + bump; if (f < 0.5) continue;
      const j = (py * cw + px) * 4;
      // лунный свет сверху: яркая кромка → мягкое затухание вглубь (объём как у облака)
      const a1 = F(px, py - 5) + bump, a2 = F(px + 3, py - 14) + bump, a3 = F(px - 4, py - 28) + bump;
      const lit = (a1 < 0.5 ? 1 : 0) * 0.55 + (a2 < 0.5 ? 1 : 0) * 0.3 + (a3 < 0.5 ? 1 : 0) * 0.15;
      const rim = f < 0.54 ? 0.8 : f < 0.58 ? 0.3 : 0;
      const swirl = 0.5 + 0.5 * Math.sin(px * 0.05 + Math.sin(py * 0.035) * 2.6 + py * 0.022);   // «гравюрные» волны
      const shade = vnoise(px / 60, py / 40);                                                    // пятна полутени
      let p = 0.004 + lit * 0.7 + rim + swirl * 0.025 * shade + (lit > 0 ? 0 : shade * 0.018);
      p = Math.min(0.97, p);
      if (rnd() < p) {
        const v = (lit > 0 || rim > 0 ? 0.6 : 0.35) + 0.4 * rnd();          // в глубине точки тусклее
        o[j] = DOT[0] * v; o[j + 1] = DOT[1] * v; o[j + 2] = DOT[2] * v; o[j + 3] = 255;
      } else { o[j] = 6; o[j + 1] = 6; o[j + 2] = 7; o[j + 3] = 255; }
    }
    cx.putImageData(img, 0, 0);
    // конвейеры и лёд — отметки поверх рельефа
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = at(x, y), sx = x * TPX, sy = (H - 1 - y) * TPX;
      if (c === "~") { cx.fillStyle = "rgba(200,230,255,0.9)"; for (let k = 0; k < 10; k++) cx.fillRect(sx + rnd() * TPX, sy + 1 + rnd() * 3, 2, 1); }
    }
    L.night = { world: cv, ww: cw, wh: ch };
    bakeBackdrop();
  }

  // ---------------------------------------------------------------- фон: холмы/деревья/башни точками, царапины, пылинки
  function stippleShape(ctx2, w, h, inside, bright) {
    const img = ctx2.createImageData(w, h), o = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = inside(x, y); if (v <= 0) continue;
      const j = (y * w + x) * 4;
      if (rnd() < v * bright) { const c = 150 + rnd() * 90; o[j] = c; o[j + 1] = c; o[j + 2] = c * 0.97; o[j + 3] = 255; }
      else { o[j] = 5; o[j + 1] = 5; o[j + 2] = 6; o[j + 3] = 255; }
    }
    ctx2.putImageData(img, 0, 0);
  }
  function bakeBackdrop() {
    const pal = L.pal, W = 1280, H = 360;
    seedN = 4242 + pal.length;
    // дальний план: облачные холмы (луг), сталактиты (пещера), башни (город), рваные слои (глитч)
    const far = document.createElement("canvas"); far.width = W; far.height = H;
    const f = far.getContext("2d");
    const hill = (x) => 250 + 40 * Math.sin(x / W * Math.PI * 4) + 22 * Math.sin(x / W * Math.PI * 10 + 1.3);
    stippleShape(f, W, H, (x, y) => {
      if (pal === "city") {
        const col = Math.floor(x / 64), top = 140 + ((col * 53) % 110), tw = 44;
        const inTower = (x % 64) < tw && y > top;
        const win = inTower && (x % 16 < 5) && (y % 24 < 9) && ((col + (y >> 5)) % 3 === 0);
        return inTower ? (win ? 0.9 : 0.12 + (y - top) / H * 0.1) : 0;
      }
      if (pal === "cave") {
        const top = 40 + 30 * Math.sin(x / 90) + ((x * 13) % 37);
        return y < top ? 0.25 : y > hill(x) + 20 ? 0.12 : 0;
      }
      if (pal === "void") return 0;
      const yy = pal === "glitch" && Math.floor(y / 18) % 3 === 0 ? y + 12 : y;
      const t = hill(x + (pal === "glitch" ? Math.floor(y / 18) * 17 : 0));
      if (yy < t) return 0;
      const edge = yy - t < 5 ? 0.6 : 0;
      return 0.1 + edge + Math.max(0, 0.3 - (yy - t) / 200);
    }, 0.85);
    // ближний план: деревья-«капли» (луг, пещера), обломки (глитч, пустота)
    const near = document.createElement("canvas"); near.width = W; near.height = H;
    const n = near.getContext("2d");
    const trees = [];
    for (let i = 0; i < 9; i++) trees.push({ x: 60 + i * 140 + rnd() * 60, w: 50 + rnd() * 40, top: 60 + rnd() * 120 });
    stippleShape(n, W, H, (x, y) => {
      if (pal === "city" || pal === "void") return 0;
      for (const t of trees) {
        const dx = (x - t.x) / t.w, crown = (y - t.top) / (H - t.top);
        const widthAt = 0.55 + 0.45 * Math.sin(Math.min(1, crown * 1.6) * Math.PI);  // форма «капли»
        if (y > t.top && Math.abs(dx) < widthAt * (1 - crown * 0.35)) {
          const rimR = widthAt * (1 - crown * 0.35) - Math.abs(dx);
          return rimR < 0.06 ? 0.4 : 0.015 + (dx < -0.2 ? 0.04 : 0);
        }
      }
      return 0;
    }, 0.8);
    // царапины плёнки / «дождь»
    const scr = document.createElement("canvas"); scr.width = 640; scr.height = 720;
    const s = scr.getContext("2d");
    for (let i = 0; i < 420; i++) {
      const x = rnd() * 640, y = rnd() * 720, len = 6 + rnd() * 40;
      s.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.06})`; s.fillRect(x, y, 1, len);
    }
    // пылинки
    const motes = [];
    for (let i = 0; i < 26; i++) motes.push({ x: rnd() * 640, y: rnd() * 360, r: 2 + rnd() * 6, s: 0.2 + rnd() * 0.6, ph: rnd() * 6.28 });
    L.night.far = far; L.night.near = near; L.night.scratch = scr; L.night.motes = motes;
  }

  // ---------------------------------------------------------------- глаз-наблюдатель
  function drawEye(c, t) {
    const aw = Math.max(L.data.awareness || 0, stageNowSafe());
    if (L.pal === "cave" && aw < 3) return;
    const strength = [0.25, 0.4, 0.55, 0.75, 0.95, 1][Math.min(5, aw)];
    const ex = T.VW * 0.72 - (CO.cx % 400) * 0.04, ey = 72 + Math.sin(t * 0.3) * 3;
    const rx = 58, ry = 24;
    const blink = (Math.sin(t * 0.37) > 0.995 || (L.eyeFlash && t < L.eyeFlash)) ? 0.15 : 1;   // моргает; вспыхивает, когда игрок жмёт ловушку
    const flash = L.eyeFlash && t < L.eyeFlash ? 1 : 0;
    c.save();
    // лучи
    c.globalAlpha = 0.25 * strength + flash * 0.3;
    c.strokeStyle = "rgb(230,226,218)"; c.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + t * 0.02, r0 = 40, r1 = 70 + ((i * 37) % 60) + flash * 30;
      c.beginPath(); c.moveTo(ex + Math.cos(a) * r0, ey + Math.sin(a) * r0 * 0.7); c.lineTo(ex + Math.cos(a) * r1, ey + Math.sin(a) * r1 * 0.7); c.stroke();
    }
    // миндалина из точек: густая кромка, редкий белок
    c.globalAlpha = strength;
    seedN = 777 + Math.floor(t * 6);
    for (let i = 0; i < 1400; i++) {
      const u = rnd() * 2 - 1, v = rnd() * 2 - 1, lim = (1 - u * u) * blink;
      if (Math.abs(v) > lim) continue;
      const edge = Math.abs(v) > lim * 0.82;
      if (!edge && rnd() < 0.55) continue;
      c.fillStyle = edge ? "rgba(245,241,233,0.95)" : "rgba(200,196,188,0.6)";
      c.fillRect(ex + u * rx, ey + v * ry, edge ? 1.5 : 1, 1);
    }
    // зрачок следит за курсором наблюдателя (а если курсора нет — за шариком)
    if (blink > 0.5) {
      const target = mouse.world || { x: ball.x, y: ball.y };
      const tp = toScreen(target.x, target.y);
      const ang = Math.atan2(tp.y - ey, tp.x - ex), dist = Math.min(1, Math.hypot(tp.x - ex, tp.y - ey) / 300);
      const px = ex + Math.cos(ang) * rx * 0.3 * dist, py = ey + Math.sin(ang) * ry * 0.25 * dist;
      const halo = c.createRadialGradient(px, py, 14, px, py, 26);
      halo.addColorStop(0, `rgba(255,250,235,${0.55 + flash * 0.4})`); halo.addColorStop(1, "rgba(255,250,235,0)");
      c.fillStyle = halo; c.beginPath(); c.arc(px, py, 26, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#000"; c.beginPath(); c.arc(px, py, 15, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(255,255,255,0.9)"; c.fillRect(px - 6, py - 7, 2, 2);
    }
    c.restore();
  }
  function stageNowSafe() { try { return stageNow(); } catch (e) { return 0; } }

  // ---------------------------------------------------------------- свечение шарика
  const glowState = { c: [255, 233, 196], r: 1, pulse: 0 };
  function glowTarget() {
    let mood = ball.mood || "neutral";
    const emo = ball.emo && game.time < ball.emo.until ? ball.emo : null;
    let k = emo ? emo.k : 0.4, bright = 1;
    if (ball.state === "splat" || ball.state === "dead") { bright = 0.18 + Math.random() * 0.08; mood = "sad"; }   // лепёшка гаснет
    if (ball.state === "reform") bright = 0.4 + (1 - Math.max(0, ball.timer) / 0.45) * 0.9;                        // разгорается
    if (brain && brain.thinking) bright *= 0.85 + 0.25 * Math.sin(game.time * 6);                                   // думает — пульсирует
    let c = GLOW[mood] || GLOW.neutral;
    if (mood === "glitch") c = Math.floor(game.time * 10) % 2 ? GLOW.glitch : [255, 60, 240];
    const courage = (typeof MIND !== "undefined") ? MIND.traits.courage : 0.5;
    const aware = (typeof MIND !== "undefined") ? MIND.traits.awareness / 5 : 0.2;
    return { c, r: (0.8 + k * 0.5 + aware * 0.4) * (0.85 + courage * 0.3), bright };
  }
  function updateGlow(dt) {
    const g = glowTarget(), a = Math.min(1, dt * 4);
    for (let i = 0; i < 3; i++) glowState.c[i] += (g.c[i] - glowState.c[i]) * a;
    glowState.r += (g.r * g.bright - glowState.r) * a;
  }
  const rgb = (c, al) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;

  // ---------------------------------------------------------------- кадр
  const light = { cv: document.createElement("canvas") };
  light.cv.width = T.VW; light.cv.height = T.VH; light.ctx = light.cv.getContext("2d");

  function renderNight(dt) {
    const t = game.time;
    updateGlow(dt || 1 / 60);
    const darkT = game.cutscene && L.dissolve >= 0 ? Math.min(1, L.dissolve) : 0;
    ctx.fillStyle = NIGHT_BG; ctx.fillRect(0, 0, T.VW, T.VH);
    const N = L.night;
    if (!N) return;
    // царапины (медленно «идут»)
    ctx.globalAlpha = 0.9 - darkT;
    const so = (t * 40) % 360;
    ctx.drawImage(N.scratch, 0, so - 360); ctx.drawImage(N.scratch, 0, so);
    ctx.globalAlpha = 1;
    if (!L.swHidden) drawEye(ctx, t);
    // дальний и ближний планы с параллаксом
    const par = (img, f, yoff, al) => {
      const off = ((CO.cx * TPX * f) % img.width + img.width) % img.width;
      ctx.globalAlpha = al * (1 - darkT);
      ctx.drawImage(img, -off, yoff); ctx.drawImage(img, img.width - off, yoff);
      ctx.globalAlpha = 1;
    };
    const vy = (CO.cy - L.h / 2) * TPX * 0.15;
    par(N.far, 0.25, vy, 0.4);
    par(N.near, 0.55, vy * 1.8 + 20, 0.45);
    // пылинки
    for (const m of N.motes) {
      const x = (m.x - CO.cx * TPX * 0.1 * m.s + 6400) % 640, y = (m.y + Math.sin(t * m.s + m.ph) * 12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, m.r);
      g.addColorStop(0, `rgba(255,255,255,${0.12 * (1 - darkT)})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(x - m.r, y - m.r, m.r * 2, m.r * 2);
    }
    // рельеф
    const sx = Math.round((CO.cx - T.VW / TPX / 2) * TPX), sy = Math.round((L.h - CO.cy - T.VH / TPX / 2) * TPX);
    const worldAlpha = (L.data.dark ? 0.55 : 1) * (1 - darkT * 0.85);
    ctx.globalAlpha = worldAlpha;
    ctx.drawImage(N.world, sx, sy, T.VW, T.VH, 0, 0, T.VW, T.VH);
    ctx.globalAlpha = 1;
    if (L.dissolve > 0) {                    // выключение мира: рельеф осыпается точками
      ctx.fillStyle = NIGHT_BG;
      for (let i = 0; i < 1800 * L.dissolve * L.dissolve; i++) ctx.fillRect(Math.random() * T.VW, Math.random() * T.VH, 3 + Math.random() * 10, 3 + Math.random() * 10);
    }
  }

  // Свет шарика: цветная подсветка точек вокруг и ореол. Вызывается после всех объектов.
  function renderGlow() {
    if (!ball || (!ball.visible && !ball.pancake && !ball.blobs)) return;
    const p = toScreen(ball.x, ball.y), R = 150 * glowState.r, c = glowState.c;
    // 1) подкрашиваем то, что уже нарисовано вокруг (точки мира) — «свет падает на мир»
    const lc = light.ctx;
    lc.globalCompositeOperation = "source-over"; lc.clearRect(0, 0, T.VW, T.VH);
    lc.drawImage(buf, 0, 0);
    lc.globalCompositeOperation = "multiply";
    lc.fillStyle = rgb(c, 1); lc.fillRect(0, 0, T.VW, T.VH);
    lc.globalCompositeOperation = "destination-in";
    const mg = lc.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
    mg.addColorStop(0, "rgba(0,0,0,1)"); mg.addColorStop(0.5, "rgba(0,0,0,0.6)"); mg.addColorStop(1, "rgba(0,0,0,0)");
    lc.fillStyle = mg; lc.fillRect(0, 0, T.VW, T.VH);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.9; ctx.drawImage(light.cv, 0, 0); ctx.restore();
    // 2) ореол
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const h = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, R * 0.55);
    h.addColorStop(0, rgb(c, 0.55)); h.addColorStop(0.35, rgb(c, 0.18)); h.addColorStop(1, rgb(c, 0));
    ctx.fillStyle = h; ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2);
    ctx.restore();
  }

  // Сам шарик: светящийся пластилиновый шар с лицом
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
      // искорки внутри крутятся при качении
      ctx.save(); ctx.translate(0, -r); ctx.rotate(ball.roll);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (let i = 0; i < 5; i++) { const a = i * 1.26; ctx.fillRect(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, 1.5, 1.5); }
      ctx.restore();
      if (ball.lookLeft) ctx.scale(-1, 1);
      const face = IMG["face_" + ball.mood] || IMG.face_neutral;
      ctx.globalAlpha = 0.85; ctx.drawImage(face, -16, -32, 32, 32); ctx.globalAlpha = 1;
      ctx.restore();
    }
    if (ball.pancake) {
      const k = Math.min(1, ball.pancake.t / 0.25), e = 1 - Math.pow(1 - k, 3);
      const p = toScreen(ball.x, ball.pancake.up ? ball.y + T.R - 0.2 : ball.y - T.R + 0.12);
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = rgb(c.map((v) => v * 0.6), 0.9);
      ctx.beginPath(); ctx.ellipse(0, 0, 13 * (0.6 + 0.48 * e) * 2, 3.5 * (2.2 - 1.3 * e) * 2 / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
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
