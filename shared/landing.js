// Building blocks for the product landing pages (EZ APP, EZ SITE, EZ DEFENDER).

import { h } from './http.js';
import { icons, gem } from './ui.js';
import { productUrl, PRODUCTS } from './config.js';
import { showcase } from './visuals.js';

export function sectionHead({ eyebrow, title, text, left = false }) {
  return h`<header class="sec-head ${left ? 'left' : ''}">
    ${eyebrow ? h`<p class="eyebrow">${eyebrow}</p>` : ''}
    <h2 class="display-md">${title}</h2>
    ${text ? h`<p class="lead">${text}</p>` : ''}
  </header>`;
}

export function ctaPanel({ title, text, primary, secondary }) {
  return h`<section class="wrap section"><div class="cta-panel">
    <h2 class="display-md">${title}</h2>
    ${text ? h`<p class="lead">${text}</p>` : ''}
    <div class="cta-row">
      <a class="btn btn-lg" href="${primary.href}">${primary.label} ${icons.arrow}</a>
      ${secondary ? h`<a class="btn btn-ghost btn-lg" href="${secondary.href}">${secondary.label}</a>` : ''}
    </div>
  </div></section>`;
}

/**
 * Full product landing page body.
 * cfg: { env, user, product, title (h`` with <em>), lead, quick: { action, name, placeholder, label, inputmode },
 *        steps: [[title, text]], features: [[icon, title, text]], featuresHead, stepsHead, cross: { product, title, text, label }, cta }
 */
export function productLanding(cfg) {
  const { env, user, product } = cfg;
  const p = PRODUCTS[product];
  const start = user ? '/dashboard' : '/auth/start?next=/dashboard';
  const q = cfg.quick;
  return h`
<section class="hero">
  <div class="hero-bg" aria-hidden="true"><div class="orb orb-1"></div><div class="orb orb-2"></div></div>
  <div class="wrap hero-inner">
    <a class="pill reveal" href="${productUrl(env, 'ezdev')}"><span class="pill-tag">${p.name}</span>An EZ DEV company ${icons.arrow}</a>
    <h1 class="display-xl reveal reveal-2">${cfg.title}</h1>
    <p class="lead reveal reveal-3">${cfg.lead}</p>
    <form class="quick reveal reveal-4" action="/dashboard" method="get">
      <label class="sr-only" for="quick-in">${q.label}</label>
      <input id="quick-in" name="${q.name}" placeholder="${q.placeholder}" maxlength="${q.name === 'url' ? 300 : 4000}" autocomplete="off" ${q.inputmode ? h`inputmode="${q.inputmode}"` : ''} required>
      <button class="btn" type="submit">${q.button} ${icons.arrow}</button>
    </form>
    <p class="hero-note reveal reveal-4">${cfg.note}</p>
  </div>
  <div class="wrap stage reveal reveal-5">${showcase(product)}</div>
</section>

<section id="how" class="wrap section">
  ${sectionHead(cfg.stepsHead)}
  <ol class="steps">
    ${cfg.steps.map(([t, d], i) => h`<li class="step"><span class="step-n">0${i + 1}</span><h3>${t}</h3><p>${d}</p></li>`)}
  </ol>
</section>

<section id="${cfg.featuresId || 'features'}" class="wrap section">
  ${sectionHead(cfg.featuresHead)}
  <ul class="features ${cfg.features.length === 4 ? 'four' : ''}">
    ${cfg.features.map(([ic, t, d]) => h`<li class="feature"><span class="feature-ic">${icons[ic]}</span><h3>${t}</h3><p>${d}</p></li>`)}
  </ul>
</section>

${cfg.cross ? h`<section class="wrap"><div class="cross accent-${PRODUCTS[cfg.cross.product].accent}">
  ${gem(cfg.cross.product, 64)}
  <div><h2>${cfg.cross.title}</h2><p>${cfg.cross.text}</p></div>
  <a class="btn btn-ghost" href="${productUrl(env, cfg.cross.product)}">${cfg.cross.label} ${icons.external}</a>
</div></section>` : ''}

${ctaPanel({ title: cfg.cta.title, text: cfg.cta.text, primary: { href: start, label: cfg.cta.label }, secondary: { href: '#how', label: 'How it works' } })}`;
}
