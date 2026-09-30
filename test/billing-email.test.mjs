// Stripe billing + transactional email tests, against in-memory fakes of Stripe and Resend.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStack, Browser, installFetchMock, dnsAnswer } from './harness.mjs';
import { signPayload } from '../shared/billing.js';

const DEV = 'http://localhost:8787';
const APP = 'http://localhost:8788';
const DEF = 'http://localhost:8790';
const WHSEC = 'whsec_test_secret';

let stack;
let restore;
const emails = [];
const stripeCalls = [];
const S = {
  n: 0,
  customers: {},
  sessions: {},
  subs: {},
  prices: [
    { id: 'price_pro', lookup_key: 'ezdev_pro_monthly', unit_amount: 1900, currency: 'usd', recurring: { interval: 'month' }, active: true },
    { id: 'price_biz', lookup_key: 'ezdev_business_monthly', unit_amount: 7900, currency: 'usd', recurring: { interval: 'month' }, active: true },
  ],
};
const id = (p) => `${p}_${++S.n}`;
const form = (body) => Object.fromEntries(new URLSearchParams(body));
const ok = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });

function fakeStripe(req, body) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/v1/, '');
  stripeCalls.push(`${req.method} ${path}`);
  assert.equal(req.headers.get('Authorization'), 'Bearer sk_test_123');
  if (req.method === 'GET' && path === '/prices') return ok({ data: S.prices });
  if (req.method === 'POST' && path === '/customers') {
    const f = form(body);
    const c = { id: id('cus'), email: f.email, metadata: { user_id: f['metadata[user_id]'] } };
    S.customers[c.id] = c;
    return ok(c);
  }
  if (req.method === 'POST' && path === '/checkout/sessions') {
    const f = form(body);
    const s = { id: id('cs_test'), customer: f.customer, client_reference_id: f.client_reference_id, price: f['line_items[0][price]'], metadata: { user_id: f['metadata[user_id]'] }, success_url: f.success_url, subscription: null };
    s.url = `https://checkout.stripe.com/c/pay/${s.id}`;
    S.sessions[s.id] = s;
    return ok(s);
  }
  let m;
  if (req.method === 'GET' && (m = /^\/checkout\/sessions\/(.+)$/.exec(path))) return ok(S.sessions[m[1]]);
  if (req.method === 'GET' && (m = /^\/subscriptions\/(.+)$/.exec(path))) return ok(S.subs[m[1]]);
  if (req.method === 'DELETE' && (m = /^\/subscriptions\/(.+)$/.exec(path))) { S.subs[m[1]].status = 'canceled'; return ok(S.subs[m[1]]); }
  if (req.method === 'POST' && path === '/billing_portal/sessions') return ok({ url: `https://billing.stripe.com/p/session/${form(body).customer}` });
  return new Response(JSON.stringify({ error: { message: `unmocked ${req.method} ${path}` } }), { status: 400 });
}

/** Simulates the customer paying in Stripe Checkout. */
function completeCheckout(sessionId) {
  const s = S.sessions[sessionId];
  const price = S.prices.find((p) => p.id === s.price);
  const sub = {
    id: id('sub'), customer: s.customer, status: 'active', cancel_at_period_end: false,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    metadata: { user_id: s.metadata.user_id }, items: { data: [{ price }] },
  };
  S.subs[sub.id] = sub;
  s.subscription = sub.id;
  return sub;
}

before(async () => {
  stack = await createStack({ extraEnv: { STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: WHSEC, RESEND_API_KEY: 're_test', EMAIL_FROM: 'EZ DEV <no-reply@ezdev.test>' } });
  restore = installFetchMock(async (req) => {
    const url = new URL(req.url);
    const body = ['GET', 'HEAD'].includes(req.method) ? '' : await req.text();
    if (url.hostname === 'api.stripe.com') return fakeStripe(req, body);
    if (url.hostname === 'api.resend.com') {
      assert.equal(req.headers.get('Authorization'), 'Bearer re_test');
      const msg = JSON.parse(body);
      emails.push(msg);
      return ok({ id: `email_${emails.length}` });
    }
    if (url.hostname === 'cloudflare-dns.com') {
      const name = url.searchParams.get('name');
      const type = url.searchParams.get('type');
      if (name === '_ezdefender.mon.test' && type === 'TXT') {
        const site = await stack.DB.prepare("SELECT token FROM sites WHERE domain = 'mon.test'").first();
        return dnsAnswer([{ type: 16, data: `"ezdefender-verify=${site.token}"` }]);
      }
      if (type === 'A' && name === 'mon.test') return dnsAnswer([{ type: 1, data: '93.184.216.34' }]);
      return dnsAnswer([]);
    }
    if (url.hostname === 'mon.test') {
      const broken = globalThis.__monBroken;
      if (url.pathname === '/.env' && broken) return new Response('SECRET_KEY=abc\n');
      return new Response('<html>ok</html>', { status: url.pathname === '/' ? 200 : 404, headers: { 'Content-Type': 'text/html' } });
    }
    return null;
  });
});
after(() => restore());

const lastEmailTo = (to) => [...emails].reverse().find((e) => e.to[0] === to);
const linkIn = (email, path) => new RegExp(`https?://[^\\s"<]+${path}\\?token=[\\w-]+`).exec(email.text)?.[0];

async function signup(b, name = 'Test User') {
  const email = `${name.toLowerCase().replace(/\W+/g, '')}${Math.random().toString(36).slice(2, 7)}@example.com`;
  const res = await b.post(`${DEV}/signup`, { form: { name, email, password: 'correct horse battery', terms: '1' } });
  assert.equal(res.status, 303);
  await stack.settle();
  return email;
}

// ---------------------------------------------------------------- Email

test('sign-up sends a welcome email with a working one-time verification link', async () => {
  const b = new Browser(stack);
  const email = await signup(b, 'Verify Me');
  const msg = lastEmailTo(email);
  assert.ok(msg, 'welcome email sent');
  assert.equal(msg.from, 'EZ DEV <no-reply@ezdev.test>');
  assert.match(msg.subject, /Welcome to EZ DEV/);
  assert.ok(msg.html.includes('Confirm my email'));

  let dash = await (await b.get(`${DEV}/dashboard`)).text();
  assert.ok(dash.includes('Please confirm your email address'));

  const link = linkIn(msg, '/verify-email');
  assert.ok(link, msg.text);
  const r = await b.get(link.replace(/^https?:\/\/[^/]+/, DEV));
  assert.equal(r.status, 303);
  dash = await (await b.get(`${DEV}/dashboard`)).text();
  assert.ok(!dash.includes('Please confirm your email address'));
  assert.equal((await b.get(link.replace(/^https?:\/\/[^/]+/, DEV))).status, 400, 'link is single-use');

  const log = await stack.DB.prepare("SELECT status FROM email_log WHERE template = 'welcomeVerify' ORDER BY id DESC").first();
  assert.equal(log.status, 'sent');
});

test('password reset: no account enumeration, single-use link, signs out everywhere', async () => {
  const b = new Browser(stack);
  const email = await signup(b, 'Forgetful');
  const other = new Browser(stack);
  await other.post(`${DEV}/login`, { form: { email, password: 'correct horse battery' } });

  const before = emails.length;
  const unknown = await new Browser(stack).post(`${DEV}/forgot`, { form: { email: 'nobody-here@example.com' } });
  const known = await new Browser(stack).post(`${DEV}/forgot`, { form: { email } });
  await stack.settle();
  const t1 = await unknown.text();
  const t2 = await known.text();
  assert.ok(t1.includes('If an account exists') && t2.includes('If an account exists'));
  assert.equal(emails.length, before + 1, 'only the real account gets an email');

  const link = linkIn(lastEmailTo(email), '/reset').replace(/^https?:\/\/[^/]+/, DEV);
  const token = new URL(link).searchParams.get('token');
  const anon = new Browser(stack);
  assert.equal((await anon.get(link)).status, 200);
  assert.equal((await anon.post(`${DEV}/reset`, { form: { token, password: 'short' } })).status, 400);
  const done = await anon.post(`${DEV}/reset`, { form: { token, password: 'my new long password' } });
  assert.match(done.headers.get('Location'), /^\/login\?msg=/);
  await stack.settle();
  assert.match(lastEmailTo(email).subject, /password was changed/);

  assert.equal((await anon.post(`${DEV}/reset`, { form: { token, password: 'another long password' } })).status, 400, 'single use');
  assert.equal((await b.get(`${DEV}/dashboard`)).status, 303, 'old sessions signed out');
  assert.equal((await other.get(`${DEV}/dashboard`)).status, 303);
  assert.equal((await new Browser(stack).post(`${DEV}/login`, { form: { email, password: 'correct horse battery' } })).status, 401);
  assert.equal((await new Browser(stack).post(`${DEV}/login`, { form: { email, password: 'my new long password' } })).status, 303);
});

// ---------------------------------------------------------------- Billing

async function webhook(event, { secret = WHSEC, t = Math.floor(Date.now() / 1000) } = {}) {
  const payload = JSON.stringify(event);
  const sig = await signPayload(secret, t, payload);
  const res = await stack.apps.ezdev.fetch(new Request(`${DEV}/stripe/webhook`, {
    method: 'POST', body: payload, headers: { 'Stripe-Signature': `t=${t},v1=${sig}`, 'Content-Type': 'application/json' },
  }));
  await stack.settle();
  return res;
}

test('Stripe: pricing, checkout, activation, portal, webhooks, cancellation', async () => {
  const b = new Browser(stack);
  const email = await signup(b, 'Paying Customer');
  const user = await stack.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();

  const pricing = await (await b.get(`${DEV}/pricing`)).text();
  assert.ok(pricing.includes('$19') && pricing.includes('$79'), 'prices come from Stripe');
  assert.ok(pricing.includes('action="/billing/checkout"'));

  // Checkout
  const co = await b.post(`${DEV}/billing/checkout`, { form: { plan: 'pro' } });
  assert.equal(co.status, 303);
  const checkoutUrl = co.headers.get('Location');
  assert.match(checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  const sessionId = checkoutUrl.split('/').pop();
  assert.equal(S.sessions[sessionId].client_reference_id, user.id);
  assert.equal(S.sessions[sessionId].price, 'price_pro');
  assert.ok(Object.values(S.customers).some((c) => c.metadata.user_id === user.id));

  // Pay, return to success page → plan synced immediately, one activation email
  const sub = completeCheckout(sessionId);
  const back = await b.get(`${DEV}/billing/success?session_id=${sessionId}`);
  assert.match(decodeURIComponent(back.headers.get('Location')), /You're on Pro/);
  await stack.settle();
  let row = await stack.DB.prepare('SELECT plan, subscription_status, stripe_subscription_id FROM users WHERE id = ?').bind(user.id).first();
  assert.deepEqual({ ...row }, { plan: 'pro', subscription_status: 'active', stripe_subscription_id: sub.id });
  assert.equal(emails.filter((e) => e.to[0] === email && /You're on EZ DEV Pro/.test(e.subject)).length, 1);

  // The webhook arriving afterwards doesn't send a duplicate email
  const evt = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { ...S.sessions[sessionId] } } };
  assert.equal((await webhook(evt)).status, 200);
  assert.equal(emails.filter((e) => e.to[0] === email && /You're on EZ DEV Pro/.test(e.subject)).length, 1);
  const dup = await (await webhook(evt)).json();
  assert.equal(dup.duplicate, true);

  // Pro limits apply in the subsidiaries
  await b.get(`${APP}/dashboard`, { follow: true });
  const appDash = await (await b.get(`${APP}/dashboard`)).text();
  assert.ok(appDash.includes('/ 300 AI builds'));

  // Account shows billing + portal
  const acct = await (await b.get(`${DEV}/account`)).text();
  assert.ok(acct.includes('Renews on'));
  const portal = await b.post(`${DEV}/billing/portal`);
  assert.match(portal.headers.get('Location'), /^https:\/\/billing\.stripe\.com\//);
  // A second checkout while subscribed goes to the portal instead of double-charging
  assert.match((await b.post(`${DEV}/billing/checkout`, { form: { plan: 'business' } })).headers.get('Location'), /billing\.stripe\.com/);

  // Forged / stale signatures are rejected
  assert.equal((await webhook({ id: 'evt_x', type: 'customer.subscription.deleted', data: { object: sub } }, { secret: 'whsec_wrong' })).status, 400);
  assert.equal((await webhook({ id: 'evt_y', type: 'customer.subscription.deleted', data: { object: sub } }, { t: Math.floor(Date.now() / 1000) - 3600 })).status, 400);
  row = await stack.DB.prepare('SELECT plan FROM users WHERE id = ?').bind(user.id).first();
  assert.equal(row.plan, 'pro');

  // Upgrade in the portal → subscription.updated (re-fetched from Stripe)
  S.subs[sub.id].items.data[0].price = S.prices[1];
  await webhook({ id: 'evt_2', type: 'customer.subscription.updated', data: { object: { id: sub.id } } });
  row = await stack.DB.prepare('SELECT plan FROM users WHERE id = ?').bind(user.id).first();
  assert.equal(row.plan, 'business');

  // Payment failure → email
  await webhook({ id: 'evt_3', type: 'invoice.payment_failed', data: { object: { customer: sub.customer } } });
  assert.match(lastEmailTo(email).subject, /payment failed/);

  // Subscription ends → back to free + email
  S.subs[sub.id].status = 'canceled';
  await webhook({ id: 'evt_4', type: 'customer.subscription.deleted', data: { object: { ...S.subs[sub.id] } } });
  row = await stack.DB.prepare('SELECT plan, subscription_status FROM users WHERE id = ?').bind(user.id).first();
  assert.deepEqual({ ...row }, { plan: 'free', subscription_status: 'canceled' });
  assert.match(lastEmailTo(email).subject, /subscription has ended/);

  // Someone can't claim another user's checkout
  const thief = new Browser(stack);
  await signup(thief, 'Thief');
  assert.equal((await thief.get(`${DEV}/billing/success?session_id=${sessionId}`)).status, 403);
});

test('deleting an account cancels its Stripe subscription', async () => {
  const b = new Browser(stack);
  const email = await signup(b, 'Leaving Payer');
  const co = await b.post(`${DEV}/billing/checkout`, { form: { plan: 'pro' } });
  const sessionId = co.headers.get('Location').split('/').pop();
  const sub = completeCheckout(sessionId);
  await b.get(`${DEV}/billing/success?session_id=${sessionId}`);
  const res = await b.post(`${DEV}/account/delete`, { form: { confirm: email, password: 'correct horse battery' } });
  assert.equal(res.headers.get('Location'), '/?signed_out=1');
  assert.ok(stripeCalls.includes(`DELETE /subscriptions/${sub.id}`));
  assert.equal(S.subs[sub.id].status, 'canceled');
});

// ---------------------------------------------------------------- EZ DEFENDER alert emails

test('EZ DEFENDER monitoring emails verified users about new problems (and respects the preference)', async () => {
  const b = new Browser(stack);
  const email = await signup(b, 'Monitor Owner');
  await b.get(linkIn(lastEmailTo(email), '/verify-email').replace(/^https?:\/\/[^/]+/, DEV));
  await b.get(`${DEF}/dashboard`, { follow: true });
  const add = await b.post(`${DEF}/sites`, { form: { domain: 'mon.test' } });
  const sitePath = add.headers.get('Location');
  assert.match((await b.post(`${DEF}${sitePath}/verify`)).headers.get('Location'), /msg=Verified/);
  await b.post(`${DEF}/scans`, { form: { url: 'mon.test' } });
  await b.post(`${DEF}${sitePath}/monitor`, { form: { on: '1' } });

  globalThis.__monBroken = true;
  await stack.DB.prepare("UPDATE sites SET last_scan_at = 0 WHERE domain = 'mon.test'").run();
  await stack.apps.ezdefender.module.runMonitoring(stack.env);
  const alert = lastEmailTo(email);
  assert.match(alert.subject, /EZ DEFENDER alert for mon.test/);
  assert.ok(alert.text.includes('.env secrets file exposed'));

  // Turn alert emails off → the next alert stays in-app only
  await b.post(`${DEV}/account/notifications`, { form: {} });
  const count = emails.length;
  globalThis.__monBroken = false;
  await stack.DB.prepare("UPDATE sites SET last_scan_at = 0 WHERE domain = 'mon.test'").run();
  await stack.apps.ezdefender.module.runMonitoring(stack.env);
  globalThis.__monBroken = true;
  await stack.DB.prepare("UPDATE sites SET last_scan_at = 0 WHERE domain = 'mon.test'").run();
  await stack.apps.ezdefender.module.runMonitoring(stack.env);
  assert.equal(emails.length, count);
  const alerts = await stack.DB.prepare("SELECT COUNT(*) AS n FROM alerts a JOIN sites s ON s.id = a.site_id WHERE s.domain = 'mon.test'").first();
  assert.ok(alerts.n >= 2);
});
