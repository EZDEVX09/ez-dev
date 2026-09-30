// EZ SITE — AI website builder

import { h, html, serve } from '../../../shared/http.js';
import { getUser } from '../../../shared/auth.js';
import { page, errorPage } from '../../../shared/ui.js';
import { productLanding } from '../../../shared/landing.js';
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
  const body = productLanding({
    env: c.env, user, product: 'ezsite',
    title: h`Your website,<br><em>written and designed for you.</em>`,
    lead: 'Tell EZ SITE about your business. It plans the pages, writes the copy, designs every screen and puts it online with one click.',
    quick: { name: 'prompt', label: 'Describe your business', placeholder: 'A website for my bakery with a menu and opening hours…', button: 'Make it' },
    note: 'Free to start · Multi-page sites · Publish or download any time',
    stepsHead: { eyebrow: 'How it works', title: h`Launch in an afternoon, <em>not a month.</em>`, text: 'EZ SITE does the planning, writing and design. You make the calls.' },
    steps: [
      ['Tell us about you', 'What you do, who you serve and the pages you need.'],
      ['Review the draft', 'A complete multi-page site with real copy, ready to preview on any screen size.'],
      ['Edit & publish', 'Ask for changes in plain words, then publish it to a live address.'],
    ],
    featuresHead: { eyebrow: 'Features', title: h`Everything a small business site <em>needs.</em>` },
    features: [
      ['layers', 'Multi-page sites', 'Home, about, services, contact and more, with shared navigation.'],
      ['spark', 'Copy that fits', 'Written from your details, with clear placeholders where facts are missing.'],
      ['history', 'Version history', 'Every change is saved. Roll back any time.'],
      ['download', 'Take it with you', 'Download the full site as plain HTML and CSS whenever you like.'],
    ],
    cross: { product: 'ezdefender', title: 'Keep your site safe with EZ DEFENDER.', text: 'Scan any published site for security issues, included with your EZ DEV account.', label: 'Visit EZ DEFENDER' },
    cta: { title: h`Your business deserves <em>a great website.</em>`, text: 'Describe it once. EZ SITE handles the rest.', label: 'Build my website' },
  });
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
