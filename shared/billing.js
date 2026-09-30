// Stripe billing: Checkout, Customer Portal and signed webhooks, using Stripe's REST API directly.
//
// Plans are linked to Stripe Prices by lookup key, so no price IDs need configuring:
//   ezdev_pro_monthly       → pro
//   ezdev_business_monthly  → business
// scripts/stripe-setup.mjs creates these prices, the portal configuration and the webhook.

import { HttpError, now } from './http.js';
import { PLANS } from './config.js';

const API = 'https://api.stripe.com/v1';
export const PLAN_LOOKUP_KEYS = { pro: 'ezdev_pro_monthly', business: 'ezdev_business_monthly' };
const LOOKUP_TO_PLAN = Object.fromEntries(Object.entries(PLAN_LOOKUP_KEYS).map(([p, k]) => [k, p]));
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function billingEnabled(env) {
  return !!env.STRIPE_SECRET_KEY;
}

// ---------- REST client ----------

function encode(params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? encode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') encode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(env, method, path, params, { idempotencyKey } = {}) {
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Payments are not set up yet. Please contact us to upgrade.');
  let url = `${API}${path}`;
  const init = {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2024-06-20' },
  };
  if (method === 'GET' || method === 'DELETE') {
    const qs = encode(params).toString();
    if (qs) url += `?${qs}`;
  } else {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = encode(params).toString();
    if (idempotencyKey) init.headers['Idempotency-Key'] = idempotencyKey;
  }
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Stripe error', method, path, res.status, JSON.stringify(body.error || body).slice(0, 400));
    throw new HttpError(502, 'Our payment provider returned an error. Please try again.');
  }
  return body;
}

// ---------- Prices (cached per isolate) ----------

let priceCache = null;
export async function getPlanPrices(env) {
  if (!billingEnabled(env)) return {};
  if (priceCache && priceCache.at > Date.now() - 10 * 60 * 1000) return priceCache.prices;
  const list = await stripe(env, 'GET', '/prices', { lookup_keys: Object.values(PLAN_LOOKUP_KEYS), active: 'true', limit: 10 });
  const prices = {};
  for (const p of list.data || []) {
    const plan = LOOKUP_TO_PLAN[p.lookup_key];
    if (plan) prices[plan] = { id: p.id, amount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval || 'month' };
  }
  priceCache = { at: Date.now(), prices };
  return prices;
}
export function resetPriceCache() { priceCache = null; }

export function formatPrice(p) {
  if (!p) return null;
  const amount = (p.amount / 100).toLocaleString('en-US', { style: 'currency', currency: p.currency.toUpperCase(), minimumFractionDigits: p.amount % 100 ? 2 : 0 });
  return amount;
}

// ---------- Checkout & portal ----------

async function ensureCustomer(env, user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const c = await stripe(env, 'POST', '/customers', { email: user.email, name: user.name, metadata: { user_id: user.id } }, { idempotencyKey: `customer-${user.id}` });
  await env.DB.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').bind(c.id, user.id).run();
  return c.id;
}

export async function createCheckout(env, user, plan, baseUrl) {
  if (!PLAN_LOOKUP_KEYS[plan]) throw new HttpError(400, 'Unknown plan.');
  const prices = await getPlanPrices(env);
  if (!prices[plan]) throw new HttpError(503, 'That plan is not available for purchase yet.');
  const customer = await ensureCustomer(env, user);
  const session = await stripe(env, 'POST', '/checkout/sessions', {
    mode: 'subscription',
    customer,
    client_reference_id: user.id,
    line_items: [{ price: prices[plan].id, quantity: 1 }],
    allow_promotion_codes: 'true',
    billing_address_collection: 'auto',
    subscription_data: { metadata: { user_id: user.id, plan } },
    metadata: { user_id: user.id, plan },
    success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pricing?canceled=1`,
  });
  return session.url;
}

export async function createPortal(env, user, baseUrl) {
  if (!user.stripe_customer_id) throw new HttpError(400, 'You don’t have a billing account yet.');
  const params = { customer: user.stripe_customer_id, return_url: `${baseUrl}/account#billing` };
  if (env.STRIPE_PORTAL_CONFIG) params.configuration = env.STRIPE_PORTAL_CONFIG;
  const s = await stripe(env, 'POST', '/billing_portal/sessions', params);
  return s.url;
}

// ---------- Applying subscription state ----------

/**
 * Writes a Stripe subscription's current state onto the matching user.
 * Returns { userId, email, name, prevPlan, plan, status } or null if no user matches.
 */
export async function applySubscription(env, sub) {
  let user = null;
  if (sub.metadata?.user_id) user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(sub.metadata.user_id).first();
  if (!user && sub.customer) user = await env.DB.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').bind(typeof sub.customer === 'string' ? sub.customer : sub.customer.id).first();
  if (!user) { console.warn('Stripe subscription for unknown user', sub.id); return null; }

  // Ignore stale events about an older subscription once the user has a different one.
  if (user.stripe_subscription_id && user.stripe_subscription_id !== sub.id && sub.status !== 'active' && sub.status !== 'trialing') {
    return { userId: user.id, email: user.email, name: user.name, prevPlan: user.plan, plan: user.plan, status: user.subscription_status, ignored: true };
  }

  const lookup = sub.items?.data?.[0]?.price?.lookup_key;
  const plan = PAID_STATUSES.has(sub.status) && LOOKUP_TO_PLAN[lookup] ? LOOKUP_TO_PLAN[lookup] : 'free';
  const periodEnd = sub.current_period_end || sub.items?.data?.[0]?.current_period_end || null;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  // Atomic compare-and-set on the plan, so concurrent syncs (webhook + checkout return) report a change only once.
  const changed = await env.DB.prepare('UPDATE users SET plan = ? WHERE id = ? AND plan != ?').bind(plan, user.id, plan).run();
  await env.DB.prepare(
    `UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, ?), stripe_subscription_id = ?,
       subscription_status = ?, current_period_end = ?, cancel_at_period_end = ? WHERE id = ?`
  ).bind(customerId || null, sub.id, sub.status, periodEnd, sub.cancel_at_period_end ? 1 : 0, user.id).run();
  return { userId: user.id, email: user.email, name: user.name, prevPlan: user.plan, plan, status: sub.status, periodEnd, changed: changed.meta.changes > 0 };
}

export async function fetchSubscription(env, id) {
  return stripe(env, 'GET', `/subscriptions/${encodeURIComponent(id)}`);
}

export async function cancelSubscriptionNow(env, subscriptionId) {
  return stripe(env, 'DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export function planName(plan) {
  return (PLANS[plan] || PLANS.free).name;
}

export function formatDate(ts) {
  return ts ? new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : null;
}

// ---------- Webhook signature verification ----------

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export async function signPayload(secret, timestamp, payload) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyWebhook(env, payload, header, toleranceSec = 300) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Webhook secret not configured.');
  const parts = Object.create(null);
  const v1 = [];
  for (const item of String(header || '').split(',')) {
    const [k, v] = item.split('=');
    if (k === 'v1') v1.push(v); else if (k) parts[k.trim()] = v;
  }
  const t = Number(parts.t);
  if (!t || !v1.length) throw new HttpError(400, 'Invalid signature header.');
  if (Math.abs(now() - t) > toleranceSec) throw new HttpError(400, 'Signature timestamp outside tolerance.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  for (const sig of v1) {
    if (!/^[0-9a-f]{64}$/.test(sig)) continue;
    const ok = await crypto.subtle.verify('HMAC', key, hexToBytes(sig), new TextEncoder().encode(`${t}.${payload}`));
    if (ok) return JSON.parse(payload);
  }
  throw new HttpError(400, 'Invalid signature.');
}
