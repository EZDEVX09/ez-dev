// Runs the four Workers inside Node with a SQLite-backed D1 shim, so the whole
// platform can be tested (and previewed) without Cloudflare or npm packages.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- D1 shim ----------

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a))); }
  async first(col) {
    const r = this.db.prepare(this.sql).get(...this.args);
    if (!r) return null;
    return col ? r[col] : { ...r };
  }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r })), success: true }; }
  async run() {
    const i = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: i.changes, last_row_id: Number(i.lastInsertRowid) } };
  }
  _runSync() { return this.db.prepare(this.sql).run(...this.args); }
}

export class D1Shim {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try { const out = stmts.map((s) => s._runSync()); this.db.exec('COMMIT'); return out.map(() => ({ success: true })); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  async exec(sql) { this.db.exec(sql); }
  migrate() {
    for (const f of readdirSync(join(root, 'migrations')).filter((x) => x.endsWith('.sql')).sort()) {
      this.db.exec(readFileSync(join(root, 'migrations', f), 'utf8'));
    }
    return this;
  }
}

// ---------- Static assets (what Cloudflare serves before the Worker runs) ----------

const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
export function serveAsset(pathname) {
  const file = normalize(join(root, 'shared/public', pathname));
  if (!file.startsWith(join(root, 'shared/public')) || !existsSync(file) || !statSync(file).isFile()) return null;
  return new Response(readFileSync(file), { headers: { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' } });
}

// ---------- The stack ----------

export const PORTS = { ezdev: 8787, ezapp: 8788, ezsite: 8789, ezdefender: 8790 };

export async function createStack({ dbPath, extraEnv = {} } = {}) {
  const DB = new D1Shim(dbPath).migrate();
  const env = {
    DB,
    EZDEV_URL: `http://localhost:${PORTS.ezdev}`,
    EZAPP_URL: `http://localhost:${PORTS.ezapp}`,
    EZSITE_URL: `http://localhost:${PORTS.ezsite}`,
    EZDEFENDER_URL: `http://localhost:${PORTS.ezdefender}`,
    COOKIE_SECURE: 'false',
    SUPPORT_EMAIL: 'ezdevsupport@proton.me',
    ANTHROPIC_API_KEY: 'test-key',
    ...extraEnv,
  };
  const apps = {};
  const pending = new Set();
  for (const key of Object.keys(PORTS)) {
    const mod = await import(pathToFileURL(join(root, 'apps', key, 'src', 'index.js')).href);
    apps[key] = {
      async fetch(req) {
        const url = new URL(req.url);
        if (req.method === 'GET') {
          const asset = serveAsset(url.pathname);
          if (asset) return asset;
        }
        const ctx = { waitUntil: (p) => { pending.add(p); p.finally(() => pending.delete(p)); }, passThroughOnException() {} };
        return mod.default.fetch(req, env, ctx);
      },
      module: mod,
    };
  }
  const byPort = Object.fromEntries(Object.entries(PORTS).map(([k, p]) => [String(p), apps[k]]));
  return {
    env, DB, apps,
    appFor(url) { return byPort[new URL(url).port]; },
    async settle() { while (pending.size) await Promise.all([...pending]); },
  };
}

// ---------- A tiny browser: cookie jar per origin, optional redirect following ----------

export class Browser {
  constructor(stack) { this.stack = stack; this.jar = new Map(); this.ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`; }

  cookieHeader(url) {
    const jar = this.jar.get(new URL(url).host) || {};
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  store(url, res) {
    const host = new URL(url).host;
    const jar = this.jar.get(host) || {};
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const maxAge = attrs.map((a) => a.trim()).find((a) => a.toLowerCase().startsWith('max-age='));
      if (!value || (maxAge && Number(maxAge.split('=')[1]) <= 0)) delete jar[name];
      else jar[name] = value;
    }
    this.jar.set(host, jar);
  }

  async request(url, { method = 'GET', form, json, multipart, headers = {}, origin, follow = false } = {}) {
    let body;
    if (multipart) body = multipart; // a FormData; Request sets the multipart Content-Type
    const h = { 'CF-Connecting-IP': this.ip, ...headers };
    if (form) { body = new URLSearchParams(form).toString(); h['Content-Type'] = 'application/x-www-form-urlencoded'; }
    if (json) { body = JSON.stringify(json); h['Content-Type'] = 'application/json'; }
    if (method !== 'GET' && origin !== false) h.Origin = origin || new URL(url).origin;
    const cookie = this.cookieHeader(url);
    if (cookie) h.Cookie = cookie;
    const app = this.stack.appFor(url);
    if (!app) throw new Error(`No app for ${url}`);
    const res = await app.fetch(new Request(url, { method, headers: h, body }));
    this.store(url, res);
    if (follow && res.status >= 300 && res.status < 400 && res.headers.get('Location')) {
      const next = new URL(res.headers.get('Location'), url);
      next.hash = '';
      return this.request(next.toString(), { follow: typeof follow === 'number' ? follow - 1 : 10 });
    }
    res.finalUrl = url;
    return res;
  }

  get(url, opts) { return this.request(url, { ...opts, method: 'GET' }); }
  post(url, opts) { return this.request(url, { ...opts, method: 'POST' }); }
}

// ---------- Mocks for outbound fetch (Claude, DNS, scanned websites) ----------

export function sseResponse(events) {
  const text = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(text, { headers: { 'Content-Type': 'text/event-stream' } });
}

/** Builds a fake Claude streaming response that calls write_files with the given files. */
export function claudeWriteFiles(summary, files) {
  const input = JSON.stringify({ summary, files });
  const parts = input.match(/.{1,700}/gs);
  return sseResponse([
    { type: 'message_start', message: { usage: { input_tokens: 1200 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'write_files', input: {} } },
    ...parts.map((p) => ({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: p } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 900 } },
    { type: 'message_stop' },
  ]);
}

export function installFetchMock(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const out = await handler(req);
    if (out) return out;
    throw new TypeError(`Unmocked fetch: ${req.url}`);
  };
  return () => { globalThis.fetch = original; };
}

export function dnsAnswer(records = [], { ad = false } = {}) {
  return new Response(JSON.stringify({ Status: 0, AD: ad, Answer: records }), { headers: { 'Content-Type': 'application/dns-json' } });
}
