/* Eikon — the nave's atmosphere: light falling from a stained-glass lancet, incense smoke
   that brightens where it crosses the beams, dust motes, and flickering candlelight.
   Everything is drawn on one fixed canvas behind the page. */
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.getElementById("nave");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;

  // Glass colours: lapis, ruby, amber, emerald, rose.
  const GLASS = [[58, 96, 196], [168, 34, 40], [236, 170, 64], [42, 128, 92], [190, 90, 140], [240, 214, 140]];

  /* ---------- stained-glass window (drawn once to its own canvas) ---------- */
  function drawWindow(el) {
    const w = 180, h = 420;
    const c = el; c.width = w * 2; c.height = h * 2;
    const g = c.getContext("2d"); g.scale(2, 2);
    const arch = new Path2D();
    arch.moveTo(8, h - 6); arch.lineTo(8, 96);
    arch.quadraticCurveTo(8, 10, w / 2, 4);
    arch.quadraticCurveTo(w - 8, 10, w - 8, 96);
    arch.lineTo(w - 8, h - 6); arch.closePath();
    g.save(); g.clip(arch);
    // Voronoi panes: a lapis field, a ruby border, and an amber cross with a rose at the crossing.
    const seeds = [];
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const cx = w / 2, cy = 150;
    for (let i = 0; i < 90; i++) {
      const x = 8 + rnd() * (w - 16), y = 4 + rnd() * (h - 8);
      const edge = x < 26 || x > w - 26;
      seeds.push([x, y, edge ? (rnd() < 0.7 ? 1 : 5) : (rnd() < 0.72 ? 0 : rnd() < 0.5 ? 3 : 4), rnd()]);
    }
    for (let y = 46; y < 360; y += 18) seeds.push([cx + (rnd() - 0.5) * 4, y, 2, rnd()]);
    for (let x = 38; x < w - 34; x += 18) seeds.push([x, cy + (rnd() - 0.5) * 4, 2, rnd()]);
    for (let a = 0; a < 6.28; a += 0.785) seeds.push([cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 5, rnd()]);
    seeds.push([cx, cy, 5, 1]);
    const img = g.createImageData(w * 2, h * 2);
    for (let py = 0; py < h * 2; py++) {
      for (let px = 0; px < w * 2; px++) {
        const x = px / 2, y = py / 2;
        let best = 1e9, second = 1e9, bi = 0;
        for (let i = 0; i < seeds.length; i++) {
          const dx = x - seeds[i][0], dy = y - seeds[i][1], d = dx * dx + dy * dy;
          if (d < best) { second = best; best = d; bi = i; } else if (d < second) second = d;
        }
        const edge = Math.sqrt(second) - Math.sqrt(best);
        const o = (py * w * 2 + px) * 4;
        if (edge < 1.6) { img.data[o] = 16; img.data[o + 1] = 11; img.data[o + 2] = 7; img.data[o + 3] = 255; continue; }
        const sd = seeds[bi], col = GLASS[sd[2]];
        // Each pane has its own density; light pools toward its centre; a little seedy grain.
        const pane = 0.62 + sd[3] * 0.5;
        const pool = 1.18 - Math.min(0.5, Math.sqrt(best) / 26);
        const grainV = 1 + (Math.random() - 0.5) * 0.16;
        const glow = 1.1 - Math.min(1, Math.hypot(x - cx, y - h * 0.4) / (h * 0.7)) * 0.4;
        const k = pane * pool * grainV * glow;
        img.data[o] = Math.min(255, col[0] * k + 12);
        img.data[o + 1] = Math.min(255, col[1] * k + 8);
        img.data[o + 2] = Math.min(255, col[2] * k + 4);
        img.data[o + 3] = 255;
      }
    }
    g.restore();
    const tmp = document.createElement("canvas"); tmp.width = w * 2; tmp.height = h * 2;
    tmp.getContext("2d").putImageData(img, 0, 0);
    g.save(); g.clip(arch); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(tmp, 0, 0); g.restore();
    // Lead frame and mullions.
    g.lineWidth = 5; g.strokeStyle = "#140d08"; g.stroke(arch);
    g.lineWidth = 2.5; g.strokeStyle = "rgba(14,9,6,.9)";
    for (let y = 110; y < h; y += 90) { g.beginPath(); g.moveTo(8, y); g.lineTo(w - 8, y); g.stroke(); }
    g.lineWidth = 1.2; g.strokeStyle = "rgba(255,220,150,.25)"; g.stroke(arch);
  }

  /* ---------- smoke sprites ---------- */
  function makePuff(size, seed) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,.55)");
    grad.addColorStop(0.45, "rgba(255,255,255,.18)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    // Wisps: carve with offset soft circles for an irregular edge.
    g.globalCompositeOperation = "destination-out";
    let s = seed * 9301 + 49297;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 9; i++) {
      const x = r() * size, y = r() * size, rr = size * (0.12 + r() * 0.22);
      const gg = g.createRadialGradient(x, y, 0, x, y, rr);
      gg.addColorStop(0, "rgba(0,0,0,.5)"); gg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gg; g.fillRect(0, 0, size, size);
    }
    return c;
  }
  const puffs = [0, 1, 2, 3, 4].map((i) => makePuff(256, i + 1));

  const smoke = [], motes = [];
  // Censer positions (fractions of the viewport), smoke rises from these.
  const sources = [[0.18, 1.05], [0.62, 1.08], [0.9, 1.04]];

  function spawnSmoke(initial) {
    const src = sources[Math.floor(Math.random() * sources.length)];
    smoke.push({
      x: src[0] * W + (Math.random() - 0.5) * 60,
      y: initial ? Math.random() * H : src[1] * H,
      vx: (Math.random() - 0.5) * 0.15, vy: -(0.25 + Math.random() * 0.35),
      size: 120 + Math.random() * 160, grow: 0.12 + Math.random() * 0.2,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.004,
      life: 0, max: 1400 + Math.random() * 900, sprite: puffs[Math.floor(Math.random() * puffs.length)],
      phase: Math.random() * 100,
    });
  }

  /* ---------- light beams ---------- */
  function beams(t) {
    // Light source: the window, top right. Beams fall toward lower left.
    const sx = W * 0.86, sy = -H * 0.05;
    const list = [];
    const angles = [2.18, 2.3, 2.42, 2.55];
    angles.forEach((a, i) => {
      const spread = 0.05 + i * 0.008;
      const len = Math.hypot(W, H) * 1.3;
      // The beams drift side to side together, slowly, with a little independent waver.
      const sway = Math.sin(t * 0.00011) * 0.05 + Math.sin(t * 0.00027 + i * 1.3) * 0.012;
      const a1 = a - spread + sway, a2 = a + spread + sway;
      list.push({
        poly: [[sx - 30 + i * 18, sy], [sx + 10 + i * 18, sy],
               [sx + Math.cos(a2) * len, sy + Math.sin(a2) * len], [sx + Math.cos(a1) * len, sy + Math.sin(a1) * len]],
        color: GLASS[[2, 0, 5, 1][i]],
        alpha: 0.21 + 0.05 * Math.sin(t * 0.0004 + i * 1.7),
      });
    });
    return list;
  }
  function beamPath(b) {
    const p = new Path2D();
    p.moveTo(b.poly[0][0], b.poly[0][1]);
    for (let i = 1; i < 4; i++) p.lineTo(b.poly[i][0], b.poly[i][1]);
    p.closePath(); return p;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    sizeLayers();
  }

  // Offscreen layers: light at quarter resolution (upscaling softens the beam edges),
  // smoke at half resolution, then the smoke is masked by the light so it glows inside the beams.
  const light = document.createElement("canvas"), lctx = light.getContext("2d");
  const fog = document.createElement("canvas"), fctx = fog.getContext("2d");
  const lit = document.createElement("canvas"), ictx = lit.getContext("2d");
  const LS = 0.25, FS = 0.5;
  function sizeLayers() {
    light.width = Math.ceil(W * LS); light.height = Math.ceil(H * LS);
    fog.width = lit.width = Math.ceil(W * FS); fog.height = lit.height = Math.ceil(H * FS);
  }
  const WARM = [246, 222, 176];
  const tint = (c, k) => c.map((v, i) => Math.round(v * k + WARM[i] * (1 - k)));

  function frame(t) {
    const bs = beams(t);

    // 1. Light shafts.
    lctx.setTransform(LS, 0, 0, LS, 0, 0);
    lctx.clearRect(0, 0, W, H);
    lctx.filter = "blur(6px)";
    bs.forEach((b) => {
      const [x0, y0] = b.poly[0], [x1, y1] = b.poly[2];
      const g = lctx.createLinearGradient(x0, y0, x1, y1);
      const [r, gg, bb] = tint(b.color, 0.35);
      g.addColorStop(0, `rgba(${r},${gg},${bb},${b.alpha * 2.6})`);
      g.addColorStop(0.55, `rgba(${r},${gg},${bb},${b.alpha})`);
      g.addColorStop(1, `rgba(${r},${gg},${bb},0)`);
      lctx.fillStyle = g; lctx.fill(beamPath(b));
    });
    lctx.filter = "none";

    // 2. Smoke and motes.
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      if (!reduce) {
        p.life++;
        p.x += p.vx + Math.sin((p.y + p.phase * 10) * 0.006 + t * 0.0003) * 0.35;
        p.y += p.vy; p.size += p.grow; p.rot += p.vr;
      }
      if (p.life > p.max || p.y < -p.size) smoke.splice(i, 1);
    }
    fctx.setTransform(FS, 0, 0, FS, 0, 0);
    fctx.clearRect(0, 0, W, H);
    smoke.forEach((p) => {
      const fade = Math.min(1, p.life / 120) * (1 - p.life / p.max);
      fctx.globalAlpha = Math.max(0, fade);
      fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot);
      fctx.drawImage(p.sprite, -p.size / 2, -p.size / 2, p.size, p.size);
      fctx.restore();
    });
    fctx.globalAlpha = 1;

    // 3. Smoke lit by the shafts: keep smoke only where there is light.
    ictx.globalCompositeOperation = "copy";
    ictx.drawImage(fog, 0, 0);
    ictx.globalCompositeOperation = "destination-in";
    ictx.drawImage(light, 0, 0, lit.width, lit.height);
    ictx.drawImage(light, 0, 0, lit.width, lit.height);
    ictx.globalCompositeOperation = "source-over";

    // 4. Composite.
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(light, 0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.06; ctx.drawImage(fog, 0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1; ctx.drawImage(lit, 0, 0, W, H); ctx.drawImage(lit, 0, 0, W, H);

    // 5. Dust: tiny motes drawn sharp, visible only inside the beams and dimming as the light falls off.
    const sx = W * 0.86, sy = -H * 0.05, reach = Math.hypot(W, H) * 1.15;
    ctx.save();
    const clip = new Path2D();
    bs.forEach((b) => clip.addPath(beamPath(b)));
    ctx.clip(clip);
    motes.forEach((m) => {
      if (!reduce) {
        m.x += m.vx + Math.sin(t * 0.0004 + m.p) * 0.06; m.y += m.vy;
        if (m.y > H + 4) m.y = -4; if (m.x < -4) m.x = W + 4; if (m.x > W + 4) m.x = -4;
      }
      const fall = 1 - Math.min(1, Math.hypot(m.x - sx, m.y - sy) / reach);
      if (fall <= 0) return;
      const tw = Math.pow(Math.max(0, Math.sin(t * m.s + m.p)), 3);
      const a = (0.22 + 0.78 * tw) * Math.pow(fall, 0.6);
      if (a < 0.03) return;
      ctx.fillStyle = `rgba(255,242,210,${a.toFixed(3)})`;
      ctx.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
    });
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";

    if (!reduce && smoke.length < 46 && Math.random() < 0.08) spawnSmoke(false);
    if (!reduce) requestAnimationFrame(frame);
  }

  /* ---------- candle flicker: drives CSS variables on <html> ---------- */
  function flicker() {
    let a = 1, b = 1;
    const root = document.documentElement;
    function step() {
      a += (0.82 + Math.random() * 0.3 - a) * 0.18;
      b += (0.8 + Math.random() * 0.32 - b) * 0.15;
      root.style.setProperty("--flicker-a", a.toFixed(3));
      root.style.setProperty("--flicker-b", b.toFixed(3));
      setTimeout(step, 70 + Math.random() * 90);
    }
    if (!reduce) step();
  }

  function init() {
    resize();
    window.addEventListener("resize", resize);
    for (let i = 0; i < 26; i++) spawnSmoke(true);
    smoke.forEach((p) => (p.life = Math.random() * p.max * 0.6));
    // Scale the dust to the screen: roughly one mote per 2,000 square pixels, within limits.
    const count = Math.max(250, Math.min(900, Math.round((W * H) / 2000)));
    for (let i = 0; i < count; i++) motes.push({ x: Math.random() * W, y: Math.random() * H, r: 0.45 + Math.random() * 0.75, vx: (Math.random() - 0.5) * 0.05, vy: 0.03 + Math.random() * 0.09, p: Math.random() * 100, s: 0.0015 + Math.random() * 0.005 });
    document.querySelectorAll("canvas.lancet").forEach(drawWindow);
    requestAnimationFrame(frame);
    flicker();
  }
  window.EikonAtmosphere = { init, drawWindow };
})();
