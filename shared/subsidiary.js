// Routes every subsidiary (EZ APP, EZ SITE, EZ DEFENDER) shares: sign-in handoff and sign-out.

import { Router, assertSameOrigin, redirect } from './http.js';
import { startSignIn, completeHandoff, getUser, destroyAllSessions, clearSessionCookie, safePath } from './auth.js';
import { productUrl } from './config.js';
import { mountAvatarRead } from './avatar.js';

export function subsidiaryRouter(product) {
  const router = new Router();

  router.get('/auth/start', (c) => {
    throw startSignIn(c.env, c.url.origin, safePath(c.url.searchParams.get('next') || '/dashboard'));
  });

  router.get('/auth/callback', (c) => completeHandoff(c, product));

  router.post('/auth/logout', async (c) => {
    assertSameOrigin(c.req);
    const user = await getUser(c.req, c.env);
    if (user) await destroyAllSessions(c.env, user.id);
    return redirect(`${productUrl(c.env, 'ezdev')}/?signed_out=1`, 303, { 'Set-Cookie': clearSessionCookie(c.env) });
  });

  mountAvatarRead(router);
  router.get('/healthz', () => new Response('ok'));
  return router;
}
