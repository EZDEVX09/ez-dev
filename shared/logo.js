// EZ DEV brand: the "EZ" lettermark and a monoline geometric wordmark, drawn as SVG so the logo
// never depends on a web font. Used by the site header/footer, emails and scripts/brand/build.mjs.
//
// The mark is the letters EZ, custom-drawn: heavy, slightly forward-leaning strokes lit with the
// brand gradient (or white on a glowing tile for icons). Each product gets its own light.

export const BRAND = {
  ink: '#05060B',
  paper: '#FFFFFF',
  black: '#05060B',
  white: '#FFFFFF',
  cyan: '#22D3EE',
  blue: '#3D7BFF',
  violet: '#8B5CF6',
  pink: '#EC4899',
  green: '#10D9A0',
};

/** Gradient stops per product (top-left → bottom-right). */
export const GRADIENTS = {
  ezdev: [BRAND.cyan, BRAND.blue, BRAND.violet],
  ezapp: [BRAND.cyan, BRAND.blue],
  ezsite: [BRAND.violet, BRAND.pink],
  ezdefender: [BRAND.green, BRAND.cyan],
};

const SW = 1.55; // wordmark stroke width on a 10-unit cap height
const TRACK = 2.1;

// Monoline glyph centre-lines on a 10-unit cap height (y 1…9 keeps the round stroke inside 0…10).
const G = {
  A: { w: 7.2, d: 'M0.8,9 L3.6,1 L6.4,9 M1.9,6.1 H5.3' },
  D: { w: 7.0, d: 'M1,1 H3 A4,4 0 0 1 3,9 H1 Z' },
  E: { w: 5.8, d: 'M5.6,1 H1 V9 H5.6 M1,5 H4.6' },
  F: { w: 5.6, d: 'M5.4,1 H1 V9 M1,5 H4.4' },
  I: { w: 2.0, d: 'M1,1 V9' },
  N: { w: 7.0, d: 'M1,9 V1 L6,9 V1' },
  P: { w: 6.2, d: 'M1,9 V1 H3.6 A2.4,2.4 0 0 1 3.6,5.8 H1' },
  R: { w: 6.4, d: 'M1,9 V1 H3.6 A2.4,2.4 0 0 1 3.6,5.8 H1 M3.8,5.8 L5.8,9' },
  S: { w: 6.2, d: 'M5.6,1 H2.6 A2,2 0 0 0 2.6,5 H3.6 A2,2 0 0 1 3.6,9 H0.6' },
  T: { w: 6.4, d: 'M0.4,1 H6 M3.2,1 V9' },
  V: { w: 7.2, d: 'M0.8,1 L3.6,9 L6.4,1' },
  Z: { w: 6.2, d: 'M0.8,1 H5.6 L0.8,9 H5.6' },
};

let uid = 0;
const nextId = (p) => `ezg-${p}-${(uid++).toString(36)}`;

function gradientDef(id, product, x2 = 1, y2 = 0) {
  const stops = GRADIENTS[product] || GRADIENTS.ezdev;
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map((c, i) => `<stop offset="${stops.length === 1 ? 0 : i / (stops.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
}

// The EZ letters: centre-lines on a 10-unit cap height, 16 units wide with the stroke.
const EZ_W = 16.4;
const EZ_D = 'M6.5,1.1 H1.1 V8.9 H6.5 M1.1,5 H5.2 M9.4,1.1 H15.3 L9.4,8.9 H15.3';
const EZ_SW = 2.15;
const SLANT = -9; // degrees of forward lean

/** The EZ letters as a <g>, fitted into a box of width w (in the parent's units), top-left at (x, y). */
function ezLetters(x, y, w, stroke) {
  const s = w / (EZ_W + 1.6); // leave room for the lean
  const lean = Math.tan((-SLANT * Math.PI) / 180) * 10; // horizontal shift of the top at full cap height
  return `<g transform="translate(${(x + (lean * s) / 2).toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(4)}) skewX(${SLANT}) translate(${(lean / 2 + 0.3).toFixed(2)} 0)">`
    + `<path d="${EZ_D}" fill="none" stroke="${stroke}" stroke-width="${EZ_SW}" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="4" class="ez-glyph"/></g>`;
}
const ezHeight = (w) => (w / (EZ_W + 1.6)) * 10;

/**
 * Square icon mark: white EZ on a glowing gradient tile.
 * tile=false draws only the letters, in the product gradient (or fg if given).
 */
export function markSvg({ size = 64, product = 'ezdev', fg, title = 'EZ DEV', tile = true, bg } = {}) {
  const id = nextId('m');
  const lw = tile ? 21 : 30;
  const lh = ezHeight(lw);
  const letters = ezLetters((32 - lw) / 2 - 0.4, (32 - lh) / 2, lw, tile ? (fg || BRAND.paper) : (fg || `url(#${id})`));
  const defs = (tile && !bg) || (!tile && !fg) ? `<defs>${gradientDef(id, product, 1, tile ? 1 : 0)}</defs>` : '';
  const tileEl = tile ? `<rect x="1" y="1" width="30" height="30" rx="8.5" fill="${bg || `url(#${id})`}" class="ez-tile"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" role="img" aria-label="${title}"><title>${title}</title>`
    + defs + tileEl + letters + '</svg>';
}

export function wordWidth(text) {
  let w = 0;
  [...text].forEach((ch, i) => { w += (G[ch] || { w: 3.2 }).w + (i ? TRACK : 0); });
  return w;
}

// Shifts an absolute path (M/L/H/V/A/Z only) right by dx, so a whole word becomes one path
// (one path = one gradient box, so an accent gradient runs across the whole word).
function shift(d, dx) {
  return d.replace(/([MLHA])([^MLHVAZ]*)/g, (_, cmd, args) => {
    const n = args.trim().split(/[\s,]+/).map(Number);
    if (cmd === 'H') n[0] += dx;
    else if (cmd === 'A') n[5] += dx;
    else n[0] += dx;
    return cmd + n.map((v) => +v.toFixed(2)).join(',') + ' ';
  });
}

function wordD(text, x0) {
  let x = x0;
  let d = '';
  [...text].forEach((ch, i) => {
    if (i) x += TRACK;
    const g = G[ch];
    if (g) d += shift(g.d, x);
    x += (g || { w: 3.2 }).w;
  });
  return d;
}

function wordPaths(text, x0, color) {
  return `<path d="${wordD(text, x0).trim()}" fill="none" stroke="${color}" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round" class="ez-word"/>`;
}

function phrase(text, color) {
  let w = 0;
  let paths = '';
  text.split(' ').forEach((word, i) => {
    if (i) w += 4.6;
    paths += wordPaths(word, w, color);
    w += wordWidth(word);
  });
  return { w, paths };
}

/**
 * Horizontal lockup: the EZ lettermark (in the product gradient) + the product word
 * ("DEV", "APP", "SITE", "DEFENDER") in a lighter monoline.
 */
export function lockupSvg(word, { height = 40, color = BRAND.paper, product = 'ezdev', title, ezColor } = {}) {
  const box = 32;
  const ezW = 40; // EZ letters width inside the 32-unit-high row
  const ezH = ezHeight(ezW);
  const cap = ezH * 0.82; // product word slightly smaller than EZ
  const s = cap / 10;
  const gap = 8;
  const id = nextId('l');
  const prod = phrase(word, color);
  const width = ezW + gap + prod.w * s + 1;
  const label = title || `EZ ${word}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${box}" height="${height}" width="${((width / box) * height).toFixed(1)}" role="img" aria-label="${label}"><title>${label}</title>`
    + (ezColor ? '' : `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${EZ_W}" y2="0">${(GRADIENTS[product] || GRADIENTS.ezdev).map((c, i, a) => `<stop offset="${a.length === 1 ? 0 : i / (a.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`)
    + ezLetters(0, (box - ezH) / 2, ezW, ezColor || `url(#${id})`)
    + `<g transform="translate(${ezW + gap} ${((box + ezH) / 2 - cap).toFixed(2)}) scale(${s.toFixed(4)})">${prod.paths}</g>`
    + '</svg>';
}

/** Word-only (no mark), e.g. for large display use. */
export function wordmarkSvg(text, { height = 40, color = BRAND.white } = {}) {
  const { w, paths } = phrase(text, color);
  const pad = SW / 2 + 0.1;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad + 0} ${(w + pad * 2).toFixed(2)} ${10 + pad * 2}" height="${height}" width="${(((w + pad * 2) / (10 + pad * 2)) * height).toFixed(1)}" role="img" aria-label="${text}"><title>${text}</title>${paths}</svg>`;
}

export const PRODUCT_WORD = { ezdev: 'DEV', ezapp: 'APP', ezsite: 'SITE', ezdefender: 'DEFENDER' };
