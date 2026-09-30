// Builder dashboard: idea chips and submit state
(() => {
  const prompt = document.getElementById('prompt');
  document.querySelectorAll('[data-idea]').forEach((b) => b.addEventListener('click', () => {
    prompt.value = b.dataset.idea;
    prompt.focus();
  }));
  const form = document.querySelector('.new-project');
  if (form) form.addEventListener('submit', () => {
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.lastChild.textContent = ' Starting…';
  });
})();
