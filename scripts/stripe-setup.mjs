#!/usr/bin/env node
// One-time (and re-runnable) Stripe setup for EZ DEV.
//
//   STRIPE_SECRET_KEY=sk_live_... \
//   EZ_URL=https://yourdomain.com \
//   PRO_PRICE=19 BUSINESS_PRICE=79 CURRENCY=usd \
//   node scripts/stripe-setup.mjs
//
// Creates (or reuses):
//   • Products "EZ DEV Pro" and "EZ DEV Business" with monthly prices (lookup keys
//     ezdev_pro_monthly / ezdev_business_monthly, which the app looks up by name)
//   • A Customer Portal configuration allowing plan switches, cancellation, card updates and invoices
//   • A webhook endpoint at <EZ_URL>/stripe/webhook
// Then prints the values to add to GitHub. Changing a price later: re-run with the new amount;
// the lookup key moves to the new price and existing subscribers keep their old price.

import { stripe, PLAN_LOOKUP_KEYS } from '../shared/billing.js';

const env = { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY };
const base = (process.env.EZ_URL || '').replace(/\/$/, '');
const currency = (process.env.CURRENCY || 'usd').toLowerCase();
const amounts = { pro: Number(process.env.PRO_PRICE), business: Number(process.env.BUSINESS_PRICE) };

if (!env.STRIPE_SECRET_KEY || !/^https:\/\//.test(base) || !(amounts.pro > 0) || !(amounts.business > 0)) {
  console.error('Usage: STRIPE_SECRET_KEY=sk_... EZ_URL=https://yourdomain.com PRO_PRICE=19 BUSINESS_PRICE=79 [CURRENCY=usd] node scripts/stripe-setup.mjs');
  process.exit(1);
}
const mode = env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'LIVE' : 'TEST';
console.log(`Stripe ${mode} mode · ${base}\n`);

const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed',
  'invoice.payment_failed',
];
const NAMES = { pro: 'EZ DEV Pro', business: 'EZ DEV Business' };
const DESCRIPTIONS = {
  pro: 'More AI builds, projects, scans and monitored sites across EZ APP, EZ SITE and EZ DEFENDER.',
  business: 'High limits for teams and agencies across EZ APP, EZ SITE and EZ DEFENDER.',
};

const products = {};
const prices = {};
const existing = await stripe(env, 'GET', '/prices', { lookup_keys: Object.values(PLAN_LOOKUP_KEYS), limit: 10, expand: ['data.product'] });

for (const plan of ['pro', 'business']) {
  const key = PLAN_LOOKUP_KEYS[plan];
  const cents = Math.round(amounts[plan] * 100);
  const current = existing.data.find((p) => p.lookup_key === key);
  let productId = current && typeof current.product === 'object' ? current.product.id : current?.product;
  if (!productId) {
    const prod = await stripe(env, 'POST', '/products', { name: NAMES[plan], description: DESCRIPTIONS[plan], metadata: { ezdev_plan: plan } });
    productId = prod.id;
    console.log(`Created product ${NAMES[plan]} (${productId})`);
  }
  products[plan] = productId;
  if (current && current.unit_amount === cents && current.currency === currency && current.active) {
    prices[plan] = current.id;
    console.log(`Reusing ${key}: ${amounts[plan]} ${currency.toUpperCase()}/month (${current.id})`);
  } else {
    const price = await stripe(env, 'POST', '/prices', {
      product: productId, currency, unit_amount: cents, recurring: { interval: 'month' },
      lookup_key: key, transfer_lookup_key: 'true', nickname: `${NAMES[plan]} monthly`,
    });
    prices[plan] = price.id;
    console.log(`Created ${key}: ${amounts[plan]} ${currency.toUpperCase()}/month (${price.id})`);
  }
}

const portal = await stripe(env, 'POST', '/billing_portal/configurations', {
  business_profile: { headline: 'EZ DEV — manage your plan' },
  default_return_url: `${base}/account`,
  features: {
    customer_update: { enabled: 'true', allowed_updates: ['email', 'address', 'name', 'tax_id'] },
    invoice_history: { enabled: 'true' },
    payment_method_update: { enabled: 'true' },
    subscription_cancel: { enabled: 'true', mode: 'at_period_end' },
    subscription_update: {
      enabled: 'true',
      default_allowed_updates: ['price', 'promotion_code'],
      proration_behavior: 'create_prorations',
      products: [
        { product: products.pro, prices: [prices.pro] },
        { product: products.business, prices: [prices.business] },
      ],
    },
  },
});
console.log(`Created customer portal configuration (${portal.id})`);

const hookUrl = `${base}/stripe/webhook`;
const hooks = await stripe(env, 'GET', '/webhook_endpoints', { limit: 100 });
const old = hooks.data.find((w) => w.url === hookUrl);
if (old) {
  await stripe(env, 'DELETE', `/webhook_endpoints/${old.id}`);
  console.log(`Replaced existing webhook ${old.id} (its secret can't be read back)`);
}
const hook = await stripe(env, 'POST', '/webhook_endpoints', { url: hookUrl, enabled_events: EVENTS, description: 'EZ DEV billing', api_version: '2024-06-20' });
console.log(`Created webhook → ${hookUrl}\n`);

console.log('Add these in GitHub → Settings → Secrets and variables → Actions:\n');
console.log(`  Secret    STRIPE_SECRET_KEY      = (the key you used, or a restricted key)`);
console.log(`  Secret    STRIPE_WEBHOOK_SECRET  = ${hook.secret}`);
console.log(`  Variable  STRIPE_PORTAL_CONFIG   = ${portal.id}`);
console.log('\nThen push to main (or re-run the deploy workflow).');
