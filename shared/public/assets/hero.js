// EZ DEV hero: mode tabs, typing examples in the prompt box, Enter to submit.
(() => {
  const form = document.getElementById('hx-form');
  if (!form) return;
  const q = document.getElementById('hx-q');
  const go = document.getElementById('hx-go-label');
  const hint = document.getElementById('hx-hint');

  const MODES = {
    app: {
      go: 'Build it',
      hint: 'EZ APP writes the code, shows a live preview, and keeps improving it as you ask.',
      examples: ['A habit tracker with streaks and a weekly chart', 'An invoice calculator with tax and discounts', 'A kanban board for my team', 'A flashcard quiz for Spanish verbs'],
    },
    site: {
      go: 'Make it',
      hint: 'EZ SITE plans the pages, writes the copy and designs every screen, ready to publish.',
      examples: ['A website for my bakery with a menu and opening hours', 'A portfolio for a wedding photographer', 'A 4-page site for a plumbing business', 'A landing page for my new mobile app'],
    },
    scan: {
      go: 'Scan it',
      hint: 'EZ DEFENDER grades your site’s security and explains every fix in plain English.',
      examples: ['yourwebsite.com', 'shop.yourbusiness.com', 'https://app.yourstartup.io'],
    },
  };

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mode = 'app';
  let timer = null;

  function type(examples) {
    clearTimeout(timer);
    if (reduce) { q.placeholder = examples[0]; return; }
    let i = 0, n = 0, deleting = false;
    const tick = () => {
      if (document.activeElement === q || q.value) { timer = setTimeout(tick, 600); return; }
      const text = examples[i % examples.length];
      n += deleting ? -1 : 1;
      q.placeholder = text.slice(0, n) + (n < text.length || deleting ? '▍' : '');
      let wait = deleting ? 22 : 45;
      if (!deleting && n >= text.length) { deleting = true; wait = 1700; }
      else if (deleting && n <= 0) { deleting = false; i++; wait = 350; }
      timer = setTimeout(tick, wait);
    };
    n = 0; tick();
  }

  function setMode(m) {
    mode = m;
    const cfg = MODES[m];
    go.textContent = cfg.go;
    hint.textContent = cfg.hint;
    q.rows = m === 'scan' ? 1 : 2;
    q.setAttribute('inputmode', m === 'scan' ? 'url' : 'text');
    q.setAttribute('aria-label', m === 'scan' ? 'Website address to scan' : 'Describe what you want');
    form.dataset.mode = m;
    type(cfg.examples);
  }

  form.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => { setMode(r.value); q.focus(); }));
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (q.value.trim()) form.requestSubmit(); }
  });
  form.addEventListener('submit', () => { form.classList.add('is-busy'); });
  setMode(form.querySelector('input[name=mode]:checked').value);
})();
