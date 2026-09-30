// EZ DEFENDER: busy state for scans and click-to-copy for verification values
(() => {
  document.querySelectorAll('form[data-busy], .report-head form, .card form[action="/scans"]').forEach((form) => {
    form.addEventListener('submit', () => {
      const btn = form.querySelector('button[type=submit]');
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = form.dataset.busy || 'Scanning…';
    });
  });
  document.querySelectorAll('code.copy').forEach((el) => {
    el.tabIndex = 0;
    el.title = 'Click to copy';
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(el.textContent);
        el.classList.add('is-copied');
        setTimeout(() => el.classList.remove('is-copied'), 1200);
      } catch { /* clipboard blocked */ }
    };
    el.addEventListener('click', copy);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') copy(); });
  });
})();
