import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import ProductMark from '../ProductMark.jsx';
import { Icon, cx } from '../ui.jsx';

/* ---------------- Inside the Deep Algorithms core ----------------
   The home page's centre: what we protect you from, and how. Pinned while
   it scrolls, in six steps. First the AI-driven attacks strike the core.
   Then the core comes apart, layer by layer: the engine that scores every
   identity, then the three product layers, each with where it runs, what it
   checks, what it stops and one real decision. Last, the layers lock back
   together over the record your auditors read. On phones and for reduced
   motion the steps are a plain list. */

const THREATS = [
  { t: 'AI-written phishing', at: [8, 20] },
  { t: 'Deepfake voice and video', at: [80, 14] },
  { t: 'Credential stuffing at AI speed', at: [2, 62] },
  { t: 'Shadow AI agents', at: [84, 56] },
  { t: 'Prompt injection', at: [20, 90] },
  { t: 'Leaked machine keys', at: [70, 92] },
];

/* the layers, bottom to top; r = ring radius in px at full size */
const LAYERS = [
  { id: 'record', r: 236, c: '#3fd98f', z: -190, label: 'Decision record', sub: 'Evidence for auditors' },
  { id: 'icms', r: 200, c: '#f4c76c', z: -80, label: 'ICMS', sub: 'Personal data' },
  { id: 'zenstra', r: 164, c: '#93a2ff', z: 30, label: 'Zenstra AI', sub: 'AI agents' },
  { id: 'adapid', r: 128, c: '#3cc8f6', z: 140, label: 'adapID AI', sub: 'People and machines' },
  { id: 'engine', r: 78, c: '#5fd0ff', z: 250, label: 'AI-SPM engine', sub: 'Scores every identity' },
];

const STEPS = [
  { key: 'exposure', tag: 'The exposure', h: 'AI made every attack faster. Identities are how it gets in.',
    p: 'Attackers use AI to write the phishing, clone the voice and test stolen passwords at scale. Inside, your own AI agents read data and call tools with real credentials. Each of these attacks reaches your business through an identity.',
    threats: true },
  { key: 'engine', tag: 'One engine', h: 'One engine scores every identity, continuously.',
    p: 'Deep Algorithms learns how each person, machine identity and AI agent normally behaves, scores every action against that baseline and your policy, and decides inline, before the action completes.',
    code: [['allow', 'sign-in · Okta', 'score 12 · usual device'], ['hold', 'payments.transfer', 'score 71 · needs approval'], ['block', 's3:GetObject', 'score 94 · unknown network']],
    foot: 'Inline · every score explained in plain language', layer: 'engine' },
  { key: 'adapid', tag: 'adapID AI', mark: 'adapid', h: 'People and machine identities.',
    rows: [['Runs in', 'Okta, Entra ID, Active Directory, AWS and Google Workspace, through read-only connectors'], ['Checks', 'Every sign-in, key and service account against its own behaviour'], ['Stops', 'Stolen credentials, MFA fatigue, account takeover and paths to Domain Admins']],
    ex: ['block', 'AKIA••7Q2F · s3:GetObject from 185.220.x.x · key revoked'], to: '/adapid-ai', cta: 'Explore adapID AI', layer: 'adapid' },
  { key: 'zenstra', tag: 'Zenstra AI', mark: 'zenstra', h: 'AI agents and the tools they call.',
    rows: [['Runs in', 'A gateway inside your VPC, connected to Copilot Studio, n8n, Zapier, Cursor and LangGraph'], ['Checks', 'Every agent action against its owner, its task and its grant'], ['Stops', 'Prompt injection, tool poisoning, shadow AI and data leaving your cloud']],
    ex: ['block', 'invoice-agent · salesforce.export → outside email · not in task'], to: '/agentic-ai/agentic-identity', cta: 'Explore Zenstra AI', layer: 'zenstra' },
  { key: 'icms', tag: 'ICMS Compliance Suite', mark: 'icms', h: 'Personal data, under DPDPA.',
    rows: [['Runs in', 'The databases, buckets and drives that already hold personal data'], ['Checks', 'Every access to PII against its declared purpose and the principal’s consent'], ['Stops', 'Access outside consent, and PII left unmasked where no one should see it']],
    ex: ['hold', 'analytics-svc · read aadhaar_no · no consent for this purpose · masked'], to: '/dpdpa-compliance', cta: 'Explore ICMS', layer: 'icms' },
  { key: 'record', tag: 'The record', h: 'Every decision, on one record.',
    p: 'Deep Algorithms writes every decision with the identity, the reason and the policy behind it, and maps it to DPDPA 2023, RBI and SEBI directions and ISO/IEC 42001. Export it as evidence for your auditors and examiners.',
    code: [['#48213', 'block', 'POL-114 v7 · zenstra'], ['#48214', 'hold', 'POL-021 v3 · icms'], ['#48215', 'allow', 'POL-003 v12 · adapid']],
    foot: 'Exported as PDF and CSV', layer: 'record' },
];

function RingSvg({ r, c, solid }) {
  const s = r * 2 + 24; const C = s / 2;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" className="dc-svg">
      <circle cx={C} cy={C} r={r} fill={solid ? `${c}14` : 'none'} stroke={c} strokeOpacity=".9" strokeWidth="1.6" />
      <circle cx={C} cy={C} r={r - 9} fill="none" stroke={c} strokeOpacity=".55" strokeWidth="7" strokeDasharray={`${(Math.PI * 2 * (r - 9)) / 72 - 3} 3`} />
      <circle cx={C} cy={C} r={r - 19} fill="none" stroke={c} strokeOpacity=".25" strokeWidth="1" strokeDasharray="2 6" />
      {[0, 90, 180, 270].map((a) => <circle key={a} cx={C + r * Math.cos((a * Math.PI) / 180)} cy={C + r * Math.sin((a * Math.PI) / 180)} r="3.2" fill={c} />)}
    </svg>
  );
}

/* each threat's streak points at the centre of the stage (the stage is
   wider than tall, so x and y are scaled to its proportions) */
const aim = ([x, y]) => {
  const dx = (50 - x) * 1.45; const dy = 50 - y;
  return { '--ang': `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`, '--len': `${Math.max(40, Math.hypot(dx, dy) * 5.2 - 150)}px` };
};

function Stack({ step }) {
  const apart = step >= 1 && step <= 4;
  const active = step === 5 ? null : STEPS[step].layer; // sealed: every layer lit together
  return (
    <div className={cx('dc-3d', step === 0 && 'is-hit', step === 5 && 'is-sealed', apart && 'is-apart')} aria-hidden="true">
      <div className="dc-tilt">
        {LAYERS.map((L) => (
          <div key={L.id} className={cx('dc-layer', (active === L.id || (step === 5 && L.id === 'record')) && 'is-on', active && active !== L.id && 'is-dim')}
            style={{ '--c': L.c, transform: `translateZ(${apart ? L.z : L.id === 'engine' ? 30 : 0}px)`, width: L.r * 2 + 24, height: L.r * 2 + 24 }}>
            <RingSvg r={L.r} c={L.c} solid={L.id === 'engine'} />
            {L.id === 'engine' && <span className="dc-mark"><img src="/brand/mark.webp" alt="" width="64" height="64" /></span>}
            <span className="dc-tag" style={{ left: `calc(50% + ${L.r * 0.72}px)`, top: `calc(50% - ${L.r * 0.72}px)` }}>
              <b>{L.label}</b><i>{L.sub}</i>
            </span>
          </div>
        ))}
      </div>
      <div className="dc-threats">
        {THREATS.map((t, i) => (
          <span key={t.t} className="dc-threat" style={{ left: `${t.at[0]}%`, top: `${t.at[1]}%`, '--i': i, ...aim(t.at) }}>{t.t}</span>
        ))}
      </div>
    </div>
  );
}

function Card({ s, n }) {
  return (
    <div className="dc-card" key={s.key}>
      <p className="dc-eyebrow">{s.mark && <ProductMark p={s.mark} size={22} />}{s.tag}</p>
      <h3 className="dc-h">{s.h}</h3>
      {s.p && <p className="dc-p">{s.p}</p>}
      {s.threats && <ul className="dc-chips">{THREATS.map((t) => <li key={t.t}>{t.t}</li>)}</ul>}
      {s.rows && (
        <dl className="dc-rows">
          {s.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      {s.code && (
        <div className="dc-code">
          {s.code.map((l) => <div key={l.join()}>{l.map((x, i) => <span key={i} className={cx(['allow', 'hold', 'block'].includes(x) && `d-${x}`)}>{x}</span>)}</div>)}
        </div>
      )}
      {s.ex && <p className="dc-ex"><span className={`d-${s.ex[0]}`}>{s.ex[0]}</span><span className="mono">{s.ex[1]}</span></p>}
      {s.foot && <p className="dc-foot">{s.foot}</p>}
      {s.to && <Link to={s.to} className="dc-link">{s.cta}<Icon name="ArrowRight" size={14} weight="bold" /></Link>}
      {n != null && <p className="dc-count mono">{String(n + 1).padStart(2, '0')} / 06</p>}
    </div>
  );
}

export default function Core() {
  const track = useRef(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const span = r.height - window.innerHeight;
        const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
        setStep(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length)));
      });
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, []);
  const go = (i) => {
    const el = track.current; if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (span * (i + 0.5)) / STEPS.length, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const s = STEPS[step];
  return (
    <section id="core" className="stage dark dc-sec" aria-labelledby="dc-h">
      {/* desktop: pinned, six steps */}
      <div ref={track} className="dc-track">
        <div className="dc-pin">
          <div className="wrap dc-grid">
            <div className="dc-head">
              <p className="eyebrow">Inside the Deep Algorithms core</p>
              <h2 id="dc-h" className="t-h2 mt-4 text-white">What we protect you from, layer by layer.</h2>
            </div>
            <div className="dc-left"><Card s={s} n={step} /></div>
            <div className="dc-stage"><Stack step={step} /></div>
            <ol className="dc-nav" aria-label="Core layers">
              {STEPS.map((x, i) => (
                <li key={x.key}><button type="button" onClick={() => go(i)} aria-current={i === step ? 'step' : undefined} className={cx(i === step && 'on')}><span className="mono">{String(i + 1).padStart(2, '0')}</span>{x.tag}</button></li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      {/* phones and reduced motion: the same story as a list */}
      <div className="wrap dc-list">
        <p className="eyebrow">Inside the Deep Algorithms core</p>
        <h2 className="t-h2 mt-4 text-white">What we protect you from, layer by layer.</h2>
        <div className="dc-mini" aria-hidden="true"><Stack step={5} /></div>
        <ol className="mt-8 grid gap-4">{STEPS.map((x, i) => <li key={x.key}><Card s={x} n={i} /></li>)}</ol>
      </div>
    </section>
  );
}
