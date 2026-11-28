import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { PB } from '../../data/promptbreak.js';
import { SIcon } from './Sketch.jsx';

const KEY = 'pb-pop-closed-v1';

/* A small sticky note in the corner of every page except the challenge
   itself: it arrives after a few seconds, never during the intro, and stays
   closed once closed. Automated browsers (our tests) do not get it unless
   the address asks for it with ?promo, so it never covers what they click. */
export default function PromoPop() {
  const { pathname, search } = useLocation();
  const [show, setShow] = useState(false);
  const here = pathname.startsWith(PB.path);

  useEffect(() => {
    if (here) { setShow(false); return undefined; }
    let closed = false;
    try { closed = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }
    const forced = new URLSearchParams(search).has('promo');
    if (closed) return undefined; // a closed note stays closed
    if (navigator.webdriver && !forced) return undefined;
    const t = setInterval(() => {
      if (document.documentElement.classList.contains('intro-on')) return; // wait for the intro to finish
      clearInterval(t); setShow(true);
    }, forced ? 200 : 3500);
    return () => clearInterval(t);
  }, [here, search]);

  if (!show || here) return null;
  const close = () => { setShow(false); try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } };
  return (
    <aside className="pb-pop" aria-label="Promptbreak challenge">
      <img src="/img/doodles/unboxing.svg" alt="" width="76" height="57" />
      <p className="pb-pop-k">New · Prompt injection challenge</p>
      <p className="pb-pop-t">Crack our AI, <span>win prizes and job offers</span></p>
      <Link to={PB.path} className="pb-pop-go" onClick={close}>Play Promptbreak<SIcon k="arrow" s={16} /></Link>
      <button type="button" className="pb-pop-x" onClick={close} aria-label="Close the Promptbreak note"><SIcon k="x" s={14} /></button>
    </aside>
  );
}
