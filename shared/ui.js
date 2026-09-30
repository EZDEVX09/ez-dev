// Shared page shell for every EZ product.

import { h, raw } from './http.js';
import { PRODUCTS, productUrl } from './config.js';
import { lockupSvg, markSvg, PRODUCT_WORD } from './logo.js';
import { avatarUrl } from './avatar.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';

export const icons = {
  app: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/><path d="M9.8 8.5 8.3 10l1.5 1.5"/><path d="M14.2 8.5 15.7 10l-1.5 1.5"/></svg>'),
  site: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="3"/><path d="M2.5 9h19"/><path d="M6.5 13h6"/><path d="M6.5 16.2h9"/></svg>'),
  shield: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6l8-3z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>'),
  arrow: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>'),
  external: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>'),
  plus: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'),
  check: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>'),
  x: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>'),
  alert: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>'),
  info: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>'),
  download: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>'),
  send: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7-7-1z"/></svg>'),
  spark: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>'),
  bolt: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2.5 4.5 13.5H12L11 21.5l8.5-11H12l1-8z"/></svg>'),
  code: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/><path d="m13.5 4-3 16"/></svg>'),
  globe: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>'),
  history: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4"/><path d="M12 7.5V12l3 2"/></svg>'),
  user: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.4-6 8-6s6.8 2 8 6"/></svg>'),
  lock: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>'),
  eye: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>'),
  menu: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>'),
  layers: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/></svg>'),
  mail: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>'),
};

export const productIcon = { ezapp: icons.app, ezsite: icons.site, ezdefender: icons.shield };

function lockup(product, height = 30) {
  return raw(lockupSvg(PRODUCT_WORD[product], { height, color: 'currentColor', product, accentWord: product !== 'ezdev' })
    .replace('role="img"', 'aria-hidden="true" focusable="false"').replace(/<title>.*?<\/title>/, ''));
}

function brand(product, href) {
  const p = PRODUCTS[product];
  return h`<a class="brand" href="${href}" aria-label="${p.name} home">${lockup(product)}</a>`;
}

/** The gem mark as inline SVG (decorative). */
export function gem(product = 'ezdev', size = 32) {
  return raw(markSvg({ size, product }).replace('<svg ', `<svg class="gem gem-${size}" `).replace('role="img"', 'aria-hidden="true" focusable="false"').replace(/<title>.*?<\/title>/, ''));
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
  const others = ['ezdev', 'ezapp', 'ezsite', 'ezdefender'];

  const account = user
    ? h`<a class="nav-link hide-sm" href="/dashboard">Dashboard</a>
        <details class="menu">
          <summary class="avatar" aria-label="Account menu">${avatarUrl(user) ? h`<img src="${avatarUrl(user)}" alt="">` : (user.name || user.email).slice(0, 1).toUpperCase()}</summary>
          <div class="menu-panel">
            <div class="menu-head"><strong>${user.name}</strong><span>${user.email}</span></div>
            <a href="/dashboard">Dashboard</a>
            <a href="${ezdev}/account">EZ DEV account</a>
            <a href="${ezdev}/pricing">Plans</a>
            <form method="post" action="/auth/logout"><button type="submit">Sign out</button></form>
          </div>
        </details>`
    : h`<a class="nav-link hide-sm" href="${signIn}">Sign in</a>
        <a class="btn btn-sm" href="${signUp}">Get started</a>`;

  return h`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${description || `${p.name}: ${p.tagline}.`}">
<link rel="icon" href="/assets/favicon-${product}.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon-${product}.png">
<meta name="theme-color" content="#05060B" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F5F7FC" media="(prefers-color-scheme: light)">
<script src="/assets/theme.js"></script>
<meta property="og:site_name" content="${p.name}">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${description || `${p.name}: ${p.tagline}.`}">
<meta property="og:image" content="${productUrl(env, product)}/assets/og-${product}.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/assets/ez.css">
</head>
<body class="accent-${p.accent} p-${product} ${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<div class="space" aria-hidden="true"></div>
<header class="site-header">
  <div class="wrap header-row">
    ${brand(product, '/')}
    <nav class="primary" aria-label="Primary">
      ${nav.map((n) => h`<a class="nav-link" href="${n.href}">${n.label}</a>`)}
    </nav>
    <div class="account">
      <button type="button" class="icon-btn theme-toggle" id="theme-toggle" aria-label="Switch between light and dark theme" title="Light / dark">
        <svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        <svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      </button>
      ${account}
      <details class="mnav">
        <summary class="icon-btn" aria-label="Menu">${icons.menu}</summary>
        <div class="mnav-panel">
          ${nav.map((n) => h`<a href="${n.href}">${n.label}</a>`)}
          ${user ? '' : h`<a href="${signIn}">Sign in</a>`}
          <div class="mnav-products">
            ${others.filter((k) => k !== product).map((k) => h`<a class="mnav-product accent-${PRODUCTS[k].accent}" href="${productUrl(env, k)}">${gem(k, 22)}<span>${PRODUCTS[k].name}</span></a>`)}
          </div>
        </div>
      </details>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <a class="brand" href="${ezdev}" aria-label="EZ DEV home">${lockup('ezdev', 30)}</a>
      <p>One account for AI-built apps, AI-built websites and the security that keeps them safe.</p>
      <div class="footer-gems">
        ${['ezapp', 'ezsite', 'ezdefender'].map((k) => h`<a href="${productUrl(env, k)}" aria-label="${PRODUCTS[k].name}">${gem(k, 30)}</a>`)}
      </div>
    </div>
    <div>
      <h2 class="footer-h">Products</h2>
      <a href="${productUrl(env, 'ezapp')}">EZ APP</a>
      <a href="${productUrl(env, 'ezsite')}">EZ SITE</a>
      <a href="${productUrl(env, 'ezdefender')}">EZ DEFENDER</a>
    </div>
    <div>
      <h2 class="footer-h">Company</h2>
      <a href="${ezdev}/#ecosystem">About</a>
      <a href="${ezdev}/pricing">Pricing</a>
      <a href="${ezdev}/contact">Contact</a>
    </div>
    <div>
      <h2 class="footer-h">Legal</h2>
      <a href="${ezdev}/privacy">Privacy</a>
      <a href="${ezdev}/terms">Terms</a>
      <a href="${ezdev}/security">Security</a>
    </div>
  </div>
  <div class="wrap footer-word" aria-hidden="true">EZ DEV</div>
  <div class="wrap copyright"><span>© ${new Date().getUTCFullYear()} EZ DEV. All rights reserved.</span><span class="status-ok"><i></i>All systems normal</span></div>
</footer>
${scripts.map((s) => h`<script src="${s}" defer></script>`)}
</body>
</html>`;
}

export function errorPage(env, product, status, message) {
  return page({
    env, product, title: status === 404 ? 'Not found' : 'Error',
    body: h`<section class="wrap narrow center pad-xl err">
      <p class="err-code" aria-hidden="true">${status}</p>
      <h1 class="display-md">${status === 404 ? 'Lost in space.' : 'Something went wrong.'}</h1>
      <p class="lead mx-auto">${message}</p>
      <p><a class="btn btn-lg" href="/">Back home ${icons.arrow}</a></p>
    </section>`,
  });
}

export function flash(msg, kind = 'error') {
  if (!msg) return '';
  return h`<div class="flash flash-${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${msg}</div>`;
}
