// EZ APP / EZ SITE editor
(() => {
  const data = JSON.parse(document.getElementById('ez-data').textContent);
  const $ = (id) => document.getElementById(id);
  const els = {
    messages: $('messages'), form: $('chat-form'), input: $('chat-input'), send: $('send-btn'), status: $('status'),
    preview: $('preview'), empty: $('empty-state'), frame: $('device-frame'), select: $('version-select'),
    restore: $('restore-btn'), open: $('open-btn'), download: $('download-btn'), publish: $('publish-btn'),
    previewPane: $('preview-pane'), codePane: $('code-pane'), fileList: $('file-list'), codeView: $('code-view'),
    dialog: $('publish-dialog'), slug: $('slug'), slugPrefix: $('slug-prefix'), publishErr: $('publish-error'),
    publishGo: $('publish-go'), unpublish: $('unpublish-btn'), publishCancel: $('publish-cancel'), publishedLink: $('published-link'),
    rename: $('rename-form'), name: $('pname'),
  };

  let selected = data.currentVersion;
  let busy = false;
  let view = 'preview';

  const api = async (path, body) => {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { location.href = `/auth/start?next=${encodeURIComponent(location.pathname)}`; throw new Error('Signed out'); }
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Something went wrong.');
    return out;
  };

  // ---------- Messages ----------
  function addMessage(role, text) {
    const li = document.createElement('li');
    li.className = `msg msg-${role}`;
    li.textContent = text;
    els.messages.appendChild(li);
    els.messages.scrollTop = els.messages.scrollHeight;
    return li;
  }
  if (data.messages.length === 0 && !data.currentVersion) {
    addMessage('assistant', `Hi! Describe the ${data.noun} you want and I’ll build it. You can keep asking for changes afterwards.`);
  }
  for (const m of data.messages) addMessage(m.role, m.content);

  // ---------- Versions & preview ----------
  function renderVersions() {
    els.select.innerHTML = '';
    if (!data.versions.length) {
      const o = document.createElement('option');
      o.textContent = 'No versions yet';
      els.select.appendChild(o);
      els.select.disabled = true;
      return;
    }
    els.select.disabled = false;
    for (const v of data.versions) {
      const o = document.createElement('option');
      o.value = v.n;
      o.textContent = `v${v.n}${v.n === data.currentVersion ? ' (current)' : ''} — ${v.summary.slice(0, 50)}`;
      if (v.n === selected) o.selected = true;
      els.select.appendChild(o);
    }
  }

  function previewUrl(v) { return `/preview/${data.id}/${data.previewKey}/${v}/`; }

  function refresh() {
    const has = selected > 0;
    els.empty.hidden = has && !busy;
    els.preview.hidden = !has;
    if (has) {
      const url = previewUrl(selected);
      if (els.preview.dataset.src !== url) { els.preview.src = url; els.preview.dataset.src = url; }
      els.open.href = url;
      els.download.href = `/projects/${data.id}/download?v=${selected}`;
    } else {
      els.open.removeAttribute('href');
      els.download.removeAttribute('href');
    }
    els.open.classList.toggle('is-disabled', !has);
    els.download.classList.toggle('is-disabled', !has);
    els.publish.disabled = !data.currentVersion;
    els.publish.textContent = data.published ? 'Published' : 'Publish';
    els.restore.hidden = !has || selected === data.currentVersion;
    renderVersions();
    if (view === 'code') loadCode();
  }

  els.select.addEventListener('change', () => { selected = Number(els.select.value); refresh(); });

  els.restore.addEventListener('click', async () => {
    try {
      const out = await api(`/api/projects/${data.id}/restore`, { version: selected });
      data.versions.unshift({ n: out.version, summary: out.summary, created_at: Date.now() / 1000 });
      data.currentVersion = selected = out.version;
      addMessage('assistant', out.summary);
      refresh();
    } catch (e) { setStatus(e.message, true); }
  });

  // ---------- View & device toggles ----------
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view;
    document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('is-on', x === b));
    els.previewPane.hidden = view !== 'preview';
    els.codePane.hidden = view !== 'code';
    if (view === 'code') loadCode();
  }));
  document.querySelectorAll('[data-device]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-device]').forEach((x) => x.classList.toggle('is-on', x === b));
    els.frame.classList.toggle('is-mobile', b.dataset.device === 'mobile');
  }));

  let codeFor = null;
  async function loadCode() {
    if (!selected) { els.fileList.innerHTML = ''; els.codeView.firstChild.textContent = 'Nothing built yet.'; return; }
    if (codeFor === selected) return;
    codeFor = selected;
    try {
      const { files } = await api(`/api/projects/${data.id}/files?v=${selected}`);
      els.fileList.innerHTML = '';
      files.forEach((f, i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = f.path;
        b.addEventListener('click', () => {
          els.fileList.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
          els.codeView.firstChild.textContent = f.content;
        });
        li.appendChild(b);
        els.fileList.appendChild(li);
        if (i === 0) b.click();
      });
    } catch (e) { codeFor = null; setStatus(e.message, true); }
  }

  // ---------- Generate ----------
  function setStatus(text, isError = false) {
    els.status.textContent = text;
    els.status.classList.toggle('is-error', isError);
  }
  function setBusy(b) {
    busy = b;
    els.send.disabled = b;
    els.input.disabled = b;
    els.frame.classList.toggle('is-busy', b);
    if (b) els.empty.hidden = false;
    else els.empty.hidden = selected > 0;
  }

  async function build(prompt) {
    if (busy || !prompt.trim()) return;
    addMessage('user', prompt);
    els.input.value = '';
    setBusy(true);
    setStatus(data.currentVersion ? 'Updating…' : `Planning your ${data.noun}…`);
    const thinking = addMessage('assistant', 'Working on it…');
    thinking.classList.add('is-pending');
    try {
      const res = await fetch(`/api/projects/${data.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (res.status === 401) { location.href = `/auth/start?next=${encodeURIComponent(location.pathname)}`; return; }
      if (!res.ok) {
        const out = await res.json().catch(() => ({}));
        throw new Error(out.error || 'Something went wrong.');
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'progress') setStatus(`Writing code… ${(ev.chars / 1024).toFixed(0)} KB`);
          else if (ev.type === 'done') {
            finished = true;
            thinking.remove();
            addMessage('assistant', ev.summary);
            data.versions.unshift({ n: ev.version, summary: ev.summary, created_at: Date.now() / 1000 });
            data.currentVersion = selected = ev.version;
            codeFor = null;
            setStatus(`Version ${ev.version} is ready.`);
          } else if (ev.type === 'error') {
            finished = true;
            throw new Error(ev.message);
          }
        }
      }
      if (!finished) throw new Error('The connection dropped before the build finished. Please try again.');
    } catch (e) {
      thinking.remove();
      addMessage('assistant', `⚠ ${e.message}`);
      setStatus(e.message, true);
    } finally {
      setBusy(false);
      refresh();
      els.input.focus();
    }
  }

  els.form.addEventListener('submit', (e) => { e.preventDefault(); build(els.input.value); });
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); build(els.input.value); }
  });

  // ---------- Rename ----------
  const saveName = async () => {
    const name = els.name.value.trim();
    if (!name || name === data.name) return;
    try { await api(`/api/projects/${data.id}/rename`, { name }); data.name = name; document.title = `${name} · ${document.title.split(' · ').pop()}`; }
    catch (e) { setStatus(e.message, true); els.name.value = data.name; }
  };
  els.rename.addEventListener('submit', (e) => { e.preventDefault(); saveName(); els.name.blur(); });
  els.name.addEventListener('blur', saveName);

  // ---------- Publish ----------
  els.slugPrefix.textContent = `${location.host}/p/`;
  function showPublished(url) {
    els.publishedLink.hidden = false;
    els.publishedLink.innerHTML = '';
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = url;
    const scan = document.createElement('a');
    scan.href = `${data.scanUrl}/dashboard?url=${encodeURIComponent(url)}`;
    scan.target = '_blank'; scan.rel = 'noopener'; scan.className = 'scan-link';
    scan.textContent = 'Check it with EZ DEFENDER →';
    els.publishedLink.append('Live at ', a, document.createElement('br'), scan);
    els.unpublish.hidden = false;
  }
  els.publish.addEventListener('click', () => {
    els.slug.value = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    els.publishErr.textContent = '';
    if (data.published) showPublished(`${location.origin}/p/${data.slug}/`);
    else { els.publishedLink.hidden = true; els.unpublish.hidden = true; }
    els.dialog.showModal();
  });
  els.publishCancel.addEventListener('click', () => els.dialog.close());
  els.publishGo.addEventListener('click', async (e) => {
    e.preventDefault();
    els.publishErr.textContent = '';
    try {
      const out = await api(`/api/projects/${data.id}/publish`, { slug: els.slug.value });
      data.published = true; data.slug = out.slug; els.slug.value = out.slug;
      showPublished(out.url);
      refresh();
    } catch (err) { els.publishErr.textContent = err.message; }
  });
  els.unpublish.addEventListener('click', async () => {
    try {
      await api(`/api/projects/${data.id}/unpublish`, {});
      data.published = false;
      els.dialog.close();
      refresh();
    } catch (err) { els.publishErr.textContent = err.message; }
  });

  // ---------- Start ----------
  refresh();
  const m = /^#build=(.*)$/.exec(location.hash);
  if (m) {
    history.replaceState(null, '', location.pathname);
    let prompt = '';
    try { prompt = decodeURIComponent(m[1]); } catch { /* ignore */ }
    if (prompt && !data.currentVersion) build(prompt);
  }
})();
