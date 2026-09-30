// EZ DEV brand: logo mark and geometric wordmark, drawn as SVG strokes so the logo
// never depends on a web font. Used by the site header/footer and by scripts/brand/build.mjs.
//
// The mark is an "EZ" ligature: E and Z share one top and one bottom rail, so the two
// letters read as a single connected piece — one family of products.

export const BRAND = {
  blue: '#2563EB',
  blueBright: '#6EA8FF',
  black: '#07090D',
  white: '#FFFFFF',
};

const SW = 2.2; // stroke width on a 10-unit cap height

// Glyph centre-lines on a 10-unit cap height (y 1.1…8.9 keeps the stroke inside 0…10).
const G = {
  A: { w: 7.0, d: 'M0.7,8.9 L3.5,1.1 L6.3,8.9 M1.8,6.1 H5.2' },
  D: { w: 7.0, d: 'M1.1,1.1 H3 A3.9,3.9 0 0 1 3,8.9 H1.1 Z' },
  E: { w: 6.0, d: 'M5.8,1.1 H1.1 V8.9 H5.8 M1.1,5 H4.9' },
  F: { w: 5.8, d: 'M5.6,1.1 H1.1 V8.9 M1.1,5 H4.7' },
  I: { w: 2.2, d: 'M1.1,1.1 V8.9' },
  N: { w: 7.0, d: 'M1.1,8.9 V1.1 L5.9,8.9 V1.1' },
  P: { w: 6.4, d: 'M1.1,8.9 V1.1 H3.7 A2.35,2.35 0 0 1 3.7,5.8 H1.1' },
  R: { w: 6.6, d: 'M1.1,8.9 V1.1 H3.7 A2.35,2.35 0 0 1 3.7,5.8 H1.1 M3.9,5.8 L6,8.9' },
  S: { w: 6.4, d: 'M5.9,1.1 H2.55 A1.95,1.95 0 0 0 2.55,5 H3.85 A1.95,1.95 0 0 1 3.85,8.9 H0.5' },
  T: { w: 6.6, d: 'M0.2,1.1 H6.4 M3.3,1.1 V8.9' },
  V: { w: 7.0, d: 'M0.7,1.1 L3.5,8.9 L6.3,1.1' },
  Z: { w: 6.4, d: 'M0.6,1.1 H5.8 L0.6,8.9 H5.8' },
};
const TRACK = 1.7;

// The EZ ligature as solid shapes, 12 × 10 units: E spine + shared top/bottom rails +
// E middle bar + Z diagonal. All sub-paths run clockwise so the union fills cleanly.
const MARK_GLYPH = {
  w: 12,
  d: 'M0,0 H2.2 V10 H0 Z M0,0 H12 V2.2 H0 Z M0,7.8 H12 V10 H0 Z M0,3.9 H5.2 V6.1 H0 Z M9.2,2.2 H12 L8.6,7.8 H5.8 Z',
};
const markPath = (gx, gy, s, color) => `<path transform="translate(${gx.toFixed(2)} ${gy.toFixed(2)}) scale(${s})" d="${MARK_GLYPH.d}" fill="${color}"/>`;

const strokeAttrs = (color) =>
  `fill="none" stroke="${color}" stroke-width="${SW}" stroke-linejoin="miter" stroke-miterlimit="2.6" stroke-linecap="butt"`;

export function wordWidth(text) {
  let w = 0;
  [...text].forEach((ch, i) => { w += (G[ch] || { w: 3 }).w + (i ? TRACK : 0); });
  return w;
}

function wordPaths(text, x0, y0, color) {
  let x = x0;
  let out = '';
  [...text].forEach((ch, i) => {
    if (i) x += TRACK;
    const g = G[ch];
    if (g) out += `<path transform="translate(${x.toFixed(2)} ${y0})" d="${g.d}" ${strokeAttrs(color)}/>`;
    x += (g || { w: 3 }).w;
  });
  return out;
}

/** Square app-icon mark: blue tile with the white EZ ligature. */
export function markSvg({ size = 64, bg = BRAND.blue, fg = BRAND.white, radius = 0.24, title = 'EZ DEV', tile = true } = {}) {
  const box = 25;
  const s = 1.25; // glyph scale inside the tile
  const gx = (box - MARK_GLYPH.w * s) / 2;
  const gy = (box - 10 * s) / 2;
  const tileEl = tile ? `<rect width="${box}" height="${box}" rx="${(box * radius).toFixed(2)}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" role="img" aria-label="${title}"><title>${title}</title>${tileEl}${markPath(gx, gy, s, fg)}</svg>`;
}

/**
 * Horizontal lockup: mark + product word ("DEV", "APP", "SITE", "DEFENDER").
 * The mark already says EZ, so the lockup reads "EZ DEV", "EZ APP", …
 */
export function lockupSvg(word, { height = 40, color = BRAND.white, markBg = BRAND.blue, markFg = BRAND.white, title } = {}) {
  const box = 25;
  const s = 1.25;
  const gx = (box - MARK_GLYPH.w * s) / 2;
  const gy = (box - 10 * s) / 2;
  const capScale = 1.16; // wordmark cap height relative to the 10-unit grid
  const gap = 7;
  const ww = wordWidth(word) * capScale;
  const width = box + gap + ww + 0.6;
  const ty = (box - 10 * capScale) / 2;
  const label = title || `EZ ${word}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${box}" height="${height}" width="${((width / box) * height).toFixed(1)}" role="img" aria-label="${label}"><title>${label}</title>`
    + `<rect width="${box}" height="${box}" rx="6" fill="${markBg}"/>`
    + markPath(gx, gy, s, markFg)
    + `<g transform="translate(${box + gap} ${ty.toFixed(2)}) scale(${capScale})">${wordPaths(word, 0, 0, color)}</g>`
    + '</svg>';
}

/** Word-only (no mark), e.g. for large display use. */
export function wordmarkSvg(text, { height = 40, color = BRAND.white } = {}) {
  const words = text.split(' ');
  let w = 0;
  let paths = '';
  words.forEach((word, i) => {
    if (i) w += 4.2;
    paths += wordPaths(word, w, 0, color);
    w += wordWidth(word);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.2 -0.2 ${(w + 0.4).toFixed(2)} 10.4" height="${height}" width="${(((w + 0.4) / 10.4) * height).toFixed(1)}" role="img" aria-label="${text}"><title>${text}</title>${paths}</svg>`;
}

export const PRODUCT_WORD = { ezdev: 'DEV', ezapp: 'APP', ezsite: 'SITE', ezdefender: 'DEFENDER' };
