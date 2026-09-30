#!/usr/bin/env node
// Builds the EZ DEV brand kit (brand/) and the logo assets the sites serve (shared/public/assets/).
//
//   node scripts/brand/build.mjs
//
// SVGs are written directly; PNGs are rendered with Playwright + Chromium.

import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { markSvg, lockupSvg, BRAND, GRADIENTS, PRODUCT_WORD } from '../../shared/logo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
let playwright;
for (const p of ['playwright', `${process.env.HOME}/.npm-global/lib/node_modules/playwright`, '/home/claude/.npm-global/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
  try { playwright = require(p); break; } catch { /* next */ }
}
if (!playwright) { console.error('Needs Playwright: npm i -g playwright'); process.exit(1); }

const KIT = join(root, 'brand');
const ASSETS = join(root, 'shared/public/assets');
for (const d of [KIT, join(KIT, 'svg'), join(KIT, 'png'), join(KIT, 'social'), ASSETS]) mkdirSync(d, { recursive: true });
for (const d of [join(KIT, 'svg'), join(KIT, 'png')]) for (const f of readdirSync(d)) unlinkSync(join(d, f));

const write = (path, content) => { writeFileSync(path, content); console.log('  ' + path.replace(root + '/', '')); };
const strip = (svg) => svg.replace(/ width="[^"]*"/, '').replace(/ height="[^"]*"/, '');
const KEYS = Object.keys(PRODUCT_WORD);

// ---------- SVGs ----------
console.log('SVG');
for (const key of KEYS) {
  write(join(KIT, `svg/${key}-mark.svg`), strip(markSvg({ product: key })));
  write(join(KIT, `svg/${key}-logo-on-dark.svg`), lockupSvg(PRODUCT_WORD[key], { product: key, color: BRAND.white, accentWord: key !== 'ezdev' }));
  write(join(KIT, `svg/${key}-logo-on-light.svg`), lockupSvg(PRODUCT_WORD[key], { product: key, color: BRAND.black, accentWord: key !== 'ezdev' }));
  write(join(ASSETS, `favicon-${key}.svg`), strip(markSvg({ product: key })));
}
write(join(KIT, 'svg/ez-glyph-black.svg'), strip(markSvg({ tile: false, fg: BRAND.black })));
write(join(KIT, 'svg/ez-glyph-white.svg'), strip(markSvg({ tile: false, fg: BRAND.white })));
write(join(ASSETS, 'favicon.svg'), strip(markSvg()));

// ---------- PNGs ----------
console.log('PNG');
const browser = await playwright.chromium.launch();
const page = await browser.newPage();

async function render(html, { width, height, out, transparent = false, bg = BRAND.ink }) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${transparent ? 'transparent' : bg}}
    body{display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}</style></head><body>${html}</body></html>`);
  const el = await page.$('body');
  await el.screenshot({ path: out, omitBackground: transparent });
  console.log('  ' + out.replace(root + '/', ''));
}

// App icons: gem on a deep-space square with a soft glow (iOS/Android crop their own corners).
const appIcon = (key, size) => {
  const [a, , c] = [...GRADIENTS[key], GRADIENTS[key].at(-1)];
  return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 45%, ${a}55, transparent 62%), radial-gradient(circle at 50% 60%, ${c}40, transparent 70%), ${BRAND.ink}">${markSvg({ size: Math.round(size * 0.74), product: key })}</div>`;
};

for (const key of KEYS) {
  for (const size of [1024, 512]) {
    await render(markSvg({ size, product: key }), { width: size, height: size, out: join(KIT, `png/${key}-mark-${size}.png`), transparent: true });
  }
  await render(lockupSvg(PRODUCT_WORD[key], { height: 140, product: key, color: BRAND.white, accentWord: key !== 'ezdev' }), { width: 1400, height: 220, out: join(KIT, `png/${key}-logo-on-dark.png`) });
  await render(lockupSvg(PRODUCT_WORD[key], { height: 140, product: key, color: BRAND.black, accentWord: key !== 'ezdev' }), { width: 1400, height: 220, out: join(KIT, `png/${key}-logo-on-light.png`), bg: '#ffffff' });
  await render(appIcon(key, 180), { width: 180, height: 180, out: join(ASSETS, `apple-touch-icon-${key}.png`) });
}
await render(appIcon('ezdev', 180), { width: 180, height: 180, out: join(ASSETS, 'apple-touch-icon.png') });
await render(appIcon('ezdev', 512), { width: 512, height: 512, out: join(ASSETS, 'icon-512.png') });
await render(appIcon('ezdev', 192), { width: 192, height: 192, out: join(ASSETS, 'icon-192.png') });

// Email header logo (light background, 2x for retina: shown at 150×30)
await render(`<div style="background:#ffffff;width:100%;height:100%;display:flex;align-items:center;justify-content:flex-start">${lockupSvg('DEV', { height: 60, color: BRAND.black })}</div>`,
  { width: 300, height: 60, out: join(ASSETS, 'email-logo.png'), bg: '#ffffff' });

// Social share images (1200×630), one per product
const TAGLINES = {
  ezdev: ['Build anything.', 'Ship it secure.'],
  ezapp: ['Describe it.', 'Get a working app.'],
  ezsite: ['Your website,', 'written and designed.'],
  ezdefender: ['Find the weak spots', 'before attackers do.'],
};
for (const key of KEYS) {
  const g = GRADIENTS[key];
  const grad = `linear-gradient(100deg, ${g.join(', ')})`;
  const html = `<div style="width:1200px;height:630px;box-sizing:border-box;padding:76px 88px;background:${BRAND.ink};display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:60px 60px;-webkit-mask-image:radial-gradient(ellipse 90% 80% at 80% 20%,#000,transparent 70%)"></div>
    <div style="position:absolute;right:-160px;top:-200px;width:700px;height:700px;border-radius:50%;background:${grad};filter:blur(120px);opacity:.45"></div>
    <div style="position:absolute;right:70px;top:150px;filter:drop-shadow(0 30px 80px ${g[0]}88)">${markSvg({ size: 330, product: key })}</div>
    <div style="position:relative">${lockupSvg(PRODUCT_WORD[key], { height: 64, product: key, color: BRAND.white, accentWord: key !== 'ezdev' })}</div>
    <div style="position:relative;font:800 76px/1.02 system-ui,sans-serif;letter-spacing:-.035em;max-width:760px;color:#fff">${TAGLINES[key][0]}<br><span style="background:${grad};-webkit-background-clip:text;color:transparent">${TAGLINES[key][1]}</span></div>
    <div style="position:relative;color:#A3AAC0;font:500 26px system-ui,sans-serif;letter-spacing:.02em">EZ APP · EZ SITE · EZ DEFENDER</div>
  </div>`;
  await render(html, { width: 1200, height: 630, out: join(ASSETS, `og-${key}.png`) });
  await render(html, { width: 1200, height: 630, out: join(KIT, `social/og-${key}.png`) });
}

await browser.close();
console.log('Done.');
