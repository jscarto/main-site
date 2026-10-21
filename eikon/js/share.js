/* Eikon — shareable cards, drawn on a canvas: gilded frames on a candle-lit ground, with a rubric
   naming what the card proclaims. Every date and commemoration on a card comes from the calendar
   and the catalog; nothing is typed by the viewer, so a card cannot misstate a saint's day. */
(function () {
  const C = window.EikonCalendar;
  const dlg = document.getElementById("share-dialog");
  const cv = document.getElementById("share-canvas");
  const ctx = cv.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const iso = (d) => d.toISOString().slice(0, 10);
  const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return C.utc(y, m - 1, d); };
  const MAX_ICONS = 3;

  // Story cards keep their content clear of the top and bottom bands where Instagram, Facebook
  // and TikTok draw their own controls (profile row, reply bar, captions).
  const SHAPES = {
    portrait: { w: 1080, h: 1350, top: 0, bottom: 0 },
    square: { w: 1080, h: 1080, top: 0, bottom: 0 },
    story: { w: 1080, h: 1920, top: 220, bottom: 380 },
  };
  const KIND_LABELS = { day: "Of the day", fast: "Fast of the day", patron: "My patron saint", icon: "The icon alone" };
  const PATRON_KINDS = ["saint", "theotokos", "angel"];

  let cur = null;
  const imgCache = {};
  const loadImg = (src) => imgCache[src] || (imgCache[src] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }));

  const grain = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 22; }
    g.putImageData(d, 0, 0); return c;
  })();

  /* ---------- what the card says ---------- */
  function dayText(o) {
    const app = window.EikonApp;
    const info = C.dayInfo(o.date, o.style);
    const icons = o.selected.map((id) => app.BY_ID[id]);
    const comms = icons.map((i) => app.commemorationForIcon(i, info)).filter(Boolean);
    const names = [...new Set(comms.map((c) => c.name))];
    const dateLine = `${info.weekday}, ${C.formatDate(o.date, { year: true })}${o.style === "old" ? " (Old Calendar)" : ""}`;
    if (o.kind === "fast") {
      return { rubric: "Fast of the Day", head: [info.fast.note || info.fast.label], sub: `${info.fast.label} · ${dateLine}`, foot: names.join(" · ") };
    }
    // A feast of the Lord, the Theotokos, the Cross or the angels is a "feast"; anyone else is a saint.
    const feasty = comms.map((c) => ["great", "pascha", "holy"].includes(c.rank) || c.movable || /\b(Lord|Christ|Theotokos|Mother of God|Icon|Cross|Synaxis|Nativity|Entry|Meeting|Annunciation|Dormition|Transfiguration|Pentecost|Trinity|Indiction)\b/.test(c.name));
    const rubric = feasty.every(Boolean) ? (names.length > 1 ? "Feasts of the Day" : "Feast of the Day")
      : feasty.some(Boolean) ? "Kept This Day"
      : (names.length > 1 ? "Saints of the Day" : "Saint of the Day");
    return { rubric, head: names, sub: dateLine, foot: icons.map((i) => i.title).join(" · ") };
  }
  function texts(o) {
    const icon = window.EikonApp.BY_ID[o.selected[0]];
    if (o.kind === "day" || o.kind === "fast") return dayText(o);
    if (o.kind === "patron") {
      const fixed = icon.days.filter((d) => !d.d.startsWith("pascha")).slice(0, 2).map((d) => C.formatKey(d.d));
      return { rubric: "My Patron Saint", head: [icon.cardName], sub: fixed.length ? "Commemorated " + fixed.join(" and ") : "Pray to God for us", foot: icon.title };
    }
    return { rubric: "From the Library", head: [icon.title], sub: `${icon.date} · ${icon.home.name}`, foot: icon.school };
  }

  /* ---------- drawing ---------- */
  function wrap(text, maxW, font) {
    ctx.font = font;
    const words = text.split(/\s+/), lines = [];
    let line = "";
    words.forEach((w) => { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    return lines;
  }
  function spaced(text, x, y, spacing) {
    const chars = [...text], widths = chars.map((c) => ctx.measureText(c).width);
    let cx = x - (widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1)) / 2;
    ctx.textAlign = "left";
    chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
    ctx.textAlign = "center";
  }
  function goldGradient(x0, y0, x1, y1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    [[0, "#6b4c18"], [0.18, "#f4dc94"], [0.36, "#a37a2c"], [0.52, "#f1d27e"], [0.7, "#7d5a1d"], [0.86, "#c9a24a"], [1, "#5a3e12"]].forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  function guilloche(x0, x1, y, amp) {
    ctx.save(); ctx.strokeStyle = "rgba(201,162,74,.85)"; ctx.lineWidth = 2;
    [1, -1].forEach((s) => {
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 2) { const yy = y + s * amp * Math.sin(((x - x0) / 44) * Math.PI * 2); x === x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.stroke();
    });
    ctx.fillStyle = "#b23a22";
    for (let x = x0 + 11; x < x1; x += 22) { ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }
  function cross(x, y, s) {
    ctx.save(); ctx.strokeStyle = "#e9c873"; ctx.lineWidth = s * 0.09; ctx.lineCap = "round"; ctx.beginPath();
    ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x, y + s * 0.5);
    ctx.moveTo(x - s * 0.18, y - s * 0.38); ctx.lineTo(x + s * 0.18, y - s * 0.38);
    ctx.moveTo(x - s * 0.36, y - s * 0.18); ctx.lineTo(x + s * 0.36, y - s * 0.18);
    ctx.moveTo(x - s * 0.18, y + s * 0.18); ctx.lineTo(x + s * 0.18, y + s * 0.3);
    ctx.stroke(); ctx.restore();
  }
  function kiot(img, x, y, w, h) {
    const pad = Math.max(12, Math.round(w * 0.045));
    ctx.save(); ctx.shadowColor = "rgba(255,180,80,.32)"; ctx.shadowBlur = 80;
    ctx.fillStyle = "#000"; ctx.fillRect(x - pad, y - pad, w + 2 * pad, h + 2 * pad); ctx.restore();
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 36; ctx.shadowOffsetY = 18;
    ctx.fillStyle = goldGradient(x - pad, y - pad, x + w + pad, y + h + pad);
    ctx.fillRect(x - pad, y - pad, w + 2 * pad, h + 2 * pad); ctx.restore();
    ctx.strokeStyle = "rgba(255,240,190,.6)"; ctx.lineWidth = 1.5; ctx.strokeRect(x - pad + 1, y - pad + 1, w + 2 * pad - 2, h + 2 * pad - 2);
    ctx.strokeStyle = "rgba(90,60,18,.85)"; ctx.lineWidth = 4; ctx.strokeRect(x - pad + 5, y - pad + 5, w + 2 * pad - 10, h + 2 * pad - 10);
    ctx.strokeStyle = "rgba(178,58,34,.9)"; ctx.lineWidth = 2.5; ctx.strokeRect(x - pad * 0.4, y - pad * 0.4, w + pad * 0.8, h + pad * 0.8);
    ctx.drawImage(img, x, y, w, h);
    ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  }

  // A soft shaft of light, drawn from a gradient texture (no canvas filters, so Safari matches).
  let shaftTex = null;
  function shaft(x, y, angle, len, w0, w1, alpha) {
    if (!shaftTex) {
      const w = 64, h = 256; shaftTex = document.createElement("canvas"); shaftTex.width = w; shaftTex.height = h;
      const g = shaftTex.getContext("2d"), img = g.createImageData(w, h);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const u = (xx - (w - 1) / 2) / (w / 2), t = yy / (h - 1), o = (yy * w + xx) * 4;
        img.data[o] = 255; img.data[o + 1] = 226; img.data[o + 2] = 170;
        img.data[o + 3] = Math.round(255 * Math.exp(-u * u * 3) * Math.pow(1 - t, 1.4));
      }
      g.putImageData(img, 0, 0);
    }
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.rotate(angle - Math.PI / 2);
    const N = 8, th = shaftTex.height / N;
    for (let k = 0; k < N; k++) {
      const w = w0 + (w1 - w0) * ((k + 0.5) / N);
      ctx.drawImage(shaftTex, 0, k * th, shaftTex.width, th, -w / 2, (k * len) / N - 1, w, len / N + 2);
    }
    ctx.restore();
  }
  function gilt(text, x, y, size) {
    const g = ctx.createLinearGradient(0, y - size * 0.85, 0, y + size * 0.1);
    g.addColorStop(0, "#fff6d8"); g.addColorStop(0.3, "#f4dc94"); g.addColorStop(0.6, "#dcb766"); g.addColorStop(0.82, "#c9a24a"); g.addColorStop(1, "#ecd08a");
    ctx.fillStyle = g; ctx.fillText(text, x, y);
  }
  // Text that stays legible over a photograph: a soft dark halo, then the fill.
  function shadowed(fn) {
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.9)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 2; fn(); ctx.restore();
  }

  async function draw() {
    const o = cur; if (!o || !o.selected.length) return;
    const S = SHAPES[o.shape], W = S.w, H = S.h;
    cv.width = W; cv.height = H;
    await Promise.all([document.fonts.load('700 80px "Cormorant Unicase"'), document.fonts.load('italic 40px "EB Garamond"'), document.fonts.load('30px "Marcellus SC"')]).catch(() => {});
    const icons = o.selected.map((id) => window.EikonApp.BY_ID[id]);
    const [bg, ...imgs] = await Promise.all([loadImg("assets/textures/iconostasis.jpg"), ...icons.map((i) => loadImg(i.image))]);
    if (cur !== o) return;
    const t = texts(o);

    // 1. The church: the iconostasis photograph, cropped to fill, centred on the royal doors.
    const scale = Math.max(W / bg.width, H / bg.height) * 1.08;
    const bw = bg.width * scale, bh = bg.height * scale;
    ctx.drawImage(bg, W / 2 - bw * 0.485, H * 0.56 - bh * 0.62, bw, bh);
    // Darken, then a heavy vignette so the edges fall away into shadow.
    ctx.fillStyle = "rgba(10,6,3,.3)"; ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(W / 2, H * 0.47, Math.min(W, H) * 0.18, W / 2, H * 0.5, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.6, "rgba(4,2,1,.55)"); g.addColorStop(1, "rgba(2,1,0,.94)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 2. Light falling from a high window, and candle warmth behind the icon.
    shaft(W * 0.92, -H * 0.04, 2.2, Math.hypot(W, H) * 1.05, W * 0.08, W * 0.36, 0.22);
    shaft(W * 0.98, -H * 0.02, 2.32, Math.hypot(W, H) * 0.95, W * 0.05, W * 0.24, 0.14);
    g = ctx.createRadialGradient(W / 2, H * 0.48, 10, W / 2, H * 0.48, Math.min(W, H) * 0.55);
    g.addColorStop(0, "rgba(255,190,110,.28)"); g.addColorStop(1, "rgba(255,190,110,0)");
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.fillStyle = ctx.createPattern(grain, "repeat"); ctx.fillRect(0, 0, W, H);

    // The picture fades to black toward the top and bottom edges, so text sits on shadow.
    g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(2,1,0,.96)"); g.addColorStop(0.24, "rgba(2,1,0,.45)"); g.addColorStop(0.42, "rgba(2,1,0,0)");
    g.addColorStop(0.58, "rgba(2,1,0,0)"); g.addColorStop(0.74, "rgba(2,1,0,.6)"); g.addColorStop(1, "rgba(2,1,0,.97)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const top = S.top, bottom = H - S.bottom, story = o.shape === "story";
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";

    // Layout, from the bottom up: the Eikon mark, the foot line, the headline; then the icon above.
    // Stories drop the repeated title line and use a smaller mark, to give the icon more height.
    const logoY = bottom - (story ? 52 : 64), footY = logoY - (story ? 96 : 128), headBottom = story ? footY - 22 : footY - 58;
    const rubricSize = story ? 64 : 58, rubricY = top + 40 + rubricSize, dateY = rubricY + 58;
    // Long date or location lines wrap rather than being cut off.
    ctx.font = 'italic 42px "EB Garamond", Georgia, serif';
    // Prefer to break at the " · " between date and place, so neither is split mid-name.
    let subLines = wrap(t.sub, W - 140, ctx.font);
    if (subLines.length > 1 && t.sub.includes(" · ")) subLines = t.sub.split(" · ").flatMap((part) => wrap(part, W - 140, ctx.font));
    subLines = subLines.slice(0, 3);
    ctx.font = 'italic 36px "EB Garamond", Georgia, serif';
    const footLines = story ? [] : wrap(t.foot || "", W - 140, ctx.font).slice(0, 2);
    const imgTop = dateY + (subLines.length - 1) * 50 + 44, gap = 44, ars = imgs.map((im) => im.width / im.height);
    const many = t.head.length > 1, maxLines = many ? 5 : (story ? 4 : 3);
    // Fit the headline to a width: start large and step down until every name fits.
    function fitHead(width) {
      let size = many ? 58 : (o.shape === "square" ? 72 : 82), font, lines;
      for (;;) {
        font = `700 ${size}px "Cormorant Unicase", Georgia, serif`;
        lines = [];
        t.head.forEach((hh, k) => { lines = lines.concat(wrap(hh, width, font).map((l, j) => ({ l, gap: k > 0 && j === 0 ? 1 : 0 }))); });
        if (lines.length <= maxLines || size <= 44) break;
        size -= 6;
      }
      lines = lines.slice(0, maxLines);
      const lineH = Math.round(size * 1.05);
      const headTop = headBottom - (lines.length - 1) * lineH - lines.filter((x) => x.gap).length * 14;
      return { size, font, lines, lineH, headTop };
    }
    const rowWidth = (hh) => ars.reduce((a, r) => a + r * hh, 0) + gap * (imgs.length - 1);
    let head, h;
    if (story) {
      // Stories are tall: grow the icon as far as it will go, and keep the text no wider than it
      // (but never narrower than a comfortable column).
      let lo = 200, hi = bottom - imgTop;
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        const w = Math.min(rowWidth(mid), W - 120);
        const hd = fitHead(Math.max(w, 480) - 20);
        if (rowWidth(mid) <= W - 120 && imgTop + mid + hd.size + 24 <= hd.headTop) lo = mid; else hi = mid;
      }
      h = lo; head = fitHead(Math.max(Math.min(rowWidth(h), W - 120), 480) - 20);
    } else {
      head = fitHead(W - 140);
      const availH = head.headTop - head.size - 40 - imgTop, availW = W - 180;
      h = availH;
      if (rowWidth(h) > availW) h = (availW - gap * (imgs.length - 1)) / ars.reduce((a, r) => a + r, 0);
    }
    const textW = story ? Math.max(Math.min(rowWidth(h), W - 120), 480) : W - 140;

    // Rubric and date.
    // In stories the title is held to the same width as the icon and headline, never below 48px.
    let rs = rubricSize;
    const spacedWidth = (txt, size) => { ctx.font = `${size}px "Marcellus SC", Georgia, serif`; return [...txt].reduce((a2, ch) => a2 + ctx.measureText(ch).width, 0) + size * 0.16 * (txt.length - 1); };
    if (story) while (rs > 44 && spacedWidth(t.rubric.toUpperCase(), rs) > textW) rs -= 2;
    shadowed(() => { ctx.fillStyle = "#f08a6c"; ctx.font = `${rs}px "Marcellus SC", Georgia, serif`; spaced(t.rubric.toUpperCase(), W / 2, rubricY, rs * 0.16); });
    shadowed(() => { ctx.fillStyle = "#eadcbc"; ctx.font = 'italic 42px "EB Garamond", Georgia, serif'; subLines.forEach((l, i) => ctx.fillText(l, W / 2, dateY + i * 50)); });

    // The icon(s), centred in the space between the date and the headline.
    const totalW = rowWidth(h);
    let x = (W - totalW) / 2;
    const y = imgTop + Math.max(0, (head.headTop - head.size - (story ? 24 : 40) - imgTop - h) / 2);
    imgs.forEach((im, k) => { const w = ars[k] * h; kiot(im, x, y, w, h); x += w + gap; });

    // Headline, foot line and the Eikon mark.
    let ty = head.headTop;
    ctx.font = head.font;
    head.lines.forEach(({ l, gap: gp }) => { ty += gp * 14; shadowed(() => gilt(l, W / 2, ty, head.size)); ty += head.lineH; });
    ctx.font = 'italic 36px "EB Garamond", Georgia, serif';
    shadowed(() => { ctx.fillStyle = "#e3d2ad"; footLines.forEach((l, i) => ctx.fillText(l, W / 2, footY + i * 42)); });
    const ls = story ? 64 : 76, k = ls / 76;
    ctx.font = `700 ${ls}px "Cormorant Unicase", Georgia, serif`;
    const word = "Eikon", ww = ctx.measureText(word).width, crossW = 54 * k, gapW = 22 * k, total = crossW + gapW + ww;
    const lx = W / 2 - total / 2;
    shadowed(() => cross(lx + crossW / 2, logoY - 26 * k, 64 * k));
    shadowed(() => { ctx.textAlign = "left"; gilt(word, lx + crossW + gapW, logoY, ls); ctx.textAlign = "center"; });
    shadowed(() => { ctx.fillStyle = "#d8c49a"; ctx.font = `${Math.round(22 * k)}px "Marcellus SC", Georgia, serif`; spaced("A LIBRARY OF THE SAINTS", W / 2, logoY + 40 * k, 6 * k); });
  }

  /* ---------- the form ---------- */
  function dayIcons(date) {
    const info = C.dayInfo(date, cur.style);
    return window.EikonApp.iconsForDay(info).all;
  }
  function kinds() {
    if (cur.mode === "day") {
      const k = ["day"];
      if (C.dayInfo(cur.date, cur.style).fast.level !== "free") k.push("fast");
      return k;
    }
    const k = [];
    if (cur.dates.length) k.push("day");
    if (PATRON_KINDS.includes(cur.base.kind)) k.push("patron");
    k.push("icon");
    return k;
  }
  function renderForm() {
    const ks = kinds();
    if (!ks.includes(cur.kind)) cur.kind = ks[0];
    $("share-kinds").innerHTML = ks.map((k) => `<label><input type="radio" name="kind" value="${k}" ${k === cur.kind ? "checked" : ""}><span class="chip">${KIND_LABELS[k]}</span></label>`).join("");
    $("share-kind-group").hidden = ks.length < 2;

    const dayKind = cur.kind === "day" || cur.kind === "fast";
    $("share-day-group").hidden = !dayKind;
    $("share-icons-group").hidden = !dayKind;
    if (dayKind) {
      if (cur.mode === "day") {
        $("share-day-control").innerHTML = `<div class="day-step"><button type="button" class="iconbtn" data-step="-1" aria-label="Previous day">‹</button><input type="date" id="share-date" value="${iso(cur.date)}" aria-label="Day"><button type="button" class="iconbtn" data-step="1" aria-label="Next day">›</button></div>`;
      } else {
        const app = window.EikonApp;
        $("share-day-control").innerHTML = `<select id="share-date-select" aria-label="Day">${cur.dates.map((d) => {
          const c = app.commemorationForIcon(cur.base, C.dayInfo(d, cur.style));
          return `<option value="${iso(d)}" ${+d === +cur.date ? "selected" : ""}>${C.formatDate(d, { year: true })}${c ? " · " + esc(c.name) : ""}</option>`;
        }).join("")}</select>`;
      }
      const info = C.dayInfo(cur.date, cur.style);
      const comms = window.EikonApp.commemorationsFor(info);
      $("share-day-note").innerHTML = `<b>${esc(info.weekday)}${cur.style === "old" ? ", Old Calendar" : ""}.</b> ${comms.slice(0, 4).map((c) => esc(c.name)).join("; ")}${comms.length > 4 ? "…" : ""}. <i>${esc(info.fast.label)}</i>`;
      const cands = dayIcons(cur.date);
      cur.selected = cur.selected.filter((id) => cands.some((i) => i.id === id));
      if (!cur.selected.length && cands.length) cur.selected = [cands[0].id];
      $("share-icons-label").textContent = `Icons on the card (up to ${MAX_ICONS})`;
      $("share-icons").innerHTML = cands.length ? cands.slice(0, 8).map((i) => `<label title="${esc(i.title)}"><input type="checkbox" value="${i.id}" ${cur.selected.includes(i.id) ? "checked" : ""}><img src="${i.thumb}" alt="${esc(i.title)}"><small>${esc(i.cardName)}</small></label>`).join("")
        : `<p class="share-readout">The library has no icon for this day yet.</p>`;
    } else {
      cur.selected = [cur.base.id];
    }
  }

  function open(state) {
    cur = Object.assign({ shape: (cur && cur.shape) || "portrait" }, state);
    $("share-title").textContent = cur.title;
    document.querySelectorAll('#share-form input[name="shape"]').forEach((r) => (r.checked = r.value === cur.shape));
    renderForm();
    if (!dlg.open) { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }
    draw();
  }
  // A day card: any date; the saints offered are only those the calendar keeps that day.
  function openDay(date, style) {
    open({ mode: "day", date, style, kind: "day", selected: [], title: C.formatDate(date, { year: true }) });
  }
  // An icon card: "of the day" is offered only on days this icon is actually commemorated.
  function openIcon(icon, style, mode) {
    const dates = window.EikonApp.upcomingDatesFor(icon, C.today(), 6);
    open({ mode: "icon", base: icon, dates, date: dates[0] || C.today(), style, kind: mode || (dates.length ? "day" : "icon"), selected: [icon.id], title: icon.title });
  }

  $("share-form").addEventListener("change", (e) => {
    const el = e.target;
    if (el.name === "kind") cur.kind = el.value;
    else if (el.name === "shape") cur.shape = el.value;
    else if (el.id === "share-date" && el.value) { cur.date = fromIso(el.value); cur.selected = []; cur.title = C.formatDate(cur.date, { year: true }); $("share-title").textContent = cur.title; }
    else if (el.id === "share-date-select") cur.date = fromIso(el.value);
    else if (el.type === "checkbox") {
      const picked = [...$("share-icons").querySelectorAll("input:checked")].map((x) => x.value);
      if (picked.length > MAX_ICONS) { el.checked = false; window.EikonToast(`A card holds up to ${MAX_ICONS} icons`); return; }
      if (!picked.length) { el.checked = true; return; }
      cur.selected = picked;
      cur = Object.assign({}, cur); draw(); return;
    }
    cur = Object.assign({}, cur);
    renderForm(); draw();
  });
  $("share-form").addEventListener("click", (e) => {
    const b = e.target.closest("[data-step]");
    if (!b) return;
    cur = Object.assign({}, cur, { date: C.addDays(cur.date, Number(b.dataset.step)), selected: [] });
    cur.title = C.formatDate(cur.date, { year: true }); $("share-title").textContent = cur.title;
    renderForm(); draw();
  });
  $("share-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  const fileName = () => `eikon-${cur.selected.join("-")}-${cur.kind}.png`.slice(0, 120);
  $("share-download").addEventListener("click", () => {
    cv.toBlob((blob) => {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      window.EikonToast("Card saved");
    }, "image/png");
  });
  $("share-native").addEventListener("click", () => {
    cv.toBlob(async (blob) => {
      const file = new File([blob], fileName(), { type: "image/png" });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: cur.title });
        else window.EikonToast("This browser can't share images directly. Save the image instead.");
      } catch (e) { if (e && e.name !== "AbortError") window.EikonToast("Sharing isn't available here. Save the image instead."); }
    }, "image/png");
  });
  // Inside an embedding frame (a hosted preview) the page's own address isn't shareable.
  if (window.self !== window.top) $("share-copy").hidden = true;
  $("share-copy").addEventListener("click", () => {
    const base = location.href.split("#")[0];
    const url = cur.mode === "day" || (cur.kind === "day" || cur.kind === "fast") ? `${base}#day.${iso(cur.date)}` : `${base}#icon.${cur.base.id}`;
    navigator.clipboard.writeText(url).then(() => window.EikonToast("Link copied"), () => window.EikonToast(url));
  });

  window.EikonShare = { openDay, openIcon };
})();
