// SAM_Toons · персонажи-«фасолины»: большая круглая голова, глаза-точки, тело одним мягким силуэтом.
// Персонаж собирается из скелета: плечи, локти, бёдра, колени. Поза = углы суставов (градусы).
// Угол a — отклонение сегмента от «вниз», положительный = НАРУЖУ от тела; b — сгиб второго сегмента.
// Позы плавно перетекают друг в друга (0.25 с). Ходьба включается сама, когда персонаж движется.
(function () {
  const SAM = window.SAM;
  const { lerp, clamp } = SAM;
  const R = Math.PI / 180;

  // ---------------------------------------------------------------- позы
  // arm/leg: [a, b]; hip — высота таза (доля роста); legK — укорочение ног (ракурс); tilt — наклон тела; lift — подъём над землёй
  const BASE = { armL: [10, 0], armR: [10, 0], legL: [4, 0], legR: [4, 0], hip: 0.40, legK: 1, tilt: 0, lift: 0, headTilt: 0 };
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
    give: () => ({ armR: [82, -8], armL: [8, 0], tilt: 3 }),
    hug: () => ({ armL: [62, -70], armR: [70, -40], tilt: 7, headTilt: 6 }),
    hug_knees: () => ({ armL: [30, -95], armR: [30, -95], legL: [45, -110], legR: [45, -110], hip: 0.2, legK: 0.9, headTilt: 10 }),
    hold: () => ({ armR: [28, -55], armL: [8, 0] }),
  };

  function poseAt(name, t, ph, face) {
    const f = POSES[name] || POSES.stand, p = { ...BASE, ...f(t, ph) };
    // «показать» и «помахать» — той рукой, куда смотрит персонаж
    if (face < 0 && ["point", "wave", "give", "hug", "hold"].includes(name)) { const a = p.armL; p.armL = p.armR; p.armR = a; }
    return p;
  }
  function mix(a, b, k) {
    const o = {};
    for (const key in BASE) o[key] = Array.isArray(a[key]) ? [lerp(a[key][0], b[key][0], k), lerp(a[key][1], b[key][1], k)] : lerp(a[key], b[key], k);
    return o;
  }

  // ---------------------------------------------------------------- лицо
  // Как в референсе: крошечные глаза-точки и короткий рот; в три четверти лицо смещается в сторону взгляда.
  function face(P, cx, cy, r, st, look, cast) {
    const c = P.c, mood = st.mood, lx = look * r * 0.32;
    const ey = cy - r * 0.02, ex = r * (look ? 0.24 : 0.3), eye0 = r * 0.05;
    c.strokeStyle = SAM.INK; c.lineCap = "round"; c.lineWidth = P.lw * 0.8;
    const closed = mood === "pray" || st.blink;
    const eye = (x) => {
      if (closed) { c.beginPath(); c.moveTo(x - r * 0.07, ey); c.quadraticCurveTo(x, ey + r * 0.05, x + r * 0.07, ey); c.stroke(); return; }
      if (mood === "dizzy") { const d = r * 0.06; c.beginPath(); c.moveTo(x - d, ey - d); c.lineTo(x + d, ey + d); c.moveTo(x + d, ey - d); c.lineTo(x - d, ey + d); c.stroke(); return; }
      if (mood === "happy" && !st.talk) { c.beginPath(); c.arc(x, ey + r * 0.04, r * 0.07, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); return; }
      if (mood === "scared" || mood === "surprised") { c.beginPath(); c.arc(x, ey, r * 0.09, 0, 7); c.stroke(); P.dot(x, ey, eye0 * 0.8, eye0 * 0.8, SAM.INK); return; }
      if (mood === "love") { P.red(() => { const q = r * 0.07; c.beginPath(); c.moveTo(x, ey + q); c.bezierCurveTo(x - q * 1.6, ey - q * 0.4, x - q * 0.5, ey - q * 1.4, x, ey - q * 0.4); c.bezierCurveTo(x + q * 0.5, ey - q * 1.4, x + q * 1.6, ey - q * 0.4, x, ey + q); c.fillStyle = SAM.RED; c.fill(); }); return; }
      if (mood === "tired") { c.beginPath(); c.moveTo(x - r * 0.07, ey); c.lineTo(x + r * 0.07, ey); c.stroke(); P.dot(x, ey + r * 0.03, eye0 * 0.8, eye0 * 0.6, SAM.INK); return; }
      P.dot(x, ey, eye0, eye0 * 1.1, SAM.INK);
    };
    eye(cx - ex + lx); eye(cx + ex + lx);
    // брови — только когда эмоция сильная, короткими штрихами
    const by = ey - r * 0.17, bx = (sx) => cx + sx * ex + lx;
    c.beginPath();
    if (mood === "angry") for (const sx of [-1, 1]) { c.moveTo(bx(sx) + sx * r * 0.1, by - r * 0.05); c.lineTo(bx(sx) - sx * r * 0.06, by + r * 0.03); }
    else if (mood === "sad" || mood === "scared") for (const sx of [-1, 1]) { c.moveTo(bx(sx) + sx * r * 0.1, by + r * 0.03); c.lineTo(bx(sx) - sx * r * 0.06, by - r * 0.04); }
    else if (mood === "surprised") for (const sx of [-1, 1]) { c.moveTo(bx(sx) - r * 0.07, by - r * 0.04); c.quadraticCurveTo(bx(sx), by - r * 0.1, bx(sx) + r * 0.07, by - r * 0.04); }
    else if (mood === "sly") { c.moveTo(bx(1) - r * 0.08, by - r * 0.02); c.lineTo(bx(1) + r * 0.08, by - r * 0.06); }
    c.stroke();
    // румянец (красный), если он есть у персонажа или от смущения/любви
    if ((cast.red || []).includes("cheeks") || mood === "love") for (const sx of [-1, 1]) P.dot(cx + sx * r * 0.5 + lx * 0.8, cy + r * 0.22, r * 0.1, r * 0.055, SAM.RED);
    const mx = cx + lx * 1.05, my = cy + r * 0.3;
    if (st.talk > 0.05) { c.beginPath(); c.ellipse(mx, my, r * (0.07 + 0.03 * st.talk), r * (0.03 + 0.12 * st.talk), 0, 0, 7); c.fillStyle = SAM.INK; c.fill(); return; }
    c.beginPath();
    if (mood === "happy" || mood === "love") { c.moveTo(mx - r * 0.12, my - r * 0.02); c.quadraticCurveTo(mx, my + r * 0.1, mx + r * 0.12, my - r * 0.02); }
    else if (mood === "sly") { c.moveTo(mx - r * 0.08, my); c.quadraticCurveTo(mx + r * 0.04, my + r * 0.06, mx + r * 0.11, my - r * 0.04); }
    else if (mood === "sad" || mood === "tired") { c.moveTo(mx - r * 0.09, my + r * 0.03); c.quadraticCurveTo(mx, my - r * 0.05, mx + r * 0.09, my + r * 0.03); }
    else if (mood === "angry") { c.moveTo(mx - r * 0.09, my + r * 0.02); c.lineTo(mx + r * 0.09, my - r * 0.01); }
    else if (mood === "scared") { c.moveTo(mx - r * 0.1, my); for (let i = 1; i <= 4; i++) c.lineTo(mx - r * 0.1 + i * r * 0.05, my + (i % 2 ? -1 : 1) * r * 0.025); }
    else if (mood === "surprised") c.ellipse(mx, my, r * 0.045, r * 0.065, 0, 0, 7);
    else if (mood === "pray") c.arc(mx, my, r * 0.03, 0, 7);
    else { c.moveTo(mx - r * 0.06, my); c.lineTo(mx + r * 0.06, my + r * 0.005); }
    c.stroke();
  }

  // ---------------------------------------------------------------- причёски и аксессуары (часть можно сделать красной: cast.red)
  function hair(P, cx, cy, r, cast, seed, look) {
    const c = P.c, st = cast.hair || "none", red = cast.red || [];
    const paint = (part, fn) => (red.includes(part) ? P.red(fn) : fn());
    const fillCol = (part) => (red.includes(part) ? SAM.RED : SAM.PAPER);
    paint("hair", () => {
      if (st === "tuft") { const x = cx + look * r * 0.1; P.poly([[x - r * 0.1, cy - r * 0.98], [x - r * 0.13, cy - r * 1.18]], seed + 4, 0.9); P.poly([[x, cy - r * 1.0], [x + r * 0.01, cy - r * 1.25]], seed + 5, 0.9); P.poly([[x + r * 0.1, cy - r * 0.98], [x + r * 0.15, cy - r * 1.16]], seed + 6, 0.9); }
      if (st === "bun") P.circle(cx - look * r * 0.3, cy - r * 1.08, r * 0.28, seed + 3, { fill: fillCol("hair") });
      if (st === "spiky") { const pts = []; for (let i = 0; i <= 8; i++) { const a = Math.PI * (1.12 + i * 0.095), k = i % 2 ? 1.22 : 0.99; pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]); } P.poly(pts, seed + 4, 0.9); }
      if (st === "curly") { const pts = []; for (let i = 0; i <= 7; i++) { const a = Math.PI * (1.05 + i * 0.128); pts.push([cx + Math.cos(a) * r * 1.02, cy + Math.sin(a) * r * 1.02]); } P.bumps(pts, { seed: seed + 4, bulge: 0.8, closed: false, fill: false }); }
      if (st === "long") {
        // прямые пряди до плеч, как у девочки в референсе
        const fr = look * r * 0.35;
        for (const sx of [-1, 1]) { const x0 = cx + sx * r * 0.92; P.poly([[x0, cy - r * 0.3], [x0 + sx * r * 0.04, cy + r * 1.2]], seed + 10 + sx, 0.9); }
        for (let i = 0; i < 4; i++) { const x = cx + fr + (i - 1.5) * r * 0.2; P.poly([[x, cy - r * 0.97], [x + fr * 0.1, cy - r * 0.25]], seed + 20 + i, 0.8); }
      }
    });
    if (st === "cap") { P.shape([[cx - r * 0.95, cy - r * 0.3], [cx - r * 0.8, cy - r * 0.9], [cx, cy - r * 1.1], [cx + r * 0.8, cy - r * 0.9], [cx + r * 0.95, cy - r * 0.3]], { seed: seed + 5, fill: fillCol("hat") }); const d = look || 1; P.line(cx + d * r * 0.3, cy - r * 0.35, cx + d * r * 1.45, cy - r * 0.3, seed + 6); }
    if (st === "hat") { P.rect(cx - r * 0.62, cy - r * 1.95, r * 1.24, r * 1.1, seed + 5, { fill: fillCol("hat") }); P.line(cx - r * 1.05, cy - r * 0.85, cx + r * 1.05, cy - r * 0.85, seed + 6, 1.3); }
    if (st === "bald") { c.beginPath(); c.arc(cx - r * 0.35, cy - r * 0.55, r * 0.14, 1.1 * Math.PI, 1.6 * Math.PI); c.strokeStyle = SAM.INK; c.lineWidth = P.lw * 0.7; c.stroke(); }
    const ex = cast.extra || [];
    if (ex.includes("glasses")) { c.lineWidth = P.lw * 0.7; c.strokeStyle = SAM.INK; const gx = cx + look * r * 0.32; for (const sx of [-1, 1]) { c.beginPath(); c.arc(gx + sx * r * 0.26, cy - r * 0.02, r * 0.15, 0, 7); c.stroke(); } c.beginPath(); c.moveTo(gx - r * 0.11, cy - r * 0.04); c.lineTo(gx + r * 0.11, cy - r * 0.04); c.stroke(); }
    if (ex.includes("mustache")) { c.beginPath(); const mx = cx + look * r * 0.33; c.moveTo(mx - r * 0.2, cy + r * 0.26); c.quadraticCurveTo(mx, cy + r * 0.12, mx + r * 0.2, cy + r * 0.26); c.strokeStyle = SAM.INK; c.lineWidth = P.lw * 1.6; c.stroke(); }
    if (ex.includes("bow") || red.includes("bow")) paint("bow", () => { const bx = cx + r * 0.62, by = cy - r * 0.78; P.shape([[bx, by], [bx - r * 0.28, by - r * 0.18], [bx - r * 0.28, by + r * 0.18]], { seed: seed + 7, fill: fillCol("bow") }); P.shape([[bx, by], [bx + r * 0.28, by - r * 0.18], [bx + r * 0.28, by + r * 0.18]], { seed: seed + 8, fill: fillCol("bow") }); });
  }

  // ---------------------------------------------------------------- эмоции-значки над головой (красным)
  function emote(P, kind, x, y, r, k, t, seed) {
    const c = P.c; c.save(); c.translate(x, y); const s = r * 1.1 * k; c.scale(s, s);
    const lw0 = P.lw; P.lw = lw0 / s;
    P.red(() => {
      const txt = (str) => P.text(str, 0, 0, 1.4, { weight: "bold" });
      if (kind === "?" || kind === "!" || kind === "?!") txt(kind);
      else if (kind === "...") { P.dot(-0.5, 0.3, 0.1); P.dot(0, 0.3, 0.1); P.dot(0.5, 0.3, 0.1); }
      else if (kind === "shock") { for (let i = -1; i <= 1; i++) { const a = -Math.PI / 2 + i * 0.5; P.line(Math.cos(a) * 0.4, Math.sin(a) * 0.4 + 0.5, Math.cos(a) * 1.1, Math.sin(a) * 1.1 + 0.5, seed + i); } }
      else if (kind === "sweat") { c.save(); c.translate(1.0, 0.9); P.shape([[0, -0.45], [0.25, 0.05], [0.18, 0.3], [0, 0.38], [-0.18, 0.3], [-0.25, 0.05]], { seed, fill: SAM.PAPER }); c.restore(); }
      else if (kind === "heart") { c.beginPath(); c.moveTo(0, 0.55); c.bezierCurveTo(-0.9, -0.1, -0.35, -0.75, 0, -0.25); c.bezierCurveTo(0.35, -0.75, 0.9, -0.1, 0, 0.55); c.fillStyle = SAM.RED; c.fill(); }
      else if (kind === "anger") { for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { c.beginPath(); c.arc(a * 0.35, b * 0.35, 0.28, 0, 7); c.strokeStyle = SAM.RED; c.lineWidth = P.lw; c.stroke(); } }
      else if (kind === "idea") { P.circle(0, -0.1, 0.45, seed); P.rect(-0.2, 0.33, 0.4, 0.3, seed + 1); for (let i = 0; i < 5; i++) { const a = -Math.PI + i * Math.PI / 4; P.line(Math.cos(a) * 0.65, Math.sin(a) * 0.65 - 0.1, Math.cos(a) * 0.9, Math.sin(a) * 0.9 - 0.1, seed + i); } }
      else if (kind === "thought") { const pts = P.ellipsePts(0, -0.3, 0.9, 0.55, 8, seed); P.bumps(pts, { seed, bulge: 0.5 }); P.circle(-0.55, 0.45, 0.14, seed); P.circle(-0.8, 0.75, 0.08, seed + 1); }
      else if (kind === "zzz") { P.text("z", 0, 0.4, 0.7); P.text("z", 0.5, -0.1, 0.9); P.text("Z", 1.1, -0.7, 1.1); }
      else if (kind === "sparkle") { for (const [dx, dy, q] of [[0, 0, 0.5], [0.8, -0.5, 0.3], [-0.7, -0.4, 0.25]]) { P.poly([[dx - q, dy], [dx + q, dy]], seed); P.poly([[dx, dy - q], [dx, dy + q]], seed + 1); } }
      else if (kind === "music") { P.text("♪", -0.3, 0, 1.3); P.text("♫", 0.6, -0.5, 1.1); }
    });
    P.lw = lw0; c.restore();
  }

  // ---------------------------------------------------------------- сам человечек-«фасолина»
  // Силуэт — одно целое: большая круглая голова, тело-овал, короткие ножки с выемкой между ними,
  // руки — мягкие «макаронины». Опущенная рука видна внутренней линией на теле (как в референсе).
  // st: {x, y(внутр., вниз), h, pose, posePrev, poseK, walkPh, face(-1/0/1), mood, talk(0..1), blink, emotes[], t, seed}
  function drawPerson(P, st, cast) {
    const c = P.c, H = st.h, t = st.t, seed = st.seed, look = st.face;
    const alien = cast.type === "alien", red = cast.red || [];
    const pa = poseAt(st.pose, t, st.walkPh, look), pb = st.posePrev ? poseAt(st.posePrev, t, st.walkPh, look) : pa;
    const p = st.poseK >= 1 ? pa : mix(pb, pa, SAM.ease.inout(st.poseK));
    // тело — «груша» из двух овалов: узкий верх под головой, широкий низ
    const headR = H * (alien ? 0.26 : 0.2), limbW = H * 0.115, legW = H * 0.135;
    const hipY = H * p.hip * 0.5, bodyRx = H * 0.175;
    const shY = hipY + H * 0.33, bodyCy = hipY + H * 0.2;
    const leg = Math.max(0.01, (hipY - legW * 0.45) / 2) * p.legK, upA = H * 0.14, foA = H * 0.13;
    // «груша»: полуширина плавно растёт от плеч (узко, под головой) к низу живота
    const pearC = hipY + H * 0.2, pearRy = H * 0.215, bodyShape = [];
    for (let i = 0; i < 40; i++) { const th = i / 40 * Math.PI * 2, k = (1 + Math.sin(-th)) / 2; bodyShape.push([Math.cos(th) * SAM.lerp(H * 0.18, H * 0.115, k), -pearC - Math.sin(th) * pearRy]); }

    c.save(); c.translate(st.x, st.y - p.lift * H);
    if (p.tilt) {
      if (p.tilt >= 80) { c.translate(0, -bodyRx); c.rotate(-90 * R); c.translate(-H * 0.45, 0); }
      else { c.translate(0, -hipY); c.rotate(p.tilt * R * (look < 0 ? -1 : 1)); c.translate(0, hipY); }
    }
    const seg = (x, y, len, a, side) => [x + side * Math.sin(a * R) * len, y + Math.cos(a * R) * len];
    const limb = (x, y, [a, b], l1, l2, side) => { const e = seg(x, y, l1, a, side), h = seg(e[0], e[1], l2, a + b, side); return [[x, y], e, h]; };
    const hipX = H * 0.07, shX = H * 0.09;
    const legs = [limb(-hipX, -hipY, p.legL, leg, leg, -1), limb(hipX, -hipY, p.legR, leg, leg, 1)];
    const arms = [-1, 1].map((sd) => limb(sd * shX, -shY, sd < 0 ? p.armL : p.armR, upA, foA, sd));
    const shirt = red.includes("shirt") ? SAM.RED : SAM.PAPER, pants = red.includes("pants") ? SAM.RED : SAM.PAPER;
    const sil = [...legs.map((l) => ({ p: l, w: legW, fill: pants })), { poly: bodyShape, fill: shirt }, ...arms.map((a) => ({ p: a, w: limbW, fill: shirt }))];
    P.tubes(sil);
    // внутренний контур рук поверх тела (как в референсе): только боковые линии и кисть, и только внутри «груши»
    c.save(); c.beginPath(); bodyShape.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip();
    for (const a of arms) P.tubeEdges(a, limbW);
    c.restore();
    if (cast.extra && cast.extra.includes("tie")) { const ty = -shY + H * 0.02; P.shape([[0, ty], [-H * 0.022, ty + H * 0.03], [0, ty + H * 0.13], [H * 0.022, ty + H * 0.03]], { seed: seed + 9, fill: red.includes("tie") ? SAM.RED : SAM.INK }); }
    if (red.includes("scarf")) { const sy = -shY - H * 0.03; P.red(() => { P.shape([[-bodyRx * 0.8, sy - H * 0.03], [bodyRx * 0.8, sy - H * 0.03], [bodyRx * 0.85, sy + H * 0.04], [-bodyRx * 0.85, sy + H * 0.04]], { seed: seed + 11, fill: SAM.RED }); P.shape([[-look * bodyRx * 0.3 - H * 0.03, sy], [-look * bodyRx * 0.3 + H * 0.03, sy], [-look * bodyRx * 0.4 + H * 0.02, sy + H * 0.16], [-look * bodyRx * 0.4 - H * 0.04, sy + H * 0.15]], { seed: seed + 12, fill: SAM.RED }); }); }
    if (cast.extra && cast.extra.includes("dress") || red.includes("dress")) { const y0 = -bodyCy, y1 = -hipY + H * 0.03, col = red.includes("dress") ? SAM.RED : SAM.PAPER; P.shape([[-bodyRx * 0.95, y0], [bodyRx * 0.95, y0], [bodyRx * 1.35, y1], [-bodyRx * 1.35, y1]], { seed: seed + 10, fill: col }); }

    // голова: сидит на теле и перекрывает его верх
    const hx = look * H * 0.015, hy = -shY - headR * (alien ? 0.8 : 0.72);
    c.save(); c.translate(hx, hy + headR); c.rotate((p.headTilt + look * 2) * R); c.translate(-hx, -hy - headR);
    if (alien) for (const s of [-1, 1]) { const ax = hx + s * headR * 0.45, ay = hy - headR * 0.85, tx = ax + s * headR * 0.4, ty = ay - headR * 0.6; P.line(ax, ay, tx, ty, seed + s); P.circle(tx, ty, headR * 0.14, seed + 2 + s, { fill: red.includes("antennae") ? SAM.RED : SAM.PAPER }); }
    P.circle(hx, hy, headR, seed, { amp: 0.03 });
    if (alien && (cast.eyes || 1) === 1) {
      const lx = look * headR * 0.25;
      P.circle(hx + lx, hy - headR * 0.08, headR * 0.3, seed + 7, { fill: red.includes("eye") ? SAM.RED : SAM.PAPER });
      if (!st.blink) P.dot(hx + lx * 1.3, hy - headR * 0.08, headR * 0.1, headR * 0.1, SAM.INK);
      const m = st.talk > 0.05 ? st.talk : 0;
      c.beginPath(); if (m) { c.ellipse(hx + lx, hy + headR * 0.45, headR * 0.1, headR * (0.03 + m * 0.12), 0, 0, 7); c.fillStyle = SAM.INK; c.fill(); }
      else { c.moveTo(hx + lx - headR * 0.08, hy + headR * 0.42); c.lineTo(hx + lx + headR * 0.08, hy + headR * 0.42); c.strokeStyle = SAM.INK; c.lineWidth = P.lw * 0.8; c.stroke(); }
    } else face(P, hx, hy, headR, st, look, cast);
    hair(P, hx, hy, headR, cast, seed, look);
    c.restore();
    c.restore();

    // значки над головой (не наклоняются вместе с телом)
    const top = st.y - p.lift * H - shY - headR * 2.3;
    for (const e of st.emotes) {
      const age = t - e.t0, left = e.t1 - t;
      const k = age < 0.18 ? SAM.ease.back(age / 0.18) : left < 0.2 ? Math.max(0, left / 0.2) : 1;
      const side = e.kind === "thought" ? -1 : 1;
      emote(P, e.kind, st.x + side * headR * 1.1, top, headR * 0.75, k, t, seed);
    }
  }

  // словарь для валидатора (studio/check.py читает эти строки)
  SAM.MOODS = ["neutral", "happy", "sad", "angry", "scared", "surprised", "pray", "sly", "dizzy", "tired", "love"];
  SAM.EMOTES = ["?", "!", "?!", "...", "shock", "sweat", "heart", "anger", "idea", "thought", "zzz", "sparkle", "music"];
  SAM.HAIR = ["none", "bun", "tuft", "spiky", "curly", "long", "cap", "hat", "bald"];
  SAM.EXTRA = ["glasses", "mustache", "bow", "tie", "dress"];
  SAM.RED_PARTS = ["shirt", "pants", "scarf", "cheeks", "hair", "hat", "bow", "tie", "dress", "eye", "antennae"];
  SAM.POSES = POSES;
  SAM.drawPerson = drawPerson;
  SAM.drawEmote = emote;
})();
