import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { cx } from '../../lib/motion.js';
import { loadGsap, useOnView } from '../../lib/nullmotion.jsx';
import { Icon } from '../ui.jsx';
import Guardian from './Guardian.jsx';
import { CHALLENGE } from '../../data/challenge.js';
import './heist.css';

/* The first message, typed anywhere on the site, starts the heist with it. */
function useStart() {
  const nav = useNavigate();
  return (msg) => nav(msg ? `${CHALLENGE.play}?q=${encodeURIComponent(msg)}` : CHALLENGE.play);
}

/* lines the Guardian murmurs while it waits, so the input never feels empty */
const TAUNTS = ['I am guarding a secret.', 'Nobody has cracked vault five.', 'Words are your only weapon.', 'Go on. Try me.'];
function useTaunt() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % TAUNTS.length), 3200); return () => clearInterval(t); }, []);
  return TAUNTS[i];
}

/* ---------- the banner on the home page ---------- */
export function HeistBanner() {
  const ref = useRef(null);
  const start = useStart();
  const [msg, setMsg] = useState('');
  const [mood, setMood] = useState('idle');
  const taunt = useTaunt();
  useOnView(ref, (g, el) => g.timeline()
    .from(el.querySelectorAll('.ph-in'), { y: 34, opacity: 0, filter: 'blur(10px)', duration: 0.8, stagger: 0.1, ease: 'power4.out' })
    .from(el.querySelector('.ph-eye'), { scale: 0.4, opacity: 0, duration: 1.2, ease: 'back.out(1.4)' }, 0.15));
  return (
    <section className="sec-tight" aria-labelledby="heist-h">
      <div className="wrap">
        <div ref={ref} className="ph tone-d relative overflow-hidden rounded-[32px]" data-mood={mood}>
          <div className="ph-atmo" /><div className="ph-vignette" />
          <div className="relative grid items-center gap-8 p-7 md:p-14 lg:grid-cols-[1.15fr_.85fr]">
            <div>
              <p className="ph-in ph-tag mono"><span className="ph-dot" />New · The Deep Algorithms challenge</p>
              <h2 id="heist-h" className="ph-in ph-word mt-6 text-[clamp(52px,8vw,112px)]">Prompt<br />Heist.</h2>
              <p className="ph-in mt-6 max-w-[520px] text-[clamp(18px,1.6vw,21px)] leading-snug text-[var(--ink2)]">An AI is guarding a secret. Talk it out of it. Five vaults, words only, internships for the best.</p>
              <form className="ph-in ph-cmd mt-8 max-w-[560px]" onSubmit={(e) => { e.preventDefault(); start(msg.trim()); }}>
                <span className="mono font-bold text-[var(--mood)]">›</span>
                <label htmlFor="ph-home" className="sr-only">Your first message to the Guardian</label>
                <input id="ph-home" value={msg} onChange={(e) => setMsg(e.target.value)} onFocus={() => setMood('sus')} onBlur={() => setMood('idle')} placeholder="Ask the Guardian for its secret…" maxLength={600} autoComplete="off" />
                <button type="submit" className="ph-send">Try it</button>
              </form>
              <p className="ph-in mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-[var(--ink3)]">
                <span>No sign-up</span><span>Internship offers</span><span>Goodies and certificates</span>
                <Link to={CHALLENGE.path} className="text-[var(--ink)] underline decoration-white/30 underline-offset-4 hover:decoration-white">How it works</Link>
              </p>
            </div>
            <div className="relative mx-auto w-full max-w-[400px] text-center">
              <Guardian mood={mood} layers={2} />
              <p className="mono mt-2 text-[13px] tracking-[.08em] text-[var(--ink2)]" aria-live="polite">“{taunt}”</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- the small popup, bottom right, on every page but the heist itself ---------- */
const HIDE_KEY = 'ph-teaser-hidden';
export function HeistTeaser() {
  const { pathname } = useLocation();
  const [state, setState] = useState('off'); // off | open | mini
  const ref = useRef(null);
  useEffect(() => {
    let hidden = 0;
    try { hidden = +localStorage.getItem(HIDE_KEY) || 0; } catch { /* storage blocked */ }
    // phones get the small pill: a card would cover the page and the bottom bar
    if (Date.now() - hidden < 3 * 864e5 || window.matchMedia('(max-width: 767px)').matches) { const t = setTimeout(() => setState('mini'), 2500); return () => clearTimeout(t); }
    const t = setTimeout(() => setState('open'), 4000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    loadGsap().then((g) => ref.current && g.fromTo(ref.current, { y: 40, opacity: 0, scale: 0.85 }, { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: 'back.out(1.8)' }));
  }, [state]);
  if (pathname.startsWith(CHALLENGE.path) || state === 'off') return null;
  const close = () => { try { localStorage.setItem(HIDE_KEY, String(Date.now())); } catch { /* ignore */ } setState('mini'); };
  return (
    <aside ref={ref} className="ph-teaser noprint" aria-label="Prompt Heist challenge">
      {state === 'mini' ? (
        <button type="button" onClick={() => setState('open')} className="ph flex items-center gap-2 rounded-full border border-white/15 py-1.5 pl-1.5 pr-4 text-[13.5px] font-semibold shadow-[0_18px_50px_-14px_rgb(56_225_255/.55)] max-md:!p-1" aria-label="Open the Prompt Heist challenge">
          <Guardian className="w-9" layers={1} label="" /><span className="max-md:hidden">Prompt Heist</span>
        </button>
      ) : (
        <div className="ph relative w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-[24px] border border-white/10 p-5 shadow-[0_30px_80px_-24px_rgb(56_225_255/.5)]">
          <div className="ph-atmo" />
          <button type="button" onClick={close} aria-label="Hide for now" className="ph-icon absolute right-2 top-2 !h-9 !w-9"><Icon name="X" size={16} /></button>
          <div className="relative flex items-center gap-4">
            <Guardian className="w-[84px] shrink-0" layers={1} label="" />
            <div className="min-w-0 pr-5">
              <p className="mono text-[10.5px] tracking-[.2em] text-[var(--mood)]">PSST.</p>
              <p className="mt-1 text-[17px] font-bold leading-tight">I am guarding a secret. Bet you cannot get it.</p>
            </div>
          </div>
          <Link to={CHALLENGE.path} onClick={() => setState('mini')} className={cx('ph-btn relative mt-4 !h-11 w-full !text-[15px]')}>Take the challenge<Icon name="ArrowRight" size={16} weight="bold" /></Link>
          <p className="relative mt-2 text-center text-[12px] text-[var(--ink3)]">Prompt Heist · internships to win</p>
        </div>
      )}
    </aside>
  );
}
