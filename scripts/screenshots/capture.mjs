#!/usr/bin/env node
// Captures web (1440×900 @2x) and mobile (390×844 @3x) screenshots of every EZ product,
// using a local stack filled with realistic demo data.
//
//   node --no-warnings scripts/screenshots/capture.mjs [outDir]
//
// Needs Playwright (npm i -g playwright) with Chromium.

import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createStack, PORTS, installFetchMock, claudeWriteFiles, dnsAnswer } from '../../test/harness.mjs';
import { fakeGeneration, TARGETS, DNS } from './demo-content.mjs';

const require = createRequire(import.meta.url);
let playwright;
for (const p of ['playwright', `${process.env.HOME}/.npm-global/lib/node_modules/playwright`, '/usr/local/lib/node_modules/playwright']) {
  try { playwright = require(p); break; } catch { /* try next */ }
}
if (!playwright) { console.error('Install Playwright first: npm i -g playwright && npx playwright install chromium'); process.exit(1); }

const OUT = process.argv[2] || join(process.cwd(), 'screenshots');
mkdirSync(join(OUT, 'web'), { recursive: true });
mkdirSync(join(OUT, 'mobile'), { recursive: true });
mkdirSync(join(OUT, 'web-light'), { recursive: true });
mkdirSync(join(OUT, 'mobile-light'), { recursive: true });

const DEV = `http://localhost:${PORTS.ezdev}`;
const APP = `http://localhost:${PORTS.ezapp}`;
const SITE = `http://localhost:${PORTS.ezsite}`;
const DEF = `http://localhost:${PORTS.ezdefender}`;

// ---------- Local stack with fakes for Claude, Stripe, DNS and scanned sites ----------

const stack = await createStack({ extraEnv: { STRIPE_SECRET_KEY: 'sk_demo', SUPPORT_EMAIL: 'ezdevsupport@proton.me' } });
installFetchMock(async (req) => {
  const url = new URL(req.url);
  if (url.hostname === 'api.anthropic.com') {
    const body = await req.json();
    const content = body.messages[0].content;
    const ask = /(?:from scratch:|change:)\n([\s\S]*?)\n\n/.exec(content)?.[1] || '';
    const g = fakeGeneration(ask, /EZ SITE/.test(body.system));
    return claudeWriteFiles(g.summary, g.files);
  }
  if (url.hostname === 'api.stripe.com') {
    return new Response(JSON.stringify({ data: [
      { id: 'price_pro', lookup_key: 'ezdev_pro_monthly', unit_amount: 1900, currency: 'usd', recurring: { interval: 'month' } },
      { id: 'price_biz', lookup_key: 'ezdev_business_monthly', unit_amount: 7900, currency: 'usd', recurring: { interval: 'month' } },
    ] }), { headers: { 'Content-Type': 'application/json' } });
  }
  if (url.hostname === 'cloudflare-dns.com') {
    const name = url.searchParams.get('name');
    const type = url.searchParams.get('type');
    if (name.startsWith('_ezdefender.')) {
      const site = await stack.DB.prepare('SELECT token FROM sites WHERE domain = ?').bind(name.slice(12)).first();
      return dnsAnswer(site ? [{ type: 16, data: `"ezdefender-verify=${site.token}"` }] : []);
    }
    if (type === 'A' && TARGETS[name]) return dnsAnswer([{ type: 1, data: '93.184.216.34' }], { ad: name === 'portfolio.example' });
    return dnsAnswer(DNS[`${name}|${type}`] || []);
  }
  const t = TARGETS[url.hostname];
  if (t) {
    if (url.protocol === 'http:') {
      return t.https ? new Response(null, { status: 301, headers: { Location: `https://${url.hostname}${url.pathname}` } }) : new Response(t.body, { headers: { 'Content-Type': 'text/html', ...t.headers } });
    }
    if (!t.https) throw new TypeError('connection refused');
    if (url.pathname === '/') return new Response(t.body, { headers: { 'Content-Type': 'text/html', ...t.headers } });
    if (t.exposed?.[url.pathname]) return new Response(t.exposed[url.pathname]);
    return new Response('<html>Not found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
  }
  return null;
});

const servers = [];
for (const [key, port] of Object.entries(PORTS)) {
  const srv = createServer(async (req, res) => {
    try {
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req);
      const out = await stack.apps[key].fetch(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body, duplex: 'half' }));
      const headers = {};
      out.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
      const cookies = out.headers.getSetCookie();
      if (cookies.length) headers['set-cookie'] = cookies;
      res.writeHead(out.status, headers);
      if (out.body) for await (const chunk of out.body) res.write(chunk);
      res.end();
    } catch (e) { console.error(e); res.writeHead(500).end(); }
  });
  await new Promise((r) => srv.listen(port, r));
  servers.push(srv);
}

// ---------- Browser ----------

const browser = await playwright.chromium.launch();
const blockFonts = (ctx) => ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const web = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark', isMobile: true, hasTouch: true });
const guestWeb = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const guestMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark', isMobile: true, hasTouch: true });
for (const c of [web, mobile, guestWeb, guestMobile]) await blockFonts(c);

const shots = [];
async function shot(ctx, kind, name, url, { full = false, before, wait = 300 } = {}) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load' });
  if (before) await before(page);
  await page.waitForTimeout(wait);
  const file = join(OUT, kind, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  await page.close();
  shots.push(file);
  console.log(`  ${kind}/${name}.png`);
}

// ---------- Seed a realistic account ----------

console.log('Seeding demo data…');
const seed = await web.newPage();
await seed.goto(`${DEV}/signup`);
await seed.fill('#name', 'Jordan Rivera');
await seed.fill('#email', 'jordan@example.com');
await seed.fill('#password', 'demo password 12345');
await seed.check('input[name=terms]');
await seed.click('form.form button[type=submit]');
await seed.waitForURL(/dashboard/);
const user = await stack.DB.prepare("SELECT id FROM users WHERE email = 'jordan@example.com'").first();
await stack.DB.prepare(`UPDATE users SET email_verified_at = ?, plan = 'pro', stripe_customer_id = 'cus_demo', stripe_subscription_id = 'sub_demo',
  subscription_status = 'active', current_period_end = ? WHERE id = ?`).bind(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 24 * 86400, user.id).run();

const api = seed.request;
const post = (base, path, data, asJson = true) => api.post(`${base}${path}`, {
  headers: { Origin: base, ...(asJson ? { 'Content-Type': 'application/json' } : {}) },
  ...(asJson ? { data: JSON.stringify(data) } : { form: data }), maxRedirects: 0,
});
async function newProject(base, name, prompt, followUps = []) {
  const res = await post(base, '/projects', { name, prompt }, false);
  const id = res.headers().location.split('/')[2].split('#')[0];
  for (const p of [prompt, ...followUps]) {
    const r = await post(base, `/api/projects/${id}/generate`, { prompt: p });
    await r.text();
    await stack.settle();
  }
  return id;
}

await seed.goto(`${APP}/dashboard`);
await seed.goto(`${SITE}/dashboard`);
await seed.goto(`${DEF}/dashboard`);

await newProject(APP, 'Team kanban', 'Kanban board for my team with columns and drag and drop');
await newProject(APP, 'Invoice calculator', 'Invoice calculator with tax and discounts');
const habitId = await newProject(APP, 'Streaks', 'A habit tracker with daily check-offs, streaks and a 4-week heatmap', ['Make the streak counts stand out more']);

await newProject(SITE, 'Wedding portfolio', 'Portfolio for a wedding photographer');
const bakeryId = await newProject(SITE, 'Crumb & Crust', 'A website for Crumb & Crust bakery: home, menu, our story and visit pages. Warm, hand-made feel, we specialise in sourdough.');
await post(SITE, `/api/projects/${bakeryId}/publish`, { slug: 'crumb-and-crust' });

const scanIds = {};
for (const d of ['blog.example', 'shop.example']) {
  const r = await post(DEF, '/scans', { url: d === 'blog.example' ? 'http://blog.example/' : d }, false);
  if (!/\/scans\//.test(r.headers().location)) throw new Error(`Scan of ${d} failed: ${decodeURIComponent(r.headers().location)}`);
  scanIds[d] = r.headers().location.split('/').pop();
}
const siteRes = await post(DEF, '/sites', { domain: 'portfolio.example' }, false);
const sitePath = siteRes.headers().location;
await post(DEF, `${sitePath}/verify`, {}, false);
const deep = await post(DEF, '/scans', { url: 'portfolio.example' }, false);
scanIds['portfolio.example'] = deep.headers().location.split('/').pop();
await post(DEF, `${sitePath}/monitor`, { on: '1' }, false);
await post(DEF, '/sites', { domain: 'shop.example' }, false);
const port = await stack.DB.prepare("SELECT id FROM sites WHERE domain = 'portfolio.example'").first();
await stack.DB.prepare('INSERT INTO alerts (user_id, site_id, message, created_at) VALUES (?, ?, ?, ?)')
  .bind(user.id, port.id, 'HSTS max-age was shortened to 1 day after yesterday’s deploy.', Math.floor(Date.now() / 1000) - 3 * 3600).run();
await seed.close();

// Sessions: the mobile context signs in as the same user.
const mLogin = await mobile.newPage();
await mLogin.goto(`${DEV}/login`);
await mLogin.fill('#email', 'jordan@example.com');
await mLogin.fill('#password', 'demo password 12345');
await mLogin.click('form.form button[type=submit]');
await mLogin.waitForURL(/dashboard/);
for (const base of [APP, SITE, DEF]) await mLogin.goto(`${base}/dashboard`);
await mLogin.close();

// ---------- Capture ----------

const openCode = async (p) => { await p.click('[data-view=code]'); await p.waitForTimeout(400); await p.click('.file-list li:nth-child(3) button').catch(() => {}); };
const previewReady = async (p) => { await p.waitForSelector('#preview:not([hidden])'); await p.waitForTimeout(900); };

console.log('Web:');
await shot(guestWeb, 'web', '01-ezdev-home', `${DEV}/`);
await shot(guestWeb, 'web', '02-ezdev-home-full', `${DEV}/`, { full: true });
await shot(guestWeb, 'web', '03-pricing', `${DEV}/pricing`);
await shot(guestWeb, 'web', '04-sign-up', `${DEV}/signup`);
await shot(web, 'web', '05-ezdev-dashboard', `${DEV}/dashboard`);
await shot(web, 'web', '06-account-billing', `${DEV}/account`, { full: true });
await shot(guestWeb, 'web', '07-ezapp-home', `${APP}/`);
await shot(web, 'web', '08-ezapp-dashboard', `${APP}/dashboard`);
await shot(web, 'web', '09-ezapp-editor', `${APP}/projects/${habitId}`, { before: previewReady });
await shot(web, 'web', '10-ezapp-editor-mobile-preview', `${APP}/projects/${habitId}`, { before: async (p) => { await previewReady(p); await p.click('[data-device=mobile]'); } });
await shot(web, 'web', '11-ezapp-code', `${APP}/projects/${habitId}`, { before: openCode });
await shot(guestWeb, 'web', '12-ezsite-home', `${SITE}/`);
await shot(web, 'web', '13-ezsite-dashboard', `${SITE}/dashboard`);
await shot(web, 'web', '14-ezsite-editor', `${SITE}/projects/${bakeryId}`, { before: previewReady });
await shot(web, 'web', '15-ezsite-publish', `${SITE}/projects/${bakeryId}`, { before: async (p) => { await previewReady(p); await p.click('#publish-btn'); } });
await shot(guestWeb, 'web', '16-ezsite-published-site', `${SITE}/p/crumb-and-crust/`);
await shot(guestWeb, 'web', '17-ezdefender-home', `${DEF}/`);
await shot(web, 'web', '18-ezdefender-dashboard', `${DEF}/dashboard`);
await shot(web, 'web', '19-ezdefender-report-f', `${DEF}/scans/${scanIds['blog.example']}`);
await shot(web, 'web', '20-ezdefender-report-full', `${DEF}/scans/${scanIds['shop.example']}`, { full: true });
await shot(web, 'web', '21-ezdefender-report-a-plus', `${DEF}/scans/${scanIds['portfolio.example']}`);
await shot(web, 'web', '22-ezdefender-verified-site', `${DEF}${sitePath}`);

console.log('Mobile:');
await shot(guestMobile, 'mobile', '01-ezdev-home', `${DEV}/`);
await shot(guestMobile, 'mobile', '02-ezdev-products', `${DEV}/#products`);
await shot(guestMobile, 'mobile', '03-pricing', `${DEV}/pricing`);
await shot(mobile, 'mobile', '04-ezdev-dashboard', `${DEV}/dashboard`);
await shot(guestMobile, 'mobile', '05-ezapp-home', `${APP}/`);
await shot(mobile, 'mobile', '06-ezapp-dashboard', `${APP}/dashboard`);
await shot(mobile, 'mobile', '07-ezapp-editor', `${APP}/projects/${habitId}`, { before: previewReady });
await shot(mobile, 'mobile', '08-ezapp-preview', `${APP}/projects/${habitId}`, { before: async (p) => { await previewReady(p); await p.evaluate(() => document.getElementById('preview-pane').scrollIntoView()); } });
await shot(guestMobile, 'mobile', '09-ezsite-home', `${SITE}/`);
await shot(mobile, 'mobile', '10-ezsite-editor', `${SITE}/projects/${bakeryId}`, { before: previewReady });
await shot(guestMobile, 'mobile', '11-ezsite-published-site', `${SITE}/p/crumb-and-crust/`);
await shot(guestMobile, 'mobile', '12-ezdefender-home', `${DEF}/`);
await shot(mobile, 'mobile', '13-ezdefender-dashboard', `${DEF}/dashboard`);
await shot(mobile, 'mobile', '14-ezdefender-report', `${DEF}/scans/${scanIds['blog.example']}`);
await shot(mobile, 'mobile', '15-ezdefender-report-full', `${DEF}/scans/${scanIds['shop.example']}`, { full: true });
await shot(mobile, 'mobile', '16-account-billing', `${DEV}/account`);

console.log('Light theme:');
const lightWeb = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
const lightMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'light' });
const lightGuest = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light' });
for (const c of [lightWeb, lightMobile, lightGuest]) await blockFonts(c);
for (const ctx of [lightWeb, lightMobile]) {
  const p = await ctx.newPage();
  await p.goto(`${DEV}/login`);
  await p.fill('#email', 'jordan@example.com');
  await p.fill('#password', 'demo password 12345');
  await p.click('form.form button[type=submit]');
  await p.waitForURL(/dashboard/);
  for (const base of [APP, SITE, DEF]) await p.goto(`${base}/dashboard`);
  await p.close();
}
await shot(lightGuest, 'web-light', '01-ezdev-home', `${DEV}/`);
await shot(lightGuest, 'web-light', '02-ezdev-home-full', `${DEV}/`, { full: true });
await shot(lightGuest, 'web-light', '03-pricing', `${DEV}/pricing`);
await shot(lightWeb, 'web-light', '05-ezdev-dashboard', `${DEV}/dashboard`);
await shot(lightWeb, 'web-light', '08-ezapp-dashboard', `${APP}/dashboard`);
await shot(lightWeb, 'web-light', '09-ezapp-editor', `${APP}/projects/${habitId}`, { before: previewReady });
await shot(lightGuest, 'web-light', '12-ezsite-home', `${SITE}/`);
await shot(lightWeb, 'web-light', '18-ezdefender-dashboard', `${DEF}/dashboard`);
await shot(lightWeb, 'web-light', '19-ezdefender-report-f', `${DEF}/scans/${scanIds['blog.example']}`);
await shot(lightMobile, 'mobile-light', '01-ezdev-home', `${DEV}/`);
await shot(lightMobile, 'mobile-light', '04-ezdev-dashboard', `${DEV}/dashboard`);
await shot(lightMobile, 'mobile-light', '13-ezdefender-dashboard', `${DEF}/dashboard`);

await browser.close();
for (const s of servers) s.close();
console.log(`\n${shots.length} screenshots in ${OUT}`);
process.exit(0);
