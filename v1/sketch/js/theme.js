export const THEME_STORAGE_KEY = 'opticalsetup-theme';

export function resolveTheme(storedTheme, prefersDark = false) {
  if (storedTheme === 'dark' || storedTheme === 'light') return storedTheme;
  return prefersDark ? 'dark' : 'light';
}

export function toggledTheme(theme) {
  return theme === 'dark' ? 'light' : 'dark';
}

function readStoredTheme(storage) {
  try {
    const theme = storage?.getItem(THEME_STORAGE_KEY);
    return theme === 'dark' || theme === 'light' ? theme : null;
  } catch (_) {
    return null;
  }
}

function writeStoredTheme(storage, theme) {
  try { storage?.setItem(THEME_STORAGE_KEY, theme); } catch (_) { /* keep the in-page choice */ }
}

export function initTheme(button, {
  root = document.documentElement,
  media = window.matchMedia?.('(prefers-color-scheme: dark)'),
  storage,
} = {}) {
  if (storage === undefined) {
    try { storage = window.localStorage; } catch (_) { storage = null; }
  }
  let explicitTheme = readStoredTheme(storage);

  const syncButton = theme => {
    if (!button) return;
    const next = toggledTheme(theme);
    const label = `Switch to ${next} mode`;
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.setAttribute('aria-label', label);
    button.title = label;
  };

  const applyTheme = (theme, animate = false) => {
    if (animate) {
      root.classList.add('theme-transition');
      window.setTimeout(() => root.classList.remove('theme-transition'), 220);
    }
    root.dataset.theme = theme;
    syncButton(theme);
  };

  applyTheme(resolveTheme(explicitTheme, media?.matches));

  button?.addEventListener('click', () => {
    explicitTheme = toggledTheme(root.dataset.theme);
    writeStoredTheme(storage, explicitTheme);
    applyTheme(explicitTheme, true);
  });

  media?.addEventListener?.('change', event => {
    if (!explicitTheme) applyTheme(resolveTheme(null, event.matches), true);
  });
}
