// Decorative product previews shown under each landing-page hero.
// Pure HTML/CSS (no images), hidden from screen readers — the copy around them says the same thing.

import { h } from './http.js';

const bar = (label) => h`<div class="window-bar"><i></i><i></i><i></i><span>${label}</span></div>`;

const appPreview = h`<div class="viz-app">
  <h4>Today</h4>
  <div class="viz-row on">Morning run<em>12-day streak</em></div>
  <div class="viz-row on">Read 20 pages<em>31-day streak</em></div>
  <div class="viz-row">Meditate<em>3-day streak</em></div>
</div>`;

const sitePreview = h`<div class="viz-site">
  <div class="viz-site-nav">Crumb &amp; Crust<span>Home · Menu · Visit</span></div>
  <div class="viz-site-hero"><div><h4>Bread worth waking up for.</h4><p>Slow-fermented sourdough, baked at dawn.</p></div><div class="viz-loaf"></div></div>
</div>`;

const defenderPreview = h`
  <div class="viz-grade"><b>A+</b><div><div class="viz-label">Deep scan</div><strong>portfolio.example</strong><div class="muted small">17 passed · 0 failed</div></div></div>
  <div class="viz-check"><i>✓</i>Served over HTTPS<small>Passed</small></div>
  <div class="viz-check"><i>✓</i>Content Security Policy set<small>Passed</small></div>
  <div class="viz-check"><i>✓</i>No sensitive files exposed<small>Passed</small></div>`;

export function showcase(kind) {
  if (kind === 'ezdev') {
    return h`<div class="showcase reveal reveal-4" aria-hidden="true"><div class="window">
      ${bar('ezdevportal.com — one account, three products')}
      <div class="viz-trio">
        <div><span class="viz-label">EZ APP</span><div class="viz-bubble me">A habit tracker with streaks</div><div class="viz-status">Version 2 ready</div>${appPreview}</div>
        <div><span class="viz-label">EZ SITE</span><div class="viz-status">Published · /p/crumb-and-crust</div>${sitePreview}</div>
        <div><span class="viz-label">EZ DEFENDER</span>${defenderPreview}</div>
      </div>
    </div></div>`;
  }
  if (kind === 'ezapp') {
    return h`<div class="showcase reveal reveal-4" aria-hidden="true"><div class="window">
      ${bar('app.ezdevportal.com / Streaks')}
      <div class="viz">
        <div class="viz-side">
          <div class="viz-bubble me">A habit tracker with daily check-offs, streaks and a 4-week heatmap</div>
          <div class="viz-bubble ai">Built “Streaks” with a progress ring, streak counts and a heatmap. Your habits stay on this device.</div>
          <div class="viz-bubble me">Make the streak counts stand out more</div>
          <div class="viz-status">Version 2 ready</div>
          <div class="viz-input">Ask for a change…<b></b></div>
        </div>
        <div class="viz-main">${appPreview}</div>
      </div>
    </div></div>`;
  }
  if (kind === 'ezsite') {
    return h`<div class="showcase reveal reveal-4" aria-hidden="true"><div class="window">
      ${bar('site.ezdevportal.com / Crumb & Crust')}
      <div class="viz">
        <div class="viz-side">
          <div class="viz-bubble me">A website for my bakery: home, menu, our story and visit pages. Warm and hand-made.</div>
          <div class="viz-bubble ai">Built a 4-page site with a shared header, real copy and placeholders for your address and hours.</div>
          <div class="viz-status">Published · /p/crumb-and-crust</div>
          <div class="viz-input">Ask for a change…<b></b></div>
        </div>
        <div class="viz-main">${sitePreview}</div>
      </div>
    </div></div>`;
  }
  return h`<div class="showcase reveal reveal-4" aria-hidden="true"><div class="window">
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
