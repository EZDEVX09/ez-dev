// Profile picture upload, display and safety checks.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createStack, Browser } from './harness.mjs';

const DEV = 'http://localhost:8787';
const APP = 'http://localhost:8788';
const DEF = 'http://localhost:8790';
let stack;
before(async () => { stack = await createStack(); });

// A real 1×1 PNG and a tiny JPEG header-valid payload
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const upload = (bytes, type = 'image/png', name = 'me.png') => {
  const fd = new FormData();
  fd.append('avatar', new File([bytes], name, { type }));
  return fd;
};

async function signup(b, name) {
  const email = `${name.toLowerCase().replace(/\W/g, '')}${Math.random().toString(36).slice(2, 7)}@example.com`;
  const r = await b.post(`${DEV}/signup`, { form: { name, email, password: 'correct horse battery', terms: '1' } });
  assert.equal(r.status, 303);
}

test('upload a profile picture, see it everywhere, remove it', async () => {
  const b = new Browser(stack);
  await signup(b, 'Pic Person');

  let acct = await (await b.get(`${DEV}/account`)).text();
  assert.ok(acct.includes('Profile picture'));
  assert.ok(acct.includes('/assets/account.js'));
  assert.equal((await b.get(`${DEV}/account/avatar`)).status, 404);

  const res = await b.post(`${DEV}/account/avatar`, { multipart: upload(PNG) });
  assert.equal(res.status, 303);
  assert.match(decodeURIComponent(res.headers.get('Location')), /msg=Profile picture updated/);

  const dash = await (await b.get(`${DEV}/dashboard`)).text();
  const src = /<summary class="avatar"[^>]*><img src="([^"]+)"/.exec(dash)?.[1];
  assert.ok(src, 'header shows the picture');
  const img = await b.get(`${DEV}${src.replace(/&amp;/g, '&')}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('Content-Type'), 'image/png');
  assert.equal(img.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await img.arrayBuffer()), PNG);

  // Shows in the subsidiaries' headers too
  await b.get(`${APP}/dashboard`, { follow: true });
  assert.match(await (await b.get(`${APP}/dashboard`)).text(), /<summary class="avatar"[^>]*><img src="\/account\/avatar\?v=/);
  assert.equal((await b.get(`${APP}/account/avatar`)).status, 200);

  // Only the owner can fetch it
  assert.equal((await new Browser(stack).get(`${DEV}/account/avatar`)).status, 401);

  // Remove
  await b.post(`${DEV}/account/avatar/delete`);
  assert.equal((await b.get(`${DEV}/account/avatar`)).status, 404);
  assert.ok(!/<summary class="avatar"[^>]*><img/.test(await (await b.get(`${DEV}/dashboard`)).text()));
});

test('rejects SVG, fake images, oversized files and cross-site uploads', async () => {
  const b = new Browser(stack);
  await signup(b, 'Sneaky');
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  for (const [bytes, type] of [[svg, 'image/svg+xml'], [new TextEncoder().encode('not an image'), 'image/png']]) {
    const r = await b.post(`${DEV}/account/avatar`, { multipart: upload(bytes, type) });
    assert.match(decodeURIComponent(r.headers.get('Location')), /error=Please upload a JPEG, PNG or WebP/);
  }
  const big = new Uint8Array(1_100_000); big.set(PNG);
  const r2 = await b.post(`${DEV}/account/avatar`, { multipart: upload(big) });
  assert.match(decodeURIComponent(r2.headers.get('Location')), /too large/);
  const r3 = await b.post(`${DEV}/account/avatar`, { multipart: upload(PNG), origin: 'https://evil.example' });
  assert.equal(r3.status, 403);
  assert.equal((await b.get(`${DEV}/account/avatar`)).status, 404);
});

test('deleting the account deletes the picture', async () => {
  const b = new Browser(stack);
  const email = `gone${Math.random().toString(36).slice(2, 7)}@example.com`;
  await b.post(`${DEV}/signup`, { form: { name: 'Gone', email, password: 'correct horse battery', terms: '1' } });
  await b.post(`${DEV}/account/avatar`, { multipart: upload(PNG) });
  await b.post(`${DEV}/account/delete`, { form: { confirm: email, password: 'correct horse battery' } });
  const n = await stack.DB.prepare('SELECT COUNT(*) AS n FROM avatars a LEFT JOIN users u ON u.id = a.user_id WHERE u.id IS NULL').first();
  assert.equal(n.n, 0);
});
