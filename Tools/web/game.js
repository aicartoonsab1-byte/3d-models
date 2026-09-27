// «Шарик» — браузерный прототип. Порт логики Unity-версии (Assets/_Project/Scripts) на JS:
// те же уровни, спрайты, физика (Tuning), инстинкт (Navigator), ловушки, боссы, офлайн-мозг (phrases_ru.json).
// Данные подставляет Tools/web/build.py в window.SHARIK_DATA.
"use strict";
(function () {
  const D = window.SHARIK_DATA;
  // ---------------------------------------------------------------- Tuning (синхронно с Tuning.cs)
  const T = {
    PPU: 16, VW: 320, VH: 180,
    G: 9.81 * 3, RUN: 6, JUMP: 14.5, R: 0.45, SPLAT: 17,
    GACC: 38, AACC: 16, COYOTE: 0.1, KILLY: -3,
    SPIKES_ON: 1.6, SPIKES_CD: 3, CR_HOLD: 0.6, CR_CD: 3.5, CR_FALL: 22, CR_RISE: 3,
    TD_OPEN: 1.6, TD_CD: 3, FAN_ON: 2.5, FAN_CD: 4, FAN_F: 75, FAN_H: 5, SPRING_V: 22, SPRING_CD: 1.5,
    REFORM: 1.3, RESPAWN: 1.1, CPS: 20,
  };
  const SKY = { meadow: "#efe3c8", cave: "#231c18", city: "#f0a193", glitch: "#efe3c8", void: "#0e0b0a" };
  const POWERS = [1, 0.85, 0.7, 0.55];

  // ---------------------------------------------------------------- DOM
  const view = document.getElementById("view");
  const ui = document.getElementById("ui");
  const vctx = view.getContext("2d");
  const uctx = ui.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const buf = document.createElement("canvas");
  buf.width = T.VW; buf.height = T.VH;
  const ctx = buf.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // ---------------------------------------------------------------- спрайты
  const IMG = {};
  function loadSprites() {
    return Promise.all(Object.entries(D.sprites).map(([k, src]) => new Promise((res) => {
      const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = res; im.src = src;
    })));
  }

  // ---------------------------------------------------------------- звук (WebAudio)
  let AC = null, muted = false;
  function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } return AC; }
  function tone(freq, dur, type = "square", vol = 0.08, when = 0, slideTo = null) {
    const ac = audio(); if (!ac || muted) return;
    const t0 = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol = 0.12, when = 0) {
    const ac = audio(); if (!ac || muted) return;
    const n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; g.gain.value = vol;
    s.connect(g).connect(ac.destination); s.start(ac.currentTime + when);
  }
  const SFX = {
    jump: () => tone(300, 0.16, "square", 0.05, 0, 700),
    land: () => noise(0.06, 0.06),
    splat: () => { noise(0.3, 0.2); tone(160, 0.3, "square", 0.06, 0, 50); },
    reform: () => tone(120, 0.45, "triangle", 0.1, 0, 520),
    fall: () => tone(900, 0.9, "square", 0.04, 0, 120),
    spikes: () => { noise(0.1, 0.1); tone(1200, 0.08, "square", 0.03); },
    arm: () => { tone(90, 0.05, "square", 0.06); tone(90, 0.05, "square", 0.06, 0.1); },
    slam: () => { noise(0.35, 0.25); tone(55, 0.35, "square", 0.08); },
    trapdoor: () => tone(220, 0.25, "square", 0.06, 0, 90),
    fan: () => noise(0.6, 0.05),
    spring: () => tone(300, 0.3, "triangle", 0.12, 0, 900),
    checkpoint: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, "square", 0.04, i * 0.1)),
    fragment: () => [880, 1100, 1320].forEach((f, i) => tone(f, 0.1, "square", 0.03, i * 0.08)),
    denied: () => tone(110, 0.1, "square", 0.04),
    exit: () => [392, 494, 587, 784].forEach((f, i) => tone(f, 0.15, "square", 0.04, i * 0.12)),
    clunk: () => { noise(0.4, 0.3); tone(70, 0.5, "square", 0.1); },
    powerdown: () => tone(440, 3, "square", 0.07, 0, 20),
    glitch: () => tone(200 + Math.random() * 1800, 0.12, "square", 0.02),
  };
  // 8-битное бормотание — как GibberishVoice.cs
  function speakVoice(text, mood) {
    const ac = audio(); if (!ac || muted) return;
    let base = 330, wob = 0.08, type = "square";
    ({ scared: () => { base = 470; wob = 0.2; }, happy: () => base = 400, awe: () => base = 400, sad: () => { base = 240; wob = 0.04; type = "triangle"; },
       angry: () => base = 260, pray: () => { base = 300; type = "triangle"; }, glitch: () => { base = 200; wob = 0.35; },
       determined: () => base = 280, dizzy: () => { base = 350; wob = 0.3; } }[mood] || (() => { }))();
    const step = 1 / T.CPS, vowels = "аоуыэяёюие";
    const s = text.slice(0, 90).toLowerCase();
    for (let i = 0; i < s.length; i++) {
      const v = vowels.indexOf(s[i]);
      if (v >= 0) {
        let f = base * (0.8 + v * 0.06) * (1 + (Math.random() * 2 - 1) * wob);
        if (text.endsWith("?") && i > s.length - 4) f *= 1.3;
        tone(f, step * 0.9, type, 0.035, i * step);
      }
    }
  }

  // ---------------------------------------------------------------- фразы
  function pickPhrase(key, stage) {
    let best = null;
    for (const e of D.phrases) {
      if (e.key !== key) continue;
      if (e.stage === stage) { best = e; break; }
      if (e.stage < stage && (!best || e.stage > best.stage)) best = e;
    }
    if (!best || !best.lines.length) return null;
    const last = pickPhrase.last[key + best.stage];
    let i = Math.floor(Math.random() * best.lines.length);
    if (best.lines.length > 1 && i === last) i = (i + 1) % best.lines.length;
    pickPhrase.last[key + best.stage] = i;
    return { text: best.lines[i], mood: best.mood || "neutral" };
  }
  pickPhrase.last = {};

  // ---------------------------------------------------------------- уровень
  let L = null;           // текущий уровень (runtime)
  let ball = null, brain = null;
  let levelIndex = 0;
  const levels = D.levels.slice().sort((a, b) => a.order - b.order);

  function at(x, y) {
    if (x < 0 || x >= L.w || y < 0 || y >= L.h) return ".";
    const row = L.data.grid[L.h - 1 - y];
    return x < row.length ? row[x] : ".";
  }
  function trapdoorAt(x, y) { return L.trapdoors[x + "," + y]; }
  function solid(x, y) {
    if (x < 0 || x >= L.w) return true;
    const c = at(x, y);
    if (c === "#") return true;
    if (c === "T") { const t = trapdoorAt(x, y); return !t || !t.open; }
    return false;
  }
  const platform = (x, y) => at(x, y) === "=";
  const support = (x, y) => solid(x, y) || platform(x, y);
  const standable = (x, y) => x >= 0 && x < L.w && y >= 0 && y < L.h && !support(x, y) && support(x, y - 1);
  function floorBelow(x, y) { for (let yy = y - 1; yy >= 0; yy--) if (support(x, yy)) return yy + 1; return null; }

  function variant(x, y) { const h = (x * 73 + y * 31) % 11; return h === 0 ? "_b" : h === 5 ? "_c" : ""; }
  function decoOk(x, y) {
    if ((x * 37 + y * 11) % 9 !== 0) return false;
    for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy <= 2; dy++) { const c = at(x + dx, y + dy); if (c !== "." && c !== "#") return false; }
    return true;
  }

  function buildLevel(data) {
    L = { data, w: Math.max(...data.grid.map((r) => r.length)), h: data.grid.length, pal: SKY[data.palette] ? data.palette : "meadow",
          tiles: [], objects: [], traps: [], trapdoors: {}, fragments: [], checkpoints: [], spawn: null, goal: null, exit: null, sw: null,
          hidden: new Set(), fx: [], glitchT: 4 + Math.random() * 6, glitches: [], dissolve: -1, sky: SKY[data.palette] || SKY.meadow };
    const frag = [];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const c = at(x, y), cx = x + 0.5, cy = y + 0.5;
      if (c === "#") {
        const top = at(x, y + 1) !== "#" && at(x, y + 1) !== "T";
        L.tiles.push({ s: `tile_${L.pal}_${top ? "top" : "fill"}${variant(x, y)}`, x: cx, y: cy });
        if (top && at(x, y + 1) === "." && decoOk(x, y)) L.tiles.push({ s: `deco_${(x * 7 + y) % 4}`, x: cx, y: cy + 1, deco: true });
      } else if (c === "=") L.tiles.push({ s: `tile_${L.pal}_platform`, x: cx, y: cy });
      else if (c === "S") L.spawn = { x: cx, y: y + T.R + 0.02 };
      else if (c === "F") { L.exit = { x: cx, y: y + 1, used: false }; L.goal = { x: cx, y: cy }; }
      else if (c === "R") { L.sw = { x: cx, y: y + 1, on: false, used: false }; L.goal = { x: cx, y: cy }; }
      else if (c === "K") L.checkpoints.push({ x: cx, y: cy, on: false });
      else if (c === "*") frag.push({ x, y });
      else if ("^CTWJB".includes(c)) L.traps.push(makeTrap(c, x, y));
    }
    frag.sort((a, b) => a.y !== b.y ? b.y - a.y : a.x - b.x);
    frag.forEach((f, i) => L.fragments.push({ x: f.x + 0.5, y: f.y + 0.5, text: data.fragments[i] || "...", taken: false }));
  }

  // ---------------------------------------------------------------- ловушки и боссы
  const BOSS_TITLE = { stag: "Лунный Олень", watcher: "Всевидящий", worm: "Кодовый Червь", keeper: "Хранитель" };
  function makeTrap(c, x, y) {
    const t = { kind: { "^": "spikes", C: "crusher", T: "trapdoor", W: "fan", J: "spring", B: "boss" }[c], cx: x, cy: y,
                x: x + 0.5, y: y + 0.5, ready: 0, busy: false, key: 0, timer: 0, phase: "idle" };
    if (t.kind === "spikes") { t.title = "Шипы"; t.cd = T.SPIKES_CD; t.up = false; }
    if (t.kind === "crusher") {
      t.title = "Пресс"; t.cd = T.CR_CD; t.top = y + 0.5; t.pos = y + 0.5;
      let yy = y - 1; while (yy >= 0 && !support(x, yy)) yy--;
      t.bottom = (yy >= 0 ? yy + 1 : -6) + 0.5 + 0.22;
    }
    if (t.kind === "trapdoor") { t.title = "Люк"; t.cd = T.TD_CD; t.open = false; L.trapdoors[x + "," + y] = t; }
    if (t.kind === "fan") { t.title = "Вентилятор"; t.cd = T.FAN_CD; t.on = false; }
    if (t.kind === "spring") { t.title = "Пружина"; t.cd = T.SPRING_CD; }
    if (t.kind === "boss") {
      t.boss = L.data.boss || "stag"; t.title = BOSS_TITLE[t.boss] || "Существо";
      t.cd = { stag: 4, watcher: 3, worm: 4, keeper: 5 }[t.boss] || 4;
      const im = IMG[t.boss === "worm" ? "boss_worm_peek" : `boss_${t.boss}_idle`];
      t.h = im ? im.height / T.PPU : 3;
      t.lift = t.boss === "watcher" ? 2.5 : 0;
      t.home = { x: x + 0.5, y: y + t.h / 2 + t.lift };
      t.frame = "idle"; t.blinkAt = 2 + Math.random() * 3;
    }
    return t;
  }
  function trapDangerous(t) {
    return (t.kind === "spikes" && t.up) || (t.kind === "crusher" && t.phase !== "idle" && t.phase !== "rise") ||
      (t.kind === "trapdoor" && t.open) || (t.kind === "fan" && t.on) || (t.kind === "boss" && t.busy);
  }
  function trapBounds(t) {
    if (t.kind === "crusher") return { x0: t.x - 0.5, x1: t.x + 0.5, y0: t.pos - 0.5, y1: t.pos + 0.5 };
    if (t.kind === "boss") {
      const im = IMG[t.boss === "worm" ? "boss_worm_peek" : `boss_${t.boss}_idle`];
      const w = im ? im.width / T.PPU : 2, h = t.h;
      return { x0: t.home.x - w / 2, x1: t.home.x + w / 2, y0: t.home.y - h / 2, y1: t.home.y + h / 2 };
    }
    return { x0: t.x - 0.5, x1: t.x + 0.5, y0: t.y - 0.5, y1: t.y + 0.5 };
  }
  let trapsFired = 0;
  function fireTrap(t) {
    if (t.disabled || game.time < t.ready) { SFX.denied(); return; }
    t.ready = game.time + t.cd; trapsFired++;
    brain && brain.onTrap(t);
    if (t.kind === "spikes") { t.up = true; t.timer = T.SPIKES_ON; SFX.spikes(); }
    if (t.kind === "crusher") { t.phase = "arm"; t.timer = 0.2; SFX.arm(); }
    if (t.kind === "trapdoor") { t.open = true; t.timer = T.TD_OPEN; SFX.trapdoor(); }
    if (t.kind === "fan") { t.on = true; t.timer = T.FAN_ON; SFX.fan(); }
    if (t.kind === "spring") {
      t.phase = "launch"; t.timer = 0.35; SFX.spring();
      if (ball.alive() && Math.abs(ball.x - t.x) < 0.65 && ball.y - t.y < 1.6 && ball.y > t.y - 0.6) ball.launch(ball.vx, T.SPRING_V);
    }
    if (t.kind === "boss") bossAttack(t);
  }
  function bossAttack(t) {
    t.busy = true;
    if (t.boss === "stag") { t.frame = "atk"; t.phase = "stomp"; t.timer = 0.45; SFX.arm(); }
    else if (t.boss === "watcher") { t.frame = "atk"; t.phase = "gaze"; t.timer = 0.4; SFX.glitch(); }
    else if (t.boss === "keeper") {
      t.frame = "atk"; t.phase = "roar"; t.timer = 1.2; SFX.powerdown(); shake(0.6, 0.08);
      if (ball.alive() && Math.abs(ball.x - t.x) < 10) ball.launch(Math.sign(ball.x - t.x - 0.01) * 9, 8);
    } else if (t.boss === "worm") {
      let x = t.x, fy = t.cy;
      if (ball.alive() && Math.abs(ball.x - t.x) < 10) { x = Math.floor(ball.x) + 0.5; fy = Math.floor(ball.y - T.R + 0.1); }
      t.wx = x; t.wfy = fy; t.phase = "dust"; t.timer = 0.7; t.wormY = fy - 1.5; SFX.arm();
    }
  }
  function updateTraps(dt) {
    for (const t of L.traps) {
      if (t.timer > 0) t.timer -= dt;
      if (t.kind === "spikes") {
        if (t.up && t.timer <= 0) t.up = false;
        if (t.up && ball.alive() && Math.abs(ball.x - t.x) < 0.75 && ball.y - T.R < t.y + 0.1 && ball.y > t.y - 0.6) ball.die("spikes");
      }
      if (t.kind === "trapdoor" && t.open && t.timer <= 0) t.open = false;
      if (t.kind === "fan") {
        if (t.on && t.timer <= 0) t.on = false;
        if (t.on && ball.alive() && Math.abs(ball.x - t.x) < 0.7 && ball.y > t.y - 0.5 && ball.y < t.y + T.FAN_H) {
          ball.vy = Math.min(14, ball.vy + T.FAN_F * dt); ball.grounded = false;
        }
      }
      if (t.kind === "spring" && t.phase === "launch" && t.timer <= 0) t.phase = "idle";
      if (t.kind === "crusher") {
        if (t.phase === "arm" && t.timer <= 0) t.phase = "fall";
        if (t.phase === "fall") {
          t.pos = Math.max(t.bottom, t.pos - T.CR_FALL * dt);
          if (ball.alive() && Math.abs(ball.x - t.x) < 0.85 && ball.y < t.pos && ball.y + T.R > t.pos - 0.5 - 0.05) ball.squash();
          if (t.pos <= t.bottom) { t.phase = "hold"; t.timer = T.CR_HOLD; SFX.slam(); shake(0.15, 0.12); }
        } else if (t.phase === "hold" && t.timer <= 0) t.phase = "rise";
        else if (t.phase === "rise") { t.pos = Math.min(t.top, t.pos + T.CR_RISE * dt); if (t.pos >= t.top) t.phase = "idle"; }
      }
      if (t.kind === "boss") updateBoss(t, dt);
    }
  }
  function updateBoss(t, dt) {
    if (!t.busy) {
      t.blinkAt -= dt;
      if (t.blinkAt < 0 && t.boss !== "worm") { t.frame = "blink"; if (t.blinkAt < -0.15) { t.frame = "idle"; t.blinkAt = 2.5 + Math.random() * 3.5; } }
      return;
    }
    if (t.phase === "stomp" && t.timer <= 0) {
      t.frame = "idle"; SFX.slam(); shake(0.35, 0.2);
      L.fx.push({ s: "fx_shock", x: t.x, y: t.cy + 0.25, t: 0, life: 0.5, grow: 8 });
      if (ball.alive() && ball.grounded && Math.abs(ball.x - t.x) < 7) ball.launch(Math.sign(ball.x - t.x + 0.01) * 3, 18);
      t.phase = "cool"; t.timer = 0.5;
    } else if (t.phase === "gaze" && t.timer <= 0) {
      L.fx.push({ s: "fx_gaze", x: t.home.x, y: t.home.y - 0.3, vx: 0, vy: 0, t: 0, life: 3, orb: true, speed: 8 });
      SFX.fragment(); t.phase = "cool"; t.timer = 0.4;
    } else if (t.phase === "roar" && t.timer <= 0) { t.frame = "idle"; t.busy = false; t.phase = "idle"; }
    else if (t.phase === "dust") {
      if (t.timer <= 0) {
        t.phase = "burst"; t.timer = 0.18; SFX.spring(); shake(0.2, 0.12);
      }
    } else if (t.phase === "burst") {
      t.wormY = t.wfy - 1.5 + (1 - Math.max(0, t.timer) / 0.18) * 3;
      if (t.timer <= 0) {
        if (ball.alive() && Math.abs(ball.x - t.wx) < 1 && ball.y < t.wfy + 3) ball.launch(0, 20);
        t.phase = "hold"; t.timer = 0.8;
      }
    } else if (t.phase === "hold" && t.timer <= 0) { t.phase = "sink"; t.timer = 0.5; }
    else if (t.phase === "sink") { t.wormY = t.wfy + 1.5 - (1 - Math.max(0, t.timer) / 0.5) * 3; if (t.timer <= 0) { t.busy = false; t.phase = "idle"; } }
    else if (t.phase === "cool" && t.timer <= 0) { t.frame = "idle"; t.busy = false; t.phase = "idle"; }
  }

  // ---------------------------------------------------------------- шарик
  class Ball {
    constructor(p) {
      this.x = p.x; this.y = p.y; this.vx = 0; this.vy = 0; this.grounded = false; this.lastGround = -9;
      this.state = "alive"; this.respawn = { ...p }; this.move = 0; this.speedMul = 1; this.jumpQ = null; this.aimed = false;
      this.peakFall = 0; this.deaths = 0; this.splats = 0; this.timer = 0;
      this.sx = 1; this.sy = 1; this.svx = 0; this.svy = 0; this.roll = 0; this.mood = "neutral"; this.moodUntil = 0;
      this.lookLeft = false; this.lookAt = null; this.pancake = null; this.blobs = null; this.visible = true;
    }
    alive() { return this.state === "alive"; }
    setMood(m, hold = 2.5) { if (m && IMG["face_" + m]) { this.mood = m; this.moodUntil = game.time + hold; } }
    jump(vx, power = 1) { this.jumpQ = { vx, power: Math.max(0.4, Math.min(1, power)) }; }
    canJump() { return this.alive() && game.time - this.lastGround <= T.COYOTE; }
    launch(vx, vy) { this.vx = vx; this.vy = vy; this.aimed = false; this.grounded = false; this.stretch(0.6); }
    squashV(a, wall) { a = Math.min(1, Math.max(0, a)); if (wall) { this.sx = 1 - 0.45 * a; this.sy = 1 + 0.3 * a; } else { this.sx = 1 + 0.5 * a; this.sy = 1 - 0.45 * a; } this.svx = this.svy = 0; }
    stretch(a) { this.sx = 1 - 0.3 * a; this.sy = 1 + 0.4 * a; this.svx = this.svy = 0; }

    hitsSolid(cx, cy) {
      const r = T.R * 0.98;
      for (let tx = Math.floor(cx - r); tx <= Math.floor(cx + r); tx++)
        for (let ty = Math.floor(cy - r); ty <= Math.floor(cy + r); ty++)
          if (solid(tx, ty)) {
            const nx = Math.min(Math.max(cx, tx), tx + 1), ny = Math.min(Math.max(cy, ty), ty + 1);
            if ((cx - nx) ** 2 + (cy - ny) ** 2 < r * r) return true;
          }
      for (const t of L.traps) if (t.kind === "crusher") {
        const b = trapBounds(t);
        const nx = Math.min(Math.max(cx, b.x0), b.x1), ny = Math.min(Math.max(cy, b.y0), b.y1);
        if ((cx - nx) ** 2 + (cy - ny) ** 2 < r * r) return true;
      }
      return false;
    }
    platformUnder(oldB, newB) {
      for (const ox of [-T.R * 0.6, 0, T.R * 0.6]) {
        const tx = Math.floor(this.x + ox), ty = Math.floor(newB);
        if (platform(tx, ty) && oldB >= ty + 1 - 1e-3 && newB < ty + 1) return ty + 1;
      }
      return null;
    }
    step(dt) {
      if (this.state !== "alive") return;
      if (this.jumpQ) {
        if (this.canJump()) {
          this.vy = T.JUMP * this.jumpQ.power;
          this.vx = Math.max(-T.RUN * 1.25, Math.min(T.RUN * 1.25, this.jumpQ.vx));
          this.aimed = true; this.grounded = false; this.lastGround = -9; this.stretch(0.35); SFX.jump();
          brain && brain.onJump();
        }
        this.jumpQ = null;
      }
      if (!(this.aimed && !this.grounded)) {
        const target = Math.max(-1, Math.min(1, this.move)) * T.RUN * this.speedMul;
        const acc = (this.grounded ? T.GACC : T.AACC) * dt;
        this.vx += Math.max(-acc, Math.min(acc, target - this.vx));
      }
      this.vy -= T.G * dt;
      if (!this.grounded) this.peakFall = Math.max(this.peakFall, -this.vy);
      const nx = this.x + this.vx * dt;
      if (this.hitsSolid(nx, this.y)) {
        if (Math.abs(this.vx) > 4) this.squashV(0.3, true);
        this.vx = 0;
      } else this.x = nx;
      let ny = this.y + this.vy * dt, landed = false;
      const pu = this.vy <= 0 ? this.platformUnder(this.y - T.R, ny - T.R) : null;
      if (pu !== null) { ny = pu + T.R; landed = true; }
      else if (this.hitsSolid(this.x, ny)) {
        if (this.vy < 0) {
          let sy = Math.floor(ny - T.R) + 1 + T.R;
          if (this.hitsSolid(this.x, sy)) sy = this.y;
          ny = sy; landed = true;
        } else {
          if (this.vy > T.SPLAT) { this.y = ny; return this.splat("ceiling", false); }
          this.vy = 0; ny = this.y;
        }
      }
      this.y = ny;
      const fy = Math.floor(this.y - T.R - 0.05);
      const under = [-T.R * 0.55, 0, T.R * 0.55].some((ox) => support(Math.floor(this.x + ox), fy));
      if (this.vy <= 0 && under && (this.y - T.R) - fy - 1 < 0.06) landed = true;
      if (landed) {
        if (!this.grounded) {
          const imp = this.peakFall;
          this.peakFall = 0;
          if (imp > T.SPLAT) { this.vy = 0; return this.splat("land", false); }
          if (imp > 4) { this.squashV((imp - 4) / (T.SPLAT - 4), false); SFX.land(); }
        }
        this.vy = 0; this.grounded = true; this.lastGround = game.time; this.aimed = false;
      } else this.grounded = false;
      if (this.y < T.KILLY) this.die("pit");
      if (L.exit && !L.exit.used && Math.abs(this.x - L.exit.x) < 0.5 && Math.abs(this.y - L.exit.y) < 1) { L.exit.used = true; game.levelDone(); }
      if (L.sw && !L.sw.used && Math.abs(this.x - L.sw.x) < 0.9 && Math.abs(this.y - L.sw.y) < 1.2) { L.sw.used = true; game.ending(); }
      for (const k of L.checkpoints) if (!k.on && Math.abs(this.x - k.x) < 0.5 && Math.abs(this.y - k.y) < 0.8) {
        k.on = true; this.respawn = { x: k.x, y: Math.floor(k.y) + T.R + 0.02 }; SFX.checkpoint(); brain.onCheckpoint();
      }
      for (const f of L.fragments) if (!f.taken && Math.hypot(this.x - f.x, this.y - f.y) < 0.8) { f.taken = true; SFX.fragment(); brain.onFragment(f.text); }
    }
    squash() { if (this.alive()) this.splat("crushed", false); }
    die(kind) { if (this.alive()) this.splat(kind, true); }
    splat(kind, dies) {
      this.state = dies ? "dead" : "splat"; this.splats++; if (dies) this.deaths++;
      this.vx = this.vy = 0; this.aimed = false; this.jumpQ = null; this.move = 0;
      if (kind === "pit") { SFX.fall(); this.visible = false; }
      else {
        SFX.splat(); shake(0.12, 0.1);
        this.pancake = { up: kind === "ceiling", t: 0 };
        if (kind !== "ceiling") this.y = Math.floor(this.y - T.R + 0.3) + T.R + 0.02;
        this.visible = false;
      }
      this.timer = dies ? T.RESPAWN : T.REFORM; this.dies = dies;
      brain.onSplat(kind, dies);
    }
    update(dt) {
      // пластилиновая пружина формы
      const k = 220, damp = 11;
      this.svx += ((1 - this.sx) * k - this.svx * damp) * dt; this.svy += ((1 - this.sy) * k - this.svy * damp) * dt;
      this.sx += this.svx * dt; this.sy += this.svy * dt;
      this.roll -= this.vx / T.R * dt;
      if (this.lookAt) this.lookLeft = this.lookAt.x < this.x; else if (Math.abs(this.vx) > 0.3) this.lookLeft = this.vx < 0;
      if (game.time > this.moodUntil && this.alive() && this.mood !== "glitch") this.mood = Math.abs(this.vx) > 4.5 ? "determined" : "neutral";
      if (this.pancake) this.pancake.t += dt;
      if (this.state === "dead" || this.state === "splat") {
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.dies) { this.x = this.respawn.x; this.y = this.respawn.y; }
          else if (!this.pancake || !this.pancake.up) this.y = Math.floor(this.y) + T.R + 0.02;
          this.pancake = null; this.state = "reform"; this.timer = 0.45; SFX.reform();
          const fromScratch = this.dies;
          this.blobs = Array.from({ length: 7 }, (_, i) => {
            const a = i / 7 * Math.PI * 2 + Math.random() * 0.5;
            return fromScratch ? { x: Math.cos(a) * (1.2 + Math.random()), y: Math.abs(Math.sin(a)) * (1.2 + Math.random()) }
                               : { x: Math.cos(a) * (0.4 + Math.random() * 0.5), y: -0.35 };
          });
        }
      } else if (this.state === "reform") {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.blobs = null; this.visible = true; this.state = "alive"; this.sx = 1.9; this.sy = 0.25; this.svx = 0; this.svy = 9;
          this.setMood("dizzy", 1.2); this.peakFall = 0; this.grounded = false; brain.onReformed();
        }
      }
    }
  }

  // ---------------------------------------------------------------- инстинкт (Navigator.cs)
  const nav = {
    imp: 0.5,
    standCell() { return { x: Math.floor(ball.x), y: Math.floor(ball.y - T.R + 0.1) }; },
    dangerAhead(dir) {
      for (const t of L.traps) {
        if (!trapDangerous(t)) continue;
        const dx = (t.x - ball.x) * dir;
        if (t.kind === "crusher") { if (dx > -0.6 && dx < 1.8) return true; }
        else if (dx > 0.2 && dx < 2.2 && Math.abs(t.y - ball.y) < 3) return true;
      }
      return false;
    },
    arcClear(vx, v0, tEnd) {
      for (let t = 0.05; t < tEnd - 0.05; t += 0.05) {
        const px = ball.x + vx * t, py = ball.y + v0 * t - 0.5 * T.G * t * t;
        if (solid(Math.floor(px), Math.floor(py)) || solid(Math.floor(px), Math.floor(py + T.R * 0.8))) return false;
      }
      return true;
    },
    aimed(c, dir) {
      let best = null, res = null;
      for (let dx = 1; dx <= 6; dx++) for (let dy = 3; dy >= -6; dy--) {
        const tx = c.x + dir * dx, ty = c.y + dy;
        if (!standable(tx, ty) || (dx === 1 && dy === 0)) continue;
        for (let k = 0; k < POWERS.length; k++) {
          const v0 = T.JUMP * POWERS[k], disc = v0 * v0 - 2 * T.G * (dy + 0.15);
          if (disc < 0) break;
          const t = (v0 + Math.sqrt(disc)) / T.G, need = ((tx + 0.5) - ball.x) / t;
          if (Math.abs(need) > T.RUN * 1.15 || !this.arcClear(need, v0, t)) continue;
          const score = dx + Math.max(0, -dy) * 0.6 - Math.max(0, dy) * 0.2 + k * 0.3;
          if (best === null || score < best) { best = score; res = { vx: need, power: POWERS[k] }; }
          break;
        }
      }
      return res;
    },
    steer(dir, speedMul, yolo) {
      ball.speedMul = speedMul;
      if (!ball.grounded) return;
      if (!yolo && this.dangerAhead(dir)) { ball.move = 0; return; }
      ball.move = dir;
      const c = this.standCell(), nx = c.x + dir;
      const wall = solid(nx, c.y), pit = !support(nx, c.y - 1) && floorBelow(nx, c.y) === null;
      if (!wall && !pit) return;
      const edge = dir > 0 ? (c.x + 1) - ball.x : ball.x - c.x;
      if (wall && edge < T.R + 0.15) { ball.move = -dir * 0.6; return; }
      const trig = wall ? 0.75 : 0.35 + 0.4 * this.imp * Math.random();
      if (edge > trig && !wall) return;
      const a = this.aimed(c, dir);
      if (a) { const g = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.sin(2 * Math.PI * Math.random()); ball.jump(a.vx * (1 + g * 0.12 * this.imp), a.power); }
      else if (wall) ball.jump(dir * T.RUN * 0.5);
      else if (!yolo) ball.move = 0;
    },
    describe(dir) {
      const c = this.standCell(); let gap = 0, rise = 0, drop = 0, wall = false;
      for (let dx = 1; dx <= 6; dx++) {
        const x = c.x + dir * dx;
        if (solid(x, c.y)) { wall = true; let h = 0; while (solid(x, c.y + h) && h < 8) h++; rise = h; break; }
        if (!support(x, c.y - 1)) { const f = floorBelow(x, c.y); if (f === null) gap++; else drop = Math.max(drop, c.y - f); }
      }
      return { gap, rise, drop, wall };
    },
  };

  // ---------------------------------------------------------------- мозг (офлайн, как BallBrain.cs без нейросети)
  class Brain {
    constructor() {
      this.aw = L.data.awareness || 0; nav.imp = 0.8 + (0.35 - 0.8) * this.aw / 5;
      this.intent = "forward"; this.until = 0; this.nextThink = game.time + 3; this.queue = [];
      this.say = null; this.thought = null; this.linesDone = new Set(); this.memory = [];
      this.stuckRef = ball.x; this.stuckSince = game.time; this.stuckTries = 0; this.deathsAt = {};
      this.bossesSeen = new Set(); this.cursorNoticed = false;
      (L.data.intro || []).forEach((t) => this.enqueue(t, this.aw >= 4 ? "glitch" : "neutral"));
    }
    enqueue(text, mood, thought = false) { if (text) this.queue.push({ text, mood, thought }); }
    speechBusy() { return this.say && game.time < this.say.until; }
    speak(text, mood, thought) {
      ball.setMood(mood, 3);
      if (thought) this.thought = { text, until: game.time + Math.min(7, Math.max(2.5, text.length * 0.06)) };
      else { this.say = { text, start: game.time, until: game.time + text.length / T.CPS + 1.6 }; speakVoice(text, mood); }
      log(text, thought);
    }
    react(key, chance = 1) {
      if (Math.random() > chance || this.speechBusy()) return false;
      const p = pickPhrase(key, this.aw); if (!p) return false;
      this.speak(p.text, p.mood, false); return true;
    }
    remember(s) { this.memory.push(s); if (this.memory.length > 10) this.memory.shift(); }
    onSplat(kind, dies) {
      const k = { crushed: "crushed", spikes: "spikes", pit: "pit" }[kind] || "splat_land";
      this.remember(k); this.react(k);
      if (dies) { const c = Math.floor(ball.x / 4); this.deathsAt[c] = (this.deathsAt[c] || 0) + 1; if (this.deathsAt[c] >= 2) nav.imp = Math.max(0.05, nav.imp * 0.6); }
      this.nextThink = game.time + 1.8;
    }
    onReformed() { if (Math.random() < 0.6) this.react("respawn"); this.intent = "forward"; this.stuckSince = game.time; this.stuckRef = ball.x; }
    onTrap(t) {
      if (Math.hypot(t.x - ball.x, t.y - ball.y) > 7) return;
      if (!this.react("trap_fired", 0.35 + 0.55 * this.aw / 5)) ball.setMood(this.aw >= 3 ? "suspicious" : "scared", 1.5);
      if (this.aw >= 3) ball.lookAt = { x: t.x, y: t.y };
    }
    onFragment(text) { this.enqueue(text, "awe"); const p = pickPhrase("fragment_react", this.aw); if (p) this.enqueue(p.text, p.mood, true); }
    onCheckpoint() { this.react("checkpoint", 0.7); }
    onJump() { this.react("jump", 0.12); }
    setIntent(i, d) { this.intent = i; this.until = game.time + d; if (i === "pray") ball.setMood("pray", d); }
    update() {
      if (!this.speechBusy() && this.queue.length) { const s = this.queue.shift(); this.speak(s.text, s.mood, s.thought); this.scripted = true; }
      else if (!this.queue.length && !this.speechBusy()) this.scripted = false;
      if (!ball.alive() || game.cutscene) return;
      (L.data.lines || []).forEach((ln, i) => { if (!this.linesDone.has(i) && ball.x >= ln.x) { this.linesDone.add(i); this.enqueue(ln.text, ln.mood || "neutral"); } });
      // боссы
      for (const t of L.traps) if (t.kind === "boss" && !this.bossesSeen.has(t) && Math.abs(t.x - ball.x) < 9) {
        this.bossesSeen.add(t); ball.lookAt = { x: t.home.x, y: t.home.y }; if (!this.react("boss_seen")) ball.setMood("awe", 2);
      }
      // курсор
      if (this.aw >= 3 && mouse.world && Math.hypot(mouse.world.x - ball.x, mouse.world.y - ball.y) < 1.6) {
        ball.lookAt = mouse.world;
        if (!this.cursorNoticed && this.react("cursor")) this.cursorNoticed = true;
      } else if (ball.lookAt && Math.random() < 0.01) ball.lookAt = null;
      // застревание
      if (["forward", "yolo", "run_jump"].includes(this.intent)) {
        if (Math.abs(ball.x - this.stuckRef) > 1.2) { this.stuckRef = ball.x; this.stuckSince = game.time; this.stuckTries = 0; }
        else if (game.time - this.stuckSince > 5) {
          this.stuckTries++; this.stuckSince = game.time; this.react("stuck", 0.8);
          const k = this.stuckTries % 3;
          if (k === 1) this.setIntent("back", 0.8); else if (k === 2) this.setIntent("yolo", 3); else { this.setIntent("pray", 2); this.react("pray"); }
        }
      } else { this.stuckSince = game.time; this.stuckRef = ball.x; }
      if (game.time >= this.until && this.intent !== "forward") this.intent = "forward";
      if (game.time >= this.nextThink && !this.scripted && !this.queue.length) {
        this.nextThink = game.time + 4 + Math.random() * 3;
        const p = pickPhrase("idle", this.aw); if (p) this.speak(p.text, p.mood, Math.random() < 0.55);
        const r = Math.random();
        if (r < 0.08) this.setIntent("pray", 2); else if (r < 0.14) this.setIntent("look", 1.6); else if (r < 0.14 + 0.08 * nav.imp) this.setIntent("yolo", 2.5);
      }
    }
    fixed() {
      if (!ball.alive() || game.cutscene) { ball.move = 0; return; }
      const dir = L.goal.x >= ball.x ? 1 : -1;
      if (this.intent === "forward") nav.steer(dir, 0.85, false);
      else if (this.intent === "back") nav.steer(-dir, 0.6, false);
      else if (this.intent === "yolo") nav.steer(dir, 1.15, true);
      else ball.move = 0;
    }
  }

  // ---------------------------------------------------------------- камера и эффекты
  const cam = { x: 0, y: 0, shakeT: 0, shakeA: 0, look: 0 };
  function shake(t, a) { cam.shakeT = t; cam.shakeA = a; }
  function camClamp(x, y) {
    const hw = T.VW / T.PPU / 2, hh = T.VH / T.PPU / 2;
    return { x: Math.min(Math.max(x, hw), Math.max(hw, L.w - hw)), y: Math.min(Math.max(y, hh - 1), Math.max(hh - 1, L.h - hh + 1)) };
  }

  // ---------------------------------------------------------------- игра
  const mouse = { sx: 0, sy: 0, world: null };
  const game = {
    time: 0, paused: false, cutscene: false, fade: 0, big: null, small: null, bigA: 0, waitRestart: false,
    start(i) {
      levelIndex = (i + levels.length) % levels.length;
      try { localStorage.setItem("sharik_level", String(levelIndex)); } catch (e) { }
      buildLevel(levels[levelIndex]);
      ball = new Ball(L.spawn); brain = new Brain(); trapsFired = 0;
      const c = camClamp(ball.x, ball.y + 1); cam.x = c.x; cam.y = c.y;
      this.cutscene = false; this.fade = 0; this.waitRestart = false; this.flow = null;
      this.title(levels[levelIndex].title);
      $("level").value = String(levelIndex);
      $("log").innerHTML = "";
    },
    title(t) { this.big = t; this.small = null; this.bigT = 3; },
    levelDone() {
      if (this.cutscene) return;
      this.cutscene = true; ball.move = 0;
      const outro = (L.data.outro || []).slice();
      let stage = 0;
      this.flow = (dt) => {
        if (stage === 0) { if (!brain.speechBusy() && !brain.queue.length) { if (outro.length) brain.speak(outro.shift(), "happy", false); else { stage = 1; SFX.exit(); } } }
        else { this.fade += dt / 0.8; if (this.fade >= 1) { this.start(levelIndex + 1); } }
      };
    },
    ending() {
      if (this.cutscene) return;
      this.cutscene = true; ball.move = 0; ball.vx = 0;
      L.traps.forEach((t) => t.disabled = true);
      const outro = (L.data.outro || []).slice(), last = outro.pop();
      let stage = 0, t = 0, order = null;
      this.flow = (dt) => {
        t += dt;
        if (stage === 0) { if (!brain.speechBusy()) { if (outro.length) brain.speak(outro.shift(), outro.length % 2 ? "determined" : "sad", false); else { stage = 1; t = 0; } } }
        else if (stage === 1 && t > 0.6) { L.sw.on = true; SFX.clunk(); shake(0.5, 0.25); stage = 2; t = 0; }
        else if (stage === 2 && t > 0.8) { SFX.powerdown(); stage = 3; t = 0; order = L.tiles.concat(L.traps, L.checkpoints, L.fragments, L.exit ? [L.exit] : []).sort(() => Math.random() - 0.5); L.dissolve = 0; }
        else if (stage === 3) {
          const k = Math.min(1, t / 4); L.dissolve = k;
          const n = Math.round(order.length * k * k);
          for (let i = 0; i < n; i++) L.hidden.add(order[i]);
          if (k >= 1) { stage = 4; t = 0; }
        } else if (stage === 4 && t > 0.4) { L.swHidden = true; SFX.glitch(); stage = 5; t = 0; }
        else if (stage === 5 && t > 1.2) { if (last) brain.speak(last, "awe", false); stage = 6; t = 0; }
        else if (stage === 6 && !brain.speechBusy() && t > 0.8) {
          stage = 7; t = 0; ball.visible = false; brain.say = null; brain.thought = null;
          ball.bits = Array.from({ length: 24 }, () => ({ x: (Math.random() - 0.5) * 0.8, y: (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 1.2, vy: 0.4 + Math.random() * 1.2 }));
        } else if (stage === 7) {
          ball.bits && ball.bits.forEach((b) => { b.x += b.vx * dt; b.y += b.vy * dt; });
          if (t > 3) {
            ball.bits = null; stage = 8;
            let loops = 1; try { loops = Number(localStorage.getItem("sharik_loops") || 0) + 1; localStorage.setItem("sharik_loops", String(loops)); } catch (e) { }
            this.big = "КОНЕЦ"; this.bigT = 1e9;
            this.small = `Шарик выключил мир. Или мир выключил шарика?\nЛепёшек: ${ball.splats}. Циклов: ${loops}.\n\nНажми любую клавишу, чтобы… начать заново?`;
            this.waitRestart = true;
          }
        }
      };
    },
  };

  function fixedStep(dt) {
    brain.fixed();
    ball.step(dt);
    updateTraps(dt);
    // снаряды и эффекты
    for (const f of L.fx) {
      f.t += dt;
      if (f.orb) {
        const dx = ball.x - f.x, dy = ball.y - f.y, d = Math.hypot(dx, dy) || 1;
        if (f.t < 0.05) { f.vx = dx / d * f.speed; f.vy = dy / d * f.speed; }
        const k = Math.min(1, dt * 1.2);
        f.vx += (dx / d * f.speed - f.vx) * k; f.vy += (dy / d * f.speed - f.vy) * k;
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (d < 0.55 && ball.alive()) { ball.squash(); f.t = f.life; }
      }
    }
    L.fx = L.fx.filter((f) => f.t < f.life);
  }

  function update(dt) {
    game.time += dt;
    if (game.bigT !== undefined) { game.bigT -= dt; game.bigA = game.bigT > 2.7 ? (3 - game.bigT) / 0.3 : game.bigT < 0.6 ? Math.max(0, game.bigT / 0.6) : 1; }
    if (game.flow) game.flow(dt);
    brain.update();
    ball.update(dt);
    // глитчи матрицы
    if (L.data.awareness >= 3 && !game.cutscene) {
      L.glitchT -= dt;
      if (L.glitchT <= 0) {
        L.glitchT = L.data.awareness >= 5 ? 2 + Math.random() * 3 : 5 + Math.random() * 7;
        L.glitches = Array.from({ length: 12 }, () => ({ tile: L.tiles[Math.floor(Math.random() * L.tiles.length)], dx: Math.floor(Math.random() * 7) - 3, c: Math.random() < 0.5 ? "#3cf09a" : "#e2615c" }));
        L.glitchUntil = game.time + 0.12; SFX.glitch();
      }
    }
    // камера
    cam.look += (Math.max(-2.5, Math.min(2.5, ball.vx * 0.5)) - cam.look) * Math.min(1, dt * 2);
    const want = camClamp(ball.x + cam.look, ball.y + 1);
    const k = 1 - Math.exp(-dt / 0.18);
    cam.x += (want.x - cam.x) * k; cam.y += (want.y - cam.y) * k;
    if (cam.shakeT > 0) cam.shakeT -= dt;
  }

  // ---------------------------------------------------------------- отрисовка
  function camOffset() {
    let cx = cam.x, cy = cam.y;
    if (cam.shakeT > 0) { cx += (Math.random() - 0.5) * 2 * cam.shakeA; cy += (Math.random() - 0.5) * 2 * cam.shakeA; }
    return { cx: Math.round(cx * T.PPU) / T.PPU, cy: Math.round(cy * T.PPU) / T.PPU };
  }
  let CO = { cx: 0, cy: 0 };
  const toScreen = (wx, wy) => ({ x: Math.round((wx - CO.cx) * T.PPU + T.VW / 2), y: Math.round(T.VH / 2 - (wy - CO.cy) * T.PPU) });
  function spr(name, wx, wy, opt = {}) {
    const im = IMG[name]; if (!im) return;
    const p = toScreen(wx, wy);
    if (p.x < -im.width || p.x > T.VW + im.width || p.y < -im.height || p.y > T.VH + im.height) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (opt.rot) ctx.rotate(opt.rot);
    if (opt.flip) ctx.scale(-1, 1);
    if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha;
    ctx.drawImage(im, Math.round(-im.width / 2), Math.round(-im.height / 2));
    ctx.restore();
  }

  function render() {
    CO = camOffset();
    const darkT = game.cutscene && L.dissolve >= 0 ? Math.min(1, L.dissolve) : 0;
    ctx.fillStyle = L.sky; ctx.fillRect(0, 0, T.VW, T.VH);
    if (darkT > 0) { ctx.globalAlpha = darkT; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, T.VW, T.VH); ctx.globalAlpha = 1; }
    // фон: холмы с параллаксом
    const hills = IMG[`bg_hills_${L.pal}`];
    if (hills && !L.swHidden) {
      const off = CO.cx * 0.5 * T.PPU, base = toScreen(0, 2.5 + CO.cy * 0.3).y;
      ctx.globalAlpha = 1 - darkT;
      for (let x = -((off % hills.width) + hills.width); x < T.VW; x += hills.width) ctx.drawImage(hills, Math.round(x), base - 16);
      ctx.globalAlpha = 1;
    }
    if ((L.pal === "meadow" || L.pal === "city") && IMG.bg_cloud && darkT < 1) {
      for (let i = 0; i < 6; i++) {
        const wx = (i * 37 % 97) + CO.cx * 0.75, wy = L.h - 1.5 - (i * 3 % 4);
        spr("bg_cloud", ((wx - CO.cx * 0.75) % (L.w + 20)) + CO.cx * 0.75 - 5, wy, { alpha: 1 - darkT });
      }
    }
    const gl = L.glitchUntil && game.time < L.glitchUntil ? new Map(L.glitches.map((g) => [g.tile, g])) : null;
    for (const t of L.tiles) {
      if (L.hidden.has(t)) continue;
      if (L.dissolve > 0 && Math.random() < 0.02) continue;   // мерцание при выключении мира
      const g = gl && gl.get(t);
      spr(t.s, t.x + (g ? g.dx / 16 : 0), t.y);
      if (g) { const p = toScreen(t.x, t.y); ctx.globalAlpha = 0.5; ctx.fillStyle = g.c; ctx.fillRect(p.x - 8, p.y - 8, 16, 16); ctx.globalAlpha = 1; }
    }
    // объекты
    if (L.exit && !L.hidden.has(L.exit)) spr("obj_exit", L.exit.x, L.exit.y);
    if (L.sw && !L.swHidden) spr(L.sw.on ? "obj_switch_on" : "obj_switch_off", L.sw.x, L.sw.y);
    for (const k of L.checkpoints) if (!L.hidden.has(k)) spr(k.on ? "obj_checkpoint_on" : "obj_checkpoint_off", k.x, k.y);
    for (const f of L.fragments) if (!f.taken && !L.hidden.has(f)) spr("obj_fragment", f.x, f.y + Math.round(Math.sin(game.time * 3 + f.x) * 2) / 16);
    // ловушки
    for (const t of L.traps) {
      if (L.hidden.has(t)) continue;
      if (t.kind === "spikes") spr(t.up ? "trap_spikes_on" : "trap_spikes_off", t.x, t.y);
      if (t.kind === "trapdoor") spr(t.open ? "trap_trapdoor_open" : "trap_trapdoor_closed", t.x, t.y);
      if (t.kind === "spring") spr(t.phase === "launch" ? "trap_spring_launch" : "trap_spring_idle", t.x, t.y);
      if (t.kind === "fan") {
        spr(t.on && Math.floor(game.time * 20) % 2 ? "trap_fan_1" : "trap_fan_0", t.x, t.y);
        if (t.on) for (let i = 0; i < 6; i++) spr("fx_wind", t.x + Math.sin(i * 2.3 + game.time * 6) * 0.3, t.y + ((game.time * 1.6 + i / 6) % 1) * T.FAN_H);
      }
      if (t.kind === "crusher") {
        for (let y = t.pos + 1; y < L.h + 1; y++) spr("trap_chain", t.x, y);
        const sh = t.phase === "arm" ? (Math.random() - 0.5) / 8 : 0;
        spr("trap_crusher", t.x + sh, t.pos);
      }
      if (t.kind === "boss") {
        const bob = t.busy ? 0 : Math.round(Math.sin(game.time * (t.boss === "watcher" ? 2 : 1.2)) * (t.boss === "watcher" ? 3 : 1)) / 16;
        if (t.boss === "worm") {
          if (t.phase === "dust") spr("fx_dust", t.wx + (Math.random() - 0.5) / 4, t.wfy + 0.2);
          if (["burst", "hold", "sink"].includes(t.phase)) spr(t.phase === "burst" ? "boss_worm_atk" : "boss_worm_idle", t.wx, t.wormY);
          else if (t.phase !== "dust") spr("boss_worm_peek", t.home.x, t.home.y + bob);
        } else spr(`boss_${t.boss}_${t.frame}`, t.home.x, t.home.y + bob);
      }
    }
    // шарик
    if (ball.visible) {
      const p = toScreen(ball.x, ball.y - T.R);
      let sx = ball.sx, sy = ball.sy;
      if (!ball.grounded && ball.alive()) { const s = Math.min(0.18, Math.abs(ball.vy) / 30); sx *= 1 - s * 0.6; sy *= 1 + s; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sx, sy);
      ctx.drawImage(IMG.ball_body, -8, -16);
      ctx.save(); ctx.translate(0, -8); ctx.rotate(Math.round(ball.roll / (Math.PI / 8)) * (Math.PI / 8)); ctx.drawImage(IMG.ball_spots, -8, -8); ctx.restore();
      if (ball.lookLeft) ctx.scale(-1, 1);
      ctx.drawImage(IMG["face_" + ball.mood] || IMG.face_neutral, -8, -16);
      ctx.restore();
    }
    if (ball.pancake) {
      const k = Math.min(1, ball.pancake.t / 0.25), e = 1 - Math.pow(1 - k, 3);
      const p = toScreen(ball.x, ball.pancake.up ? ball.y + T.R - 0.25 : ball.y - T.R + 0.25);
      ctx.save(); ctx.translate(p.x, p.y); if (ball.pancake.up) ctx.scale(1, -1);
      ctx.scale(0.6 + 0.48 * e, 2.2 - 1.3 * e); ctx.drawImage(IMG.ball_pancake, -14, -4); ctx.restore();
    }
    if (ball.blobs) {
      const k = 1 - Math.max(0, ball.timer) / 0.45, e = k * k * (3 - 2 * k);
      for (const b of ball.blobs) spr("ball_blob", ball.x + b.x * (1 - e), ball.y + b.y * (1 - e) + Math.sin(e * Math.PI) * 0.4);
    }
    if (ball.bits) for (const b of ball.bits) { const p = toScreen(ball.x + b.x, ball.y + b.y); ctx.fillStyle = "#e2615c"; ctx.fillRect(p.x, p.y, 2, 2); }
    for (const f of L.fx) {
      if (f.grow) { const im = IMG[f.s]; const p = toScreen(f.x, f.y); ctx.save(); ctx.globalAlpha = 1 - f.t / f.life; ctx.translate(p.x, p.y); ctx.scale(1 + f.t * f.grow, 1); ctx.drawImage(im, -16, -4); ctx.restore(); }
      else spr(f.s, f.x, f.y);
    }
    if (game.fade > 0) { ctx.globalAlpha = Math.min(1, game.fade); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, T.VW, T.VH); ctx.globalAlpha = 1; }

    // на экран
    vctx.imageSmoothingEnabled = false;
    vctx.drawImage(buf, 0, 0, view.width, view.height);
    renderUI();
  }

  // ---------------------------------------------------------------- интерфейс поверх (чёткий текст)
  function wrap(c, text, maxW) {
    const words = text.split(" "), lines = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  }
  function bubble(text, anchorX, bottomY, thought, S, shown = Infinity) {
    const c = uctx, fs = Math.max(13, Math.round(S * 6.5));
    c.font = `${thought ? "italic " : ""}${fs}px Neucha, "Comic Sans MS", cursive`;
    const maxW = Math.min(ui.width * 0.42, 340 * S / 3.2), lines = wrap(c, text, maxW);
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + fs * 1.1, h = lines.length * fs * 1.2 + fs * 0.7;
    let x = anchorX - w * (thought ? 0.5 : 0.3), y = bottomY - h;
    x = Math.max(6, Math.min(ui.width - w - 6, x)); y = Math.max(6, y);
    const px = Math.max(2, Math.round(S / 1.5));
    c.fillStyle = thought ? "#e9dcc0" : "#faf3e1"; c.strokeStyle = thought ? "#8a7560" : "#1c1714"; c.lineWidth = px;
    c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
    if (thought) { c.fillStyle = "#e9dcc0"; c.fillRect(anchorX + px, y + h + px * 2, px * 3, px * 3); c.strokeRect(anchorX + px, y + h + px * 2, px * 3, px * 3); c.fillRect(anchorX - px, y + h + px * 7, px * 2, px * 2); }
    else { c.fillStyle = "#1c1714"; c.fillRect(Math.max(x + 4, Math.min(x + w - 10, anchorX)), y + h, px * 3, px * 3); }
    c.fillStyle = thought ? "#5b4a3b" : "#1c1714"; c.textBaseline = "top";
    let left = shown;                         // печать по буквам в такт голосу
    lines.forEach((l, i) => { if (left > 0) c.fillText(l.slice(0, left), x + fs * 0.55, y + fs * 0.4 + i * fs * 1.2); left -= l.length + 1; });
    return y;
  }
  function renderUI() {
    const c = uctx, S = ui.width / T.VW;
    c.clearRect(0, 0, ui.width, ui.height);
    c.textAlign = "left";
    // облачка
    if (ball.visible || brain.say) {
      const p = toScreen(ball.x, ball.y + 0.75);
      let bottom = p.y * S;
      if (brain.say && game.time < brain.say.until) {
        const shown = Math.min(brain.say.text.length, Math.ceil((game.time - brain.say.start) * T.CPS));
        const top = bubble(brain.say.text, p.x * S, bottom - 6 * S / 3, false, S, shown);
        bottom = top - 4;
      }
      if (brain.thought && game.time < brain.thought.until) bubble(brain.thought.text, p.x * S + 20, bottom - 10 * S / 3, true, S);
    }
    // номера ловушек
    const onScreen = visibleTraps();
    c.textAlign = "center"; c.textBaseline = "middle";
    const fs = Math.max(11, Math.round(S * 5));
    for (const t of onScreen) {
      const b = trapBounds(t), p = toScreen((b.x0 + b.x1) / 2, b.y1 + 0.35);
      const ready = !t.disabled && game.time >= t.ready;
      c.fillStyle = ready ? "#1c1714" : "rgba(168,63,61,.85)"; const s = fs * 1.35;
      c.fillRect(p.x * S - s / 2, p.y * S - s / 2, s, s);
      if (!ready) { c.fillStyle = "#e2615c"; c.fillRect(p.x * S - s / 2, p.y * S + s / 2 - 3, s * (1 - (t.ready - game.time) / t.cd), 3); }
      c.fillStyle = ready ? "#faf3e1" : "#f0a193"; c.font = `${fs}px "Rubik Mono One", monospace`; c.fillText(String(t.key), p.x * S, p.y * S + 1);
    }
    c.textAlign = "left";
    // заголовок/финал
    if (game.big && game.bigA > 0) {
      c.globalAlpha = Math.min(1, game.bigA); c.textAlign = "center";
      c.font = `${Math.round(S * 14)}px "Rubik Mono One", monospace`;
      c.fillStyle = "rgba(0,0,0,.35)"; c.fillText(game.big, ui.width / 2 + 3, ui.height * 0.32 + 3);
      c.fillStyle = game.small ? "#faf3e1" : L.pal === "cave" || L.pal === "void" ? "#efe3c8" : "#1c1714";
      c.fillText(game.big, ui.width / 2, ui.height * 0.32);
      if (game.small) {
        c.font = `${Math.round(S * 6.5)}px Neucha, cursive`; c.fillStyle = "#efe3c8";
        game.small.split("\n").forEach((l, i) => c.fillText(l, ui.width / 2, ui.height * 0.47 + i * S * 8));
      }
      c.globalAlpha = 1; c.textAlign = "left";
    }
    if (game.paused) {
      c.fillStyle = "rgba(28,23,20,.6)"; c.fillRect(0, 0, ui.width, ui.height);
      c.textAlign = "center"; c.fillStyle = "#faf3e1"; c.font = `${Math.round(S * 12)}px "Rubik Mono One", monospace`;
      c.fillText("ПАУЗА", ui.width / 2, ui.height / 2); c.textAlign = "left";
    }
    $("stats").textContent = `Лепёшек ${ball.splats} · смертей ${ball.deaths} · ловушек ${trapsFired}`;
    $("stage").textContent = `стадия прозрения ${L.data.awareness}/5`;
  }
  function visibleTraps() {
    const hw = T.VW / T.PPU / 2, hh = T.VH / T.PPU / 2;
    const list = L.traps.filter((t) => { if (t.disabled || L.hidden.has(t)) return false; const b = trapBounds(t); return b.x1 > CO.cx - hw && b.x0 < CO.cx + hw && b.y1 > CO.cy - hh && b.y0 < CO.cy + hh; });
    list.sort((a, b) => a.x - b.x);
    L.traps.forEach((t) => t.key = 0);
    list.slice(0, 9).forEach((t, i) => t.key = i + 1);
    return list.slice(0, 9);
  }

  // ---------------------------------------------------------------- журнал реплик
  function log(text, thought) {
    const el = document.createElement("li");
    el.className = thought ? "th" : "sp"; el.textContent = text;
    const ul = $("log"); ul.prepend(el);
    while (ul.children.length > 30) ul.lastChild.remove();
  }

  // ---------------------------------------------------------------- ввод
  function resize() {
    const wrapEl = $("stagewrap"), W = wrapEl.clientWidth;
    let scale = Math.max(1, Math.floor(W / T.VW));
    if (W < T.VW * 2) scale = W / T.VW;
    const cw = Math.round(T.VW * scale), ch = Math.round(T.VH * scale);
    view.style.width = ui.style.width = cw + "px"; view.style.height = ui.style.height = ch + "px";
    const dpr = window.devicePixelRatio || 1;
    view.width = cw; view.height = ch; ui.width = Math.round(cw * dpr); ui.height = Math.round(ch * dpr);
  }
  window.addEventListener("resize", resize);
  function screenToWorld(ev) {
    const r = ui.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * T.VW, py = (ev.clientY - r.top) / r.height * T.VH;
    return { x: (px - T.VW / 2) / T.PPU + CO.cx, y: (T.VH / 2 - py) / T.PPU + CO.cy };
  }
  ui.addEventListener("pointermove", (e) => { mouse.world = screenToWorld(e); });
  ui.addEventListener("pointerleave", () => { mouse.world = null; });
  ui.addEventListener("pointerdown", (e) => {
    audio(); if (AC && AC.state === "suspended") AC.resume();
    if (game.waitRestart) { restartLoop(); return; }
    const w = screenToWorld(e);
    let best = null, bd = 1.1;
    for (const t of visibleTraps()) {
      const b = trapBounds(t);
      let d = Math.hypot(w.x - (b.x0 + b.x1) / 2, w.y - (b.y0 + b.y1) / 2);
      if (w.x >= b.x0 - 0.2 && w.x <= b.x1 + 0.2 && w.y >= b.y0 - 0.2 && w.y <= b.y1 + 0.2) d = 0;
      if (d < bd) { bd = d; best = t; }
    }
    if (best && !game.cutscene) fireTrap(best);
  });
  function restartLoop() { game.waitRestart = false; game.big = null; game.start(0); }
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT") return;
    audio(); if (AC && AC.state === "suspended") AC.resume();
    if (game.waitRestart) { restartLoop(); return; }
    if (e.key >= "1" && e.key <= "9") { const t = visibleTraps().find((x) => x.key === Number(e.key)); if (t && !game.cutscene) fireTrap(t); }
    else if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") game.start(levelIndex);
    else if (e.key === "Escape" || e.key === "p" || e.key === "з") game.paused = !game.paused;
    else if (e.key === "m" || e.key === "ь") toggleMute();
    else return;
    e.preventDefault();
  });
  function toggleMute() { muted = !muted; $("mute").textContent = muted ? "Звук: выкл" : "Звук: вкл"; $("mute").setAttribute("aria-pressed", String(!muted)); }
  $("mute").addEventListener("click", () => { audio(); toggleMute(); });
  $("restart").addEventListener("click", () => game.start(levelIndex));
  $("pause").addEventListener("click", () => { game.paused = !game.paused; $("pause").textContent = game.paused ? "Дальше" : "Пауза"; });
  const sel = $("level");
  levels.forEach((lv, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = `${lv.order}. ${lv.title}`; sel.appendChild(o); });
  sel.addEventListener("change", () => { game.start(Number(sel.value)); sel.blur(); });

  // ---------------------------------------------------------------- цикл
  let last = 0, acc = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (!game.paused) {
      acc += dt;
      while (acc >= 1 / 60) { fixedStep(1 / 60); acc -= 1 / 60; }
      update(dt);
    }
    render();
    requestAnimationFrame(frame);
  }

  function boot(saved) {
    resize();
    let start = 0; try { start = Number(localStorage.getItem("sharik_level") || 0) || 0; } catch (e) { }
    if (saved && typeof saved.level === "number") start = saved.level;
    game.start(start);
    requestAnimationFrame(frame);
  }
  loadSprites().then(() => {
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ level: levelIndex }));
    const hot = window.claude && window.claude.hot;
    if (hot && hot.ready) hot.ready((data) => boot(data)); else boot(hot ? hot.data : null);
  });
})();
