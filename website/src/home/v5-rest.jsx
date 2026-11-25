import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { SOLUTION_PAGES } from '../data/solutions.js';
import { RECOGNITION } from '../data/company.js';
import { CERTS, SITE } from '../data/site.js';
import { POSTS, formatDate } from '../data/posts.js';
import { loadAnime } from './scene.js';
import { Arrow, useReveal } from './v5-top.jsx';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const onView = (el, fn, threshold = 0.35) => {
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); fn(); } }, { threshold });
  io.observe(el); return () => io.disconnect();
};

/* ---------------------------------------------------- [03] how it works */
// a session drifting away from its own normal (the band), then held
const BAND_TOP = 'M40 214 C 160 200, 260 222, 380 206 S 620 214, 760 204 S 1000 210, 1160 202';
const BAND_BOT = 'L1160 262 C 1000 270, 880 258, 760 266 S 520 256, 380 266 S 160 260, 40 272 Z';
const LIVE = 'M40 244 C 120 236, 200 250, 280 240 S 420 232, 520 238 S 620 246, 680 236';
const BAD = 'M680 236 C 720 226, 750 190, 790 170 S 860 128, 900 132 S 980 96, 1040 92';
// [x, y, label, label dx, label dy]
const PINS = [[790, 170, 'New device, first seen 4 min ago', 14, 14], [900, 132, 'Lagos, 22 min after Mumbai', -214, -44], [1040, 92, '9 MFA pushes in 2 min', -184, -40]];
const STEPS = [
  ['Discover', 'Every person, machine identity and AI agent, in one inventory with an owner.'],
  ['Assess', 'Posture gaps ranked by what they can reach: missing MFA, dormant admins, unused permissions.'],
  ['Detect', 'Each identity compared with its own normal, so weak signals add up while the session is open.'],
  ['Decide', 'Your policy acts inline: allow, step-up, hold or revoke; for agents, each action checked against its task.'],
  ['Prove', 'Every decision kept with its reason, ready for the DPDP Act, RBI and SEBI.'],
];
export function HowItWorks() {
  const ref = useRef(null);
  useReveal(ref);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return undefined;
    const steps = el.querySelector('.v5-steps');
    steps.style.setProperty('--p', 0);
    let tl, cancelled = false;
    const stop = onView(el.querySelector('.v5-trace'), () => {
      steps.style.setProperty('--p', 1);
      loadAnime().then(({ createTimeline, svg, stagger }) => {
        if (cancelled) return;
        tl = createTimeline({ defaults: { ease: 'inOutSine' } })
          .set(el.querySelectorAll('.tr-pin, .tr-act'), { opacity: 0 }, 0)
          .add(svg.createDrawable(el.querySelector('.tr-live')), { draw: ['0 0', '0 1'], duration: 1800 }, 0)
          .add(svg.createDrawable(el.querySelector('.tr-bad')), { draw: ['0 0', '0 1'], duration: 1600 }, 1800)
          .add(el.querySelectorAll('.tr-pin'), { opacity: [0, 1], y: [8, 0], duration: 500, delay: stagger(480), ease: 'outBack(1.8)' }, 2100)
          .add(el.querySelector('.tr-act'), { opacity: [0, 1], scale: [0.92, 1], duration: 600, ease: 'outBack(1.6)' }, 3600);
      });
    });
    return () => { cancelled = true; stop(); tl?.revert?.(); };
  }, []);
  return (
    <section ref={ref} className="v5-sheet light v5-pad" aria-labelledby="how-h">
      <div className="v5-wrap">
        <div className="v5-head v5-rv">
          <div>
            <p className="v5-k">[03] How it works</p>
            <h2 id="how-h" className="v5-h2">Continuous, <em>not once a quarter.</em></h2>
          </div>
          <p className="v5-lead">A valid password proves very little. Deep Algorithms learns how every identity normally behaves and keeps checking, so the wrong person with the right credentials still stands out.</p>
        </div>
        <figure className="v5-trace v5-rv" style={{ margin: 0 }} aria-label="Chart: a session stays inside its normal behaviour band, then drifts away: a new device, a login from Lagos 22 minutes after Mumbai and nine MFA pushes in two minutes. The session is held and a step-up is sent.">
          <div className="v5-trace-scroll">
            <svg viewBox="0 0 1200 330" aria-hidden="true">
              {[80, 140, 200, 260].map((y) => <path key={y} className="tr-axis" d={`M40 ${y} H1160`} />)}
              <path className="tr-band" d={`${BAND_TOP} ${BAND_BOT}`} />
              <text className="tr-lab" x="48" y="300">THEIR NORMAL, LEARNED</text>
              <text className="tr-lab" x="48" y="40">r.mehta · treasury analyst · one session</text>
              <path className="tr-live" d={LIVE} />
              <path className="tr-bad" d={BAD} />
              {PINS.map(([x, y, t, dx, dy]) => (
                <g key={t} transform={`translate(${x} ${y})`}><g className="tr-pin">
                  <circle r="6" />
                  <rect x={dx} y={dy} width={t.length * 7.1 + 22} height="26" rx="13" />
                  <text x={dx + 11} y={dy + 18}>{t}</text>
                </g></g>
              ))}
              <g transform="translate(910 250)"><g className="tr-act"><rect width="250" height="40" rx="20" /><text x="20" y="25">Session held · step-up sent</text></g></g>
            </svg>
          </div>
        </figure>
        <ol className="v5-steps v5-rv">
          {STEPS.map(([b, s], i) => <li key={b}><i>{String(i + 1).padStart(2, '0')}</i><b>{b}</b><span>{s}</span></li>)}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------- [04] attack scenarios */
const SC = [
  { t: 'Compromised employee credentials', stop: 1, nodes: [['Phishing kit', 'PASSWORD + MFA PUSH'], ['Valid login', 'OKTA · LOOKS LEGITIMATE'], ['Mail and files', 'MICROSOFT 365'], ['Payment approval', 'FINANCE WORKFLOW']],
    what: 'An attacker signs in with a stolen password and an approved MFA push. Every control sees a legitimate user.',
    why: 'Nothing is broken, so nothing alerts, and the session carries all of the employee’s access.',
    help: 'Compares the session with the employee’s normal behaviour, and steps up, holds or revokes it through your identity provider.',
    by: ['adapID AI · Continuous Identity Risk Management', '/adapid-ai'] },
  { t: 'Privilege escalation in Active Directory', stop: 1, nodes: [['One workstation', 'A STANDARD USER'], ['Service account', 'WEAK KERBEROS TICKET'], ['Nested group', 'INHERITED ADMIN RIGHTS'], ['Domain Admins', 'TIER 0']],
    what: 'A foothold on one workstation finds a service account with a weak Kerberos ticket, and a path to Domain Admins.',
    why: 'A handful of hops turns one ordinary user into control of the whole domain.',
    help: 'Maps every path to Tier 0, flags weak Kerberos settings, and detects the abuse while it happens.',
    by: ['adapID AI · Active Directory Security', '/ad-security'] },
  { t: 'Exposed service identities', stop: 0, nodes: [['Key in a public repo', 'AWS ACCESS KEY'], ['IAM role', '214 PERMISSIONS, 9 USED'], ['Production bucket', 'CUSTOMER DATA'], ['Data leaves', 'FROM A NEW COUNTRY']],
    what: 'An access key for a service account is committed to a public repository. The role behind it holds far more than it uses.',
    why: 'Machine identities outnumber people and rarely have an owner watching what they do.',
    help: 'Finds every role and key, compares granted permissions with what is used, and ranks leaked secrets by real risk.',
    by: ['adapID AI · NHI Security for AWS', '/adapid-ai/nhi-security'] },
  { t: 'An over-privileged AI agent', stop: 1, nodes: [['Poisoned ticket', 'HIDDEN INSTRUCTIONS'], ['Support agent', 'HOLDS CRM CREDENTIALS'], ['Export all contacts', '12,400 RECORDS'], ['External address', 'DATA LEAVES']],
    what: 'Hidden instructions in a support ticket steer an AI agent to export every customer record.',
    why: 'The agent holds real credentials and acts without a person in the loop.',
    help: 'Checks each tool call against the agent’s task before it runs, blocks what falls outside it and records why.',
    by: ['Zenstra AI', '/agentic-ai/agentic-identity'] },
  { t: 'Suspicious access to personal data', stop: 1, nodes: [['Analyst login', 'VALID ACCOUNT'], ['Bulk query', 'AADHAAR AND PAN FIELDS'], ['Export at 2 am', 'OUTSIDE ITS PURPOSE'], ['Unreported breach', '72-HOUR CLOCK']],
    what: 'A legitimate account reads far more personal data than its purpose allows, and exports it at night.',
    why: 'Under the DPDP Act, access must match purpose and consent, and a breach must be reported within 72 hours.',
    help: 'Checks every access to personal data against purpose and consent, and keeps the evidence for DPDPA, RBI and SEBI ready.',
    by: ['ICMS Compliance Suite', '/dpdpa-compliance'] },
];
const NX = [120, 370, 620, 870], NY = 150;
export function Scenarios() {
  const ref = useRef(null);
  const [on, setOn] = useState(0);
  useReveal(ref);
  const s = SC[on];
  // the attack path draws itself to where Deep Algorithms steps in; the stop appears; the rest stays dark
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return undefined;
    let tl, cancelled = false, stop;
    const run = () => loadAnime().then(({ createTimeline, svg, stagger }) => {
      if (cancelled) return;
      const nodes = el.querySelectorAll('.pa-node');
      tl = createTimeline({ defaults: { ease: 'outQuart' } })
        .set(el.querySelectorAll('.pa-stop'), { opacity: 0, scale: 0.6 }, 0)
        .add(nodes, { opacity: [0, 1], y: [10, 0], duration: 500, delay: stagger(110) }, 0)
        .add(svg.createDrawable(el.querySelector('.pa-hot')), { draw: ['0 0', '0 1'], duration: 1000 + 600 * s.stop, ease: 'inOutQuad' }, 450)
        .add(el.querySelectorAll('.pa-stop'), { opacity: 1, scale: [0.6, 1], duration: 600, ease: 'outBack(2)' }, 1500 + 600 * s.stop);
    });
    if (el.dataset.seen) run(); else stop = onView(el.querySelector('.v5-path'), () => { el.dataset.seen = '1'; run(); }, 0.4);
    return () => { cancelled = true; stop?.(); tl?.revert?.(); };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  const sx = (NX[s.stop] + NX[s.stop + 1]) / 2;
  const keys = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    e.preventDefault();
    const n = (on + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : SC.length - 1)) % SC.length;
    setOn(n); ref.current.querySelectorAll('.v5-sc-list [role=tab]')[n].focus();
  };
  return (
    <section ref={ref} className="v5-sheet dark grid v5-pad" data-hdr="dark" aria-labelledby="sc-h">
      <div className="v5-wrap">
        <div className="v5-head v5-rv">
          <div>
            <p className="v5-k">[04] Identity risk</p>
            <h2 id="sc-h" className="v5-h2">Identity risks don’t always <em>look like attacks.</em></h2>
          </div>
          <p className="v5-lead">Compromised credentials, excessive permissions and overlooked machine identities open gaps long before an incident becomes visible. Five of the most common, and where each one is stopped.</p>
        </div>
        <div className="v5-sc">
          <ul className="v5-sc-list v5-rv" role="tablist" aria-label="Identity risk scenarios" aria-orientation="vertical" onKeyDown={keys}>
            {SC.map((x, i) => <li key={x.t}><button type="button" role="tab" id={`st-${i}`} aria-controls="sp" aria-selected={i === on} tabIndex={i === on ? 0 : -1} onClick={() => setOn(i)}><i>{String(i + 1).padStart(2, '0')}</i>{x.t}</button></li>)}
          </ul>
          <div className="v5-sc-panel v5-rv" id="sp" role="tabpanel" aria-labelledby={`st-${on}`} style={{ '--d': '120ms' }}>
            <figure className="v5-path" style={{ margin: 0 }} aria-label={`Attack path: ${s.nodes.map((n) => n[0]).join(', then ')}. Deep Algorithms stops it between ${s.nodes[s.stop][0]} and ${s.nodes[s.stop + 1][0]}.`}>
              <div className="v5-path-scroll">
                <svg viewBox="0 0 990 300" aria-hidden="true" key={on}>
                  <path className="pa-ln" d={`M${NX[0]} ${NY} H${NX[3]}`} />
                  <path className="pa-hot" d={`M${NX[0]} ${NY} H${sx - 24}`} style={{ filter: 'drop-shadow(0 0 6px rgb(255 107 125 / .7))' }} />
                  {['ENTRY', 'MOVEMENT', 'ACCESS', 'TARGET'].map((c, i) => <text key={c} className="pa-cap" x={NX[i]} y="62" textAnchor="middle">{c}</text>)}
                  {s.nodes.map(([n, sub], i) => (
                    <g key={n} transform={`translate(${NX[i]} ${NY})`} style={{ opacity: i > s.stop ? 0.45 : 1 }}><g className={`pa-node${i <= s.stop ? ' hit' : ''}`}>
                      <rect x="-104" y="-40" width="208" height="80" rx="14" />
                      <text textAnchor="middle" y="-4">{n}</text>
                      <text className="s" textAnchor="middle" y="18">{sub}</text>
                    </g></g>
                  ))}
                  <g transform={`translate(${sx} ${NY})`}><g className="pa-stop">
                    <circle r="20" /><path d="M-7 0l4.5 4.5L8-5" />
                    <text textAnchor="middle" y="52">STOPPED HERE</text>
                  </g></g>
                </svg>
              </div>
            </figure>
            <div className="v5-sc-cols">
              <div><h4>What happens</h4><p>{s.what}</p></div>
              <div><h4>Why it matters</h4><p>{s.why}</p></div>
              <div className="help"><h4>How we help</h4><p>{s.help}</p><Link to={s.by[1]}>{s.by[0]} <Arrow /></Link></div>
            </div>
          </div>
        </div>
        <div className="v5-deeper v5-rv">
          <p className="v5-k">Go deeper · research</p>
          <ul>
            {POSTS.slice(0, 3).map((p) => <li key={p.slug}><Link to={`/blogs/${p.slug}`}><b>{p.title}</b><small>{p.category}</small><small>{formatDate(p)}</small></Link></li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- [05] industries */
export function Industries() {
  const ref = useRef(null);
  useReveal(ref);
  const order = ['bfsi', 'healthcare', 'government', 'digital-platforms'];
  return (
    <section ref={ref} className="v5-sheet light v5-pad" aria-labelledby="ind-h">
      <div className="v5-wrap">
        <div className="v5-head v5-rv">
          <div>
            <p className="v5-k">[05] Industries</p>
            <h2 id="ind-h" className="v5-h2">Security for industries that <em>cannot afford blind spots.</em></h2>
          </div>
          <p className="v5-lead">From banks and hospitals to government departments and digital platforms, identity decides who reaches money, patient records and citizen data. Each industry gets the products and the evidence its regulator expects.</p>
        </div>
        <div className="v5-ind">
          {order.map((slug, i) => {
            const x = SOLUTION_PAGES[slug];
            return (
              <Link key={slug} to={`/solutions/${slug}`} className={`${slug} v5-rv`} style={{ '--d': `${i * 80}ms` }}>
                <img src={`/img/photos/${slug}.webp`} alt="" width="1200" height="800" loading="lazy" decoding="async" />
                <span className="ib">
                  <small>{x.name}</small>
                  <b>{x.title}</b>
                  {slug === 'bfsi' && <span>{x.sub}</span>}
                  {slug === 'bfsi' && <ul>{x.help.map((h) => <li key={h.title}>{h.title}</li>)}</ul>}
                  <em>See how <Arrow /></em>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- [06] trust */
export function Trust() {
  const ref = useRef(null);
  useReveal(ref);
  return (
    <section ref={ref} className="v5-sheet bare v5-pad" aria-labelledby="trust-h">
      <div className="v5-wrap">
        <div className="v5-head v5-rv">
          <div>
            <p className="v5-k">[06] Trust</p>
            <h2 id="trust-h" className="v5-h2">Built for trust. <em>Audited like it.</em></h2>
          </div>
          <p className="v5-lead">Independent certifications, a granted patent and recognition from India’s security community. Deployed in your cloud or data centre, so identity data stays with you.</p>
        </div>
        <div className="v5-trust7">
          <div className="v5-rv">
            <ul className="v5-certlist">{CERTS.map((c) => <li key={c.code}><b>{c.name}</b><span>{c.desc}</span></li>)}</ul>
            <div className="v5-patent">
              <p className="v5-k">Patent granted · October 2026</p>
              <q>Intelligent Centralized Middleware System and Method for Multi-Domain Fraud Detection, Investigation, and Resolution.</q>
              <small>Patent No. 602726</small>
            </div>
          </div>
          <div className="v5-awards v5-rv" style={{ '--d': '120ms' }}>
            {RECOGNITION.slice(0, 3).map((r) => (
              <figure key={r.title}>
                <img src={`/img/events/${r.img}.webp`} alt={`${r.title}, ${r.where}, ${r.year}`} loading="lazy" decoding="async" />
                <figcaption><b>{r.title}</b><span>{r.where} · {r.year}</span></figcaption>
              </figure>
            ))}
          </div>
          <ul className="v5-facts v5-rv">
            <li><b>Founded {SITE.founded}</b> · Hyderabad</li>
            {SITE.offices.map((o) => <li key={o.city}><b>{o.city}</b> · {o.label}</li>)}
            <li><Link to="/why-deep-algorithms" className="v5-link" style={{ color: '#2563d6' }}>Why Deep Algorithms <Arrow /></Link></li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- CTA */
export function Cta() {
  const ref = useRef(null);
  useReveal(ref);
  return (
    <section ref={ref} className="v5-sheet dark v5-cta" data-hdr="dark" data-cta aria-labelledby="cta-h">
      <div className="v5-wrap">
        <div className="v5-cta-grid">
          <div className="v5-rv" style={{ padding: 'clamp(64px, 8vw, 120px) 0' }}>
            <p className="v5-k">Talk to us</p>
            <h2 id="cta-h" className="v5-h2">Find your riskiest identity <em>before attackers do.</em></h2>
            <p className="v5-lead">Get a clearer picture of identity exposure across your enterprise, and where security needs attention first, in a working session with our engineers.</p>
            <div className="v5-hero-cta">
              <Link to="/request-demo" className="v5-btn white">Talk to our experts <Arrow /></Link>
              <Link to="/contact" className="v5-btn ghost">Contact us</Link>
            </div>
          </div>
          <img className="v5-rv" style={{ '--d': '140ms' }} src="/img/home/cta.webp" alt="" width="884" height="733" loading="lazy" />
        </div>
      </div>
    </section>
  );
}
