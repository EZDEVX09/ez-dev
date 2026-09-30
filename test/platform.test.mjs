// End-to-end tests for EZ DEV, EZ APP, EZ SITE and EZ DEFENDER.
// Run: node --test test/

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStack, Browser, installFetchMock, claudeWriteFiles, dnsAnswer } from './harness.mjs';

const DEV = 'http://localhost:8787';
const APP = 'http://localhost:8788';
const SITE = 'http://localhost:8789';
const DEF = 'http://localhost:8790';

let stack;
let restoreFetch;
let claudeQueue = [];
let claudeRequests = [];
const sites = new Map(); // host -> (req) => Response
const dns = new Map(); // `${name}|${type}` -> records

before(async () => {
  stack = await createStack();
  restoreFetch = installFetchMock(async (req) => {
    const url = new URL(req.url);
    if (url.hostname === 'api.anthropic.com') {
      claudeRequests.push(await req.json());
      const next = claudeQueue.shift();
      if (!next) return new Response('{"error":"no mock"}', { status: 500 });
      return typeof next === 'function' ? next() : next;
    }
    if (url.hostname === 'cloudflare-dns.com') {
      const key = `${url.searchParams.get('name')}|${url.searchParams.get('type')}`;
      const rec = dns.get(key);
      if (rec === undefined) {
        const name = url.searchParams.get('name');
        const type = url.searchParams.get('type');
        if (type === 'A' && sites.has(name)) return dnsAnswer([{ name, type: 1, data: '93.184.216.34' }]);
        return dnsAnswer([]);
      }
      return dnsAnswer(rec.records || rec, { ad: !!rec.ad });
    }
    const handler = sites.get(url.hostname);
    if (handler) return handler(req);
    return null;
  });
});

after(() => restoreFetch());

async function signup(b, { name = 'Ada Lovelace', email = `ada${Math.random().toString(36).slice(2, 8)}@example.com`, password = 'correct horse battery' } = {}) {
  const res = await b.post(`${DEV}/signup`, { form: { name, email, password, terms: '1' } });
  assert.equal(res.status, 303, await res.clone().text());
  return { email, password };
}

async function ssoInto(b, base) {
  const res = await b.get(`${base}/dashboard`, { follow: true });
  assert.equal(res.status, 200);
  assert.equal(new URL(res.finalUrl).origin, base);
  return res;
}

// ---------------------------------------------------------------- EZ DEV

test('landing pages render with security headers', async () => {
  const b = new Browser(stack);
  for (const [base, name] of [[DEV, 'EZ DEV'], [APP, 'EZ APP'], [SITE, 'EZ SITE'], [DEF, 'EZ DEFENDER']]) {
    const res = await b.get(`${base}/`);
    assert.equal(res.status, 200, base);
    const html = await res.text();
    assert.ok(html.includes(name), `${base} mentions ${name}`);
    assert.match(res.headers.get('Content-Security-Policy'), /script-src 'self'/);
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  }
  const home = await (await b.get(`${DEV}/`)).text();
  for (const p of ['EZ APP', 'EZ SITE', 'EZ DEFENDER', 'PARENT COMPANY']) assert.ok(home.includes(p), p);
  const css = await b.get(`${DEV}/assets/ez.css`);
  assert.equal(css.status, 200);
  for (const path of ['/pricing', '/contact', '/privacy', '/terms', '/security', '/.well-known/security.txt', '/login', '/signup']) {
    assert.equal((await b.get(`${DEV}${path}`)).status, 200, path);
  }
  assert.equal((await b.get(`${DEV}/nope`)).status, 404);
});

test('sign up, sign in, validation and rate limits', async () => {
  const b = new Browser(stack);
  const { email, password } = await signup(b, { name: 'Grace Hopper' });
  const dash = await b.get(`${DEV}/dashboard`);
  assert.equal(dash.status, 200);
  assert.ok((await dash.text()).includes('Hi, Grace'));

  const dup = await new Browser(stack).post(`${DEV}/signup`, { form: { name: 'X', email, password, terms: '1' } });
  assert.equal(dup.status, 409);
  const weak = await new Browser(stack).post(`${DEV}/signup`, { form: { name: 'X', email: 'weak@example.com', password: 'short', terms: '1' } });
  assert.equal(weak.status, 400);

  const b2 = new Browser(stack);
  assert.equal((await b2.post(`${DEV}/login`, { form: { email, password: 'wrong password!' } })).status, 401);
  const ok = await b2.post(`${DEV}/login`, { form: { email: email.toUpperCase(), password } });
  assert.equal(ok.status, 303);
  assert.equal((await b2.get(`${DEV}/dashboard`)).status, 200);

  // Password hashes are never stored in plain text
  const row = await stack.DB.prepare('SELECT password_hash FROM users WHERE email = ?').bind(email).first();
  assert.match(row.password_hash, /^pbkdf2\$100000\$/);

  // Per-email login rate limit
  const b3 = new Browser(stack);
  let last;
  for (let i = 0; i < 11; i++) last = await b3.post(`${DEV}/login`, { form: { email, password: 'nope nope nope' } });
  assert.equal(last.status, 429);
});

test('cross-site POSTs are blocked (CSRF)', async () => {
  const b = new Browser(stack);
  const res = await b.post(`${DEV}/login`, { form: { email: 'a@b.co', password: 'x' }, origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  const noOrigin = await b.post(`${DEV}/login`, { form: { email: 'a@b.co', password: 'x' }, origin: false });
  assert.equal(noOrigin.status, 403);
});

test('single sign-on flows from EZ DEV into each subsidiary', async () => {
  const b = new Browser(stack);
  // Not signed in: subsidiary sends you to EZ DEV login
  const r1 = await b.get(`${APP}/dashboard`, { follow: true });
  assert.equal(new URL(r1.finalUrl).origin, DEV);
  assert.ok(r1.finalUrl.includes('/login?next='));

  await signup(b, { name: 'Katherine Johnson' });
  for (const base of [APP, SITE, DEF]) {
    const res = await ssoInto(b, base);
    assert.ok((await res.text()).includes('Katherine'), base);
  }

  // The handoff only issues codes to EZ product origins
  const bad = await b.get(`${DEV}/auth/handoff?return_to=${encodeURIComponent('https://evil.example/auth/callback')}&state=abcdefghijklmnop`);
  assert.equal(bad.status, 400);

  // A replayed or forged callback is rejected
  const forged = await b.get(`${APP}/auth/callback?code=nope&state=abc`);
  assert.equal(forged.status, 400);

  // Signing out anywhere signs out everywhere
  const out = await b.post(`${APP}/auth/logout`);
  assert.equal(out.status, 303);
  assert.equal((await b.get(`${SITE}/dashboard`)).status, 303);
  assert.equal((await b.get(`${DEV}/dashboard`)).status, 303);
});

// ---------------------------------------------------------------- EZ APP

const APP_FILES = [
  { path: 'index.html', content: '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Habit Tracker</h1><script src="app.js"></script></body></html>' },
  { path: 'styles.css', content: 'body{font-family:sans-serif}' },
  { path: 'app.js', content: `// ${'habit '.repeat(400)}\nconsole.log("hi")` },
];

async function readNdjson(res) {
  const text = await res.text();
  await stack.settle();
  return text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('EZ APP: create, generate, preview, iterate, restore, publish, download', async () => {
  const b = new Browser(stack);
  await signup(b, { name: 'Linus' });
  await ssoInto(b, APP);

  const created = await b.post(`${APP}/projects`, { form: { prompt: 'A habit tracker with streaks', name: '' } });
  assert.equal(created.status, 303);
  const loc = created.headers.get('Location');
  assert.match(loc, /^\/projects\/[\w-]+#build=/);
  const id = loc.split('/')[2].split('#')[0];

  const editor = await b.get(`${APP}/projects/${id}`);
  assert.equal(editor.status, 200);
  const editorHtml = await editor.text();
  const data = JSON.parse(/<script type="application\/json" id="ez-data">(.*?)<\/script>/s.exec(editorHtml)[1]);
  assert.equal(data.currentVersion, 0);

  claudeQueue.push(claudeWriteFiles('Built a habit tracker with daily streaks.', APP_FILES));
  const gen = await b.post(`${APP}/api/projects/${id}/generate`, { json: { prompt: 'A habit tracker with streaks' } });
  assert.equal(gen.status, 200);
  const events = await readNdjson(gen);
  const done = events.find((e) => e.type === 'done');
  assert.ok(done, JSON.stringify(events));
  assert.equal(done.version, 1);
  assert.ok(events.some((e) => e.type === 'progress'));

  // Claude got the product system prompt and was forced to use the tool
  const sent = claudeRequests.at(-1);
  assert.equal(sent.tool_choice.name, 'write_files');
  assert.match(sent.system, /EZ APP/);
  assert.equal(sent.stream, true);

  // Sandboxed preview, guarded by the project's preview key (not the session)
  const anon = new Browser(stack);
  const prev = await anon.get(`${APP}/preview/${id}/${data.previewKey}/1/`);
  assert.equal(prev.status, 200);
  assert.ok((await prev.text()).includes('Habit Tracker'));
  assert.match(prev.headers.get('Content-Security-Policy'), /^sandbox allow-scripts/);
  const css = await anon.get(`${APP}/preview/${id}/${data.previewKey}/1/styles.css`);
  assert.equal(css.headers.get('Content-Type'), 'text/css; charset=utf-8');
  assert.equal((await anon.get(`${APP}/preview/${id}/wrongkey123/1/`)).status, 404);

  // Iterate: the current files are sent back to Claude
  claudeQueue.push(claudeWriteFiles('Added dark mode.', [{ ...APP_FILES[0], content: APP_FILES[0].content.replace('Habit Tracker', 'Habit Tracker (dark)') }, APP_FILES[1], APP_FILES[2]]));
  const gen2 = await readNdjson(await b.post(`${APP}/api/projects/${id}/generate`, { json: { prompt: 'Add dark mode' } }));
  assert.equal(gen2.find((e) => e.type === 'done').version, 2);
  assert.match(claudeRequests.at(-1).messages[0].content, /<file path="index.html">/);
  assert.match(claudeRequests.at(-1).messages[0].content, /Add dark mode/);

  // Restore v1 → becomes v3
  const restored = await (await b.post(`${APP}/api/projects/${id}/restore`, { json: { version: 1 } })).json();
  assert.equal(restored.version, 3);
  const files = await (await b.get(`${APP}/api/projects/${id}/files?v=3`, { headers: { Accept: 'application/json' } })).json();
  assert.ok(!files.files[0].content.includes('(dark)'));

  // Publish → public URL works without any cookies; unpublish → gone
  const pub = await (await b.post(`${APP}/api/projects/${id}/publish`, { json: { slug: 'My Habits!' } })).json();
  assert.equal(pub.slug, 'my-habits');
  const live = await new Browser(stack).get(`${APP}/p/my-habits/`);
  assert.equal(live.status, 200);
  assert.match(live.headers.get('Content-Security-Policy'), /sandbox/);
  await b.post(`${APP}/api/projects/${id}/unpublish`, { json: {} });
  assert.equal((await new Browser(stack).get(`${APP}/p/my-habits/`)).status, 404);

  // Download a real zip
  const zip = await b.get(`${APP}/projects/${id}/download?v=3`);
  assert.equal(zip.headers.get('Content-Type'), 'application/zip');
  const bytes = new Uint8Array(await zip.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'PK\u0003\u0004');

  // Someone else can't see or edit it
  const other = new Browser(stack);
  await signup(other, { name: 'Mallory' });
  await ssoInto(other, APP);
  assert.equal((await other.get(`${APP}/projects/${id}`)).status, 404);
  assert.equal((await other.post(`${APP}/api/projects/${id}/generate`, { json: { prompt: 'x' } })).status, 404);
});

test('EZ APP: bad AI output and quota limits are handled', async () => {
  const b = new Browser(stack);
  await signup(b, { name: 'Quota Tester' });
  await ssoInto(b, APP);
  const id = (await b.post(`${APP}/projects`, { form: { prompt: 'x' } })).headers.get('Location').split('/')[2].split('#')[0];

  claudeQueue.push(claudeWriteFiles('evil', [{ path: '../../etc/passwd', content: 'x' }, { path: 'index.html', content: 'x' }]));
  const bad = await readNdjson(await b.post(`${APP}/api/projects/${id}/generate`, { json: { prompt: 'x' } }));
  assert.equal(bad.at(-1).type, 'error');
  assert.match(bad.at(-1).message, /invalid file name/);

  claudeQueue.push(() => new Response('{"type":"error"}', { status: 529 }));
  const busy = await readNdjson(await b.post(`${APP}/api/projects/${id}/generate`, { json: { prompt: 'x' } }));
  assert.match(busy.at(-1).message, /busy/);

  const user = await stack.DB.prepare("SELECT id FROM users WHERE name = 'Quota Tester'").first();
  await stack.DB.prepare('INSERT INTO usage (user_id, kind, period, count) VALUES (?, ?, ?, ?)').bind(user.id, 'ai_generation', new Date().toISOString().slice(0, 7), 20).run();
  const limited = await b.post(`${APP}/api/projects/${id}/generate`, { json: { prompt: 'x' } });
  assert.equal(limited.status, 402);
});

// ---------------------------------------------------------------- EZ SITE

test('EZ SITE: multi-page site generation and publishing', async () => {
  const b = new Browser(stack);
  await signup(b, { name: 'Bakery Owner' });
  await ssoInto(b, SITE);
  const id = (await b.post(`${SITE}/projects`, { form: { prompt: 'A bakery website', name: 'Sourdough Co' } })).headers.get('Location').split('/')[2].split('#')[0];
  claudeQueue.push(claudeWriteFiles('Built a 3-page bakery site.', [
    { path: 'index.html', content: '<h1>Sourdough Co</h1><a href="about.html">About</a>' },
    { path: 'about.html', content: '<h1>About us</h1>' },
    { path: 'styles.css', content: 'h1{color:brown}' },
  ]));
  const ev = await readNdjson(await b.post(`${SITE}/api/projects/${id}/generate`, { json: { prompt: 'A bakery website' } }));
  assert.equal(ev.at(-1).type, 'done');
  assert.match(claudeRequests.at(-1).system, /EZ SITE/);

  await b.post(`${SITE}/api/projects/${id}/publish`, { json: { slug: 'sourdough-co' } });
  const anon = new Browser(stack);
  assert.ok((await (await anon.get(`${SITE}/p/sourdough-co/`)).text()).includes('Sourdough Co'));
  assert.ok((await (await anon.get(`${SITE}/p/sourdough-co/about`)).text()).includes('About us'));
  // EZ APP doesn't serve EZ SITE projects
  assert.equal((await anon.get(`${APP}/p/sourdough-co/`)).status, 404);

  const dash = await (await b.get(`${SITE}/dashboard`)).text();
  assert.ok(dash.includes('Sourdough Co'));
  assert.ok(dash.includes('Live at /p/sourdough-co'));
});

// ---------------------------------------------------------------- EZ DEFENDER

function weakSite(req) {
  const url = new URL(req.url);
  if (url.protocol === 'http:') return new Response('plain', { status: 200 });
  if (url.pathname === '/.git/HEAD') return new Response('ref: refs/heads/main\n');
  if (url.pathname === '/.env') return new Response('DB_PASSWORD=hunter2\nAPI_KEY=abc\n');
  if (url.pathname === '/') {
    return new Response('<html><head><meta name="generator" content="WordPress 5.2"><script src="https://code.jquery.com/jquery-1.12.4.min.js"></script></head><body><form action="http://weak.test/login"></form><img src="http://weak.test/a.png"></body></html>', {
      headers: { 'Content-Type': 'text/html', Server: 'Apache/2.4.29', 'X-Powered-By': 'PHP/7.1', 'Set-Cookie': 'sid=1; Path=/', 'Access-Control-Allow-Origin': req.headers.get('Origin') || '', 'Access-Control-Allow-Credentials': 'true' },
    });
  }
  return new Response('<html>not found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
}

test('EZ DEFENDER: scans grade weak and strong sites with fix guides', async () => {
  const b = new Browser(stack);
  await signup(b, { name: 'Sec Ops' });
  await ssoInto(b, DEF);

  sites.set('weak.test', weakSite);
  const res = await b.post(`${DEF}/scans`, { form: { url: 'weak.test' } });
  assert.equal(res.status, 303, await res.clone().text());
  const report = await b.get(new URL(res.headers.get('Location'), DEF).toString());
  const html = await report.text();
  assert.ok(html.includes('grade-f'), 'weak site gets an F');
  for (const t of ['HSTS missing', 'Content Security Policy missing', 'CORS trusts any website with credentials', 'Outdated JavaScript libraries', 'Form submits over HTTP', 'Server software version exposed', 'How to fix']) {
    assert.ok(html.includes(t), t);
  }
  assert.ok(!html.includes('Git repository exposed'), 'deep checks skipped for unverified sites');

  // EZ DEV's own responses should grade well: point a host at the EZ DEV worker
  sites.set('ezdev.test', async (req) => {
    const u = new URL(req.url);
    if (u.protocol === 'http:') return new Response(null, { status: 301, headers: { Location: `https://ezdev.test${u.pathname}` } });
    const r = await stack.apps.ezdev.fetch(new Request(`${DEV}${u.pathname}`, { headers: req.headers }));
    return r;
  });
  dns.set('ezdev.test|TXT', [{ type: 16, data: '"v=spf1 -all"' }]);
  dns.set('_dmarc.ezdev.test|TXT', [{ type: 16, data: '"v=DMARC1; p=reject"' }]);
  dns.set('ezdev.test|CAA', [{ type: 257, data: '0 issue "letsencrypt.org"' }]);
  dns.set('ezdev.test|A', { records: [{ type: 1, data: '93.184.216.34' }], ad: true });
  const good = await b.post(`${DEF}/scans`, { form: { url: 'https://ezdev.test/' } });
  const goodHtml = await (await b.get(new URL(good.headers.get('Location'), DEF).toString())).text();
  assert.ok(goodHtml.includes('grade-aplus') || goodHtml.includes('grade-a"'), `EZ DEV grades A/A+: ${/Score (\d+)/.exec(goodHtml)?.[1]}`);
});

test('EZ DEFENDER: blocks private and internal targets (SSRF)', async () => {
  const b = new Browser(stack);
  await signup(b, { name: 'SSRF Tester' });
  await ssoInto(b, DEF);
  sites.set('sneaky.test', weakSite);
  dns.set('sneaky.test|A', [{ type: 1, data: '10.0.0.5' }]);
  for (const target of ['localhost', 'http://127.0.0.1/', 'http://10.1.2.3', 'https://[::1]/', 'intranet', 'ftp://example.com', 'https://example.com:8443/', 'sneaky.test']) {
    const res = await b.post(`${DEF}/scans`, { form: { url: target } });
    assert.equal(res.status, 303, target);
    assert.match(res.headers.get('Location'), /^\/dashboard\?error=/, target);
  }
});

test('EZ DEFENDER: ownership verification, deep scan and monitoring alerts', async () => {
  const b = new Browser(stack);
  await signup(b, { name: 'Site Owner' });
  await ssoInto(b, DEF);
  let healthy = true;
  sites.set('owned.test', (req) => {
    const u = new URL(req.url);
    if (u.protocol === 'http:') return new Response(null, { status: 301, headers: { Location: `https://owned.test${u.pathname}` } });
    if (u.pathname === '/.git/HEAD' && !healthy) return new Response('ref: refs/heads/main\n');
    return new Response('<html><body>ok</body></html>', {
      status: u.pathname === '/' ? 200 : 404,
      headers: { 'Content-Type': 'text/html', 'Strict-Transport-Security': 'max-age=31536000', 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=()' },
    });
  });

  const add = await b.post(`${DEF}/sites`, { form: { domain: 'https://owned.test/some/page' } });
  const sitePath = add.headers.get('Location');
  assert.match(sitePath, /^\/sites\//);
  const site = await stack.DB.prepare("SELECT * FROM sites WHERE domain = 'owned.test'").first();
  assert.ok(site);

  // Monitoring requires verification
  const early = await b.post(`${DEF}${sitePath}/monitor`, { form: { on: '1' } });
  assert.match(early.headers.get('Location'), /error=/);

  // Wrong record fails, right record verifies
  const fail = await b.post(`${DEF}${sitePath}/verify`);
  assert.match(fail.headers.get('Location'), /error=/);
  dns.set('_ezdefender.owned.test|TXT', [{ type: 16, data: `"ezdefender-verify=${site.token}"` }]);
  const ok = await b.post(`${DEF}${sitePath}/verify`);
  assert.match(ok.headers.get('Location'), /msg=Verified/);

  // Deep scan runs exposure checks
  const s1 = await b.post(`${DEF}/scans`, { form: { url: 'owned.test' } });
  const h1 = await (await b.get(new URL(s1.headers.get('Location'), DEF).toString())).text();
  assert.ok(h1.includes('Deep scan'));
  assert.ok(h1.includes('No sensitive files exposed'));

  // Monitoring: turn on, regress the site, run the scheduled job → alert
  assert.match((await b.post(`${DEF}${sitePath}/monitor`, { form: { on: '1' } })).headers.get('Location'), /msg=/);
  await stack.DB.prepare('UPDATE sites SET last_scan_at = 0 WHERE id = ?').bind(site.id).run();
  healthy = false;
  const n = await stack.apps.ezdefender.module.runMonitoring(stack.env);
  assert.ok(n >= 1);
  const dash = await (await b.get(`${DEF}/dashboard`)).text();
  assert.ok(dash.includes('New alerts'));
  assert.ok(dash.includes('Git repository exposed'));

  // Plan limit: free plan monitors 1 site
  const add2 = await b.post(`${DEF}/sites`, { form: { domain: 'second.test' } });
  const s2 = await stack.DB.prepare("SELECT * FROM sites WHERE domain = 'second.test'").first();
  await stack.DB.prepare('UPDATE sites SET verified_at = 1 WHERE id = ?').bind(s2.id).run();
  const lim = await b.post(`${DEF}${add2.headers.get('Location')}/monitor`, { form: { on: '1' } });
  assert.match(decodeURIComponent(lim.headers.get('Location')), /plan includes 1 monitored/);
});

// ---------------------------------------------------------------- Account lifecycle

test('changing password signs out other sessions; deleting the account removes everything', async () => {
  const a = new Browser(stack);
  const { email, password } = await signup(a, { name: 'Leaving User' });
  await ssoInto(a, APP);
  await a.post(`${APP}/projects`, { form: { prompt: 'x' } });

  const other = new Browser(stack);
  await other.post(`${DEV}/login`, { form: { email, password } });
  assert.equal((await other.get(`${DEV}/dashboard`)).status, 200);

  const changed = await a.post(`${DEV}/account/password`, { form: { current: password, password: 'a brand new password' } });
  assert.match(changed.headers.get('Location'), /msg=Password/);
  assert.equal((await other.get(`${DEV}/dashboard`)).status, 303, 'other device signed out');
  assert.equal((await a.get(`${DEV}/dashboard`)).status, 200, 'this device stays signed in');

  const wrong = await a.post(`${DEV}/account/delete`, { form: { confirm: email, password: 'nope' } });
  assert.match(wrong.headers.get('Location'), /error=/);
  const del = await a.post(`${DEV}/account/delete`, { form: { confirm: email, password: 'a brand new password' } });
  assert.equal(del.headers.get('Location'), '/?signed_out=1');
  const user = await stack.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  assert.equal(user, null);
  const orphans = await stack.DB.prepare("SELECT COUNT(*) AS n FROM projects p LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL").first();
  assert.equal(orphans.n, 0);
});

test('hero prompt box sends people to the right product with their text filled in', async () => {
  const b = new Browser(stack);
  const home = await (await b.get(`${DEV}/`)).text();
  assert.ok(home.includes('id="hx-form"') && home.includes('/assets/hero.js'));
  const app = await b.get(`${DEV}/start?mode=app&q=${encodeURIComponent('A habit tracker')}`);
  assert.equal(app.headers.get('Location'), `${APP}/dashboard?prompt=A%20habit%20tracker`);
  const site = await b.get(`${DEV}/start?mode=site&q=bakery`);
  assert.equal(site.headers.get('Location'), `${SITE}/dashboard?prompt=bakery`);
  const scan = await b.get(`${DEV}/start?mode=scan&q=example.com`);
  assert.equal(scan.headers.get('Location'), `${DEF}/dashboard?url=example.com`);

  // Signed-in users land on the builder with the prompt pre-filled (and escaped)
  await signup(b, { name: 'Hero User' });
  const r = await b.get(`${APP}/dashboard?prompt=${encodeURIComponent('<b>tracker</b>')}`, { follow: true });
  const html = await r.text();
  assert.ok(html.includes('&lt;b&gt;tracker&lt;/b&gt;</textarea>'));
});

test('forms may redirect between the four EZ sites, and nowhere else (CSP form-action)', async () => {
  const res = await new Browser(stack).get(`${DEV}/`);
  const csp = res.headers.get('Content-Security-Policy');
  for (const o of [DEV, APP, SITE, DEF]) assert.ok(csp.includes(o), o);
  // Sign-in on EZ DEV and sign-out on the subsidiaries redirect across the EZ sites too
  for (const u of [`${DEV}/login`, `${APP}/`, `${DEF}/`]) {
    const c = (await new Browser(stack).get(u)).headers.get('Content-Security-Policy');
    assert.ok(c.includes(`form-action 'self' ${DEV} ${APP} ${SITE} ${DEF}`), u);
  }
});
