import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import ProductMark from '../components/ProductMark.jsx';
import { loadAnime } from './scene.js';
import { Arrow, useReveal } from './v5-top.jsx';

/* [02] Three products, one identity posture. Product names, offerings and
   capabilities are the company's own (nav.js, products.js, zenstra.ai).
   Zenstra is shown with its real console; adapID and ICMS with original 3D
   renders, never with invented interfaces. */
const PRODUCTS = [
  {
    key: 'zenstra', name: 'Zenstra AI', tag: 'AI agents',
    h: 'Secure every AI agent. Verify every intent.',
    p: 'Zenstra finds every AI agent and MCP server in your enterprise, gives each one an owner and scoped access, and checks every action against its task before it runs.',
    caps: [
      ['AI Discovery', 'Copilot, ChatGPT, Claude Code and Cursor on staff devices: the prompt, the tool call and the device seen together.', '/agentic-ai/agent-discovery'],
      ['Workflow Security', 'Every hop in an agent workflow checked against the task it was given, before the next step runs.', '/agentic-ai/runtime-enforcement'],
      ['Cloud Security', 'A gateway inside your cloud, in front of every MCP server, model and API your agents call.', '/agentic-ai/mcp-security'],
    ],
    to: '/agentic-ai/agentic-identity',
  },
  {
    key: 'adapid', name: 'adapID AI', tag: 'Human and machine identities',
    h: 'Identity security for people and machines.',
    p: 'Four products that see how every person and machine identity normally behaves, find the gaps attackers use, and act the moment behaviour changes.',
    caps: [
      ['Continuous Identity Risk Management', 'A live risk score for every person across Okta, Entra ID, Google and Microsoft 365, with step-up, hold or revoke.', '/adapid-ai'],
      ['NHI Security for AWS', 'Every IAM role, key and workload identity found, scored and compared with what it actually uses.', '/adapid-ai/nhi-security'],
      ['Identity Fraud Prevention', 'Mobile and internet banking, from login to payment: behaviour, device and SIM-swap signals, mule accounts.', '/adapid-ai/fraud-prevention'],
      ['Active Directory Security', 'Attack paths to Domain Admins, weak Kerberos settings and live abuse, found and closed.', '/ad-security'],
    ],
    to: '/adapid-ai',
  },
  {
    key: 'icms', name: 'ICMS Compliance Suite', tag: 'Personal data under the DPDP Act',
    h: 'Protect every piece of PII. Prove DPDPA compliance.',
    p: 'ICMS discovers and classifies personal data, masks it where it should not be seen, checks every access against purpose and consent, and keeps evidence ready for DPDPA 2023, RBI and SEBI.',
    caps: [
      ['Personal data discovery', 'PII found and classified across databases, file stores and SaaS.', '/dpdpa-compliance#discover'],
      ['Purpose and consent checks', 'Every access to personal data checked against why it is allowed.', '/dpdpa-compliance#consent'],
      ['Breach response in 72 hours', 'What was exposed, whose data it was, and the report the Data Protection Board expects.', '/dpdpa-compliance#breach'],
      ['Audit evidence', 'Evidence for DPDPA, RBI and SEBI, assembled continuously.', '/dpdpa-compliance#evidence'],
    ],
    to: '/dpdpa-compliance',
  },
];

function Visual({ k }) {
  if (k === 'zenstra') return (
    <div className="v5-prod-v">
      <div className="v5-shot" data-depth="1" style={{ right: 0, top: 0, width: '86%' }}><img src="/img/home/zenstra-overview.webp" alt="Zenstra console: security overview with agents governed, open detections, actions blocked and decisions per second." width="1400" height="875" loading="lazy" /></div>
      <div className="v5-shot" data-depth="2" style={{ left: 0, bottom: 0, width: '62%' }}><img src="/img/home/zenstra-investigation.webp" alt="Zenstra console: an investigation of one agent's detection." width="1400" height="875" loading="lazy" /></div>
      <span className="badge" style={{ left: '6%', top: '12%' }}><i />Every agent owned and scoped</span>
      <span className="badge" style={{ right: '4%', bottom: '14%' }}><i />Each action checked before it runs</span>
    </div>
  );
  return (
    <div className="v5-prod-v" style={{ display: 'grid', placeItems: 'center' }}>
      <img className="v5-render" src={`/img/home/${k}.webp`} alt="" width={k === "adapid" ? 1100 : 828} height={k === "adapid" ? 486 : 581} loading="lazy" />
      {k === 'adapid' ? <>
        <span className="badge" style={{ left: '2%', top: '14%' }}><i />People · Okta, Entra ID, Google, Microsoft 365</span>
        <span className="badge" style={{ right: '2%', top: '30%' }}><i />Machines · AWS and Active Directory</span>
        <span className="badge" style={{ left: '12%', bottom: '10%' }}><i />Banking · mobile and internet</span>
      </> : <>
        <span className="badge" style={{ left: '4%', top: '18%' }}><i />DPDP Act 2023</span>
        <span className="badge" style={{ right: '6%', top: '26%' }}><i />RBI and SEBI evidence</span>
        <span className="badge" style={{ left: '14%', bottom: '12%' }}><i />Purpose and consent, per access</span>
      </>}
    </div>
  );
}

export function Platform() {
  const ref = useRef(null);
  const [on, setOn] = useState(0);
  useReveal(ref);
  // a new product's text and picture arrive in sequence
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let a, cancelled = false;
    loadAnime().then(({ animate, stagger }) => {
      if (cancelled) return;
      const panel = el.querySelector('.v5-prod:not([hidden])');
      a = animate(panel.querySelectorAll('.v5-prod-t > *, .v5-shot, .v5-render, .badge'), { opacity: [0, 1], y: [18, 0], duration: 700, delay: stagger(60), ease: 'outQuart' });
    });
    return () => { cancelled = true; a?.revert?.(); };
  }, [on]);
  // the screens drift apart a little as the section scrolls
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = 0;
    const tick = () => { raf = 0; const b = el.getBoundingClientRect(); const p = Math.max(-1, Math.min(1, (b.top + b.height / 2 - innerHeight / 2) / innerHeight));
      el.querySelectorAll('.v5-shot').forEach((s) => { s.style.transform = `translate3d(0, ${(p * 24 * +s.dataset.depth).toFixed(1)}px, 0)`; }); };
    const on2 = () => { if (!raf) raf = requestAnimationFrame(tick); };
    addEventListener('scroll', on2, { passive: true }); tick();
    return () => { removeEventListener('scroll', on2); cancelAnimationFrame(raf); };
  }, []);

  const keys = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const n = (on + (e.key === 'ArrowRight' ? 1 : PRODUCTS.length - 1)) % PRODUCTS.length;
      setOn(n); ref.current.querySelectorAll('[role=tab]')[n].focus();
    }
  };
  return (
    <section id="platform" ref={ref} className="v5-sheet dark grid v5-pad scroll-mt-20" data-hdr="dark" aria-labelledby="platform-h">
      <div className="v5-wrap">
        <div className="v5-head v5-rv">
          <div>
            <p className="v5-k">[02] The platform</p>
            <h2 id="platform-h" className="v5-h2">Three products. <em>One identity posture.</em></h2>
          </div>
          <p className="v5-lead">Each product secures one kind of identity risk. Together they share one inventory, one policy engine and one decision record, so you can start where your risk is highest and add the rest when you are ready.</p>
        </div>
        <div className="v5-tabs v5-rv" role="tablist" aria-label="Products" onKeyDown={keys}>
          {PRODUCTS.map((p, i) => (
            <button key={p.key} type="button" role="tab" id={`pt-${p.key}`} aria-controls={`pp-${p.key}`} aria-selected={i === on} tabIndex={i === on ? 0 : -1} onClick={() => setOn(i)}>
              <ProductMark p={p.key} size={28} />{p.name}
            </button>
          ))}
        </div>
        {PRODUCTS.map((p, i) => (
          <div key={p.key} className="v5-prod" role="tabpanel" id={`pp-${p.key}`} aria-labelledby={`pt-${p.key}`} hidden={i !== on}>
            <div className="v5-prod-t">
              <p className="v5-prod-id">{p.tag}</p>
              <h3 className="v5-h3" style={{ fontSize: 'clamp(28px, 2.8vw, 40px)', letterSpacing: '-.035em' }}>{p.h}</h3>
              <p className="v5-p">{p.p}</p>
              <ul className="v5-caps">
                {p.caps.map(([n, t, to]) => <li key={n}><b>{n}</b><span>{t}</span><Link to={to} aria-label={n}><Arrow /></Link></li>)}
              </ul>
              <Link to={p.to} className="v5-link" style={{ color: '#fff' }}>Explore {p.name} <Arrow /></Link>
              {p.key === 'zenstra' && <p className="v5-note">Screens: the Zenstra console, as shown on zenstra.ai.</p>}
            </div>
            <Visual k={p.key} />
          </div>
        ))}
      </div>
    </section>
  );
}
