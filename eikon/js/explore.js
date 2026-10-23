/* Eikon — Explore: where the icons were made (an atlas), when (centuries by subject), and who appears with whom
   (a network of the figures in the icons). d3 and the map's vector layers load only when this view is opened. */
(function () {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ICONS = window.EIKON_ICONS;
  const KINDS = ["christ", "theotokos", "feast", "saint", "angel", "menaion"];
  const KIND_NAME = { christ: "Christ", theotokos: "Theotokos", feast: "Feasts", saint: "Saints", angel: "Angels", menaion: "Menaion" };
  // Pigments of the icon painter's palette: gold, lapis, cinnabar, malachite, ochre, umber.
  const KIND_COLOR = { christ: "#d9b24c", theotokos: "#4f6fb3", feast: "#b8432c", saint: "#5d8f6a", angel: "#a98ac7", menaion: "#8a6a45" };
  // Angels and the Menaion are hatched (in opposite directions), so they can be told from the Theotokos and the
  // feasts without relying on hue alone.
  const HATCH = { angel: 45, menaion: -45 };
  const swatch = (k) => (HATCH[k] == null ? KIND_COLOR[k]
    : `repeating-linear-gradient(${HATCH[k] + 90}deg, ${KIND_COLOR[k]} 0 2.5px, rgba(11, 8, 6, .75) 2.5px 4px)`);
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
  const century = (y) => Math.floor((y - 1) / 100) + 1;

  // Hooks for the demo reel (tools/reel), which drives the map one frame at a time.
  const reel = {}, REEL = /[?&]reel\b/.test(location.search);

  // ---------- loading ----------
  const V = ((document.currentScript && document.currentScript.src.match(/\?v=\w+/)) || [""])[0];
  let ready = null;
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  function load() {
    if (!ready) ready = Promise.all([
      window.d3 ? Promise.resolve() : loadScript("js/vendor/d3.min.js" + V),
      window.EIKON_GEO ? Promise.resolve() : loadScript("js/data/geo.js" + V),
      loadImage("assets/explore/relief.jpg" + V),
    ]).then(([, , img]) => img);
    return ready;
  }

  // ---------- the shared list of icons ----------
  const tile = (i) => `<a class="ex-tile" href="icon/${i.id}/"><img src="${i.thumb}" alt="" loading="lazy"><span><b>${esc(i.title)}</b><i>${esc(i.date)}</i></span></a>`;
  function showList(box, title, sub, icons, note) {
    const first = 48;
    box.hidden = false;
    box.innerHTML = `<div class="ex-list-head"><div><p class="eyebrow">${esc(sub)}</p><h3>${esc(title)}</h3>${note ? `<p class="ex-note">${esc(note)}</p>` : ""}</div>
      <p class="ex-count">${icons.length} ${icons.length === 1 ? "icon" : "icons"}</p></div>
      <div class="ex-tiles">${icons.slice(0, first).map(tile).join("")}</div>
      ${icons.length > first ? `<div class="more-row"><button type="button" class="btn ghost ex-more">Show all ${icons.length}</button></div>` : ""}`;
    const more = box.querySelector(".ex-more");
    if (more) more.onclick = () => { box.querySelector(".ex-tiles").insertAdjacentHTML("beforeend", icons.slice(first).map(tile).join("")); more.parentNode.remove(); };
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // On a touchscreen one finger scrolls the page past a chart; two fingers pan and zoom it.
  const twoFingers = (e) => (e.touches ? e.touches.length > 1 : (!e.ctrlKey || e.type === "wheel") && !e.button);

  // ---------- WHERE: the atlas ----------
  // Places where icons were made. Broad regions ("Russia", "Greece") are marked as approximate.
  const REGIONS = new Set(["Russia", "Greece", "Northern Russia", "Byzantine Empire", "Georgia", "Macedonia", "Serbia", "Belarus", "Egypt", "Cyprus",
    "Galicia (western Ukraine)", "Ionian Islands", "Volhynia", "Dalmatia (?)", "Epirus", "Perm lands", "Transylvania", "Armenia", "Svaneti", "Wallachia", "Albania", "Bulgaria"]);
  function places() {
    const by = new Map();
    ICONS.forEach((i) => {
      const o = i.origin; if (o.lat == null) return;
      const region = REGIONS.has(o.name);
      const key = `${o.lat.toFixed(2)},${o.lng.toFixed(2)},${region}`;
      if (!by.has(key)) by.set(key, { name: o.name, lat: o.lat, lng: o.lng, region, icons: [], names: {} });
      const p = by.get(key); p.icons.push(i); p.names[o.name] = (p.names[o.name] || 0) + 1;
    });
    return [...by.values()].map((p) => ({ ...p, name: Object.entries(p.names).sort((a, b) => b[1] - a[1])[0][0] })).sort((a, b) => b.icons.length - a.icons.length);
  }

  function atlas(root, img, list) {
    const d3 = window.d3, G = window.EIKON_GEO, [W0, S0, E0, N0] = G.bounds;
    const wrap = root.querySelector(".atlas");
    const W = wrap.clientWidth, H = Math.round(Math.min(Math.max(W * 0.72, 380), window.innerHeight * 0.74));
    wrap.style.height = H + "px";
    const proj = d3.geoConicConformal().parallels([36, 62]).rotate([-30, 0])
      .fitExtent([[10, 10], [W - 10, H - 10]], { type: "MultiPoint", coordinates: d3.range(9, 56.1, 1).flatMap((lon) => [[lon, 25], [lon, 67]]) });
    const path = d3.geoPath(proj);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // The relief, reprojected from the equirectangular image pixel by pixel into the map's conic projection.
    const canvas = wrap.querySelector("canvas"), ctx = canvas.getContext("2d");
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
    const src = document.createElement("canvas"); src.width = img.width; src.height = img.height;
    const sctx = src.getContext("2d"); sctx.drawImage(img, 0, 0);
    const sd = sctx.getImageData(0, 0, img.width, img.height).data, iw = img.width, ih = img.height;
    let drawnT = d3.zoomIdentity;
    function relief(t) {
      const w = W * dpr, h = H * dpr, out = ctx.createImageData(w, h), o = out.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ll = proj.invert([(x / dpr - t.x) / t.k, (y / dpr - t.y) / t.k]);
          const k = (y * w + x) * 4;
          if (!ll) { o[k] = 11; o[k + 1] = 8; o[k + 2] = 6; o[k + 3] = 255; continue; }
          const u = Math.max(0, Math.min(iw - 1.001, (ll[0] - W0) / (E0 - W0) * iw - 0.5)), v = Math.max(0, Math.min(ih - 1.001, (N0 - ll[1]) / (N0 - S0) * ih - 0.5));
          const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, a = (y0 * iw + x0) * 4, b = a + 4, c = a + iw * 4, d = c + 4;
          for (let ch = 0; ch < 3; ch++) o[k + ch] = (sd[a + ch] * (1 - fx) + sd[b + ch] * fx) * (1 - fy) + (sd[c + ch] * (1 - fx) + sd[d + ch] * fx) * fy;
          o[k + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
      drawnT = t; canvas.style.transform = "";
    }

    const svg = d3.select(wrap.querySelector("svg")).attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`);
    svg.selectAll("*").remove();
    const gz = svg.append("g");                      // zooms with the map: lines keep their width
    // The grid shows only over water: a mask of white sea with the land (its holes, like the Caspian, left open) cut out
    // in black and the lakes put back. Rings are drawn flat in the projection, so their winding doesn't matter.
    const ring = (r) => "M" + r.map((c) => proj(c).map((v) => v.toFixed(1)).join(",")).join("L") + "Z";
    const mask = svg.append("defs").append("mask").attr("id", "at-water").attr("maskUnits", "userSpaceOnUse").attr("maskContentUnits", "userSpaceOnUse")
      .attr("x", -W * 3).attr("y", -H * 3).attr("width", W * 7).attr("height", H * 7);
    mask.append("rect").attr("x", -W * 3).attr("y", -H * 3).attr("width", W * 7).attr("height", H * 7).attr("fill", "#fff");
    mask.append("path").attr("fill", "#000").attr("fill-rule", "evenodd").attr("d", G.land.map((p) => p.map(ring).join("")).join(""));
    mask.append("path").attr("fill", "#fff").attr("d", G.lakes.map(ring).join(""));
    gz.append("path").attr("class", "at-grat").attr("mask", "url(#at-water)").attr("d", path(d3.geoGraticule().step([5, 5]).extent([[-50, 5], [115, 80]])()));
    gz.append("path").attr("class", "at-lake").attr("d", path({ type: "MultiPolygon", coordinates: G.lakes.map((r) => [r]) }));
    gz.append("path").attr("class", "at-river").attr("d", path({ type: "MultiLineString", coordinates: G.rivers }));
    gz.append("path").attr("class", "at-coast").attr("d", path({ type: "MultiLineString", coordinates: G.coast }));
    const gl = svg.append("g");                      // screen-space labels and symbols
    const gratLabels = gl.append("g");
    const ps = places();
    const r = d3.scaleSqrt().domain([1, ps[0].icons.length]).range([W < 600 ? 3.5 : 4.5, Math.max(16, Math.min(30, W / 32))]);
    const marks = gl.append("g").selectAll("g").data([...ps].sort((a, b) => (b.region - a.region) || (b.icons.length - a.icons.length))).join("g")
      .attr("class", (d) => "at-place" + (d.region ? " region" : "")).attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", (d) => `${d.name}: ${d.icons.length} icons`);
    marks.append("circle").attr("r", (d) => r(d.icons.length));
    marks.append("title").text((d) => `${d.name}${d.region ? " (region, approximate)" : ""}: ${d.icons.length} ${d.icons.length === 1 ? "icon" : "icons"}`);
    const labels = gl.append("g").selectAll("text").data(ps.filter((p) => p.icons.length >= 3)).join("text")
      .attr("class", (d) => "at-label" + (d.region ? " region" : "")).text((d) => (d.region ? d.name.replace(/\s*\(.*\)/, "").toUpperCase() : d.name.replace(/^St Catherine's Monastery, /, "")));
    const pick = (d) => {
      marks.classed("on", (x) => x === d);
      showList(list, d.name, d.region ? "Made in the region of (approximate)" : "Made in", d.icons.slice().sort((a, b) => a.year - b.year));
    };
    marks.on("click", (e, d) => pick(d)).on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(d); } });

    function place(t) {
      const at = (lon, lat) => { const p = proj([lon, lat]); return [p[0] * t.k + t.x, p[1] * t.k + t.y]; };
      marks.attr("transform", (d) => `translate(${at(d.lng, d.lat)})`);
      // Place labels, skipping any that would collide with one already drawn.
      const boxes = [];
      labels.each(function (d) {
        const [x, y] = at(d.lng, d.lat), rr = r(d.icons.length), el = d3.select(this);
        el.attr("display", null);                          // hidden text measures as zero wide
        const tx = x + rr + 4, ty = y + 5, wdt = this.getComputedTextLength();
        const box = [tx - 2, ty - 15, tx + wdt + 2, ty + 4];
        const clash = boxes.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]));
        const big = d.icons.length >= (t.k > 2.2 ? 1 : t.k > 1.4 ? 4 : 8);
        el.attr("x", tx).attr("y", ty).attr("display", clash || !big || tx > W - 20 ? "none" : null);
        if (!clash && big) boxes.push(box);
      });
      // Degree labels where the graticule meets the frame.
      const labs = [];
      for (let lat = 10; lat <= 75; lat += 5) {
        let best = null; for (let lon = -50; lon <= 115; lon += 0.25) { const p = at(lon, lat); if (p[0] >= 4 && (!best || p[0] < best[0])) best = p; }
        if (best && best[1] > 14 && best[1] < H - 14) labs.push({ t: `${lat}°N`, x: 6, y: best[1] - 3, a: "start" });
      }
      for (let lon = -40; lon <= 105; lon += 5) {
        let best = null; for (let lat = 5; lat <= 80; lat += 0.25) { const p = at(lon, lat); if (p[1] <= H - 4 && (!best || p[1] > best[1])) best = p; }
        if (best && best[0] > 30 && best[0] < W - 30) labs.push({ t: `${lon}°E`, x: best[0] + 3, y: H - 6, a: "start" });
      }
      gratLabels.selectAll("text").data(labs).join("text").attr("class", "at-deg").attr("x", (d) => d.x).attr("y", (d) => d.y).text((d) => d.t);
    }

    let timer = null;
    const zoom = d3.zoom().filter(twoFingers).scaleExtent([1, 7]).translateExtent([[0, 0], [W, H]]).on("zoom", (e) => {
      const t = e.transform;
      gz.attr("transform", t);
      place(t);
      const k = t.k / drawnT.k;
      canvas.style.transformOrigin = "0 0";
      canvas.style.transform = `translate(${t.x - k * drawnT.x}px, ${t.y - k * drawnT.y}px) scale(${k})`;
      clearTimeout(timer); timer = setTimeout(() => relief(t), 160);
    });
    svg.call(zoom).on("dblclick.zoom", null);
    root.querySelector("[data-zoom-in]").onclick = () => svg.transition().duration(400).call(zoom.scaleBy, 1.8);
    root.querySelector("[data-zoom-out]").onclick = () => svg.transition().duration(400).call(zoom.scaleBy, 1 / 1.8);
    root.querySelector("[data-zoom-reset]").onclick = () => svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    relief(d3.zoomIdentity); place(d3.zoomIdentity);
    // Center the map on a place at a given scale, drawing the relief at once rather than after the zoom settles.
    reel.mapZoom = (k, lon, lat) => {
      const p = proj([lon, lat]), t = d3.zoomIdentity.translate(W / 2 - k * p[0], H / 2 - k * p[1]).scale(k);
      svg.call(zoom.transform, t); clearTimeout(timer); relief(t);
    };
    // The size key: real counts, drawn at the map's own scale.
    const key = root.querySelector(".at-key svg");
    const ks = [1, 10, 50, 100].filter((n) => n <= ps[0].icons.length);
    d3.select(key).attr("width", 150).attr("height", 2 * r(ks[ks.length - 1]) + 10).selectAll("*").remove();
    const kg = d3.select(key).append("g").attr("transform", `translate(${r(ks[ks.length - 1]) + 4}, ${2 * r(ks[ks.length - 1]) + 5})`);
    ks.forEach((n) => {
      kg.append("circle").attr("class", "at-keyc").attr("cy", -r(n)).attr("r", r(n));
      kg.append("line").attr("class", "at-keyl").attr("x1", 0).attr("x2", r(ks[ks.length - 1]) + 16).attr("y1", -2 * r(n)).attr("y2", -2 * r(n));
      kg.append("text").attr("class", "at-keyt").attr("x", r(ks[ks.length - 1]) + 20).attr("y", -2 * r(n) + 4).text(n);
    });
  }

  // ---------- WHEN: centuries by subject ----------
  function chart(root, list) {
    const d3 = window.d3, box = root.querySelector(".ex-chart");
    const W = box.clientWidth, H = Math.round(Math.min(460, Math.max(300, W * 0.48)));
    const cents = d3.range(d3.min(ICONS, (i) => century(i.year)), d3.max(ICONS, (i) => century(i.year)) + 1);
    const rows = cents.map((c) => { const o = { c }; KINDS.forEach((k) => (o[k] = ICONS.filter((i) => century(i.year) === c && i.kind === k))); return o; });
    const stack = d3.stack().keys(KINDS).value((d, k) => d[k].length)(rows);
    const m = { t: 16, r: 10, b: 44, l: 40 };
    const x = d3.scaleBand().domain(cents).range([m.l, W - m.r]).padding(0.22);
    const y = d3.scaleLinear().domain([0, d3.max(rows, (d) => KINDS.reduce((a, k) => a + d[k].length, 0))]).nice().range([H - m.b, m.t]);
    const svg = d3.select(box).html("").append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", "Icons by century, stacked by subject");
    svg.append("g").attr("class", "ch-grid").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "ch-axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
    const xa = svg.append("g").attr("class", "ch-axis x").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat((c) => (W < 560 ? c : ordinal(c))).tickSizeOuter(0));
    xa.selectAll(".tick").style("cursor", "pointer").on("click", (e, c) => {
      const all = rows.find((r) => r.c === c); const icons = KINDS.flatMap((k) => all[k]).sort((a, b) => a.year - b.year);
      if (!icons.length) return;
      svg.selectAll(".ch-bar").classed("dim", (o) => o.data.c !== c);
      showList(list, `The ${ordinal(c)} century`, "Painted in", icons); reset.hidden = false;
    });
    svg.append("text").attr("class", "ch-cap").attr("x", (m.l + W - m.r) / 2).attr("y", H - 6).attr("text-anchor", "middle").text("Century");
    const tip = box.appendChild(Object.assign(document.createElement("div"), { className: "ch-tip", hidden: true }));
    const defs = svg.append("defs");
    Object.entries(HATCH).forEach(([k, angle]) => {
      const pat = defs.append("pattern").attr("id", `hatch-${k}`).attr("patternUnits", "userSpaceOnUse").attr("width", 6).attr("height", 6).attr("patternTransform", `rotate(${angle})`);
      pat.append("rect").attr("width", 6).attr("height", 6).attr("fill", KIND_COLOR[k]);
      pat.append("rect").attr("width", 2.2).attr("height", 6).attr("fill", "rgba(11, 8, 6, .75)");
    });
    svg.append("g").selectAll("g").data(stack).join("g").attr("fill", (s) => (HATCH[s.key] == null ? KIND_COLOR[s.key] : `url(#hatch-${s.key})`)).attr("data-k", (s) => s.key)
      .selectAll("rect").data((s) => s.map((d) => Object.assign(d, { key: s.key }))).join("rect")
      .attr("x", (d) => x(d.data.c)).attr("width", x.bandwidth()).attr("y", (d) => y(d[1])).attr("height", (d) => Math.max(0, y(d[0]) - y(d[1])))
      .attr("class", "ch-bar").attr("tabindex", (d) => (d[1] > d[0] ? 0 : null)).attr("role", "button")
      .on("mousemove", (e, d) => {
        const n = d.data[d.key].length; if (!n) return;
        tip.hidden = false; tip.textContent = `${KIND_NAME[d.key]}, ${ordinal(d.data.c)} century: ${n}`;
        const b = box.getBoundingClientRect(); tip.style.left = `${e.clientX - b.left + 12}px`; tip.style.top = `${e.clientY - b.top - 30}px`;
      })
      .on("mouseleave", () => (tip.hidden = true))
      .on("click keydown", (e, d) => {
        if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
        const icons = d.data[d.key].slice().sort((a, b) => a.year - b.year); if (!icons.length) return;
        svg.selectAll(".ch-bar").classed("dim", (o) => o !== d);
        showList(list, `${KIND_NAME[d.key]} · ${ordinal(d.data.c)} century`, "Painted in", icons); reset.hidden = false;
      });
    // The legend doubles as a filter: click a subject to list every icon of it.
    root.querySelector(".ch-legend").innerHTML = KINDS.map((k) => `<button type="button" data-k="${k}"><i style="background:${swatch(k)}"></i>${KIND_NAME[k]} <small>${ICONS.filter((i) => i.kind === k).length}</small></button>`).join("");
    root.querySelectorAll(".ch-legend button").forEach((b) => b.onclick = () => {
      const k = b.dataset.k;
      svg.selectAll(".ch-bar").classed("dim", (d) => d.key !== k);
      showList(list, KIND_NAME[k], "Every icon of", ICONS.filter((i) => i.kind === k).sort((a, b) => a.year - b.year)); reset.hidden = false;
    });
    const reset = root.querySelector("[data-chart-reset]");
    reset.hidden = true;
    reset.onclick = () => { svg.selectAll(".ch-bar").classed("dim", false); list.hidden = true; list.innerHTML = ""; reset.hidden = true; };
  }

  // ---------- WHO: who appears with whom ----------
  // People and angels, from each icon's list of what it depicts; a feast brings its figures with it
  // (a Crucifixion has Christ, a Deesis has Christ, his mother and the Forerunner).
  const ALIAS = { "Theotokos Hodegetria": "Theotokos" };
  const IMPLY = {
    "Crucifixion": ["Jesus Christ"], "Resurrection": ["Jesus Christ"], "Nativity of Christ": ["Jesus Christ", "Theotokos"], "Transfiguration": ["Jesus Christ", "Prophet Elijah", "Prophet Moses"],
    "Theophany": ["Jesus Christ", "St John the Baptist"], "Ascension": ["Jesus Christ", "Theotokos"], "Raising of Lazarus": ["Jesus Christ", "St Lazarus"],
    "Meeting of the Lord": ["Jesus Christ", "Theotokos", "St Symeon the God-receiver"], "Mandylion": ["Jesus Christ"], "Deesis": ["Jesus Christ", "Theotokos", "St John the Baptist"],
    "Last Judgment": ["Jesus Christ"], "Second Coming": ["Jesus Christ"], "Lamentation": ["Jesus Christ", "Theotokos"], "Palm Sunday": ["Jesus Christ"], "Holy Week": ["Jesus Christ"],
    "Washing of the Feet": ["Jesus Christ"], "Annunciation": ["Theotokos", "Archangel Gabriel"], "Dormition": ["Theotokos", "Jesus Christ"],
    "Nativity of the Theotokos": ["Theotokos", "St Anna"], "Entry of the Theotokos": ["Theotokos"], "Protection of the Theotokos": ["Theotokos"], "Mid-Pentecost": ["Jesus Christ"],
    "Pentecost": ["Holy Apostles"], "Beheading of St John the Baptist": ["St John the Baptist"], "Synaxis of the Archangels": ["Archangel Michael", "Archangel Gabriel"],
  };
  const PERSON = /^(St |Sts |Prophet |Archangel |Righteous |Jesus Christ$|Theotokos$|Holy Apostles$|Holy Angels$|Adam$|Eve$|Jacob$|Solomon$|Gideon$|Seven Sleepers|Forty Martyrs|Holy Fathers|Holy Innocents|Myrrh-bearing Women)/;
  const APOSTLES = new Set(["Holy Apostles", "St Peter", "St Paul", "St Andrew", "St John the Theologian", "St Thomas", "St Philip", "St Bartholomew", "St Matthew", "St Mark", "St Luke",
    "St James", "St James, son of Alphaeus", "St James, Brother of the Lord", "St Thaddeus", "St Simon the Zealot"]);
  const groupOf = (n) => (n === "Jesus Christ" ? "christ" : n === "Theotokos" ? "theotokos" : /^Archangel|Holy Angels/.test(n) ? "angel" : /^Prophet|^Righteous|^(Adam|Eve|Jacob|Solomon|Gideon)$/.test(n) ? "prophet"
    : APOSTLES.has(n) ? "apostle" : "saint");
  const GROUP = { christ: ["Christ", "#e2bd57"], theotokos: ["Theotokos", "#5b7cc4"], angel: ["Angels", "#c3b0dd"], prophet: ["Prophets and the righteous", "#6f9e78"], apostle: ["Apostles", "#c4573f"], saint: ["Saints", "#b89a6a"] };
  function figures(icon) {
    const set = new Set();
    icon.subjects.forEach((s) => { s = ALIAS[s] || s; if (PERSON.test(s)) set.add(s); (IMPLY[s] || []).forEach((x) => set.add(x)); });
    if (icon.kind === "christ") set.add("Jesus Christ");
    return [...set];
  }
  function network(root, list) {
    const d3 = window.d3, box = root.querySelector(".ex-net");
    const W = box.clientWidth, H = Math.round(Math.min(Math.max(W * 0.8, 460), window.innerHeight * 0.82));
    const nodes = new Map(), links = new Map();
    ICONS.forEach((icon) => {
      const f = figures(icon);
      f.forEach((n) => { if (!nodes.has(n)) nodes.set(n, { id: n, icons: [], group: groupOf(n) }); nodes.get(n).icons.push(icon); });
      for (let a = 0; a < f.length; a++) for (let b = a + 1; b < f.length; b++) {
        const [s, t] = [f[a], f[b]].sort(), k = s + "|" + t;
        if (!links.has(k)) links.set(k, { source: s, target: t, icons: [] });
        links.get(k).icons.push(icon);
      }
    });
    const L = [...links.values()];
    const deg = new Map(); L.forEach((l) => { deg.set(l.source, (deg.get(l.source) || 0) + 1); deg.set(l.target, (deg.get(l.target) || 0) + 1); });
    const N = [...nodes.values()].filter((n) => deg.get(n.id) || n.id === "Jesus Christ");
    const christ = N.find((n) => n.id === "Jesus Christ"); christ.fx = 0; christ.fy = 0;
    const rad = d3.scaleSqrt().domain([1, d3.max(N, (n) => n.icons.length)]).range([3.2, 30]);
    // Rings around Christ: the more icons a figure shares with him, the closer it sits; figures who never
    // appear with him form an outer ring with their own companions.
    const withChrist = new Map(L.filter((l) => l.source === "Jesus Christ" || l.target === "Jesus Christ").map((l) => [l.source === "Jesus Christ" ? l.target : l.source, l.icons.length]));
    const ring = (d) => (d.id === "Jesus Christ" ? 0 : withChrist.has(d.id) ? 70 + 210 / Math.sqrt(withChrist.get(d.id)) : 360);
    const sim = d3.forceSimulation(N)
      .force("link", d3.forceLink(L).id((d) => d.id).distance((l) => 30 + rad(l.source.icons.length) + rad(l.target.icons.length)).strength((l) => (l.source.id === "Jesus Christ" || l.target.id === "Jesus Christ" ? 0 : Math.min(0.4, 0.04 + l.icons.length * 0.05))))
      .force("charge", d3.forceManyBody().strength((d) => -90 - rad(d.icons.length) * 12).distanceMax(260))
      .force("collide", d3.forceCollide((d) => rad(d.icons.length) + (d.icons.length >= 6 ? 22 : 6)).iterations(3))
      .force("radial", d3.forceRadial(ring, 0, 0).strength(0.8))
      .stop();
    for (let i = 0; i < 600; i++) sim.tick();
    const svg = d3.select(box).html("").append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", "A network of the figures in the icons: lines join figures who appear in the same icon");
    // Each group's color as a sphere: full at the center, darkening toward the rim.
    const defs = svg.append("defs");
    Object.entries(GROUP).forEach(([k, [, c]]) => {
      const gr = defs.append("radialGradient").attr("id", `nw-${k}`).attr("cx", "42%").attr("cy", "38%").attr("r", "62%");
      gr.append("stop").attr("offset", "0%").attr("stop-color", d3.color(c).brighter(0.35));
      gr.append("stop").attr("offset", "55%").attr("stop-color", c);
      gr.append("stop").attr("offset", "100%").attr("stop-color", d3.color(c).darker(1.3));
    });
    const g = svg.append("g");
    const ext = d3.extent(N.flatMap((n) => [n.x - 40, n.x + 40])), eyt = d3.extent(N.flatMap((n) => [n.y - 30, n.y + 30]));
    const k0 = Math.min(W / (ext[1] - ext[0]), H / (eyt[1] - eyt[0]), 1.6);
    const t0 = d3.zoomIdentity.translate(W / 2 - k0 * (ext[0] + ext[1]) / 2, H / 2 - k0 * (eyt[0] + eyt[1]) / 2).scale(k0);
    const link = g.append("g").attr("class", "nw-links").selectAll("line").data(L).join("line")
      .attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y)
      // Thin at rest (1–2px); at full weight, by how many icons the pair shares, when lit.
      .attr("stroke-width", (d) => Math.min(2, 0.6 + Math.sqrt(d.icons.length) * 0.35)).style("--wf", (d) => `${Math.min(6, 0.6 + Math.sqrt(d.icons.length) * 0.9)}px`);
    // The lines are too thin to aim at, so each has a wider, invisible twin that takes the pointer.
    const hit = g.append("g").attr("class", "nw-hits").selectAll("line").data(L).join("line")
      .attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y)
      .attr("stroke-width", 10 / t0.k);
    hit.append("title").text((d) => `${d.source.id} and ${d.target.id}: ${d.icons.length} ${d.icons.length === 1 ? "icon" : "icons"}`);
    const node = g.append("g").selectAll("circle").data(N).join("circle").attr("class", "nw-node").attr("tabindex", 0).attr("role", "button")
      .attr("cx", (d) => d.x).attr("cy", (d) => d.y).attr("r", (d) => rad(d.icons.length)).attr("fill", (d) => `url(#nw-${d.group})`)
      .attr("aria-label", (d) => `${d.id}: ${d.icons.length} icons`);
    node.append("title").text((d) => `${d.id}: ${d.icons.length} ${d.icons.length === 1 ? "icon" : "icons"}, appears with ${deg.get(d.id) || 0} others`);
    const labeled = (d, k) => d.icons.length >= (k > 2.4 ? 1 : k > 1.4 ? 3 : 6) || d.id === "Jesus Christ";
    const label = g.append("g").attr("class", "nw-labels").selectAll("text").data(N).join("text")
      .attr("x", (d) => d.x).attr("y", (d) => d.y + rad(d.icons.length) + 13).attr("text-anchor", "middle")
      .text((d) => d.id.replace(/^(St|Prophet|Archangel) /, ""))
      .attr("font-size", 15 / t0.k);
    let hovered = new Set();                           // figures whose labels show while the pointer is on them or their line
    // Show the labels the zoom allows, busiest figures first, skipping any that would overlap one already shown.
    const byWeight = N.slice().sort((a, b) => b.icons.length - a.icons.length);
    const declutter = (k, keep = () => false) => {
      const boxes = [], show = new Set();
      byWeight.forEach((d) => {
        if (!labeled(d, k) && !keep(d)) return;
        const w = (d.id.replace(/^(St|Prophet|Archangel) /, "").length * 7.4) / k, h = 16 / k, x = d.x0 ?? d.x, y = (d.y0 ?? d.y) + rad(d.icons.length) + 13;
        const b = [x - w / 2, y - h, x + w / 2, y + 3 / k];
        if (boxes.some((o) => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]))) return;
        boxes.push(b); show.add(d);
      });
      label.attr("display", (d) => (show.has(d) || hovered.has(d) ? null : "none"));
      label.filter((d) => hovered.has(d)).raise();
    };
    const relabel = () => {
      const nb = focused ? neighbours(focused) : null;
      declutter(d3.zoomTransform(svg.node()).k, nb ? (n) => nb.has(n.id) : undefined);
    };
    const neighbours = (d) => { const nb = new Set([d.id]); L.forEach((l) => { if (l.source.id === d.id) nb.add(l.target.id); if (l.target.id === d.id) nb.add(l.source.id); }); return nb; };
    declutter(t0.k);
    let focused = null;
    const zoom = d3.zoom().filter(twoFingers).scaleExtent([k0 * 0.7, 6]).on("zoom", (e) => { const k = e.transform.k;
      g.attr("transform", e.transform); label.attr("font-size", 15 / k); hit.attr("stroke-width", 10 / k); relabel(); });
    svg.call(zoom).call(zoom.transform, t0);
    const focus = (d) => {
      const nb = neighbours(d);
      node.classed("dim", (n) => !nb.has(n.id)).classed("on", (n) => n === d);
      link.classed("dim", (l) => l.source !== d && l.target !== d).classed("on", (l) => l.source === d || l.target === d);
      label.classed("dim", (n) => !nb.has(n.id)); focused = d;
      relabel();
      const others = L.filter((l) => l.source === d || l.target === d).map((l) => ({ who: l.source === d ? l.target.id : l.source.id, n: l.icons.length })).sort((a, b) => b.n - a.n);
      showList(list, d.id, "In the library", d.icons.slice().sort((a, b) => a.year - b.year),
        others.length ? `Appears with ${others.slice(0, 8).map((o) => o.who).join(", ")}${others.length > 8 ? ` and ${others.length - 8} more` : ""}.` : "Appears alone.");
    };
    node.on("click", (e, d) => { e.stopPropagation(); focus(d); }).on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focus(d); } });
    hit.on("click", (e, d) => { e.stopPropagation(); link.classed("on", (l) => l === d); showList(list, `${d.source.id} and ${d.target.id} together in`, "Shared icons", d.icons.slice().sort((a, b) => a.year - b.year)); });
    // Hovering a figure lights its lines; choosing one keeps them lit until the graph is reset.
    let held = null;                                   // the figure under the pointer stays still, so it is easy to click
    node.on("mouseenter", (e, d) => { held = d; hovered = new Set([d]); relabel(); link.classed("hover", (l) => l.source === d || l.target === d); })
      .on("mouseleave", () => { held = null; hovered = new Set(); relabel(); link.classed("hover", false); });
    hit.on("mouseenter", (e, d) => {
      hovered = new Set([d.source, d.target]); relabel(); link.classed("hover", (l) => l === d);
    }).on("mouseleave", () => { hovered = new Set(); relabel(); link.classed("hover", false); });
    // A slow drift, as if the figures float: each wanders around its place on two unrelated sine waves per axis,
    // a couple of screen pixels at most, with Christ the stillest. Off for reduced motion and while off screen.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    N.forEach((d) => {
      d.x0 = d.x; d.y0 = d.y; d.amp = d.id === "Jesus Christ" ? 0.6 : 1.6 + Math.random() * 1.6;
      d.f = [0, 1, 2, 3].map(() => 0.12 + Math.random() * 0.22); d.p = [0, 1, 2, 3].map(() => Math.random() * Math.PI * 2);
    });
    let onScreen = true, last = 0;
    const seen = new IntersectionObserver((es) => (onScreen = es[0].isIntersecting)); seen.observe(box);
    const float = (now) => {
      const t = now / 1000, k = d3.zoomTransform(svg.node()).k;
      N.forEach((d) => {
        if (d === held) return;
        const a = d.amp / k, w = 2 * Math.PI * t;
        d.x = d.x0 + a * (0.7 * Math.sin(w * d.f[0] + d.p[0]) + 0.3 * Math.sin(w * d.f[1] + d.p[1]));
        d.y = d.y0 + a * (0.7 * Math.sin(w * d.f[2] + d.p[2]) + 0.3 * Math.sin(w * d.f[3] + d.p[3]));
      });
      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      label.attr("x", (d) => d.x).attr("y", (d) => d.y + rad(d.icons.length) + 13);
      link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
      hit.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
    };
    const drift = (now) => {
      if (!svg.node().isConnected) { seen.disconnect(); return; }   // redrawn or left the page
      requestAnimationFrame(drift);
      if (!onScreen || document.hidden || now - last < 33) return;   // about 30 frames a second is plenty for this
      last = now; float(now);
    };
    // The demo reel renders far slower than real time, so it moves the figures on its own clock instead.
    if (REEL) reel.netFloat = (ms) => { if (svg.node().isConnected) float(ms); };
    else if (!still) requestAnimationFrame(drift);
    const clear = () => {
      node.classed("dim", false).classed("on", false); link.classed("dim", false).classed("on", false); label.classed("dim", false);
      focused = null; relabel();
    };
    svg.on("click", clear);
    root.querySelector(".nw-legend").innerHTML = Object.entries(GROUP).map(([k, [n, c]]) => `<span><i style="background:${c}"></i>${n}</span>`).join("") +
      `<span class="nw-note">${N.length} figures · ${L.length} connections</span>`;
    root.querySelector("[data-net-reset]").onclick = () => { clear(); list.hidden = true; list.innerHTML = ""; svg.transition().duration(500).call(zoom.transform, t0); };
  }

  // ---------- the view ----------
  const TABS = [["where", "Where", "Where the icons were made"], ["when", "When", "When they were painted"], ["who", "Who", "Who appears with whom"]];
  function render(view, sub) {
    const tab = TABS.some((t) => t[0] === sub) ? sub : "where";
    view.innerHTML = `
    <section><div class="wrap explore">
      <div class="section-head"><div><p class="eyebrow">Explore</p><h2>The Library in Place, Time and Company</h2></div></div>
      <div class="ex-tabs" role="tablist">${TABS.map(([k, l, d]) => `<a role="tab" href="#explore${k === "where" ? "" : "." + k}" aria-selected="${k === tab}"><b>${l}</b><small>${d}</small></a>`).join("")}</div>
      <div class="ex-panel" data-tab="${tab}">
        ${tab === "where" ? `
        <p class="ex-intro">Each circle is a city, monastery or school where icons in the library were made, sized by how many. Dashed rings mark icons that can only be placed in a region. Click a circle to see its icons. Drag to pan; scroll or use the buttons to zoom (on a phone, use two fingers).</p>
        <div class="atlas-frame"><div class="atlas"><canvas aria-hidden="true"></canvas><svg role="img" aria-label="Map of where the icons were made"></svg>
          <div class="at-vignette" aria-hidden="true"></div>
          <div class="at-cartouche"><p>Number of icons made</p><div class="at-key"><svg aria-hidden="true"></svg></div><small><span class="dash"></span> region, approximate</small></div>
          <div class="at-zoom"><button type="button" data-zoom-in aria-label="Zoom in">+</button><button type="button" data-zoom-out aria-label="Zoom out">−</button><button type="button" data-zoom-reset aria-label="Reset the map">⟲</button></div>
        </div></div>
        <p class="at-credit">Relief, coastlines and rivers: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>.</p>` : ""}
        ${tab === "when" ? `
        <p class="ex-intro">Icons in the library by the century they were painted in, stacked by subject. Click a block, a century or a subject to see the icons.</p>
        <div class="ex-bar"><div class="ch-legend"></div><button type="button" class="btn ghost ex-reset" data-chart-reset hidden>Reset</button></div><div class="ex-chart"></div>` : ""}
        ${tab === "who" ? `
        <p class="ex-intro">Every figure in the library, with Christ at the center. Lines join figures who appear in the same icon, thicker where they appear together more often. A feast brings its figures with it: a Crucifixion counts Christ, and a Deesis counts Christ, his mother and the Forerunner. Click a figure to see its icons and companions, or a line to see the icons two figures share.</p>
        <div class="nw-legend"></div><div class="ex-net-frame"><div class="ex-net"></div><button type="button" class="btn ghost nw-reset" data-net-reset>Reset</button></div>` : ""}
        <div class="ex-loading">Unrolling the map…</div>
        <div class="placard ex-list" hidden></div>
      </div>
    </div></section>`;
    const root = view.querySelector(".ex-panel"), list = root.querySelector(".ex-list"), loading = root.querySelector(".ex-loading");
    loading.textContent = tab === "where" ? "Unrolling the map…" : "Gathering the icons…";
    load().then((img) => {
      if (!root.isConnected) return;
      loading.remove();
      const draw = () => {
        if (tab === "where") atlas(root, img, list);
        if (tab === "when") chart(root, list);
        if (tab === "who") network(root, list);
      };
      // Draw once the panel has a width, and again whenever that width changes (a rotated phone, a resized window).
      let lastW = 0, t = null;
      const ro = new ResizeObserver(() => {
        if (!root.isConnected) return ro.disconnect();
        const w = root.clientWidth; if (!w || Math.abs(w - lastW) < 2) return;
        const first = !lastW; lastW = w;
        clearTimeout(t); t = setTimeout(draw, first ? 0 : 200);
      });
      ro.observe(root);
    }).catch(() => { loading.textContent = "The map could not be loaded."; });
  }
  window.EikonExplore = { render, reel };
})();
