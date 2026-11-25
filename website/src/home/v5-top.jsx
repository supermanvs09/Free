import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import ProductMark from '../components/ProductMark.jsx';
import { CERTS, CUSTOMERS } from '../data/site.js';
import { openFilm, FILM } from '../components/home/FilmModal.jsx';
import { loadAnime } from './scene.js';
import HERO from './hero-paths.json';

export const Arrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
const Play = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* reveal children marked .v5-rv when they come on screen */
export function useReveal(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    document.documentElement.classList.add('io'); // the app has hydrated (as Reveal marks it)
    const els = root.querySelectorAll('.v5-rv');
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ref]);
}

/* ---------------------------------------------------------------- hero */
// the six tokens in the render, in the order of its light paths (outer end first)
const TOKENS = ['Human identity', 'Machine identity', 'AI agent', 'Cloud apps', 'Sensitive data', 'Credentials'];
const LOGOS = ['meity', 'canara-bank', 'karnataka-bank', 'dcb-bank', 'ncrtc', 'iit-kanpur', 'iit-mandi', 'iiit-hyderabad', 'bhaktivedanta', 'ccoe'];

export function Hero() {
  const ref = useRef(null);
  const art = useRef(null);
  const names = Object.fromEntries(CUSTOMERS);
  const W = HERO.w, H = HERO.h;
  const paths = HERO.paths.map((p) => p.map(([x, y]) => [(x / 100) * W, (y / 100) * H]));
  const d = (p) => `M${p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}`;

  useEffect(() => {
    const el = ref.current, layer = art.current;
    if (!el || reduced()) return undefined;
    // parallax: the render drifts against the pointer, the map with it, less
    const move = (e) => {
      const b = el.getBoundingClientRect();
      const mx = (e.clientX - b.left) / b.width - 0.5, my = (e.clientY - b.top) / b.height - 0.5;
      layer.style.transform = `translate3d(${(-mx * 16).toFixed(1)}px, ${(-my * 12).toFixed(1)}px, 0)`;
      el.style.setProperty('--mx', mx.toFixed(3)); el.style.setProperty('--my', my.toFixed(3));
    };
    el.addEventListener('pointermove', move);
    // identity signals travel the light paths into the core; tags light up as each one reports in
    let anims = [], cancelled = false;
    loadAnime().then(({ animate, svg, stagger }) => {
      if (cancelled) return;
      el.querySelectorAll('.hp-dot').forEach((dot, i) => {
        const path = el.querySelector(`#hp-${i % paths.length}`);
        anims.push(animate(dot, { ...svg.createMotionPath(path), opacity: [0, 1, 1, 0], duration: 2600, delay: 400 + i * 480, loop: true, loopDelay: 1200, ease: 'inOutSine' }));
      });
      anims.push(animate(el.querySelectorAll('.v5-tag'), { opacity: [0, 1], y: [8, 0], duration: 700, delay: stagger(140, { start: 500 }), ease: 'outQuart' }));
      anims.push(animate(el.querySelectorAll('.hp-ring'), { r: [4, 26], opacity: [0.9, 0], duration: 2200, delay: stagger(520), loop: true, ease: 'outQuad' }));
    });
    return () => { cancelled = true; el.removeEventListener('pointermove', move); anims.forEach((a) => a.revert?.()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section ref={ref} className="v5-hero" data-hdr="dark" aria-labelledby="hero-h">
      <img className="v5-map" src="/img/home/worldmap.svg" alt="" width="1440" height="620" style={{ transform: 'translate3d(calc(var(--mx, 0) * 10px), calc(var(--my, 0) * 8px), 0)' }} />
      <div className="v5-wrap">
        <div className="v5-hero-grid">
          <div className="v5-hero-copy">
            <p className="v5-k rise" style={{ '--d': '0ms' }}>Identity security · AI security</p>
            <h1 id="hero-h" className="v5-h1 rise" style={{ '--d': '60ms' }}>Identity security for an <em>AI-driven world.</em></h1>
            <p className="v5-hero-sub rise" style={{ '--d': '140ms' }}>From human and machine identities to AI agents, Deep Algorithms helps enterprises discover, understand and secure every identity in their digital ecosystem, and stop the attacks that use them.</p>
            <div className="v5-hero-cta rise" style={{ '--d': '220ms' }}>
              <a href="#platform" className="v5-btn primary">Explore the platform <Arrow /></a>
              <Link to="/request-demo" className="v5-btn ghost">Talk to our experts</Link>
            </div>
            <button type="button" className="v5-film rise" style={{ '--d': '300ms' }} onClick={() => openFilm(0)}><i><Play /></i>Watch the film ({FILM.length.padStart(5, '0')})</button>
          </div>
          <div className="v5-hero-art rise" style={{ '--d': '120ms' }}>
            <div ref={art} className="layer">
              <img src="/img/home/hero.webp" alt="Illustration: a glowing identity shield at the centre of an enterprise, connected by light to a person, a server, an AI agent, cloud apps, a database and a key." width={W} height={H} fetchPriority="high" />
              <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
                {paths.map((p, i) => <path key={i} id={`hp-${i}`} d={d(p)} fill="none" stroke="none" />)}
                {paths.map((p, i) => <circle key={`r${i}`} className="hp-ring" cx={p[0][0]} cy={p[0][1]} r="4" fill="none" stroke="#8fd0ff" strokeWidth="1.5" opacity="0" />)}
                {[...paths, ...paths].map((_, i) => <circle key={`d${i}`} className="hp-dot" r="4.5" fill="#e6f4ff" opacity="0" style={{ filter: 'drop-shadow(0 0 6px #5aa6ff)' }} />)}
              </svg>
              {paths.map((p, i) => <span key={TOKENS[i]} className="v5-tag" style={{ left: `${(p[0][0] / W) * 100}%`, top: `${(p[0][1] / H) * 100 - 24}%` }}><i />{TOKENS[i]}</span>)}
            </div>
          </div>
        </div>
        <div className="v5-trust">
          <p>Trusted by banks, government and enterprises across India</p>
          <div className="v5-marquee">
            <ul>{[...LOGOS, ...LOGOS].map((k, i) => <li key={i} aria-hidden={i >= LOGOS.length || undefined}><img src={`/img/logos/${k}-white.webp`} alt={i < LOGOS.length ? names[k] : ''} loading="lazy" decoding="async" /></li>)}</ul>
          </div>
          <ul className="v5-certs" aria-label="Certifications">{CERTS.map((c) => <li key={c.code}>{c.name}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------- identity ecosystem */
const CLUSTERS = [
  { k: 'human', n: 'Human identities', cap: 'HUMAN', at: [150, 130], glyph: 'person', nodes: [[70, 70], [150, 52], [228, 78], [88, 176], [210, 188]],
    p: 'Employees, administrators, contractors and customers signing in to your applications, from the identity provider to the payment.',
    by: [['adapid', 'Continuous Identity Risk Management', '/adapid-ai'], ['adapid', 'Identity Fraud Prevention', '/adapid-ai/fraud-prevention']] },
  { k: 'machine', n: 'Machine identities', cap: 'MACHINE', at: [490, 130], glyph: 'server', nodes: [[412, 72], [492, 50], [570, 76], [420, 186], [560, 184]],
    p: 'Service accounts, cloud roles, access keys and workloads that talk to each other without a person, often with more access than they use.',
    by: [['adapid', 'NHI Security for AWS', '/adapid-ai/nhi-security'], ['adapid', 'Active Directory Security', '/ad-security']] },
  { k: 'ai', n: 'AI identities', cap: 'AI AGENTS', at: [490, 420], glyph: 'agent', nodes: [[414, 362], [570, 360], [420, 476], [492, 500], [568, 470]],
    p: 'AI agents, copilots, workflow automations and MCP servers that read your data, hold real credentials and act in your systems.',
    by: [['zenstra', 'Zenstra AI', '/agentic-ai/agentic-identity']] },
  { k: 'data', n: 'Sensitive data', cap: 'SENSITIVE DATA', at: [150, 420], glyph: 'db', nodes: [[72, 362], [228, 360], [80, 474], [150, 500], [222, 470]],
    p: 'The personal and business data every one of these identities can reach, which the DPDP Act requires you to protect and account for.',
    by: [['icms', 'ICMS Compliance Suite', '/dpdpa-compliance']] },
];
const CORE = [320, 275];
// access paths that cross clusters: an agent reading data, a workload holding a person's token
const CROSS = [[2, 3], [1, 3], [0, 2], [1, 2]];
const GLYPH = {
  person: <><circle cx="0" cy="-4" r="4" /><path d="M-7 8c1.5-5 4-7 7-7s5.5 2 7 7" /></>,
  server: <><rect x="-7" y="-8" width="14" height="6" rx="1.5" /><rect x="-7" y="1" width="14" height="6" rx="1.5" /></>,
  agent: <><rect x="-7" y="-5" width="14" height="11" rx="3" /><path d="M0-9v4M-3 0h.01M3 0h.01" /></>,
  db: <><ellipse cx="0" cy="-5" rx="7" ry="3" /><path d="M-7-5v10c0 1.7 3.1 3 7 3s7-1.3 7-3V-5" /></>,
};

export function Ecosystem() {
  const ref = useRef(null);
  const [on, setOn] = useState(0);
  const hold = useRef(false);
  useReveal(ref);
  // walk through the four kinds of identity until the visitor takes over
  useEffect(() => {
    if (reduced()) return undefined;
    const t = setInterval(() => { if (!hold.current) setOn((v) => (v + 1) % CLUSTERS.length); }, 4800);
    return () => clearInterval(t);
  }, []);
  // flows along the active cluster's access paths
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return undefined;
    let a = [], cancelled = false;
    loadAnime().then(({ animate, svg, stagger }) => {
      if (cancelled) return;
      el.querySelectorAll(`.eco-flow[data-c="${on}"]`).forEach((dot, i) => {
        a.push(animate(dot, { ...svg.createMotionPath(el.querySelector(`#${dot.dataset.p}`)), opacity: [0, 1, 0], duration: 1600, delay: i * 260, loop: true, loopDelay: 400, ease: 'inOutQuad' }));
      });
      a.push(animate(el.querySelectorAll(`.eco-node[data-c="${on}"] circle.halo`), { r: [14, 22], opacity: [0.7, 0], duration: 1400, delay: stagger(120), loop: true, ease: 'outQuad' }));
    });
    return () => { cancelled = true; a.forEach((x) => x.revert?.()); };
  }, [on]);

  const take = (i) => { hold.current = true; setOn(i); };
  return (
    <section ref={ref} className="v5-sheet light v5-pad" aria-labelledby="eco-h">
      <div className="v5-wrap">
        <div className="v5-head v5-rv">
          <div>
            <p className="v5-k">[01] The identity problem</p>
            <h2 id="eco-h" className="v5-h2">Your enterprise has more identities <em>than you can see.</em></h2>
          </div>
          <p className="v5-lead">Every user, workload, application and AI agent brings an identity that has to be discovered, governed and protected. As environments grow, those identities multiply faster than anyone can track them by hand.</p>
        </div>
        <div className="v5-eco" onMouseLeave={() => { hold.current = false; }}>
          <figure className={`v5-eco-art v5-rv eco-dim`} style={{ margin: 0 }} aria-label="Illustration: one enterprise at the centre, connected to human identities, machine identities, AI agents and sensitive data, with access paths between them.">
            <svg viewBox="0 0 640 550" aria-hidden="true">
              <defs><radialGradient id="eco-core"><stop offset="0" stopColor="#5aa6ff" stopOpacity=".55" /><stop offset="1" stopColor="#2e7bff" stopOpacity="0" /></radialGradient></defs>
              {/* access paths */}
              {CLUSTERS.map((c, ci) => (
                <g key={c.k}>
                  <path id={`eco-${ci}-c`} className={`eco-ln${ci === on ? ' on' : ''}`} d={`M${c.at[0]} ${c.at[1]} Q ${(c.at[0] + CORE[0]) / 2} ${c.at[1]}, ${CORE[0]} ${CORE[1]}`} />
                  {c.nodes.map(([x, y], ni) => <path key={ni} id={`eco-${ci}-${ni}`} className={`eco-ln${ci === on ? ' on' : ''}`} d={`M${x} ${y} L${c.at[0]} ${c.at[1]}`} />)}
                </g>
              ))}
              {CROSS.map(([a, b], i) => { const A = CLUSTERS[a].at, B = CLUSTERS[b].at; return <path key={i} id={`eco-x${i}`} className={`eco-ln${a === on || b === on ? ' on' : ''}`} strokeDasharray="3 5" d={`M${A[0]} ${A[1]} Q ${CORE[0]} ${(A[1] + B[1]) / 2 + (a === 0 ? -60 : 60)}, ${B[0]} ${B[1]}`} />; })}
              {/* flows for the active cluster */}
              {CLUSTERS.map((c, ci) => [...c.nodes.map((_, ni) => `eco-${ci}-${ni}`), `eco-${ci}-c`].map((p) => <circle key={p} className="eco-flow" data-c={ci} data-p={p} r="3" fill="#cfe6ff" opacity="0" style={{ filter: 'drop-shadow(0 0 4px #5aa6ff)' }} />))}
              {/* the enterprise at the centre */}
              <circle cx={CORE[0]} cy={CORE[1]} r="70" fill="url(#eco-core)" />
              <circle cx={CORE[0]} cy={CORE[1]} r="38" fill="#0b1a3d" stroke="#5aa6ff" strokeWidth="1.5" />
              <image href="/brand/mark.webp" x={CORE[0] - 15} y={CORE[1] - 15} width="30" height="30" style={{ filter: 'brightness(0) invert(1)' }} />
              <text x={CORE[0]} y={CORE[1] + 60} textAnchor="middle" className="eco-cap on">YOUR ENTERPRISE</text>
              {/* clusters */}
              {CLUSTERS.map((c, ci) => (
                <g key={c.k}>
                  {c.nodes.map(([x, y], ni) => (
                    <g key={ni} className={`eco-node${ci === on ? ' on' : ''}`} data-c={ci} transform={`translate(${x} ${y})`}>
                      <circle className="halo" r="14" fill="none" stroke="#5aa6ff" opacity="0" />
                      <circle r="14" fill="#0c1a38" stroke={ci === on ? '#5aa6ff' : 'rgb(150 180 240 / .35)'} />
                      <g fill="none" stroke={ci === on ? '#cfe6ff' : '#7f93b5'} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" transform="scale(.8)">{GLYPH[c.glyph]}</g>
                    </g>
                  ))}
                  <g className={`eco-node${ci === on ? ' on' : ''}`} transform={`translate(${c.at[0]} ${c.at[1]})`}>
                    <circle r="9" fill={ci === on ? '#2e7bff' : '#16284e'} stroke="#5aa6ff" />
                  </g>
                  <text x={c.at[0]} y={c.at[1] + (c.at[1] < CORE[1] ? 92 : -78)} textAnchor="middle" className={`eco-cap${ci === on ? ' on' : ''}`}>{c.cap}</text>
                </g>
              ))}
            </svg>
          </figure>
          <ol className="v5-eco-list v5-rv" style={{ '--d': '120ms' }}>
            {CLUSTERS.map((c, i) => (
              <li key={c.k} className={i === on ? 'on' : ''}>
                <button type="button" aria-expanded={i === on} onClick={() => take(i)} onFocus={() => take(i)} onMouseEnter={() => take(i)}>
                  <i>{String(i + 1).padStart(2, '0')}</i><b>{c.n}</b>
                </button>
                <div className="body">
                  <p>{c.p}</p>
                  <p className="by">Protected by {c.by.map(([m, n, to]) => <Link key={n} to={to} tabIndex={i === on ? 0 : -1}><ProductMark p={m} size={18} />{n}</Link>)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
