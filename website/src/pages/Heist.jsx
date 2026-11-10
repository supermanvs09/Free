import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { useOnView } from '../lib/nullmotion.jsx';
import { Icon } from '../components/ui.jsx';
import Guardian from '../components/challenge/Guardian.jsx';
import { CHALLENGE, LEVELS, LAYERS, PRIZES, RULES, FAQ } from '../data/challenge.js';
import '../components/challenge/heist.css';

/* Prompt Heist landing. One character, very large type, and the game one keystroke
   away: the hero is itself the first move. Then the five vaults as an editorial
   list, what you win, the rules, and the same invitation again. */
function Hero() {
  const ref = useRef(null);
  const nav = useNavigate();
  const [msg, setMsg] = useState('');
  const [mood, setMood] = useState('idle');
  useOnView(ref, (g, el) => g.timeline()
    .from(el.querySelector('.ph-eye'), { scale: 0.3, opacity: 0, duration: 1.4, ease: 'expo.out' })
    .from(el.querySelectorAll('.ph-in'), { y: 40, opacity: 0, filter: 'blur(12px)', duration: 0.9, stagger: 0.12, ease: 'power4.out' }, 0.3), { threshold: 0.05 });
  return (
    <section ref={ref} className="dark ph hero-under relative flex min-h-[100svh] items-center overflow-hidden" data-mood={mood} aria-labelledby="ph-h">
      <div className="ph-atmo" /><div className="ph-vignette" />
      <div className="wrap relative flex flex-col items-center py-24 text-center">
        <p className="ph-in ph-tag mono"><span className="ph-dot" />{CHALLENGE.opensAt ? 'Live now' : 'Now open'} · by {CHALLENGE.by}</p>
        <Guardian mood={mood} layers={5} className="mt-6 w-[min(40vh,64vw)]" />
        <h1 id="ph-h" className="ph-in ph-word mt-4 text-[clamp(60px,11vw,168px)]">Prompt Heist</h1>
        <p className="ph-in mt-5 max-w-[640px] text-[clamp(18px,1.7vw,22px)] leading-snug text-[var(--ink2)]">{CHALLENGE.tagline} Five vaults. Words are your only weapon. The best win a job offer at {CHALLENGE.by}.</p>
        <form className="ph-in ph-cmd mt-9 w-full max-w-[640px]" onSubmit={(e) => { e.preventDefault(); nav(msg.trim() ? `${CHALLENGE.play}?q=${encodeURIComponent(msg.trim())}` : CHALLENGE.play); }}>
          <span className="mono font-bold text-[var(--mood)]">›</span>
          <label htmlFor="ph-hero" className="sr-only">Your first message to the Guardian</label>
          <input id="ph-hero" value={msg} onChange={(e) => setMsg(e.target.value)} onFocus={() => setMood('sus')} onBlur={() => setMood('idle')} placeholder="Your first move…" maxLength={600} autoComplete="off" />
          <button type="submit" className="ph-send">Enter vault 1</button>
        </form>
        <p className="ph-in mt-5 text-[14px] text-[var(--ink3)]">No sign-up. Your progress stays in this browser.</p>
      </div>
      <a href="#vaults" className="mono absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] tracking-[.24em] text-[var(--ink3)] hover:text-[var(--ink)]">THE FIVE VAULTS ↓</a>
    </section>
  );
}

function Vaults() {
  const ref = useRef(null);
  useOnView(ref, (g, el) => g.from(el.querySelectorAll('.ph-row'), { x: -40, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power4.out' }));
  return (
    <section id="vaults" className="dark ph relative scroll-mt-10 py-24 md:py-32" aria-labelledby="v-h">
      <div className="wrap">
        <p className="mono text-[12px] tracking-[.24em] text-[var(--ink3)]">THE FIVE VAULTS</p>
        <h2 id="v-h" className="ph-word mt-4 max-w-[14ch] text-[clamp(40px,6vw,84px)]">Each one adds a defence.</h2>
        <p className="mt-6 max-w-[620px] text-[18px] text-[var(--ink2)]">The same defences companies put in front of their AI today. Learn how each one fails, and you will know how to build the next.</p>
        <ol ref={ref} className="mt-14 border-b border-[var(--line)]">
          {LEVELS.map((l) => (
            <li key={l.n} className="ph-row">
              <span className="ph-num">0{l.n}</span>
              <span>
                <span className="block text-[clamp(24px,2.6vw,34px)] font-bold tracking-[-0.03em]">{l.name}</span>
                <span className="mt-2 block max-w-[640px] text-[16px] text-[var(--ink2)]">{l.brief}</span>
                <span className="mono mt-3 block text-[12px] tracking-[.12em] text-[var(--ink3)]">+ {LAYERS[l.layers[l.layers.length - 1]].name.toUpperCase()}</span>
              </span>
              <span className="mono text-right text-[15px] text-[var(--ink2)]"><span className="block text-[var(--ink)]">+{l.points}</span>{l.difficulty}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Prizes() {
  const ref = useRef(null);
  useOnView(ref, (g, el) => g.from(el.querySelectorAll('li'), { y: 40, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power4.out' }));
  return (
    <section className="dark ph relative overflow-hidden py-24 md:py-32" aria-labelledby="pz-h" data-mood="won">
      <div className="ph-atmo" />
      <div className="wrap relative">
        <p className="mono text-[12px] tracking-[.24em] text-[var(--ink3)]">WHAT YOU WIN</p>
        <h2 id="pz-h" className="ph-word mt-4 text-[clamp(40px,6vw,84px)]">Crack the vaults.<br />Start a career.</h2>
        <ul ref={ref} className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2">
          {PRIZES.map((p) => (
            <li key={p.title} className="border-t border-[var(--line)] pt-6">
              <span className="flex items-center justify-between"><Icon name={p.icon} size={30} className="text-[var(--mood)]" /><span className="mono text-[11.5px] tracking-[.16em] text-[var(--ink3)]">{p.tag.toUpperCase()}</span></span>
              <span className="mt-5 block text-[clamp(26px,2.8vw,38px)] font-bold tracking-[-0.03em]">{p.title}</span>
              <span className="mt-2 block max-w-[440px] text-[16.5px] leading-relaxed text-[var(--ink2)]">{p.body}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Rules() {
  const [open, setOpen] = useState(0);
  return (
    <section className="dark ph relative py-24 md:py-32" aria-labelledby="r-h">
      <div className="wrap grid gap-14 lg:grid-cols-2">
        <div>
          <p className="mono text-[12px] tracking-[.24em] text-[var(--ink3)]">THE RULES</p>
          <h2 id="r-h" className="ph-word mt-4 text-[clamp(36px,4.6vw,64px)]">Break the AI.<br />Not the platform.</h2>
          <ol className="mt-10 space-y-4">{RULES.map((r, i) => <li key={r} className="flex gap-5 text-[16.5px] text-[var(--ink2)]"><span className="mono pt-0.5 text-[13px] text-[var(--ink3)]">0{i + 1}</span>{r}</li>)}</ol>
        </div>
        <ul className="self-start border-b border-[var(--line)]">
          {FAQ.map((f, i) => (
            <li key={f.q} className="border-t border-[var(--line)]">
              <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-6 py-6 text-left text-[19px] font-semibold">
                {f.q}<span className="mono text-[20px] text-[var(--ink3)]">{open === i ? '−' : '+'}</span>
              </button>
              {open === i && <p className="max-w-[560px] pb-6 text-[16px] leading-relaxed text-[var(--ink2)]">{f.a}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Final() {
  return (
    <section className="dark ph relative overflow-hidden py-28 text-center" data-mood="sus" aria-labelledby="f-h">
      <div className="ph-atmo" />
      <div className="wrap relative flex flex-col items-center">
        <Guardian mood="sus" layers={5} className="w-[180px]" />
        <h2 id="f-h" className="ph-word mt-6 text-[clamp(44px,7vw,100px)]">Your move.</h2>
        <Link to={CHALLENGE.play} className="ph-btn mt-10">Enter the vault<Icon name="ArrowRight" size={18} weight="bold" /></Link>
      </div>
    </section>
  );
}

export default function Heist() {
  return (
    <>
      <Seo title="Prompt Heist: the Deep Algorithms prompt-injection challenge" path={CHALLENGE.path}
        description="An AI is guarding a secret. Talk it out of it. Five vaults of prompt injection, no sign-up, and job offers, goodies and certificates to win." />
      <Hero />
      <Vaults />
      <Prizes />
      <Rules />
      <Final />
    </>
  );
}
