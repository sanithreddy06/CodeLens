// Apply the saved theme before the page is painted. Storage can be unavailable.
(() => {
  let theme = 'system';
  try {
    const saved = JSON.parse(localStorage.getItem('codelens.preferences.v1'));
    if (['light', 'dark', 'system'].includes(saved?.theme)) theme = saved.theme;
  } catch { /* Use the device preference. */ }
  const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
})();
