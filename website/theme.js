// Runs before CSS so the first paint uses the saved or system theme.
(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  const readPreference = () => {
    try {
      const value = localStorage.getItem('no-short-theme');
      return value === 'dark' || value === 'light' ? value : null;
    } catch { return null; }
  };
  const apply = () => {
    const theme = preference ?? (media.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#171918' : '#f7f7f2';
    window.dispatchEvent(new Event('themechange'));
  };
  preference = readPreference();
  apply();
  media.addEventListener('change', () => { if (!preference) apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== 'no-short-theme' && event.key !== null) return;
    preference = readPreference();
    apply();
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('no-short-theme', preference); } catch { /* Storage is optional. */ }
    apply();
  });
})();
