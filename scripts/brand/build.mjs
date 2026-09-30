#!/usr/bin/env node
// Builds the EZ DEV brand kit (brand/) and the logo assets the sites serve (shared/public/assets/).
//
//   node scripts/brand/build.mjs
//
// SVGs are written directly; PNGs are rendered with Playwright + Chromium.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { markSvg, lockupSvg, BRAND, PRODUCT_WORD } from '../../shared/logo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
let playwright;
for (const p of ['playwright', `${process.env.HOME}/.npm-global/lib/node_modules/playwright`, '/usr/local/lib/node_modules/playwright']) {
  try { playwright = require(p); break; } catch { /* next */ }
}
if (!playwright) { console.error('Needs Playwright: npm i -g playwright'); process.exit(1); }

const KIT = join(root, 'brand');
const ASSETS = join(root, 'shared/public/assets');
for (const d of [KIT, join(KIT, 'svg'), join(KIT, 'png'), join(KIT, 'social'), ASSETS]) mkdirSync(d, { recursive: true });

const write = (path, content) => { writeFileSync(path, content); console.log('  ' + path.replace(root + '/', '')); };
const strip = (svg) => svg.replace(/ width="[^"]*"/, '').replace(/ height="[^"]*"/, '');

// ---------- SVGs ----------
console.log('SVG');
write(join(KIT, 'svg/ez-mark.svg'), strip(markSvg()));
write(join(KIT, 'svg/ez-mark-white-tile.svg'), strip(markSvg({ bg: BRAND.white, fg: BRAND.blue })));
write(join(KIT, 'svg/ez-mark-black-tile.svg'), strip(markSvg({ bg: BRAND.black, fg: BRAND.white })));
write(join(KIT, 'svg/ez-glyph-blue.svg'), strip(markSvg({ tile: false, fg: BRAND.blue })));
for (const [key, word] of Object.entries(PRODUCT_WORD)) {
  write(join(KIT, `svg/${key}-logo-on-dark.svg`), lockupSvg(word, { color: BRAND.white }));
  write(join(KIT, `svg/${key}-logo-on-light.svg`), lockupSvg(word, { color: BRAND.black }));
  write(join(KIT, `svg/${key}-logo-on-blue.svg`), lockupSvg(word, { color: BRAND.white, markBg: BRAND.white, markFg: BRAND.blue }));
}
write(join(ASSETS, 'favicon.svg'), strip(markSvg()));

// ---------- PNGs ----------
console.log('PNG');
const browser = await playwright.chromium.launch();
const page = await browser.newPage();

async function render(html, { width, height, scale = 1, out, transparent = false }) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${transparent ? 'transparent' : '#07090D'}}
    body{display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}</style></head><body>${html}</body></html>`);
  const el = await page.$('body');
  await el.screenshot({ path: out, omitBackground: transparent, scale: scale === 1 ? 'css' : 'device' });
  console.log('  ' + out.replace(root + '/', ''));
}

for (const size of [1024, 512, 192, 180, 32]) {
  await render(markSvg({ size }), { width: size, height: size, out: join(KIT, `png/ez-mark-${size}.png`), transparent: true });
}
for (const [key, word] of Object.entries(PRODUCT_WORD)) {
  await render(lockupSvg(word, { height: 160, color: BRAND.white }), { width: 1400, height: 200, out: join(KIT, `png/${key}-logo-on-dark.png`) });
  await render(`<div style="background:#fff;width:100%;height:100%;display:flex;align-items:center;justify-content:center">${lockupSvg(word, { height: 160, color: BRAND.black })}</div>`, { width: 1400, height: 200, out: join(KIT, `png/${key}-logo-on-light.png`) });
}

// Site icons
await render(markSvg({ size: 180, radius: 0 }), { width: 180, height: 180, out: join(ASSETS, 'apple-touch-icon.png') });
await render(markSvg({ size: 512 }), { width: 512, height: 512, out: join(ASSETS, 'icon-512.png'), transparent: true });
await render(markSvg({ size: 192 }), { width: 192, height: 192, out: join(ASSETS, 'icon-192.png'), transparent: true });

// Email header logo (light background, 2x for retina: shown at 150×30)
await render(`<div style="background:#f3f6fb;width:100%;height:100%;display:flex;align-items:center;justify-content:flex-start">${lockupSvg('DEV', { height: 60, color: BRAND.black })}</div>`,
  { width: 300, height: 60, out: join(ASSETS, 'email-logo.png') });

// Social share images (1200×630), one per product
const TAGLINES = {
  ezdev: 'Build it. Launch it. Lock it down.',
  ezapp: 'Describe it. Get a working app.',
  ezsite: 'Your website, written and designed for you.',
  ezdefender: 'Find the weak spots before attackers do.',
};
for (const [key, word] of Object.entries(PRODUCT_WORD)) {
  const html = `<div style="width:1200px;height:630px;box-sizing:border-box;padding:84px 96px;background:#07090D;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden">
    <div style="position:absolute;right:-60px;bottom:-110px;opacity:.22">${markSvg({ size: 560, tile: false, fg: BRAND.blue })}</div>
    ${lockupSvg(word, { height: 84, color: BRAND.white })}
    <div style="position:relative;color:#fff;font:700 68px/1.05 system-ui,sans-serif;letter-spacing:-.02em;max-width:900px">${TAGLINES[key]}</div>
    <div style="position:relative;color:#6EA8FF;font:500 28px system-ui,sans-serif">EZ APP · EZ SITE · EZ DEFENDER</div>
  </div>`;
  await render(html, { width: 1200, height: 630, out: join(ASSETS, `og-${key}.png`) });
  await render(html, { width: 1200, height: 630, out: join(KIT, `social/og-${key}.png`) });
}

await browser.close();
console.log('Done.');
