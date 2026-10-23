/* Eikon — views and routing. Views are named by a bare hash token at the app's root (#today, #library,
   #day.2026-10-21, #calendar, #explore, #sources); an icon has a page of its own (icon/rublev-trinity/). */
(function () {
  const C = window.EikonCalendar;
  const ICONS = window.EIKON_ICONS;
  const BY_ID = Object.fromEntries(ICONS.map((i) => [i.id, i]));
  const view = document.getElementById("view");

  /* ---------- per-viewer preferences ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("eikon." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("eikon." + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const state = { style: store.get("style", "new"), patron: store.get("patron", null), libQuery: "", libKind: "all", libEra: "all", libSort: store.get("libSort", "featured"), calMonth: null, selDay: null };

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const isoOf = (d) => d.toISOString().slice(0, 10);
  const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return C.utc(y, m - 1, d); };
  const iconHref = (id) => `icon/${id}/`;           // an icon's own page, relative to the app's root
  const KIND_LABEL = { christ: "Christ", theotokos: "Theotokos", feast: "Feasts", saint: "Saints", angel: "Angels", menaion: "Menaion" };
  const ERAS = [["early", "Before 1100", 0, 1099], ["middle", "1100–1399", 1100, 1399], ["late", "1400–1599", 1400, 1599], ["modern", "1600 onward", 1600, 3000]];

  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }
  window.EikonToast = toast;

  // Does an icon's day entry match a day?
  function iconMatchesDay(icon, info) {
    return icon.days.some((d) => d.d === info.churchKey || d.d === info.movableKey);
  }
  function iconsForDay(info) {
    const specific = ICONS.filter((i) => i.kind !== "menaion" && iconMatchesDay(i, info));
    const month = info.churchKey.slice(0, 2);
    const menaion = ICONS.filter((i) => i.kind === "menaion" && i.month === month);
    return { specific, menaion, all: specific.concat(menaion) };
  }
  // Commemorations for a day, including feasts of particular icons (e.g. the Vladimir icon).
  function commemorationsFor(info) {
    const list = info.commemorations.slice();
    const have = new Set(list.map((c) => norm(c.name)));
    ICONS.forEach((icon) => icon.days.forEach((d) => {
      if ((d.d === info.churchKey || d.d === info.movableKey) && d.n && !have.has(norm(d.n))) {
        list.push({ name: d.n, rank: "saint", icon: icon.id }); have.add(norm(d.n));
      }
    }));
    return list;
  }
  // Match an icon to the commemoration it represents on a day, by its own label or by
  // shared name stems (so "St Demetrios" finds "Demetrius the Myrrh-streamer").
  const STOP = new Set(["saint", "holy", "great", "martyr", "the", "and", "of", "our", "most", "lord", "apostle", "prophet", "icon", "theotokos"]);
  const stems = (t) => norm(t).replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.slice(0, 5));
  function commemorationForIcon(icon, info) {
    const comms = commemorationsFor(info);
    const hit = icon.days.find((d) => d.d === info.churchKey || d.d === info.movableKey);
    if (hit && hit.n) return comms.find((c) => norm(c.name) === norm(hit.n)) || { name: hit.n, rank: "saint" };
    if (hit && hit.d.startsWith("pascha")) return comms.find((c) => c.movable) || info.principal;
    const want = new Set(icon.subjects.flatMap(stems));
    let best = null, score = 0;
    comms.forEach((c) => { const sc = stems(c.name).filter((w) => want.has(w)).length; if (sc > score) { score = sc; best = c; } });
    return best || info.principal || comms[0];
  }
  function upcomingDatesFor(icon, from, n) {
    const out = [];
    for (let i = 0; i < 400 && out.length < n; i++) {
      const day = C.addDays(from, i), info = C.dayInfo(day, state.style);
      if (icon.kind === "menaion" ? info.churchKey.slice(0, 2) === icon.month : iconMatchesDay(icon, info)) out.push(day);
    }
    return out;
  }
  function dayLabel(d) {
    if (d.d.startsWith("pascha")) {
      const off = Number(d.d.slice(6));
      const m = C.MOVABLE.find((x) => x[0] === off);
      return (d.n || (m ? m[1] : "Movable feast")) + " (movable)";
    }
    return (d.n ? d.n + ", " : "") + C.formatKey(d.d);
  }
  // Next civil date an icon is commemorated (within ~13 months).
  function nextDateFor(icon, from) {
    for (let i = 0; i < 400; i++) {
      const day = C.addDays(from, i), info = C.dayInfo(day, state.style);
      if (icon.kind === "menaion" ? info.churchKey.slice(0, 2) === icon.month : iconMatchesDay(icon, info)) return day;
    }
    return null;
  }
  function relDays(n) { return n === 0 ? "Today" : n === 1 ? "Tomorrow" : "In " + n + " days"; }
  function frame(icon, opts) {
    opts = opts || {};
    const src = opts.full ? icon.image : icon.thumb;
    return `<div class="kiot"${opts.zoom ? ` data-zoom="${icon.id}"` : ""}><img src="${src}" alt="${esc(icon.title)}" width="${icon.w}" height="${icon.h}" loading="${opts.eager ? "eager" : "lazy"}"><span class="glint"></span></div>`;
  }
  function candles() {
    const c = (h) => `<div class="candle"><span class="halo"></span><span class="flame"></span><span class="wick"></span><span class="wax" style="height:${h}px"></span></div>`;
    return `<div class="candles" aria-hidden="true">${c(64)}${c(88)}${c(52)}</div>`;
  }
  function fastBadge(fast) {
    return `<span class="fast" data-level="${fast.level}">${esc(fast.label)}</span>${fast.note ? `<p class="fast-note">${esc(fast.note)}</p>` : ""}`;
  }
  function commList(list) {
    return `<ul class="comm-list">${list.map((c) => `<li class="${c.rank}">${c.icon ? `<a href="${iconHref(c.icon)}">${esc(c.name)}</a>` : esc(c.name)}</li>`).join("")}</ul>`;
  }
  function churchDateNote(info) {
    if (info.style !== "old") return `<span class="church-date">${C.formatDate(C.addDays(info.civil, -C.julianOffset(info.civil.getUTCFullYear())))} on the Old Calendar</span>`;
    return `<span class="church-date">${C.formatDate(info.church)} on the Old Calendar</span>`;
  }
  function tile(icon) {
    return `<a class="icon-tile" href="${iconHref(icon.id)}">${frame(icon)}<div class="cap"><h3>${esc(icon.title)}</h3><p class="meta">${esc(icon.date)} · ${esc(icon.originShort || icon.origin.name)}</p></div></a>`;
  }
  const SEARCH_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6"/></svg>`;

  // "Image: The Met, 17.190.133 · CC0" or "Image: Wikimedia Commons · Public domain"
  function creditLine(icon) {
    const src = icon.source;
    const where = src.via === "Wikimedia Commons" && src.museum ? `${src.museum}, released on Wikimedia Commons` : src.via;
    return `Image: <a href="${src.page}" target="_blank" rel="noopener">${esc(where)}</a>${src.accession ? ` · Accession ${esc(src.accession)}` : ""} · ${esc(src.license)}${src.artist ? " · Photograph or credit: " + esc(src.artist) : ""}`;
  }

  /* ---------- TODAY ---------- */
  function renderToday() {
    const now = C.today();
    const info = C.dayInfo(now, state.style);
    const comms = commemorationsFor(info);
    const match = iconsForDay(info);
    const featured = match.specific[0] || match.menaion[0];
    const principal = info.principal || comms[0];
    const principalIsGreat = principal && (principal.rank === "great" || principal.rank === "pascha");

    // Feasts in the coming weeks.
    const upcoming = [];
    for (let i = 1; i < 120 && upcoming.length < 6; i++) {
      const d = C.addDays(now, i), inf = C.dayInfo(d, state.style);
      const big = inf.commemorations.find((c) => c.rank === "great" || c.rank === "pascha" || c.rank === "major");
      if (big) upcoming.push({ d, i, c: big, icon: iconsForDay(inf).specific[0] });
    }
    const patron = state.patron && BY_ID[state.patron];
    const patronNext = patron && nextDateFor(patron, now);
    const pick = ICONS.filter((i) => i.kind !== "menaion");
    const seed = C.diffDays(now, C.utc(2000, 0, 1));
    const gallery = Array.from({ length: 8 }, (_, k) => pick[(seed * 7 + k * 11) % pick.length]).filter((v, i, a) => a.indexOf(v) === i);

    const others = match.all.filter((i) => i !== featured).slice(0, 5);
    view.innerHTML = `
    <section class="hero-today"><div class="wrap">
      <h1 class="visually-hidden">Eikon, a Library of the Saints</h1>
      <div class="hero-bar">
        <p class="lede">Icons of the Orthodox Church, and the days of the Church year.</p>
        <form class="search-slim" id="hero-search" role="search">
          <input id="hero-q" type="search" placeholder="Search the library" autocomplete="off" aria-label="Search the library">
          <button type="submit" aria-label="Search">${SEARCH_ICON}</button>
        </form>
      </div>
      <div class="today${featured ? "" : " no-icon"}">
        ${featured ? `<a class="today-icon" href="${iconHref(featured.id)}" aria-label="${esc(featured.title)}">${frame(featured, { full: true, eager: true })}</a>` : ""}
        <div class="placard glazed">
          <div class="glazed-body">
          <p class="eyebrow">${esc(info.weekday)} · Today</p>
          <div class="date-line"><h2 class="gilt-text">${C.formatDate(info.civil)}</h2>${churchDateNote(info)}</div>
          ${fastBadge(info.fast)}
          <h3 class="principal ${principalIsGreat ? "great" : ""}">${esc(principal ? principal.name : "")}</h3>
          ${commList(comms.filter((c) => c !== principal))}
          ${featured ? `<p class="note">${match.specific.length
            ? `Shown: ${esc(featured.title)}.`
            : `The library has no icon of today's saints yet. Shown: the ${esc(featured.title)}, which gathers all the saints of the month.`}</p>` : ""}
          ${others.length ? `<div class="mini-icons day-strip">${others.map((i) => `<a href="${iconHref(i.id)}" title="${esc(i.title)}"><img src="${i.thumb}" alt="${esc(i.title)}" loading="lazy"></a>`).join("")}</div>` : ""}
          <div class="actions">
            ${featured ? `<a class="btn" href="${iconHref(featured.id)}">Learn more</a>` : ""}
            <button type="button" class="btn ghost" data-share-day="${isoOf(now)}">Share today's card</button>
          </div>
          </div>
          <div class="lancet-wrap" aria-hidden="true"><div class="stone"></div><canvas class="lancet"></canvas></div>
        </div>
      </div>
    </div></section>
    <hr class="rule">
    ${patron ? `<section><div class="wrap">
      <div class="section-head"><h2>Your patron saint</h2></div>
      <div class="today"><div class="today-icon" style="max-width:300px">${frame(patron)}</div>
      <div class="placard"><h3 class="principal">${esc(patron.title)}</h3>
        <p class="fast-note">${patronNext ? `Next commemorated ${C.formatDate(patronNext)} · ${relDays(C.diffDays(patronNext, now))}` : ""}</p>
        <div class="actions"><a class="btn" href="${iconHref(patron.id)}">Learn more</a>
        <button type="button" class="btn ghost" data-share="${patron.id}" data-mode="patron">Share as my patron</button></div></div></div>
    </div></section>` : ""}
    <section><div class="wrap">
      <div class="section-head"><h2>Feasts approaching</h2><a href="#calendar" class="btn ghost">See the month</a></div>
      <div class="upcoming">${upcoming.map((u) => `
        <a class="feast-card" href="${u.icon ? iconHref(u.icon.id) : "#day." + isoOf(u.d)}">
          ${u.icon ? `<span class="thumb"><img src="${u.icon.thumb}" alt="" loading="lazy"></span>` : `<span class="thumb empty">☦</span>`}
          <span><h3>${esc(u.c.name)}</h3><p class="when">${C.formatDate(u.d)} · ${relDays(u.i)}</p></span>
        </a>`).join("")}</div>
    </div></section>
    <section><div class="wrap">
      <div class="section-head"><h2>From the library</h2><a href="#library" class="btn ghost">Enter the library</a></div>
      <div class="wall-grid">${gallery.map(tile).join("")}</div>
      <div class="more-row"><a class="btn" href="#library">View full library</a></div>
    </div></section>`;

    document.getElementById("hero-search").addEventListener("submit", (e) => {
      e.preventDefault(); state.libQuery = document.getElementById("hero-q").value; go("#library");
    });
    window.EikonAtmosphere.drawWindow(view.querySelector("canvas.lancet"));
  }

  /* ---------- LIBRARY ---------- */
  function haystack(icon) {
    return norm([icon.title, icon.alt, icon.subjects.join(" "), icon.date, icon.school, icon.artist, icon.origin.name, icon.home.name, icon.home.city, icon.medium, KIND_LABEL[icon.kind], icon.days.map(dayLabel).join(" ")].join(" "));
  }
  const HAY = Object.fromEntries(ICONS.map((i) => [i.id, haystack(i)]));
  function filterIcons() {
    const terms = norm(state.libQuery).split(/\s+/).filter(Boolean);
    const era = ERAS.find((e) => e[0] === state.libEra);
    return ICONS.filter((i) => (state.libKind === "all" || i.kind === state.libKind)
      && (!era || (i.year >= era[2] && i.year <= era[3]))
      && terms.every((t) => HAY[i.id].includes(t)));
  }
  // Sorting. A–Z files a title under its name, not its honorific: "St Nicholas" under N, "The Prophet Ezekiel" under E.
  const SORTS = [["featured", "Featured"], ["az", "A–Z"], ["oldest", "Oldest"], ["newest", "Newest"]];
  const HONORIFIC = /^(?:(?:the|a|an)\s+)?(?:(?:holy|great|righteous|venerable|blessed|chief)\s+)*(?:saints?|sts?\.?|apostles?|prophets?|archangels?|evangelist|hieromartyrs?|martyrs?|passion-bearers?)?\s+/i;
  const sortName = (icon) => icon.title.replace(HONORIFIC, "").replace(/^(?:the|a|an)\s+/i, "");
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
  const century = (y) => Math.floor((y - 1) / 100) + 1;
  function sortIcons(list) {
    const by = state.libSort, out = list.slice();
    if (by === "az") out.sort((a, b) => sortName(a).localeCompare(sortName(b)));
    if (by === "oldest") out.sort((a, b) => a.year - b.year || sortName(a).localeCompare(sortName(b)));
    if (by === "newest") out.sort((a, b) => b.year - a.year || sortName(a).localeCompare(sortName(b)));
    return out;
  }
  // The section an icon falls in, for the headers and the index: a letter, or a century.
  function groupOf(icon) {
    if (state.libSort === "az") { const c = sortName(icon).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : "#"; }
    if (state.libSort === "oldest" || state.libSort === "newest") return `${ordinal(century(icon.year))} century`;
    return null;
  }

  function renderLibrary() {
    const kinds = ["all", "christ", "theotokos", "feast", "saint", "angel", "menaion"];
    view.innerHTML = `
    <section><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">The Library</p><h2>Icons of the Church</h2><p class="lib-tally">${ICONS.length} icons… and growing</p></div></div>
      <div class="library-tools">
        <form class="search-big" id="lib-search" role="search" style="margin-top:0">
          <input id="lib-q" type="search" placeholder="Seek a saint, a feast, a city, a painter…" value="${esc(state.libQuery)}" autocomplete="off" aria-label="Search the library">
          <button type="button" class="clear-btn" id="lib-clear" hidden>Clear</button>
          <button type="submit" aria-label="Search">${SEARCH_ICON}</button>
        </form>
        <div class="chips" role="group" aria-label="Subject"><span class="chip-label">Subject</span>${kinds.map((k) => `<button type="button" class="chip" data-kind="${k}" aria-pressed="${state.libKind === k}">${k === "all" ? "All" : KIND_LABEL[k]}</button>`).join("")}</div>
        <div class="chips" role="group" aria-label="Period"><span class="chip-label">Period</span><button type="button" class="chip" data-era="all" aria-pressed="${state.libEra === "all"}">Any</button>${ERAS.map((e) => `<button type="button" class="chip" data-era="${e[0]}" aria-pressed="${state.libEra === e[0]}">${e[1]}</button>`).join("")}</div>
        <div class="chips" role="group" aria-label="Sort"><span class="chip-label">Sort</span>${SORTS.map(([k, l]) => `<button type="button" class="chip" data-sort="${k}" aria-pressed="${state.libSort === k}">${l}</button>`).join("")}</div>
        <p class="result-count" id="lib-count" aria-live="polite"></p>
      </div>
      <div id="lib-grid"></div>
      <div class="lib-more" id="lib-more" aria-hidden="true"></div>
    </div>
    <div class="lib-progress" id="lib-progress" aria-hidden="true" hidden><span id="lib-progress-text"></span><i><b id="lib-progress-bar"></b></i></div>
    </section>`;
    const grid = document.getElementById("lib-grid"), sentinel = document.getElementById("lib-more");
    const meter = document.getElementById("lib-progress");
    // Fixed to the window, so it lives on <body>: the view's entrance animation would otherwise anchor it to the view.
    document.body.append(meter);
    const BATCH = 30;
    // The grid is a run of sections (one per letter or century, or a single one when unsorted); each section is a
    // masonry of columns, filled shortest-first, so tiles never move as more are added.
    let list = [], shown = 0, cols = [], heights = [], group = undefined, nCols = 2, gap = 22;
    const newSection = (g) => {
      const sec = document.createElement("div"); sec.className = "lib-section";
      if (g) { sec.dataset.group = g; sec.innerHTML = `<h3 class="lib-group-head" id="lib-g-${encodeURIComponent(g).replace(/%/g, "")}">${esc(g)}</h3>`; }
      const wall = document.createElement("div"); wall.className = "lib-wall"; wall.style.setProperty("--gap", gap + "px");
      wall.innerHTML = Array(nCols).fill('<div class="lib-col"></div>').join("");
      sec.appendChild(wall); grid.appendChild(sec);
      cols = [...wall.children]; heights = cols.map(() => 0); group = g;
    };
    const layout = () => {
      const w = grid.clientWidth; gap = w < 600 ? 16 : 22;
      nCols = Math.max(2, Math.floor((w + gap) / (190 + gap)));
      grid.innerHTML = ""; group = undefined;
      const upTo = shown; shown = 0; more(upTo);
    };
    const more = (count) => {
      const end = Math.min(list.length, shown + count);
      for (; shown < end; shown++) {
        const icon = list[shown], g = groupOf(icon);
        if (g !== group) newSection(g);
        const k = heights.indexOf(Math.min(...heights));
        cols[k].insertAdjacentHTML("beforeend", tile(icon).replace('class="icon-tile"', `class="icon-tile" data-n="${shown + 1}"`));
        heights[k] += icon.h / icon.w + 0.45; // image plus caption, in column widths
      }
      sentinel.hidden = shown >= list.length;
    };
    // How far the reader has come: how many icons have scrolled into view.
    let ticking = false;
    const onScroll = () => {
      if (!grid.isConnected) { window.removeEventListener("scroll", onScroll); meter.remove(); return; }
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const top = grid.getBoundingClientRect().top, vh = window.innerHeight;
        meter.hidden = !list.length || top > vh * 0.6;
        let seen = 0;
        grid.querySelectorAll(".icon-tile").forEach((t) => { if (t.getBoundingClientRect().top < vh - 60) seen = Math.max(seen, Number(t.dataset.n)); });
        document.getElementById("lib-progress-text").textContent = `${seen} of ${list.length}`;
        document.getElementById("lib-progress-bar").style.width = `${(100 * seen) / Math.max(1, list.length)}%`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const clearBtn = document.getElementById("lib-clear");
    const draw = () => {
      clearBtn.hidden = !state.libQuery && state.libKind === "all" && state.libEra === "all";
      list = sortIcons(filterIcons());
      document.getElementById("lib-count").textContent = list.length === ICONS.length ? "" : `${list.length} ${list.length === 1 ? "icon" : "icons"}`;
      if (!list.length) {
        grid.innerHTML = `<div class="empty-state"><h3>Nothing found</h3><p>No icon matches “${esc(state.libQuery)}”. Try a saint's name, a feast such as “Annunciation”, or a city such as “Novgorod”.</p></div>`;
        sentinel.hidden = true; meter.hidden = true; return;
      }
      shown = 0; layout(); more(BATCH); onScroll();
    };
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting && shown < list.length) more(BATCH); }, { rootMargin: "900px 0px" });
    io.observe(sentinel);
    let lastW = 0;
    const ro = new ResizeObserver(() => {
      if (!grid.isConnected) { ro.disconnect(); io.disconnect(); return; }
      if (list.length && Math.abs(grid.clientWidth - lastW) > 40) { lastW = grid.clientWidth; layout(); }
    });
    ro.observe(grid);
    const q = document.getElementById("lib-q");
    q.addEventListener("input", () => { state.libQuery = q.value; draw(); });
    document.getElementById("lib-search").addEventListener("submit", (e) => e.preventDefault());
    clearBtn.addEventListener("click", () => {
      state.libQuery = ""; state.libKind = "all"; state.libEra = "all"; q.value = "";
      view.querySelectorAll("[data-kind]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.kind === "all"));
      view.querySelectorAll("[data-era]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.era === "all"));
      draw(); q.focus();
    });
    view.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => {
      state.libKind = b.dataset.kind; view.querySelectorAll("[data-kind]").forEach((x) => x.setAttribute("aria-pressed", x === b)); draw();
    }));
    view.querySelectorAll("[data-era]").forEach((b) => b.addEventListener("click", () => {
      state.libEra = b.dataset.era; view.querySelectorAll("[data-era]").forEach((x) => x.setAttribute("aria-pressed", x === b)); draw();
    }));
    view.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
      state.libSort = b.dataset.sort; store.set("libSort", state.libSort);
      view.querySelectorAll("[data-sort]").forEach((x) => x.setAttribute("aria-pressed", x === b)); draw();
    }));
    draw();
  }

  /* ---------- ICON ---------- */
  function renderIcon(id) {
    const icon = BY_ID[id];
    if (!icon) { view.innerHTML = `<section><div class="wrap empty-state"><h3>This icon is not in the library</h3><p><a href="#library">Return to the library</a></p></div></section>`; return; }
    document.title = `${icon.title} · Eikon`;
    const idx = ICONS.indexOf(icon), prev = ICONS[(idx - 1 + ICONS.length) % ICONS.length], next = ICONS[(idx + 1) % ICONS.length];
    const now = C.today(), nd = nextDateFor(icon, now);
    const isPatron = state.patron === icon.id;
    const days = icon.kind === "menaion" ? [icon.month ? `Every day of ${C.MONTHS[Number(icon.month) - 1]}` : "The saints of the whole year, day by day"] : icon.days.map(dayLabel);
    const related = ICONS.filter((o) => o !== icon && o.subjects.some((s) => icon.subjects.includes(s))).slice(0, 6);
    view.innerHTML = `
    <section><div class="wrap detail">
      <div class="detail-icon">${frame(icon, { full: true, zoom: true, eager: true })}</div>
      <div class="detail-side">
        <div class="placard">
          <p class="eyebrow">${esc(KIND_LABEL[icon.kind])}</p>
          <h1 class="gilt-text">${esc(icon.title)}</h1>
          ${icon.alt ? `<p class="alt">${esc(icon.alt)}</p>` : ""}
          <p class="medium-line">${esc(icon.medium)}</p>
          <dl class="facts facts-grid">
            <div class="fact wide"><dt>Depicts</dt><dd>${icon.subjects.map((s) => `<a class="tag" href="#library" data-q="${esc(s)}">${esc(s)}</a>`).join(" ")}</dd></div>
            ${days.length ? `<div class="fact wide"><dt>Commemorated</dt><dd>${days.map(esc).join("<br>")}${nd ? `<span class="sub">Next: ${C.formatDate(nd)} · ${relDays(C.diffDays(nd, now))} (${state.style === "old" ? "Old" : "New"} Calendar)</span>` : ""}</dd></div>` : ""}
            <div class="fact"><dt>Period</dt><dd>${esc(icon.date)}${icon.artist ? `<span class="sub">${esc(icon.artist)}</span>` : ""}</dd></div>
            <div class="fact"><dt>School</dt><dd>${esc(icon.school)}</dd></div>
            <div class="fact"><dt>Made in</dt><dd>${esc(icon.origin.name)}</dd></div>
            <div class="fact"><dt>Kept at</dt><dd>${esc(icon.home.name)}${icon.home.city ? `<span class="sub">${esc(icon.home.city)}</span>` : ""}</dd></div>
          </dl>
          <div class="actions" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:20px">
            <button type="button" class="btn" data-share="${icon.id}">Share as a card</button>
            ${icon.kind === "saint" || icon.kind === "theotokos" || icon.kind === "angel" ? `<button type="button" class="btn ghost ${isPatron ? "patron-on" : ""}" id="patron-btn" aria-pressed="${isPatron}">${isPatron ? "★ My patron saint" : "☆ Set as my patron"}</button>` : ""}
          </div>
        </div>
      </div>
    </div></section>
    <section class="detail-more"><div class="wrap">
      <div class="placard detail-text">
        <div class="detail-bg" aria-hidden="true" style="background-image:url('${icon.image}')"></div>
        <div class="prose">${icon.text.split("\n\n").map((p) => `<p>${esc(p)}</p>`).join("")}</div>
        <p class="credit">${creditLine(icon)}</p>
        <div class="pager"><a class="btn ghost" href="${iconHref(prev.id)}" title="${esc(prev.title)}"><span>‹ ${esc(prev.title)}</span></a><a class="btn ghost" href="${iconHref(next.id)}" title="${esc(next.title)}"><span>${esc(next.title)} ›</span></a></div>
      </div>
    </div></section>
    ${related.length ? `<section><div class="wrap"><div class="section-head"><h2>Of the same subject</h2></div><div class="wall-grid">${related.map(tile).join("")}</div></div></section>` : ""}
    <section class="tail"><div class="wrap more-row"><a class="btn" href="#library">Return to library</a></div></section>`;
    view.querySelectorAll("[data-q]").forEach((a) => a.addEventListener("click", () => { state.libQuery = a.dataset.q; state.libKind = "all"; state.libEra = "all"; }));
    const pb = document.getElementById("patron-btn");
    if (pb) pb.addEventListener("click", () => {
      state.patron = state.patron === icon.id ? null : icon.id; store.set("patron", state.patron);
      toast(state.patron ? `${icon.title} is now your patron` : "Patron saint cleared"); renderIcon(id);
    });
    document.title = icon.title + " · Eikon";
  }

  /* ---------- CALENDAR ---------- */
  function renderCalendar(selIso) {
    const now = C.today();
    if (selIso) { state.selDay = fromIso(selIso); state.calMonth = C.utc(state.selDay.getUTCFullYear(), state.selDay.getUTCMonth(), 1); }
    if (!state.selDay) state.selDay = now;
    if (!state.calMonth) state.calMonth = C.utc(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const m0 = state.calMonth, y = m0.getUTCFullYear(), mo = m0.getUTCMonth();
    const start = C.addDays(m0, -m0.getUTCDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = C.addDays(start, i);
      if (i >= 35 && d.getUTCMonth() !== mo) break;
      const inf = C.dayInfo(d, state.style);
      const p = inf.principal || inf.commemorations[0] || { name: "", rank: "" };
      const dayIcon = iconsForDay(inf).specific[0];
      const hasIcon = !!dayIcon;
      const jd = C.addDays(d, -C.julianOffset(y));
      cells.push(`<button type="button" class="day ${hasIcon ? "has-icon" : ""} ${d.getUTCMonth() !== mo ? "out" : ""} ${p.rank === "great" || p.rank === "pascha" ? "great" : p.rank === "major" ? "major" : ""} ${+d === +now ? "is-today" : ""} ${+d === +state.selDay ? "is-selected" : ""}" data-day="${isoOf(d)}" data-fast="${inf.fast.level}" aria-label="${C.formatDate(d)}: ${esc(p.name)}">
        ${hasIcon ? `<span class="bg" aria-hidden="true" style="background-image:url('${dayIcon.thumb}')"></span>` : ""}<span class="n">${d.getUTCDate()}</span><span class="jn" title="Julian date">${jd.getUTCDate()}</span>${hasIcon ? `<span class="dot" title="An icon for this day"></span>` : ""}
        <span class="c">${esc(p.name)}</span><span class="fastbar"></span></button>`);
    }
    const sel = C.dayInfo(state.selDay, state.style);
    const selComms = commemorationsFor(sel);
    const selIcons = iconsForDay(sel);
    const pas = C.pascha(y);
    const pl = [["Clean Monday", -48], ["Palm Sunday", -7], ["Pascha", 0], ["Ascension", 39], ["Pentecost", 49], ["All Saints", 56]];
    view.innerHTML = `
    <section><div class="wrap">
      <div class="cal-head">
        <button type="button" class="iconbtn" id="cal-prev" aria-label="Previous month">‹</button>
        <h2 class="gilt-text">${C.MONTHS[mo]} ${y}</h2>
        <button type="button" class="iconbtn" id="cal-next" aria-label="Next month">›</button>
        <span class="spacer"></span>
        <button type="button" class="btn ghost" id="cal-today">Today</button>
      </div>
      <p class="note">Commemorations follow the ${state.style === "old" ? "Julian (Old) Calendar: fixed feasts fall 13 days later on the civil calendar" : "Revised Julian (New) Calendar"}. The small number in each square is the Julian date. Pascha and the feasts that depend on it are the same on both.</p>
      <div class="cal-layout">
        <div>
          <div class="month" role="grid">${C.WEEKDAYS.map((w) => `<span class="dow">${w.slice(0, 3)}</span>`).join("")}${cells.join("")}</div>
          <div class="legend"><span><i style="background:#c4553e"></i>Strict fast</span><span><i style="background:#a8913e"></i>Wine and oil</span><span><i style="background:#5f9aa5"></i>Fish permitted</span><span><i style="background:#6f84b8"></i>Fast day</span><span><i style="background:#cdbb92"></i>Dairy permitted</span><span><span class="dot" style="position:static;width:6px;height:6px;border-radius:50%;background:var(--gold-hi);display:inline-block"></span>An icon for the day</span></div>
          <div class="paschalion">${pl.map(([n, o]) => `<div><b>${n} ${y}</b>${C.formatDate(C.addDays(pas, o))}</div>`).join("")}</div>
        </div>
        <div class="placard">
          <p class="eyebrow">${esc(sel.weekday)}</p>
          <div class="date-line"><h2 class="gilt-text" style="font-size:var(--step-2)">${C.formatDate(sel.civil, { year: true })}</h2></div>
          ${churchDateNote(sel)}<br>
          ${fastBadge(sel.fast)}
          ${commList(selComms)}
          ${selIcons.all.length ? `<div class="mini-icons">${selIcons.all.slice(0, 6).map((i) => `<a href="${iconHref(i.id)}" title="${esc(i.title)}"><img src="${i.thumb}" alt="${esc(i.title)}" loading="lazy"></a>`).join("")}</div>` : ""}
          ${selIcons.all.length ? `<div class="actions" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><button type="button" class="btn" data-share-day="${isoOf(sel.civil)}">Share this day</button></div>` : ""}
        </div>
      </div>
    </div></section>`;
    const go = (n) => { state.calMonth = C.utc(y, mo + n, 1); renderCalendar(); };
    document.getElementById("cal-prev").onclick = () => go(-1);
    document.getElementById("cal-next").onclick = () => go(1);
    document.getElementById("cal-today").onclick = () => { state.selDay = now; state.calMonth = C.utc(now.getUTCFullYear(), now.getUTCMonth(), 1); renderCalendar(); };
    view.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { state.selDay = fromIso(b.dataset.day); state.calMonth = C.utc(state.selDay.getUTCFullYear(), state.selDay.getUTCMonth(), 1); renderCalendar(); }));
  }

  /* ---------- SOURCES ---------- */
  function renderSources() {
    view.innerHTML = `
    <section><div class="wrap">
      <div class="section-head"><div><p class="eyebrow">Sources and licenses</p><h2>Where these images come from</h2></div></div>
      <div class="placard prose" style="max-width:none">
        <p>Eikon uses only images that are in the public domain or released under open licenses. It does not rely on fair use. Where a museum releases its own photographs, Eikon takes the image from the museum. Images from The Metropolitan Museum of Art and the Cleveland Museum of Art come directly from their open-access programs under CC0. Images from the Walters Art Museum are the museum's own CC0 releases, hosted on Wikimedia Commons.</p>
        <p>The other icons come from Wikimedia Commons. The icons themselves are centuries old and in the public domain. Faithful photographs of flat artworks carry no new copyright in the United States or the European Union, and Commons marks these "PD-Art".</p>
        <p>Each icon's page names where its image came from, its license, and the photographer or museum, with a link to the original record.</p>
        <p>Many more icons exist than appear here, painted across two thousand years and kept in churches, monasteries and museums around the world. Many of them cannot be shown in Eikon because their photographs are not openly licensed or their owners restrict reuse. The library grows as more images are released for free use.</p>
        <p>The candle-lit background on each icon's page is adapted from <a href="https://commons.wikimedia.org/wiki/File:Mtskheta,_Jvari_Monastery,_Candle_light_2,_Georgia.jpg" target="_blank" rel="noopener">"Mtskheta, Jvari Monastery, Candle light 2"</a> by Vyacheslav Argenberg, used under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>.</p>
        <p>Share cards are set against the iconostasis of <a href="https://commons.wikimedia.org/wiki/File:IIconostatus_of_the_Saint_George%27s_Catedral_of_Novi_Sad.jpg" target="_blank" rel="noopener">St George's Cathedral, Novi Sad</a>, photographed by Alexzr88 and released into the public domain.</p>
        <p>The calendar is a summary of the principal commemorations of the Menaion and Triodion, with a simplified guide to fasting. It is not a complete synaxarion, and local practice varies.</p>
      </div>

    </div></section>`;
  }

  /* ---------- lightbox ---------- */
  function lightbox(icon) {
    const lb = document.createElement("div"); lb.className = "lightbox"; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-label", icon.title);
    lb.innerHTML = `<img src="${icon.image}" alt="${esc(icon.title)}"><p class="cap">${esc(icon.title)} · ${esc(icon.date)} · ${esc(icon.home.name)}</p>`;
    const close = () => { lb.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    lb.addEventListener("click", close); document.addEventListener("keydown", onKey);
    document.body.appendChild(lb);
  }

  /* ---------- routing ---------- */
  // Every view lives at the app's root under a hash token (#library, #day.2026-10-21), except an icon, which has an
  // address of its own (icon/<id>/): a real page, generated by tools/pages.py, that search engines can index. Each
  // document's <base> is the app's root, so links resolve alike from any page, and clicks on them are handled here
  // with the history API, without reloading.
  const ROOT = new URL(document.baseURI);
  function routeOf(url) {
    if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return null;
    const rest = url.pathname.slice(ROOT.pathname.length);
    const m = rest.match(/^icon\/([^/]+)\/?(?:index\.html)?$/);
    if (m) return "icon." + decodeURIComponent(m[1]);
    if (rest === "" || rest === "index.html") return url.hash.replace(/^#/, "") || "today";
    return null;
  }
  function go(href) {
    history.pushState(null, "", new URL(href, ROOT));
    route();
  }
  let current = null;
  function route() {
    let h = routeOf(new URL(location.href)) || "today";
    // Links shared before icons had pages of their own (#icon.<id>) move to the icon's page.
    if (h.startsWith("icon.") && location.hash) history.replaceState(null, "", new URL(iconHref(h.slice(5)), ROOT));
    current = h;
    const [name, ...rest] = h.split(".");
    const arg = rest.join(".");
    document.title = "Eikon - A Library of the Saints";
    document.querySelectorAll("body > .lib-progress").forEach((el) => el.remove());
    const navKey = name === "icon" ? "library" : name === "day" ? "calendar" : name;
    document.querySelectorAll(".nav a").forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === "#" + navKey) || a.removeAttribute("aria-current"));
    document.querySelectorAll(".nav a").forEach((a) => { if (a.getAttribute("href") === "#" + navKey) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (name === "library") renderLibrary();
    else if (name === "icon") renderIcon(arg);
    else if (name === "calendar") renderCalendar();
    else if (name === "day" && /^\d{4}-\d{2}-\d{2}$/.test(arg)) renderCalendar(arg);
    else if (name === "sources") renderSources();
    else if (name === "explore") window.EikonExplore.render(view, arg);
    else renderToday();
    view.classList.remove("view-enter"); void view.offsetWidth; view.classList.add("view-enter");
    if (name !== "library" || !state.keepScroll) window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  // Links into the app open in place; anything with a modifier key, a target or another address is left to the browser.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || a.target || a.hasAttribute("download")) return;
    const url = new URL(a.href);
    if (routeOf(url) === null) return;
    e.preventDefault();
    if (url.href !== location.href) go(url.href);
  });

  document.addEventListener("click", (e) => {
    const sd = e.target.closest("[data-share-day]");
    if (sd) { window.EikonShare.openDay(fromIso(sd.dataset.shareDay), state.style); return; }
    const s = e.target.closest("[data-share]");
    if (s) { window.EikonShare.openIcon(BY_ID[s.dataset.share], state.style, s.dataset.mode); return; }
    const z = e.target.closest("[data-zoom]");
    if (z) lightbox(BY_ID[z.dataset.zoom]);
  });
  function setStyle(s) {
    state.style = s; store.set("style", s);
    document.querySelectorAll(".style-toggle button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.style === s));
  }
  document.querySelectorAll(".style-toggle button").forEach((b) => b.addEventListener("click", () => { setStyle(b.dataset.style); route(); }));
  setStyle(state.style);

  window.EikonApp = { state, iconsForDay, commemorationsFor, commemorationForIcon, upcomingDatesFor, BY_ID, KIND_LABEL };
  window.addEventListener("popstate", route);
  // An address typed or edited by hand; skipped when popstate has already shown it.
  window.addEventListener("hashchange", () => { if (routeOf(new URL(location.href)) !== current) route(); });
  window.EikonAtmosphere.init();
  route();
})();
