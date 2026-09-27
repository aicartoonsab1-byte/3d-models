  // ================================================================ РАССКАЗЧИК (закадровый голос)
  // Вклеивается сборщиком сразу после mind.js. Невозмутимый голос за кадром, как в самодельных мультах-притчах:
  // спокойно и чуть цинично пересказывает жизнь героя, будто это древний миф. Субтитры внизу кадра + низкий голос.
  // Говорит в начале уровня и изредка по событиям; шарик в это время ждёт (speechBusy).
  // Кампания может задать свои реплики: campaign.json → "narrator": { "<ключ>": ["…", …] } (те же ключи, что ниже).

  const NARR_LINES = {
    start0: ["Жил-был {hero}. Жил недолго, зато с огоньком. Как и все мы, в общем-то.",
             "И катился {hero} вперёд. Потому что назад катиться было ещё страшнее.",
             "Мир был прост: вот земля, вот яма, вот {hero}. Что могло пойти не так?"],
    start1: ["Со временем {hero} заметил, что беды случаются с ним подозрительно регулярно.",
             "И начал {hero} задавать вопросы. Это первый признак того, что жить станет сложнее."],
    start2: ["Тогда {hero} впервые подумал, что кто-то наверху над ним просто издевается. И был совершенно прав.",
             "Древние в таких случаях строили храмы. {hero} строить не умел, поэтому просто молился на ходу."],
    start3: ["И понял {hero}, что мир этот кто-то нарисовал. Причём, судя по всему, левой ногой.",
             "Чем внимательнее {hero} смотрел на небо, тем внимательнее небо смотрело на него."],
    start4: ["Чем больше {hero} знал о мире, тем меньше мир ему нравился. Это было взаимно.",
             "И решил {hero}, что он избранный. Все так решают, когда их долго бьют."],
    start5: ["И вот {hero} подошёл к самому краю. За краем обычно ничего нет. Но это неточно."],
    splat: ["Гравитация, как всегда, сработала безотказно.", "Лепёшка — это тоже форма жизни. Просто очень плоская.",
            "Так {hero} снова стал лепёшкой. Со временем это вошло в привычку.", "Наблюдатель остался доволен. Наблюдатели всегда довольны."],
    death: ["Смерть — это не конец. Здесь это просто досадное неудобство.", "И {hero} собрался обратно. Его, как всегда, не спросили, хочет ли он."],
    trap: ["И тогда Наблюдатель нажал на кнопку. Просто потому, что мог.", "Древние называли это судьбой. Мы называем это «кликнуть мышкой».",
           "У каждого чуда есть автор. Это чудо было особенно гадким."],
    fragment: ["Так {hero} нашёл ещё кусочек правды. Правда была горькая и немного светилась.", "Знание — сила. Но в основном — головная боль."],
    checkpoint: ["Здесь {hero} решил, что если что — начнёт отсюда. Мудрое решение. Пригодится."],
    finale: ["И выключил {hero} свет. И стало тихо. И никто больше не кликал."],
  };
  const NARR = {
    cur: null, queue: [], lastAt: -99, voice: null,
    lines(key) { const c = (CAMP.narrator && CAMP.narrator[key]) || NARR_LINES[key] || []; return c; },
    fill(t) { const h = (CAMP.hero && CAMP.hero.name) || "Шарик"; return t.replace(/\{hero\}/g, h); },
    pick(key) { const a = this.lines(key); return a.length ? this.fill(a[Math.floor(Math.random() * a.length)]) : null; },
    busy() { return !!(this.cur && game.time < this.cur.until) || this.queue.length > 0 || (this.cur && VOICE.busy()); },
    say(text) { if (text) this.queue.push(tr(text)); },
    // по событию: не чаще раза в 25 с и не всегда
    maybe(key, chance) {
      if (this.busy() || game.time - this.lastAt < 25 || Math.random() > chance) return;
      this.say(this.pick(key));
    },
    level() {
      this.cur = null; this.queue = []; this.lastAt = -99;
      const own = L.data.narration;                        // у уровня может быть свой зачин
      this.say(own ? this.fill(own) : this.pick("start" + Math.min(5, L.data.awareness || 0)));
    },
    // прочитать карточку-главу голосом рассказчика (без субтитров — текст на карточке)
    read(text) { this.cur = null; this.queue = []; this.speak(tr(this.fill(text))); },
    hush() { VOICE.stop(); try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { } },
    update() {
      if (this.cur && (game.time < this.cur.until || VOICE.busy())) return;
      this.cur = null;
      if (!this.queue.length || game.paused) return;
      if (brain && brain.say && game.time < brain.say.until) return;    // не перебиваем героя
      const text = this.queue.shift();
      this.cur = { text, start: game.time, until: game.time + 1.2 + text.length / 15 };
      this.lastAt = game.time;
      this.speak(text);
      log(tr("Рассказчик: ") + text, true);
    },
    pickVoice() {
      // низкий «дикторский» голос: мужской, если есть
      const maxim = ruVoices.find((v) => /maxim|максим/i.test(v.name));      // «бот Максим» — лучший рассказчик для мультов
      if (maxim) return maxim;
      // мужской голос с лучшей оценкой (ruVoices уже отсортированы: нейро-голоса «Natural/Online» первыми)
      const male = ruVoices.find((v) => /dmitry|pavel|yuri|дмитрий|павел|юрий|guy|andrew|brian|christopher|eric|roger|davis|ryan|george|thomas|daniel|male/i.test(v.name));
      return male || ruVoice;
    },
    speak(text) {
      if (VOICE.play("narrator", text)) return;
      if (muted || voiceMode === "off" || voiceMode === "babble" || !window.speechSynthesis) return;
      const v = this.pickVoice(); if (!v) return;
      try {
        const u = new SpeechSynthesisUtterance(text.replace(/[«»]/g, ""));
        const bot = /maxim|максим/i.test(v.name);
        u.voice = v; u.lang = v.lang; u.pitch = bot ? 1 : 0.55; u.rate = bot ? 1 : 0.9; u.volume = 1;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } catch (e) { }
    },
    bandTop: null,                                   // верх полосы субтитров: облачка героя держатся выше неё
    draw(c, S) {
      this.update();
      if (!this.cur) { this.bandTop = null; return; }
      const mult = styleName === "mult";
      const shown = Math.min(this.cur.text.length, Math.ceil((game.time - this.cur.start) * 22));
      const fs = Math.max(13, Math.round(S * 6.2));
      c.font = mult ? `${fs}px Pangolin, "Comic Sans MS", sans-serif` : `italic ${fs}px "Cormorant Garamond", Georgia, serif`;
      c.textAlign = "center"; c.textBaseline = "alphabetic";
      const lines = wrap(c, this.cur.text, ui.width * 0.82);
      const lh = fs * 1.3, pad = fs * 0.45, h = lines.length * lh + pad * 2, top = ui.height - h;
      this.bandTop = top;
      // сплошная полоса, как у субтитров в кино: рисунок и другие надписи под неё не пролезают
      c.fillStyle = mult ? "rgba(253,253,251,.96)" : "rgba(6,6,7,.86)"; c.fillRect(0, top, ui.width, h);
      c.fillStyle = mult ? "#141414" : "rgba(239,236,230,.35)"; c.fillRect(0, top, ui.width, Math.max(1, S * 0.4));
      let left = shown;
      lines.forEach((l, i) => {
        const part = l.slice(0, Math.max(0, left)); left -= l.length + 1;
        if (!part) return;
        c.fillStyle = mult ? "#141414" : "#e8e2d6"; c.fillText(part, ui.width / 2, top + pad + (i + 1) * lh - fs * 0.3);
      });
      c.textAlign = "left"; c.textBaseline = "top";
    },
  };
  // шарик ждёт, пока рассказчик договорит
  {
    const sb = Brain.prototype.speechBusy;
    Brain.prototype.speechBusy = function () { return sb.call(this) || NARR.busy() || VOICE.busy(); };
    const wrapM = (m, fn) => { const o = Brain.prototype[m]; Brain.prototype[m] = function (...a) { const r = o.apply(this, a); try { fn(...a); } catch (e) { } return r; }; };
    wrapM("onSplat", (kind, dies) => NARR.maybe(dies ? "death" : "splat", 0.35));
    wrapM("onTrap", () => NARR.maybe("trap", 0.2));
    wrapM("onFragment", () => NARR.maybe("fragment", 0.5));
    wrapM("onCheckpoint", () => NARR.maybe("checkpoint", 0.3));
  }
