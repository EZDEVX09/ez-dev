// Profile pictures: upload (EZ DEV), serve (every product), remove.

import { HttpError, Redirect, assertSameOrigin, now } from './http.js';
import { getUser, rateLimit } from './auth.js';

const MAX_BYTES = 1_000_000;

/** Identifies the image from its first bytes; never trusts the browser-supplied type. */
export function sniffImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function avatarUrl(user) {
  return user && user.avatar_version ? `/account/avatar?v=${user.avatar_version}` : null;
}

/** GET /account/avatar — the signed-in user's own picture (works on every EZ product). */
export function mountAvatarRead(router) {
  router.get('/account/avatar', async (c) => {
    const user = await getUser(c.req, c.env);
    if (!user) throw new HttpError(401, 'Please sign in.');
    const row = await c.env.DB.prepare('SELECT mime, data FROM avatars WHERE user_id = ?').bind(user.id).first();
    if (!row) throw new HttpError(404, 'No profile picture.');
    return new Response(fromBase64(row.data), {
      headers: {
        'Content-Type': row.mime,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  });
}

/** POST /account/avatar and /account/avatar/delete — EZ DEV only. */
export function mountAvatarWrite(router, requireUser) {
  router.post('/account/avatar', async (c) => {
    assertSameOrigin(c.req);
    const user = await requireUser(c);
    const back = (msg, kind = 'error') => new Redirect(`/account?${kind}=${encodeURIComponent(msg)}#photo`);
    try { await rateLimit(c.env, `avatar:${user.id}`, 20, 3600); } catch (e) { throw back(e.message); }

    const len = Number(c.req.headers.get('Content-Length') || 0);
    if (len > MAX_BYTES + 20_000) throw back('That picture is too large. Please use one under 1 MB.');
    let file;
    try { file = (await c.req.formData()).get('avatar'); } catch { throw back('Upload failed. Please try again.'); }
    if (!file || typeof file === 'string' || !file.size) throw back('Choose a picture first.');
    if (file.size > MAX_BYTES) throw back('That picture is too large. Please use one under 1 MB.');

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffImage(bytes);
    if (!mime) throw back('Please upload a JPEG, PNG or WebP image.');

    const version = now();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO avatars (user_id, mime, data, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`)
        .bind(user.id, mime, toBase64(bytes), version),
      c.env.DB.prepare('UPDATE users SET avatar_version = ? WHERE id = ?').bind(version, user.id),
    ]);
    throw back('Profile picture updated.', 'msg');
  });

  router.post('/account/avatar/delete', async (c) => {
    assertSameOrigin(c.req);
    const user = await requireUser(c);
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM avatars WHERE user_id = ?').bind(user.id),
      c.env.DB.prepare('UPDATE users SET avatar_version = NULL WHERE id = ?').bind(user.id),
    ]);
    throw new Redirect(`/account?msg=${encodeURIComponent('Profile picture removed.')}#photo`);
  });
}
