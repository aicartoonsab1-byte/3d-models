// SAM_Toons · сцена: собирает кадр в момент t — камера, земля, декорации, персонажи, субтитры, переходы.
// Мир: ширина кадра при zoom=1 = 100 единиц; камера {x, y, zoom}: x — центр кадра, y — высота центра кадра над землёй (по умолчанию 50, 17: земля на 80% высоты кадра).
// z у персонажей и предметов — «ближе к зрителю» (ниже по экрану, рисуется позже).
(function () {
  const SAM = window.SAM;
  const { numAt, discAt } = SAM.track;

  class Stage {
    constructor(canvas, film, manifest) {
      this.cv = canvas; this.c = canvas.getContext("2d"); this.film = film;
      this.P = new SAM.Pen(this.c);
      this.tl = SAM.resolve(film, manifest);
      this.envFps = (manifest && manifest.fps) || 25;
      this.subtitles = film.subtitles !== false;
      this._ground = {};
    }
    get duration() { return this.tl.duration; }
    sceneAt(t) { const sc = this.tl.scenes; for (const s of sc) if (t < s.t1) return s; return sc[sc.length - 1]; }
    beatAt(t) { const S = this.sceneAt(t); return S && (S.beats.find((b) => t < b.t1) || S.beats[S.beats.length - 1]); }

    talkLevel(S, who, t) {
      for (const l of S.talk[who] || []) {
        if (t < l.t0 || t >= l.t1) continue;
        if (l.env) { const v = l.env[Math.floor((t - l.t0) * this.envFps)] || 0; return v; }
        const ph = (t - l.t0) * 9; return Math.max(0, Math.sin(ph * Math.PI)) * (0.5 + 0.5 * Math.abs(Math.sin(ph * 0.7)));   // без озвучки — просто «шлёпает»
      }
      return 0;
    }

    ground(S) {
      if (this._ground[S.id]) return this._ground[S.id];
      const g = S.set.ground || {}, r = SAM.rng(g.seed ?? SAM.hash(S.id)), items = [];
      const n = g.decor ?? 40;
      for (let i = 0; i < n; i++) {
        const x = -40 + r() * 180, z = 0.3 + Math.pow(r(), 1.3) * 16, k = r();
        items.push({ x, z, kind: k < 0.45 ? "grass" : k < 0.8 ? "dash" : "pebble", s: 0.7 + r() * 0.6, seed: Math.floor(r() * 1e6) });
      }
      return (this._ground[S.id] = { line: g.line !== false, items });
    }

    draw(t) {
      const c = this.c, W = this.cv.width, H = this.cv.height, P = this.P;
      const S = this.sceneAt(t); if (!S) return;
      P.boil = Math.floor(t * 8) % 3;
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = SAM.PAPER; c.fillRect(0, 0, W, H);

      // камера (+ тряска)
      let cx = numAt(S.cam.x, t), cy = numAt(S.cam.y, t); const zoom = numAt(S.cam.zoom, t);
      for (const sh of S.shakes) if (t >= sh.t0 && t < sh.t1) { const k = 1 - (t - sh.t0) / (sh.t1 - sh.t0); cx += Math.sin(t * 61) * sh.amp * k; cy += Math.cos(t * 47) * sh.amp * k; }
      const k = W / 100 * zoom;
      c.setTransform(k, 0, 0, k, W / 2 - cx * k, H / 2 + cy * k);
      P.lw = (this.film.line || 0.16) * Math.pow(zoom, -0.35);   // при наезде линия толстеет не так сильно, как всё остальное
      c.lineCap = "round"; c.lineJoin = "round";

      // земля
      const g = this.ground(S);
      if (g.line) P.line(cx - 100 / zoom, 0, cx + 100 / zoom, 0, 5, 1);
      for (const it of g.items) {
        c.save(); c.translate(it.x, it.z);
        if (it.kind === "grass") SAM.PROPS.grass.draw(P, { s: it.s, seed: it.seed }, t);
        else if (it.kind === "pebble") SAM.PROPS.rock.draw(P, { s: it.s * 0.35, seed: it.seed });
        else { const r = SAM.rng(it.seed); P.line(0, 0, 0.6 + r() * 0.5, (r() - 0.5) * 0.1, it.seed, 0.8); }
        c.restore();
      }

      // предметы и персонажи в порядке глубины
      const props = Object.values(S.props).filter((pr) => discAt(pr.visible, t).v !== false).map((pr) => {
        const p = { ...pr.base }; for (const [key, tr] of Object.entries(pr.num)) p[key] = numAt(tr, t); for (const [key, tr] of Object.entries(pr.disc)) p[key] = discAt(tr, t).v;
        const def = SAM.PROPS[pr.type] || { z: "back", draw: (P) => P.text("?" + pr.type, 0, -1, 2) };
        return { pr, p, def, layer: p.layer || def.z };
      });
      const drawProp = ({ pr, p, def }, back) => {
        c.save(); c.translate(p.x, -p.y + p.z);
        const st = { talk: this.talkLevel(S, pr.id, t) };
        if (back) { if (def.back) def.back(P, p, t, st); } else def.draw(P, p, t, st);
        c.restore();
      };
      props.forEach((it) => drawProp(it, true));
      props.filter((it) => it.layer === "back").sort((a, b) => a.p.z - b.p.z).forEach((it) => drawProp(it));

      const actors = Object.values(S.actors).filter((a) => discAt(a.visible, t).v !== false).map((a) => ({ a, z: numAt(a.z, t) })).sort((u, v) => u.z - v.z);
      for (const { a, z } of actors) this.drawActor(S, a, t, z);

      props.filter((it) => it.layer !== "back").sort((a, b) => a.p.z - b.p.z).forEach((it) => drawProp(it));

      // экранный слой: субтитры, переходы
      c.setTransform(1, 0, 0, 1, 0, 0);
      if (this.subtitles) this.drawSubtitle(S, t, W, H);
      const fadeIn = S.transition === "fade" ? 0.45 : 0, last = S === this.tl.scenes[this.tl.scenes.length - 1];
      let alpha = 0;
      if (fadeIn && t - S.t0 < fadeIn) alpha = 1 - (t - S.t0) / fadeIn;
      if (t < 0.4 && S.index === 0) alpha = Math.max(alpha, 1 - t / 0.4);
      if (last && S.t1 - t < 0.8) alpha = Math.max(alpha, 1 - (S.t1 - t) / 0.8);
      if (alpha > 0) { c.fillStyle = `rgba(255,255,255,${Math.min(1, alpha)})`; c.fillRect(0, 0, W, H); }
    }

    drawActor(S, a, t, z) {
      const cast = a.cast, h = (cast.h || (cast.type === "alien" ? 5 : 9)) * a.s;
      const x = numAt(a.x, t), y = numAt(a.y, t);
      const pose = discAt(a.pose, t), face = discAt(a.face, t).v, mood = discAt(a.mood, t).v;
      // идёт ли персонаж (x меняется) → включить ходьбу, если он просто стоит
      const moving = a.x.keys.some((k) => t >= k.t0 && t < k.t1 && Math.abs(k.to - k.from) > 0.3);
      let poseName = pose.v;
      const prev = pose.prev, since = pose.since;
      if (moving && poseName === "stand") poseName = "walk";
      const poseK = Math.min(1, (t - since) / 0.25);
      const blinkPh = (t + (a.seed % 37) * 0.1) % 3.7;
      const st = {
        x, y: -y + z, h, t, seed: a.seed,
        pose: poseName, posePrev: prev && poseK < 1 ? prev : null, poseK,
        walkPh: x / (h * 0.32) * Math.PI * (face === "left" ? -1 : 1),
        face: face === "left" ? -1 : face === "right" ? 1 : 0, mood,
        talk: this.talkLevel(S, a.id, t), blink: blinkPh < 0.12,
        emotes: a.emotes.filter((e) => t >= e.t0 && t < e.t1),
      };
      SAM.drawPerson(this.P, st, cast);
    }

    drawSubtitle(S, t, W, H) {
      const l = this.tl.lines.find((l) => t >= l.t0 && t < l.t1 + 0.25); if (!l) return;
      const c = this.c, size = Math.round(H * 0.038);
      c.font = `${size}px ${SAM.FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
      const words = l.text.split(" "), rows = []; let row = "";
      for (const w of words) { const tryRow = row ? row + " " + w : w; if (c.measureText(tryRow).width > W * 0.8 && row) { rows.push(row); row = w; } else row = tryRow; }
      rows.push(row);
      rows.forEach((r, i) => {
        const y = H * 0.93 - (rows.length - 1 - i) * size * 1.2;
        c.lineWidth = size * 0.22; c.strokeStyle = SAM.PAPER; c.lineJoin = "round"; c.strokeText(r, W / 2, y);
        c.fillStyle = l.who === "narrator" ? "#444" : SAM.INK; c.fillText(r, W / 2, y);
      });
    }
  }

  SAM.Stage = Stage;
})();
