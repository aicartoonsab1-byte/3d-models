  // ================================================================ МИНИ-ИГРА «ПИНГ-ПОНГ» (уровень с "mode": "pingpong")
  // Вклеивается сборщиком после mult.js. Вид сбоку: стол, сетка, мячик прыгает по дуге.
  // Слева играет герой-шарик (сам, как всегда). Справа — соперник: им управляет игрок (мышь, ↑↓, касание),
  // а если игрок бездельничает — соперник играет сам. Клик по столу — порыв Ветра: сносит мячик.
  // Матч до data.pong.to очков (по умолчанию 5). Реплики и концовка зависят от счёта.

  const PONG = {
    on: false,
    start(data) {
      const cfg = data.pong || {};
      this.on = true; this.data = data; this.cfg = cfg;
      this.to = cfg.to || 5;
      this.table = { x0: 110, x1: 530, y: 262, net: 22 };
      this.G = 520;
      this.me = { x: 84, y: 220, v: 0, react: 0 };            // герой слева
      this.op = { x: 556, y: 220, v: 0 };                      // соперник справа
      this.score = [0, 0]; this.serve = 0; this.rally = 0; this.served = 0;
      this.ball = null; this.wait = 1.2; this.over = null; this.outroQ = null;
      this.lastInput = -99; this.gust = null; this.gustReady = 0; this.say = null; this.sayQ = [];
      this.mood = "neutral"; this.fx = []; this.t = 0;
      (data.intro || []).forEach((t) => this.sayQ.push({ text: t, mood: "happy" }));
    },
    stop() { this.on = false; },
    // ---------------------------------------------------------------- реплики героя (свои облачка, свой голос)
    line(key, mood) {
      let pool = (this.cfg.lines && this.cfg.lines[key]) || []; if (!pool.length) return;
      if (this.say && this.t < this.say.until && this.sayQ.length) return;
      if (pool.length > 1) pool = pool.filter((t) => t !== this.lastLine);
      const text = pool[Math.floor(Math.random() * pool.length)]; this.lastLine = text;
      this.sayQ.push({ text, mood: mood || "neutral" });
    },
    speakNext() {
      if (this.say && this.t < this.say.until) return;
      if (NARR.busy() || VOICE.busy()) return;
      const n = this.sayQ.shift(); if (!n) { this.say = null; return; }
      this.say = { text: n.text, start: this.t, until: this.t + n.text.length / T.CPS + T.HOLD };
      n.text = tr(n.text); this.say.text = n.text;
      this.mood = n.mood; speakVoice(n.text, n.mood, 0.5); log(n.text, false);
    },
    // ---------------------------------------------------------------- подача и удар
    serveBall() {
      const s = this.serve, from = s === 0 ? this.me : this.op;
      this.ball = { x: from.x + (s === 0 ? 14 : -14), y: from.y - 6, vx: 0, vy: 0, side: s, bounces: 0, last: s };
      this.aimAt(this.ball, s === 0 ? 1 : -1, 230);
      this.me.err = 0; this.op.err = (Math.random() - 0.5) * 16;
      this.served++; if (this.served % 2 === 0) this.serve = 1 - this.serve;
      SFX.jump && SFX.jump();
    },
    // скорость так, чтобы мячик приземлился на половине соперника
    aimAt(b, dir, speed, smash) {
      const T0 = this.table, mid = (T0.x0 + T0.x1) / 2;
      const tx = dir > 0 ? mid + 40 + Math.random() * (T0.x1 - mid - 70) : T0.x0 + 30 + Math.random() * (mid - T0.x0 - 70);
      b.vx = dir * speed * (smash ? 1.35 : 1);
      const t = Math.abs((tx - b.x) / b.vx);
      b.vy = (T0.y - b.y - 0.5 * this.G * t * t) / t;
      b.bounces = 0; b.last = dir > 0 ? 0 : 1;
    },
    point(to, why) {
      this.score[to]++; this.ball = null; this.wait = 1.4; this.rally = 0;
      this.fx.push({ text: tr(why), t: 0 });
      const [a, b] = this.score;
      if (to === 0) this.line(a === this.to - 1 && b < this.to - 1 ? "matchpoint" : "win_point", "happy");
      else this.line("lose_point", b > a ? "sad" : "determined");
      if (a >= this.to || b >= this.to) {
        const won = a > b; this.over = won ? "win" : "lose";
        const out = (won ? this.cfg.outroWin : this.cfg.outroLose) || this.data.outro || [];
        this.sayQ = out.map((t) => ({ text: t, mood: won ? "happy" : "sad" }));
        this.outroQ = true; if (typeof MIND !== "undefined") { MIND.stats.levelsDone++; saveMind(); }
      }
      SFX.checkpoint && SFX.checkpoint();
    },
    // ---------------------------------------------------------------- ИИ ракетки: куда прилетит мячик
    predictY(px) {
      const b = this.ball; if (!b) return 210;
      let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
      for (let i = 0; i < 240; i++) {
        const dt = 1 / 120; vy += this.G * dt; x += vx * dt; y += vy * dt;
        if (y > this.table.y && x > this.table.x0 && x < this.table.x1 && vy > 0) { y = this.table.y; vy = -vy * 0.86; }
        if ((vx < 0 && x <= px) || (vx > 0 && x >= px)) return y;
      }
      return y;
    },
    movePaddle(p, target, speed, dt) {
      const d = target - p.y, step = Math.sign(d) * Math.min(Math.abs(d), speed * dt);
      p.v = step / dt; p.y = Math.max(150, Math.min(300, p.y + step));
    },
    click(sx, sy) {
      if (!this.ball || this.t < this.gustReady || this.over) return;
      const b = this.ball, dx = b.x - sx, dy = b.y - sy, d = Math.hypot(dx, dy) || 1;
      b.vx += dx / d * 150; b.vy += dy / d * 170 - 60;
      this.gust = { x: sx, y: sy, t: 0 }; this.gustReady = this.t + 1.3;
      if (typeof MIND !== "undefined") MIND.stats.trapsNear++;
      if (Math.random() < 0.5) this.line("wind", "suspicious");
      SFX.wake && SFX.wake();
    },
    // ---------------------------------------------------------------- шаг
    update(dt) {
      this.t += dt; game.time += dt;
      this.speakNext();
      for (const f of this.fx) f.t += dt; this.fx = this.fx.filter((f) => f.t < 1.4);
      if (this.gust) { this.gust.t += dt; if (this.gust.t > 0.5) this.gust = null; }
      if (this.over) {
        if (!this.sayQ.length && !(this.say && this.t < this.say.until) && !NARR.busy()) {
          game.fade += dt / 0.8; if (game.fade >= 1) game.start(levelIndex + 1);
        }
        return;
      }
      // игрок: мышь / клавиши; бездельничает 2 с — соперник играет сам
      const keys = PONG.keys || {};
      if (keys.up || keys.down) { this.lastInput = this.t; this.movePaddle(this.op, this.op.y + (keys.down ? 400 : -400), 330, dt); }
      else if (mouse.sy != null && this.t - this.lastInput < 2) this.movePaddle(this.op, mouse.sy, 420, dt);
      else this.movePaddle(this.op, this.ball && this.ball.vx > 0 ? this.predictY(this.op.x) + (this.op.err || 0) : 215, 250, dt);
      // герой: видит мячик и тянется к нему; когда говорит — отвлекается
      const talking = this.say && this.t < this.say.until;
      const target = this.ball && this.ball.vx < 0 ? this.predictY(this.me.x) + (this.me.err || 0) * (talking ? 1.8 : 1) : 215;
      this.movePaddle(this.me, target, talking ? 230 : 380, dt);
      if (!this.ball) { this.wait -= dt; if (this.wait <= 0) this.serveBall(); return; }
      const b = this.ball, T0 = this.table, px = b.x, py = b.y;
      b.vy += this.G * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      // сетка
      const mid = (T0.x0 + T0.x1) / 2;
      if ((px - mid) * (b.x - mid) <= 0 && b.y > T0.y - T0.net) { this.point(b.vx > 0 ? 1 : 0, "в сетку!"); return; }
      // отскок от стола
      if (b.y >= T0.y && py < T0.y && b.x > T0.x0 && b.x < T0.x1) {
        b.y = T0.y; b.vy = -Math.abs(b.vy) * 0.86;
        const side = b.x < mid ? 0 : 1;
        if (side === b.last) { this.point(1 - b.last, "не на ту сторону"); return; }
        b.bounces++; if (b.bounces >= 2) { this.point(1 - side, "два отскока"); return; }
        SFX.land && SFX.land(0.2);
      }
      // удары ракеток
      const hit = (p, dir, who) => {
        if ((dir > 0 && b.vx < 0 && px >= p.x && b.x <= p.x) || (dir < 0 && b.vx > 0 && px <= p.x && b.x >= p.x)) {
          if (Math.abs(b.y - p.y) <= 24) {
            if (b.bounces === 0 && this.rally > 0) { this.point(1 - who, "с лёта нельзя"); return true; }
            this.rally++;
            const smash = b.y < T0.y - 60 && Math.random() < 0.5;
            this.aimAt(b, dir, Math.min(380, 230 + this.rally * 8), smash);
            const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
            if (who === 1) this.me.err = g() * (5 + this.rally * 1.6 + (smash ? 10 : 0));          // Фантику летит
            else this.op.err = g() * (9 + this.rally * 2.4 + (smash ? 12 : 0));                     // сопернику-автомату
            b.vy += p.v * 0.15;
            SFX.jump && SFX.jump();
            if (who === 0 && this.rally > 6 && Math.random() < 0.25) this.line("rally", "determined");
            if (who === 0 && smash && Math.random() < 0.5) this.line("smash", "happy");
            return true;
          }
        }
        return false;
      };
      if (hit(this.me, 1, 0) || !this.ball) return;
      if (hit(this.op, -1, 1) || !this.ball) return;
      // улетел
      if (b.y > 360 || b.x < -20 || b.x > 660) {
        const lastSide = b.x < mid ? 0 : 1;
        this.point(b.bounces >= 1 ? 1 - lastSide : lastSide === 0 && b.vx < 0 ? 1 : b.vx > 0 ? 0 : 1, "аут");
      }
    },
    // ---------------------------------------------------------------- рисунок (мульт: линия на белом; Лимбо: силуэты)
    render() {
      const M = styleName === "mult", ink = M ? "#141414" : "#0a0a0a", paper = M ? "#fdfdfb" : "#9d9d97";
      ctx.fillStyle = paper; ctx.fillRect(0, 0, T.VW, T.VH);
      if (!M) { const g = ctx.createLinearGradient(0, 0, 0, T.VH); g.addColorStop(0, "#5a5a55"); g.addColorStop(0.6, "#c4c4bc"); g.addColorStop(1, "#6b6b66"); ctx.fillStyle = g; ctx.fillRect(0, 0, T.VW, T.VH); }
      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1.3; ctx.lineCap = "round"; ctx.lineJoin = "round";
      const k = Math.floor(this.t * 6) % 2, j = (v) => v + (k ? 0.5 : -0.5);
      // зал: пол, окно, трибуна с человечками
      ctx.beginPath(); ctx.moveTo(0, j(318)); ctx.lineTo(T.VW, j(316)); ctx.stroke();
      for (let i = 0; i < 12; i++) { const x = 30 + i * 50 + (i % 3) * 7, y = 330 + (i % 2) * 12; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y + 2); ctx.stroke(); }
      ctx.strokeRect(j(260), 72, 120, 56); ctx.beginPath(); ctx.moveTo(320, 72); ctx.lineTo(320, 128); ctx.moveTo(260, 100); ctx.lineTo(380, 100); ctx.stroke();
      for (let i = 0; i < 9; i++) {                                   // зрители: головы-кружки, вертят головой за мячиком
        const x = 30 + i * 70, y = 150 + (i % 2) * 6, look = this.ball ? Math.sign(this.ball.x - x) * 1.5 : 0;
        if (x > 230 && x < 410) continue;
        ctx.fillStyle = paper; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = ink; ctx.fillRect(x - 3 + look, y - 2, 1.5, 1.5); ctx.fillRect(x + 2 + look, y - 2, 1.5, 1.5);
        ctx.beginPath(); ctx.moveTo(x - 7, y + 18); ctx.quadraticCurveTo(x, y + 6, x + 7, y + 18); ctx.stroke();
      }
      // стол
      const T0 = this.table;
      ctx.fillStyle = paper; ctx.beginPath(); ctx.moveTo(T0.x0, j(T0.y)); ctx.lineTo(T0.x1, T0.y); ctx.lineTo(T0.x1, T0.y + 8); ctx.lineTo(T0.x0, T0.y + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(T0.x0 + 20, T0.y + 8); ctx.lineTo(T0.x0 + 24, 316); ctx.moveTo(T0.x1 - 20, T0.y + 8); ctx.lineTo(T0.x1 - 24, 316); ctx.stroke();
      const mid = (T0.x0 + T0.x1) / 2;
      ctx.beginPath(); ctx.moveTo(mid, T0.y); ctx.lineTo(j(mid), T0.y - T0.net); ctx.stroke();
      for (let y = T0.y - T0.net + 3; y < T0.y; y += 4) { ctx.beginPath(); ctx.moveTo(mid - 2, y); ctx.lineTo(mid + 2, y); ctx.stroke(); }
      // соперник: человечек-палочка, как в мультах-притчах
      const o = this.op;
      ctx.fillStyle = paper;
      ctx.beginPath(); ctx.arc(o.x + 26, o.y - 44, 11, 0, 7); ctx.fill(); ctx.stroke();                  // голова
      ctx.beginPath(); ctx.moveTo(o.x + 15, o.y - 50); ctx.lineTo(o.x + 37, o.y - 52); ctx.stroke();      // повязка
      ctx.fillStyle = ink; ctx.fillRect(o.x + 20, o.y - 46, 1.6, 1.6); ctx.fillRect(o.x + 26, o.y - 46, 1.6, 1.6);
      ctx.beginPath(); ctx.moveTo(o.x + 26, o.y - 33); ctx.quadraticCurveTo(o.x + 30, 270, o.x + 28, 290);
      ctx.moveTo(o.x + 28, 290); ctx.lineTo(o.x + 20, 316); ctx.moveTo(o.x + 28, 290); ctx.lineTo(o.x + 36, 316);
      ctx.moveTo(o.x + 26, o.y - 22); ctx.lineTo(o.x + 4, o.y); ctx.stroke();                          // рука к ракетке
      this.paddle(o.x, o.y, ink, paper);
      // герой: шарик с ракеткой
      const me = this.me, col = typeof CLAY !== "undefined" ? rgb(CLAY[this.mood] || CLAY.neutral, 1) : "#f0c0a0";
      const bx = me.x - 30, by = Math.min(300, me.y + 14);
      ctx.beginPath(); ctx.moveTo(bx + 10, by); ctx.lineTo(me.x - 4, me.y + 2); ctx.stroke();
      ctx.fillStyle = M ? col : "#0a0a0a"; ctx.beginPath(); ctx.arc(bx, by, 15, 0, 7); ctx.fill(); ctx.stroke();
      if (!M) { const g = ctx.createRadialGradient(bx, by, 2, bx, by, 60); g.addColorStop(0, rgb(glowState.c, 0.5)); g.addColorStop(1, rgb(glowState.c, 0)); ctx.fillStyle = g; ctx.fillRect(bx - 60, by - 60, 120, 120); ctx.fillStyle = rgb(glowState.c, 1); ctx.beginPath(); ctx.arc(bx, by, 14, 0, 7); ctx.fill(); }
      const look = this.ball ? Math.max(-2, Math.min(2, (this.ball.y - by) / 30)) : 0;
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(bx + 4, by - 4 + look, 1.7, 0, 7); ctx.arc(bx + 10, by - 4 + look, 1.7, 0, 7); ctx.fill();
      ctx.beginPath();
      if (this.mood === "happy") ctx.arc(bx + 7, by + 2, 5, 0.15 * Math.PI, 0.85 * Math.PI); else if (this.mood === "sad") ctx.arc(bx + 7, by + 8, 4, 1.15 * Math.PI, 1.85 * Math.PI);
      else { ctx.moveTo(bx + 4, by + 5); ctx.lineTo(bx + 10, by + 5); }
      ctx.stroke();
      this.paddle(me.x, me.y, ink, paper);
      // мячик и его тень
      const b = this.ball;
      if (b) {
        ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.ellipse(b.x, b.x > T0.x0 && b.x < T0.x1 ? T0.y + 1 : 316, 4, 1.2, 0, 0, 7); ctx.fillStyle = ink; ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = M ? "#fdfdfb" : "#f4f1ea"; ctx.beginPath(); ctx.arc(b.x, b.y, 3.6, 0, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02); ctx.lineTo(b.x - b.vx * 0.045, b.y - b.vy * 0.045); ctx.stroke();
      }
      if (this.gust) {                                             // порыв Ветра: закорючки
        const g = this.gust, r = 10 + g.t * 60; ctx.globalAlpha = 1 - g.t * 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(g.x, g.y, r + i * 6, -0.6 + i, 0.6 + i); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      if (game.fade > 0) { ctx.globalAlpha = Math.min(1, game.fade); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, T.VW, T.VH); ctx.globalAlpha = 1; }
      vctx.imageSmoothingEnabled = false; vctx.drawImage(buf, 0, 0, view.width, view.height);
    },
    paddle(x, y, ink, paper) {
      ctx.fillStyle = paper; ctx.beginPath(); ctx.ellipse(x, y, 5, 16, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + 16); ctx.lineTo(x, y + 26); ctx.stroke();
    },
    ui() {
      const c = uctx, S = ui.width / 320, SP = ui.width / T.VW, M = styleName === "mult";
      c.clearRect(0, 0, ui.width, ui.height);
      // табло
      c.textAlign = "center"; c.textBaseline = "top";
      c.font = M ? `${Math.round(S * 12)}px Pangolin, sans-serif` : `italic ${Math.round(S * 12)}px "Cormorant Garamond", Georgia, serif`;
      c.fillStyle = M ? "#141414" : "#efece6";
      const who = (this.cfg.names || ["Фантик", "Чемпион"]).map(tr);
      c.fillText(`${who[0]}  ${this.score[0]} : ${this.score[1]}  ${who[1]}`, ui.width / 2, S * 4);
      c.font = M ? `${Math.round(S * 4.4)}px Pangolin, sans-serif` : `${Math.round(S * 4.4)}px Lora, Georgia, serif`;
      c.fillStyle = M ? "#55534f" : "#cfcac0";
      c.fillText(tr(`до ${this.to} очков · вы — ${who[1]}: мышь или ↑↓ · клик — порыв Ветра${this.t < this.gustReady ? " (копится)" : ""}`), ui.width / 2, S * 19);
      for (const f of this.fx) { c.globalAlpha = 1 - f.t / 1.4; c.font = M ? `${Math.round(S * 7)}px Pangolin, sans-serif` : `italic ${Math.round(S * 7)}px "Cormorant Garamond", serif`; c.fillStyle = M ? "#141414" : "#efece6"; c.fillText(f.text, ui.width / 2, ui.height * 0.35 - f.t * 20 * S); c.globalAlpha = 1; }
      c.textAlign = "left";
      bubble.rects = [];
      if (this.say && this.t < this.say.until) {
        const shown = Math.min(this.say.text.length, Math.ceil((this.t - this.say.start) * T.CPS));
        bubble(this.say.text, (this.me.x - 30) * SP, (Math.min(300, this.me.y + 14) - 20) * SP, false, S, shown);
      }
      NARR.draw(c, S);
      if (game.card && $("intro").hidden) drawCard(c, S);
      if (game.paused && $("intro").hidden) {
        c.fillStyle = "rgba(0,0,0,.6)"; c.fillRect(0, 0, ui.width, ui.height);
        c.textAlign = "center"; c.fillStyle = "#efece6"; c.font = `italic ${Math.round(S * 14)}px "Cormorant Garamond", Georgia, serif`;
        c.fillText(tr("ПАУЗА"), ui.width / 2, ui.height / 2); c.textAlign = "left";
      }
      $("stats").textContent = tr(`Счёт ${this.score[0]} : ${this.score[1]} · розыгрыш ${this.rally}`);
      $("stage").textContent = `${tr((CAMP.world && CAMP.world.labels && CAMP.world.labels.stage) || "стадия прозрения")} ${this.data.awareness || 0}/5`;
    },
    keys: {},
  };
