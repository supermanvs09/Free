import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Icon, Reveal, cx } from './ui.jsx';
import { AgentAccess } from './viz/refs.jsx';
import { RiskMap } from './viz/light.jsx';

/* The two ways attackers now get in, told one at a time (machine identities are
   told once, in the home page's "Why now" section, not twice). On a desktop the
   scene stays pinned beside the text and changes as the reader scrolls (only the
   one showing is running); on a phone or tablet each step carries its own scene. */
const STEPS = [
  {
    V: AgentAccess, acc: 'var(--color-zen)',
    kicker: 'AI agents', stat: 'Someone has to decide first.',
    title: 'Your agents act on their own.',
    body: 'AI agents now read your documents, hold your credentials and act in your core systems. Zenstra decides every action before it runs, and keeps the record that proves it.',
    to: '/agentic-ai/agentic-identity', cta: 'How Zenstra stops it',
  },
  {
    V: RiskMap, acc: 'var(--color-adap)',
    kicker: 'People', stat: 'MFA passed. Twice.',
    title: 'A stolen login passes every check and looks exactly like the real one.',
    body: 'Mumbai at 09:12, Lagos at 11:05, both with MFA. Rules stay quiet; adapID knows how each person normally works and holds the session the moment that changes.',
    to: '/adapid-ai', cta: 'How adapID catches it',
  },
];

function Copy({ s, i, dim }) {
  return (
    <div className={cx('transition-opacity duration-500', dim && 'lg:opacity-[.9]')}>
      <p className="kicker" style={{ '--acc': s.acc }}><span className="num mr-2">{String(i + 1).padStart(2, '0')}</span>{s.kicker}</p>
      <p className="mt-5 text-[clamp(30px,3.2vw,44px)] font-semibold leading-[1.05] tracking-[-0.035em]" style={{ color: s.acc }}>{s.stat}</p>
      <h3 className="t-h3 mt-4 max-w-[30ch]">{s.title}</h3>
      <p className="mt-3 max-w-[46ch] text-[16.5px] leading-relaxed text-ink-2">{s.body}</p>
      <Link to={s.to} className="link mt-6" style={{ '--acc': s.acc }}>{s.cta}<Icon name="ArrowRight" size={14} weight="bold" /></Link>
    </div>
  );
}

export default function PerimeterStory() {
  const steps = useRef([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) setActive(+e.target.dataset.i);
    }, { rootMargin: '-48% 0px -48% 0px' });
    steps.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const go = (i) => steps.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const A = STEPS[active];

  return (
    <>
      {/* desktop: text scrolls, the scene stays */}
      <div className="hidden gap-14 lg:grid lg:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)] xl:gap-20">
        <div>
          {STEPS.map((s, i) => (
            <div key={s.kicker} ref={(el) => { steps.current[i] = el; }} data-i={i} className="flex min-h-[70vh] items-center first:min-h-[56vh] last:min-h-[54vh]">
              <Copy s={s} i={i} dim={i !== active} />
            </div>
          ))}
        </div>
        <div>
          <div className="sticky top-[96px] flex h-[calc(100svh-140px)] max-h-[600px] items-center">
            <div className="scn-frame w-full">
              <div className="flex gap-2 px-5 pt-5 xl:px-6" role="tablist" aria-label="Three identities attackers use">
                {STEPS.map((s, i) => (
                  <button key={s.kicker} type="button" role="tab" aria-selected={i === active} onClick={() => go(i)} className="group flex-1 text-left">
                    <span className="block h-[3px] overflow-hidden rounded-full bg-[rgb(14_17_22/.08)]"><span className="block h-full rounded-full transition-all duration-500" style={{ width: i <= active ? '100%' : '0%', background: i === active ? s.acc : 'rgb(14 17 22 / .25)' }} /></span>
                    <span className={cx('mt-2 block text-[12.5px] font-semibold uppercase tracking-[.08em] transition-colors', i === active ? 'text-ink' : 'text-ink-3 group-hover:text-ink-2')}>{s.kicker}</span>
                  </button>
                ))}
              </div>
              <div key={active} className="scn-swap"><A.V /></div>
            </div>
          </div>
        </div>
      </div>

      {/* phone and tablet: each step with its own scene */}
      <div className="space-y-16 lg:hidden">
        {STEPS.map((s, i) => (
          <Reveal key={s.kicker}>
            <Copy s={s} i={i} />
            <div className="scn-frame mt-8"><s.V /></div>
          </Reveal>
        ))}
      </div>
    </>
  );
}
