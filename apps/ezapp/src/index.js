// EZ APP — AI app builder

import { h, html, serve } from '../../../shared/http.js';
import { getUser } from '../../../shared/auth.js';
import { page, errorPage } from '../../../shared/ui.js';
import { productLanding } from '../../../shared/landing.js';
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
  const body = productLanding({
    env: c.env, user, product: 'ezapp',
    title: h`Describe it.<br><em>Get a working app.</em>`,
    lead: 'Tell EZ APP what you need in plain words. It writes the code, shows a live preview, and keeps improving it every time you ask.',
    quick: { name: 'prompt', label: 'Describe the app you want', placeholder: 'A habit tracker with streaks and a weekly chart…', button: 'Build it' },
    note: 'Free to start · Live preview in seconds · Download the code any time',
    stepsHead: { eyebrow: 'How it works', title: h`From idea to app in <em>three steps.</em>`, text: 'No setup, no templates, no code required. Just say what you want.' },
    steps: [
      ['Describe', 'Write what the app should do, who it’s for and how it should feel.'],
      ['Preview', 'Watch it appear in a live preview on desktop and phone sizes. Peek at the code whenever you like.'],
      ['Refine & ship', 'Ask for changes in chat, roll back to any version, then publish a link or download the code.'],
    ],
    featuresId: 'examples',
    featuresHead: { eyebrow: 'What people build', title: h`Small tools that do <em>one job well.</em>` },
    features: [
      ['history', 'Trackers', 'Habits, workouts, budgets, reading lists and inventory.'],
      ['code', 'Calculators', 'Quotes, pricing, loans and savings, unit conversions.'],
      ['layers', 'Planners', 'Schedules, meal plans, kanban boards and checklists.'],
      ['spark', 'Games & quizzes', 'Flashcards, trivia, word games and classroom activities.'],
    ],
    cross: { product: 'ezdefender', title: 'Built something? Check it with EZ DEFENDER.', text: 'Every EZ DEV account includes a security scanner for whatever you publish.', label: 'Visit EZ DEFENDER' },
    cta: { title: h`Your next app is <em>one sentence away.</em>`, text: 'Start free with your EZ DEV account. No card needed.', label: 'Start building' },
  });
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
