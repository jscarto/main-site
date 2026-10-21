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
    story: { w: 1080, h: 1920, top: 260, bottom: 420 },
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
    const feasty = icons.map((ic, k) => ["feast", "christ", "theotokos"].includes(ic.kind) || ["great", "pascha", "holy"].includes((comms[k] || {}).rank));
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

  async function draw() {
    const o = cur; if (!o || !o.selected.length) return;
    const S = SHAPES[o.shape], W = S.w, H = S.h;
    cv.width = W; cv.height = H;
    await Promise.all([document.fonts.load('700 80px "Cormorant Unicase"'), document.fonts.load('italic 40px "EB Garamond"'), document.fonts.load('30px "Marcellus SC"')]).catch(() => {});
    const icons = o.selected.map((id) => window.EikonApp.BY_ID[id]);
    const imgs = await Promise.all(icons.map((i) => loadImg(i.image)));
    if (cur !== o) return;
    const t = texts(o);

    // Ground, full bleed.
    ctx.fillStyle = "#0d0907"; ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(W / 2, H * 0.44, 50, W / 2, H * 0.44, H * 0.75);
    g.addColorStop(0, "#2d1e12"); g.addColorStop(1, "rgba(13,9,7,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(W / 2, H * 1.05, 10, W / 2, H * 1.05, H * 0.55);
    g.addColorStop(0, "rgba(255,160,60,.26)"); g.addColorStop(1, "rgba(255,160,60,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    g = ctx.createLinearGradient(W, 0, 0, H);
    g.addColorStop(0, "rgba(240,200,120,.10)"); g.addColorStop(0.6, "rgba(240,200,120,.03)"); g.addColorStop(1, "rgba(240,200,120,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(W * 0.78, 0); ctx.lineTo(W * 1.02, 0); ctx.lineTo(W * 0.25, H); ctx.lineTo(-W * 0.1, H); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = ctx.createPattern(grain, "repeat"); ctx.fillRect(0, 0, W, H);

    // The bordered box sits inside the safe area; everything that must be read is inside it.
    const m = 34, top = S.top + m, bottom = H - S.bottom - m, left = m, right = W - m;
    ctx.strokeStyle = "rgba(201,162,74,.75)"; ctx.lineWidth = 2; ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.strokeStyle = "rgba(201,162,74,.35)"; ctx.lineWidth = 1; ctx.strokeRect(left + 10, top + 10, right - left - 20, bottom - top - 20);
    guilloche(left + 40, right - 40, top + 46, 7);
    guilloche(left + 40, right - 40, bottom - 46, 7);

    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#d4553a"; ctx.font = '34px "Marcellus SC", Georgia, serif';
    spaced(t.rubric.toUpperCase(), W / 2, top + 120, 7);
    ctx.fillStyle = "#b3a17f"; ctx.font = 'italic 32px "EB Garamond", Georgia, serif';
    ctx.fillText(wrap(t.sub, W - 220, ctx.font)[0], W / 2, top + 166);

    // Headline: one name large, several names smaller and stacked.
    const many = t.head.length > 1;
    const size = many ? 46 : (o.shape === "square" ? 58 : 66);
    const headFont = `700 ${size}px "Cormorant Unicase", Georgia, serif`;
    const lineH = Math.round(size * 1.06);
    let headLines = [];
    t.head.forEach((h, k) => { headLines = headLines.concat(wrap(h, W - 220, headFont).slice(0, many ? 2 : 3).map((l) => ({ l, gap: k > 0 && headLines.length ? 1 : 0 }))); });
    headLines = headLines.slice(0, many ? 5 : 3);
    const gaps = headLines.filter((x) => x.gap).length;
    const textBlock = headLines.length * lineH + gaps * 14 + 70;
    const imgTop = top + 196, imgBottom = bottom - 172 - textBlock;
    const availH = imgBottom - imgTop - 40, availW = W - 2 * m - 180;

    // Lay the icons out in a row, all the same height.
    const gap = 48;
    const ars = imgs.map((im) => im.width / im.height);
    let h = availH;
    let totalW = ars.reduce((a, r) => a + r * h, 0) + gap * (imgs.length - 1);
    if (totalW > availW) { h = (availW - gap * (imgs.length - 1)) / ars.reduce((a, r) => a + r, 0); totalW = availW; }
    let x = (W - totalW) / 2;
    const y = imgTop + (availH - h) / 2 + 20;
    imgs.forEach((im, k) => { const w = ars[k] * h; kiot(im, x, y, w, h); x += w + gap; });

    let ty = imgBottom + 70;
    ctx.save(); ctx.font = headFont; ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowOffsetY = 3; ctx.shadowBlur = 4;
    headLines.forEach(({ l, gap: gp }) => {
      ty += gp * 14;
      const gg = ctx.createLinearGradient(0, ty - size * 0.85, 0, ty + 8);
      gg.addColorStop(0, "#fff4cc"); gg.addColorStop(0.35, "#f4dc94"); gg.addColorStop(0.6, "#c9a24a"); gg.addColorStop(0.85, "#8a6420"); gg.addColorStop(1, "#d8b25e");
      ctx.fillStyle = gg; ctx.fillText(l, W / 2, ty); ty += lineH;
    });
    ctx.restore();
    ctx.fillStyle = "#b3a17f"; ctx.font = 'italic 28px "EB Garamond", Georgia, serif';
    ctx.fillText(wrap(t.foot || "", W - 260, ctx.font)[0] || "", W / 2, ty + 2);

    cross(W / 2, bottom - 122, 34);
    ctx.fillStyle = "#c9a24a"; ctx.font = '24px "Marcellus SC", Georgia, serif';
    spaced("EIKON · A LIBRARY OF THE SAINTS", W / 2, bottom - 72, 4);
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
