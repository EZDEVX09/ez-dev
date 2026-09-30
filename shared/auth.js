// Accounts, password hashing, sessions and single sign-on across the EZ family.
//
// EZ DEV owns sign-in. Each subsidiary keeps its own host-only session cookie and gets it
// through a one-time code handed over by EZ DEV (like a tiny OAuth), so it works on
// workers.dev hostnames and on custom domains alike.

import { HttpError, Redirect, randomId, sha256Hex, now } from './http.js';
import { productUrl, allOrigins } from './config.js';

const PBKDF2_ITERATIONS = 100000; // Workers' WebCrypto maximum
const SESSION_TTL = 60 * 60 * 24 * 30;
const CODE_TTL = 60;

// ---------- Passwords ----------

function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function unb64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

export async function verifyPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored).split('$');
  if (alg !== 'pbkdf2') return false;
  const bits = new Uint8Array(await pbkdf2(password, unb64(salt), Number(iter)));
  const expected = unb64(hash);
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Use at least 10 characters for your password.';
  if (pw.length > 200) return 'That password is too long.';
  return null;
}

export function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) return null;
  return e;
}

// ---------- Cookies ----------

function secure(env) { return env.COOKIE_SECURE !== 'false'; }
export function sessionCookieName(env) { return secure(env) ? '__Host-ezsid' : 'ezsid'; }
function stateCookieName(env) { return secure(env) ? '__Host-ezstate' : 'ezstate'; }

function cookieAttrs(env, maxAge) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(env) ? '; Secure' : ''}`;
}

export function readCookie(req, name) {
  const header = req.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// ---------- Sessions ----------

export async function createSession(env, userId, app) {
  const token = randomId(32);
  const t = now();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, app, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, app, t, t + SESSION_TTL).run();
  return `${sessionCookieName(env)}=${token}; ${cookieAttrs(env, SESSION_TTL)}`;
}

export function clearSessionCookie(env) {
  return `${sessionCookieName(env)}=; ${cookieAttrs(env, 0)}`;
}

export async function getUser(req, env) {
  const token = readCookie(req, sessionCookieName(env));
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.plan, u.created_at, u.email_verified_at, u.alert_emails,
            u.stripe_customer_id, u.stripe_subscription_id, u.subscription_status, u.current_period_end,
            u.cancel_at_period_end, s.id AS session_id
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`
  ).bind(await sha256Hex(token), now()).first();
  return row || null;
}

/** Signs the user out of every EZ product. */
export async function destroyAllSessions(env, userId) {
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

// ---------- Rate limiting (fixed window, stored in D1) ----------

export async function rateLimit(env, key, limit, windowSec) {
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start <= ? THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= ? THEN excluded.window_start ELSE rate_limits.window_start END
     RETURNING count`
  ).bind(key, t, t - windowSec, t - windowSec).first();
  if (row && row.count > limit) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
}

// ---------- Single sign-on across products ----------

/** Used by the subsidiary apps: returns the user or redirects through EZ DEV sign-in. */
export async function requireUser({ req, env, url }) {
  const user = await getUser(req, env);
  if (user) return user;
  const next = url.pathname.startsWith('/api/') ? '/dashboard' : url.pathname + url.search;
  if (url.pathname.startsWith('/api/')) throw new HttpError(401, 'Please sign in again.');
  throw startSignIn(env, url.origin, next);
}

/** Returns a Redirect to EZ DEV's handoff endpoint, remembering where to come back to. */
export function startSignIn(env, ownOrigin, next) {
  const state = randomId(18);
  const safeNext = safePath(next);
  const cookie = `${stateCookieName(env)}=${encodeURIComponent(`${state}|${safeNext}`)}; ${cookieAttrs(env, 600)}`;
  const target = new URL(`${productUrl(env, 'ezdev')}/auth/handoff`);
  target.searchParams.set('return_to', `${ownOrigin}/auth/callback`);
  target.searchParams.set('state', state);
  return new Redirect(target.toString(), 303, { 'Set-Cookie': cookie });
}

/** EZ DEV side: issue a one-time code for an allowed product origin. */
export async function issueHandoffCode(env, userId, returnTo) {
  let target;
  try { target = new URL(returnTo); } catch { throw new HttpError(400, 'Invalid return address.'); }
  if (!allOrigins(env).includes(target.origin) || target.pathname !== '/auth/callback') {
    throw new HttpError(400, 'That return address is not an EZ product.');
  }
  const code = randomId(32);
  await env.DB.prepare('INSERT INTO auth_codes (code_hash, user_id, origin, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(code), userId, target.origin, now() + CODE_TTL).run();
  return { target, code };
}

/** Subsidiary side: exchange the code for a local session. */
export async function completeHandoff({ req, env, url }, app) {
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const saved = readCookie(req, stateCookieName(env)) || '';
  const [savedState, savedNext] = saved.split('|');
  if (!state || !savedState || state !== savedState) throw new HttpError(400, 'Sign-in link expired. Please try again.');
  const row = await env.DB.prepare('DELETE FROM auth_codes WHERE code_hash = ? RETURNING user_id, origin, expires_at')
    .bind(await sha256Hex(code)).first();
  if (!row || row.expires_at < now() || row.origin !== url.origin) throw new HttpError(400, 'Sign-in link expired. Please try again.');
  const sessionCookie = await createSession(env, row.user_id, app);
  const headers = new Headers({ Location: safePath(savedNext || '/dashboard'), 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', sessionCookie);
  headers.append('Set-Cookie', `${stateCookieName(env)}=; ${cookieAttrs(env, 0)}`);
  return new Response(null, { status: 303, headers });
}

/** Only allow same-site relative paths as post-login destinations. */
export function safePath(p) {
  const s = String(p || '');
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || /[\r\n]/.test(s)) return '/dashboard';
  return s;
}

// ---------- Email tokens (verification & password reset) ----------

export async function createEmailToken(env, userId, kind, ttlSeconds) {
  const token = randomId(32);
  // Only one live token of each kind per user.
  await env.DB.prepare('DELETE FROM email_tokens WHERE user_id = ? AND kind = ?').bind(userId, kind).run();
  await env.DB.prepare('INSERT INTO email_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, kind, now() + ttlSeconds).run();
  return token;
}

/** Returns the user id if the token is valid (without using it up). */
export async function peekEmailToken(env, token, kind) {
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare('SELECT user_id FROM email_tokens WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ?')
    .bind(await sha256Hex(token), kind, now()).first();
  return row ? row.user_id : null;
}

/** Uses the token up atomically and returns the user id, or null. */
export async function consumeEmailToken(env, token, kind) {
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare('UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id')
    .bind(now(), await sha256Hex(token), kind, now()).first();
  return row ? row.user_id : null;
}
