// «Шарик» — браузерный прототип. Порт логики Unity-версии (Assets/_Project/Scripts) на JS:
// те же уровни, спрайты, физика (Tuning), инстинкт (Navigator), ловушки, боссы, офлайн-мозг (phrases_ru.json).
// Данные подставляет Tools/web/build.py в window.SHARIK_DATA.
"use strict";
(function () {
  const D = window.SHARIK_DATA;
  // ---------------------------------------------------------------- Tuning (синхронно с Tuning.cs)
  const T = {
    PPU: 32, VW: 640, VH: 360,          // ночная точечная графика: 32 px на клетку
    G: 9.81 * 3, RUN: 6, JUMP: 14.5, R: 0.45, SPLAT: 17,
    GACC: 38, AACC: 16, COYOTE: 0.1, KILLY: -3,
    SPIKES_ON: 1.6, SPIKES_CD: 3, CR_HOLD: 0.6, CR_CD: 3.5, CR_FALL: 22, CR_RISE: 3,
    TD_OPEN: 1.6, TD_CD: 3, FAN_ON: 2.5, FAN_CD: 4, FAN_F: 75, FAN_H: 5, SPRING_V: 22, SPRING_CD: 1.5,
    REFORM: 1.3, RESPAWN: 1.1, CPS: 12, HOLD: 2.8,
    // пробуждённые враги: сколько секунд действуют сами
    AWAKE_TRAP: 10, AWAKE_BOSS: 18,
    // скорость качения шарика (доля RUN): медленнее, чтобы успевать следить
    WALK: 0.5, WALK_TALK: 0.25, BACK: 0.4, YOLO: 0.95,
  };
  const SKY = { meadow: "#efe3c8", cave: "#231c18", city: "#f0a193", glitch: "#efe3c8", void: "#0e0b0a" };
  const POWERS = [1, 0.85, 0.7, 0.55];
  const MUSH_POWERS = [1.45, 1.25];            // прыжок с гриба-батута (levellib.MUSHROOM_POWERS)
  const CONVEYOR = 2, ICE_ACC = 0.25, CRUMBLE_T = 0.6, CRUMBLE_BACK = 4;

  // ---------------------------------------------------------------- DOM
  const view = document.getElementById("view");
  const ui = document.getElementById("ui");
  const vctx = view.getContext("2d");
  const uctx = ui.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const buf = document.createElement("canvas");
  buf.width = T.VW; buf.height = T.VH;
  const ctx = buf.getContext("2d");
  const dark = { cv: document.createElement("canvas") }; dark.cv.width = T.VW; dark.cv.height = T.VH; dark.ctx = dark.cv.getContext("2d");
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
    wake: () => { tone(160, 0.18, "square", 0.05, 0, 520); tone(520, 0.12, "triangle", 0.04, 0.16, 260); },
  };
  // ---------------------------------------------------------------- голос
  // Два смешных голоса:
  //  • «писклявый» — настоящая русская речь синтезатором браузера, задранная по высоте (бурундук),
  //    интонация и скорость зависят от настроения, в «матрице» — наоборот, басовитый робот;
  //  • «бормотание» — мультяшный лепет: слоги-«боинги» с глиссандо и вибрато, писк в конце фразы.
  // Стили: «живой» — лучший русский голос системы почти без искажений (нейро-голоса Edge «Светлана»/«Дмитрий»,
  // «Google русский»); «писклявый» — он же, задранный «бурундуком»; «лепет» — мультяшное бормотание; «выкл».
  const VOICE_MODES = ["natural", "squeaky", "babble", "off"];
  const VOICE_LABEL = { natural: "Голос: живой", squeaky: "Голос: писклявый", babble: "Голос: лепет", off: "Голос: выкл" };
  let voiceMode = "natural", ruVoice = null, ruVoices = [];
  try { voiceMode = localStorage.getItem("sharik_voice_mode") || "natural"; } catch (e) { }
  function voiceScore(v) {
    let sc = 0;
    if (/natural|neural|online/i.test(v.name)) sc += 4;          // нейро-голоса (Edge, Windows 11)
    if (/google/i.test(v.name)) sc += 2;
    if (/svetlana|dmitry|dariya|milena|yuri|irina|pavel/i.test(v.name)) sc += 1;
    if (!v.localService) sc += 1;
    return sc;
  }
  function findRuVoice() {
    try {
      const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
      ruVoices = vs.filter((v) => /^ru/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
      let saved = null; try { saved = localStorage.getItem("sharik_voice_name"); } catch (e) { }
      ruVoice = ruVoices.find((v) => v.name === saved) || ruVoices[0] || null;
    } catch (e) { ruVoices = []; ruVoice = null; }
    const pick = document.getElementById("voicepick");
    if (pick) {
      pick.innerHTML = ruVoices.length ? ruVoices.map((v) => `<option value="${v.name.replace(/"/g, "&quot;")}">${v.name}${voiceScore(v) >= 4 ? " ★" : ""}</option>`).join("")
        : `<option value="">нет русского голоса в системе</option>`;
      if (ruVoice) pick.value = ruVoice.name;
      pick.disabled = !ruVoices.length;
    }
    updateVoiceLabel();
  }
  if (window.speechSynthesis) { findRuVoice(); try { speechSynthesis.onvoiceschanged = findRuVoice; } catch (e) { } }
  // [высота, скорость] для «живого»; «писклявый» поднимает высоту к 2
  const MOOD_VOICE = {
    neutral: [1.15, 1.0], happy: [1.3, 1.1], scared: [1.4, 1.3], sad: [0.95, 0.82], angry: [1.05, 1.2], awe: [1.3, 0.88],
    pray: [1.1, 0.8], dizzy: [1.2, 0.85], suspicious: [1.0, 0.85], determined: [1.0, 1.0], glitch: [0.3, 0.75],
  };
  function speakVoice(text, mood, k = 0.5) {
    if (muted || voiceMode === "off") return;
    if ((voiceMode === "natural" || voiceMode === "squeaky") && ruVoice && window.speechSynthesis) {
      try {
        const mv = MOOD_VOICE[mood] || MOOD_VOICE.neutral, u = new SpeechSynthesisUtterance(text.replace(/[«»]/g, ""));
        const excite = (k - 0.5) * (mood === "sad" || mood === "pray" ? -0.3 : 0.4);   // сила эмоции слышна
        let pitch = mv[0] + excite * 0.5, rate = mv[1] * (1 + excite * 0.5);
        if (voiceMode === "squeaky") pitch = mood === "glitch" ? 0.2 : Math.min(2, pitch + 0.75);
        u.voice = ruVoice; u.lang = ruVoice.lang; u.pitch = Math.max(0, Math.min(2, pitch)); u.rate = Math.max(0.5, Math.min(1.8, rate)); u.volume = 1;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        if (voiceMode === "squeaky" && Math.random() < 0.3) squeak(text.length / T.CPS * 0.9 + 0.2);
        return;
      } catch (e) { /* упадём в лепет */ }
    }
    babble(text, mood);
  }
  function squeak(when) { tone(900, 0.09, "triangle", 0.05, when, 1700); tone(1700, 0.07, "sine", 0.03, when + 0.09, 1100); }
  function babble(text, mood) {
    const ac = audio(); if (!ac || muted) return;
    let base = 360, wob = 0.12, glide = 1.35, type = "square";
    ({ scared: () => { base = 520; wob = 0.25; glide = 1.6; }, happy: () => { base = 430; glide = 1.5; }, awe: () => { base = 420; glide = 0.75; },
       sad: () => { base = 230; wob = 0.05; glide = 0.7; type = "triangle"; }, angry: () => { base = 250; glide = 1.15; type = "sawtooth"; },
       pray: () => { base = 300; glide = 0.85; type = "triangle"; }, glitch: () => { base = 140; wob = 0.4; glide = 1; type = "sawtooth"; },
       determined: () => { base = 280; glide = 1.1; }, dizzy: () => { base = 380; wob = 0.35; glide = 1.8; } }[mood] || (() => { }))();
    const step = 1 / T.CPS, vowels = "аоуыэяёюие", s = text.slice(0, 120).toLowerCase(), t0 = ac.currentTime;
    for (let i = 0; i < s.length; i++) {
      const v = vowels.indexOf(s[i]);
      if (v < 0) continue;
      let f = base * (0.8 + v * 0.07) * (1 + (Math.random() * 2 - 1) * wob);
      if (text.trim().endsWith("?") && i > s.length - 5) f *= 1.45;             // вопрос — вверх
      if (text.trim().endsWith("!") && i > s.length - 5) f *= 1.2;
      const d = step * 0.95, at = t0 + i * step;
      const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = type; o2.type = "sine";
      o.frequency.setValueAtTime(f * glide, at); o.frequency.exponentialRampToValueAtTime(f, at + d * 0.6);   // «боинг»
      o2.frequency.setValueAtTime(f * 2.01, at);
      lfo.frequency.value = 22; lg.gain.value = f * 0.04; lfo.connect(lg); lg.connect(o.frequency);           // вибрато
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.05, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, at + d);
      o.connect(g); o2.connect(g); g.connect(ac.destination);
      [o, o2, lfo].forEach((x) => { x.start(at); x.stop(at + d + 0.02); });
    }
    if (Math.random() < 0.35) squeak(s.length * step + 0.05);
  }
  function updateVoiceLabel() {
    const b = document.getElementById("voice"); if (!b) return;
    b.textContent = VOICE_LABEL[voiceMode] + ((voiceMode === "natural" || voiceMode === "squeaky") && !ruVoice ? " (нет рус. голоса → лепет)" : "");
  }

  // ---------------------------------------------------------------- фразы
  function pickPhrase(key, stage) {
    let best = null;
    for (const e of (CAMP.phrases && CAMP.phrases.length ? CAMP.phrases : D.phrases)) {   // у кампании — только свои фразы, без чужого мира
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
  // Кампании: основная «Шарик» и игры «по мотивам фильмов» (Resources/Campaigns/<id>)
  const CAMPAIGNS = (D.campaigns && D.campaigns.length ? D.campaigns : [{ id: "sharik", title: "Шарик", levels: D.levels, persona: D.persona }]);
  let CAMP = CAMPAIGNS[0];
  try { CAMP = CAMPAIGNS.find((c) => c.id === localStorage.getItem("sharik_campaign")) || CAMPAIGNS[0]; } catch (e) { }
  let levels = CAMP.levels.slice().sort((a, b) => a.order - b.order);

  function at(x, y) {
    if (x < 0 || x >= L.w || y < 0 || y >= L.h) return ".";
    const row = L.data.grid[L.h - 1 - y];
    return x < row.length ? row[x] : ".";
  }
  function trapdoorAt(x, y) { return L.trapdoors[x + "," + y]; }
  function solid(x, y) {
    if (x < 0 || x >= L.w) return true;
    const c = at(x, y);
    if (c === "#" || c === "<" || c === ">" || c === "~" || c === "O") return true;
    if (c === "X") { const k = L.crumble[x + "," + y]; return !(k && k.back > game.time); }
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
          tiles: [], decos: [], objects: [], traps: [], portals: [], crumble: {}, bounceAt: {}, trapdoors: {}, fragments: [], checkpoints: [], spawn: null, goal: null, exit: null, sw: null,
          hidden: new Set(), fx: [], glitchT: 4 + Math.random() * 6, glitches: [], dissolve: -1, sky: SKY[data.palette] || SKY.meadow };
    const frag = [];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const c = at(x, y), cx = x + 0.5, cy = y + 0.5;
      if (c === "#") {
        const top = at(x, y + 1) !== "#" && at(x, y + 1) !== "T";
        L.tiles.push({ s: `tile_${L.pal}_${top ? "top" : "fill"}${variant(x, y)}`, x: cx, y: cy });
        if (top && at(x, y + 1) === "." && decoOk(x, y)) {
          const d = { s: `deco_${(x * 7 + y) % 4}`, x: cx, y: cy + 1, deco: true, id: "deco" + L.decos.length };
          L.tiles.push(d); L.decos.push(d);
        }
      } else if (c === "=") L.tiles.push({ s: `tile_${L.pal}_platform`, x: cx, y: cy });
      else if (c === "X") { L.crumble[x + "," + y] = { t: 0, back: 0 }; L.tiles.push({ s: "mech_crumble", x: cx, y: cy, crumble: x + "," + y }); }
      else if (c === "O") L.tiles.push({ s: "mech_bounce", x: cx, y: cy + 6 / 16, bounce: x + "," + y });
      else if (c === ">" || c === "<") L.tiles.push({ s: c === ">" ? "mech_conv_r" : "mech_conv_l", x: cx, y: cy, anim: true });
      else if (c === "~") L.tiles.push({ s: "mech_ice", x: cx, y: cy });
      else if (c === "@") L.portals.push({ cx: x, cy: y, x: cx, y: cy });
      else if (c === "S") L.spawn = { x: cx, y: y + T.R + 0.02 };
      else if (c === "F") { L.exit = { x: cx, y: y + 1, used: false }; L.goal = { x: cx, y: cy }; }
      else if (c === "R") { L.sw = { x: cx, y: y + 1, on: false, used: false }; L.goal = { x: cx, y: cy }; }
      else if (c === "K") L.checkpoints.push({ x: cx, y: cy, on: false });
      else if (c === "*") frag.push({ x, y });
      else if ("^CTWJB".includes(c)) L.traps.push(makeTrap(c, x, y));
    }
    // порталы парами слева направо: 1-й вход → 2-й выход (как levellib.portals)
    L.portals.sort((a, b) => a.cx !== b.cx ? a.cx - b.cx : b.cy - a.cy);
    for (let i = 0; i + 1 < L.portals.length; i += 2) { L.portals[i].exit = L.portals[i + 1]; L.portals[i + 1].isExit = true; }
    frag.sort((a, b) => a.y !== b.y ? b.y - a.y : a.x - b.x);
    frag.forEach((f, i) => L.fragments.push({ x: f.x + 0.5, y: f.y + 0.5, text: data.fragments[i] || "...", taken: false }));
    STY().bake();
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
      // ключ из уровня → описание в кампании (своё существо) → архетип поведения base
      const key = L.data.boss || "stag", def = (CAMP.bosses && CAMP.bosses[key]) || {};
      t.key = key; t.def = def;
      t.boss = ["stag", "watcher", "worm", "keeper"].includes(def.base) ? def.base : ["stag", "watcher", "worm", "keeper"].includes(key) ? key : "stag";
      t.custom = Array.isArray(def.shape) && def.shape.length > 0;
      t.title = def.title || BOSS_TITLE[t.boss] || "Существо";
      t.cd = def.cooldown || { stag: 4, watcher: 3, worm: 4, keeper: 5 }[t.boss] || 4;
      const im = IMG[t.boss === "worm" ? "boss_worm_peek" : `boss_${t.boss}_idle`];
      t.h = t.custom ? (def.size || [3, 3])[1] : im ? im.height / 16 : 3;
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
      const w = t.custom ? (t.def.size || [3, 3])[0] : im ? im.width / 16 : 2, h = t.h;
      return { x0: t.home.x - w / 2, x1: t.home.x + w / 2, y0: t.home.y - h / 2, y1: t.home.y + h / 2 };
    }
    return { x0: t.x - 0.5, x1: t.x + 0.5, y0: t.y - 0.5, y1: t.y + 0.5 };
  }
  let trapsFired = 0;
  // Игрок будит врага кликом. Проснувшийся враг какое-то время действует САМ (autoTick),
  // повторный клик — продлевает бодрствование и заставляет действовать немедленно.
  function fireTrap(t) {
    if (t.disabled) { SFX.denied(); return; }
    const wasAwake = t.awake > 0;
    t.awake = t.kind === "boss" ? T.AWAKE_BOSS : T.AWAKE_TRAP;
    if (!wasAwake) { t.acts = 0; SFX.wake(); }
    L.eyeFlash = game.time + 0.45;       // глаз в небе вспыхивает: это ты, наблюдатель
    if (game.time < t.ready) { if (wasAwake) SFX.denied(); return; }
    trapsFired++;
    act(t);
  }
  function cooldown(t) {
    // в бодрствовании ловушки работают в своём ритме; боссы понемногу устают
    const auto = { spikes: 2.6, crusher: 2.6, trapdoor: 2.4, fan: 3.2, spring: 1.6 }[t.kind];
    const base = t.awake > 0 && auto ? auto : t.cd;
    return t.kind === "boss" ? base * (1 + 0.15 * (t.acts || 0)) : base;
  }
  function act(t) {
    t.ready = game.time + cooldown(t); t.acts = (t.acts || 0) + 1; t.warn = 0;
    brain && brain.onTrap(t);
    if (t.kind === "spikes") { t.up = true; t.timer = t.awake > 0 ? 1.2 : T.SPIKES_ON; SFX.spikes(); }
    if (t.kind === "crusher") { t.phase = "arm"; t.timer = 0.2; SFX.arm(); }
    if (t.kind === "trapdoor") { t.open = true; t.timer = T.TD_OPEN; SFX.trapdoor(); }
    if (t.kind === "fan") { t.on = true; t.timer = t.awake > 0 ? 1.6 : T.FAN_ON; SFX.fan(); }
    if (t.kind === "spring") {
      t.phase = "launch"; t.timer = 0.35; SFX.spring();
      if (ball.alive() && Math.abs(ball.x - t.x) < 0.65 && ball.y - t.y < 1.6 && ball.y > t.y - 0.6) ball.launch(ball.vx, T.SPRING_V);
    }
    if (t.kind === "boss") bossAttack(t);
  }
  // Решение проснувшегося врага: действовать ли сейчас (с коротким предупреждением-дрожью)
  function autoTick(t, dt) {
    if (t.disabled || !(t.awake > 0)) return;
    t.awake -= dt;
    if (t.warn > 0) { t.warn -= dt; if (t.warn <= 0) act(t); return; }
    if (game.time < t.ready || !ball.alive() || game.cutscene) return;
    const dx = ball.x - t.x, adx = Math.abs(dx), near = (r) => adx < r && Math.abs(ball.y - t.y) < 4;
    let want = false;
    if (t.kind === "spikes" || t.kind === "fan") want = near(9);                       // свой ритм, пока шарик рядом
    else if (t.kind === "crusher") want = adx < 2.6;                                    // караулит шарика
    else if (t.kind === "trapdoor") want = adx < 1.4;                                   // открывается под ним
    else if (t.kind === "spring") want = adx < 0.6 && ball.grounded;                    // подкидывает, как только встал
    else if (t.kind === "boss") {
      const bx = ball.x - t.home.x, abx = Math.abs(bx);
      const rng = t.def && t.def.range;
      want = t.boss === "stag" ? abx < (rng || 5) && ball.grounded : t.boss === "watcher" ? abx < (rng || 9) : t.boss === "worm" ? abx < (rng || 12) : abx < (rng || 8);
    }
    if (want && !t.busy) t.warn = t.kind === "boss" ? 0.01 : 0.35;
  }
  // Боссы в бодрствовании двигаются: Олень ходит за шариком, Всевидящий плывёт над ним
  function bossMove(t, dt) {
    const awake = t.awake > 0;
    t.origin = t.origin || { ...t.home };
    let target = t.origin.x;
    if (awake && ball.alive()) target = ball.x;
    if (t.boss === "stag" && !t.busy) {
      target = Math.max(t.origin.x - 6, Math.min(t.origin.x + 6, target));
      const d = target - t.home.x;
      if (Math.abs(d) > (awake ? 1.5 : 0.1)) {
        const nx = t.home.x + Math.sign(d) * Math.min(Math.abs(d), (awake ? ((t.def && t.def.speed) || 1.6) : 1) * dt);
        const legs = [nx - 1.2, nx + 1.2].every((lx) => support(Math.floor(lx), t.cy - 1));
        if (legs) { t.home.x = nx; t.walk = (t.walk || 0) + dt; t.face = d < 0 ? -1 : 1; }
      }
      t.x = t.home.x;
    }
    if (t.boss === "watcher") {
      target = Math.max(t.origin.x - 10, Math.min(t.origin.x + 10, target));
      t.home.x += (target - t.home.x) * Math.min(1, dt * (awake ? 0.55 * ((t.def && t.def.speed) || 1.6) : 0.4));
      t.x = t.home.x;
    }
  }
  function bossAttack(t) {
    t.busy = true;
    if (t.boss === "stag") { t.frame = "atk"; t.phase = "stomp"; t.timer = 0.6; SFX.arm(); }
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
      autoTick(t, dt);
      if (t.kind === "boss") bossMove(t, dt);
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
    if (t.phase === "stomp" && t.timer > 0) t.frame = "atk";
    if (t.phase === "stomp" && t.timer <= 0) {
      t.frame = "idle"; SFX.slam(); shake(0.35, 0.2);
      L.fx.push({ s: "fx_shock", x: t.home.x, y: t.cy + 0.25, t: 0, life: 0.5, grow: 8 });
      if (ball.alive() && ball.grounded && Math.abs(ball.x - t.home.x) < 7) ball.launch(Math.sign(ball.x - t.home.x + 0.01) * 3, 18);
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
    jump(vx, power = 1) { this.jumpQ = { vx, power: Math.max(0.4, Math.min(1.45, power)) }; }
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
          const ux = Math.floor(this.x), uy = Math.floor(this.y - T.R - 0.05);
          if (at(ux, uy) === "O") { L.bounceAt[ux + "," + uy] = game.time; SFX.spring(); }
          brain && brain.onJump();
        }
        this.jumpQ = null;
      }
      if (!(this.aimed && !this.grounded)) {
        const under = this.grounded ? at(Math.floor(this.x), Math.floor(this.y - T.R - 0.05)) : ".";
        let target = Math.max(-1, Math.min(1, this.move)) * T.RUN * this.speedMul;
        if (under === ">") target += CONVEYOR; else if (under === "<") target -= CONVEYOR;
        const acc = (this.grounded ? T.GACC : T.AACC) * dt * (under === "~" ? ICE_ACC : 1);
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
          const ux = Math.floor(this.x), uy = Math.floor(this.y - T.R - 0.05);
          if (at(ux, uy) === "O") {            // гриб-батут гасит удар: «боинг» вместо лепёшки
            L.bounceAt[ux + "," + uy] = game.time;
            if (imp > 6) { SFX.spring(); this.squashV(0.6, false); this.vy = Math.min(6, imp * 0.3); this.grounded = false; this.lastGround = game.time; return; }
          } else if (imp > T.SPLAT) { this.vy = 0; return this.splat("land", false); }
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
    aimed(c, dir, minDy = -6) {
      let best = null, res = null;
      const mush = at(c.x, c.y - 1) === "O", powers = mush ? MUSH_POWERS.concat(POWERS) : POWERS;
      for (let dx = 1; dx <= 6; dx++) for (let dy = mush ? 7 : 3; dy >= minDy; dy--) {
        const tx = c.x + dir * dx, ty = c.y + dy;
        if (!standable(tx, ty) || (dx === 1 && dy === 0)) continue;
        for (let k = 0; k < powers.length; k++) {
          const v0 = T.JUMP * powers[k], disc = v0 * v0 - 2 * T.G * (dy + 0.15);
          if (disc < 0) break;
          const t = (v0 + Math.sqrt(disc)) / T.G, need = ((tx + 0.5) - ball.x) / t;
          if (Math.abs(need) > T.RUN * 1.15 || !this.arcClear(need, v0, t)) continue;
          const score = dx + Math.max(0, -dy) * 0.6 - Math.max(0, dy) * 0.2 + k * 0.3;
          if (best === null || score < best) { best = score; res = { vx: need, power: powers[k] }; }
          break;
        }
      }
      return res;
    },
    // гриб позади: откатиться к нему для прыжка через стену, которую с места не взять
    findMush(c, dir) {
      for (let k = 1; k <= 5; k++) { const x = c.x - dir * k; if (solid(x, c.y)) break; if (at(x, c.y - 1) === "O") return x; }
      return null;
    },
    runup: null,
    steer(dir, speedMul, yolo) {
      ball.speedMul = speedMul;
      if (!ball.grounded) return;
      const c = this.standCell(), nx = c.x + dir;
      if (this.runup) {
        if (game.time > this.runup.until || c.x === this.runup.x) this.runup = null;
        else { ball.move = -dir; return; }
      }
      if (!yolo && this.dangerAhead(dir)) { ball.move = 0; return; }
      ball.move = dir;
      const wall = solid(nx, c.y), pit = !support(nx, c.y - 1) && floorBelow(nx, c.y) === null;
      // на грибе: высокая стена в 2–3 клетках — прыгаем с гриба заранее
      if (at(c.x, c.y - 1) === "O" && !wall) {
        for (const k of [2, 3]) {
          const x2 = c.x + dir * k;
          if (solid(x2, c.y) && solid(x2, c.y + 3)) { const a = this.aimed(c, dir, 3); if (a) { ball.jump(a.vx, a.power); return; } break; }
        }
      }
      if (!wall && !pit) return;
      const edge = dir > 0 ? (c.x + 1) - ball.x : ball.x - c.x;
      if (wall && edge < T.R + 0.15) { ball.move = -dir * 0.6; return; }
      const trig = wall ? 0.75 : 0.35 + 0.4 * this.imp * Math.random();
      if (edge > trig && !wall) return;
      const a = this.aimed(c, dir);
      if (a) { const g = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.sin(2 * Math.PI * Math.random()); ball.jump(a.vx * (1 + g * 0.12 * this.imp), a.power); }
      else if (wall) {
        const m = this.findMush(c, dir);
        if (m !== null) { this.runup = { x: m, until: game.time + 3 }; ball.move = -dir; return; }
        ball.jump(dir * T.RUN * 0.5);
      }
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

  // @@NIGHT@@  (сюда сборщик вклеивает Tools/web/limbo.js: силуэты в тумане, глаз-солнце, свечение шарика)
  // @@MIND@@  (сюда сборщик вклеивает Tools/web/mind.js: психика, разум на Claude, мозг шарика)

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
      try { localStorage.setItem("sharik_level_" + CAMP.id, String(levelIndex)); } catch (e) { }
      const lvData = levels[levelIndex];
      if (lvData.mode === "pingpong") {                 // мини-игра: свой стол, своя физика (pong.js)
        L = { data: lvData, w: 0, h: 0, traps: [], hidden: new Set(), fx: [], pal: lvData.palette || "city" };
        brain = null; PONG.start(lvData);
      } else {
        PONG.stop();
        buildLevel(lvData);
        ball = new Ball(L.spawn); brain = new Brain(); trapsFired = 0; nav.runup = null;
        const c = camClamp(ball.x, ball.y + 1); cam.x = c.x; cam.y = c.y;
      }
      this.cutscene = false; this.fade = 0; this.waitRestart = false; this.flow = null;
      this.title(levels[levelIndex].title);
      $("level").value = String(levelIndex);
      $("log").innerHTML = "";
      // карточка-глава: сюжет уровня словами героя/рассказчика, потом уровень
      const txt = L.data.chapter || (CAMP.id !== "sharik" ? L.data.storyBeat || "" : "");
      this.card = txt ? { title: L.data.title, head: CAMP.chapterHead || "", text: txt, t: 0, need: 3 + txt.length / 16 } : null;
      if (this.card) NARR.read(this.card.text); else NARR.level();
    },
    closeCard() { if (!this.card) return; this.card = null; NARR.hush(); NARR.level(); },
    title(t) { this.big = t; this.small = null; this.bigT = 3; },
    levelDone() {
      if (this.cutscene) return;
      reflectLevel(L.data.title);
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
          stage = 7; t = 0; ball.visible = false; brain.say = null; brain.thought = null; NARR.say(NARR.pick("finale"));
          ball.bits = Array.from({ length: 24 }, () => ({ x: (Math.random() - 0.5) * 0.8, y: (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 1.2, vy: 0.4 + Math.random() * 1.2 }));
        } else if (stage === 7) {
          ball.bits && ball.bits.forEach((b) => { b.x += b.vx * dt; b.y += b.vy * dt; });
          if (t > 3) {
            ball.bits = null; stage = 8;
            MIND.loops++; saveMind();
            let loops = MIND.loops;
            const fin = CAMP.finale || {};
            this.big = fin.end || "КОНЕЦ"; this.bigT = 1e9;
            this.small = `${fin.text || "Шарик выключил мир. Или мир выключил шарика?"}\nЛепёшек: ${ball.splats}. Циклов: ${loops}.\n\nНажми любую клавишу, чтобы… начать заново?`;
            this.waitRestart = true;
          }
        }
      };
    },
  };

  function mechanics(dt) {
    // рассыпающиеся блоки: стоишь дольше 0.6 с — осыпается на 4 с
    const cell = ball.grounded ? Math.floor(ball.x) + "," + Math.floor(ball.y - T.R - 0.05) : null;
    for (const [k, c] of Object.entries(L.crumble)) {
      if (k === cell && ball.alive()) {
        c.t += dt;
        if (c.t > CRUMBLE_T && !(c.back > game.time)) {
          c.back = game.time + CRUMBLE_BACK; c.t = 0; ball.grounded = false; SFX.trapdoor();
          const [x, y] = k.split(",").map(Number);
          for (let i = 0; i < 6; i++) L.fx.push({ px: i % 2 ? "#e2615c" : "#1c1714", x: x + Math.random(), y: y + 0.5, vx: (Math.random() - 0.5), vy: 0, g: -20, t: 0, life: 0.8 });
          brain && brain.event && brain.event("Блок под тобой рассыпался!", true);
        }
      } else if (!(c.back > game.time)) c.t = Math.max(0, c.t - dt);
    }
    // порталы: вход переносит к выходу
    if (ball.alive() && game.time > (ball.portalCd || 0)) {
      const cx = Math.floor(ball.x), cy = Math.floor(ball.y - T.R + 0.1);
      const p = L.portals.find((q) => q.exit && q.cx === cx && q.cy === cy);
      if (p) {
        ball.x = p.exit.x; ball.y = p.exit.cy + T.R + 0.02; ball.portalCd = game.time + 1.2; ball.aimed = false;
        SFX.glitch(); SFX.fragment(); shake(0.2, 0.06);
        for (let i = 0; i < 10; i++) L.fx.push({ px: i % 2 ? "#e2615c" : "#faf3e1", x: ball.x + (Math.random() - 0.5), y: ball.y + (Math.random() - 0.5), vx: 0, vy: 0.5, t: -i * 0.02, life: 0.4, spark: true });
        brain && brain.event && brain.event("Ты провалился в портал и вылетел в другом месте мира!", true);
      }
    }
  }
  function fixedStep(dt) {
    brain.fixed();
    ball.step(dt);
    mechanics(dt);
    updateTraps(dt);
    // снаряды и эффекты
    for (const f of L.fx) {
      f.t += dt;
      if (f.px && f.t > 0) { f.x += f.vx * dt; f.y += f.vy * dt; if (f.g) f.vy += f.g * dt; }
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
    const im = STY().sprite(name); if (!im) return;
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
    STY().bg(1 / 60);
    const gl = L.glitchUntil && game.time < L.glitchUntil ? new Map(L.glitches.map((g) => [g.tile, g])) : null;
    for (const t of L.tiles) {
      if (L.hidden.has(t)) continue;
      if (/^tile_.*_(top|fill)/.test(t.s) || t.s === "mech_ice") continue;          // запечено в рельеф
      if (t.anim) {                                                                    // конвейер: бегущие точки-шевроны
        const p = toScreen(t.x, t.y + 0.5), dir = t.s.endsWith("_r") ? 1 : -1, ph = (game.time * 2 * TPX * dir) % 16;
        ctx.fillStyle = STY().conv;      // зубцы ленты — чуть светлее чёрного силуэта
        for (let k = -16; k < 32; k += 16) { const x0 = p.x - 16 + ((k + ph + 32) % 32); for (let j = 0; j < 4; j++) ctx.fillRect(x0 + (dir > 0 ? j : 3 - j), p.y + 1 + (j < 2 ? j : 3 - j) * 1, 1, 1); }
        continue;
      }
      if (L.dissolve > 0 && Math.random() < 0.02) continue;   // мерцание при выключении мира
      const g = gl && gl.get(t);
      let name = t.s, ox = g ? g.dx / 16 : 0;
      if (t.crumble) {
        const c = L.crumble[t.crumble];
        if (c.back > game.time) continue;
        if (c.t > 0.2) { name = "mech_crumble_crack"; ox += (Math.random() - 0.5) / 8; }
      } else if (t.bounce) { if (game.time - (L.bounceAt[t.bounce] || -9) < 0.25) name = "mech_bounce_squash"; }
      else if (t.anim) name = `${t.s}_${Math.floor(game.time * 8) % 2}`;
      spr(name, t.x + ox, t.y);
      if (g) { const p = toScreen(t.x, t.y); ctx.globalAlpha = 0.5; ctx.fillStyle = g.c; ctx.fillRect(p.x - 16, p.y - 16, 32, 32); ctx.globalAlpha = 1; }
    }
    // объекты
    for (const p of L.portals) if (!L.hidden.has(p)) spr(`mech_portal_${(Math.floor(game.time * 4) + (p.isExit ? 1 : 0)) % 2}`, p.x, p.cy + 1);
    if (L.exit && !L.hidden.has(L.exit)) spr("obj_exit", L.exit.x, L.exit.y);
    if (L.sw && !L.swHidden) spr(L.sw.on ? "obj_switch_on" : "obj_switch_off", L.sw.x, L.sw.y);
    for (const k of L.checkpoints) if (!L.hidden.has(k)) spr(k.on ? "obj_checkpoint_on" : "obj_checkpoint_off", k.x, k.y);
    for (const f of L.fragments) if (!f.taken && !L.hidden.has(f)) spr("obj_fragment", f.x, f.y + Math.round(Math.sin(game.time * 3 + f.x) * 2) / 16);
    // ловушки
    for (const t of L.traps) {
      if (L.hidden.has(t)) continue;
      const jit = t.warn > 0 ? (Math.random() - 0.5) / 8 : 0;
      if (t.kind === "spikes") spr(t.up ? "trap_spikes_on" : "trap_spikes_off", t.x + jit, t.y);
      if (t.kind === "trapdoor") spr(t.open ? "trap_trapdoor_open" : "trap_trapdoor_closed", t.x, t.y);
      if (t.kind === "spring") spr(t.phase === "launch" ? "trap_spring_launch" : "trap_spring_idle", t.x, t.y);
      if (t.kind === "fan") {
        spr(t.on && Math.floor(game.time * 20) % 2 ? "trap_fan_1" : "trap_fan_0", t.x, t.y);
        if (t.on) for (let i = 0; i < 6; i++) spr("fx_wind", t.x + Math.sin(i * 2.3 + game.time * 6) * 0.3, t.y + ((game.time * 1.6 + i / 6) % 1) * T.FAN_H);
      }
      if (t.kind === "crusher") {
        for (let y = t.pos + 1; y < L.h + 1; y++) spr("trap_chain", t.x, y);
        const sh = t.phase === "arm" || t.warn > 0 ? (Math.random() - 0.5) / 8 : 0;
        spr("trap_crusher", t.x + sh, t.pos);
      }
      if (t.kind === "boss") {
        const bob = t.busy ? 0 : Math.round(Math.sin(game.time * (t.boss === "watcher" ? 2 : 1.2)) * (t.boss === "watcher" ? 3 : 1)) / 16;
        if (t.custom) {
          const fr = t.frame === "atk" ? "atk" : t.frame === "blink" ? "blink" : "idle";
          if (t.boss === "worm") {
            if (t.phase === "dust") spr("fx_dust", t.wx + (Math.random() - 0.5) / 4, t.wfy + 0.2);
            if (["burst", "hold", "sink"].includes(t.phase)) STY().boss(t, t.phase === "burst" ? "atk" : "idle", t.wx, t.wormY, false);
            else if (t.phase !== "dust") STY().boss(t, fr, t.home.x, t.home.y + bob, true);    // из земли торчит только верх
          } else {
            const step = t.boss === "stag" && t.walk ? Math.round(Math.abs(Math.sin(t.walk * 8))) / 16 : 0;
            STY().boss(t, fr, t.home.x, t.home.y + bob + step, false, t.face < 0);
          }
        } else if (t.boss === "worm") {
          if (t.phase === "dust") spr("fx_dust", t.wx + (Math.random() - 0.5) / 4, t.wfy + 0.2);
          if (["burst", "hold", "sink"].includes(t.phase)) spr(t.phase === "burst" ? "boss_worm_atk" : "boss_worm_idle", t.wx, t.wormY);
          else if (t.phase !== "dust") spr("boss_worm_peek", t.home.x, t.home.y + bob);
        } else {
          const step = t.boss === "stag" && t.walk ? Math.round(Math.abs(Math.sin(t.walk * 8))) / 16 : 0;
          spr(`boss_${t.boss}_${t.frame}`, t.home.x, t.home.y + bob + step, { flip: t.face < 0 });
        }
      }
    }
    // шарик — светящийся (night.js)
    STY().ball();
    for (const f of L.fx) {
      if (f.px) { if (f.t > 0) { const p = toScreen(f.x, f.y); ctx.globalAlpha = Math.max(0, 1 - f.t / f.life); ctx.fillStyle = f.px; ctx.fillRect(p.x, p.y, f.spark ? 1 : 2, f.spark ? 1 : 2); if (f.spark) { ctx.fillRect(p.x - 1, p.y, 3, 1); ctx.fillRect(p.x, p.y - 1, 1, 3); } ctx.globalAlpha = 1; } continue; }
      if (f.grow) { const im = STY().sprite(f.s); const p = toScreen(f.x, f.y); ctx.save(); ctx.globalAlpha = 1 - f.t / f.life; ctx.translate(p.x, p.y); ctx.scale(1 + f.t * f.grow, 1); ctx.drawImage(im, -im.width / 2, -im.height / 2); ctx.restore(); }
      else spr(f.s, f.x, f.y);
    }
    if (L.data.dark && ball) {
      // видно только вокруг шарика (и чуть-чуть вокруг проснувшихся врагов)
      if (styleName === "mult") {   // «мелом по доске»: белые линии на чёрном
        ctx.save(); ctx.globalCompositeOperation = "difference"; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, T.VW, T.VH); ctx.restore();
      }
      dark.ctx.clearRect(0, 0, T.VW, T.VH); dark.ctx.globalCompositeOperation = "source-over"; dark.ctx.fillStyle = STY().darkFill; dark.ctx.fillRect(0, 0, T.VW, T.VH);
      dark.ctx.globalCompositeOperation = "destination-out";
      const hole = (wx, wy, r) => { const p = toScreen(wx, wy), gr = dark.ctx.createRadialGradient(p.x, p.y, r * 0.35, p.x, p.y, r); gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)"); dark.ctx.fillStyle = gr; dark.ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); };
      hole(ball.x, ball.y, (100 + Math.sin(game.time * 3) * 4) * glowState.r);
      for (const t of L.traps) if (t.awake > 0 || trapDangerous(t)) hole(t.kind === "boss" ? t.home.x : t.x, t.kind === "boss" ? t.home.y : t.y, 52);
      for (const f of L.fragments) if (!f.taken) hole(f.x, f.y, 28);
      for (const p of L.portals) hole(p.x, p.cy + 1, 34);
      if (L.exit) hole(L.exit.x, L.exit.y, 40);
      ctx.drawImage(dark.cv, 0, 0);
    }
    STY().over();
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
    // тёмная полупрозрачная плашка с тонкой рамкой (как в визуальной новелле); мысли — курсивом, без рамки
    const c = uctx, fs = Math.max(14, Math.round(S * 7));
    c.font = styleName === "mult" ? `${Math.round(fs * 0.95)}px Pangolin, "Comic Sans MS", sans-serif`
      : thought ? `italic ${fs}px "Cormorant Garamond", Georgia, serif` : `${Math.round(fs * 0.92)}px Lora, Georgia, serif`;
    const maxW = Math.min(ui.width * 0.42, 360 * S / 3.2), lines = wrap(c, text, maxW);
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + fs * 1.2, h = lines.length * fs * 1.25 + fs * 0.8;
    let x = anchorX - w * (thought ? 0.5 : 0.3), y = bottomY - h;
    x = Math.max(6, Math.min(ui.width - w - 6, x)); y = Math.max(6, y);
    const gc = glowState.c;
    if (styleName === "mult") return multBubble(c, text, lines, x, y, w, h, fs, anchorX, thought, shown);
    c.fillStyle = thought ? "rgba(5,5,6,0.55)" : "rgba(8,8,9,0.86)"; c.fillRect(x, y, w, h);
    if (!thought) {
      c.strokeStyle = "rgba(239,236,230,0.75)"; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      c.fillStyle = rgb(gc, 0.9); c.fillRect(x, y + h - 2, w * 0.18, 2);          // цвет настроения — полоской
      const tx = Math.max(x + 6, Math.min(x + w - 12, anchorX));
      c.fillStyle = "rgba(239,236,230,0.75)"; c.beginPath(); c.moveTo(tx, y + h); c.lineTo(tx + 8, y + h); c.lineTo(tx + 2, y + h + 8); c.fill();
    } else {
      c.fillStyle = "rgba(239,236,230,0.5)"; c.beginPath(); c.arc(anchorX + 6, y + h + 6, 3, 0, 6.3); c.arc(anchorX, y + h + 14, 2, 0, 6.3); c.fill();
    }
    c.fillStyle = thought ? "rgba(214,209,200,0.95)" : "#efece6"; c.textBaseline = "top";
    let left = shown;                         // печать по буквам в такт голосу
    lines.forEach((l, i) => { if (left > 0) c.fillText(l.slice(0, left), x + fs * 0.6, y + fs * 0.4 + i * fs * 1.25); left -= l.length + 1; });
    return y;
  }
  // облачко в мульт-стиле: белое, неровный чёрный контур, хвостик к герою; мысли — облако-«тучка» с пузырьками
  function multBubble(c, text, lines, x, y, w, h, fs, anchorX, thought, shown) {
    c.save(); c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = "#141414"; c.lineWidth = 1.5; c.fillStyle = "#fdfdfb";
    const k = Math.floor(game.time * 6) % 2, j = (i) => ((i * 37 + k * 11) % 5 - 2) * 0.6;
    c.beginPath();
    if (thought) {
      const n = Math.max(4, Math.round(w / 34));
      for (let i = 0; i < n; i++) { const cx = x + (i + 0.5) * w / n; c.moveTo(cx + w / n * 0.7, y + 4); c.arc(cx, y + 4, w / n * 0.7, 0, 7); c.moveTo(cx + w / n * 0.7, y + h - 4); c.arc(cx, y + h - 4, w / n * 0.7, 0, 7); }
      c.fill(); c.stroke();
      c.beginPath(); c.fillRect(x - 2, y + 2, w + 4, h - 4); c.rect(x - 2, y + 2, w + 4, h - 4); c.fill();
      c.beginPath(); c.arc(anchorX + 6, y + h + 10, 4, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(anchorX, y + h + 20, 2.5, 0, 7); c.fill(); c.stroke();
    } else {
      const tx = Math.max(x + 10, Math.min(x + w - 18, anchorX));
      const pts = [[x, y], [x + w * 0.5, y], [x + w, y], [x + w, y + h * 0.5], [x + w, y + h], [tx + 12, y + h], [tx + 2, y + h + 10], [tx, y + h], [x, y + h], [x, y + h * 0.5]];
      pts.forEach(([px, py], i) => i ? c.lineTo(px + j(i), py + j(i + 3)) : c.moveTo(px + j(i), py + j(i + 3)));
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = rgb(glowState.c, 1); c.fillRect(x + 4, y + h - 5, w * 0.16, 3);
    }
    c.fillStyle = "#17110d"; c.textBaseline = "top";
    let left = shown;
    lines.forEach((l, i) => { if (left > 0) c.fillText(l.slice(0, left), x + fs * 0.6, y + fs * 0.4 + i * fs * 1.25); left -= l.length + 1; });
    c.restore();
    return y;
  }
  function renderUI() {
    const c = uctx, S = ui.width / 320, SP = ui.width / T.VW;   // S — масштаб шрифтов, SP — экранные позиции
    c.clearRect(0, 0, ui.width, ui.height);
    c.textAlign = "left";
    // облачка
    if (ball.visible || brain.say) {
      const p = toScreen(ball.x, ball.y + 0.75);
      let bottom = p.y * SP;
      if (brain.say && game.time < brain.say.until) {
        const shown = Math.min(brain.say.text.length, Math.ceil((game.time - brain.say.start) * T.CPS));
        const jit = brain.say.k > 0.75 ? (Math.random() - 0.5) * 3 * S / 3 : 0;
        const top = bubble(brain.say.text, p.x * SP + jit, bottom - 6 * S / 3 + jit, false, S, shown);
        bottom = top - 4;
      }
      if (brain.thought && game.time < brain.thought.until) bubble(brain.thought.text, p.x * SP + 20, bottom - 10 * S / 3, true, S);
    }
    // номера ловушек
    const onScreen = visibleTraps();
    c.textAlign = "center"; c.textBaseline = "middle";
    const fs = Math.max(11, Math.round(S * 5));
    for (const t of onScreen) {
      const b = trapBounds(t), p = toScreen((b.x0 + b.x1) / 2, b.y1 + 0.35);
      const ready = !t.disabled && game.time >= t.ready;
      const s = fs * 1.35, awake = t.awake > 0;
      if (awake) {   // проснулся: коралловая рамка и полоска оставшегося бодрствования
        const full = t.kind === "boss" ? T.AWAKE_BOSS : T.AWAKE_TRAP;
        c.fillStyle = "#e8c27a"; c.fillRect(p.x * SP - s / 2 - 3, p.y * SP - s / 2 - 3, s + 6, s + 6);
        c.fillStyle = "#efece6"; c.fillRect(p.x * SP - s / 2 - 3, p.y * SP - s / 2 - 8, (s + 6) * Math.max(0, t.awake / full), 3);
      }
      const M = styleName === "mult";
      c.fillStyle = M ? (ready ? "#fdfdfb" : "#e4e2dc") : ready ? "rgba(8,8,8,.9)" : "rgba(40,30,28,.85)";
      c.fillRect(p.x * SP - s / 2, p.y * SP - s / 2, s, s);
      c.strokeStyle = M ? "#17110d" : "rgba(239,236,230,.7)"; c.lineWidth = M ? 1.5 : 1; c.strokeRect(p.x * SP - s / 2 + 0.5, p.y * SP - s / 2 + 0.5, s - 1, s - 1);
      if (!ready) { c.fillStyle = "#e2615c"; c.fillRect(p.x * SP - s / 2, p.y * SP + s / 2 - 3, s * (1 - (t.ready - game.time) / t.cd), 3); }
      c.fillStyle = M ? (ready ? "#17110d" : "#7a6c58") : ready ? "#efece6" : "#8f8a82"; c.font = M ? `${fs}px Pangolin, sans-serif` : `${fs}px "Cormorant Garamond", Georgia, serif`; c.fillText(String(t.key), p.x * SP, p.y * SP + 1);
    }
    c.textAlign = "left";
    NARR.draw(c, S);
    // заголовок/финал
    if (game.big && game.bigA > 0) {
      c.globalAlpha = Math.min(1, game.bigA); c.textAlign = "center";
      const M = styleName === "mult";
      c.font = M ? `${Math.round(S * 14)}px Pangolin, sans-serif` : `italic ${Math.round(S * 15)}px "Cormorant Garamond", Georgia, serif`;
      if (M) { c.lineJoin = "round"; c.lineWidth = S * 2.2; c.strokeStyle = "#fdfdfb"; c.strokeText(game.big, ui.width / 2, ui.height * 0.32); c.fillStyle = "#141414"; }
      else { c.fillStyle = "rgba(0,0,0,.35)"; c.fillText(game.big, ui.width / 2 + 3, ui.height * 0.32 + 3); c.fillStyle = "#efece6"; }
      c.fillText(game.big, ui.width / 2, ui.height * 0.32);
      if (game.small) {
        c.font = M ? `${Math.round(S * 6.5)}px Pangolin, sans-serif` : `${Math.round(S * 6.5)}px Lora, Georgia, serif`; c.fillStyle = "#cfcac0";
        game.small.split("\n").forEach((l, i) => {
          const y = ui.height * 0.47 + i * S * 8;
          if (M) { c.lineWidth = S * 1.4; c.strokeStyle = "#fdfdfb"; c.strokeText(l, ui.width / 2, y); c.fillStyle = "#141414"; }
          c.fillText(l, ui.width / 2, y);
        });
      }
      c.globalAlpha = 1; c.textAlign = "left";
    }
    if (game.card && $("intro").hidden) drawCard(c, S);
    if (game.paused && $("intro").hidden) {
      c.fillStyle = "rgba(0,0,0,.6)"; c.fillRect(0, 0, ui.width, ui.height);
      c.textAlign = "center"; c.fillStyle = "#efece6"; c.font = `italic ${Math.round(S * 14)}px "Cormorant Garamond", Georgia, serif`;
      c.fillText("ПАУЗА", ui.width / 2, ui.height / 2); c.textAlign = "left";
    }
    $("stats").textContent = `Лепёшек ${ball.splats} · смертей ${ball.deaths} · ловушек ${trapsFired}`;
    $("stage").textContent = `${(CAMP.world && CAMP.world.labels && CAMP.world.labels.stage) || "стадия прозрения"} ${L.data.awareness}/5`;
  }
  // карточка-глава поверх кадра: как интертитр в немом кино / страница из рассказа героя
  function drawCard(c, S) {
    const k = game.card, M = styleName === "mult", a = Math.min(1, k.t * 3);
    c.save(); c.globalAlpha = a;
    c.fillStyle = M ? "rgba(253,253,251,.97)" : "rgba(5,5,6,.93)"; c.fillRect(0, 0, ui.width, ui.height);
    const pad = ui.width * 0.1, maxW = ui.width - pad * 2;
    if (M) { c.strokeStyle = "#141414"; c.lineWidth = Math.max(1.5, S * 0.6); c.strokeRect(pad * 0.6, ui.height * 0.08, ui.width - pad * 1.2, ui.height * 0.84); }
    c.textAlign = "center"; c.textBaseline = "top";
    const ink = M ? "#141414" : "#efece6", dim = M ? "#55534f" : "#a8a39a";
    let y = ui.height * 0.14;
    if (k.head) { c.font = M ? `${Math.round(S * 5.5)}px Pangolin, sans-serif` : `italic ${Math.round(S * 5.5)}px "Cormorant Garamond", Georgia, serif`; c.fillStyle = dim; c.fillText(k.head, ui.width / 2, y); y += S * 9; }
    c.font = M ? `${Math.round(S * 11)}px Pangolin, sans-serif` : `italic ${Math.round(S * 12)}px "Cormorant Garamond", Georgia, serif`;
    c.fillStyle = ink; c.fillText(k.title, ui.width / 2, y); y += S * 17;
    const fs = Math.round(S * 6.6);
    c.font = M ? `${fs}px Pangolin, sans-serif` : `${fs}px Lora, Georgia, serif`;
    const shown = Math.ceil(k.t * 40);
    let left = shown;
    for (const l of wrap(c, k.text, maxW)) { if (left > 0) c.fillText(l.slice(0, left), ui.width / 2, y); left -= l.length + 1; y += fs * 1.45; }
    c.font = M ? `${Math.round(S * 4.6)}px Pangolin, sans-serif` : `italic ${Math.round(S * 4.6)}px "Cormorant Garamond", Georgia, serif`;
    c.fillStyle = dim; c.fillText("клик или любая клавиша — дальше", ui.width / 2, ui.height * 0.86);
    c.restore(); c.textAlign = "left";
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
  ui.addEventListener("pointermove", (e) => {
    const r = ui.getBoundingClientRect(); mouse.sx = (e.clientX - r.left) / r.width * T.VW; mouse.sy = (e.clientY - r.top) / r.height * T.VH;
    if (PONG.on) { PONG.lastInput = PONG.t; return; }
    mouse.world = screenToWorld(e);
  });
  ui.addEventListener("pointerleave", () => { mouse.world = null; });
  ui.addEventListener("pointerdown", (e) => {
    audio(); if (AC && AC.state === "suspended") AC.resume();
    if (game.waitRestart) { restartLoop(); return; }
    if (game.card) { game.closeCard(); return; }
    if (PONG.on) { const r = ui.getBoundingClientRect(); PONG.click((e.clientX - r.left) / r.width * T.VW, (e.clientY - r.top) / r.height * T.VH); return; }
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
  window.addEventListener("keyup", (e) => { if (e.key === "ArrowUp") PONG.keys.up = false; if (e.key === "ArrowDown") PONG.keys.down = false; });
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT") return;
    audio(); if (AC && AC.state === "suspended") AC.resume();
    if (game.waitRestart) { restartLoop(); return; }
    if (game.card && !game.paused) { game.closeCard(); return; }
    if (PONG.on && (e.key === "ArrowUp" || e.key === "ArrowDown")) { PONG.keys[e.key === "ArrowUp" ? "up" : "down"] = true; e.preventDefault(); return; }
    if (PONG.on && e.key >= "1" && e.key <= "9") return;
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
  const STYLE_LABEL = { mult: "Стиль: мульт", limbo: "Стиль: Лимбо" };
  function showStyle() { $("style").textContent = STYLE_LABEL[styleName]; document.body.dataset.style = styleName; }
  $("style").addEventListener("click", () => { setStyle(styleName === "mult" ? "limbo" : "mult"); showStyle(); });
  showStyle();
  $("voice").addEventListener("click", () => {
    voiceMode = VOICE_MODES[(VOICE_MODES.indexOf(voiceMode) + 1) % VOICE_MODES.length];
    try { speechSynthesis.cancel(); localStorage.setItem("sharik_voice_mode", voiceMode); } catch (e) { }
    updateVoiceLabel(); speakVoice("Привет! Это мой голос. Смешно?", "happy", 0.7);
  });
  $("voicepick").addEventListener("change", () => {
    ruVoice = ruVoices.find((v) => v.name === $("voicepick").value) || ruVoice;
    try { localStorage.setItem("sharik_voice_name", ruVoice ? ruVoice.name : ""); } catch (e) { }
    speakVoice("Так я звучу лучше?", "awe", 0.6); $("voicepick").blur();
  });
  // Звук и речь в браузере разрешены только после действия пользователя — поэтому стартовый экран
  $("go").addEventListener("click", () => {
    audio(); if (AC && AC.state === "suspended") AC.resume();
    findRuVoice(); $("intro").hidden = true; game.paused = false; game.start(levelIndex);
  });
  $("pause").addEventListener("click", () => { game.paused = !game.paused; $("pause").textContent = game.paused ? "Дальше" : "Пауза"; });
  const sel = $("level");
  function fillLevels() {
    sel.innerHTML = "";
    levels.forEach((lv, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = `${lv.order}. ${lv.title}`; sel.appendChild(o); });
  }
  fillLevels();
  function showCampaign() {
    $("introtitle").textContent = CAMP.title || "Шарик";
    $("introlog").textContent = CAMP.logline || "";
    $("introsrc").textContent = CAMP.source || "";
    $("herotitle").textContent = CAMP.title || "Шарик";
  }
  const csel = $("campaign"), ctop = $("campaigntop");
  CAMPAIGNS.forEach((c) => {
    const o = document.createElement("option"); o.value = c.id; o.textContent = c.title + (c.source ? " — " + c.source : ""); csel.appendChild(o);
    const o2 = document.createElement("option"); o2.value = c.id; o2.textContent = "Игра: " + c.title; ctop.appendChild(o2);
  });
  csel.value = ctop.value = CAMP.id;
  ctop.addEventListener("change", () => { csel.value = ctop.value; csel.dispatchEvent(new Event("change")); ctop.blur(); });
  csel.addEventListener("change", () => {
    CAMP = CAMPAIGNS.find((c) => c.id === csel.value) || CAMPAIGNS[0];
    ctop.value = CAMP.id;
    try { localStorage.setItem("sharik_campaign", CAMP.id); } catch (e) { }
    levels = CAMP.levels.slice().sort((a, b) => a.order - b.order);
    fillLevels(); loadMind(); showCampaign();
    let st = 0; try { st = Number(localStorage.getItem("sharik_level_" + CAMP.id) || 0) || 0; } catch (e) { }
    game.start(st); csel.blur();
  });
  showCampaign();
  sel.addEventListener("change", () => { game.start(Number(sel.value)); sel.blur(); });

  // ---------------------------------------------------------------- цикл
  let last = 0, acc = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (game.card && !game.paused) {
      game.card.t += dt;
      if (game.card.t > game.card.need && !(window.speechSynthesis && speechSynthesis.speaking && game.card.t < game.card.need + 12)) game.closeCard();
    } else if (PONG.on) {
      if (!game.paused) PONG.update(dt);
    } else if (!game.paused) {
      acc += dt;
      while (acc >= 1 / 60) { fixedStep(1 / 60); acc -= 1 / 60; }
      update(dt);
    }
    if (PONG.on) { PONG.render(); PONG.ui(); } else render();
    requestAnimationFrame(frame);
  }

  function boot(saved) {
    resize();
    bindMindUI(); renderMindPanel();
    let start = 0; try { start = Number(localStorage.getItem("sharik_level_" + CAMP.id) || localStorage.getItem("sharik_level") || 0) || 0; } catch (e) { }
    if (saved && typeof saved.level === "number") start = saved.level;
    game.start(start);
    if (!$("intro").hidden) game.paused = true;
    updateVoiceLabel();
    requestAnimationFrame(frame);
  }
  loadSprites().then(() => {
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ level: levelIndex }));
    const hot = window.claude && window.claude.hot;
    if (hot && hot.ready) hot.ready((data) => boot(data)); else boot(hot ? hot.data : null);
  });
})();
