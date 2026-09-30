// SAM_Toons · лаборатория стилей: общие помощники. Страница задаёт window.DRAW(ctx, t) и вызывает LAB.start().
const Q = new URLSearchParams(location.search);
const W = +Q.get("w") || 1280, H = +Q.get("h") || 720;
const LAB = (window.LAB = { ready: false });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const twos = (t) => Math.floor(t * 12.5) / 12.5;          // рисунок меняется через кадр
const frameNo = (t) => Math.floor(t * 12.5);

function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

// зерно печати: крапинки светлые и тёмные, несколько вариантов — чередуются «через кадр» (кипение фактуры)
function grainLayers(n, density, dark, light, seed) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const c = canvas(W, H), x = c.getContext("2d"), img = x.createImageData(W, H), r = rng(seed + k * 101);
    for (let i = 0; i < W * H; i++) {
      const v = r(), j = i * 4;
      if (v < density) { img.data[j] = dark[0]; img.data[j + 1] = dark[1]; img.data[j + 2] = dark[2]; img.data[j + 3] = dark[3]; }
      else if (v > 1 - density) { img.data[j] = light[0]; img.data[j + 1] = light[1]; img.data[j + 2] = light[2]; img.data[j + 3] = light[3]; }
    }
    x.putImageData(img, 0, 0); out.push(c);
  }
  return out;
}

LAB.start = function () {
  const c = canvas(W, H); const host = document.body || document.documentElement; host.style.margin = "0"; host.appendChild(c);
  const ctx = c.getContext("2d");
  LAB.frame = (t) => { ctx.save(); ctx.clearRect(0, 0, W, H); window.DRAW(ctx, t); ctx.restore(); return c.toDataURL("image/jpeg", 0.92); };
  LAB.ready = true;
};
