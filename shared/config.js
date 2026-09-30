// Product catalogue, URLs and plan limits shared by all four Workers.

export const PRODUCTS = {
  ezdev: { key: 'ezdev', name: 'EZ DEV', tagline: 'The EZ family of builder and security tools', accent: 'lime', envUrl: 'EZDEV_URL' },
  ezapp: { key: 'ezapp', name: 'EZ APP', tagline: 'AI app builder', accent: 'blue', envUrl: 'EZAPP_URL' },
  ezsite: { key: 'ezsite', name: 'EZ SITE', tagline: 'AI website builder', accent: 'orange', envUrl: 'EZSITE_URL' },
  ezdefender: { key: 'ezdefender', name: 'EZ DEFENDER', tagline: 'Website & app security toolbox', accent: 'green', envUrl: 'EZDEFENDER_URL' },
};

export function productUrl(env, key) {
  const v = env[PRODUCTS[key].envUrl];
  if (!v) throw new Error(`Missing ${PRODUCTS[key].envUrl} configuration`);
  return v.replace(/\/$/, '');
}

export function allOrigins(env) {
  return Object.keys(PRODUCTS).map((k) => new URL(productUrl(env, k)).origin);
}

// Plan limits. Billing (Stripe) is phase 2; for now a user's plan is set in the database.
// Prices are shown on the pricing page from PLAN_PRICES and are placeholders until you set them.
export const PLANS = {
  free: {
    name: 'Free',
    aiGenerationsPerMonth: 20,
    projectsPerProduct: 3,
    scansPerDay: 10,
    monitoredSites: 1,
  },
  pro: {
    name: 'Pro',
    aiGenerationsPerMonth: 300,
    projectsPerProduct: 50,
    scansPerDay: 200,
    monitoredSites: 10,
  },
  business: {
    name: 'Business',
    aiGenerationsPerMonth: 2000,
    projectsPerProduct: 500,
    scansPerDay: 2000,
    monitoredSites: 100,
  },
};

export function planFor(user) {
  return PLANS[user.plan] || PLANS.free;
}

export const monthPeriod = () => new Date().toISOString().slice(0, 7);
export const dayPeriod = () => new Date().toISOString().slice(0, 10);

export async function getUsage(env, userId, kind, period) {
  const row = await env.DB.prepare('SELECT count FROM usage WHERE user_id = ? AND kind = ? AND period = ?')
    .bind(userId, kind, period).first();
  return row ? row.count : 0;
}

export async function addUsage(env, userId, kind, period, n = 1) {
  await env.DB.prepare(
    `INSERT INTO usage (user_id, kind, period, count) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, kind, period) DO UPDATE SET count = count + excluded.count`
  ).bind(userId, kind, period, n).run();
}
