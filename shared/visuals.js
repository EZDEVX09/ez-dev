// Decorative product previews shown on the landing pages.
// Pure HTML/CSS (no images), hidden from screen readers — the copy around them says the same thing.

import { h, raw } from './http.js';
import { markSvg } from './logo.js';

const bar = (label) => h`<div class="window-bar"><i></i><i></i><i></i><span>${label}</span></div>`;
const gem = (k) => raw(markSvg({ size: 18, product: k }).replace(/<title>.*?<\/title>/, '').replace('role="img"', 'aria-hidden="true"'));

// 4-week heatmap, deterministic so every render matches.
const HEAT = [0, 1, 2, 3, 2, 0, 1, 3, 3, 2, 1, 0, 2, 3, 3, 3, 2, 1, 3, 2, 3, 3, 3, 2, 3, 3, 3, 3];
const heat = raw(`<div class="viz-heat">${HEAT.map((l) => `<i class="${l ? `l${l}` : ''}"></i>`).join('')}</div>`);

const appPreview = h`<div class="viz-app">
  <h4>Streaks <span class="viz-ring"></span></h4>
  <div class="viz-row on">Morning run<span>12 days</span></div>
  <div class="viz-row on">Read 20 pages<span>31 days</span></div>
  <div class="viz-row">Meditate<span>3 days</span></div>
  ${heat}
</div>`;

const sitePreview = h`<div class="viz-site">
  <div class="viz-site-nav">Crumb &amp; Crust<span>Home · Menu · Story · Visit</span></div>
  <div class="viz-site-hero"><div><h4>Bread worth waking up for.</h4><p>Slow-fermented sourdough, baked at dawn.</p><b>See the menu</b></div><div class="viz-loaf"></div></div>
</div>`;

const defenderPreview = h`
  <div class="viz-grade"><b>A+</b><div><div class="viz-label">Deep scan</div><strong>portfolio.example</strong><div class="muted small">17 passed · 0 failed</div></div></div>
  <div class="viz-check"><i>✓</i>Served over HTTPS<small>Passed</small></div>
  <div class="viz-check"><i>✓</i>Content Security Policy<small>Passed</small></div>
  <div class="viz-check"><i>✓</i>No exposed secrets<small>Passed</small></div>`;

export function showcase(kind) {
  if (kind === 'ezdev') {
    return h`<div class="showcase" aria-hidden="true"><div class="window">
      ${bar('ezdevportal.com — one account, three products')}
      <div class="viz-trio">
        <div class="accent-blue"><span class="viz-label">${gem('ezapp')}EZ APP</span><div class="viz-bubble me">A habit tracker with streaks</div><div class="viz-status">Version 2 ready</div>${appPreview}</div>
        <div class="accent-violet"><span class="viz-label">${gem('ezsite')}EZ SITE</span><div class="viz-status">Live · /p/crumb-and-crust</div>${sitePreview}</div>
        <div class="accent-green"><span class="viz-label">${gem('ezdefender')}EZ DEFENDER</span>${defenderPreview}</div>
      </div>
    </div></div>`;
  }
  if (kind === 'ezapp') {
    return h`<div class="showcase" aria-hidden="true"><div class="window">
      ${bar('app.ezdevportal.com / Streaks')}
      <div class="viz">
        <div class="viz-side">
          <div class="viz-bubble me">A habit tracker with daily check-offs, streaks and a 4-week heatmap</div>
          <div class="viz-bubble ai">Built “Streaks” with a progress ring, streak counts and a heatmap. Your habits stay on this device.</div>
          <div class="viz-bubble me">Make the streak counts pop</div>
          <div class="viz-status">Version 2 ready</div>
          <div class="viz-input">Ask for a change…<b></b></div>
        </div>
        <div class="viz-main">${appPreview}</div>
      </div>
    </div></div>`;
  }
  if (kind === 'ezsite') {
    return h`<div class="showcase" aria-hidden="true"><div class="window">
      ${bar('site.ezdevportal.com / Crumb & Crust')}
      <div class="viz">
        <div class="viz-side">
          <div class="viz-bubble me">A website for my bakery: home, menu, our story and visit pages. Warm and hand-made.</div>
          <div class="viz-bubble ai">Built a 4-page site with a shared header, real copy and placeholders for your address and hours.</div>
          <div class="viz-status">Live · /p/crumb-and-crust</div>
          <div class="viz-input">Ask for a change…<b></b></div>
        </div>
        <div class="viz-main">${sitePreview}</div>
      </div>
    </div></div>`;
  }
  return h`<div class="showcase" aria-hidden="true"><div class="window">
    ${bar('defender.ezdevportal.com / report')}
    <div class="viz">
      <div class="viz-side">${defenderPreview}</div>
      <div class="viz-main">
        <div class="viz-label">Fix guide</div>
        <div class="viz-check bad"><i>!</i>HSTS max-age is short<small>Warning</small></div>
        <div class="viz-bubble ai">Add <code>Strict-Transport-Security: max-age=31536000; includeSubDomains</code> so browsers always use HTTPS for your site.</div>
        <div class="viz-status">Monitoring daily · alerts on</div>
      </div>
    </div>
  </div></div>`;
}
