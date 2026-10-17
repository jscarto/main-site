/* Phosphor — continuous bivariate palettes: colors that blend smoothly across the grid's square
 * instead of falling into classes.
 *
 * Kept apart so it can be removed cleanly: delete this file, then the lines marked "continuous" in
 * index.html, bivariate.js and bivariate.css.
 *
 * A continuous palette is the same surface the classed grids sample, built by bivariate.js's
 * buildGrid at TABLE_SIZE × TABLE_SIZE (cell centers at 0, 1/16, … 1 along each axis), so it keeps
 * the lightness correction, curves, a chosen both-high color and preset interpolation. Colors
 * between those points blend bilinearly, which the exports reproduce in a few lines of code.
 */
(function () {
  'use strict';

  const TABLE_SIZE = 17;

  /** The table as [y][x] of [r, g, b] (0–255), low Y first, from buildGrid's cells. */
  const rgbTable = (cells) => cells.map((row) => row.map((c) => chroma(c.hex).rgb()));

  /** The blended color at x, y (each 0 to 1, low to high) as [r, g, b], 0–255 unrounded. */
  function sampler(table) {
    const n = table.length - 1;
    return (x, y) => {
      const fx = Math.min(Math.max(x, 0), 1) * n;
      const fy = Math.min(Math.max(y, 0), 1) * n;
      const x0 = Math.min(Math.floor(fx), n - 1), y0 = Math.min(Math.floor(fy), n - 1);
      const tx = fx - x0, ty = fy - y0;
      const a = table[y0][x0], b = table[y0][x0 + 1], c = table[y0 + 1][x0], d = table[y0 + 1][x0 + 1];
      return [0, 1, 2].map((i) => a[i] * (1 - tx) * (1 - ty) + b[i] * tx * (1 - ty) + c[i] * (1 - tx) * ty + d[i] * tx * ty);
    };
  }

  /** Paints the square, high Y at the top, into a canvas `size` pixels across. */
  function paint(canvas, sample, size) {
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const c = sample((px + 0.5) / size, 1 - (py + 0.5) / size);
        const o = (py * size + px) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /** The square as a PNG data URL, for the Legend Lab's SVG. */
  const dataUrl = (sample, size) => paint(document.createElement('canvas'), sample, size).toDataURL('image/png');

  /** A 256 × 256 table of map colors, [y][x] by the map's 0–255 values. */
  function mapTable(sample) {
    const out = [];
    for (let y = 0; y < 256; y++) {
      const row = [];
      for (let x = 0; x < 256; x++) row.push(sample(x / 255, y / 255).map(Math.round));
      out.push(row);
    }
    return out;
  }

  // ---------- exports ----------

  /**
   * Code for each export: `cells` is buildGrid's [y][x] table, `name` a code identifier and `how`
   * the grid's description (as in the classed exports' comments).
   */
  function exports(cells, name, how) {
    const n = cells.length;
    const rows = cells.map((row) => row.map((c) => c.hex).join(' '));
    const intro = (c) => [
      `${c} Phosphor continuous bivariate palette, ${how}.`,
      `${c} A ${n} × ${n} table of colors, blended between its points: row 0 is low Y, and each row runs`,
      `${c} from low X to high X.`,
    ];

    const python = [
      'import numpy as np',
      '',
      ...intro('#'),
      `${name}_lut = [`,
      ...rows.map((r) => `    "${r}",`),
      ']',
      `${name}_rgb = np.array([[[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in row.split()] for row in ${name}_lut]) / 255`,
      '',
      '',
      `def ${name}_color(x, y):`,
      '    """RGB colors (0 to 1) for x and y, arrays of any shape, each scaled from 0 (low) to 1 (high).',
      '    NaN in either gives NaN."""',
      `    lut = ${name}_rgb`,
      '    n = lut.shape[0] - 1',
      '    x, y = np.asarray(x, float), np.asarray(y, float)',
      '    missing = np.isnan(x) | np.isnan(y)',
      '    fx = np.clip(np.nan_to_num(x), 0, 1) * n',
      '    fy = np.clip(np.nan_to_num(y), 0, 1) * n',
      '    x0 = np.minimum(fx.astype(int), n - 1)',
      '    y0 = np.minimum(fy.astype(int), n - 1)',
      '    tx = (fx - x0)[..., None]',
      '    ty = (fy - y0)[..., None]',
      '    rgb = (lut[y0, x0] * (1 - tx) * (1 - ty) + lut[y0, x0 + 1] * tx * (1 - ty)',
      '           + lut[y0 + 1, x0] * (1 - tx) * ty + lut[y0 + 1, x0 + 1] * tx * ty)',
      '    rgb[missing] = np.nan',
      '    return rgb',
      '',
      '',
      '# Usage: scale each variable to 0–1 first, for example',
      '#   sx = (df.a - df.a.min()) / (df.a.max() - df.a.min())',
      `#   gdf.plot(color=${name}_color(sx, sy))                    # GeoPandas`,
      `#   plt.imshow(${name}_color(grid_x, grid_y), origin="lower")  # 2D arrays`,
    ].join('\n');

    const r = [
      ...intro('#'),
      `${name}_lut <- c(`,
      rows.map((row) => `  "${row}"`).join(',\n'),
      ')',
      `${name}_rgb <- simplify2array(lapply(strsplit(${name}_lut, " "), function(row) t(col2rgb(row)) / 255))`,
      '',
      `# Hex colors for x and y, each scaled from 0 (low) to 1 (high). NA in either gives NA.`,
      `${name}_color <- function(x, y) {`,
      `  lut <- ${name}_rgb  # [x, channel, y]`,
      '  n <- dim(lut)[3] - 1',
      '  fx <- pmin(pmax(x, 0), 1) * n',
      '  fy <- pmin(pmax(y, 0), 1) * n',
      '  x0 <- pmin(floor(fx), n - 1)',
      '  y0 <- pmin(floor(fy), n - 1)',
      '  tx <- fx - x0',
      '  ty <- fy - y0',
      '  ok <- !is.na(fx) & !is.na(fy)',
      '  out <- rep(NA_character_, length(fx))',
      '  if (!any(ok)) return(out)',
      '  at <- function(i, j, k) lut[cbind(i[ok] + 1, k, j[ok] + 1)]',
      '  mix <- sapply(1:3, function(k) {',
      '    at(x0, y0, k) * (1 - tx[ok]) * (1 - ty[ok]) + at(x0 + 1, y0, k) * tx[ok] * (1 - ty[ok]) +',
      '      at(x0, y0 + 1, k) * (1 - tx[ok]) * ty[ok] + at(x0 + 1, y0 + 1, k) * tx[ok] * ty[ok]',
      '  })',
      '  out[ok] <- rgb(matrix(mix, ncol = 3))',
      '  out',
      '}',
      '',
      '# Usage: scale each variable to 0–1 first, for example with scales::rescale(), then',
      `#   ggplot(df, aes(fill = ${name}_color(sx, sy))) + geom_sf() + scale_fill_identity()`,
    ].join('\n');

    const js = [
      ...intro('//'),
      `const ${name}_lut = [`,
      ...rows.map((row) => `  '${row}',`),
      "].map((row) => row.split(' ').map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))));",
      '',
      '/** A CSS rgb() color for x and y, each scaled from 0 (low) to 1 (high); null if either is missing. */',
      `function ${name}_color(x, y) {`,
      '  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;',
      `  const lut = ${name}_lut, n = lut.length - 1;`,
      '  const fx = Math.min(Math.max(x, 0), 1) * n, fy = Math.min(Math.max(y, 0), 1) * n;',
      '  const x0 = Math.min(Math.floor(fx), n - 1), y0 = Math.min(Math.floor(fy), n - 1);',
      '  const tx = fx - x0, ty = fy - y0;',
      '  const c = [0, 1, 2].map((i) => Math.round(',
      '    lut[y0][x0][i] * (1 - tx) * (1 - ty) + lut[y0][x0 + 1][i] * tx * (1 - ty) +',
      '    lut[y0 + 1][x0][i] * (1 - tx) * ty + lut[y0 + 1][x0 + 1][i] * tx * ty));',
      '  return `rgb(${c.join(\', \')})`;',
      '}',
    ].join('\n');

    const stops = (row) => row.map((c) => c.hex).join(', ');
    const css = [
      `/* Phosphor continuous bivariate legend: high Y at the top, high X at the right.`,
      `   The top edge fades in over the bottom one, so CSS blends between them in sRGB: the edges`,
      `   match Phosphor's colors, and the middle comes close. The Legend Lab draws it exactly. */`,
      `.${name.replace(/_/g, '-')}-legend {`,
      '  position: relative;',
      '  width: 120px;',
      '  aspect-ratio: 1;',
      `  background: linear-gradient(to right, ${stops(cells[0])});`,
      '}',
      `.${name.replace(/_/g, '-')}-legend::after {`,
      '  content: "";',
      '  position: absolute;',
      '  inset: 0;',
      `  background: linear-gradient(to right, ${stops(cells[n - 1])});`,
      '  -webkit-mask-image: linear-gradient(to top, transparent, #000);',
      '  mask-image: linear-gradient(to top, transparent, #000);',
      '}',
    ].join('\n');

    return { python, r, js, css };
  }

  // The colorblind badge's eye with a question mark, for a palette that passes where it was checked.
  const maybeIcon = '<svg class="cvd-icon" viewBox="0 0 22 14" aria-hidden="true">' +
    '<path d="M1.5 7C4 2.8 7.3 1 11 1s7 1.8 9.5 6c-2.5 4.2-5.8 6-9.5 6S4 11.2 1.5 7Z"/>' +
    '<path d="M9.1 5.3a1.9 1.9 0 1 1 2.7 1.7c-.5.2-.8.6-.8 1.1v.4"/><path d="M11 10.5v.01"/></svg>';

  window.PhosphorContinuous = { maybeIcon, TABLE_SIZE, rgbTable, sampler, paint, dataUrl, mapTable, exports };
})();
