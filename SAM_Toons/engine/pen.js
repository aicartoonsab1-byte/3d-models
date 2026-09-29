// SAM_Toons · перо: тонкая чёрная линия «от руки» на белом листе.
// Все размеры — в мировых единицах: ширина кадра при zoom=1 равна 100 единицам.
// Внутри движка ось Y смотрит ВНИЗ (как в canvas): земля — y=0, всё, что выше земли, — отрицательные y.
// Линии «кипят»: каждые 1/8 секунды дрожание меняется (3 варианта по кругу), как у рисованных мультов.
(function () {
  const SAM = (window.SAM = window.SAM || {});
  const INK = "#161616", PAPER = "#ffffff";
  const FONT = "'Comic Neue','Comic Sans MS','Segoe Print','Neucha','Marker Felt',sans-serif";

  function rng(seed) {
    let s = (Math.floor(Math.abs(seed)) % 2147483646) + 1;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function hash(str) {
    let h = 2166136261; str = String(str);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  class Pen {
    constructor(ctx) { this.c = ctx; this.boil = 0; this.lw = 0.16; this.amp = 0.07; }
    // генератор дрожания для объекта: одинаков в пределах кадра «кипения»
    r(seed) { return rng(seed * 31 + this.boil * 7919 + 1); }
    width(k = 1) { this.c.lineWidth = this.lw * k; return this; }

    densify(pts, closed, step = 0.8) {
      const out = [], n = pts.length, m = closed ? n : n - 1;
      for (let i = 0; i < m; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
        const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
        for (let j = 0; j < k; j++) out.push([x0 + (x1 - x0) * j / k, y0 + (y1 - y0) * j / k]);
      }
      if (!closed) out.push(pts[n - 1]);
      return out;
    }
    // путь через точки с дрожанием и сглаживанием (beginPath внутри)
    trace(pts, closed, seed = 1, amp = this.amp, step = 0.8) {
      const c = this.c, r = this.r(seed), d = this.densify(pts, closed, step)
        .map(([x, y]) => [x + (r() - 0.5) * 2 * amp, y + (r() - 0.5) * 2 * amp]);
      c.beginPath();
      if (d.length < 3) { c.moveTo(d[0][0], d[0][1]); d.slice(1).forEach(([x, y]) => c.lineTo(x, y)); if (closed) c.closePath(); return; }
      if (closed) {
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let m0 = mid(d[d.length - 1], d[0]); c.moveTo(m0[0], m0[1]);
        for (let i = 0; i < d.length; i++) { const p = d[i], m = mid(p, d[(i + 1) % d.length]); c.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
        c.closePath();
      } else {
        c.moveTo(d[0][0], d[0][1]);
        for (let i = 1; i < d.length - 1; i++) { const p = d[i], q = d[i + 1]; c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
        c.lineTo(d[d.length - 1][0], d[d.length - 1][1]);
      }
    }
    // обвести фигуру; fill: true (белая заливка под контуром) | цвет | false
    shape(pts, { closed = true, seed = 1, fill = true, amp, lw = 1, step } = {}) {
      const c = this.c;
      this.trace(pts, closed, seed, amp, step);
      if (fill) { c.fillStyle = fill === true ? PAPER : fill; c.fill(); }
      c.strokeStyle = INK; c.lineWidth = this.lw * lw; c.stroke();
    }
    line(x0, y0, x1, y1, seed = 1, lw = 1) { this.shape([[x0, y0], [x1, y1]], { closed: false, seed, fill: false, lw }); }
    poly(pts, seed = 1, lw = 1) { this.shape(pts, { closed: false, seed, fill: false, lw }); }
    ellipsePts(cx, cy, rx, ry, n, seed = 1, rough = 0) {
      const r = rng(seed), out = [];
      n = n || Math.max(10, Math.round((rx + ry) * 3));
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 1 + (r() - 0.5) * rough * 2; out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
      return out;
    }
    circle(cx, cy, rad, seed = 1, opt = {}) { this.shape(this.ellipsePts(cx, cy, rad, rad, 0, seed), { seed, step: 99, ...opt }); }
    ellipse(cx, cy, rx, ry, seed = 1, opt = {}) { this.shape(this.ellipsePts(cx, cy, rx, ry, 0, seed), { seed, step: 99, ...opt }); }
    rect(x, y, w, h, seed = 1, opt = {}) { this.shape([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { seed, ...opt }); }
    // сплошная точка/пятно (глаза, заклёпки)
    dot(x, y, rx, ry = rx) { const c = this.c; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = INK; c.fill(); }
    // «кудрявый» контур: цепочка выпуклых дуг вдоль ломаной (облака, кроны, кусты)
    bumps(pts, { seed = 1, bulge = 0.9, fill = true, closed = true, lw = 1 } = {}) {
      const c = this.c, r = this.r(seed), n = pts.length, m = closed ? n : n - 1;
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 0; i < m; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = (y1 - y0) / len, ny = -(x1 - x0) / len, b = len * bulge * (0.45 + r() * 0.2);
        c.quadraticCurveTo(mx + nx * b, my + ny * b, x1 + (r() - 0.5) * 0.08, y1 + (r() - 0.5) * 0.08);
      }
      if (closed) c.closePath();
      if (fill) { c.fillStyle = fill === true ? PAPER : fill; c.fill(); }
      c.strokeStyle = INK; c.lineWidth = this.lw * lw; c.stroke();
    }
    // «трубки» с контуром — из них собраны тела человечков: сначала все чёрные, потом все белые,
    // поэтому контуры соседних трубок сливаются в один силуэт. items: [{p: [[x,y],...], w}]
    tubes(items) {
      const c = this.c; c.lineCap = "round"; c.lineJoin = "round";
      for (const pass of [0, 1]) for (const s of items) {
        c.strokeStyle = pass ? PAPER : INK; c.lineWidth = s.w + (pass ? 0 : this.lw * 2);
        c.beginPath(); c.moveTo(s.p[0][0], s.p[0][1]); for (let i = 1; i < s.p.length; i++) c.lineTo(s.p[i][0], s.p[i][1]); c.stroke();
      }
    }
    // текст: size — высота в мировых единицах; outline — буквы контуром (вывески)
    text(str, x, y, size, { align = "center", outline = false, lw = 1, font = FONT, weight = "" } = {}) {
      const c = this.c; c.save(); c.translate(x, y); c.scale(size / 100, size / 100);
      c.font = `${weight} 100px ${font}`; c.textAlign = align; c.textBaseline = "middle";
      if (outline) { c.lineJoin = "round"; c.lineWidth = this.lw * 100 / size * lw * 1.1; c.strokeStyle = INK; c.fillStyle = PAPER; c.strokeText(str, 0, 0); c.fillText(str, 0, 0); }
      else { c.fillStyle = INK; c.fillText(str, 0, 0); }
      c.restore();
    }
  }

  SAM.INK = INK; SAM.PAPER = PAPER; SAM.FONT = FONT;
  SAM.rng = rng; SAM.hash = hash; SAM.Pen = Pen;
  SAM.lerp = (a, b, k) => a + (b - a) * k;
  SAM.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  SAM.ease = {
    linear: (k) => k,
    inout: (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2,
    in: (k) => k * k,
    out: (k) => 1 - (1 - k) * (1 - k),
    back: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
    bounce: (k) => { const n = 7.5625, d = 2.75; if (k < 1 / d) return n * k * k; if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75; if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375; return n * (k -= 2.625 / d) * k + 0.984375; },
  };
})();
