import { useEffect, useState } from 'react';

/* Website 2 has two themes: light (the default: porcelain paper with dark
   navy panels) and dark. The choice is set on <html data-theme> before the
   first paint by the script in index.html, and remembered here. */
export const THEME_KEY = 'da2-theme';

export function getTheme() {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function setTheme(t) {
  const html = document.documentElement;
  html.setAttribute('data-theme', t);
  html.style.colorScheme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#070a12' : '#f5f7fb');
  try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('da:theme', { detail: t }));
}

export function useTheme() {
  const [t, setT] = useState('light');
  useEffect(() => {
    setT(getTheme());
    const on = (e) => setT(e.detail);
    window.addEventListener('da:theme', on);
    return () => window.removeEventListener('da:theme', on);
  }, []);
  return [t, () => setTheme(t === 'dark' ? 'light' : 'dark')];
}
