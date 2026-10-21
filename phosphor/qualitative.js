/* Phosphor — qualitative palettes: a distinct color for each category.
 *
 * Kept apart from app.js so it can be removed cleanly: delete this file and qualitative.css, then
 * the lines marked "qualitative" in index.html and app.js. It uses helpers app.js shares as
 * window.Phosphor.
 *
 * Distinctness is measured as in the rest of Phosphor: OKLab distance (× 100) between colors as
 * seen with normal vision and with simulated protanopia and deuteranopia.
 */
(function () {
  'use strict';
  const P = window.Phosphor;
  if (!P) return;
  const $ = (id) => document.getElementById(id);
  const MIN = 3, MAX = 9;

  // ---------- presets ----------

  // Stevens: one palette per size, found by searching for the set whose closest pair (with normal
  // vision, protanopia and deuteranopia) is as far apart as possible, with shared chroma, no
  // muddy dark yellows or browns, hues spread around the wheel, and lightness 0.45–0.86; then
  // ordered so neighboring colors contrast most.
  const STEVENS = {
    3: ['#99230d', '#ead337', '#b08cff'],
    4: ['#88a4fe', '#648409', '#c5df6b', '#4846a2'],
    5: ['#a59d0c', '#4945a5', '#1ff0df', '#923012', '#1ba1f7'],
    6: ['#4798fa', '#fec93b', '#972522', '#16eafb', '#3947ae', '#e3676a'],
    7: ['#ec7a87', '#8f2164', '#fdca3a', '#3c68ce', '#2cebfd', '#bd4413', '#6ba3ff'],
    8: ['#c05a7c', '#fdc428', '#7372e1', '#4deec1', '#9a1e31', '#cd9eff', '#4745a8', '#e28332'],
    9: ['#6984e2', '#cf9334', '#4756b2', '#5cecda', '#607408', '#62befe', '#813662', '#fac269', '#c06887'],
  };
  // ColorBrewer qualitative schemes (Cynthia Brewer, Mark Harrower and The Pennsylvania State
  // University; Apache License 2.0), up to 9 colors, as d3-scale-chromatic ships them.
  const BREWER = {
    Set1: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'],
    Set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
    Set3: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9'],
    Dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
    Accent: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17', '#666666'],
    Paired: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6'],
    Pastel1: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2'],
    Pastel2: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae', '#f1e2cc', '#cccccc'],
  };
  // Tableau's palettes as d3-scale-chromatic ships them (Tableau 10, and the classic one as
  // d3's category10 and matplotlib's tab10), first 9 colors.
  const TABLEAU = {
    'Tableau 10': ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f'],
    'Tableau Classic 10': ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22'],
  };
  const PRESET_GROUPS = [
    { title: 'Stevens', presets: Object.entries(STEVENS).map(([n, colors]) => ({ name: `Stevens ${n}`, colors, fixed: true })) },
    { title: 'Brewer', presets: Object.entries(BREWER).map(([name, colors]) => ({ name, colors })) },
    { title: 'Tableau', presets: Object.entries(TABLEAU).map(([name, colors]) => ({ name, colors })) },
  ];
  const PRESETS = PRESET_GROUPS.flatMap((g) => g.presets);

  const state = { colors: STEVENS[7].slice(), preset: 'Stevens 7' };
  let nameEdited = false;

  const el = {
    presets: $('qual-presets'), presetsToggle: $('qual-presets-toggle'), colors: $('qual-colors'),
    reorder: $('qual-reorder'), swatches: $('qual-swatches'), map: $('qual-map'), note: $('qual-note'),
    cvd: $('qual-cvd'), closest: $('qual-closest'), name: $('qual-name'),
    outHex: $('qual-out-hex'), outCss: $('qual-out-css'), outPy: $('qual-out-py'), outR: $('qual-out-r'),
    outQgis: $('qual-out-qgis'), outGdal: $('qual-out-gdal'), outCpt: $('qual-out-cpt'), outRgis: $('qual-out-rgis'),
    pro: $('qual-pro-download'), proPreview: $('qual-pro-preview'),
    qgisDownload: $('qual-qgis-download'), gdalDownload: $('qual-gdal-download'), cptDownload: $('qual-cpt-download'), rgisDownload: $('qual-rgis-download'),
    share: $('qual-share'), shareStatus: $('qual-share-status'), shareLabel: $('qual-share-label'),
    legendOptions: $('qual-legend-options'), legendLabels: $('qual-legend-labels'),
  };

  // ---------- distinctness ----------

  // A pair of categories fails when, with normal vision or simulated protanopia or deuteranopia,
  // they sit closer than this. It's stricter than the ramps' 4.5, since categories are matched
  // to a legend one by one rather than read as steps along a ramp.
  const QUAL_MIN_DE = 6;
  let matrices = null;
  const visions = () => (matrices = matrices || [
    ['normal vision', P.IDENTITY], ['protanopia', P.readCvdMatrix('cvd-protanopia')], ['deuteranopia', P.readCvdMatrix('cvd-deuteranopia')],
  ]);
  const labsOf = (hexes) => hexes.map((h) => visions().map(([, m]) => P.simulatedOklab(h, m)));
  const distance = (A, B) => 100 * Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);

  /** The closest pair of colors across the three visions: { de, i, j, vision }. */
  function closestPair(hexes) {
    const labs = labsOf(hexes);
    let best = { de: Infinity, i: 0, j: 1, vision: 'normal vision' };
    for (let i = 0; i < hexes.length; i++) {
      for (let j = i + 1; j < hexes.length; j++) {
        visions().forEach(([name], v) => {
          const de = distance(labs[i][v], labs[j][v]);
          if (de < best.de) best = { de, i, j, vision: name };
        });
      }
    }
    return best;
  }
  const isSafe = (hexes) => closestPair(hexes).de >= QUAL_MIN_DE;

  /** The order whose most similar neighbors (across the three visions) are as different as possible. */
  function contrastOrder(hexes) {
    const n = hexes.length, labs = labsOf(hexes);
    const D = hexes.map((_, i) => hexes.map((_, j) => Math.min(...visions().map((_, v) => distance(labs[i][v], labs[j][v])))));
    let best = null, bestMin = -1, bestSum = -1;
    const perm = [], used = new Array(n).fill(false);
    (function walk() {
      if (perm.length === n) {
        let mn = Infinity, sum = 0;
        for (let k = 0; k < n - 1; k++) { const d = D[perm[k]][perm[k + 1]]; if (d < mn) mn = d; sum += d; }
        if (mn > bestMin + 1e-9 || (Math.abs(mn - bestMin) <= 1e-9 && sum > bestSum)) { bestMin = mn; bestSum = sum; best = perm.slice(); }
        return;
      }
      for (let i = 0; i < n; i++) if (!used[i]) { used[i] = true; perm.push(i); walk(); perm.pop(); used[i] = false; }
    })();
    return best.map((i) => hexes[i]);
  }

  // Candidates for a color added to a custom palette: an sRGB grid within the Stevens presets'
  // lightness and chroma, so additions fit in.
  let pool = null;
  function distinctAddition(hexes) {
    if (!pool) {
      pool = [];
      const lv = 13;
      for (let r = 0; r < lv; r++) for (let g = 0; g < lv; g++) for (let b = 0; b < lv; b++) {
        const c = chroma(Math.round(r * 255 / (lv - 1)), Math.round(g * 255 / (lv - 1)), Math.round(b * 255 / (lv - 1)));
        const [L, a, bb] = c.oklab();
        const C = Math.hypot(a, bb);
        if (L >= 0.45 && L <= 0.86 && C >= 0.07 && C <= 0.17) pool.push(c.hex());
      }
    }
    const labs = labsOf(hexes);
    let best = pool[0], bestDe = -1;
    for (const h of pool) {
      const lab = labsOf([h])[0];
      let mn = Infinity;
      for (const other of labs) visions().forEach((_, v) => { mn = Math.min(mn, distance(lab[v], other[v])); });
      if (mn > bestDe) { bestDe = mn; best = h; }
    }
    return best;
  }

  // ---------- rendering ----------

  const presetNamed = (name) => PRESETS.find((p) => p.name === name);
  const schemeName = () => el.name.value.trim() || 'Phosphor qualitative';
  const codeName = () => schemeName().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(?=\d)/, 'p_') || 'phosphor_qualitative';

  function render() {
    const hexes = state.colors;
    const n = hexes.length;
    document.querySelectorAll('input[name="qual-size"]').forEach((r) => { r.checked = +r.value === n; });

    el.colors.innerHTML = '';
    hexes.forEach((h, i) => {
      // The same row as the Sequential and Diverging color lists.
      const li = document.createElement('li');
      li.className = 'color-item';
      li.innerHTML = `
        <input type="color" aria-label="Pick color ${i + 1}" value="${h}">
        <input type="text" aria-label="Hex color ${i + 1}" value="${h}" spellcheck="false" autocomplete="off">
        <button type="button" data-act="up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-act="down" aria-label="Move down" ${i === n - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" data-act="del" aria-label="Remove" ${n <= MIN ? 'disabled' : ''}>×</button>`;
      const [picker, text] = li.querySelectorAll('input');
      const set = (v) => { state.colors[i] = v; state.preset = null; render(); };
      picker.addEventListener('input', () => set(picker.value));
      text.addEventListener('change', () => {
        const v = text.value.trim();
        const hex = /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? chroma(v[0] === '#' ? v : '#' + v).hex() : null;
        if (hex) set(hex); else text.value = state.colors[i];
      });
      li.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.act === 'del') state.colors.splice(i, 1);
        else {
          const j = i + (b.dataset.act === 'up' ? -1 : 1);
          [state.colors[i], state.colors[j]] = [state.colors[j], state.colors[i]];
        }
        state.preset = null;
        render();
      }));
      el.colors.appendChild(li);
    });

    el.swatches.innerHTML = '';
    hexes.forEach((h, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch'; // the Steps swatches on the Sequential and Diverging tabs
      b.style.background = h;
      b.title = `Class ${i + 1}: ${h}. Click to copy.`;
      b.setAttribute('aria-label', `Class ${i + 1}: ${h}. Copy`);
      b.addEventListener('click', () => P.copy(h));
      el.swatches.appendChild(b);
    });

    const close = closestPair(hexes);
    const safe = close.de >= QUAL_MIN_DE;
    el.cvd.hidden = false;
    el.cvd.className = 'cvd-badge ' + (safe ? 'is-safe' : 'is-unsafe');
    const closest = `The two most similar colors, classes ${close.i + 1} and ${close.j + 1}, are ${close.de.toFixed(1)} apart (OKLab ΔE × 100) with ${close.vision}.`;
    el.cvd.title = safe
      ? `Red-green colorblind-safe: every pair of colors stays at least ${QUAL_MIN_DE} apart with normal vision and with simulated protanopia and deuteranopia. ${closest}`
      : `Not colorblind-safe: classes ${close.i + 1} and ${close.j + 1} are only ${close.de.toFixed(1)} apart with ${close.vision} (at least ${QUAL_MIN_DE} is needed).`;
    el.cvd.innerHTML = P.cvdIcon(safe) + (safe ? 'colorblind-safe' : 'not colorblind-safe');

    // Min. Contrast, as on the other tabs: the smallest WCAG contrast ratio between neighboring
    // colors, here in palette order (the order Reorder for contrast arranges).
    const pairs = hexes.slice(1).map((h, i) => [hexes[i], h, `classes ${i + 1} and ${i + 2}`]);
    const min = P.minContrast(pairs);
    P.renderContrast(el.closest, min);
    el.closest.title = `Smallest WCAG contrast ratio between neighboring colors (${min.label}). Categories can differ in hue as well as lightness, so a low ratio isn't a problem by itself; it matters where labels or thin lines sit on these colors, or where color alone tells shapes apart (WCAG 1.4.11 asks for 3:1).`;

    const preset = state.preset && presetNamed(state.preset);
    el.presets.querySelectorAll('.preset-card').forEach((b) => b.setAttribute('aria-pressed', String(!!preset && b.dataset.name === preset.name)));
    if (!nameEdited) el.name.value = `Phosphor ${preset ? preset.name : 'qualitative ' + n}`;
    el.note.hidden = !(preset && !preset.fixed && n < preset.colors.length);
    if (!el.note.hidden) el.note.textContent = `Showing the first ${n} of ${preset.name}'s ${preset.colors.length} colors.`;

    renderExports();
    renderMap();
    clearStaleLink();
  }

  // ---------- exports ----------

  const BUILT_IN_RAMPS = ['ember', 'lagoon', 'forest', 'dusk', 'thermal', 'diverging', 'red–blue', 'greys', 'harbour', 'harbour (qualitative)', 'terrain', 'aurora'];
  const rgb = (h) => chroma(h).rgb();

  function renderExports() {
    const hexes = state.colors, n = hexes.length, name = codeName(), label = schemeName();
    const quoted = hexes.map((h) => `"${h}"`).join(', ');
    P.setExport(el.outHex, 'list', quoted);
    P.setExport(el.outCss, 'css', [':root {', ...hexes.map((h, i) => `  --${name.replace(/_/g, '-')}-${i + 1}: ${h};`), '}'].join('\n'));
    P.setExport(el.outPy, 'python', [
      'from matplotlib.colors import ListedColormap',
      '',
      `# Phosphor qualitative palette: ${n} colors, ordered as listed.`,
      `${name} = [${quoted}]`,
      `${name}_cmap = ListedColormap(${name}, name="${name}")`,
      '',
      '# Usage:',
      `#   plt.scatter(x, y, c=category_codes, cmap=${name}_cmap)`,
      `#   sns.set_palette(${name})`,
    ].join('\n'));
    P.setExport(el.outR, 'r', [
      `# Phosphor qualitative palette: ${n} colors, ordered as listed.`,
      `${name} <- c(${quoted})`,
      '',
      '# Usage:',
      `#   scale_fill_manual(values = ${name})`,
      `#   scale_color_manual(values = ${name})`,
    ].join('\n'));

    // QGIS: a preset color ramp, which QGIS offers for categorized symbology.
    const qopt = (k, v) => `        <Option type="QString" name="${k}" value="${v}"/>`;
    const attr = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    P.setExport(el.outQgis, 'xml', [
      '<!DOCTYPE qgis_style>',
      '<qgis_style version="2">',
      '  <symbols/>',
      '  <colorramps>',
      `    <colorramp type="preset" name="${attr(label)}" tags="Phosphor">`,
      '      <Option type="Map">',
      ...hexes.flatMap((h, i) => [qopt(`preset_color_${i}`, rgb(h).join(',') + ',255'), qopt(`preset_color_name_${i}`, h)]),
      qopt('rampType', 'preset'),
      '      </Option>',
      '    </colorramp>',
      '  </colorramps>',
      '</qgis_style>',
    ].join('\n'));

    // GDAL: one row per class code, 1 to n, for gdaldem color-relief -exact_color_entry.
    P.setExport(el.outGdal, 'gdal', [...hexes.map((h, i) => `${i + 1}, ${rgb(h).join(', ')}, 255`), 'nv, 0, 0, 0, 0'].join('\n'));

    // GMT: a categorical CPT, one key per class with a label.
    P.setExport(el.outCpt, 'cpt', [
      `# ${label}: made with Phosphor, https://www.joshuastevens.net/phosphor/`,
      '# COLOR_MODEL = RGB',
      ...hexes.map((h, i) => `${i + 1}\t${rgb(h).join('/')}\t;Class ${i + 1}`),
      'N\t128/128/128',
    ].join('\n'));

    // RustGIS: a qualitative ramp, which gives each class the next color.
    const rname = BUILT_IN_RAMPS.includes(label.toLowerCase()) ? `${label} (Phosphor)` : label;
    P.setExport(el.outRgis, 'json', `[{\n  "name": ${JSON.stringify(rname)},\n  "kind": "qualitative",\n  "stops": [\n${hexes.map((h) => `    "${h}"`).join(',\n')}\n  ]\n}]`);

    el.proPreview.innerHTML = hexes.map((h) => `<i style="background:${h}"></i>`).join('');
  }

  // ArcGIS Pro: a fixed color scheme with the Default arrangement, which Pro lists for Unique
  // Values symbology.
  const DEFAULT_RGB = { type: 'CIMICCColorSpace', url: 'Default RGB' };
  async function downloadStylx() {
    const name = schemeName();
    const label = el.pro.textContent;
    el.pro.disabled = true;
    el.pro.textContent = 'Building…';
    try {
      const SQL = await P.loadSqlJs();
      const scheme = {
        type: 'CIMFixedColorRamp',
        colorSpace: DEFAULT_RGB,
        colors: state.colors.map((h) => ({ type: 'CIMRGBColor', colorSpace: DEFAULT_RGB, values: [...rgb(h), 100] })),
        arrangement: 'Default',
      };
      P.downloadText(P.buildStylx(SQL, name, null, scheme, 'Phosphor;qualitative'), P.safeFilename(name) + '.stylx', 'application/octet-stream');
    } catch (err) {
      el.note.hidden = false;
      el.note.textContent = 'Could not build the ArcGIS Pro style: ' + err.message;
    } finally {
      el.pro.textContent = label;
      el.pro.disabled = false;
    }
  }

  // ---------- the map ----------
  // The bivariate tab's counties (two made-up values per county), cut into 3 × 3 zones and dealt
  // out to the classes, so each class covers a few regions, like land cover or zoning.
  const DEAL = [0, 5, 1, 7, 3, 8, 2, 6, 4];
  let mapData = null;
  (function loadMap() {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      mapData = { w: c.width, h: c.height, d: ctx.getImageData(0, 0, c.width, c.height).data };
      renderMap();
    };
    img.src = 'assets/map-bivariate.png';
  })();

  function renderMap() {
    if (!mapData || !el.map.offsetParent) return;
    const { w, h, d } = mapData;
    const colors = state.colors.map(rgb);
    const n = colors.length;
    const bg = chroma(getComputedStyle(document.documentElement).getPropertyValue('--panel').trim()).rgb();
    if (el.map.width !== w) { el.map.width = w; el.map.height = h; }
    const ctx = el.map.getContext('2d');
    const img = ctx.createImageData(w, h);
    const px = img.data;
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      let c = bg;
      if (d[o + 3] > 127) {
        const zone = Math.min(2, (d[o] * 3) >> 8) + 3 * Math.min(2, (d[o + 1] * 3) >> 8);
        c = colors[DEAL[zone] % n];
        const a = (d[o + 2] / 255) * 0.85;
        if (a) c = [c[0] + (bg[0] - c[0]) * a, c[1] + (bg[1] - c[1]) * a, c[2] + (bg[2] - c[2]) * a];
      }
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
      px[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  new MutationObserver(renderMap).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new ResizeObserver(renderMap).observe(el.swatches);

  // ---------- presets ----------

  function buildPresets() {
    el.presets.innerHTML = PRESET_GROUPS.map((group) => `
      <h2>${group.title}</h2>
      <div class="preset-grid">
        ${group.presets.map((p) => {
          const safe = isSafe(p.colors);
          return `
          <button type="button" class="preset-card" data-name="${p.name}" aria-pressed="false">
            <span class="preset-preview qual-card-preview">${p.colors.map((h) => `<i style="background:${h}"></i>`).join('')}</span>
            <span class="preset-meta">
              <span class="preset-name">${p.name}</span>
              <span class="cvd-mark" role="img" aria-label="${safe ? 'Colorblind-safe' : 'Not colorblind-safe'}" title="${safe ? 'Every pair stays distinct with protanopia and deuteranopia' : 'Some colors look alike with protanopia or deuteranopia'}">${P.cvdIcon(safe)}</span>
            </span>
          </button>`;
        }).join('')}
      </div>`).join('');
  }

  function applyPreset(p, size = state.colors.length) {
    if (p.fixed) {
      state.colors = p.colors.slice();
    } else {
      state.colors = p.colors.slice(0, Math.min(Math.max(size, MIN), p.colors.length));
    }
    state.preset = p.name;
    nameEdited = false;
    render();
  }

  el.presetsToggle.addEventListener('click', () => {
    const open = el.presets.hidden;
    el.presets.hidden = !open;
    el.presetsToggle.setAttribute('aria-expanded', String(open));
    el.presetsToggle.textContent = open ? 'Hide preset palettes' : 'Show preset palettes';
  });
  el.presets.addEventListener('click', (e) => {
    const b = e.target.closest('.preset-card');
    if (b) applyPreset(presetNamed(b.dataset.name));
  });

  // The number of classes: a Stevens preset swaps to its palette for that size, a Brewer or
  // Tableau preset takes its first n colors, and a custom palette drops its last colors or gains
  // the most distinct additions.
  document.querySelectorAll('input[name="qual-size"]').forEach((r) => r.addEventListener('change', () => {
    const n = +r.value;
    const preset = state.preset && presetNamed(state.preset);
    if (preset && preset.fixed) { applyPreset(presetNamed(`Stevens ${n}`)); return; }
    if (preset && n <= preset.colors.length) { applyPreset(preset, n); return; }
    state.preset = null;
    while (state.colors.length > n) state.colors.pop();
    while (state.colors.length < n) state.colors.push(distinctAddition(state.colors));
    render();
  }));
  el.reorder.addEventListener('click', () => {
    state.colors = contrastOrder(state.colors);
    state.preset = PRESETS.find((p) => p.colors.length === state.colors.length && p.colors.join() === state.colors.join()) ? state.preset : null;
    render();
  });
  el.name.addEventListener('input', () => { nameEdited = el.name.value.trim() !== ''; renderExports(); });
  el.pro.addEventListener('click', downloadStylx);
  const fileOf = (ext) => P.safeFilename(schemeName()) + ext;
  el.qgisDownload.addEventListener('click', () => P.downloadText(document.getElementById('qual-out-qgis').textContent, fileOf('.xml'), 'application/xml'));
  el.gdalDownload.addEventListener('click', () => P.downloadText(el.outGdal.textContent + '\n', fileOf('.txt'), 'text/plain'));
  el.cptDownload.addEventListener('click', () => P.downloadText(el.outCpt.textContent + '\n', fileOf('.cpt'), 'text/plain'));
  el.rgisDownload.addEventListener('click', () => P.downloadText(el.outRgis.textContent + '\n', fileOf('.rgisramp'), 'application/json'));

  // ---------- share links ----------
  // In the address-bar hash, like the other tabs: t=q, the colors (q) and a preset's name (p).
  // The colors use q rather than c, so app.js doesn't read them as a sequential palette.

  const SHARE_PROMPT = 'Like this palette? Get a link to bookmark it or share it.';
  const isQualitativeLink = (hash) => /^#(?:.*&)?t=q(?:&|$)/.test(hash);
  function stateHash() {
    const p = new URLSearchParams({ t: 'q', q: state.colors.map((h) => h.slice(1)).join(',') });
    if (state.preset) p.set('p', state.preset);
    return '#' + p.toString();
  }
  function clearStaleLink() {
    // Compared decoded, so a link typed with plain commas counts as the same link.
    if (isQualitativeLink(location.hash) && decodeURIComponent(location.hash) !== decodeURIComponent(stateHash())) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }
  function readLink() {
    if (!isQualitativeLink(location.hash)) return false;
    const p = new URLSearchParams(location.hash.slice(1));
    const colors = (p.get('q') || '').split(',').filter((v) => /^[0-9a-f]{6}$/i.test(v)).map((v) => '#' + v.toLowerCase());
    if (colors.length < MIN || colors.length > MAX) return false;
    state.colors = colors;
    const pre = presetNamed(p.get('p'));
    state.preset = pre ? pre.name : null;
    return true;
  }
  async function share() {
    history.replaceState(null, '', stateHash());
    let copied = false;
    try { await navigator.clipboard.writeText(location.href); copied = true; } catch (e) { /* show the link instead */ }
    el.shareStatus.textContent = copied
      ? 'Link copied. Paste it anywhere, or bookmark this page to come back to this palette.'
      : 'Your link is in the address bar. Copy it, or bookmark this page to come back to this palette.';
    el.shareLabel.textContent = copied ? 'Link copied' : 'Link ready';
    clearTimeout(share.timer);
    share.timer = setTimeout(() => { el.shareStatus.textContent = SHARE_PROMPT; el.shareLabel.textContent = 'Copy share link'; }, 4000);
  }
  el.share.addEventListener('click', share);
  // Leaving for another palette tab retires a qualitative link, as editing there would.
  ['tab-sequential', 'tab-diverging', 'tab-bivariate'].forEach((id) => $(id).addEventListener('click', () => {
    if (isQualitativeLink(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }));
  // Arriving here retires a bivariate link the same way.
  $('tab-qualitative').addEventListener('click', () => {
    if (/^#(?:.*&)?t=b(?:&|$)/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  });

  // ---------- Legend Lab ----------
  // A column or row of swatches, each with its label (one per line in the Labels box).

  const legendRadio = (name) => document.querySelector(`input[name="${name}"]:checked`).value;
  const univariateOptions = () => [
    ...document.querySelectorAll('#legend-panel .legend-options:not(#biv-legend-options):not(#qual-legend-options) > :not(.legend-title-field)'),
    $('legend-scale-hint'),
  ].filter(Boolean);
  let hidUnivariate = false;

  /** Shows the qualitative legend when the last palette came from this tab; false otherwise. */
  function renderLegend(lastTab) {
    const on = lastTab === 'qualitative';
    el.legendOptions.hidden = !on;
    if (!on) {
      if (hidUnivariate) { univariateOptions().forEach((node) => { node.hidden = false; }); hidUnivariate = false; }
      return false;
    }
    univariateOptions().forEach((node) => { node.hidden = true; });
    hidUnivariate = true;
    const biv = $('biv-legend-options');
    if (biv) biv.hidden = true;
    drawLegend();
    const L = P.legendEl;
    L.warning.hidden = true;
    L.png.disabled = L.svgDownload.disabled = false;
    return true;
  }

  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function drawLegend() {
    const L = P.LEGEND, o = P.legendSettings(), ink = L.ink[o.ink];
    const fs = L.labelSize, sw = Math.round(fs * 1.25), gap = Math.round(fs * 0.55);
    const round = legendRadio('qual-legend-shape') === 'circle';
    const row = legendRadio('qual-legend-layout') === 'row';
    const lines = el.legendLabels.value.split('\n');
    const labels = state.colors.map((_, i) => (lines[i] || '').trim() || `Class ${i + 1}`);
    const parts = [];
    let x = 0, y = 0, width = 0, height = 0;
    state.colors.forEach((h, i) => {
      const tw = P.textWidth(labels[i], fs);
      parts.push(round
        ? `<circle cx="${(x + sw / 2).toFixed(1)}" cy="${(y + sw / 2).toFixed(1)}" r="${(sw / 2).toFixed(1)}" fill="${h}"/>`
        : `<rect x="${x}" y="${y}" width="${sw}" height="${sw}" rx="2" fill="${h}"/>`);
      parts.push(`<text x="${x + sw + gap}" y="${(y + sw / 2 + fs * 0.35).toFixed(1)}">${esc(labels[i])}</text>`);
      const itemW = sw + gap + tw;
      if (row) { width = x + itemW; height = sw; x += itemW + fs * 1.4; } else { width = Math.max(width, itemW); height = y + sw; y += sw + gap; }
    });
    const titleLine = o.title ? L.titleSize * 1.2 : 0;
    const subtitleLine = o.subtitle ? L.subtitleSize * 1.35 : 0;
    const head = titleLine || subtitleLine ? Math.ceil(titleLine + subtitleLine) + L.titleGap : 0;
    const pad = 2;
    const titleW = Math.max(o.title ? P.textWidth(o.title, L.titleSize, 'bold') : 0, o.subtitle ? P.textWidth(o.subtitle, L.subtitleSize) : 0);
    const W = Math.ceil(Math.max(width, titleW) + 2 * pad), H = Math.ceil(height + head + 2 * pad);
    const svg = P.legendEl.svg;
    svg.setAttribute('viewBox', `${-pad} ${-pad - head} ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.style.width = `${W}px`;
    svg.style.maxWidth = '100%';
    svg.innerHTML =
      (o.title ? `<text x="0" y="${-head + L.titleSize}" font-family="${L.font}" font-size="${L.titleSize}" font-weight="bold" fill="${ink}">${esc(o.title)}</text>` : '') +
      (o.subtitle ? `<text x="0" y="${(-head + titleLine + L.subtitleSize).toFixed(1)}" font-family="${L.font}" font-size="${L.subtitleSize}" fill="${ink}">${esc(o.subtitle)}</text>` : '') +
      `<g>${parts.filter((p) => !p.startsWith('<text')).join('')}</g>` +
      `<g font-family="${L.font}" font-size="${fs}" fill="${ink}">${parts.filter((p) => p.startsWith('<text')).join('')}</g>`;
  }
  document.querySelectorAll('input[name="qual-legend-shape"], input[name="qual-legend-layout"]').forEach((r) => r.addEventListener('change', () => P.renderLegend()));
  el.legendLabels.addEventListener('input', () => P.renderLegend());

  // ---------- tabs on narrow screens ----------
  // With five tabs the row can outgrow a narrow window. One step at a time, until it fits: drop
  // the tab icons; then tighten the tabs; then shorten "Legend Lab" to "Legend". As a last resort,
  // drop the Legend Lab tab (the least used on a phone) unless it's the open one, with the icons
  // back if they fit.

  const tabBar = document.querySelector('.tabs');
  const ALL = ['tabs-no-icons', 'tabs-tight', 'tabs-short', 'tabs-no-legend'];
  const STEPS = [[], ['tabs-no-icons'], ['tabs-no-icons', 'tabs-tight'], ['tabs-no-icons', 'tabs-tight', 'tabs-short'],
    ['tabs-tight', 'tabs-no-legend'], ['tabs-no-icons', 'tabs-tight', 'tabs-no-legend']];
  function fitTabs() {
    for (const classes of STEPS) {
      tabBar.classList.remove(...ALL);
      classes.forEach((c) => tabBar.classList.add(c));
      if (tabBar.scrollWidth <= tabBar.clientWidth + 1) return;
    }
  }
  new ResizeObserver(fitTabs).observe(tabBar);
  tabBar.addEventListener('click', () => requestAnimationFrame(fitTabs)); // the open tab never hides
  if (document.fonts) document.fonts.ready.then(fitTabs);

  // ---------- setup ----------

  buildPresets();
  const fromLink = readLink();
  render();
  if (fromLink) $('tab-qualitative').click(); // a shared qualitative link opens on this tab

  window.PhosphorQualitative = {
    show: () => { render(); },
    renderLegend,
    name: schemeName,
  };
})();
