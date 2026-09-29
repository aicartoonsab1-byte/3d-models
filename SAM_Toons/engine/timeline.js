// SAM_Toons · раскладка фильма во времени.
// film.json описывает сцены как последовательность «битов» (реплика + действия), без абсолютных секунд.
// Здесь биты превращаются в дорожки: длительность бита = max(dur, длина реплики + пауза, конец действий).
// Длина реплики берётся из озвучки (build/voice/manifest.json), а если её ещё нет — оценивается по тексту.
(function () {
  const SAM = window.SAM;
  const { lerp, ease } = SAM;

  // ---------------------------------------------------------------- дорожки
  const num = (v0) => ({ v0, keys: [] });
  function numAt(tr, t) {
    let v = tr.v0;
    for (const k of tr.keys) {
      if (t >= k.t1) { v = k.to; continue; }
      if (t >= k.t0) return lerp(k.from, k.to, (ease[k.ease] || ease.inout)((t - k.t0) / Math.max(1e-6, k.t1 - k.t0)));
      break;
    }
    return v;
  }
  function tween(tr, t0, t1, to, e) { tr.keys.push({ t0, t1, from: numAt(tr, t0), to, ease: e || "inout" }); }
  const disc = (v0) => ({ v0, keys: [] });
  function discAt(tr, t) {
    let v = tr.v0, prev = null, since = -1e9;
    for (const k of tr.keys) { if (t < k.t) break; prev = v; v = k.v; since = k.t; }
    return { v, prev, since };
  }
  const setAt = (tr, t, v) => tr.keys.push({ t, v });

  const estimate = (text) => 0.3 + [...String(text)].length / 17;

  function resolve(film, manifest) {
    const cast = film.cast || {}, voiced = (manifest && manifest.lines) || {};
    const lines = [], sfx = [], scenes = [], warnings = [];
    let T = 0;
    (film.scenes || []).forEach((sc, si) => {
      const S = { id: sc.id || `s${si + 1}`, index: si, t0: T, set: sc.set || {}, actors: {}, props: {}, beats: [],
        transition: sc.transition || "cut", shakes: [], talk: {} };
      const cam0 = { x: 50, y: 17, zoom: 1, ...(sc.camera || {}) };
      S.cam = { x: num(cam0.x), y: num(cam0.y), zoom: num(cam0.zoom) };
      for (const [id, a] of Object.entries(sc.actors || {})) {
        if (!cast[id]) warnings.push(`${S.id}: персонаж «${id}» не описан в cast`);
        S.actors[id] = { id, cast: cast[id] || {}, x: num(a.x ?? 50), y: num(a.y ?? 0), z: num(a.z ?? 0), s: a.s || 1,
          pose: disc(a.pose || "stand"), mood: disc(a.mood || "neutral"), face: disc(a.face || "front"),
          visible: disc(a.visible !== false), emotes: [], seed: SAM.hash(id) % 1000 };
      }
      (S.set.props || []).forEach((p, i) => {
        const id = p.id || `${p.type}${i + 1}`, base = { x: 50, y: 0, z: 0, s: 1, ...p, seed: p.seed ?? (SAM.hash(id + S.id) % 997) };
        S.props[id] = { id, type: p.type, base, num: {}, disc: {}, visible: disc(p.visible !== false) };
      });
      const propNum = (pr, key) => pr.num[key] || (pr.num[key] = num(typeof pr.base[key] === "number" ? pr.base[key] : 0));

      let t = T;
      (sc.beats || []).forEach((b, bi) => {
        const lineId = `${S.id}_${bi + 1}`;
        let speech = 0, v = null;
        if (b.say) { v = voiced[lineId]; speech = v && v.text === b.say.text ? v.dur : estimate(b.say.text); if (v && v.text !== b.say.text) v = null; }
        const sayAt = (b.say && b.say.at) || 0;
        const defDur = b.say ? Math.max(1, speech) : 1.2;
        const acts = (b.do || []).map((a) => ({ ...a, at: a.at || 0, dur: a.dur ?? ((a.move || a.by || a.camera || a.set) ? defDur : 0) }));
        const actEnd = acts.reduce((m, a) => Math.max(m, a.at + (a.emote ? 0 : a.dur)), 0);
        // пауза после реплики: в живом диалоге реплики идут почти встык (style.pause, по умолчанию 0.15 с)
        const pause = b.pause ?? (b.say ? ((film.style || {}).pause ?? 0.15) : 0);
        const dur = Math.max(b.dur || 0, b.say ? sayAt + speech + pause : 0, actEnd, 0.4);

        if (b.say) {
          const who = b.say.who, l = { id: lineId, scene: S.id, beat: bi + 1, who, text: b.say.text, mood: b.say.mood, t0: t + sayAt, t1: t + sayAt + speech,
            env: v && v.env, file: v && v.file, estimated: !v };
          lines.push(l); (S.talk[who] = S.talk[who] || []).push(l);
          if (b.say.mood && S.actors[who]) setAt(S.actors[who].mood, t, b.say.mood);
        }
        for (const a of acts) {
          const t0 = t + a.at, t1 = t0 + a.dur;
          if (a.sfx) sfx.push({ t: t0, name: a.sfx, vol: a.vol ?? 1 });
          if (a.camera) {
            if (a.camera === "shake") { S.shakes.push({ t0, t1: t0 + (a.dur || 0.6), amp: a.amp ?? 0.6 }); continue; }
            const cam = { ...a.camera };
            if (cam.on) { const ac = S.actors[cam.on], pr = S.props[cam.on]; if (ac) { cam.x = cam.x ?? numAt(ac.x, t1); cam.y = cam.y ?? numAt(ac.y, t1) + (ac.cast.h || 9) * 0.65 * ac.s - numAt(ac.z, t1); } else if (pr) { cam.x = cam.x ?? numAt(propNum(pr, "x"), t1); cam.y = cam.y ?? numAt(propNum(pr, "y"), t1); } }
            for (const k of ["x", "y", "zoom"]) if (cam[k] != null) (a.dur ? tween(S.cam[k], t0, t1, cam[k], a.ease) : tween(S.cam[k], t0, t0 + 0.001, cam[k], "linear"));
            continue;
          }
          if (a.who) {
            const ac = S.actors[a.who]; if (!ac) { warnings.push(`${lineId}: «${a.who}» нет в сцене`); continue; }
            if (a.pose) setAt(ac.pose, t0, a.pose);
            if (a.mood) setAt(ac.mood, t0, a.mood);
            if (a.face) setAt(ac.face, t0, a.face);
            if (a.visible != null) setAt(ac.visible, t0, a.visible);
            if (a.emote) ac.emotes.push({ kind: a.emote, t0, t1: t0 + (a.dur || 1.6) });
            const mv = a.move || (a.by && Object.fromEntries(Object.entries(a.by).map(([k, d]) => [k, numAt(ac[k], t0) + d])));
            if (mv) {
              if (mv.x != null && !a.face && !a.keepFace) { const dx = mv.x - numAt(ac.x, t0); if (Math.abs(dx) > 0.5) setAt(ac.face, t0, dx < 0 ? "left" : "right"); }
              for (const k of ["x", "y", "z"]) if (mv[k] != null) tween(ac[k], t0, t1, mv[k], a.ease || (k === "x" ? "linear" : "inout"));
            }
            continue;
          }
          if (a.prop) {
            const pr = S.props[a.prop]; if (!pr) { warnings.push(`${lineId}: предмета «${a.prop}» нет в сцене`); continue; }
            if (a.visible != null) setAt(pr.visible, t0, a.visible);
            const mv = a.move || (a.by && Object.fromEntries(Object.entries(a.by).map(([k, d]) => [k, numAt(propNum(pr, k), t0) + d])));
            if (mv) for (const [k, val] of Object.entries(mv)) tween(propNum(pr, k), t0, t1, val, a.ease);
            if (a.set) for (const [k, val] of Object.entries(a.set)) {
              if (typeof val === "number") tween(propNum(pr, k), t0, a.dur ? t1 : t0 + 0.3, val, a.ease);
              else setAt(pr.disc[k] || (pr.disc[k] = disc(pr.base[k])), t0, val);
            }
          }
        }
        S.beats.push({ i: bi + 1, id: lineId, t0: t, t1: t + dur, say: b.say, do: b.do || [], note: b.note });
        t += dur;
      });
      S.t1 = t; T = t; scenes.push(S);
    });
    return { title: film.title, fps: film.fps || 25, scenes, lines, sfx, duration: T, warnings };
  }

  SAM.track = { num, numAt, disc, discAt, tween };
  SAM.resolve = resolve;
  SAM.estimateSpeech = estimate;
})();
