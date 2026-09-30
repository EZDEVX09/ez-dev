// EZ DEV — parent company site, accounts and single sign-on for the EZ family.

import { h, raw, html, json, serve, Router, Redirect, HttpError, assertSameOrigin, readForm, clientIp, randomId, now, redirect } from '../../../shared/http.js';
import {
  getUser, createSession, hashPassword, verifyPassword, validatePassword, normalizeEmail, rateLimit,
  destroyAllSessions, clearSessionCookie, issueHandoffCode, safePath,
  createEmailToken, consumeEmailToken, peekEmailToken,
} from '../../../shared/auth.js';
import { sendTemplate } from '../../../shared/email.js';
import {
  billingEnabled, getPlanPrices, formatPrice, createCheckout, createPortal, applySubscription, fetchSubscription,
  cancelSubscriptionNow, verifyWebhook, planName, formatDate, stripe,
} from '../../../shared/billing.js';
import { PLANS, planFor, getUsage, monthPeriod, dayPeriod, productUrl } from '../../../shared/config.js';
import { page, errorPage, icons, productIcon, flash } from '../../../shared/ui.js';
import { showcase } from '../../../shared/visuals.js';
import { lockupSvg } from '../../../shared/logo.js';
import { mountAvatarRead, mountAvatarWrite, avatarUrl } from '../../../shared/avatar.js';

const NAV = [
  { href: '/#products', label: 'Products' },
  { href: '/#ecosystem', label: 'Ecosystem' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
];

const supportEmail = (env) => env.SUPPORT_EMAIL || 'ezdevsupport@proton.me';
const checked = raw('checked');
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

  const name = (k) => (k === 'ezapp' ? 'EZ APP' : k === 'ezsite' ? 'EZ SITE' : 'EZ DEFENDER');
  const ticker = ['EZ APP', 'EZ SITE', 'EZ DEFENDER', 'Build it', 'Launch it', 'Lock it down'];
  const body = h`
${signedOut ? h`<div class="wrap">${flash('You have been signed out of every EZ product.', 'ok')}</div>` : ''}
<section class="ed-hero wrap">
  <div class="ed-meta reveal"><span>EZ DEV</span><span>Parent company of EZ APP / EZ SITE / EZ DEFENDER</span><span>ezdevportal.com</span></div>
  <h1 class="ed-title reveal reveal-2">Build it.<br>Launch it.<br><em>Lock it down.</em></h1>
  <div class="ed-hero-foot reveal reveal-3">
    <p class="lead">EZ DEV makes building software easy. One family of AI-powered tools to create your app, publish your website, and keep both secure. One account for all of it.</p>
    <div class="cta-row">
      <a class="btn btn-lg" href="${start}">${user ? 'Go to dashboard' : 'Create your account'} ${icons.arrow}</a>
      <a class="btn btn-ghost btn-lg" href="#products">Explore the products</a>
    </div>
  </div>
</section>

<div class="ed-ticker" aria-hidden="true"><div>${[...ticker, ...ticker, ...ticker, ...ticker].map((t) => h`<span>${t}</span>`)}</div></div>

<section class="wrap ed-section">${showcase('ezdev')}</section>

<section id="products" class="wrap ed-section">
  <header class="ed-head">
    <span class="ed-num">(01) The EZ family</span>
    <h2 class="ed-h2">Three companies.<br><em>One mission.</em></h2>
    <p>Each EZ subsidiary focuses on one job and does it well. Use one, or run all three together.</p>
  </header>
  <div class="ed-products">
    ${products.map((p, i) => h`
    <article class="ed-product">
      <div class="ed-product-top"><span>0${i + 1}</span><span>${p.label}</span></div>
      <h3>${name(p.key)}</h3>
      <p>${p.desc}</p>
      <ul class="ed-list">${p.feats.map((f) => h`<li>${f}</li>`)}</ul>
      <a class="ed-link" href="${url(p.key)}">Visit ${name(p.key)} ${icons.external}</a>
    </article>`)}
  </div>
</section>

<section id="ecosystem" class="ed-invert">
  <div class="wrap ed-invert-grid">
    <div>
      <span class="ed-num">(02) Better together</span>
      <h2 class="ed-h2">Build with EZ APP and EZ SITE. <em>Protect with EZ DEFENDER.</em></h2>
      <p>One EZ DEV account signs you in everywhere. Whatever you build, EZ DEFENDER can check it from day one.</p>
      <a class="btn btn-dark btn-lg" href="${start}">${user ? 'Open your dashboard' : 'Create an EZ DEV account'} ${icons.arrow}</a>
    </div>
    <div class="org" role="img" aria-label="EZ DEV is the parent company of EZ APP, EZ SITE and EZ DEFENDER">
      <div class="org-parent">${raw(lockupSvg('DEV', { height: 30, color: 'currentColor' }).replace('role="img"', 'aria-hidden="true"'))}<span>PARENT COMPANY</span></div>
      <div class="org-stem"></div>
      <div class="org-bar"></div>
      <div class="org-kids">
        <div class="org-kid"><strong>EZ APP</strong><span>Apps</span></div>
        <div class="org-kid"><strong>EZ SITE</strong><span>Websites</span></div>
        <div class="org-kid"><strong>EZ DEFENDER</strong><span>Security</span></div>
      </div>
    </div>
  </div>
</section>

<section id="company" class="wrap ed-section">
  <header class="ed-head">
    <span class="ed-num">(03) Why EZ DEV</span>
    <h2 class="ed-h2">Software, made <em>easy</em> for everyone.</h2>
    <p>From your first idea to a secure, published product, without the usual complexity.</p>
  </header>
  <div class="ed-cells">
    <div class="ed-cell"><span class="ed-num">01</span><h3>AI does the heavy lifting</h3><p>Start from an idea, not a blank screen. Our builders draft the first version for you.</p></div>
    <div class="ed-cell"><span class="ed-num">02</span><h3>Security built in</h3><p>EZ DEFENDER is part of the family, so protection isn't an afterthought.</p></div>
    <div class="ed-cell"><span class="ed-num">03</span><h3>One account, every tool</h3><p>Sign in once and move between EZ APP, EZ SITE and EZ DEFENDER.</p></div>
    <div class="ed-cell"><span class="ed-num">04</span><h3>For beginners and pros</h3><p>Simple by default, and you can always download the code.</p></div>
  </div>
</section>

<section class="wrap ed-cta">
  <h2 class="ed-h2">Ready to build<br>the <em>EZ</em> way?</h2>
  <div class="ed-cta-row">
    <p>Start free. Pick a product, or use the whole family.</p>
    <div class="cta-row">
      <a class="btn btn-lg" href="${start}">Get started ${icons.arrow}</a>
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
  ${flash(values.msg, 'ok')}${flash(error)}
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
  ${isSignup ? '' : h`<p class="muted small center"><a href="/forgot">Forgot your password?</a></p>`}
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
  const token = await createEmailToken(c.env, id, 'verify', 86400);
  c.ctx.waitUntil(sendTemplate(c.env, 'welcomeVerify', email, { name: values.name, url: `${c.url.origin}/verify-email?token=${token}` }, id));
  return redirect(next ? safePath(next) : '/dashboard?welcome=1', 303, { 'Set-Cookie': cookie });
});

router.get('/login', async (c) => {
  const next = c.url.searchParams.get('next');
  if (await getUser(c.req, c.env)) throw new Redirect(next ? safePath(next) : '/dashboard');
  return html(page({ env: c.env, product: 'ezdev', title: 'Sign in', body: authForm({ mode: 'login', next, values: { msg: c.url.searchParams.get('msg') } }), nav: NAV }));
});

const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

router.post('/login', async (c) => {
  assertSameOrigin(c.req);
  const next = c.url.searchParams.get('next');
  const form = await readForm(c.req);
  const values = { email: String(form.email || '').trim() };
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
  ${flash(c.url.searchParams.get('msg'), 'ok')}
  ${user.subscription_status === 'past_due' ? h`<div class="flash flash-error" role="alert">Your last payment failed. <a href="/account#billing">Update your payment method</a> to keep ${planName(user.plan)}.</div>` : ''}
  ${!user.email_verified_at ? h`<form class="flash flash-info row-between" method="post" action="/account/resend-verification">
      <span>Please confirm your email address. We sent a link to <strong>${user.email}</strong>.</span>
      <button class="btn btn-ghost btn-sm" type="submit">Resend email</button></form>` : ''}
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
  <div class="card" id="photo">
    <h2 class="h3">Profile picture</h2>
    <div class="photo-row">
      <div class="avatar-lg" id="avatar-preview">${avatarUrl(user) ? h`<img src="${avatarUrl(user)}" alt="Your profile picture">` : h`<span aria-hidden="true">${user.name.slice(0, 1).toUpperCase()}</span>`}</div>
      <div class="photo-actions">
        <form method="post" action="/account/avatar" enctype="multipart/form-data" class="photo-form">
          <label class="btn btn-ghost btn-sm file-btn">Choose picture<input id="avatar-input" type="file" name="avatar" accept="image/jpeg,image/png,image/webp" required></label>
          <button class="btn btn-sm" id="avatar-save" type="submit">Save picture</button>
        </form>
        ${avatarUrl(user) ? h`<form method="post" action="/account/avatar/delete"><button class="btn btn-danger btn-sm" type="submit">Remove</button></form>` : ''}
        <p class="hint" id="avatar-status" role="status">JPEG, PNG or WebP. We crop it to a square and shrink it for you.</p>
      </div>
    </div>
  </div>
  <form class="card form" method="post" action="/account/profile">
    <h2 class="h3">Profile</h2>
    <label for="name">Name</label><input id="name" name="name" maxlength="80" required value="${user.name}">
    <label for="email">Email</label><input id="email" value="${user.email}" disabled>
    <p class="hint">${user.email_verified_at ? 'Confirmed.' : 'Not confirmed yet.'} To change your email, contact support.</p>
    <button class="btn" type="submit">Save</button>
  </form>
  ${!user.email_verified_at ? h`<form class="card form" method="post" action="/account/resend-verification">
    <h2 class="h3">Confirm your email</h2>
    <p class="muted">We need a confirmed email to send security alerts and password resets.</p>
    <button class="btn btn-ghost" type="submit">Send confirmation email</button>
  </form>` : ''}
  <div class="card" id="billing">
    <h2 class="h3">Billing</h2>
    <p class="plan-line"><span class="badge">${planName(user.plan)}</span>
      ${user.subscription_status && user.subscription_status !== 'canceled'
        ? h`<span class="muted">${user.subscription_status === 'past_due' ? 'Payment failed — please update your card.'
            : user.cancel_at_period_end ? `Ends on ${formatDate(user.current_period_end)}.`
            : user.current_period_end ? `Renews on ${formatDate(user.current_period_end)}.` : ''}</span>`
        : h`<span class="muted">No paid subscription.</span>`}
    </p>
    <div class="cta-row">
      ${user.stripe_customer_id ? h`<form method="post" action="/billing/portal"><button class="btn" type="submit">Manage billing &amp; invoices</button></form>` : ''}
      ${user.plan === 'free' ? h`<a class="btn ${user.stripe_customer_id ? 'btn-ghost' : ''}" href="/pricing">Upgrade</a>` : ''}
    </div>
  </div>
  <form class="card form" method="post" action="/account/notifications">
    <h2 class="h3">Email notifications</h2>
    <label class="checkbox"><input type="checkbox" name="alert_emails" value="1" ${user.alert_emails ? checked : ''}> <span>Email me when EZ DEFENDER monitoring finds a new problem on my sites</span></label>
    <p class="hint">Account, security and billing emails are always sent.</p>
    <button class="btn btn-ghost" type="submit">Save preferences</button>
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
  return html(page({ env: c.env, product: 'ezdev', title: 'Account', user, body, nav: NAV, scripts: ['/assets/account.js'] }));
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
  c.ctx.waitUntil(sendTemplate(c.env, 'passwordChanged', user.email, {}, user.id));
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
  if (user.stripe_subscription_id && user.subscription_status && user.subscription_status !== 'canceled' && billingEnabled(c.env)) {
    try { await cancelSubscriptionNow(c.env, user.stripe_subscription_id); } catch {
      throw new Redirect('/account?error=' + encodeURIComponent(`We couldn't cancel your subscription automatically. Please cancel it under Billing first, or contact ${supportEmail(c.env)}.`));
    }
  }
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  return redirect('/?signed_out=1', 303, { 'Set-Cookie': clearSessionCookie(c.env) });
});

// ---------- Pricing & info pages ----------

router.get('/pricing', async (c) => {
  const user = await getUser(c.req, c.env);
  const current = user ? user.plan : null;
  let stripePrices = {};
  try { stripePrices = await getPlanPrices(c.env); } catch (e) { console.error('Could not load prices', e.message); }
  const display = (key) => key === 'free' ? '$0' : formatPrice(stripePrices[key]) || c.env[`PRICE_${key.toUpperCase()}`] || '[YOUR PRICE]';
  const canBuy = (key) => billingEnabled(c.env) && !!stripePrices[key];
  const hasSub = user && user.stripe_subscription_id && user.subscription_status && user.subscription_status !== 'canceled';

  const action = (key, p) => {
    if (current === key) return h`<span class="btn btn-ghost btn-block is-static">Your current plan</span>`;
    if (key === 'free') {
      if (!user) return h`<a class="btn btn-ghost btn-block" href="/signup">Start free</a>`;
      return hasSub ? h`<form method="post" action="/billing/portal"><button class="btn btn-ghost btn-block" type="submit">Downgrade in billing</button></form>` : '';
    }
    if (!canBuy(key)) return h`<a class="btn btn-block" href="/contact?plan=${key}">Contact us to upgrade</a>`;
    if (!user) return h`<a class="btn btn-block" href="/signup?next=${encodeURIComponent('/pricing')}">Get ${p.name}</a>`;
    if (hasSub) return h`<form method="post" action="/billing/portal"><button class="btn btn-block" type="submit">Switch to ${p.name}</button></form>`;
    return h`<form method="post" action="/billing/checkout"><input type="hidden" name="plan" value="${key}"><button class="btn btn-block" type="submit">Upgrade to ${p.name}</button></form>`;
  };

  const body = h`
<section class="wrap pad-lg">
  <p class="eyebrow">Pricing</p>
  <h1 class="display-md">One account. Every EZ product.</h1>
  <p class="lead">Every plan includes EZ APP, EZ SITE and EZ DEFENDER. AI builds are shared between EZ APP and EZ SITE.</p>
  ${c.url.searchParams.get('canceled') ? flash('Checkout canceled. You have not been charged.', 'info') : ''}
  <div class="plan-grid">
    ${Object.entries(PLANS).map(([key, p]) => h`
    <div class="card plan ${key === 'pro' ? 'plan-featured' : ''}">
      <h2 class="h3">${p.name}</h2>
      <p class="price">${display(key)}<span class="muted small">${key === 'free' ? '' : ' / month'}</span></p>
      <ul class="check-list">
        <li>${p.aiGenerationsPerMonth} AI builds per month</li>
        <li>${p.projectsPerProduct} apps and ${p.projectsPerProduct} websites</li>
        <li>${p.scansPerDay} security scans per day</li>
        <li>${p.monitoredSites} monitored site${p.monitoredSites === 1 ? '' : 's'}</li>
      </ul>
      ${action(key, p)}
    </div>`)}
  </div>
  <p class="muted small">Payments are handled securely by Stripe. Cancel or change plans any time from your account.</p>
</section>`;
  return html(page({ env: c.env, product: 'ezdev', title: 'Pricing', user, body, nav: NAV }));
});

// ---------- Billing ----------

router.post('/billing/checkout', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireLocalUser(c);
  const plan = String((await readForm(c.req)).plan || '');
  if (user.stripe_subscription_id && user.subscription_status && user.subscription_status !== 'canceled') {
    throw new Redirect(await createPortal(c.env, user, c.url.origin));
  }
  await rateLimit(c.env, `checkout:${user.id}`, 10, 3600);
  throw new Redirect(await createCheckout(c.env, user, plan, c.url.origin));
});

router.post('/billing/portal', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireLocalUser(c);
  if (!user.stripe_customer_id) throw new Redirect('/pricing');
  throw new Redirect(await createPortal(c.env, user, c.url.origin));
});

// Return from Checkout: sync immediately so the plan shows even before the webhook arrives.
router.get('/billing/success', async (c) => {
  const user = await requireLocalUser(c);
  const id = c.url.searchParams.get('session_id') || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) throw new Redirect('/account#billing');
  const session = await stripe(c.env, 'GET', `/checkout/sessions/${id}`);
  if (session.client_reference_id !== user.id) throw new HttpError(403, 'That checkout belongs to another account.');
  if (session.subscription) await syncSubscription(c.env, session.subscription);
  const fresh = await c.env.DB.prepare('SELECT plan FROM users WHERE id = ?').bind(user.id).first();
  throw new Redirect('/dashboard?msg=' + encodeURIComponent(`Thanks! You're on ${planName(fresh.plan)}.`));
});

router.post('/stripe/webhook', async (c) => {
  const payload = await c.req.text();
  const event = await verifyWebhook(c.env, payload, c.req.headers.get('Stripe-Signature'));
  const fresh = await c.env.DB.prepare('INSERT OR IGNORE INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)').bind(event.id, event.type, now()).run();
  if (!fresh.meta.changes) return json({ received: true, duplicate: true });

  try {
    await handleStripeEvent(c.env, event);
  } catch (err) {
    // Let Stripe retry: forget the event so the retry is processed.
    await c.env.DB.prepare('DELETE FROM stripe_events WHERE id = ?').bind(event.id).run();
    throw err;
  }
  return json({ received: true });
});

async function handleStripeEvent(env, event) {
  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.client_reference_id && obj.customer) {
        await env.DB.prepare('UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, ?) WHERE id = ?').bind(obj.customer, obj.client_reference_id).run();
      }
      if (obj.subscription) await syncSubscription(env, obj.subscription);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await syncSubscription(env, obj.id, event.type === 'customer.subscription.deleted' ? obj : null);
      break;
    case 'invoice.payment_failed': {
      const user = await env.DB.prepare('SELECT id, email FROM users WHERE stripe_customer_id = ?').bind(obj.customer).first();
      if (user) await sendTemplate(env, 'paymentFailed', user.email, {}, user.id);
      break;
    }
    default:
      break;
  }
}

/** Always re-reads the subscription from Stripe so out-of-order webhooks can't regress state. */
async function syncSubscription(env, subscriptionId, deletedObject = null) {
  const sub = deletedObject || await fetchSubscription(env, typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id);
  const r = await applySubscription(env, sub);
  if (!r || r.ignored || !r.changed) return;
  if (r.plan !== 'free') {
    await sendTemplate(env, 'planActivated', r.email, { planName: planName(r.plan), renews: formatDate(r.periodEnd) }, r.userId);
  } else {
    await sendTemplate(env, 'planCanceled', r.email, { planName: planName(r.prevPlan) }, r.userId);
  }
}

// ---------- Email verification & password reset ----------

router.get('/verify-email', async (c) => {
  const userId = await consumeEmailToken(c.env, c.url.searchParams.get('token'), 'verify');
  if (!userId) {
    return html(page({ env: c.env, product: 'ezdev', title: 'Link expired', user: await getUser(c.req, c.env), nav: NAV, body: h`
<section class="wrap narrow pad-lg center">
  <h1 class="display-sm">That link has expired.</h1>
  <p class="lead">Confirmation links work once, for 24 hours. Sign in and we'll send you a new one.</p>
  <p><a class="btn" href="/dashboard">Go to dashboard</a></p>
</section>` }), 400);
  }
  await c.env.DB.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').bind(now(), userId).run();
  const current = await getUser(c.req, c.env);
  throw new Redirect(current ? '/dashboard?msg=' + encodeURIComponent('Email confirmed. Thanks!') : '/login?msg=' + encodeURIComponent('Email confirmed. Please sign in.'));
});

router.post('/account/resend-verification', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireLocalUser(c);
  if (user.email_verified_at) throw new Redirect('/account?msg=' + encodeURIComponent('Your email is already confirmed.'));
  await rateLimit(c.env, `verify-mail:${user.id}`, 3, 3600);
  const token = await createEmailToken(c.env, user.id, 'verify', 86400);
  await sendTemplate(c.env, 'verify', user.email, { url: `${c.url.origin}/verify-email?token=${token}` }, user.id);
  throw new Redirect('/account?msg=' + encodeURIComponent(`Confirmation email sent to ${user.email}.`));
});

router.post('/account/notifications', async (c) => {
  assertSameOrigin(c.req);
  const user = await requireLocalUser(c);
  const on = (await readForm(c.req)).alert_emails === '1';
  await c.env.DB.prepare('UPDATE users SET alert_emails = ? WHERE id = ?').bind(on ? 1 : 0, user.id).run();
  throw new Redirect('/account?msg=' + encodeURIComponent('Notification preferences saved.'));
});

function forgotPage(env, { msg, error, email = '' } = {}) {
  return page({ env, product: 'ezdev', title: 'Reset password', nav: NAV, body: h`
<section class="auth wrap narrow pad-lg">
  <h1 class="display-sm">Reset your password</h1>
  <p class="muted">Enter your account email and we'll send you a link to choose a new password.</p>
  ${flash(msg, 'ok')}${flash(error)}
  <form method="post" class="card form" action="/forgot">
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="email" maxlength="254" required value="${email}">
    <button class="btn btn-block" type="submit">Send reset link</button>
  </form>
  <p class="muted center"><a href="/login">Back to sign in</a></p>
</section>` });
}

router.get('/forgot', (c) => html(forgotPage(c.env)));

router.post('/forgot', async (c) => {
  assertSameOrigin(c.req);
  const form = await readForm(c.req);
  const email = normalizeEmail(form.email);
  try { await rateLimit(c.env, `forgot-ip:${clientIp(c.req)}`, 10, 900); } catch (e) { return html(forgotPage(c.env, { error: e.message }), 429); }
  if (!email) return html(forgotPage(c.env, { error: 'Please enter a valid email address.', email: form.email }), 400);
  const user = await c.env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first();
  let limited = false;
  try { await rateLimit(c.env, `forgot-email:${email}`, 3, 3600); } catch { limited = true; }
  if (user && !limited) {
    const token = await createEmailToken(c.env, user.id, 'reset', 3600);
    c.ctx.waitUntil(sendTemplate(c.env, 'resetPassword', user.email, { url: `${c.url.origin}/reset?token=${token}` }, user.id));
  }
  // Same answer whether or not the account exists, so emails can't be discovered.
  return html(forgotPage(c.env, { msg: `If an account exists for ${email}, a reset link is on its way. It works for 1 hour.` }));
});

function resetPage(env, { token, error }) {
  return page({ env, product: 'ezdev', title: 'Choose a new password', nav: NAV, body: h`
<section class="auth wrap narrow pad-lg">
  <h1 class="display-sm">Choose a new password</h1>
  ${flash(error)}
  <form method="post" class="card form" action="/reset">
    <input type="hidden" name="token" value="${token}">
    <label for="password">New password</label>
    <input id="password" name="password" type="password" autocomplete="new-password" minlength="10" maxlength="200" required>
    <p class="hint">At least 10 characters. This signs you out on every device.</p>
    <button class="btn btn-block" type="submit">Save new password</button>
  </form>
</section>` });
}

router.get('/reset', async (c) => {
  const token = c.url.searchParams.get('token') || '';
  if (!(await peekEmailToken(c.env, token, 'reset'))) {
    return html(forgotPage(c.env, { error: 'That reset link has expired or was already used. Request a new one below.' }), 400);
  }
  return html(resetPage(c.env, { token }));
});

router.post('/reset', async (c) => {
  assertSameOrigin(c.req);
  const form = await readForm(c.req);
  const token = String(form.token || '');
  const pwErr = validatePassword(form.password);
  if (pwErr) return html(resetPage(c.env, { token, error: pwErr }), 400);
  const userId = await consumeEmailToken(c.env, token, 'reset');
  if (!userId) return html(forgotPage(c.env, { error: 'That reset link has expired or was already used. Request a new one below.' }), 400);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')
    .bind(await hashPassword(form.password), now(), userId).run();
  await destroyAllSessions(c.env, userId);
  const user = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first();
  c.ctx.waitUntil(sendTemplate(c.env, 'passwordChanged', user.email, {}, userId));
  throw new Redirect('/login?msg=' + encodeURIComponent('Password updated. Please sign in with your new password.'));
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
  ['Payments and email', 'Payments are processed by Stripe; we never see or store your full card number. Account and alert emails are delivered by Resend.'],
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

mountAvatarRead(router);
mountAvatarWrite(router, requireLocalUser);

router.get('/healthz', () => new Response('ok'));

const handle = serve(router, { renderError: (status, message, req, env) => errorPage(env, 'ezdev', status, message) });

export default {
  fetch(req, env, ctx) {
    // www.<domain> → <domain>
    const url = new URL(req.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    return handle(req, env, ctx);
  },
};
