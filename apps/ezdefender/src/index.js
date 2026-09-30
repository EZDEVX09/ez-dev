// EZ DEFENDER — website & app security toolbox

import { h, html, serve, Redirect, HttpError, assertSameOrigin, readForm, randomId, now, timeAgo, json } from '../../../shared/http.js';
import { getUser, requireUser } from '../../../shared/auth.js';
import { planFor, getUsage, addUsage, dayPeriod, productUrl } from '../../../shared/config.js';
import { sendTemplate } from '../../../shared/email.js';
import { page, errorPage, icons, flash } from '../../../shared/ui.js';
import { subsidiaryRouter } from '../../../shared/subsidiary.js';
import { scan, ScanError, GUIDES, normalizeTarget, normalizeDomain, checkVerification } from './scanner.js';

const NAV = [
  { href: '/#checks', label: 'What we check' },
  { href: '/#how', label: 'How it works' },
];

const router = subsidiaryRouter('ezdefender');
const allowPrivate = (env) => env.ALLOW_PRIVATE_TARGETS === 'true'; // local testing only
const gradeClass = (g) => `grade grade-${String(g || '').replace('+', 'plus').toLowerCase() || 'none'}`;
const statusIcon = { pass: icons.check, fail: icons.x, warn: icons.alert, info: icons.info };
const statusLabel = { pass: 'Passed', fail: 'Failed', warn: 'Warning', info: 'Info' };

// ---------- Landing ----------

router.get('/', async (c) => {
  const user = await getUser(c.req, c.env);
  const start = user ? '/dashboard' : '/auth/start?next=/dashboard';
  const groups = [
    ['Encryption', 'HTTPS, redirects and HSTS so traffic can’t be read or tampered with.'],
    ['Security headers', 'Content Security Policy, clickjacking, MIME sniffing, referrer and permissions policies.'],
    ['Cookies & CORS', 'Session cookie flags and cross-origin rules that could expose logged-in users.'],
    ['Page content', 'Mixed content, insecure forms, outdated JavaScript libraries and unverified third-party scripts.'],
    ['Email & DNS', 'SPF, DMARC, CAA and DNSSEC, which stop people spoofing your domain.'],
    ['Exposed files', 'Leaked .git folders, .env secrets, database dumps and backups (verified sites only).'],
  ];
  const body = h`
<section class="hero wrap">
  <p class="pill"><span class="dot"></span>EZ DEFENDER · an EZ DEV company</p>
  <h1 class="display-xl">Find the weak spots<br><span class="accent-text">before attackers do.</span></h1>
  <p class="lead">EZ DEFENDER scans your website or web app, grades its security, and explains every fix in plain English. Then it keeps watch and alerts you when something changes.</p>
  <div class="cta-row">
    <a class="btn btn-lg" href="${start}">Scan my site ${icons.arrow}</a>
    <a class="btn btn-ghost btn-lg" href="#checks">What we check</a>
  </div>
</section>

<section id="checks" class="wrap pad-lg">
  <p class="eyebrow">What we check</p>
  <h2 class="display-md">Over 25 checks across six areas.</h2>
  <ul class="example-grid three">
    ${groups.map(([t, d]) => h`<li class="card"><h3 class="h3">${t}</h3><p>${d}</p></li>`)}
  </ul>
</section>

<section id="how" class="wrap pad-lg">
  <p class="eyebrow">How it works</p>
  <h2 class="display-md">Scan. Fix. Stay protected.</h2>
  <ol class="steps">
    <li class="card"><span class="step-n">1</span><h3 class="h3">Scan any URL</h3><p>Get a grade from A+ to F in seconds, with every finding explained.</p></li>
    <li class="card"><span class="step-n">2</span><h3 class="h3">Verify you own it</h3><p>Add a DNS record or a small file to unlock deep checks for leaked files and secrets.</p></li>
    <li class="card"><span class="step-n">3</span><h3 class="h3">Monitor daily</h3><p>We rescan verified sites every day and alert you when your grade drops or a new issue appears.</p></li>
  </ol>
</section>

<section class="wrap pad-lg">
  <div class="cta-band card">
    <div>
      <h2 class="display-sm">Only scan what you’re allowed to.</h2>
      <p class="muted">Quick scans read only what any browser can see. Deep checks run only on sites you’ve verified you own.</p>
    </div>
    <a class="btn btn-lg" href="${start}">Get started</a>
  </div>
</section>`;
  return html(page({ env: c.env, product: 'ezdefender', user, body, nav: NAV, description: 'EZ DEFENDER scans websites and apps for security issues and explains every fix.' }));
});

// ---------- Dashboard ----------

router.get('/dashboard', async (c) => {
  const user = await requireUser(c);
  const plan = planFor(user);
  const env = c.env;
  const [sites, scans, alerts, usedToday] = await Promise.all([
    env.DB.prepare('SELECT * FROM sites WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all(),
    env.DB.prepare('SELECT id, url, grade, score, deep, created_at FROM scans WHERE user_id = ? ORDER BY created_at DESC LIMIT 15').bind(user.id).all(),
    env.DB.prepare('SELECT a.id, a.message, a.created_at, s.domain FROM alerts a LEFT JOIN sites s ON s.id = a.site_id WHERE a.user_id = ? AND a.read = 0 ORDER BY a.created_at DESC LIMIT 20').bind(user.id).all(),
    getUsage(env, user.id, 'scan', dayPeriod()),
  ]);
  const prefill = c.url.searchParams.get('url') || '';
  const err = c.url.searchParams.get('error');

  const body = h`
<section class="wrap pad-lg">
  <div class="page-head">
    <div><p class="eyebrow">Dashboard</p><h1 class="display-md">Security overview</h1></div>
    <div class="usage-pill"><span>${usedToday} / ${plan.scansPerDay} scans today</span><meter min="0" max="${plan.scansPerDay}" value="${Math.min(usedToday, plan.scansPerDay)}"></meter></div>
  </div>
  ${flash(err)}
  <form class="card scan-form" method="post" action="/scans" data-busy="Scanning… this takes a few seconds">
    <label for="url" class="h3">Scan a website or web app</label>
    <div class="scan-row">
      <input id="url" name="url" inputmode="url" autocomplete="url" placeholder="example.com" required value="${prefill}">
      <button class="btn" type="submit">${icons.shield} Scan</button>
    </div>
    <p class="hint">Quick scans read only public information. Deep checks run automatically on sites you’ve verified below.</p>
  </form>

  ${alerts.results.length ? h`
  <div class="card alerts">
    <div class="row-between"><h2 class="h3">${icons.alert} New alerts</h2>
      <form method="post" action="/alerts/read"><button class="btn btn-ghost btn-sm" type="submit">Mark all read</button></form></div>
    <ul class="plain-list">${alerts.results.map((a) => h`<li><strong>${a.domain || 'Site'}</strong>: ${a.message} <span class="muted small">${timeAgo(a.created_at)}</span></li>`)}</ul>
  </div>` : ''}

  <div class="two-col">
    <div class="card">
      <div class="row-between"><h2 class="h3">Your sites</h2><span class="muted small">${sites.results.filter((s) => s.monitor).length} / ${plan.monitoredSites} monitored</span></div>
      ${sites.results.length ? h`<ul class="site-list">${sites.results.map((s) => h`
        <li>
          <a href="/sites/${s.id}"><strong>${s.domain}</strong></a>
          <span class="muted small">${s.verified_at ? (s.monitor ? 'Verified · monitored daily' : 'Verified') : 'Not verified'}</span>
          ${s.last_grade ? h`<span class="${gradeClass(s.last_grade)} grade-sm">${s.last_grade}</span>` : ''}
        </li>`)}</ul>` : h`<p class="muted">Add a site you own to unlock deep checks and daily monitoring.</p>`}
      <form class="inline-form" method="post" action="/sites">
        <label class="sr-only" for="domain">Domain</label>
        <input id="domain" name="domain" placeholder="yourdomain.com" required>
        <button class="btn btn-ghost" type="submit">${icons.plus} Add site</button>
      </form>
    </div>
    <div class="card">
      <h2 class="h3">Recent scans</h2>
      ${scans.results.length ? h`<ul class="scan-list">${scans.results.map((s) => h`
        <li><a href="/scans/${s.id}"><span class="${gradeClass(s.grade)} grade-sm">${s.grade}</span><span class="scan-url">${s.url.replace(/^https?:\/\//, '')}</span></a>
        <span class="muted small">${s.deep ? 'Deep · ' : ''}${timeAgo(s.created_at)}</span></li>`)}</ul>`
        : h`<p class="muted">No scans yet. Try your own site above.</p>`}
    </div>
  </div>
</section>`;
  return html(page({ env, product: 'ezdefender', title: 'Dashboard', user, body, nav: NAV, scripts: ['/assets/defender.js'] }));
});

// ---------- Scans ----------

async function findVerifiedSite(env, userId, host) {
  const bare = host.replace(/^www\./, '');
  return env.DB.prepare('SELECT * FROM sites WHERE user_id = ? AND verified_at IS NOT NULL AND domain IN (?, ?) LIMIT 1')
    .bind(userId, bare, `www.${bare}`).first();
}

async function runAndStore(env, user, target, site) {
  const result = await scan(target, { deep: !!site, allowPrivate: allowPrivate(env) });
  const id = randomId(10);
  const t = now();
  await env.DB.prepare('INSERT INTO scans (id, user_id, site_id, url, grade, score, deep, results, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, site ? site.id : null, result.finalUrl, result.grade, result.score, result.deep ? 1 : 0, JSON.stringify(result), t).run();
  if (site) await env.DB.prepare('UPDATE sites SET last_grade = ?, last_scan_at = ? WHERE id = ?').bind(result.grade, t, site.id).run();
  return { id, result };
}

router.post('/scans', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireUser(c);
  const plan = planFor(user);
  const form = await readForm(c.req);
  const back = (msg) => new Redirect(`/dashboard?error=${encodeURIComponent(msg)}&url=${encodeURIComponent(String(form.url || '').slice(0, 300))}`);
  if (await getUsage(c.env, user.id, 'scan', dayPeriod()) >= plan.scansPerDay) throw back(`You’ve used all ${plan.scansPerDay} scans on your plan today.`);
  let target;
  try { target = normalizeTarget(form.url, { allowPrivate: allowPrivate(c.env) }); } catch (e) { throw back(e.message); }
  const site = await findVerifiedSite(c.env, user.id, target.host);
  await addUsage(c.env, user.id, 'scan', dayPeriod());
  try {
    const { id } = await runAndStore(c.env, user, target.toString(), site);
    throw new Redirect(`/scans/${id}`);
  } catch (e) {
    if (e instanceof ScanError) throw back(e.message);
    throw e;
  }
});

router.get('/scans/:id', async (c) => {
  const user = await requireUser(c);
  const row = await c.env.DB.prepare('SELECT * FROM scans WHERE id = ? AND user_id = ?').bind(c.params.id, user.id).first();
  if (!row) throw new HttpError(404, 'Scan not found.');
  const r = JSON.parse(row.results);
  const order = { fail: 0, warn: 1, info: 2, pass: 3 };
  const sevOrder = { high: 0, medium: 1, low: 2, info: 3 };
  const sorted = [...r.checks].sort((a, b) => order[a.status] - order[b.status] || sevOrder[a.severity] - sevOrder[b.severity]);
  const counts = { fail: 0, warn: 0, info: 0, pass: 0 };
  for (const ch of r.checks) counts[ch.status]++;
  const host = new URL(r.finalUrl).host;
  const verifiedSite = await findVerifiedSite(c.env, user.id, host);

  const body = h`
<section class="wrap pad-lg">
  <a class="back-link" href="/dashboard">← Dashboard</a>
  <div class="report-head card">
    <div class="${gradeClass(r.grade)} grade-lg" aria-label="Grade ${r.grade}">${r.grade}</div>
    <div class="report-meta">
      <p class="eyebrow">${r.deep ? 'Deep scan' : 'Quick scan'} · ${timeAgo(row.created_at)}</p>
      <h1 class="display-sm break">${r.finalUrl}</h1>
      <p class="muted">Score ${r.score}/100 · <span class="${counts.fail ? 'c-fail' : ''}">${counts.fail} failed</span> · <span class="${counts.warn ? 'c-warn' : ''}">${counts.warn} warning${counts.warn === 1 ? '' : 's'}</span> · ${counts.pass} passed</p>
      <div class="cta-row">
        <form method="post" action="/scans"><input type="hidden" name="url" value="${r.url}"><button class="btn btn-sm" type="submit">Scan again</button></form>
        ${!verifiedSite && !r.deep ? h`<form method="post" action="/sites"><input type="hidden" name="domain" value="${host}"><button class="btn btn-ghost btn-sm" type="submit">Verify ownership for deep checks</button></form>` : ''}
        <a class="btn btn-ghost btn-sm" href="/scans/${row.id}/json" download="ezdefender-scan.json">Download JSON</a>
      </div>
    </div>
  </div>
  ${[...new Set(sorted.map((x) => x.category))].map((cat) => h`
  <h2 class="h3 section-gap">${cat}</h2>
  <ul class="checks">
    ${sorted.filter((x) => x.category === cat).map((ch) => h`
    <li class="check check-${ch.status}">
      <details ${ch.status === 'fail' ? raw_open : ''}>
        <summary>
          <span class="check-icon" aria-hidden="true">${statusIcon[ch.status]}</span>
          <span class="check-title">${ch.title}</span>
          <span class="check-tag">${statusLabel[ch.status]}${ch.status !== 'pass' && ch.severity !== 'info' ? ` · ${ch.severity}` : ''}</span>
        </summary>
        <div class="check-body">
          <p class="mono small break">${ch.detail}</p>
          ${ch.guide && GUIDES[ch.guide] ? h`<div class="fix"><strong>How to fix</strong><p>${GUIDES[ch.guide]}</p></div>` : ''}
        </div>
      </details>
    </li>`)}
  </ul>`)}
  ${!r.deep ? h`<p class="muted small section-gap">Exposed-file checks (.git, .env, backups) were skipped because you haven’t verified you own ${host}.</p>` : ''}
</section>`;
  return html(page({ env: c.env, product: 'ezdefender', title: `Scan of ${host}`, user, body, nav: NAV, scripts: ['/assets/defender.js'] }));
});
const raw_open = h`open`;

router.get('/scans/:id/json', async (c) => {
  const user = await requireUser(c);
  const row = await c.env.DB.prepare('SELECT results FROM scans WHERE id = ? AND user_id = ?').bind(c.params.id, user.id).first();
  if (!row) throw new HttpError(404, 'Scan not found.');
  return json(JSON.parse(row.results));
});

// ---------- Sites & verification ----------

router.post('/sites', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireUser(c);
  let domain;
  try { domain = normalizeDomain((await readForm(c.req)).domain, { allowPrivate: allowPrivate(c.env) }); } catch (e) {
    throw new Redirect(`/dashboard?error=${encodeURIComponent(e.message)}`);
  }
  const existing = await c.env.DB.prepare('SELECT id FROM sites WHERE user_id = ? AND domain = ?').bind(user.id, domain).first();
  if (existing) throw new Redirect(`/sites/${existing.id}`);
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM sites WHERE user_id = ?').bind(user.id).first();
  if (count.n >= 50) throw new Redirect(`/dashboard?error=${encodeURIComponent('You can add up to 50 sites.')}`);
  const id = randomId(10);
  await c.env.DB.prepare('INSERT INTO sites (id, user_id, domain, token, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, user.id, domain, randomId(18), now()).run();
  throw new Redirect(`/sites/${id}`);
});

async function loadSite(c, user) {
  const s = await c.env.DB.prepare('SELECT * FROM sites WHERE id = ? AND user_id = ?').bind(c.params.id, user.id).first();
  if (!s) throw new HttpError(404, 'Site not found.');
  return s;
}

router.get('/sites/:id', async (c) => {
  const user = await requireUser(c);
  const s = await loadSite(c, user);
  const plan = planFor(user);
  const { results: history } = await c.env.DB.prepare('SELECT id, grade, score, deep, created_at FROM scans WHERE site_id = ? ORDER BY created_at DESC LIMIT 30').bind(s.id).all();
  const record = `ezdefender-verify=${s.token}`;
  const msg = c.url.searchParams.get('msg');
  const err = c.url.searchParams.get('error');

  const body = h`
<section class="wrap pad-lg">
  <a class="back-link" href="/dashboard">← Dashboard</a>
  <div class="page-head">
    <div><p class="eyebrow">Site</p><h1 class="display-md break">${s.domain}</h1></div>
    ${s.last_grade ? h`<span class="${gradeClass(s.last_grade)} grade-lg">${s.last_grade}</span>` : ''}
  </div>
  ${flash(msg, 'ok')}${flash(err)}
  ${s.verified_at ? h`
  <div class="card">
    <h2 class="h3">${icons.check} Ownership verified</h2>
    <p class="muted">Deep checks run on every scan of ${s.domain}.</p>
    <div class="cta-row">
      <form method="post" action="/scans"><input type="hidden" name="url" value="https://${s.domain}/"><button class="btn" type="submit">Run deep scan</button></form>
      <form method="post" action="/sites/${s.id}/monitor">
        <input type="hidden" name="on" value="${s.monitor ? '0' : '1'}">
        <button class="btn btn-ghost" type="submit">${s.monitor ? 'Stop daily monitoring' : 'Monitor daily'}</button>
      </form>
    </div>
    <p class="hint">${s.monitor ? `Monitoring is on. Next check ${s.last_scan_at ? `about ${Math.max(0, Math.round((s.last_scan_at + 86400 - now()) / 3600))} h from now` : 'soon'}.` : `Your plan includes ${plan.monitoredSites} monitored site${plan.monitoredSites === 1 ? '' : 's'}.`}</p>
  </div>` : h`
  <div class="card">
    <h2 class="h3">Verify you own ${s.domain}</h2>
    <p class="muted">Use either method, then press Verify. This unlocks deep checks and daily monitoring.</p>
    <div class="two-col">
      <div>
        <h3 class="label">Option A: DNS record</h3>
        <p class="small">Add a <strong>TXT</strong> record:</p>
        <dl class="kv"><dt>Name</dt><dd><code class="copy">_ezdefender.${s.domain}</code></dd><dt>Value</dt><dd><code class="copy">${record}</code></dd></dl>
        <p class="hint">DNS changes can take a few minutes to appear.</p>
      </div>
      <div>
        <h3 class="label">Option B: Upload a file</h3>
        <p class="small">Publish a text file at:</p>
        <p><code class="copy break">https://${s.domain}/.well-known/ezdefender-verify.txt</code></p>
        <p class="small">containing exactly:</p>
        <p><code class="copy">${record}</code></p>
      </div>
    </div>
    <form method="post" action="/sites/${s.id}/verify"><button class="btn" type="submit">Verify</button></form>
  </div>`}

  <div class="card">
    <h2 class="h3">Scan history</h2>
    ${history.length ? h`<ul class="scan-list">${history.map((x) => h`<li><a href="/scans/${x.id}"><span class="${gradeClass(x.grade)} grade-sm">${x.grade}</span><span class="scan-url">Score ${x.score}${x.deep ? ' · deep' : ''}</span></a><span class="muted small">${timeAgo(x.created_at)}</span></li>`)}</ul>`
      : h`<p class="muted">No scans for this site yet.</p>`}
  </div>
  <form method="post" action="/sites/${s.id}/delete" class="right"><button class="btn btn-danger btn-sm" type="submit">Remove site</button></form>
</section>`;
  return html(page({ env: c.env, product: 'ezdefender', title: s.domain, user, body, nav: NAV, scripts: ['/assets/defender.js'] }));
});

router.post('/sites/:id/verify', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireUser(c);
  const s = await loadSite(c, user);
  const result = await checkVerification(s.domain, s.token, { allowPrivate: allowPrivate(c.env) });
  if (!result.ok) throw new Redirect(`/sites/${s.id}?error=${encodeURIComponent('We couldn’t find the verification record or file yet. Check it and try again in a few minutes.')}`);
  await c.env.DB.prepare('UPDATE sites SET verified_at = ? WHERE id = ?').bind(now(), s.id).run();
  throw new Redirect(`/sites/${s.id}?msg=${encodeURIComponent(`Verified via ${result.method === 'dns' ? 'DNS record' : 'file'}. Deep checks are unlocked.`)}`);
});

router.post('/sites/:id/monitor', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireUser(c);
  const s = await loadSite(c, user);
  const on = (await readForm(c.req)).on === '1';
  if (on) {
    if (!s.verified_at) throw new Redirect(`/sites/${s.id}?error=${encodeURIComponent('Verify ownership before turning on monitoring.')}`);
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM sites WHERE user_id = ? AND monitor = 1').bind(user.id).first();
    if (n.n >= planFor(user).monitoredSites) throw new Redirect(`/sites/${s.id}?error=${encodeURIComponent(`Your plan includes ${planFor(user).monitoredSites} monitored site(s). Upgrade to monitor more.`)}`);
  }
  await c.env.DB.prepare('UPDATE sites SET monitor = ? WHERE id = ?').bind(on ? 1 : 0, s.id).run();
  throw new Redirect(`/sites/${s.id}?msg=${encodeURIComponent(on ? 'Daily monitoring is on.' : 'Monitoring turned off.')}`);
});

router.post('/sites/:id/delete', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireUser(c);
  const s = await loadSite(c, user);
  await c.env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(s.id).run();
  throw new Redirect('/dashboard');
});

router.post('/alerts/read', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireUser(c);
  await c.env.DB.prepare('UPDATE alerts SET read = 1 WHERE user_id = ?').bind(user.id).run();
  throw new Redirect('/dashboard');
});

// ---------- Scheduled monitoring ----------

const GRADE_RANK = { 'A+': 6, A: 5, B: 4, C: 3, D: 2, F: 1 };

export async function runMonitoring(env) {
  const batch = Number(env.MONITOR_BATCH || 1);
  const { results: due } = await env.DB.prepare(
    `SELECT s.*, u.plan, u.email, u.alert_emails, u.email_verified_at FROM sites s JOIN users u ON u.id = s.user_id
     WHERE s.monitor = 1 AND s.verified_at IS NOT NULL AND (s.last_scan_at IS NULL OR s.last_scan_at < ?)
     ORDER BY COALESCE(s.last_scan_at, 0) ASC LIMIT ?`
  ).bind(now() - 86400, batch).all();

  for (const site of due) {
    const prev = await env.DB.prepare('SELECT grade, results FROM scans WHERE site_id = ? ORDER BY created_at DESC LIMIT 1').bind(site.id).first();
    const user = { id: site.user_id };
    const alerts = [];
    try {
      const { result } = await runAndStore(env, user, `https://${site.domain}/`, site);
      if (prev) {
        if ((GRADE_RANK[result.grade] || 0) < (GRADE_RANK[prev.grade] || 0)) alerts.push(`Grade dropped from ${prev.grade} to ${result.grade}.`);
        const before = new Set(JSON.parse(prev.results).checks.filter((x) => x.status === 'fail').map((x) => x.id));
        const newFails = result.checks.filter((x) => x.status === 'fail' && !before.has(x.id));
        if (newFails.length) alerts.push(`New issue${newFails.length > 1 ? 's' : ''}: ${newFails.map((x) => x.title).join(', ')}.`);
      }
    } catch (e) {
      await env.DB.prepare('UPDATE sites SET last_scan_at = ? WHERE id = ?').bind(now(), site.id).run();
      alerts.push(`Daily scan failed: ${e instanceof ScanError ? e.message : 'the site could not be reached.'}`);
    }
    for (const m of alerts) {
      await env.DB.prepare('INSERT INTO alerts (user_id, site_id, message, created_at) VALUES (?, ?, ?, ?)').bind(site.user_id, site.id, m, now()).run();
    }
    if (alerts.length && site.alert_emails && site.email_verified_at) {
      await sendTemplate(env, 'defenderAlert', site.email, { domain: site.domain, messages: alerts, url: `${productUrl(env, 'ezdefender')}/sites/${site.id}` }, site.user_id);
    }
  }
  return due.length;
}

export default {
  fetch: serve(router, { renderError: (status, message, req, env) => errorPage(env, 'ezdefender', status, message) }),
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMonitoring(env));
  },
};
