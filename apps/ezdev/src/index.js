// EZ DEV — parent company site, accounts and single sign-on for the EZ family.

import { h, html, serve, Router, Redirect, HttpError, assertSameOrigin, readForm, clientIp, randomId, now, redirect } from '../../../shared/http.js';
import {
  getUser, createSession, hashPassword, verifyPassword, validatePassword, normalizeEmail, rateLimit,
  destroyAllSessions, clearSessionCookie, issueHandoffCode, safePath,
} from '../../../shared/auth.js';
import { PLANS, planFor, getUsage, monthPeriod, dayPeriod, productUrl } from '../../../shared/config.js';
import { page, errorPage, icons, productIcon, flash } from '../../../shared/ui.js';

const NAV = [
  { href: '/#products', label: 'Products' },
  { href: '/#ecosystem', label: 'Ecosystem' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
];

const supportEmail = (env) => env.SUPPORT_EMAIL || 'ezdevsupport@proton.me';
const router = new Router();

// ---------- Landing ----------

router.get('/', async (c) => {
  const user = await getUser(c.req, c.env);
  const url = (k) => productUrl(c.env, k);
  const start = user ? '/dashboard' : '/signup';
  const products = [
    { key: 'ezapp', label: 'AI APP BUILDER', accent: 'blue', desc: "Describe the app you want in plain words. EZ APP's AI turns your idea into a working web app you can preview, refine and publish.", feats: ['Prompt-to-app generation', 'Refine by chatting, with full version history', 'Publish a link or download the code'] },
    { key: 'ezsite', label: 'AI WEBSITE BUILDER', accent: 'orange', desc: 'Tell EZ SITE about your business and get a polished multi-page website: planned, written and designed, ready to go live.', feats: ['Pages, copy and design generated for you', 'Edit anything by asking', 'One-click publishing'] },
    { key: 'ezdefender', label: 'CYBER SECURITY TOOLBOX', accent: 'green', desc: 'A security toolbox for websites and apps. Find weak spots, fix them with plain-English guides, and keep watch over time.', feats: ['Security scans for sites and apps', 'Plain-English fix guides', 'Scheduled monitoring and alerts'] },
  ];
  const signedOut = c.url.searchParams.get('signed_out');

  const body = h`
${signedOut ? h`<div class="wrap">${flash('You have been signed out of every EZ product.', 'ok')}</div>` : ''}
<section class="hero wrap">
  <p class="pill"><span class="dot"></span>The parent company of EZ APP · EZ SITE · EZ DEFENDER</p>
  <h1 class="display-xl">Build it. Launch it.<br><span class="accent-text">Lock it down.</span></h1>
  <p class="lead">EZ DEV makes building software easy. One family of AI-powered tools to create your app, publish your website, and keep both secure. One account for all of it.</p>
  <div class="cta-row">
    <a class="btn btn-lg" href="#products">Explore the products ${icons.arrow}</a>
    <a class="btn btn-ghost btn-lg" href="${start}">${user ? 'Go to dashboard' : 'Create your account'}</a>
  </div>
</section>

<section id="products" class="wrap pad-lg">
  <div class="section-head">
    <div>
      <p class="eyebrow">01 — The EZ family</p>
      <h2 class="display-md">Three companies. One mission.</h2>
    </div>
    <p class="muted measure">Each EZ subsidiary focuses on one job and does it well. Use one, or run all three together.</p>
  </div>
  <div class="product-grid">
    ${products.map((p) => h`
    <article class="card product-card accent-${p.accent}">
      <div class="product-top"><span class="icon-tile">${productIcon[p.key]}</span><span class="mono muted small">${p.label}</span></div>
      <h3 class="product-name">${p.key === 'ezapp' ? 'EZ APP' : p.key === 'ezsite' ? 'EZ SITE' : 'EZ DEFENDER'}</h3>
      <p>${p.desc}</p>
      <ul class="arrow-list">${p.feats.map((f) => h`<li>${f}</li>`)}</ul>
      <a class="btn btn-tint" href="${url(p.key)}">Visit ${p.key === 'ezapp' ? 'EZ APP' : p.key === 'ezsite' ? 'EZ SITE' : 'EZ DEFENDER'} ${icons.external}</a>
    </article>`)}
  </div>
</section>

<section id="ecosystem" class="wrap pad-lg">
  <div class="light-band">
    <div class="light-copy">
      <p class="eyebrow">02 — Better together</p>
      <h2 class="display-md">Build with EZ APP and EZ SITE. Protect with EZ DEFENDER.</h2>
      <p>One EZ DEV account signs you in everywhere. Whatever you build, EZ DEFENDER can check it from day one.</p>
      <a class="btn btn-dark" href="${start}">${user ? 'Open your dashboard' : 'Create an EZ DEV account'}</a>
    </div>
    <div class="org" role="img" aria-label="EZ DEV is the parent company of EZ APP, EZ SITE and EZ DEFENDER">
      <div class="org-parent"><strong>EZ DEV</strong><span>PARENT COMPANY</span></div>
      <div class="org-stem"></div>
      <div class="org-bar"></div>
      <div class="org-kids">
        <div class="org-kid kid-blue"><strong>EZ APP</strong><span>Apps</span></div>
        <div class="org-kid kid-orange"><strong>EZ SITE</strong><span>Websites</span></div>
        <div class="org-kid kid-green"><strong>EZ DEFENDER</strong><span>Security</span></div>
      </div>
    </div>
  </div>
</section>

<section id="company" class="wrap pad-lg why">
  <div>
    <p class="eyebrow">03 — Why EZ DEV</p>
    <h2 class="display-md">Software, made easy for everyone.</h2>
  </div>
  <div class="why-grid">
    <div class="why-item"><h3 class="h3">AI does the heavy lifting</h3><p class="muted">Start from an idea, not a blank screen. Our builders draft the first version for you.</p></div>
    <div class="why-item"><h3 class="h3">Security built in</h3><p class="muted">EZ DEFENDER is part of the family, so protection isn't an afterthought.</p></div>
    <div class="why-item"><h3 class="h3">One account, every tool</h3><p class="muted">Sign in once and move between EZ APP, EZ SITE and EZ DEFENDER.</p></div>
    <div class="why-item"><h3 class="h3">For beginners and pros</h3><p class="muted">Simple by default, and you can always download the code.</p></div>
  </div>
</section>

<section class="wrap pad-lg">
  <div class="cta-band card">
    <div>
      <h2 class="display-sm">Ready to build the <span class="accent-text">EZ</span> way?</h2>
      <p class="muted">Start free. Pick a product, or use the whole family.</p>
    </div>
    <div class="cta-row">
      <a class="btn btn-lg" href="${start}">Get started</a>
      <a class="btn btn-ghost btn-lg" href="/contact">Talk to us</a>
    </div>
  </div>
</section>`;
  return html(page({ env: c.env, product: 'ezdev', user, body, nav: NAV }));
});

// ---------- Sign up / sign in ----------

function authForm({ mode, error, values = {}, next }) {
  const isSignup = mode === 'signup';
  return h`
<section class="auth wrap narrow pad-lg">
  <h1 class="display-sm">${isSignup ? 'Create your EZ DEV account' : 'Sign in to EZ DEV'}</h1>
  <p class="muted">${isSignup ? 'One account for EZ APP, EZ SITE and EZ DEFENDER.' : 'Welcome back.'}</p>
  ${flash(error)}
  <form method="post" class="card form" action="/${mode}${next ? `?next=${encodeURIComponent(next)}` : ''}">
    ${isSignup ? h`<label for="name">Your name</label><input id="name" name="name" autocomplete="name" maxlength="80" required value="${values.name || ''}">` : ''}
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="email" maxlength="254" required value="${values.email || ''}">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" minlength="${isSignup ? 10 : 1}" maxlength="200" required>
    ${isSignup ? h`<p class="hint">At least 10 characters.</p>
      <label class="checkbox"><input type="checkbox" name="terms" value="1" required> <span>I agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</span></label>` : ''}
    <button class="btn btn-block" type="submit">${isSignup ? 'Create account' : 'Sign in'}</button>
  </form>
  <p class="muted center">${isSignup
    ? h`Already have an account? <a href="/login${next ? `?next=${encodeURIComponent(next)}` : ''}">Sign in</a>`
    : h`New to EZ DEV? <a href="/signup${next ? `?next=${encodeURIComponent(next)}` : ''}">Create an account</a>`}</p>
  ${isSignup ? '' : h`<p class="muted small center">Forgot your password? Email <a href="mailto:${values.support}">${values.support}</a> from your account address.</p>`}
</section>`;
}

router.get('/signup', async (c) => {
  const next = c.url.searchParams.get('next');
  if (await getUser(c.req, c.env)) throw new Redirect(next ? safePath(next) : '/dashboard');
  return html(page({ env: c.env, product: 'ezdev', title: 'Create account', body: authForm({ mode: 'signup', next }), nav: NAV }));
});

router.post('/signup', async (c) => {
  assertSameOrigin(c.req);
  const next = c.url.searchParams.get('next');
  const form = await readForm(c.req);
  const values = { name: String(form.name || '').trim().slice(0, 80), email: String(form.email || '').trim() };
  const fail = (error, status = 400) => html(page({ env: c.env, product: 'ezdev', title: 'Create account', body: authForm({ mode: 'signup', error, values, next }), nav: NAV }), status);

  try { await rateLimit(c.env, `signup:${clientIp(c.req)}`, 10, 3600); } catch (e) { return fail(e.message, 429); }
  const email = normalizeEmail(values.email);
  if (!values.name) return fail('Please enter your name.');
  if (!email) return fail('Please enter a valid email address.');
  const pwErr = validatePassword(form.password);
  if (pwErr) return fail(pwErr);
  if (form.terms !== '1') return fail('Please accept the Terms and Privacy Policy.');
  if (await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) {
    return fail('An account with that email already exists. Try signing in.', 409);
  }

  const id = randomId(12);
  await c.env.DB.prepare('INSERT INTO users (id, email, name, password_hash, plan, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, email, values.name, await hashPassword(form.password), 'free', now()).run();
  const cookie = await createSession(c.env, id, 'ezdev');
  return redirect(next ? safePath(next) : '/dashboard?welcome=1', 303, { 'Set-Cookie': cookie });
});

router.get('/login', async (c) => {
  const next = c.url.searchParams.get('next');
  if (await getUser(c.req, c.env)) throw new Redirect(next ? safePath(next) : '/dashboard');
  return html(page({ env: c.env, product: 'ezdev', title: 'Sign in', body: authForm({ mode: 'login', next, values: { support: supportEmail(c.env) } }), nav: NAV }));
});

const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

router.post('/login', async (c) => {
  assertSameOrigin(c.req);
  const next = c.url.searchParams.get('next');
  const form = await readForm(c.req);
  const values = { email: String(form.email || '').trim(), support: supportEmail(c.env) };
  const fail = (error, status = 401) => html(page({ env: c.env, product: 'ezdev', title: 'Sign in', body: authForm({ mode: 'login', error, values, next }), nav: NAV }), status);

  const email = normalizeEmail(values.email) || '';
  try {
    await rateLimit(c.env, `login-ip:${clientIp(c.req)}`, 30, 900);
    await rateLimit(c.env, `login-email:${email}`, 10, 900);
  } catch (e) { return fail(e.message, 429); }

  const user = email ? await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(email).first() : null;
  const ok = await verifyPassword(String(form.password || ''), user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) return fail('That email and password don’t match.');
  const cookie = await createSession(c.env, user.id, 'ezdev');
  return redirect(next ? safePath(next) : '/dashboard', 303, { 'Set-Cookie': cookie });
});

router.post('/auth/logout', async (c) => {
  assertSameOrigin(c.req);
  const user = await getUser(c.req, c.env);
  if (user) await destroyAllSessions(c.env, user.id);
  return redirect('/?signed_out=1', 303, { 'Set-Cookie': clearSessionCookie(c.env) });
});

// Hands a signed-in EZ DEV session to EZ APP / EZ SITE / EZ DEFENDER.
router.get('/auth/handoff', async (c) => {
  const returnTo = c.url.searchParams.get('return_to') || '';
  const state = c.url.searchParams.get('state') || '';
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(state)) throw new HttpError(400, 'Invalid sign-in request.');
  const user = await getUser(c.req, c.env);
  if (!user) throw new Redirect(`/login?next=${encodeURIComponent(c.url.pathname + c.url.search)}`);
  const { target, code } = await issueHandoffCode(c.env, user.id, returnTo);
  target.searchParams.set('code', code);
  target.searchParams.set('state', state);
  throw new Redirect(target.toString());
});

// ---------- Dashboard & account ----------

async function requireLocalUser(c) {
  const user = await getUser(c.req, c.env);
  if (!user) throw new Redirect(`/login?next=${encodeURIComponent(c.url.pathname + c.url.search)}`);
  return user;
}

router.get('/dashboard', async (c) => {
  const user = await requireLocalUser(c);
  const plan = planFor(user);
  const env = c.env;
  const [gens, scans, apps, sites, monitored, alerts] = await Promise.all([
    getUsage(env, user.id, 'ai_generation', monthPeriod()),
    getUsage(env, user.id, 'scan', dayPeriod()),
    env.DB.prepare("SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND product = 'app'").bind(user.id).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND product = 'site'").bind(user.id).first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM sites WHERE user_id = ? AND monitor = 1').bind(user.id).first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM alerts WHERE user_id = ? AND read = 0').bind(user.id).first(),
  ]);
  const tiles = [
    { key: 'ezapp', name: 'EZ APP', accent: 'blue', stat: `${apps.n} app${apps.n === 1 ? '' : 's'}`, cta: 'Open EZ APP' },
    { key: 'ezsite', name: 'EZ SITE', accent: 'orange', stat: `${sites.n} website${sites.n === 1 ? '' : 's'}`, cta: 'Open EZ SITE' },
    { key: 'ezdefender', name: 'EZ DEFENDER', accent: 'green', stat: `${monitored.n} monitored · ${alerts.n} new alert${alerts.n === 1 ? '' : 's'}`, cta: 'Open EZ DEFENDER' },
  ];
  const body = h`
<section class="wrap pad-lg">
  ${c.url.searchParams.get('welcome') ? flash(`Welcome to EZ DEV, ${user.name}! Your account works across all three products.`, 'ok') : ''}
  <div class="page-head">
    <div><p class="eyebrow">EZ DEV dashboard</p><h1 class="display-md">Hi, ${user.name.split(' ')[0]}.</h1></div>
    <a class="btn btn-ghost" href="/account">Account settings</a>
  </div>
  <div class="product-grid">
    ${tiles.map((t) => h`
    <a class="card tile accent-${t.accent}" href="${productUrl(env, t.key)}/dashboard">
      <span class="icon-tile">${productIcon[t.key]}</span>
      <span class="product-name">${t.name}</span>
      <span class="muted">${t.stat}</span>
      <span class="tile-cta">${t.cta} ${icons.arrow}</span>
    </a>`)}
  </div>
  <div class="card usage-card">
    <div class="row-between"><h2 class="h3">Your plan: ${plan.name}</h2><a href="/pricing">Compare plans</a></div>
    <div class="usage-grid">
      <div><label for="u-gen">AI builds this month</label><meter id="u-gen" min="0" max="${plan.aiGenerationsPerMonth}" value="${Math.min(gens, plan.aiGenerationsPerMonth)}"></meter><span class="muted small">${gens} of ${plan.aiGenerationsPerMonth}</span></div>
      <div><label for="u-scan">Security scans today</label><meter id="u-scan" min="0" max="${plan.scansPerDay}" value="${Math.min(scans, plan.scansPerDay)}"></meter><span class="muted small">${scans} of ${plan.scansPerDay}</span></div>
      <div><label for="u-mon">Monitored sites</label><meter id="u-mon" min="0" max="${plan.monitoredSites}" value="${Math.min(monitored.n, plan.monitoredSites)}"></meter><span class="muted small">${monitored.n} of ${plan.monitoredSites}</span></div>
    </div>
  </div>
</section>`;
  return html(page({ env, product: 'ezdev', title: 'Dashboard', user, body, nav: NAV }));
});

router.get('/account', async (c) => {
  const user = await requireLocalUser(c);
  const msg = c.url.searchParams.get('msg');
  const err = c.url.searchParams.get('error');
  const body = h`
<section class="wrap narrow pad-lg">
  <p class="eyebrow">Account</p>
  <h1 class="display-md">Account settings</h1>
  ${flash(msg, 'ok')}${flash(err)}
  <form class="card form" method="post" action="/account/profile">
    <h2 class="h3">Profile</h2>
    <label for="name">Name</label><input id="name" name="name" maxlength="80" required value="${user.name}">
    <label for="email">Email</label><input id="email" value="${user.email}" disabled>
    <p class="hint">To change your email, contact support.</p>
    <button class="btn" type="submit">Save</button>
  </form>
  <form class="card form" method="post" action="/account/password">
    <h2 class="h3">Password</h2>
    <label for="current">Current password</label><input id="current" name="current" type="password" autocomplete="current-password" required>
    <label for="new">New password</label><input id="new" name="password" type="password" autocomplete="new-password" minlength="10" required>
    <p class="hint">Changing your password signs you out everywhere else.</p>
    <button class="btn" type="submit">Change password</button>
  </form>
  <form class="card form danger-zone" method="post" action="/account/delete">
    <h2 class="h3">Delete account</h2>
    <p class="muted">This permanently deletes your account and everything in EZ APP, EZ SITE and EZ DEFENDER. It can't be undone.</p>
    <label for="confirm">Type your email to confirm</label><input id="confirm" name="confirm" autocomplete="off" required>
    <label for="dpw">Password</label><input id="dpw" name="password" type="password" autocomplete="current-password" required>
    <button class="btn btn-danger" type="submit">Delete my account</button>
  </form>
</section>`;
  return html(page({ env: c.env, product: 'ezdev', title: 'Account', user, body, nav: NAV }));
});

router.post('/account/profile', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireLocalUser(c);
  const name = String((await readForm(c.req)).name || '').trim().slice(0, 80);
  if (!name) throw new Redirect('/account?error=' + encodeURIComponent('Name cannot be empty.'));
  await c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id).run();
  throw new Redirect('/account?msg=' + encodeURIComponent('Profile saved.'));
});

router.post('/account/password', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireLocalUser(c);
  const form = await readForm(c.req);
  await rateLimit(c.env, `pw:${user.id}`, 10, 900);
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
  if (!(await verifyPassword(String(form.current || ''), row.password_hash))) {
    throw new Redirect('/account?error=' + encodeURIComponent('Your current password is incorrect.'));
  }
  const pwErr = validatePassword(form.password);
  if (pwErr) throw new Redirect('/account?error=' + encodeURIComponent(pwErr));
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(form.password), user.id).run();
  await destroyAllSessions(c.env, user.id);
  const cookie = await createSession(c.env, user.id, 'ezdev');
  return redirect('/account?msg=' + encodeURIComponent('Password changed. Other devices were signed out.'), 303, { 'Set-Cookie': cookie });
});

router.post('/account/delete', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireLocalUser(c);
  const form = await readForm(c.req);
  await rateLimit(c.env, `del:${user.id}`, 5, 900);
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
  if (String(form.confirm || '').trim().toLowerCase() !== user.email.toLowerCase() || !(await verifyPassword(String(form.password || ''), row.password_hash))) {
    throw new Redirect('/account?error=' + encodeURIComponent('Email or password did not match. Your account was not deleted.'));
  }
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  return redirect('/?signed_out=1', 303, { 'Set-Cookie': clearSessionCookie(c.env) });
});

// ---------- Pricing & info pages ----------

router.get('/pricing', async (c) => {
  const user = await getUser(c.req, c.env);
  const current = user ? user.plan : null;
  const prices = { free: '$0', pro: c.env.PRICE_PRO || '[YOUR PRICE]', business: c.env.PRICE_BUSINESS || '[YOUR PRICE]' };
  const body = h`
<section class="wrap pad-lg">
  <p class="eyebrow">Pricing</p>
  <h1 class="display-md">One account. Every EZ product.</h1>
  <p class="lead">Every plan includes EZ APP, EZ SITE and EZ DEFENDER. AI builds are shared between EZ APP and EZ SITE.</p>
  <div class="plan-grid">
    ${Object.entries(PLANS).map(([key, p]) => h`
    <div class="card plan ${key === 'pro' ? 'plan-featured' : ''}">
      <h2 class="h3">${p.name}</h2>
      <p class="price">${prices[key]}<span class="muted small">${key === 'free' ? '' : ' / month'}</span></p>
      <ul class="check-list">
        <li>${p.aiGenerationsPerMonth} AI builds per month</li>
        <li>${p.projectsPerProduct} apps and ${p.projectsPerProduct} websites</li>
        <li>${p.scansPerDay} security scans per day</li>
        <li>${p.monitoredSites} monitored site${p.monitoredSites === 1 ? '' : 's'}</li>
      </ul>
      ${current === key
        ? h`<span class="btn btn-ghost btn-block is-static">Your current plan</span>`
        : key === 'free'
          ? h`<a class="btn btn-ghost btn-block" href="${user ? '/dashboard' : '/signup'}">${user ? 'Go to dashboard' : 'Start free'}</a>`
          : h`<a class="btn btn-block" href="/contact?plan=${key}">Upgrade to ${p.name}</a>`}
    </div>`)}
  </div>
  <p class="muted small">Online checkout is coming soon. To upgrade today, contact us and we'll switch your plan.</p>
</section>`;
  return html(page({ env: c.env, product: 'ezdev', title: 'Pricing', user, body, nav: NAV }));
});

router.get('/contact', async (c) => {
  const user = await getUser(c.req, c.env);
  const plan = c.url.searchParams.get('plan');
  const email = supportEmail(c.env);
  const subject = plan && PLANS[plan] ? `Upgrade to ${PLANS[plan].name}` : 'Hello EZ DEV';
  const body = h`
<section class="wrap narrow pad-lg">
  <p class="eyebrow">Contact</p>
  <h1 class="display-md">Talk to the EZ DEV team.</h1>
  <p class="lead">Questions, upgrades, partnerships or a security report: email us and a real person will reply.</p>
  <div class="card">
    <p><strong>Email</strong></p>
    <p><a class="big-link" href="mailto:${email}?subject=${encodeURIComponent(subject)}">${email}</a></p>
    ${user ? h`<p class="muted small">Please write from ${user.email} so we can find your account.</p>` : ''}
  </div>
</section>`;
  return html(page({ env: c.env, product: 'ezdev', title: 'Contact', user, body, nav: NAV }));
});

function infoPage(title, intro, sections) {
  return async (c) => {
    const user = await getUser(c.req, c.env);
    const body = h`
<section class="wrap narrow pad-lg prose">
  <p class="eyebrow">EZ DEV</p>
  <h1 class="display-md">${title}</h1>
  <p class="lead">${intro}</p>
  ${sections(c.env).map(([hd, text]) => h`<h2 class="h3">${hd}</h2><p>${text}</p>`)}
</section>`;
    return html(page({ env: c.env, product: 'ezdev', title, user, body, nav: NAV }));
  };
}

router.get('/privacy', infoPage('Privacy Policy', 'Draft — replace with a policy reviewed by a lawyer before launch.', (env) => [
  ['What we collect', 'Your name, email address and a securely hashed password; the projects you create; the URLs you scan; and basic request logs.'],
  ['How we use it', 'To run EZ APP, EZ SITE and EZ DEFENDER for you. Prompts and project files you send to the AI builders are processed by our AI provider (Anthropic) to generate your project.'],
  ['What we never do', 'We do not sell your data or use it for advertising.'],
  ['Your choices', 'You can delete your account and all of its data at any time from Account settings.'],
  ['Contact', `Questions: ${supportEmail(env)}.`],
]));

router.get('/terms', infoPage('Terms of Service', 'Draft — replace with terms reviewed by a lawyer before launch.', (env) => [
  ['Using EZ DEV', 'You are responsible for what you build and publish with EZ products, and for having the rights to any content you provide.'],
  ['Acceptable use', 'Do not use EZ products to build phishing pages, malware or content that breaks the law. Only run deep security checks against sites you own or are authorised to test; EZ DEFENDER requires ownership verification for those.'],
  ['AI output', 'AI-generated code and copy can contain mistakes. Review it before relying on it.'],
  ['Contact', `Questions: ${supportEmail(env)}.`],
]));

router.get('/security', infoPage('Security at EZ DEV', 'How we protect your account and your projects.', (env) => [
  ['Accounts', 'Passwords are hashed with PBKDF2-SHA256 and a unique salt. Session tokens are random, HttpOnly, and stored only as hashes. Sign-in attempts are rate limited.'],
  ['Your projects', 'Generated apps and websites run in a sandboxed, isolated origin so they can never access your EZ account.'],
  ['Transport', 'All EZ products are served over HTTPS with HSTS and a strict Content Security Policy.'],
  ['Report a vulnerability', `Email ${supportEmail(env)}. Please give us reasonable time to fix issues before disclosing them.`],
]));

router.get('/.well-known/security.txt', (c) => new Response(
  `Contact: mailto:${supportEmail(c.env)}\nExpires: ${new Date(Date.now() + 180 * 864e5).toISOString()}\nPolicy: ${c.url.origin}/security\nPreferred-Languages: en\n`,
  { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
));

router.get('/healthz', () => new Response('ok'));

export default {
  fetch: serve(router, { renderError: (status, message, req, env) => errorPage(env, 'ezdev', status, message) }),
};
