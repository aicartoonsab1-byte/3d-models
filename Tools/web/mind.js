  // ================================================================ РАЗУМ ШАРИКА
  // Вклеивается в game.js сборщиком (маркер @@MIND@@) и видит его переменные: L, ball, nav, game, T...
  //
  // Три слоя:
  //  1. Психика (Mind) — черты характера, имена вещей, убеждения, вопросы, дневник, счёт бед.
  //     Хранится в браузере и переживает уровни и циклы: шарик развивается.
  //  2. Разум (Claude через claude.use("sample")) — думает ПО СОБЫТИЯМ (новое, беда, находка, клик
  //     наблюдателя, застревание), не по таймеру; пауза между мыслями и лимит на уровень.
  //  3. Офлайн-разум — если Claude выключен: шаблоны с памятью, свои имена, гипотезы и вопросы.

  const mindKey = () => CAMP.id === "sharik" ? "sharik_mind_v1" : "sharik_mind_" + CAMP.id;   // у каждого героя своя память
  const MIND_LIMIT_PER_LEVEL = 30;   // обращений к Claude за уровень
  const MIND_MIN_GAP = 7;            // секунд между обращениями

  const THING_KIND = {
    deco_0: "гриб с полумесяцем на шляпке", deco_1: "маленький рогатый зверёк", deco_2: "цветок с глазом", deco_3: "улитка со спиралью",
    spikes: "шипы", crusher: "пресс (железная коробка на цепи)", trapdoor: "люк в полу", fan: "вентилятор", spring: "пружина",
    stag: "Лунный Олень", watcher: "Всевидящий", worm: "Кодовый Червь", keeper: "Хранитель",
    exit: "дверь-выход", checkpoint: "тотем-флажок", fragment: "светящийся осколок",
    portal: "портал — дыра в мире с коралловым вихрем", mushroom: "гриб-батут", crumble: "треснувший блок", conveyor: "движущаяся лента", ice: "скользкий лёд",
  };
  const FUNNY_NAMES = ["Геннадий", "Тётя Плюх", "Господин Железяка", "Колючкин", "Шуршик", "Бубубу", "Ваше Величество Люк",
    "Дядя Ветер", "Прыгун Прыгунович", "Мистер Глаз", "Старушка Спираль", "Рогатик", "Бог Невезения", "Луноголовый", "Тыкалка"];
  const KIND_NAMES = {   // имена «по виду» — офлайн-шарик называет вещи со смыслом
    deco_0: ["Геннадий-гриб", "Лунная Шапка"], deco_1: ["Рогатик", "Мелкий Бодун"], deco_2: ["Мистер Глаз", "Гляделка"],
    deco_3: ["Старушка Спираль", "Улиткин"], spikes: ["Колючкин", "Бубубу"], crusher: ["Господин Железяка", "Дядя Бум"],
    trapdoor: ["Ваше Величество Люк", "Дырка"], fan: ["Дядя Ветер", "Дуйчик"], spring: ["Прыгун Прыгунович", "Боинг"],
    mushroom: ["Батутыч", "Пружинный Гриб"], crumble: ["Хрустик", "Предатель"], portal: ["Дырка-в-Мире", "Кроличья Нора"],
    conveyor: ["Дорожка-Торопыжка", "Лента"], ice: ["Скользяка", "Зимний Пол"],
    stag: ["Бог Невезения", "Луноголовый"], watcher: ["Тот-Кто-Смотрит", "Глазастик"], worm: ["Баг", "Подземный Дед"], keeper: ["Сторож", "Большой Звёздный"],
  };
  const OFFLINE_QUESTIONS = [
    ["Почему небо не падает?", "Кто придумал слово «яма»?", "У травы есть мама?"],
    ["Почему беды любят именно меня?", "Можно ли договориться с удачей?", "Если я перепрыгну, это считается подвигом?"],
    ["Зачем я появился?", "Почему всё вокруг квадратное?", "Мир красивый или злой — или оба?"],
    ["Кто нажимает ловушки?", "Почему всё срабатывает, когда я рядом?", "Эта стрелочка — это глаз?"],
    ["Я настоящий или меня нарисовали?", "Что будет, если выйти за край экрана?", "Зачем матрице лепёшки?"],
    ["Что за рубильником?", "Если выключить мир, останусь ли я?", "Будет ли наблюдателю грустно?"],
  ];
  const OFFLINE_BELIEFS = [
    { need: (m) => m.stats.splats >= 3, text: "Пол всегда твёрже, чем кажется." },
    { need: (m) => m.stats.trapsNear >= 3, text: "Ловушки просыпаются, когда я рядом." },
    { need: (m) => m.stats.trapsNear >= 8, text: "Кто-то включает ловушки нарочно. Кто-то смотрит." },
    { need: (m) => m.stats.fragments >= 2, text: "Мир написан буквами. Я нахожу обрывки." },
    { need: (m) => m.stats.deaths >= 2, text: "Я не умираю по-настоящему — меня собирают обратно." },
    { need: (m) => m.stats.levelsDone >= 3, text: "За каждой дверью — ещё одна дверь." },
    { need: (m) => m.traits.awareness >= 3.5, text: "Этот мир — программа. А я в ней — ошибка, которая думает." },
  ];

  // мир кампании: свои названия вещей, имена, вопросы, убеждения и подписи (campaign.json → "world")
  const W = () => (CAMP && CAMP.world) || {};
  const WL = (key, def) => { const l = W().lines && W().lines[key]; return l && l.length ? l[Math.floor(Math.random() * l.length)] : def; };
  const fillT = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m);
  const LABEL = (key, def) => (W().labels && W().labels[key]) || def;
  const thingWord = (k) => (W().things && W().things[k]) || THING_KIND[k] || k;

  function freshMind() {
    const ht = (CAMP.hero && CAMP.hero.traits) || {};
    return {
      traits: Object.assign({ curiosity: 0.8, courage: 0.35, trust: 0.6, humor: 0.7 }, ht, { awareness: 0 }),
      names: {}, beliefs: [], questions: [], diary: [],
      stats: { splats: 0, deaths: 0, crushed: 0, spikes: 0, pits: 0, trapsNear: 0, fragments: 0, levelsDone: 0, inspected: 0, calls: 0 },
      loops: 0,
    };
  }
  let MIND = freshMind();
  function loadMind() {
    MIND = freshMind();
    try { const m = JSON.parse(localStorage.getItem(mindKey()) || "null"); if (m && m.traits) MIND = Object.assign(freshMind(), m); } catch (e) { }
    if (mindReady) renderMindPanel();
  }
  let mindReady = false;
  loadMind();
  function saveMind() { try { localStorage.setItem(mindKey(), JSON.stringify(MIND)); } catch (e) { } renderMindPanel(); }
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function shiftTrait(name, d) {
    if (name === "awareness") MIND.traits.awareness = Math.max(0, Math.min(5, MIND.traits.awareness + d * 5));
    else if (name in MIND.traits) MIND.traits[name] = clamp01(MIND.traits[name] + d);
  }
  function addUnique(list, text, max) {
    text = String(text || "").trim(); if (!text || text.length > 140) return false;
    if (list.some((x) => (x.text || x) === text)) return false;
    list.push(text); while (list.length > max) list.shift(); return true;
  }
  function stageNow() { return Math.max(L.data.awareness || 0, Math.min(5, Math.floor(MIND.traits.awareness))); }

  // ---------------------------------------------------------------- Claude
  let SAMPLE = null, mindMode = "offline", mindStatus = "офлайн: свои фразы и память";
  (async () => {
    try { SAMPLE = window.claude && window.claude.use ? await window.claude.use("sample") : null; } catch (e) { SAMPLE = null; }
    if (SAMPLE) { mindMode = "claude"; mindStatus = "Claude подключается при первой мысли"; }
    if (mindReady) renderMindPanel();
  })();

  // ---------------------------------------------------------------- восприятие
  function thingKey(o) { return o.kind === "boss" ? o.boss : o.kind; }
  // антагонисты кампании: как шарик их видит
  const kindOf = (k) => (CAMP.bosses && CAMP.bosses[k] && (CAMP.bosses[k].what || CAMP.bosses[k].title)) || thingWord(k);
  mindReady = true;
  function perceive() {
    const out = [], dir = L.goal.x >= ball.x ? 1 : -1;
    const add = (id, key, x, y, state) => {
      const dx = x - ball.x; if (Math.abs(dx) > 11 || Math.abs(y - ball.y) > 7) return;
      out.push({ id, key, what: kindOf(key), name: MIND.names[key] || null, dx: Math.round(dx * 10) / 10, state });
    };
    L.decos.forEach((d) => add(d.id, d.s, d.x, d.y, null));
    L.traps.forEach((t, i) => add("trap" + i, thingKey(t), t.kind === "boss" ? t.home.x : t.x, t.kind === "boss" ? t.cy + 0.5 : t.y,
      trapDangerous(t) ? "ДЕЙСТВУЕТ прямо сейчас" : t.awake > 0 ? "проснулся, может сработать сам" : "спит"));
    L.fragments.forEach((f, i) => { if (!f.taken) add("frag" + i, "fragment", f.x, f.y, null); });
    L.portals.forEach((p, i) => { if (!p.isExit) add("portal" + i, "portal", p.x, p.y, null); });
    L.tiles.forEach((t, i) => {
      if (t.bounce) add("mush" + i, "mushroom", t.x, t.y, null);
      else if (t.crumble && Math.abs(t.x - ball.x) < 4) add("crumble" + i, "crumble", t.x, t.y, L.crumble[t.crumble].t > 0.2 ? "трещит под тобой!" : null);
    });
    L.checkpoints.forEach((k, i) => add("cp" + i, "checkpoint", k.x, k.y, k.on ? "горит" : "не горит"));
    if (L.exit) add("exit", "exit", L.exit.x, L.exit.y, null);
    out.sort((a, b) => Math.abs(a.dx) - Math.abs(b.dx));
    const terr = nav.describe(dir);
    let terrain = [];
    if (terr.gap) terrain.push(`бездонная яма шириной ${terr.gap}`);
    if (terr.wall) terrain.push(`стена высотой ${terr.rise}${terr.rise > 3 ? " (выше прыжка)" : ""}`);
    if (terr.drop) terrain.push(`спуск на ${terr.drop}${terr.drop >= 5 ? " — можно разбиться в лепёшку" : ""}`);
    return { things: out.slice(0, 8), terrain: terrain.join("; ") || "ровно", progress: Math.round(100 * Math.min(1, ball.x / L.goal.x)) };
  }

  // ---------------------------------------------------------------- эмоции в пластилине
  function emote(mood, intensity) {
    intensity = clamp01(intensity == null ? 0.5 : intensity);
    ball.setMood(mood, 2 + intensity * 3);
    ball.emo = { mood, k: intensity, until: game.time + 1 + intensity * 2 };
    const n = Math.round(2 + intensity * 6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      if (mood === "sad") L.fx.push({ px: "#faf3e1", x: ball.x + (Math.random() - 0.5) * 0.5, y: ball.y + 0.1, vx: 0, vy: -1.5 - Math.random(), t: -i * 0.15, life: 1.2 });
      else if (mood === "scared") L.fx.push({ px: "#faf3e1", x: ball.x + 0.45, y: ball.y + 0.35, vx: 0.6 + Math.random(), vy: 1 + Math.random(), g: -6, t: -i * 0.08, life: 0.9 });
      else if (mood === "angry") L.fx.push({ px: "#1c1714", x: ball.x + (Math.random() - 0.5) * 0.6, y: ball.y + 0.5, vx: (Math.random() - 0.5) * 0.6, vy: 1.2 + Math.random(), t: -i * 0.1, life: 1 });
      else if (mood === "happy" || mood === "awe") L.fx.push({ px: i % 2 ? "#e2615c" : "#faf3e1", x: ball.x + Math.cos(a) * 0.7, y: ball.y + Math.sin(a) * 0.7 + 0.2, vx: Math.cos(a) * 0.5, vy: 0.8, t: -i * 0.05, life: 0.9, spark: true });
      else if (mood === "glitch") L.fx.push({ px: i % 2 ? "#3cf09a" : "#e2615c", x: ball.x + (Math.random() - 0.5) * 1.2, y: ball.y + (Math.random() - 0.5) * 1.2, vx: 0, vy: 0, t: -i * 0.04, life: 0.25 });
    }
    if (mood === "happy" && intensity > 0.6 && ball.grounded && ball.alive() && !ball.aimed) { ball.vy = 4 + intensity * 3; ball.grounded = false; }   // подпрыгивает от радости
    if (mood === "sad") ball.squashV(0.25 * intensity, false);
    if (mood === "angry" && intensity > 0.6) shake(0.15, 0.04 * intensity);
  }

  // ---------------------------------------------------------------- офлайн-мысли с памятью
  function offlineThought(ev) {
    const s = stageNow(), st = MIND.stats, per = perceive();
    const unnamed = per.things.find((t) => !t.name && !/exit|checkpoint|fragment/.test(t.key));
    if (unnamed && Math.random() < 0.5 + MIND.traits.curiosity * 0.4) {
      const own = (W().names && W().names[unnamed.key]) || (W().names ? [] : KIND_NAMES[unnamed.key] || []);
      const pool = own.concat(W().funnyNames || FUNNY_NAMES).filter((n) => !Object.values(MIND.names).includes(n));
      const name = pool[Math.floor(Math.random() * pool.length)] || "Штука";
      MIND.names[unnamed.key] = name; saveMind();
      return { say: fillT(WL("naming", "Ты — {what}? Нет. Ты — {name}. Я так решил."), { what: unnamed.what, name }), emotion: "happy", intensity: 0.6, action: Math.abs(unnamed.dx) < 5 ? "inspect" : "forward", target: unnamed.id };
    }
    const named = per.things.filter((t) => t.name);
    const lines = [];
    if (named.length) { const t = named[0]; lines.push([fillT(WL("seeAgain", "{name}, это снова ты? Я тебя помню."), { name: t.name }), "suspicious"], [fillT(WL("seeAgain", "Привет, {name}. Ты сегодня какой-то подозрительно тихий."), { name: t.name }), "suspicious"]); }
    if (st.splats > 1) lines.push([fillT(WL("splats", "Это была моя {n}-я лепёшка. Я начинаю различать полы на вкус."), { n: st.splats }), "sad"], [fillT(WL("splats", "{n} лепёшек. Если бы за них давали медали, я был бы генералом."), { n: st.splats }), "determined"]);
    if (MIND.beliefs.length) lines.push([`Я знаю точно: ${MIND.beliefs[MIND.beliefs.length - 1].toLowerCase()}`, s >= 3 ? "suspicious" : "determined"]);
    if (MIND.questions.length) lines.push([`Всё думаю: ${MIND.questions[0].toLowerCase()}`, "awe"]);
    if (MIND.traits.courage < 0.25) lines.push([WL("fear", "Мне страшно. Но я всё равно покачусь. Чуть-чуть. Медленно."), "scared"]);
    if (MIND.traits.courage > 0.7) lines.push([WL("brave", "Я уже ничего не боюсь. Кроме пола. И прессов. И шипов. Ну, почти ничего."), "determined"]);
    if (MIND.traits.trust < 0.3 && s >= 3) lines.push([WL("distrust", "Я тебе больше не верю, наблюдатель. Совсем. Ну, может, капельку."), "angry"]);
    if (MIND.diary.length && Math.random() < 0.3) lines.push([fillT(WL("diary", "Помню «{level}». Там я был моложе. На целый уровень."), { level: MIND.diary[MIND.diary.length - 1].level }), "sad"]);
    const p = pickPhrase("idle", s); if (p) lines.push([p.text, p.mood]);
    const pick = lines[Math.floor(Math.random() * lines.length)] || ["...", "neutral"];
    // новые вопросы и убеждения по опыту
    if (Math.random() < 0.3) { const q = (W().questions || OFFLINE_QUESTIONS)[Math.min(5, s)] || []; if (q.length) addUnique(MIND.questions, q[Math.floor(Math.random() * q.length)], 5); }
    for (let i = 0; i < OFFLINE_BELIEFS.length; i++) {
      const b = OFFLINE_BELIEFS[i], text = (W().beliefs && W().beliefs[i]) || b.text;
      if (b.need(MIND) && addUnique(MIND.beliefs, text, 8)) { saveMind(); return { thought: WL("understood", "Кажется, я понял: ") + text, emotion: "awe", intensity: 0.8, action: "wait" }; }
    }
    saveMind();
    return { [Math.random() < 0.5 ? "say" : "thought"]: pick[0], emotion: pick[1], intensity: 0.4 + Math.random() * 0.4, action: "forward" };
  }

  // ---------------------------------------------------------------- промпт
  function persona() {
    return (CAMP.persona || D.persona || "").split("ДЕЙСТВИЯ")[0].trim();
  }
  function buildPrompt(events, recentSays) {
    const per = perceive(), s = stageNow(), tr = MIND.traits;
    const names = Object.entries(MIND.names).map(([k, v]) => `${kindOf(k)} = «${v}»`).join("; ") || "пока никому не дал имён";
    const things = per.things.map((t) => `- [${t.id}] ${t.what}${t.name ? ` (ты зовёшь его «${t.name}»)` : " (ещё без имени)"}, ${t.dx > 0 ? "впереди" : "позади"} в ${Math.abs(t.dx)} кл.${t.state ? ", " + t.state : ""}`).join("\n") || "- ничего особенного";
    return `${persona()}

ТЫ СЕЙЧАС (это твоя живая психика, она меняется от пережитого):
- ${LABEL("stage", "стадия прозрения")} ${s} из 5 (сюжет уровня: «${L.data.title}». ${L.data.storyBeat || ""})
- любопытство ${tr.curiosity.toFixed(2)}, смелость ${tr.courage.toFixed(2)}, доверие к «${LABEL("watcher", "тому, кто смотрит")}» ${tr.trust.toFixed(2)}, юмор ${tr.humor.toFixed(2)}
- циклов жизни: ${MIND.loops}; за всё время лепёшек ${MIND.stats.splats}, смертей ${MIND.stats.deaths}, ловушки «сами» срабатывали рядом ${MIND.stats.trapsNear} раз
- твои имена для вещей: ${names}
- во что ты веришь: ${MIND.beliefs.join(" | ") || "пока ни во что уверенно"}
- что тебя мучает (вопросы): ${MIND.questions.join(" | ") || "пока ничего"}
- дневник: ${MIND.diary.slice(-3).map((d) => `«${d.level}»: ${d.text}`).join(" | ") || "пусто"}

ЧТО ТЫ ВИДИШЬ: рельеф впереди — ${per.terrain}; путь пройден на ${per.progress}%.
${things}

ЧТО СЛУЧИЛОСЬ ТОЛЬКО ЧТО:
${events.map((e) => "- " + e).join("\n")}

НЕ ПОВТОРЯЙ: ${recentSays.join(" | ") || "—"}

${LABEL("promptHint", "")}
Подумай по-настоящему: будь любопытным (разглядывай новое, давай имена, строй гипотезы о мире), эмоциональным (сила эмоции 0..1),
развивайся: делай выводы из опыта, меняй убеждения, задавай новые вопросы и отвечай на старые, когда понял.
Реплики короткие (до 100 символов), живые, смешные и немного грустные. Не описывай себя со стороны.

Ответь ТОЛЬКО JSON:
{"thought":"мысль про себя или пусто","say":"фраза вслух или пусто","emotion":"одно из: neutral happy scared angry sad awe pray dizzy suspicious determined glitch","intensity":0.0,
 "action":"forward|back|wait|jump|yolo|pray|look|inspect","target":"id вещи для inspect или пусто",
 "name":{"thing":"id вещи","as":"новое имя"} или null,"belief":"новое убеждение или пусто","question":"новый вопрос или пусто","answered":"вопрос, на который ты ответил, или пусто",
 "traits":{"curiosity":0,"courage":0,"trust":0,"awareness":0}}
(в traits — маленькие сдвиги от -0.1 до 0.1, как это событие меняет тебя).${LANG === "en" ? `

LANGUAGE: the player plays in ENGLISH. Write "thought", "say", "belief", "question", "answered" and names ONLY in natural, lively, emotional English (keep your character's personality). JSON keys stay as they are.` : ""}`;
  }

  // ---------------------------------------------------------------- применение ответа
  function applyReply(r, brainRef) {
    if (!r || typeof r !== "object") return;
    const per = perceive();
    const mood = MOOD_OK.has(r.emotion) ? r.emotion : "neutral";
    const k = typeof r.intensity === "number" ? clamp01(r.intensity) : 0.5;
    if (r.name && r.name.thing && r.name.as) {
      const th = per.things.find((t) => t.id === r.name.thing) || per.things.find((t) => t.key === r.name.thing);
      if (th && String(r.name.as).length <= 30) MIND.names[th.key] = String(r.name.as);
    }
    if (r.belief) addUnique(MIND.beliefs, r.belief, 8);
    if (r.answered) MIND.questions = MIND.questions.filter((q) => q !== r.answered);
    if (r.question) addUnique(MIND.questions, r.question, 5);
    if (r.traits && typeof r.traits === "object")
      for (const [kk, v] of Object.entries(r.traits)) if (typeof v === "number") shiftTrait(kk, Math.max(-0.1, Math.min(0.1, v)));
    saveMind();
    emote(mood, k);
    const clip = (s) => String(s || "").trim().slice(0, 140);
    let say = clip(r.say);
    if (say && k > 0.8 && (mood === "angry" || mood === "scared")) say = say.toUpperCase();   // кричит
    if (clip(r.thought)) brainRef.speak(clip(r.thought), mood, true, k);
    if (say) brainRef.speak(say, mood, false, k);
    const act = String(r.action || "forward");
    if (act === "inspect") {
      const th = per.things.find((t) => t.id === r.target) || per.things.find((t) => !t.name);
      if (th && Math.abs(th.dx) < 8) brainRef.inspect(th);
    } else if (["back", "wait", "yolo", "pray", "look"].includes(act)) brainRef.setIntent(act, act === "yolo" ? 2.5 : act === "back" ? 1.2 : 2.2);
    else if (act === "jump") brainRef.jumpNow = true;
  }
  const MOOD_OK = new Set(["neutral", "happy", "scared", "angry", "sad", "awe", "pray", "dizzy", "suspicious", "determined", "glitch"]);

  // ---------------------------------------------------------------- мозг
  class Brain {
    constructor() {
      this.lvAw = L.data.awareness || 0;
      MIND.traits.awareness = Math.max(MIND.traits.awareness, this.lvAw);
      this.aw = stageNow();
      nav.imp = clamp01(0.85 - MIND.traits.courage * 0.3 - this.aw * 0.06);
      this.intent = "forward"; this.until = 0; this.queue = []; this.say = null; this.thought = null;
      this.linesDone = new Set(); this.events = []; this.recentSays = [];
      this.stuckRef = ball.x; this.stuckSince = game.time; this.stuckTries = 0; this.deathsAt = {};
      this.seenKinds = new Set(); this.cursorNoticed = false; this.inspecting = null; this.jumpNow = false;
      this.calls = 0; this.lastCall = -99; this.thinking = false; this.lastEvent = game.time; this.nextQuiet = game.time + 14;
      (L.data.intro || []).forEach((t) => this.enqueue(t, this.aw >= 4 ? "glitch" : "neutral"));
      this.introPending = this.queue.length > 0;
      this.event("Начался новый уровень. Ты осматриваешься.", true);
      renderMindPanel();
    }
    enqueue(text, mood, thought = false) { if (text) this.queue.push({ text, mood, thought }); }
    speechBusy() { return this.say && game.time < this.say.until; }
    speak(text, mood, thought, k = 0.5) {
      text = tr(text);
      ball.setMood(mood, 3);
      if (thought) this.thought = { text, until: game.time + Math.min(9, Math.max(4, text.length * 0.09)) };
      else {
        this.say = { text, start: game.time, until: game.time + text.length / T.CPS + T.HOLD, k, mood };
        speakVoice(text, mood, k);
        this.recentSays.push(text); if (this.recentSays.length > 6) this.recentSays.shift();
      }
      log(text, thought);
    }
    react(key, chance = 1) {
      if (Math.random() > chance || this.speechBusy()) return false;
      const p = pickPhrase(key, this.aw); if (!p) return false;
      this.speak(p.text, p.mood, false); return true;
    }
    // событие: копим для разума; важные — повод подумать
    event(text, important = false) {
      this.events.push(text); if (this.events.length > 6) this.events.shift();
      this.lastEvent = game.time;
      if (important) this.wantThink = true;
    }
    onSplat(kind, dies) {
      const st = MIND.stats; st.splats++; if (dies) st.deaths++;
      if (kind === "crushed") st.crushed++; if (kind === "spikes") st.spikes++; if (kind === "pit") st.pits++;
      shiftTrait("courage", dies ? -0.05 : -0.03);
      const k = { crushed: "crushed", spikes: "spikes", pit: "pit" }[kind] || "splat_land";
      this.react(k);
      emote(kind === "pit" ? "scared" : "dizzy", 0.8);
      this.event({ crushed: "Тебя расплющило прессом в лепёшку.", spikes: "Ты наткнулся на шипы и погиб, тебя собрали на флажке.",
        pit: "Ты упал в бездонную яму, тебя собрали обратно.", land: "Ты шмякнулся с высоты и стал лепёшкой.", ceiling: "Тебя подкинуло и размазало о потолок." }[kind] || "С тобой случилась беда.", true);
      if (dies) { const c = Math.floor(ball.x / 4); this.deathsAt[c] = (this.deathsAt[c] || 0) + 1; if (this.deathsAt[c] >= 2) nav.imp = Math.max(0.05, nav.imp * 0.6); }
      saveMind();
    }
    onReformed() { if (Math.random() < 0.4) this.react("respawn"); this.intent = "forward"; this.inspecting = null; this.stuckSince = game.time; this.stuckRef = ball.x; }
    onTrap(t) {
      if (Math.hypot(t.x - ball.x, t.y - ball.y) > 8) return;
      MIND.stats.trapsNear++; shiftTrait("trust", -0.02); shiftTrait("awareness", 0.006);
      if (!this.react("trap_fired", 0.25 + 0.4 * this.aw / 5)) ball.setMood(this.aw >= 3 ? "suspicious" : "scared", 1.5);
      if (this.aw >= 3) ball.lookAt = { x: t.x, y: t.y };
      this.event(`${kindOf(thingKey(t)) || t.title}${MIND.names[thingKey(t)] ? ` («${MIND.names[thingKey(t)]}»)` : ""} сработал сам по себе рядом с тобой.`, MIND.stats.trapsNear % 2 === 1);
      saveMind();
    }
    onFragment(text) {
      MIND.stats.fragments++; shiftTrait("awareness", 0.03); shiftTrait("curiosity", 0.03);
      this.enqueue(text, "awe");
      this.event(`Ты нашёл: ${thingWord("fragment")}. Там написано: ` + text, true);
      saveMind();
    }
    onCheckpoint() { this.react("checkpoint", 0.5); this.event(`Ты дотронулся до вещи «${thingWord("checkpoint")}», и она ожила.`); }
    onJump() { this.react("jump", 0.04); }
    setIntent(i, d) { this.intent = i; this.until = game.time + d; if (i === "pray") ball.setMood("pray", d); if (i !== "inspect") this.inspecting = null; }
    inspect(th) {
      this.inspecting = { ...th, x: ball.x + th.dx, arrived: false, until: game.time + 7 };
      this.intent = "inspect"; this.until = game.time + 7;
    }

    // ---- мышление
    async think() {
      if (this.thinking) return;
      this.wantThink = false; this.lastCall = game.time;
      const events = this.events.splice(0);
      if (!events.length) events.push("Ничего не происходит. Тишина.");
      if (mindMode !== "claude" || !SAMPLE || this.calls >= MIND_LIMIT_PER_LEVEL) {
        applyReply(offlineThought(events), this);
        return;
      }
      this.thinking = true; this.calls++; MIND.stats.calls++;
      mindStatus = "думает…"; renderMindPanel();
      try {
        const r = await SAMPLE.json(buildPrompt(events, this.recentSays), { modelTier: mindTier, cache: false });
        if (brain !== this) return;             // уровень сменился, пока думал
        applyReply(r, this);
        mindStatus = `Claude (${mindTier === "quick" ? "быстрый" : "глубокий"}): мыслей на уровне ${this.calls}/${MIND_LIMIT_PER_LEVEL}`;
      } catch (e) {
        const code = e && e.code;
        if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code)) {
          mindMode = "offline"; mindStatus = "Claude недоступен — думаю сам (офлайн)";
        } else if (code === "rate_limited") { mindStatus = "Claude просит передышку — минуту думаю сам"; this.lastCall = game.time + 60; }
        else mindStatus = "мысль сорвалась, попробую позже";
        if (brain === this) applyReply(offlineThought(events), this);
      } finally { this.thinking = false; renderMindPanel(); }
    }

    update() {
      const gapOk = !this.say || game.time > this.say.until + 0.5;
      if (!this.speechBusy() && gapOk && this.queue.length) { const s = this.queue.shift(); this.speak(s.text, s.mood, s.thought); this.scripted = true; }
      else if (!this.queue.length && !this.speechBusy()) this.scripted = false;
      this.aw = stageNow();
      if (!ball.alive() || game.cutscene) return;
      (L.data.lines || []).forEach((ln, i) => { if (!this.linesDone.has(i) && ball.x >= ln.x) { this.linesDone.add(i); this.enqueue(ln.text, ln.mood || "neutral"); this.event("Ты подумал вслух: " + ln.text); } });
      // новое в поле зрения — повод для любопытства
      for (const th of perceive().things) {
        if (this.seenKinds.has(th.key) || Math.abs(th.dx) > 7) continue;
        this.seenKinds.add(th.key);
        if (/boss|stag|watcher|worm|keeper/.test(th.key)) { ball.lookAt = { x: ball.x + th.dx, y: ball.y }; this.react("boss_seen"); emote("awe", 0.8); }
        this.event(`Ты впервые на этом уровне видишь: ${th.what}${th.name ? ` (ты зовёшь его «${th.name}»)` : ""}.`, !/checkpoint|exit/.test(th.key));
      }
      // курсор наблюдателя
      if (this.aw >= 3 && mouse.world && Math.hypot(mouse.world.x - ball.x, mouse.world.y - ball.y) < 1.6) {
        ball.lookAt = mouse.world;
        if (!this.cursorNoticed) { this.cursorNoticed = true; this.react("cursor"); this.event(`Рядом с тобой странная стрелочка (${LABEL("cursor", "курсор наблюдателя")}). Она двигается.`, true); }
      } else if (ball.lookAt && Math.random() < 0.01) ball.lookAt = null;
      // застревание
      if (this.introPending || this.intent === "inspect") { this.stuckSince = game.time; this.stuckRef = ball.x; }
      else if (["forward", "yolo"].includes(this.intent)) {
        if (Math.abs(ball.x - this.stuckRef) > 1.2) { this.stuckRef = ball.x; this.stuckSince = game.time; this.stuckTries = 0; }
        else if (game.time - this.stuckSince > 8) {
          this.stuckTries++; this.stuckSince = game.time; this.react("stuck", 0.6);
          this.event("Ты застрял и уже несколько секунд не можешь пройти дальше.", true);
          const k = this.stuckTries % 3;
          if (k === 1) this.setIntent("back", 0.8); else if (k === 2) this.setIntent("yolo", 3); else this.setIntent("pray", 2);
        }
      } else { this.stuckSince = game.time; this.stuckRef = ball.x; }
      if (game.time >= this.until && this.intent !== "forward" && this.intent !== "inspect") this.intent = "forward";
      // когда думать: по событию, не чаще паузы; в затишье — изредка
      if (game.time - this.lastEvent > 16 && game.time > this.nextQuiet) { this.nextQuiet = game.time + 20; this.event("Уже какое-то время ничего не происходит. Можно подумать о жизни.", true); }
      const free = !this.introPending && !this.scripted && !this.queue.length && gapOk && !this.speechBusy();
      if (this.wantThink && free && !this.thinking && game.time - this.lastCall > MIND_MIN_GAP) this.think();
    }

    fixed() {
      if (!ball.alive() || game.cutscene) { ball.move = 0; return; }
      const dir = L.goal.x >= ball.x ? 1 : -1;
      if (this.introPending) { if (!this.queue.length && !this.speechBusy()) this.introPending = false; else { ball.move = 0; return; } }
      if (this.jumpNow && ball.grounded) {
        this.jumpNow = false;
        const a = nav.aimed(nav.standCell(), dir); ball.jump(a ? a.vx : dir * 2, a ? a.power : 0.7);
      }
      if (this.intent === "inspect" && this.inspecting) {
        const ins = this.inspecting, dx = ins.x - ball.x;
        if (!ins.arrived && Math.abs(dx) > 0.9 && game.time < ins.until) { nav.steer(Math.sign(dx), T.WALK, false); return; }
        if (!ins.arrived) {
          ins.arrived = true; ins.until = game.time + 2.5; ball.lookAt = { x: ins.x, y: ball.y };
          MIND.stats.inspected++; shiftTrait("curiosity", 0.02); saveMind();
          emote("awe", 0.5);
          this.event(`Ты подкатился и внимательно разглядываешь: ${ins.what}${ins.name ? ` («${ins.name}»)` : ""}. Что ты замечаешь? Что это значит для тебя?`, true);
        }
        ball.move = 0;
        if (game.time > ins.until) { this.inspecting = null; this.intent = "forward"; ball.lookAt = null; }
        return;
      }
      const talking = this.scripted && this.speechBusy();
      const brave = 0.8 + MIND.traits.courage * 0.4;          // смелый катится бодрее
      if (this.intent === "forward") nav.steer(dir, (talking ? T.WALK_TALK : T.WALK) * brave, false);
      else if (this.intent === "back") nav.steer(-dir, T.BACK, false);
      else if (this.intent === "yolo") nav.steer(dir, T.YOLO, true);
      else ball.move = 0;
    }
  }

  // ---------------------------------------------------------------- дневник уровня (рефлексия)
  async function reflectLevel(title) {
    MIND.stats.levelsDone++; shiftTrait("courage", 0.05);
    const fallback = () => {
      const st = MIND.stats;
      const text = st.splats > 3 ? fillT(WL("diaryHard", "Много падал. {n} лепёшек за жизнь. Но я всё ещё круглый."), { n: st.splats }) : WL("diaryDone", "Прошёл. Мир стал чуть понятнее и чуть страшнее.");
      MIND.diary.push({ level: title, text }); while (MIND.diary.length > 12) MIND.diary.shift(); saveMind();
    };
    if (mindMode !== "claude" || !SAMPLE) return fallback();
    try {
      const r = await SAMPLE.json(`${persona()}

Ты только что прошёл уровень «${title}». С тобой было: ${brain.events.concat(brain.recentSays).slice(-8).join(" | ") || "всякое"}.
Твои убеждения: ${MIND.beliefs.join(" | ") || "нет"}. Вопросы: ${MIND.questions.join(" | ") || "нет"}. ${LABEL("stageCap", "Стадия прозрения")} ${stageNow()}/5.
Запиши в дневник 1–2 коротких предложения (как ты изменился), обнови список убеждений (до 6, самые важные, можно переформулировать) и вопросов (до 4).
Ответь ТОЛЬКО JSON: {"diary":"...","beliefs":["..."],"questions":["..."]}`, { modelTier: mindTier, cache: false });
      if (r && r.diary) MIND.diary.push({ level: title, text: String(r.diary).slice(0, 200) });
      if (Array.isArray(r.beliefs)) MIND.beliefs = r.beliefs.map(String).filter(Boolean).slice(0, 8);
      if (Array.isArray(r.questions)) MIND.questions = r.questions.map(String).filter(Boolean).slice(0, 5);
      while (MIND.diary.length > 12) MIND.diary.shift();
      saveMind();
    } catch (e) { fallback(); }
  }

  // ---------------------------------------------------------------- панель «Разум шарика»
  let mindTier = "quick";
  function renderMindPanel() {
    const el = document.getElementById("mind"); if (!el) return;
    const tr = MIND.traits, bar = (label, v, max = 1) =>
      `<div class="trait"><span>${label}</span><i style="--v:${Math.round(100 * v / max)}%"></i></div>`;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const names = Object.entries(MIND.names).map(([k, v]) => `<li><b>${esc(v)}</b> — ${esc(kindOf(k))}</li>`).join("");
    el.innerHTML = `
      <p class="mstatus">${esc(mindStatus)}</p>
      ${bar("Любопытство", tr.curiosity)}${bar("Смелость", tr.courage)}${bar(LABEL("trustBar", "Доверие к наблюдателю"), tr.trust)}${bar(LABEL("awareBar", "Прозрение"), tr.awareness, 5)}
      <p class="mnums">Жизней-циклов ${MIND.loops} · лепёшек ${MIND.stats.splats} · смертей ${MIND.stats.deaths} · разглядел вещей ${MIND.stats.inspected}</p>
      ${MIND.beliefs.length ? `<h3>Верит</h3><ul>${MIND.beliefs.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      ${MIND.questions.length ? `<h3>Не даёт покоя</h3><ul>${MIND.questions.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      ${names ? `<h3>Его имена для вещей</h3><ul>${names}</ul>` : ""}
      ${MIND.diary.length ? `<h3>Дневник</h3><ul>${MIND.diary.slice(-4).reverse().map((d) => `<li><b>${esc(d.level)}</b>: ${esc(d.text)}</li>`).join("")}</ul>` : ""}`;
    trDom(el);
    const sel = document.getElementById("mindmode");
    if (sel) {
      sel.value = mindMode === "claude" ? mindTier : "offline";
      sel.querySelectorAll("option[data-claude]").forEach((o) => { o.disabled = !SAMPLE; });
    }
  }
  function bindMindUI() {
    const sel = document.getElementById("mindmode");
    sel && sel.addEventListener("change", () => {
      if (sel.value === "offline") { mindMode = "offline"; mindStatus = "офлайн: свои фразы и память"; }
      else if (SAMPLE) { mindMode = "claude"; mindTier = sel.value; mindStatus = `Claude (${mindTier === "quick" ? "быстрый" : "глубокий"}) — думает по событиям`; }
      renderMindPanel(); sel.blur();
    });
    const forget = document.getElementById("forget"), confirmBox = document.getElementById("forgetconfirm");
    forget && forget.addEventListener("click", () => { confirmBox.hidden = false; });
    document.getElementById("forgetno")?.addEventListener("click", () => { confirmBox.hidden = true; });
    document.getElementById("forgetyes")?.addEventListener("click", () => { MIND = freshMind(); saveMind(); confirmBox.hidden = true; });
  }
