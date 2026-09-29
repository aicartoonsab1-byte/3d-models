// SAM_Toons · декорации и предметы. Каждый тип — функция рисования в локальных координатах:
// (0,0) — точка стояния предмета на земле (или центр летающего предмета), ось Y вниз, единицы мира.
// p — параметры предмета из film.json (x, y, z, s, …), t — время, st — {talk} если предмет «говорит».
// z по умолчанию: back — позади персонажей, front — перед ними.
(function () {
  const SAM = window.SAM;
  const PROPS = {};
  const def = (name, z, fn, back) => (PROPS[name] = { z, draw: fn, back });

  // облако: кудрявый верх, плоский низ
  def("cloud", "back", (P, p, t) => {
    const w = 12 * p.s, h = 4 * p.s, pts = [];
    for (let i = 0; i <= 6; i++) { const a = Math.PI * (1 - i / 6); pts.push([Math.cos(a) * w / 2, -Math.sin(a) * h * (0.7 + (i % 2) * 0.35)]); }
    pts.push([w * 0.3, h * 0.25], [-w * 0.3, h * 0.25]);
    P.bumps(pts, { seed: p.seed, bulge: 0.55 });
  });

  // дерево: ствол двумя линиями + круглая кудрявая крона
  def("tree", "back", (P, p) => {
    const h = 14 * p.s, tw = 0.45 * p.s, seed = p.seed;
    P.poly([[-tw, 0], [-tw * 0.8, -h * 0.55]], seed); P.poly([[tw, 0], [tw * 0.8, -h * 0.55]], seed + 1);
    P.poly([[tw * 0.7, -h * 0.35], [tw * 2.8, -h * 0.47]], seed + 2, 0.8);
    const cr = h * 0.3, pts = P.ellipsePts(0, -h * 0.7, cr * 0.9, cr, 9, seed, 0.12);
    P.bumps(pts, { seed, bulge: 0.45 });
    // пара завитков внутри кроны
    for (const [dx, dy, k] of [[-0.35, -0.02, 1], [0.3, 0.25, 0.8]]) { const x = dx * cr, y = -h * 0.7 + dy * cr, r = cr * 0.16 * k; P.c.beginPath(); P.c.arc(x - r, y, r, Math.PI, 0); P.c.arc(x + r, y, r, Math.PI, 0); P.c.lineWidth = P.lw * 0.8; P.c.stroke(); }
  });

  def("bush", "back", (P, p) => {
    const w = 5 * p.s, h = 2.2 * p.s, pts = [[-w / 2, 0]];
    for (let i = 1; i < 6; i++) { const a = Math.PI * (1 - i / 6); pts.push([Math.cos(a) * w / 2, -Math.sin(a) * h]); }
    pts.push([w / 2, 0]);
    P.bumps(pts, { seed: p.seed, bulge: 0.6, closed: false });
  });

  def("grass", "back", (P, p) => {
    const s = p.s * 0.8, seed = p.seed;
    P.poly([[-0.25 * s, 0], [-0.45 * s, -0.7 * s]], seed); P.poly([[0, 0], [0.02 * s, -0.95 * s]], seed + 1); P.poly([[0.22 * s, 0], [0.45 * s, -0.65 * s]], seed + 2);
  });
  def("rock", "back", (P, p) => { P.shape(P.ellipsePts(0, -0.3 * p.s, 0.7 * p.s, 0.35 * p.s, 8, p.seed, 0.15), { seed: p.seed }); });

  def("sun", "back", (P, p, t) => {
    const r = 2.4 * p.s; P.circle(0, 0, r, p.seed);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + t * 0.15; P.line(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3, Math.cos(a) * r * 1.75, Math.sin(a) * r * 1.75, p.seed + i); }
  });

  def("house", "back", (P, p) => {
    const w = 12 * p.s, h = 8 * p.s, seed = p.seed;
    P.rect(-w / 2, -h, w, h, seed);
    P.rect(w * 0.22, -h * 1.45, w * 0.1, h * 0.35, seed + 4);
    P.shape([[-w * 0.58, -h], [0, -h * 1.7], [w * 0.58, -h]], { seed: seed + 1 });
    P.rect(-w * 0.35, -h * 0.55, w * 0.22, h * 0.55, seed + 2); P.dot(-w * 0.17, -h * 0.28, 0.12);
    P.rect(w * 0.08, -h * 0.72, w * 0.26, h * 0.3, seed + 3); P.line(w * 0.21, -h * 0.72, w * 0.21, -h * 0.42, seed + 5, 0.8); P.line(w * 0.08, -h * 0.57, w * 0.34, -h * 0.57, seed + 6, 0.8);
  });

  // здание с вывеской; decor: "casino" (кубики, карты, игровые автоматы) | "shop" | "none"
  def("building", "back", (P, p, t) => {
    const w = (p.w || 40) * p.s, h = (p.h || 20) * p.s, seed = p.seed, c = P.c;
    const decor = p.decor || "none";
    // карты и кубики за вывеской
    if (decor === "casino") {
      const die = (x, y, a, n, sd) => { c.save(); c.translate(x, y); c.rotate(a); const d = 2.2 * p.s; P.rect(-d / 2, -d / 2, d, d, sd); const pip = [[0, 0], [-0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, 0], [0.5, 0]]; const sets = { 1: [0], 3: [0, 1, 2], 4: [1, 2, 3, 4], 5: [0, 1, 2, 3, 4], 6: [1, 2, 3, 4, 5, 6] }; for (const i of sets[n]) P.dot(pip[i][0] * d * 0.5, pip[i][1] * d * 0.5, d * 0.08); c.restore(); };
      const card = (x, y, a, suit, sd) => { c.save(); c.translate(x, y); c.rotate(a); const cw = 2.2 * p.s, ch = 3 * p.s; P.rect(-cw / 2, -ch / 2, cw, ch, sd); P.text(suit, 0, 0.1 * p.s, 1.6 * p.s); P.text("A", -cw * 0.3, -ch * 0.33, 0.7 * p.s); c.restore(); };
      die(-w * 0.34, -h * 1.26, -0.25, 5, seed + 20); card(-w * 0.24, -h * 1.34, 0.12, "♠", seed + 21);
      card(w * 0.27, -h * 1.3, -0.1, "♣", seed + 22); card(w * 0.35, -h * 1.26, 0.3, "♦", seed + 23); die(w * 0.46, -h * 1.1, 0.12, 4, seed + 24);
    }
    P.rect(-w / 2, -h, w, h, seed);
    P.rect(-w / 2 - 0.3, -h - 0.6, w + 0.6, 0.6, seed + 1);
    // вывеска
    const sw = w * 0.62, sh = h * 0.38, sy = -h * 1.22;
    P.rect(-sw / 2 - 0.35, sy - 0.35, sw + 0.7, sh + 0.7, seed + 2); P.rect(-sw / 2, sy, sw, sh, seed + 3);
    if (p.sign) P.text(p.sign, 0, sy + sh * 0.52, sh * 0.72, { outline: true, lw: 1.1 });
    // боковые панели с волнами
    for (const sx of [-1, 1]) {
      const px = sx < 0 ? -w / 2 : w / 2 - w * 0.12;
      P.rect(px, -h * 0.98, w * 0.12, h * 0.26, seed + 5 + sx);
      for (let i = 0; i < 3; i++) { const yy = -h * 0.93 + i * h * 0.075; P.poly([[px + w * 0.02, yy], [px + w * 0.04, yy - 0.25], [px + w * 0.06, yy], [px + w * 0.08, yy - 0.25], [px + w * 0.1, yy]], seed + 30 + i, 0.8); }
    }
    // витрина с игровыми автоматами и дверь
    const wx = -w * 0.42, wy = -h * 0.62, ww = w * 0.44, wh = h * 0.42;
    P.rect(wx, wy, ww, wh, seed + 7); P.rect(wx + 0.4, wy + 0.4, ww - 0.8, wh - 0.8, seed + 8, { fill: false, lw: 0.7 });
    if (decor === "casino") for (let i = 0; i < 3; i++) {
      const mx = wx + ww * (0.2 + i * 0.3), mw = ww * 0.2, top = wy + wh * 0.28;
      P.rect(mx - mw / 2, top, mw, wh * 0.72 - 0.4, seed + 40 + i); P.rect(mx - mw * 0.35, top + wh * 0.12, mw * 0.7, wh * 0.18, seed + 50 + i, { lw: 0.7 });
      const k = Math.floor(t * 6 + i) % 3; for (let j = 0; j < 3; j++) P.dot(mx - mw * 0.22 + j * mw * 0.22, top + wh * 0.21 + (j === k ? -0.1 : 0), 0.13);
      P.c.beginPath(); P.c.arc(mx, top - wh * 0.02, mw * 0.3, Math.PI, 0); P.c.lineWidth = P.lw * 0.8; P.c.stroke();
    }
    const dx = w * 0.12, dw = w * 0.22, dh = h * 0.5;
    P.rect(dx, -dh, dw, dh, seed + 9); P.line(dx + dw / 2, -dh, dx + dw / 2, 0, seed + 10, 0.8);
    P.rect(w * 0.37, -h * 0.62, w * 0.1, h * 0.42, seed + 11);
  });

  // НЛО: тарелка, купол с пришельцами, огоньки; beam 0..1 — луч до земли (рисуется позади персонажей)
  const ufoBeam = (P, p, t) => {
    const b = p.beam || 0; if (b <= 0.01) return;
    const c = P.c, s = p.s * 1.6, H = p.y * b, top = 1.4 * s, w0 = 3.2 * s, w1 = (4.5 + H * 0.28) * s;
    c.save(); c.globalAlpha = Math.min(1, b * 1.5);
    P.shape([[-w0 / 2, top], [w0 / 2, top], [w1 / 2, H], [-w1 / 2, H]], { seed: p.seed + 60, fill: "rgba(255,255,255,0.0)", lw: 0.9 });
    P.shape(P.ellipsePts(0, H, w1 / 2, w1 * 0.09, 20, p.seed + 61), { seed: p.seed + 61, fill: false, lw: 0.9, step: 99 });
    const r = SAM.rng(p.seed + 7);
    for (let i = 0; i < 14; i++) {
      const u = r() - 0.5, v = ((r() + t * 0.35) % 1), yy = top + (H - top) * (1 - v), half = (w0 + (w1 - w0) * (yy - top) / (H - top)) / 2;
      P.line(u * half * 1.6, yy, u * half * 1.6, yy + 0.7, p.seed + 70 + i, 0.6);
    }
    c.restore();
  };
  def("ufo", "front", (P, p, t, st) => {
    const s = p.s * 1.6, c = P.c, seed = p.seed, bob = Math.sin(t * 2.2) * 0.25;
    c.save(); c.translate(0, bob);
    // пришельцы в куполе
    const n = p.aliens ?? 3, talk = st && st.talk || 0;
    for (let i = 0; i < n; i++) {
      const ax = (i - (n - 1) / 2) * 1.9 * s, big = i === Math.floor(n / 2), hr = (big ? 0.85 : 0.6) * s, ay = -1.3 * s - hr * (big ? 1.3 : 1.05);
      P.line(ax - hr * 0.4, ay - hr * 0.8, ax - hr * 0.8, ay - hr * 1.6 + Math.sin(t * 4 + i) * 0.1, seed + i); P.circle(ax - hr * 0.8, ay - hr * 1.6, hr * 0.15, seed + i);
      P.line(ax + hr * 0.4, ay - hr * 0.8, ax + hr * 0.8, ay - hr * 1.6 + Math.cos(t * 4 + i) * 0.1, seed + i + 9); P.circle(ax + hr * 0.8, ay - hr * 1.6, hr * 0.15, seed + i + 9);
      P.rect(ax - hr * 0.55, ay + hr * 0.5, hr * 1.1, hr * 1.2, seed + 20 + i);
      P.circle(ax, ay, hr, seed + 30 + i);
      if (big) { P.circle(ax, ay - hr * 0.1, hr * 0.38, seed + 40); P.dot(ax, ay - hr * 0.1, hr * 0.15); }
      else { P.dot(ax - hr * 0.3, ay - hr * 0.1, hr * 0.1, hr * 0.13); P.dot(ax + hr * 0.3, ay - hr * 0.1, hr * 0.1, hr * 0.13); }
      if (big && talk > 0.05) { c.beginPath(); c.ellipse(ax, ay + hr * 0.5, hr * 0.16, hr * (0.04 + talk * 0.2), 0, 0, 7); c.fillStyle = SAM.INK; c.fill(); }
      else { c.beginPath(); c.arc(ax, ay + hr * 0.35, hr * 0.18, 0.2 * Math.PI, 0.8 * Math.PI); c.lineWidth = P.lw * 0.8; c.stroke(); }
    }
    // купол (прозрачный): только контур и блик
    const dr = 4 * s;
    P.shape([[-dr, -1.2 * s], ...Array.from({ length: 13 }, (_, i) => { const a = Math.PI * (1 + i / 12); return [Math.cos(a) * dr, -1.2 * s + Math.sin(a) * dr * 0.9]; })], { closed: false, seed: seed + 50, fill: false });
    c.beginPath(); c.arc(0, -1.2 * s, dr * 0.8, 1.15 * Math.PI, 1.35 * Math.PI); c.lineWidth = P.lw * 0.8; c.stroke();
    // тарелка
    P.shape(P.ellipsePts(0, 0.2 * s, 5 * s, 1.1 * s, 26, seed + 51), { seed: seed + 51, step: 99 });
    P.shape(P.ellipsePts(0, -0.4 * s, 7.2 * s, 1.25 * s, 30, seed + 52), { seed: seed + 52, step: 99 });
    P.poly(Array.from({ length: 13 }, (_, i) => { const a = Math.PI * i / 12; return [Math.cos(a) * 7.2 * s * 0.98, -0.4 * s + Math.sin(a) * 1.25 * s * 0.25]; }), seed + 53, 0.8);
    for (let i = 0; i < 7; i++) { const a = Math.PI * (0.15 + i * 0.7 / 6), on = (Math.floor(t * 4) + i) % 3 === 0; const lx = Math.cos(a) * 6 * s, ly = -0.4 * s + Math.sin(a) * 0.95 * s; if (on) P.dot(lx, ly, 0.22 * s); else { c.beginPath(); c.arc(lx, ly, 0.22 * s, 0, 7); c.lineWidth = P.lw * 0.8; c.stroke(); } }
    c.restore();
  }, ufoBeam);

  // надпись в кадре (титры, таблички)
  def("text", "front", (P, p) => { P.text(p.text || "", 0, 0, 3 * p.s, { outline: !!p.outline }); });
  // табличка на столбе
  def("sign", "back", (P, p) => {
    const s = p.s; P.line(0, 0, 0, -4 * s, p.seed); P.rect(-3 * s, -6.5 * s, 6 * s, 2.6 * s, p.seed + 1);
    if (p.text) P.text(p.text, 0, -5.2 * s, 1.2 * s);
  });

  SAM.PROPS = PROPS;
})();
