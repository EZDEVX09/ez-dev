// Shared page shell for every EZ product.

import { h, raw } from './http.js';
import { PRODUCTS, productUrl } from './config.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';

export const icons = {
  app: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/><path d="M9.5 8.5 8 10l1.5 1.5"/><path d="M14.5 8.5 16 10l-1.5 1.5"/></svg>'),
  site: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M2.5 9h19"/><path d="M6 13h6"/><path d="M6 16h9"/></svg>'),
  shield: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6l8-3z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>'),
  arrow: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>'),
  external: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>'),
  plus: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'),
  check: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>'),
  x: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>'),
  alert: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>'),
  info: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>'),
  download: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>'),
  send: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7-7-1z"/></svg>'),
};

export const productIcon = { ezapp: icons.app, ezsite: icons.site, ezdefender: icons.shield };

function brand(product, href) {
  const p = PRODUCTS[product];
  const [ez, ...rest] = p.name.split(' ');
  return h`<a class="brand" href="${href}" aria-label="${p.name} home">
    <span class="brand-mark">EZ</span><span class="brand-name">${ez} <b>${rest.join(' ')}</b></span></a>`;
}

/**
 * page({ env, product, title, user, body, nav, scripts, bodyClass, description })
 */
export function page({ env, product, title, user, body, nav = [], scripts = [], bodyClass = '', description }) {
  const p = PRODUCTS[product];
  const ezdev = productUrl(env, 'ezdev');
  const isDev = product === 'ezdev';
  const signIn = isDev ? '/login' : '/auth/start?next=/dashboard';
  const signUp = `${ezdev}/signup`;
  const fullTitle = title ? `${title} · ${p.name}` : `${p.name} — ${p.tagline}`;

  const account = user
    ? h`<a class="nav-link" href="/dashboard">Dashboard</a>
        <details class="menu">
          <summary class="avatar" aria-label="Account menu">${(user.name || user.email).slice(0, 1).toUpperCase()}</summary>
          <div class="menu-panel">
            <div class="menu-head"><strong>${user.name}</strong><span>${user.email}</span></div>
            <a href="${ezdev}/account">EZ DEV account</a>
            <a href="${ezdev}/pricing">Plans</a>
            <form method="post" action="/auth/logout"><button type="submit">Sign out</button></form>
          </div>
        </details>`
    : h`<a class="nav-link" href="${signIn}">Sign in</a>
        <a class="btn btn-light btn-sm" href="${signUp}">Get started</a>`;

  return h`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${description || `${p.name}: ${p.tagline}.`}">
<link rel="icon" href="/assets/favicon-${p.accent}.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/assets/ez.css">
</head>
<body class="accent-${p.accent} ${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    ${brand(product, '/')}
    <nav class="primary" aria-label="Primary">
      ${nav.map((n) => h`<a class="nav-link" href="${n.href}">${n.label}</a>`)}
    </nav>
    <div class="account">${account}</div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      ${brand('ezdev', ezdev)}
      <p>The parent company of EZ APP, EZ SITE and EZ DEFENDER.</p>
    </div>
    <div>
      <h2 class="eyebrow">Products</h2>
      <a href="${productUrl(env, 'ezapp')}">EZ APP</a>
      <a href="${productUrl(env, 'ezsite')}">EZ SITE</a>
      <a href="${productUrl(env, 'ezdefender')}">EZ DEFENDER</a>
    </div>
    <div>
      <h2 class="eyebrow">Company</h2>
      <a href="${ezdev}/#company">About</a>
      <a href="${ezdev}/pricing">Pricing</a>
      <a href="${ezdev}/contact">Contact</a>
    </div>
    <div>
      <h2 class="eyebrow">Legal</h2>
      <a href="${ezdev}/privacy">Privacy</a>
      <a href="${ezdev}/terms">Terms</a>
      <a href="${ezdev}/security">Security</a>
    </div>
  </div>
  <div class="wrap copyright">© ${new Date().getUTCFullYear()} EZ DEV. All rights reserved.</div>
</footer>
${scripts.map((s) => h`<script src="${s}" defer></script>`)}
</body>
</html>`;
}

export function errorPage(env, product, status, message) {
  return page({
    env, product, title: status === 404 ? 'Not found' : 'Error',
    body: h`<section class="wrap narrow center pad-xl">
      <p class="eyebrow">Error ${status}</p>
      <h1 class="display-md">${status === 404 ? "We couldn't find that page." : 'Something went wrong.'}</h1>
      <p class="lead">${message}</p>
      <p><a class="btn" href="/">Back home</a></p>
    </section>`,
  });
}

export function flash(msg, kind = 'error') {
  if (!msg) return '';
  return h`<div class="flash flash-${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${msg}</div>`;
}
