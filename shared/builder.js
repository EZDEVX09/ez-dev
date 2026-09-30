// The AI builder engine shared by EZ APP (apps) and EZ SITE (websites).

import { h, raw, html, json, HttpError, Redirect, assertSameOrigin, readForm, randomId, now, timeAgo } from './http.js';
import { requireUser } from './auth.js';
import { planFor, getUsage, addUsage, monthPeriod, productUrl } from './config.js';
import { page, icons, flash } from './ui.js';
import { generateFiles } from './claude.js';
import { makeZip } from './zip.js';

const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 1_500_000; // stays well under D1's row limit
const MAX_PROMPT = 4000;

export const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', xml: 'application/xml; charset=utf-8',
  webmanifest: 'application/manifest+json', ico: 'image/x-icon',
};

// Generated code runs in an opaque, sandboxed origin: it can never read EZ cookies or call EZ APIs as the user.
const USER_CONTENT_CSP = [
  'sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads',
  "default-src 'self' data: blob: https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "connect-src https:",
  "frame-ancestors 'self'",
].join('; ');

export function sanitizeFiles(files) {
  if (!Array.isArray(files) || files.length === 0) throw new HttpError(502, 'The AI returned no files. Please try again.');
  if (files.length > MAX_FILES) throw new HttpError(422, `Projects are limited to ${MAX_FILES} files.`);
  const seen = new Set();
  let total = 0;
  const out = [];
  for (const f of files) {
    const path = String(f?.path || '').replace(/^\.?\//, '').trim();
    if (!/^[A-Za-z0-9_][A-Za-z0-9_\-./]*$/.test(path) || path.includes('..') || path.includes('//') || path.length > 120) {
      throw new HttpError(502, `The AI produced an invalid file name (${path.slice(0, 40)}). Please try again.`);
    }
    if (seen.has(path)) continue;
    seen.add(path);
    const content = String(f.content ?? '');
    total += content.length;
    out.push({ path, content });
  }
  if (total > MAX_TOTAL_BYTES) throw new HttpError(422, 'That project is too large. Try simplifying it.');
  if (!seen.has('index.html')) throw new HttpError(502, 'The AI forgot the index.html page. Please try again.');
  out.sort((a, b) => (a.path === 'index.html' ? -1 : b.path === 'index.html' ? 1 : a.path.localeCompare(b.path)));
  return out;
}

function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function jsonScript(id, data) {
  const s = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return raw(`<script type="application/json" id="${id}">${s}</script>`);
}

async function loadProject(env, id, user) {
  const p = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  if (!p || p.user_id !== user.id) throw new HttpError(404, 'Project not found.');
  return p;
}

async function loadFiles(env, projectId, n) {
  const v = await env.DB.prepare('SELECT files FROM versions WHERE project_id = ? AND n = ?').bind(projectId, n).first();
  return v ? JSON.parse(v.files) : [];
}

function serveFile(files, rest, { kind }) {
  let path = rest || 'index.html';
  if (path.endsWith('/')) path += 'index.html';
  let f = files.find((x) => x.path === path);
  if (!f && kind === 'site' && !path.includes('.')) f = files.find((x) => x.path === `${path}.html` || x.path === `${path}/index.html`);
  if (!f) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'Content-Security-Policy': USER_CONTENT_CSP, 'X-Content-Type-Options': 'nosniff' } });
  }
  const ext = f.path.split('.').pop().toLowerCase();
  return new Response(f.content, {
    headers: {
      'Content-Type': MIME[ext] || 'text/plain; charset=utf-8',
      'Content-Security-Policy': USER_CONTENT_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Adds all builder routes to a router.
 * cfg: { product: 'ezapp'|'ezsite', kind: 'app'|'site', noun, nounPlural, system, ideas: [..], nav }
 */
export function mountBuilder(router, cfg) {
  const { product, kind } = cfg;

  // ---------- Dashboard ----------
  router.get('/dashboard', async (c) => {
    const user = await requireUser(c);
    const plan = planFor(user);
    const { results: projects } = await c.env.DB.prepare(
      'SELECT id, name, slug, published, current_version, updated_at FROM projects WHERE user_id = ? AND product = ? ORDER BY updated_at DESC'
    ).bind(user.id, kind).all();
    const used = await getUsage(c.env, user.id, 'ai_generation', monthPeriod());
    const err = c.url.searchParams.get('error');

    const body = h`
<section class="wrap pad-lg">
  <div class="page-head">
    <div>
      <p class="eyebrow">Dashboard</p>
      <h1 class="display-md">Your ${cfg.nounPlural}</h1>
    </div>
    <div class="usage-pill" title="AI builds are shared between EZ APP and EZ SITE">
      <span>${used} / ${plan.aiGenerationsPerMonth} AI builds this month</span>
      <meter min="0" max="${plan.aiGenerationsPerMonth}" value="${Math.min(used, plan.aiGenerationsPerMonth)}"></meter>
    </div>
  </div>
  ${flash(err)}
  <form class="card new-project" method="post" action="/projects">
    <h2 class="h3">Start a new ${cfg.noun}</h2>
    <label for="prompt">Describe what you want. Be as specific as you like.</label>
    <textarea id="prompt" name="prompt" rows="4" maxlength="${MAX_PROMPT}" required placeholder="${cfg.placeholder}"></textarea>
    <div class="idea-row" aria-label="Ideas">
      ${cfg.ideas.map((i) => h`<button type="button" class="chip" data-idea="${i}">${i}</button>`)}
    </div>
    <div class="row-between">
      <label class="inline-field"><span>Name</span><input name="name" maxlength="60" placeholder="Untitled ${cfg.noun}"></label>
      <button class="btn" type="submit">${icons.plus} Build it</button>
    </div>
  </form>

  <h2 class="h3 section-gap">All ${cfg.nounPlural} <span class="muted">(${projects.length} of ${plan.projectsPerProduct})</span></h2>
  ${projects.length === 0
    ? h`<p class="muted">Nothing here yet. Describe your first ${cfg.noun} above.</p>`
    : h`<ul class="project-grid">
      ${projects.map((p) => h`<li class="card project-card">
        <a class="stretched" href="/projects/${p.id}">${p.name}</a>
        <p class="muted small">${p.current_version ? `Version ${p.current_version}` : 'Not built yet'} · ${timeAgo(p.updated_at)}</p>
        ${p.published ? h`<span class="badge">Live at /p/${p.slug}</span>` : ''}
      </li>`)}
    </ul>`}
</section>`;
    return html(page({ env: c.env, product, title: 'Dashboard', user, body, nav: cfg.nav, scripts: ['/assets/dashboard.js'] }));
  });

  // ---------- Create ----------
  router.post('/projects', async (c) => {
    assertSameOrigin(c.req);
    const user = await requireUser(c);
    const form = await readForm(c.req);
    const prompt = String(form.prompt || '').trim().slice(0, MAX_PROMPT);
    if (!prompt) throw new Redirect('/dashboard?error=' + encodeURIComponent(`Describe the ${cfg.noun} you want first.`));
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND product = ?').bind(user.id, kind).first();
    if (count.n >= planFor(user).projectsPerProduct) {
      throw new Redirect('/dashboard?error=' + encodeURIComponent(`Your plan allows ${planFor(user).projectsPerProduct} ${cfg.nounPlural}. Delete one or upgrade your plan.`));
    }
    const name = String(form.name || '').trim().slice(0, 60) || prompt.split(/[.\n]/)[0].slice(0, 48) || `Untitled ${cfg.noun}`;
    const id = randomId(9);
    const t = now();
    await c.env.DB.prepare('INSERT INTO projects (id, user_id, product, name, preview_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, user.id, kind, name, randomId(16), t, t).run();
    // The editor picks the prompt up from the URL fragment (never sent to the server) and starts the first build.
    throw new Redirect(`/projects/${id}#build=${encodeURIComponent(prompt)}`);
  });

  // ---------- Editor ----------
  router.get('/projects/:id', async (c) => {
    const user = await requireUser(c);
    const p = await loadProject(c.env, c.params.id, user);
    const { results: versions } = await c.env.DB.prepare(
      'SELECT n, summary, prompt, created_at FROM versions WHERE project_id = ? ORDER BY n DESC'
    ).bind(p.id).all();
    const { results: messages } = await c.env.DB.prepare(
      'SELECT role, content, created_at FROM messages WHERE project_id = ? ORDER BY id DESC LIMIT 60'
    ).bind(p.id).all();
    messages.reverse();
    const data = {
      id: p.id, name: p.name, kind, previewKey: p.preview_key, noun: cfg.noun, currentVersion: p.current_version,
      published: !!p.published, slug: p.slug, versions, messages,
      scanUrl: productUrl(c.env, 'ezdefender'),
    };

    const body = h`
<div class="editor" data-kind="${kind}">
  <aside class="editor-chat" aria-label="Chat with the builder">
    <div class="editor-title">
      <a class="back" href="/dashboard" aria-label="Back to dashboard">←</a>
      <form id="rename-form" class="rename"><label class="sr-only" for="pname">Project name</label><input id="pname" name="name" value="${p.name}" maxlength="60"></form>
    </div>
    <ol id="messages" class="messages" aria-live="polite"></ol>
    <form id="chat-form" class="chat-form">
      <label class="sr-only" for="chat-input">Describe a change</label>
      <textarea id="chat-input" rows="3" maxlength="${MAX_PROMPT}" placeholder="${p.current_version ? 'Ask for a change, e.g. “add a dark mode toggle”' : `Describe the ${cfg.noun} to build`}" required></textarea>
      <button class="btn" id="send-btn" type="submit">${icons.send}<span>Send</span></button>
    </form>
    <p id="status" class="status" role="status"></p>
  </aside>
  <section class="editor-main" aria-label="Preview">
    <div class="toolbar">
      <div class="seg" role="group" aria-label="View">
        <button type="button" class="seg-btn is-on" data-view="preview">Preview</button>
        <button type="button" class="seg-btn" data-view="code">Code</button>
      </div>
      <div class="seg" role="group" aria-label="Device">
        <button type="button" class="seg-btn is-on" data-device="desktop">Desktop</button>
        <button type="button" class="seg-btn" data-device="mobile">Mobile</button>
      </div>
      <label class="version-pick"><span class="sr-only">Version</span><select id="version-select"></select></label>
      <div class="toolbar-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="restore-btn" hidden>Restore this version</button>
        <a class="btn btn-ghost btn-sm" id="open-btn" target="_blank" rel="noopener">${icons.external}<span>Open</span></a>
        <a class="btn btn-ghost btn-sm" id="download-btn">${icons.download}<span>Download</span></a>
        <button type="button" class="btn btn-sm" id="publish-btn">Publish</button>
      </div>
    </div>
    <div id="preview-pane" class="preview-pane">
      <div class="device-frame" id="device-frame">
        <iframe id="preview" title="Live preview" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"></iframe>
        <div id="empty-state" class="empty-state">
          <div class="spinner" aria-hidden="true"></div>
          <p>Your ${cfg.noun} will appear here.</p>
        </div>
      </div>
    </div>
    <div id="code-pane" class="code-pane" hidden>
      <ul id="file-list" class="file-list"></ul>
      <pre id="code-view" class="code-view" tabindex="0"><code></code></pre>
    </div>
  </section>
  <dialog id="publish-dialog" class="dialog">
    <form method="dialog" id="publish-form">
      <h2 class="h3">Publish your ${cfg.noun}</h2>
      <p class="muted">Anyone with the link can view it. You can unpublish any time.</p>
      <label for="slug">Address</label>
      <div class="slug-field"><span id="slug-prefix"></span><input id="slug" name="slug" pattern="[a-z0-9-]{3,40}" required></div>
      <p id="publish-error" class="field-error" role="alert"></p>
      <div class="row-end">
        <button type="button" class="btn btn-ghost" id="unpublish-btn" hidden>Unpublish</button>
        <button type="button" class="btn btn-ghost" id="publish-cancel">Cancel</button>
        <button type="submit" class="btn" id="publish-go">Publish</button>
      </div>
      <p id="published-link" class="published-link" hidden></p>
    </form>
  </dialog>
</div>
${jsonScript('ez-data', data)}`;
    return html(page({ env: c.env, product, title: p.name, user, body, nav: cfg.nav, scripts: ['/assets/builder.js'], bodyClass: 'is-editor' }));
  });

  // ---------- Generate (streams NDJSON) ----------
  router.post('/api/projects/:id/generate', async (c) => {
    assertSameOrigin(c.req);
    const user = await requireUser(c);
    const p = await loadProject(c.env, c.params.id, user);
    const body = await readForm(c.req);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) throw new HttpError(400, 'Describe what you want first.');
    if (prompt.length > MAX_PROMPT) throw new HttpError(400, `Keep requests under ${MAX_PROMPT} characters.`);

    const plan = planFor(user);
    const period = monthPeriod();
    if (await getUsage(c.env, user.id, 'ai_generation', period) >= plan.aiGenerationsPerMonth) {
      throw new HttpError(402, `You've used all ${plan.aiGenerationsPerMonth} AI builds on your plan this month.`);
    }

    const current = p.current_version ? await loadFiles(c.env, p.id, p.current_version) : [];
    const { results: history } = await c.env.DB.prepare(
      'SELECT role, content FROM messages WHERE project_id = ? ORDER BY id DESC LIMIT 12'
    ).bind(p.id).all();
    history.reverse();

    let userContent = '';
    if (current.length) {
      userContent += `Here is the current ${cfg.noun} (version ${p.current_version}):\n\n`;
      for (const f of current) userContent += `<file path="${f.path}">\n${f.content}\n</file>\n\n`;
      if (history.length) {
        userContent += 'Recent conversation for context:\n';
        for (const m of history) userContent += `${m.role === 'user' ? 'User' : 'You'}: ${m.content}\n`;
        userContent += '\n';
      }
      userContent += `The user now asks for this change:\n${prompt}\n\nApply it and return the complete updated project with write_files.`;
    } else {
      userContent = `Build this ${cfg.noun} from scratch:\n${prompt}\n\nReturn the complete project with write_files.`;
    }

    const t = now();
    await c.env.DB.prepare('INSERT INTO messages (project_id, role, content, created_at) VALUES (?, ?, ?, ?)').bind(p.id, 'user', prompt, t).run();

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const send = (o) => writer.write(enc.encode(JSON.stringify(o) + '\n')).catch(() => {});

    const work = (async () => {
      let lastSent = 0;
      try {
        await send({ type: 'start' });
        const result = await generateFiles(c.env, {
          system: cfg.system,
          messages: [{ role: 'user', content: userContent }],
          onProgress: (chars) => { if (chars - lastSent > 400) { lastSent = chars; send({ type: 'progress', chars }); } },
        });
        const files = sanitizeFiles(result.files);
        const n = p.current_version + 1;
        const t2 = now();
        await c.env.DB.batch([
          c.env.DB.prepare('INSERT INTO versions (project_id, n, files, prompt, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(p.id, n, JSON.stringify(files), prompt, result.summary, t2),
          c.env.DB.prepare('UPDATE projects SET current_version = ?, updated_at = ? WHERE id = ?').bind(n, t2, p.id),
          c.env.DB.prepare('INSERT INTO messages (project_id, role, content, created_at) VALUES (?, ?, ?, ?)').bind(p.id, 'assistant', result.summary, t2),
        ]);
        await addUsage(c.env, user.id, 'ai_generation', period);
        await send({ type: 'done', version: n, summary: result.summary, files: files.map((f) => f.path) });
      } catch (err) {
        if (!(err instanceof HttpError)) console.error(err && err.stack || err);
        const message = err instanceof HttpError ? err.message : 'Something went wrong while building. Please try again.';
        await c.env.DB.prepare('INSERT INTO messages (project_id, role, content, created_at) VALUES (?, ?, ?, ?)')
          .bind(p.id, 'assistant', `⚠ ${message}`, now()).run().catch(() => {});
        await send({ type: 'error', message });
      } finally {
        await writer.close().catch(() => {});
      }
    })();
    c.ctx.waitUntil(work);

    return new Response(readable, {
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  });

  // ---------- Project data ----------
  router.get('/api/projects/:id/files', async (c) => {
    const user = await requireUser(c);
    const p = await loadProject(c.env, c.params.id, user);
    const n = Number(c.url.searchParams.get('v') || p.current_version);
    return json({ version: n, files: await loadFiles(c.env, p.id, n) });
  });

  router.post('/api/projects/:id/rename', async (c) => {
    assertSameOrigin(c.req);
    const user = await requireUser(c);
    const p = await loadProject(c.env, c.params.id, user);
    const name = String((await readForm(c.req)).name || '').trim().slice(0, 60);
    if (!name) throw new HttpError(400, 'Name cannot be empty.');
    await c.env.DB.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?').bind(name, now(), p.id).run();
    return json({ ok: true, name });
  });

  router.post('/api/projects/:id/restore', async (c) => {
    assertSameOrigin(c.req);
    const user = await requireUser(c);
    const p = await loadProject(c.env, c.params.id, user);
    const from = Number((await readForm(c.req)).version);
    const src = await c.env.DB.prepare('SELECT files FROM versions WHERE project_id = ? AND n = ?').bind(p.id, from).first();
    if (!src) throw new HttpError(404, 'Version not found.');
    const n = p.current_version + 1;
    const t = now();
    const summary = `Restored version ${from}.`;
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO versions (project_id, n, files, prompt, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(p.id, n, src.files, `Restore version ${from}`, summary, t),
      c.env.DB.prepare('UPDATE projects SET current_version = ?, updated_at = ? WHERE id = ?').bind(n, t, p.id),
      c.env.DB.prepare('INSERT INTO messages (project_id, role, content, created_at) VALUES (?, ?, ?, ?)').bind(p.id, 'assistant', summary, t),
    ]);
    return json({ ok: true, version: n, summary });
  });

  router.post('/api/projects/:id/publish', async (c) => {
    assertSameOrigin(c.req);
    const user = await requireUser(c);
    const p = await loadProject(c.env, c.params.id, user);
    if (!p.current_version) throw new HttpError(400, `Build your ${cfg.noun} before publishing it.`);
    const slug = slugify((await readForm(c.req)).slug || p.name);
    if (slug.length < 3) throw new HttpError(400, 'Use at least 3 letters or numbers for the address.');
    const taken = await c.env.DB.prepare('SELECT id FROM projects WHERE slug = ? AND id != ?').bind(slug, p.id).first();
    if (taken) throw new HttpError(409, 'That address is taken. Try another.');
    await c.env.DB.prepare('UPDATE projects SET slug = ?, published = 1, updated_at = ? WHERE id = ?').bind(slug, now(), p.id).run();
    return json({ ok: true, slug, url: `${c.url.origin}/p/${slug}/` });
  });

  router.post('/api/projects/:id/unpublish', async (c) => {
    assertSameOrigin(c.req);
    const user = await requireUser(c);
    const p = await loadProject(c.env, c.params.id, user);
    await c.env.DB.prepare('UPDATE projects SET published = 0, updated_at = ? WHERE id = ?').bind(now(), p.id).run();
    return json({ ok: true });
  });

  router.post('/projects/:id/delete', async (c) => {
    assertSameOrigin(c.req);
    const user = await requireUser(c);
    const p = await loadProject(c.env, c.params.id, user);
    await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(p.id).run();
    throw new Redirect('/dashboard');
  });

  router.get('/projects/:id/download', async (c) => {
    const user = await requireUser(c);
    const p = await loadProject(c.env, c.params.id, user);
    const n = Number(c.url.searchParams.get('v') || p.current_version);
    const files = await loadFiles(c.env, p.id, n);
    if (!files.length) throw new HttpError(404, 'Nothing to download yet.');
    const name = `${slugify(p.name) || cfg.noun}-v${n}.zip`;
    return new Response(makeZip(files), {
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
    });
  });

  // ---------- Sandboxed preview ----------
  // Sandboxed frames load sub-resources without cookies, so previews are guarded by an
  // unguessable per-project key in the URL instead of the session.
  router.get('/preview/:id/:key/:n/*', async (c) => {
    const p = await c.env.DB.prepare('SELECT id, preview_key FROM projects WHERE id = ?').bind(c.params.id).first();
    if (!p || !safeEqual(p.preview_key, c.params.key)) throw new HttpError(404, 'Preview not found.');
    return serveFile(await loadFiles(c.env, p.id, Number(c.params.n)), c.params.rest, { kind });
  });
  router.get('/preview/:id/:key/:n', (c) => { throw new Redirect(`/preview/${c.params.id}/${c.params.key}/${c.params.n}/`, 301); });

  // ---------- Published (public) ----------
  router.get('/p/:slug/*', async (c) => {
    const p = await c.env.DB.prepare('SELECT id, current_version FROM projects WHERE slug = ? AND published = 1 AND product = ?')
      .bind(c.params.slug, kind).first();
    if (!p) throw new HttpError(404, `No published ${cfg.noun} lives at this address.`);
    return serveFile(await loadFiles(c.env, p.id, p.current_version), c.params.rest, { kind });
  });
  router.get('/p/:slug', (c) => { throw new Redirect(`/p/${c.params.slug}/`, 301); });
}
