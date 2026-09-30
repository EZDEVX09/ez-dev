// Light / dark theme. Loaded in <head> (not deferred) so the right theme paints first.
// The choice is kept in a cookie on the parent domain, so it follows you across
// ezdevportal.com, app., site. and defender.
(() => {
  const root = document.documentElement;
  const read = () => (document.cookie.match(/(?:^|; )ez-theme=(light|dark)/) || [])[1];
  const saved = read();
  if (saved) root.dataset.theme = saved;

  function parentDomain() {
    const h = location.hostname;
    if (/^[\d.]+$/.test(h) || !h.includes('.') || h.endsWith('.workers.dev')) return '';
    return '; domain=.' + h.split('.').slice(-2).join('.');
  }
  function current() {
    if (root.dataset.theme) return root.dataset.theme;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      document.cookie = `ez-theme=${next}; path=/; max-age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}${parentDomain()}`;
    });
  });
})();
