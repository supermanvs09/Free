import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

const Command = lazy(() => import('./Command.jsx'));

/* Opens the site search (Ctrl/⌘ K, "/", or a `da:command` event from the
   header button) and the hidden terminal (the ` key). Nothing loads until asked. */
export default function CommandLauncher() {
  const [mode, setMode] = useState(null);
  const close = useCallback(() => setMode(null), []);
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setMode((m) => (m === 'search' ? null : 'search')); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      if (e.key === '/') { e.preventDefault(); setMode('search'); }
      else if (e.key === '`') { e.preventDefault(); setMode((m) => (m === 'terminal' ? null : 'terminal')); }
    };
    const ask = (e) => setMode(e.detail === 'terminal' ? 'terminal' : 'search');
    window.addEventListener('keydown', key);
    window.addEventListener('da:command', ask);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('da:command', ask); };
  }, []);
  if (!mode) return null;
  return <Suspense fallback={null}><Command key={mode} mode={mode} onClose={close} /></Suspense>;
}
