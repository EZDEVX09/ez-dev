// EZ DEV brand: the "Spark" mark and a monoline geometric wordmark, drawn as SVG so the logo
// never depends on a web font. Used by the site header/footer, emails and scripts/brand/build.mjs.
//
// The mark is a rounded diamond ("a gem") lit with the brand gradient, holding a struck-through Z:
// the Z's rails plus a short left bar read as E + Z in one stroke. Each product gets its own light.

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

function gradientDef(id, product) {
  const stops = GRADIENTS[product] || GRADIENTS.ezdev;
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops.map((c, i) => `<stop offset="${stops.length === 1 ? 0 : i / (stops.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
}

// The mark on a 32-unit box: gem + spark-Z.
const GEM = '<rect x="4.69" y="4.69" width="22.62" height="22.62" rx="5.2" transform="rotate(45 16 16)"';
const SPARK = 'M11.2,11.4 H20.8 L11.2,20.6 H20.8 M9.6,16 H13.6';

/**
 * Square icon mark. tile=false draws only the spark glyph (fg colour), for one-colour use.
 */
export function markSvg({ size = 64, product = 'ezdev', fg = BRAND.paper, title = 'EZ DEV', tile = true, bg } = {}) {
  const id = nextId('m');
  const fill = bg || `url(#${id})`;
  const gem = tile ? `${GEM} fill="${fill}" class="ez-tile"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" role="img" aria-label="${title}"><title>${title}</title>`
    + (tile && !bg ? `<defs>${gradientDef(id, product)}</defs>` : '')
    + gem
    + `<path d="${SPARK}" fill="none" stroke="${fg}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" class="ez-glyph"/>`
    + '</svg>';
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
 * Horizontal lockup: gem mark + "EZ <WORD>" ("EZ DEV", "EZ APP", "EZ SITE", "EZ DEFENDER").
 * wordColor may be 'gradient' to light the product word with the product gradient.
 */
export function lockupSvg(word, { height = 40, color = BRAND.paper, product = 'ezdev', title, markFg = BRAND.paper, accentWord = false } = {}) {
  const box = 32;
  const cap = 13.2; // wordmark cap height inside the 32-unit row
  const s = cap / 10;
  const gap = 9;
  const ez = phrase('EZ', color);
  const wid = nextId('w');
  const prod = phrase(word, accentWord ? `url(#${wid})` : color);
  const wordsW = (ez.w + 4.6 + prod.w) * s;
  const width = box + gap + wordsW + 1;
  const ty = (box - cap) / 2;
  const label = title || `EZ ${word}`;
  const mark = markSvg({ size: box, product, fg: markFg, title: label }).replace(/^<svg[^>]*>/, '').replace('</svg>', '').replace(/<title>.*?<\/title>/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${box}" height="${height}" width="${((width / box) * height).toFixed(1)}" role="img" aria-label="${label}"><title>${label}</title>`
    + (accentWord ? `<defs><linearGradient id="${wid}" x1="0" y1="0" x2="1" y2="0">${(GRADIENTS[product] || GRADIENTS.ezdev).map((c, i, a) => `<stop offset="${a.length === 1 ? 0 : i / (a.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient></defs>` : '')
    + mark
    + `<g transform="translate(${box + gap} ${ty.toFixed(2)}) scale(${s})">${ez.paths}<g transform="translate(${(ez.w + 4.6).toFixed(2)} 0)">${prod.paths}</g></g>`
    + '</svg>';
}

/** Word-only (no mark), e.g. for large display use. */
export function wordmarkSvg(text, { height = 40, color = BRAND.white } = {}) {
  const { w, paths } = phrase(text, color);
  const pad = SW / 2 + 0.1;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad + 0} ${(w + pad * 2).toFixed(2)} ${10 + pad * 2}" height="${height}" width="${(((w + pad * 2) / (10 + pad * 2)) * height).toFixed(1)}" role="img" aria-label="${text}"><title>${text}</title>${paths}</svg>`;
}

export const PRODUCT_WORD = { ezdev: 'DEV', ezapp: 'APP', ezsite: 'SITE', ezdefender: 'DEFENDER' };
