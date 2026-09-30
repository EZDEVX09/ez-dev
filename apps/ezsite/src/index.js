// EZ SITE — AI website builder

import { h, html, serve } from '../../../shared/http.js';
import { getUser } from '../../../shared/auth.js';
import { page, errorPage, icons } from '../../../shared/ui.js';
import { mountBuilder } from '../../../shared/builder.js';
import { subsidiaryRouter } from '../../../shared/subsidiary.js';

const NAV = [
  { href: '/#how', label: 'How it works' },
  { href: '/#features', label: 'Features' },
];

const SYSTEM = `You are EZ SITE, an expert web designer and copywriter who builds complete, polished multi-page websites from a description of a business, person or project.

Output rules:
- Deliver the whole site with the write_files tool. Always include every file in full.
- Static HTML and CSS, with a little vanilla JavaScript only where it helps (mobile menu, simple interactions). No build step.
- Required: index.html as the home page. Add the pages the site needs (for example about.html, services.html, contact.html) and one shared styles.css. Use relative links between pages (href="about.html").
- Every page shares the same header navigation and footer, and marks the current page in the nav.
- Contact forms: build the form UI, but do not post it anywhere; use action="#" and a small script that shows a friendly confirmation. Add an HTML comment saying to connect a form service.
- No external requests except Google Fonts. No images from the internet: use CSS shapes, gradients-free color blocks, or inline SVG illustrations and icons.
- Never include secrets, trackers or analytics.

Content rules:
- Write real, specific, persuasive copy from what the user told you.
- Never invent facts: prices, addresses, phone numbers, awards, testimonials, client names or statistics. Use clear placeholders like [Your phone number] or [Customer quote] instead.
- Include a <title> and meta description on every page.

Quality bar:
- A distinctive visual identity that fits the business, with a coherent palette and type pairing.
- Responsive from 360px phones to wide desktops, with a working mobile menu.
- Accessible: semantic landmarks, one h1 per page, alt text, labelled form fields, visible focus, 4.5:1 contrast.

When changing an existing site, keep everything the user did not ask to change.`;

const router = subsidiaryRouter('ezsite');

router.get('/', async (c) => {
  const user = await getUser(c.req, c.env);
  const start = user ? '/dashboard' : '/auth/start?next=/dashboard';
  const body = h`
<section class="hero wrap">
  <p class="pill"><span class="dot"></span>EZ SITE · an EZ DEV company</p>
  <h1 class="display-xl">Your website,<br><span class="accent-text">written and designed for you.</span></h1>
  <p class="lead">Tell EZ SITE about your business. It plans the pages, writes the copy, designs every screen and puts it online with one click.</p>
  <div class="cta-row">
    <a class="btn btn-lg" href="${start}">Build my website ${icons.arrow}</a>
    <a class="btn btn-ghost btn-lg" href="#how">How it works</a>
  </div>
</section>

<section id="how" class="wrap pad-lg">
  <p class="eyebrow">How it works</p>
  <h2 class="display-md">Launch in an afternoon, not a month.</h2>
  <ol class="steps">
    <li class="card"><span class="step-n">1</span><h3 class="h3">Tell us about you</h3><p>What you do, who you serve and the pages you need.</p></li>
    <li class="card"><span class="step-n">2</span><h3 class="h3">Review the draft</h3><p>A complete multi-page site with real copy, ready to preview on any screen size.</p></li>
    <li class="card"><span class="step-n">3</span><h3 class="h3">Edit &amp; publish</h3><p>Ask for changes in plain words, then publish it to a live address.</p></li>
  </ol>
</section>

<section id="features" class="wrap pad-lg">
  <p class="eyebrow">Features</p>
  <h2 class="display-md">Everything a small business site needs.</h2>
  <ul class="example-grid">
    <li class="card"><h3 class="h3">Multi-page sites</h3><p>Home, about, services, contact and more, with shared navigation.</p></li>
    <li class="card"><h3 class="h3">Copy that fits</h3><p>Written from your details, with clear placeholders where facts are missing.</p></li>
    <li class="card"><h3 class="h3">Version history</h3><p>Every change is saved. Roll back any time.</p></li>
    <li class="card"><h3 class="h3">Take it with you</h3><p>Download the full site as plain HTML and CSS whenever you like.</p></li>
  </ul>
</section>

<section class="wrap pad-lg">
  <div class="cta-band card">
    <div>
      <h2 class="display-sm">Keep your site safe with EZ DEFENDER.</h2>
      <p class="muted">Scan any published site for security issues, included with your EZ DEV account.</p>
    </div>
    <a class="btn btn-lg" href="${start}">Get started</a>
  </div>
</section>`;
  return html(page({ env: c.env, product: 'ezsite', user, body, nav: NAV, description: 'EZ SITE writes, designs and publishes your website from a short description.' }));
});

mountBuilder(router, {
  product: 'ezsite',
  kind: 'site',
  noun: 'website',
  nounPlural: 'websites',
  system: SYSTEM,
  nav: NAV,
  placeholder: 'A website for my bakery in Austin: home, menu, about us and contact pages. Warm and friendly, we specialise in sourdough.',
  ideas: ['Portfolio for a photographer', 'Plumbing business, 4 pages', 'Landing page for a mobile app', 'Restaurant with menu page'],
});

export default {
  fetch: serve(router, { renderError: (status, message, req, env) => errorPage(env, 'ezsite', status, message) }),
};
