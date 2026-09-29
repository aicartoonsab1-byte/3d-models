// SAM_Toons · персонажи-человечки: круглая голова, глаза-точки, тело из «трубок» с общим контуром.
// Персонаж собирается из скелета: плечи, локти, бёдра, колени. Поза = углы суставов (градусы).
// Угол a — отклонение сегмента от «вниз», положительный = НАРУЖУ от тела; b — сгиб второго сегмента.
// Позы плавно перетекают друг в друга (0.25 с). Ходьба включается сама, когда персонаж движется.
(function () {
  const SAM = window.SAM;
  const { lerp, clamp } = SAM;
  const R = Math.PI / 180;

  // ---------------------------------------------------------------- позы
  // arm/leg: [a, b]; hip — высота таза (доля роста); legK — укорочение ног (ракурс); tilt — наклон тела; lift — подъём над землёй
  const BASE = { armL: [8, 0], armR: [8, 0], legL: [4, 0], legR: [4, 0], hip: 0.40, legK: 1, tilt: 0, lift: 0, headTilt: 0 };
  const osc = (t, f, a, ph = 0) => Math.sin(t * f * Math.PI * 2 + ph) * a;
  const POSES = {
    stand: () => ({}),
    walk: (t, ph) => ({ armL: [8 + Math.sin(ph) * 16, 0], armR: [8 - Math.sin(ph) * 16, 0],
      legL: [4 + Math.sin(ph) * 14, Math.max(0, -Math.cos(ph)) * 10], legR: [4 - Math.sin(ph) * 14, Math.max(0, Math.cos(ph)) * 10],
      lift: Math.abs(Math.cos(ph)) * 0.012 }),
    run: (t, ph) => ({ armL: [30 + Math.sin(ph) * 30, 70], armR: [30 - Math.sin(ph) * 30, 70],
      legL: [6 + Math.sin(ph) * 24, Math.max(0, -Math.cos(ph)) * 30], legR: [6 - Math.sin(ph) * 24, Math.max(0, Math.cos(ph)) * 30],
      lift: Math.abs(Math.cos(ph)) * 0.05, tilt: 4 }),
    pray: (t) => ({ armL: [18, -138], armR: [18, -138], legL: [28, 0], legR: [28, 0], hip: 0.2, legK: 0.5, lift: osc(t, 0.5, 0.004) }),
    kneel: () => ({ armL: [10, 0], armR: [10, 0], legL: [28, 0], legR: [28, 0], hip: 0.2, legK: 0.5 }),
    sit: () => ({ armL: [25, -20], armR: [25, -20], legL: [75, 0], legR: [75, 0], hip: 0.16, legK: 0.8 }),
    lie: () => ({ armL: [15, 0], armR: [15, 0], legL: [5, 0], legR: [5, 0], tilt: 90 }),
    arms_up: (t) => ({ armL: [160 + osc(t, 1.5, 5), 0], armR: [160 - osc(t, 1.5, 5), 0] }),
    wave: (t) => ({ armR: [130, 25 + osc(t, 2.2, 25)] }),
    point: () => ({ armR: [92, 0], armL: [8, 0] }),
    shrug: () => ({ armL: [35, 75], armR: [35, 75], headTilt: 8 }),
    hips: () => ({ armL: [50, -98], armR: [50, -98], legL: [9, 0], legR: [9, 0] }),
    think: () => ({ armR: [22, -168], armL: [30, -100], headTilt: -6 }),
    facepalm: () => ({ armR: [18, -175], headTilt: 10 }),
    cross: () => ({ armL: [22, -108], armR: [22, -108] }),
    scared: (t) => ({ armL: [35, -150], armR: [35, -150], legL: [9 + osc(t, 6, 2), 0], legR: [9 - osc(t, 6, 2), 0], tilt: osc(t, 7, 1.5) }),
    float: (t) => ({ armL: [55 + osc(t, 0.7, 12), 20], armR: [55 - osc(t, 0.7, 12, 1), 20], legL: [14 + osc(t, 0.5, 6), 18], legR: [12 - osc(t, 0.5, 6, 2), 22], tilt: osc(t, 0.35, 8) }),
    jump: (t) => ({ armL: [150, 0], armR: [150, 0], legL: [18, 40], legR: [18, 40], lift: 0.08 }),
    dance: (t) => ({ armL: [90 + osc(t, 2, 60), 40], armR: [90 - osc(t, 2, 60), 40], legL: [10 + osc(t, 2, 10), 0], legR: [10 - osc(t, 2, 10), 0], tilt: osc(t, 1, 8), lift: Math.abs(osc(t, 2, 0.03)) }),
    laugh: (t) => ({ armL: [30, -120], armR: [30, -120], tilt: osc(t, 5, 3), headTilt: -12, lift: Math.abs(osc(t, 5, 0.012)) }),
    slouch: () => ({ armL: [3, 0], armR: [3, 0], tilt: 0, headTilt: 14, hip: 0.38 }),
    reach: (t) => ({ armR: [155, 0], armL: [140, 0], lift: 0.02 + osc(t, 2, 0.01) }),
  };

  function poseAt(name, t, ph, face) {
    const f = POSES[name] || POSES.stand, p = { ...BASE, ...f(t, ph) };
    // «показать» и «помахать» — той рукой, куда смотрит персонаж
    if (face < 0 && (name === "point" || name === "wave")) { const a = p.armL; p.armL = p.armR; p.armR = a; }
    return p;
  }
  function mix(a, b, k) {
    const o = {};
    for (const key in BASE) o[key] = Array.isArray(a[key]) ? [lerp(a[key][0], b[key][0], k), lerp(a[key][1], b[key][1], k)] : lerp(a[key], b[key], k);
    return o;
  }

  // ---------------------------------------------------------------- лицо
  function face(P, cx, cy, r, st, look) {
    const c = P.c, mood = st.mood, lx = look * r * 0.28;
    const ey = cy - r * 0.08, ex = r * 0.32;
    c.strokeStyle = SAM.INK; c.lineCap = "round"; c.lineWidth = P.lw * 0.9;
    const closedEyes = mood === "pray" || st.blink;
    const eye = (x) => {
      if (closedEyes) { c.beginPath(); c.arc(x, ey - r * 0.02, r * 0.1, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); return; }
      if (mood === "dizzy") { const d = r * 0.09; c.beginPath(); c.moveTo(x - d, ey - d); c.lineTo(x + d, ey + d); c.moveTo(x + d, ey - d); c.lineTo(x - d, ey + d); c.stroke(); return; }
      if (mood === "happy" && !st.talk) { c.beginPath(); c.arc(x, ey + r * 0.04, r * 0.1, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); return; }
      if (mood === "scared" || mood === "surprised") { c.beginPath(); c.arc(x, ey, r * 0.14, 0, 7); c.fillStyle = SAM.PAPER; c.fill(); c.stroke(); P.dot(x + lx * 0.4, ey, r * 0.055); return; }
      if (mood === "tired") { P.dot(x, ey + r * 0.02, r * 0.07, r * 0.045); c.beginPath(); c.moveTo(x - r * 0.12, ey - r * 0.04); c.lineTo(x + r * 0.12, ey - r * 0.04); c.stroke(); return; }
      if (mood === "love") { const s = r * 0.1; c.beginPath(); c.moveTo(x, ey + s); c.bezierCurveTo(x - s * 1.6, ey - s * 0.4, x - s * 0.5, ey - s * 1.4, x, ey - s * 0.4); c.bezierCurveTo(x + s * 0.5, ey - s * 1.4, x + s * 1.6, ey - s * 0.4, x, ey + s); c.fillStyle = SAM.INK; c.fill(); return; }
      P.dot(x, ey, r * 0.065, r * 0.085);
    };
    eye(-ex + lx); eye(ex + lx);
    // брови
    c.beginPath(); const by = ey - r * 0.24;
    if (mood === "angry") { c.moveTo(-ex - r * 0.14 + lx, by - r * 0.06); c.lineTo(-ex + r * 0.14 + lx, by + r * 0.06); c.moveTo(ex + r * 0.14 + lx, by - r * 0.06); c.lineTo(ex - r * 0.14 + lx, by + r * 0.06); }
    else if (mood === "sad" || mood === "scared") { c.moveTo(-ex - r * 0.14 + lx, by + r * 0.05); c.lineTo(-ex + r * 0.12 + lx, by - r * 0.05); c.moveTo(ex + r * 0.14 + lx, by + r * 0.05); c.lineTo(ex - r * 0.12 + lx, by - r * 0.05); }
    else if (mood === "sly") { c.moveTo(ex - r * 0.14 + lx, by); c.lineTo(ex + r * 0.14 + lx, by - r * 0.04); c.moveTo(-ex - r * 0.14 + lx, by + r * 0.04); c.lineTo(-ex + r * 0.14 + lx, by + r * 0.06); }
    else if (mood === "surprised") { c.moveTo(-ex - r * 0.12 + lx, by - r * 0.08); c.quadraticCurveTo(-ex + lx, by - r * 0.16, -ex + r * 0.12 + lx, by - r * 0.08); c.moveTo(ex - r * 0.12 + lx, by - r * 0.08); c.quadraticCurveTo(ex + lx, by - r * 0.16, ex + r * 0.12 + lx, by - r * 0.08); }
    c.stroke();
    // рот: во время речи — открывается по громкости голоса
    const mx = lx * 0.8, my = cy + r * 0.38;
    if (st.talk > 0.05) {
      const h = r * (0.05 + 0.24 * st.talk), w = r * (0.16 + 0.05 * st.talk);
      c.beginPath(); c.ellipse(mx, my, w, h, 0, 0, 7); c.fillStyle = SAM.INK; c.fill();
      return;
    }
    c.beginPath();
    if (mood === "happy" || mood === "love" || mood === "sly") { const w = r * (mood === "sly" ? 0.18 : 0.25); c.moveTo(mx - w, my - r * 0.06); c.quadraticCurveTo(mx + (mood === "sly" ? r * 0.08 : 0), my + r * 0.16, mx + w, my - r * 0.08); }
    else if (mood === "sad" || mood === "tired") { c.moveTo(mx - r * 0.16, my + r * 0.06); c.quadraticCurveTo(mx, my - r * 0.08, mx + r * 0.16, my + r * 0.06); }
    else if (mood === "angry") { c.moveTo(mx - r * 0.16, my + r * 0.02); c.lineTo(mx + r * 0.16, my - r * 0.02); }
    else if (mood === "scared") { c.moveTo(mx - r * 0.2, my); for (let i = 1; i <= 4; i++) c.lineTo(mx - r * 0.2 + i * r * 0.1, my + (i % 2 ? -1 : 1) * r * 0.04); }
    else if (mood === "surprised") { c.ellipse(mx, my, r * 0.07, r * 0.1, 0, 0, 7); }
    else if (mood === "pray") { c.arc(mx, my, r * 0.045, 0, 7); }
    else if (mood === "dizzy") { c.moveTo(mx - r * 0.16, my); c.quadraticCurveTo(mx - r * 0.08, my - r * 0.08, mx, my); c.quadraticCurveTo(mx + r * 0.08, my + r * 0.08, mx + r * 0.16, my); }
    else { c.moveTo(mx - r * 0.1, my); c.quadraticCurveTo(mx, my + r * 0.035, mx + r * 0.1, my - r * 0.01); }
    c.stroke();
  }

  // ---------------------------------------------------------------- причёски и аксессуары
  function hair(P, cx, cy, r, cast, seed) {
    const c = P.c, st = cast.hair || "none";
    if (st === "bun") P.circle(cx, cy - r * 1.12, r * 0.36, seed + 3);
    if (st === "tuft") P.poly([[cx - r * 0.15, cy - r * 0.95], [cx - r * 0.05, cy - r * 1.3], [cx + r * 0.02, cy - r * 0.98], [cx + r * 0.14, cy - r * 1.28], [cx + r * 0.16, cy - r * 0.96]], seed + 4, 0.9);
    if (st === "spiky") { const pts = []; for (let i = 0; i <= 8; i++) { const a = Math.PI * (1.12 + i * 0.095), k = i % 2 ? 1.28 : 0.98; pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]); } P.poly(pts, seed + 4, 0.9); }
    if (st === "curly") { const pts = []; for (let i = 0; i <= 7; i++) { const a = Math.PI * (1.05 + i * 0.128); pts.push([cx + Math.cos(a) * r * 1.02, cy + Math.sin(a) * r * 1.02]); } P.bumps(pts, { seed: seed + 4, bulge: 0.8, closed: false, fill: false }); }
    if (st === "long") {
      const pts = [[cx - r * 0.9, cy + r * 1.35]];
      for (let i = 0; i <= 12; i++) { const a = Math.PI * (0.85 + i * (1.3 / 12)); pts.push([cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 1.1]); }
      pts.push([cx + r * 0.9, cy + r * 1.35]);
      P.shape(pts, { closed: false, seed: seed + 4, fill: false });
    }
    if (st === "cap") { P.shape([[cx - r * 0.95, cy - r * 0.3], [cx - r * 0.8, cy - r * 0.9], [cx, cy - r * 1.1], [cx + r * 0.8, cy - r * 0.9], [cx + r * 0.95, cy - r * 0.3]], { seed: seed + 5 }); P.line(cx + r * 0.3, cy - r * 0.35, cx + r * 1.5, cy - r * 0.3, seed + 6); }
    if (st === "hat") { P.rect(cx - r * 0.65, cy - r * 2.1, r * 1.3, r * 1.25, seed + 5); P.line(cx - r * 1.1, cy - r * 0.85, cx + r * 1.1, cy - r * 0.85, seed + 6, 1.3); }
    if (st === "bald") { c.beginPath(); c.arc(cx - r * 0.35, cy - r * 0.55, r * 0.18, 1.1 * Math.PI, 1.6 * Math.PI); c.lineWidth = P.lw * 0.7; c.stroke(); }
    const ex = cast.extra || [];
    if (ex.includes("glasses")) { c.lineWidth = P.lw * 0.8; c.strokeStyle = SAM.INK; c.beginPath(); c.arc(cx - r * 0.32, cy - r * 0.08, r * 0.2, 0, 7); c.moveTo(cx + r * 0.52, cy - r * 0.08); c.arc(cx + r * 0.32, cy - r * 0.08, r * 0.2, 0, 7); c.moveTo(cx - r * 0.12, cy - r * 0.1); c.lineTo(cx + r * 0.12, cy - r * 0.1); c.stroke(); }
    if (ex.includes("mustache")) { c.beginPath(); c.moveTo(cx - r * 0.3, cy + r * 0.3); c.quadraticCurveTo(cx, cy + r * 0.12, cx + r * 0.3, cy + r * 0.3); c.lineWidth = P.lw * 1.8; c.stroke(); }
    if (ex.includes("bow")) { const bx = cx + r * 0.6, by = cy - r * 0.8; P.shape([[bx, by], [bx - r * 0.3, by - r * 0.2], [bx - r * 0.3, by + r * 0.2]], { seed: seed + 7 }); P.shape([[bx, by], [bx + r * 0.3, by - r * 0.2], [bx + r * 0.3, by + r * 0.2]], { seed: seed + 8 }); }
  }

  // ---------------------------------------------------------------- эмоции-значки над головой
  function emote(P, kind, x, y, r, k, t, seed) {
    const c = P.c; c.save(); c.translate(x, y); const s = r * 1.1 * k; c.scale(s, s);
    c.rotate(Math.sin(t * 3 + seed) * 0.06);
    const lw0 = P.lw; P.lw = lw0 / s;
    const txt = (str, dx = 0) => P.text(str, dx, 0, 1.5, { weight: "bold" });
    if (kind === "?" || kind === "!" || kind === "?!") txt(kind);
    else if (kind === "...") { P.dot(-0.5, 0.3, 0.1); P.dot(0, 0.3, 0.1); P.dot(0.5, 0.3, 0.1); }
    else if (kind === "shock") { for (let i = -1; i <= 1; i++) { const a = -Math.PI / 2 + i * 0.5; P.line(Math.cos(a) * 0.4, Math.sin(a) * 0.4 + 0.5, Math.cos(a) * 1.1, Math.sin(a) * 1.1 + 0.5, seed + i); } }
    else if (kind === "sweat") { c.save(); c.translate(1.0, 0.9); P.shape([[0, -0.45], [0.25, 0.05], [0.18, 0.3], [0, 0.38], [-0.18, 0.3], [-0.25, 0.05]], { seed }); c.restore(); }
    else if (kind === "heart") { c.beginPath(); c.moveTo(0, 0.55); c.bezierCurveTo(-0.9, -0.1, -0.35, -0.75, 0, -0.25); c.bezierCurveTo(0.35, -0.75, 0.9, -0.1, 0, 0.55); c.fillStyle = SAM.PAPER; c.fill(); c.strokeStyle = SAM.INK; c.lineWidth = P.lw; c.stroke(); }
    else if (kind === "anger") { for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { c.beginPath(); c.arc(a * 0.35, b * 0.35, 0.28, 0, 7); c.lineWidth = P.lw; c.stroke(); } }
    else if (kind === "idea") { P.circle(0, -0.1, 0.45, seed); P.rect(-0.2, 0.33, 0.4, 0.3, seed + 1); for (let i = 0; i < 5; i++) { const a = -Math.PI + i * Math.PI / 4; P.line(Math.cos(a) * 0.65, Math.sin(a) * 0.65 - 0.1, Math.cos(a) * 0.9, Math.sin(a) * 0.9 - 0.1, seed + i); } }
    else if (kind === "thought") { const pts = P.ellipsePts(0, -0.3, 0.9, 0.55, 8, seed); P.bumps(pts, { seed, bulge: 0.5 }); P.circle(-0.55, 0.45, 0.14, seed); P.circle(-0.8, 0.75, 0.08, seed + 1); }
    else if (kind === "zzz") { P.text("z", 0, 0.4, 0.7); P.text("z", 0.5, -0.1, 0.9); P.text("Z", 1.1, -0.7, 1.1); }
    else if (kind === "sparkle") { for (const [dx, dy, q] of [[0, 0, 0.5], [0.8, -0.5, 0.3], [-0.7, -0.4, 0.25]]) { P.poly([[dx - q, dy], [dx + q, dy]], seed); P.poly([[dx, dy - q], [dx, dy + q]], seed + 1); } }
    else if (kind === "music") { P.text("♪", -0.3, 0, 1.3); P.text("♫", 0.6, -0.5, 1.1); }
    P.lw = lw0; c.restore();
  }

  // ---------------------------------------------------------------- сам человечек
  // st: {x, y(внутр., вниз), h, pose, posePrev, poseK, walkPh, face(-1/0/1), mood, talk(0..1), blink, emotes[], t, seed}
  function drawPerson(P, st, cast) {
    const c = P.c, H = st.h, t = st.t, seed = st.seed;
    const alien = cast.type === "alien";
    const pa = poseAt(st.pose, t, st.walkPh, st.face), pb = st.posePrev ? poseAt(st.posePrev, t, st.walkPh, st.face) : pa;
    const p = st.poseK >= 1 ? pa : mix(pb, pa, st.poseK);
    const breathe = 1 + Math.sin(t * 1.6 + seed) * 0.008;
    const headR = H * (alien ? 0.22 : 0.15), limbW = H * (alien ? 0.08 : 0.085), torsoW = H * (alien ? 0.2 : 0.23);
    const hipY = H * p.hip, shY = hipY + H * (alien ? 0.2 : 0.26) * breathe;
    const leg = (H * 0.40 - limbW / 2) / 2 * p.legK, upA = H * (alien ? 0.15 : 0.19), foA = H * (alien ? 0.13 : 0.17);

    c.save(); c.translate(st.x, st.y - p.lift * H);
    if (p.tilt) {
      if (p.tilt >= 80) { c.translate(0, -torsoW * 0.55); c.rotate(-90 * R); c.translate(-H * 0.5, 0); }
      else { c.translate(0, -hipY); c.rotate(p.tilt * R * (st.face < 0 ? -1 : 1)); c.translate(0, hipY); }
    }
    const seg = (x, y, len, a, side) => [x + side * Math.sin(a * R) * len, y + Math.cos(a * R) * len];
    const limb = (x, y, [a, b], l1, l2, side) => { const e = seg(x, y, l1, a, side), h = seg(e[0], e[1], l2, a + b, side); return [[x, y], e, h]; };
    const hipX = H * 0.055, shX = torsoW / 2 - limbW * 0.55;
    const legs = [limb(-hipX, -hipY, p.legL, leg, leg, -1), limb(hipX, -hipY, p.legR, leg, leg, 1)];
    const torso = [[0, -hipY - torsoW * 0.25], [0, -shY + torsoW * 0.35]];
    const arms = [limb(-shX, -shY + limbW * 0.4, p.armL, upA, foA, -1), limb(shX, -shY + limbW * 0.4, p.armR, upA, foA, 1)];
    // руки, заведённые на грудь, рисуем поверх тела отдельным контуром; опущенные — одним силуэтом с телом
    const front = (arm) => Math.abs(arm[2][0]) < torsoW * 0.3 && arm[2][1] < -hipY;
    const T = (pts, w) => ({ p: pts, w });
    const sil = [...legs.map((l) => T(l, limbW)), T(torso, torsoW)], over = [];
    for (const a of arms) (front(a) ? over : sil).push(T(a, limbW));
    c.save();
    P.tubes(sil);
    if (over.length) P.tubes(over);
    if (cast.extra && cast.extra.includes("tie")) { const ty = -shY + torsoW * 0.35; P.shape([[0, ty], [-H * 0.025, ty + H * 0.03], [0, ty + H * 0.14], [H * 0.025, ty + H * 0.03]], { seed: seed + 9, fill: SAM.INK }); }
    if (cast.extra && cast.extra.includes("dress")) { const y0 = -shY + torsoW * 0.5, y1 = -hipY + H * 0.1; P.shape([[-torsoW * 0.45, y0], [torsoW * 0.45, y0], [torsoW * 0.95, y1], [-torsoW * 0.95, y1]], { seed: seed + 10 }); }
    c.restore();

    // голова
    const hx = st.face * H * 0.012, hy = -shY - headR * (alien ? 0.75 : 0.88);
    c.save(); c.translate(hx, hy); c.rotate((p.headTilt + st.face * 3) * R); c.translate(-hx, -hy);
    if (alien) {
      for (const s of [-1, 1]) { const ax = hx + s * headR * 0.5, ay = hy - headR * 0.85, tx = ax + s * headR * 0.45, ty = ay - headR * 0.75 + Math.sin(t * 3 + s) * headR * 0.05; P.line(ax, ay, tx, ty, seed + s); P.circle(tx, ty, headR * 0.16, seed + 2 + s); }
    }
    if ((cast.hair === "long")) hair(P, hx, hy, headR, { hair: "long" }, seed);
    P.circle(hx, hy, headR, seed);
    if (alien && (cast.eyes || 1) === 1) {
      const lx = st.face * headR * 0.2;
      P.circle(hx + lx, hy - headR * 0.1, headR * 0.34, seed + 7);
      if (!st.blink) P.dot(hx + lx * 1.4, hy - headR * 0.1, headR * 0.13); else P.line(hx + lx - headR * 0.25, hy - headR * 0.1, hx + lx + headR * 0.25, hy - headR * 0.1, seed);
      const m = st.talk > 0.05 ? st.talk : 0;
      if (m) { c.beginPath(); c.ellipse(hx + lx, hy + headR * 0.5, headR * 0.14, headR * (0.04 + m * 0.16), 0, 0, 7); c.fillStyle = SAM.INK; c.fill(); }
      else { c.beginPath(); c.arc(hx + lx, hy + headR * 0.38, headR * 0.16, 0.2 * Math.PI, 0.8 * Math.PI); c.lineWidth = P.lw * 0.9; c.stroke(); }
    } else face(P, hx, hy, headR, st, st.face);
    if (cast.hair !== "long") hair(P, hx, hy, headR, cast, seed);
    c.restore();
    c.restore();

    // эмоции над головой (не наклоняются вместе с телом)
    const top = st.y - p.lift * H - shY - headR * 2.2;
    for (const e of st.emotes) {
      const age = t - e.t0, left = e.t1 - t;
      const k = age < 0.18 ? SAM.ease.back(age / 0.18) : left < 0.2 ? Math.max(0, left / 0.2) : 1;
      const side = e.kind === "thought" ? -1 : 1;
      emote(P, e.kind, st.x + side * headR * 1.1, top - headR * 0.5, headR, k, t, seed);
    }
  }

  // словарь для валидатора (studio/check.py читает эти строки)
  SAM.MOODS = ["neutral", "happy", "sad", "angry", "scared", "surprised", "pray", "sly", "dizzy", "tired", "love"];
  SAM.EMOTES = ["?", "!", "?!", "...", "shock", "sweat", "heart", "anger", "idea", "thought", "zzz", "sparkle", "music"];
  SAM.HAIR = ["none", "bun", "tuft", "spiky", "curly", "long", "cap", "hat", "bald"];
  SAM.EXTRA = ["glasses", "mustache", "bow", "tie", "dress"];
  SAM.POSES = POSES;
  SAM.drawPerson = drawPerson;
  SAM.drawEmote = emote;
})();
