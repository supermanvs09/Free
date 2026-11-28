import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { PB } from '../../data/promptbreak.js';
import { SIcon } from './Sketch.jsx';

/* The Promptbreak note in the corner of every page except the challenge.
   - It arrives a few seconds after the page (never during the intro).
   - Closing it leaves a small tab in the corner, so the challenge is never
     out of reach; the tab can be closed too.
   - Both choices last for this browser tab only (sessionStorage): a new tab
     shows the full note again.
   Automated browsers (our tests) get it only when the address has ?promo. */
const KEY = 'pb-pop-v2'; // 'mini' | 'off'

const read = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const save = (v) => { try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ } };

export default function PromoPop() {
  const { pathname, search } = useLocation();
  const [mode, setMode] = useState(null); // 'full' | 'mini' | null
  const here = pathname.startsWith(PB.path);

  useEffect(() => {
    if (here) { setMode(null); return undefined; }
    const forced = new URLSearchParams(search).has('promo');
    if (navigator.webdriver && !forced) return undefined;
    const saved = read();
    if (saved === 'off') return undefined;
    const t = setInterval(() => {
      if (document.documentElement.classList.contains('intro-on')) return; // wait for the intro to finish
      clearInterval(t); setMode(saved === 'mini' ? 'mini' : 'full');
    }, forced ? 200 : 3500);
    return () => clearInterval(t);
  }, [here, search]);

  if (!mode || here) return null;

  if (mode === 'mini') {
    return (
      <aside className="pb-pop pb-mini" aria-label="Promptbreak challenge">
        <Link to={PB.path} className="pb-mini-go"><span className="pb-mini-dot" />Promptbreak<span className="pb-mini-sub">Crack our AI</span></Link>
        <button type="button" className="pb-mini-x" onClick={() => { save('off'); setMode(null); }} aria-label="Hide the Promptbreak tab"><SIcon k="x" s={12} /></button>
      </aside>
    );
  }
  return (
    <aside className="pb-pop" aria-label="Promptbreak challenge">
      <img src="/img/doodles/unboxing.svg" alt="" width="76" height="57" />
      <p className="pb-pop-k">New · Prompt injection challenge</p>
      <p className="pb-pop-t">Crack our AI, <span>win prizes and job offers</span></p>
      <Link to={PB.path} className="pb-pop-go">Play Promptbreak<SIcon k="arrow" s={16} /></Link>
      <button type="button" className="pb-pop-x" onClick={() => { save('mini'); setMode('mini'); }} aria-label="Close the Promptbreak note"><SIcon k="x" s={14} /></button>
    </aside>
  );
}
