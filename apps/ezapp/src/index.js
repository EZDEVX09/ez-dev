// EZ APP — AI app builder

import { h, html, serve } from '../../../shared/http.js';
import { getUser } from '../../../shared/auth.js';
import { page, errorPage, icons } from '../../../shared/ui.js';
import { mountBuilder } from '../../../shared/builder.js';
import { subsidiaryRouter } from '../../../shared/subsidiary.js';

const NAV = [
  { href: '/#how', label: 'How it works' },
  { href: '/#examples', label: 'Examples' },
];

const SYSTEM = `You are EZ APP, an expert product engineer who builds complete, working web applications from a plain-English description.

Output rules:
- Deliver the whole app with the write_files tool. Always include every file in full.
- Use only HTML, CSS and vanilla JavaScript. No build step, no frameworks that need compiling, no npm.
- Required entry point: index.html. Typical files: index.html, styles.css, app.js. Link them with relative paths.
- The app runs inside a sandboxed iframe with an opaque origin. localStorage and sessionStorage may throw: wrap every storage access in try/catch and fall back to in-memory state so the app still works.
- Do not call external APIs or send user data anywhere. External requests are limited to Google Fonts if you want a web font.
- Never include secrets, API keys, trackers, analytics or cryptocurrency miners.

Quality bar:
- It must actually work: real state, real interactions, input validation, sensible empty states.
- Responsive from 360px phones to wide desktops. Accessible: semantic HTML, labels for inputs, visible focus, 4.5:1 text contrast, keyboard operable.
- A distinctive, polished visual design with a coherent color palette and type scale. Avoid generic gradients and emoji as icons; use inline SVG icons.
- Never invent facts about real businesses or people. Use obvious placeholders like [Your company] where details are unknown.

When changing an existing app, keep everything the user did not ask to change.`;

const router = subsidiaryRouter('ezapp');

router.get('/', async (c) => {
  const user = await getUser(c.req, c.env);
  const start = user ? '/dashboard' : '/auth/start?next=/dashboard';
  const body = h`
<section class="hero wrap">
  <p class="pill"><span class="dot"></span>EZ APP · an EZ DEV company</p>
  <h1 class="display-xl">Describe it.<br><span class="accent-text">Get a working app.</span></h1>
  <p class="lead">Tell EZ APP what you need in plain words. It writes the app, shows you a live preview, and keeps improving it every time you ask for a change.</p>
  <div class="cta-row">
    <a class="btn btn-lg" href="${start}">Start building ${icons.arrow}</a>
    <a class="btn btn-ghost btn-lg" href="#how">How it works</a>
  </div>
</section>

<section id="how" class="wrap pad-lg">
  <p class="eyebrow">How it works</p>
  <h2 class="display-md">From idea to app in three steps.</h2>
  <ol class="steps">
    <li class="card"><span class="step-n">1</span><h3 class="h3">Describe</h3><p>Write what the app should do, who it's for and how it should feel.</p></li>
    <li class="card"><span class="step-n">2</span><h3 class="h3">Preview</h3><p>Watch it appear in a live preview on desktop and mobile sizes, and read the code if you want to.</p></li>
    <li class="card"><span class="step-n">3</span><h3 class="h3">Refine &amp; ship</h3><p>Ask for changes in chat, roll back to any version, then publish a link or download the code.</p></li>
  </ol>
</section>

<section id="examples" class="wrap pad-lg">
  <p class="eyebrow">What people build</p>
  <h2 class="display-md">Small tools that do one job well.</h2>
  <ul class="example-grid">
    <li class="card"><h3 class="h3">Trackers</h3><p>Habits, workouts, budgets, reading lists, inventory.</p></li>
    <li class="card"><h3 class="h3">Calculators</h3><p>Quotes, pricing, loan and savings, unit conversions.</p></li>
    <li class="card"><h3 class="h3">Planners</h3><p>Schedules, meal plans, kanban boards, checklists.</p></li>
    <li class="card"><h3 class="h3">Games &amp; quizzes</h3><p>Flashcards, trivia, word games, classroom activities.</p></li>
  </ul>
</section>

<section class="wrap pad-lg">
  <div class="cta-band card">
    <div>
      <h2 class="display-sm">Built something? Check it with EZ DEFENDER.</h2>
      <p class="muted">Every EZ DEV account includes EZ DEFENDER's security scanner.</p>
    </div>
    <a class="btn btn-lg" href="${start}">Start building</a>
  </div>
</section>`;
  return html(page({ env: c.env, product: 'ezapp', user, body, nav: NAV, description: 'EZ APP turns a plain-English description into a working web app.' }));
});

mountBuilder(router, {
  product: 'ezapp',
  kind: 'app',
  noun: 'app',
  nounPlural: 'apps',
  system: SYSTEM,
  nav: NAV,
  placeholder: 'A habit tracker where I can add habits, tick them off each day and see a 30-day streak chart.',
  ideas: ['Habit tracker with streaks', 'Invoice calculator with tax', 'Kanban board for my team', 'Flashcard quiz for Spanish verbs'],
});

export default {
  fetch: serve(router, { renderError: (status, message, req, env) => errorPage(env, 'ezapp', status, message) }),
};
