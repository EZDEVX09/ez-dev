#!/usr/bin/env node
// Generates apps/*/wrangler.json from ez.config.json + environment.
//
//   node scripts/configure.mjs            → production configs
//   node scripts/configure.mjs --local    → local dev configs (http://localhost:878x)
//
// Environment (all optional; CI sets them from GitHub secrets/variables):
//   EZ_DOMAIN              your domain, e.g. ezdev.com → ezdev.com, app., site., defender.
//   CF_WORKERS_SUBDOMAIN   your <name>.workers.dev subdomain (auto-detected when possible)
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID   used to find/create the D1 database and detect the subdomain
//   EZ_D1_DATABASE_ID      override the D1 database id

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(root, 'ez.config.json'), 'utf8'));
const local = process.argv.includes('--local');

const APPS = [
  { dir: 'ezdev', worker: 'ez-dev', sub: '', port: 8787 },
  { dir: 'ezapp', worker: 'ez-app', sub: 'app', port: 8788 },
  { dir: 'ezsite', worker: 'ez-site', sub: 'site', port: 8789 },
  { dir: 'ezdefender', worker: 'ez-defender', sub: 'defender', port: 8790 },
];

const domain = (process.env.EZ_DOMAIN || cfg.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;

async function cf(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(`${path}: ${JSON.stringify(body.errors || body).slice(0, 300)}`);
  return body.result;
}

async function resolveDatabaseId() {
  if (process.env.EZ_D1_DATABASE_ID) return process.env.EZ_D1_DATABASE_ID;
  if (local || !token || !account) return cfg.d1DatabaseId;
  const list = await cf(`/accounts/${account}/d1/database?name=${encodeURIComponent(cfg.d1DatabaseName)}`);
  const found = list.find((d) => d.name === cfg.d1DatabaseName);
  if (found) return found.uuid;
  console.log(`Creating D1 database ${cfg.d1DatabaseName}…`);
  const created = await cf(`/accounts/${account}/d1/database`, { method: 'POST', body: JSON.stringify({ name: cfg.d1DatabaseName }) });
  return created.uuid;
}

async function resolveSubdomain() {
  if (process.env.CF_WORKERS_SUBDOMAIN) return process.env.CF_WORKERS_SUBDOMAIN;
  if (cfg.workersSubdomain) return cfg.workersSubdomain;
  if (!token || !account) return '';
  try { return (await cf(`/accounts/${account}/workers/subdomain`)).subdomain || ''; } catch (e) { console.warn('Could not detect workers.dev subdomain:', e.message); return ''; }
}

const dbId = await resolveDatabaseId();
const subdomain = local || domain ? '' : await resolveSubdomain();
if (!local && !domain && !subdomain) {
  console.error('Set EZ_DOMAIN (your domain) or CF_WORKERS_SUBDOMAIN so the products know their addresses.');
  process.exit(1);
}

function urlFor(app) {
  if (local) return `http://localhost:${app.port}`;
  if (domain) return `https://${app.sub ? `${app.sub}.` : ''}${domain}`;
  return `https://${app.worker}.${subdomain}.workers.dev`;
}

const vars = {
  EZDEV_URL: urlFor(APPS[0]),
  EZAPP_URL: urlFor(APPS[1]),
  EZSITE_URL: urlFor(APPS[2]),
  EZDEFENDER_URL: urlFor(APPS[3]),
  COOKIE_SECURE: local ? 'false' : 'true',
  SUPPORT_EMAIL: cfg.supportEmail,
  CLAUDE_MODEL: process.env.EZ_CLAUDE_MODEL || cfg.claudeModel,
  ...(process.env.EZ_EMAIL_FROM || domain ? { EMAIL_FROM: process.env.EZ_EMAIL_FROM || `EZ DEV <no-reply@${domain}>` } : {}),
  ...(process.env.STRIPE_PORTAL_CONFIG ? { STRIPE_PORTAL_CONFIG: process.env.STRIPE_PORTAL_CONFIG } : {}),
};

for (const app of APPS) {
  const conf = {
    name: app.worker,
    main: 'src/index.js',
    compatibility_date: cfg.compatibilityDate,
    workers_dev: !domain,
    preview_urls: false,
    observability: { enabled: true },
    assets: { directory: '../../shared/public', binding: 'ASSETS' },
    d1_databases: [{ binding: 'DB', database_name: cfg.d1DatabaseName, database_id: dbId, migrations_dir: '../../migrations' }],
    vars,
    ...(domain ? { routes: [{ pattern: app.sub ? `${app.sub}.${domain}` : domain, custom_domain: true }] } : {}),
    ...(app.dir === 'ezdefender' ? { triggers: { crons: ['*/10 * * * *'] } } : {}),
    ...(local ? { dev: { port: app.port } } : {}),
  };
  writeFileSync(join(root, 'apps', app.dir, 'wrangler.json'), JSON.stringify(conf, null, 2) + '\n');
}

console.log(`Configured ${APPS.length} workers${domain ? ` for ${domain}` : subdomain ? ` on ${subdomain}.workers.dev` : ' for local dev'} (D1 ${dbId}).`);
for (const [k, v] of Object.entries(vars)) if (k.endsWith('_URL')) console.log(`  ${k.padEnd(15)} ${v}`);
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, `ezdev_url=${vars.EZDEV_URL}\n`, { flag: 'a' });
}
