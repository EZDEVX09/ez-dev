// Tiny, dependency-free HTTP toolkit for Cloudflare Workers.

import { allOrigins } from './config.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export class Redirect extends Error {
  constructor(location, status = 303, headers = {}) {
    super('redirect');
    this.location = location;
    this.status = status;
    this.headers = headers;
  }
}

// ---------- HTML templating with auto-escaping ----------

export class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderValue(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return escapeHtml(v);
}

/** Tagged template: interpolated values are HTML-escaped unless wrapped in raw() or produced by h``. */
export function h(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += renderValue(vals[i]) + strings[i + 1];
  return new Raw(out);
}

// ---------- Responses ----------

const BASE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(headers, { csp = BASE_CSP, frameable = false } = {}) {
  headers.set('Content-Security-Policy', csp);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (!frameable) headers.set('X-Frame-Options', 'DENY');
  return headers;
}

export function html(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  securityHeaders(headers);
  return new Response(String(body), { status, headers });
}

/** Lets a page's forms (and the redirects that follow them) reach the given extra origins. */
export function allowFormTargets(res, origins) {
  const csp = res.headers.get('Content-Security-Policy') || '';
  res.headers.set('Content-Security-Policy', csp.replace("form-action 'self'", `form-action 'self' ${origins.join(' ')}`));
  return res;
}

export function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  securityHeaders(headers);
  return new Response(JSON.stringify(data), { status, headers });
}

export function redirect(location, status = 303, extraHeaders = {}) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', ...extraHeaders });
  securityHeaders(headers);
  return new Response(null, { status, headers });
}

// ---------- Request helpers ----------

/** Rejects cross-site state-changing requests (CSRF defence on top of SameSite cookies). */
export function assertSameOrigin(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.get('Origin');
  const own = new URL(req.url).origin;
  if (origin) {
    if (origin !== own) throw new HttpError(403, 'Cross-site request blocked.');
    return;
  }
  const site = req.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'Cross-site request blocked.');
  if (!site) throw new HttpError(403, 'Missing Origin header.');
}

export async function readForm(req) {
  const ct = req.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    const data = await req.json().catch(() => null);
    if (!data || typeof data !== 'object') throw new HttpError(400, 'Invalid JSON body.');
    return data;
  }
  const fd = await req.formData();
  const out = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string') out[k] = v;
  return out;
}

export function wantsJson(req) {
  return (req.headers.get('Accept') || '').includes('application/json') ||
    (req.headers.get('Content-Type') || '').includes('application/json');
}

export function clientIp(req) {
  return req.headers.get('CF-Connecting-IP') || 'unknown';
}

// ---------- Router ----------

export class Router {
  constructor() { this.routes = []; }

  on(method, pattern, handler) {
    const keys = [];
    const src = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\/\*$/, '/(?<__rest>.*)')
      .replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return `(?<${k}>[^/]+)`; });
    this.routes.push({ method, re: new RegExp(`^${src}$`), handler });
    return this;
  }
  get(p, h) { return this.on('GET', p, h); }
  post(p, h) { return this.on('POST', p, h); }

  async handle(req, env, ctx) {
    const url = new URL(req.url);
    let methodMismatch = false;
    for (const r of this.routes) {
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      if (r.method !== req.method && !(r.method === 'GET' && req.method === 'HEAD')) { methodMismatch = true; continue; }
      const params = {};
      for (const [k, v] of Object.entries(m.groups || {})) params[k === '__rest' ? 'rest' : k] = v === undefined ? '' : decodeURIComponent(v);
      return r.handler({ req, env, ctx, url, params });
    }
    if (methodMismatch) throw new HttpError(405, 'Method not allowed.');
    throw new HttpError(404, 'Page not found.');
  }
}

/** Wraps a router into a Worker fetch handler with uniform error handling. */
export function serve(router, { renderError }) {
  return async (req, env, ctx) => {
    let res;
    try {
      res = await router.handle(req, env, ctx);
    } catch (err) {
      res = errorResponse(err, req, env, renderError);
    }
    // Sign-in, sign-out and the hero form redirect between the four EZ sites after a form
    // is submitted; browsers apply form-action to those redirects, so allow exactly those origins.
    if (res.headers.has('Content-Security-Policy') && env.EZDEV_URL) {
      try { res = allowFormTargets(res, allOrigins(env)); } catch { /* immutable response */ }
    }
    return res;
  };
}

function errorResponse(err, req, env, renderError) {
  if (err instanceof Redirect) return redirect(err.location, err.status, err.headers);
  const status = err instanceof HttpError ? err.status : 500;
  if (!(err instanceof HttpError)) console.error(err && err.stack || err);
  const message = err instanceof HttpError ? err.message : 'Something went wrong on our side. Please try again.';
  if (wantsJson(req) || new URL(req.url).pathname.startsWith('/api/')) {
    return json({ error: message, ...(err.extra || {}) }, status);
  }
  return html(renderError(status, message, req, env), status);
}

// ---------- Misc ----------

export function randomId(bytes = 12) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const now = () => Math.floor(Date.now() / 1000);

export function timeAgo(ts) {
  const d = now() - ts;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} d ago`;
  return new Date(ts * 1000).toISOString().slice(0, 10);
}
