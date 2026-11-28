import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Brand } from '../components/Dash.jsx';

/* Our three products on one lit card, after Okta's "Transform your identity"
   card. Behind the frosted cards sits a detailed isometric scene for the
   product in focus: its own screens, chips and tiles, drawn in HTML on a
   tilted plane. A canvas paints the light behind it, and the light moves to
   that product's colours. The card in focus widens and says more.
   Everything in the scene is decoration (aria-hidden); the cards carry the
   words and links. Reduced motion keeps the still scene. */

const P = [
  {
    key: 'adapid', name: 'adapID AI', to: '/adapid-ai', cta: 'Explore adapID AI',
    short: 'Secure every human and machine identity.',
    long: 'Continuous risk scoring for people, service accounts and keys across your identity provider, cloud and SaaS, with step-up, hold and revoke in seconds.',
    // base, main glow, second glow, corner glow
    glow: [[6, 14, 120], [30, 60, 255], [255, 96, 24], [120, 40, 200]],
  },
  {
    key: 'zenstra', name: 'Zenstra AI', to: '/agentic-ai/agentic-identity', cta: 'Explore Zenstra AI',
    short: 'Secure the agentic enterprise.',
    long: 'Find every AI agent, give it an owner and a scope, and check every tool call before it runs, from a gateway inside your VPC.',
    glow: [[20, 6, 70], [90, 30, 220], [200, 40, 200], [40, 20, 160]],
  },
  {
    key: 'icms', name: 'ICMS', to: '/dpdpa-compliance', cta: 'Explore ICMS',
    short: 'Protect personal data, prove DPDPA.',
    long: 'Find PII wherever it lives, check every access against consent and purpose, and keep audit evidence ready for the 72-hour window.',
    glow: [[4, 16, 130], [20, 70, 255], [240, 70, 60], [40, 110, 255]],
  },
];

/* ---------- the three scenes ---------- */

function Risk({ v }) {
  const c = v >= 80 ? 'crit' : v >= 50 ? 'high' : 'low';
  return <span className={`pk-risk ${c}`}>{v}</span>;
}

function AdapScene() {
  return (
    <>
      <div className="pk-p paper p1" style={{ '--x': '40px', '--y': '120px', '--w': '520px', '--z': 0 }}>
        <div className="pk-ph"><b>Identities at risk</b><span className="pk-mut">Live · 14,208 watched</span></div>
        <div className="pk-tr pk-th"><span>Identity</span><span>Type</span><span>Source</span><span>Risk</span></div>
        <div className="pk-tr"><span>j.mehta</span><span>Person</span><span><Brand k="entra" s={18} /></span><span><Risk v={12} /></span></div>
        <div className="pk-tr hot"><span>svc-payments</span><span>Service acct</span><span><Brand k="aws" s={18} /></span><span><Risk v={91} /></span></div>
        <div className="pk-tr"><span>ci-deploy-key</span><span>API key</span><span><Brand k="github" s={18} /></span><span><Risk v={64} /></span></div>
        <div className="pk-tr"><span>a.rao</span><span>Person</span><span><Brand k="okta" s={18} /></span><span><Risk v={8} /></span></div>
      </div>
      <span className="pk-chip p2" style={{ '--x': '60px', '--y': '70px', '--z': 40 }}>Analyst</span>
      <span className="pk-chip p2" style={{ '--x': '240px', '--y': '46px', '--z': 40 }}>Investigate svc-payments</span>
      <div className="pk-p paper p3" style={{ '--x': '620px', '--y': '150px', '--w': '400px', '--z': 0 }}>
        <div className="pk-ph"><b>svc-payments</b><span className="pk-mut">Service account</span></div>
        <div className="pk-big"><Risk v={91} /><span>Token used from a new country, 4 min after a key change</span></div>
        <div className="pk-row"><span>Hold active sessions</span><i className="pk-tog on" /></div>
        <div className="pk-row"><span>Rotate access key</span><i className="pk-tog on" /></div>
        <div className="pk-row"><span>Notify owner · Payments team</span><i className="pk-tog" /></div>
      </div>
      <span className="pk-chip p4" style={{ '--x': '820px', '--y': '100px', '--z': 46 }}>Owner</span>
      <span className="pk-chip glow p4" style={{ '--x': '700px', '--y': '505px', '--z': 60 }}>Session held · 2.4 s</span>
    </>
  );
}

function ZenScene() {
  return (
    <>
      <div className="pk-p dark p1" style={{ '--x': '40px', '--y': '140px', '--w': '560px', '--z': 0 }}>
        <div className="pk-ph"><b>Agent gateway</b><span className="pk-mut">Inside your VPC</span></div>
        <div className="pk-call"><Brand k="claude" s={18} /><span>crm.read_contacts</span><em className="ok">Allowed</em></div>
        <div className="pk-call"><Brand k="n8n" s={18} /><span>sheets.update_row</span><em className="ok">Allowed</em></div>
        <div className="pk-call bad"><Brand k="microsoft" s={18} /><span>email.send_bulk</span><em className="no">Blocked · outside task</em></div>
        <div className="pk-call"><Brand k="claude" s={18} /><span>jira.create_issue</span><em className="ok">Allowed</em></div>
      </div>
      <span className="pk-chip p2" style={{ '--x': '70px', '--y': '86px', '--z': 40 }}>Security team</span>
      <span className="pk-chip p2" style={{ '--x': '280px', '--y': '60px', '--z': 40 }}>Register AI agent</span>
      <div className="pk-orb p3" style={{ '--x': '650px', '--y': '120px', '--z': 70 }}>
        <img src="/brand/products/zenstra.webp" alt="" width="84" height="84" />
      </div>
      <div className="pk-p dark p4" style={{ '--x': '660px', '--y': '330px', '--w': '330px', '--z': 0 }}>
        <div className="pk-row"><span>Owner assigned</span><i className="pk-tog on" /></div>
        <div className="pk-row"><span>Scoped to its task</span><i className="pk-tog on" /></div>
        <div className="pk-row"><span>Kill switch armed</span><i className="pk-tog on" /></div>
      </div>
    </>
  );
}

function IcmsScene() {
  return (
    <>
      <div className="pk-phone p1" style={{ '--x': '110px', '--y': '0px', '--z': 10 }}>
        <div className="pk-screen">
          <img src="/brand/products/icms.webp" alt="" width="40" height="40" />
          <b>Consent for KYC</b>
          <span className="pk-mut">Purpose: account opening</span>
          <span className="pk-field">Aadhaar · last 4 only</span>
          <span className="pk-field">PAN</span>
          <span className="pk-btn">Allow</span>
          <span className="pk-link">Decline</span>
        </div>
      </div>
      <div className="pk-p paper p2" style={{ '--x': '480px', '--y': '20px', '--w': '380px', '--z': 0 }}>
        <div className="pk-ph"><b>Personal data found</b></div>
        <div className="pk-pii"><Brand k="postgresql" s={18} /><span>Core banking</span><em>Aadhaar</em><em>PAN</em></div>
        <div className="pk-pii"><Brand k="snowflake" s={18} /><span>Data lake</span><em>Mobile</em><em>Email</em></div>
        <div className="pk-pii warn"><Brand k="googledrive" s={18} /><span>kyc_export.csv</span><em>Aadhaar</em></div>
      </div>
      <div className="pk-p paper p3" style={{ '--x': '640px', '--y': '300px', '--w': '330px', '--z': 0 }}>
        <div className="pk-ph"><b>Breach window</b><span className="pk-mut">DPDPA</span></div>
        <div className="pk-clock">56:12<small>hours left</small></div>
        <div className="pk-bar"><i /></div>
      </div>
      <span className="pk-chip p4" style={{ '--x': '470px', '--y': '-30px', '--z': 40 }}>DPO</span>
      <span className="pk-chip glow p4" style={{ '--x': '300px', '--y': '330px', '--z': 70 }}>Masked for all but KYC team</span>
    </>
  );
}

const SCENES = { adapid: AdapScene, zenstra: ZenScene, icms: IcmsScene };

export default function Platforms() {
  const [on, setOn] = useState(0);
  const cv = useRef(null), box = useRef(null), want = useRef(0);
  want.current = on;

  useEffect(() => {
    const c = cv.current, el = box.current;
    if (!c || !el) return undefined;
    const ctx = c.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1, raf = 0, vis = true;
    const cur = P[0].glow.map((x) => [...x]);
    const size = () => {
      dpr = Math.min(2, devicePixelRatio || 1); w = el.clientWidth; h = el.clientHeight;
      c.width = w * dpr; c.height = h * dpr; c.style.width = `${w}px`; c.style.height = `${h}px`;
      el.style.setProperty('--k', Math.min(0.74, Math.max(0.4, w / 1800)).toFixed(3));
    };
    const blob = (x, y, r, [R, G, B], a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${R},${G},${B},${a})`); g.addColorStop(0.55, `rgba(${R},${G},${B},${a * 0.45})`); g.addColorStop(1, `rgba(${R},${G},${B},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    };
    const step = (k) => { const goal = P[want.current].glow; cur.forEach((col, i) => col.forEach((v, j) => { col[j] = v + (goal[i][j] - v) * k; })); };
    const draw = (t) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const [b] = cur;
      ctx.fillStyle = `rgb(${b[0] | 0},${b[1] | 0},${b[2] | 0})`; ctx.fillRect(0, 0, w, h);
      const s = Math.sin(t * 0.00025), q = Math.cos(t * 0.00019), m = Math.max(w, h);
      blob(w * (0.55 + 0.06 * s), h * (0.42 + 0.06 * q), m * 0.8, cur[1], 0.95);   // main light
      blob(w * (0.92 - 0.05 * q), h * (0.95 + 0.04 * s), m * 0.55, cur[2], 0.9);   // warm corner
      blob(w * (0.02 + 0.05 * s), h * (1.02), m * 0.45, cur[3], 0.7);              // second corner
      blob(w * 0.1, h * 0.0, m * 0.45, [2, 4, 40], 0.85);                          // dark top left
    };
    const loop = (t) => { raf = requestAnimationFrame(loop); if (!vis || document.hidden) return; step(0.035); draw(t); };
    size(); step(1); draw(0);
    const ro = new ResizeObserver(() => { size(); draw(performance.now()); }); ro.observe(el);
    const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; }); io.observe(el);
    if (!reduce) raf = requestAnimationFrame(loop);
    // reduced motion: jump straight to the new colours when the focus moves
    const jump = () => { step(1); draw(0); };
    el.addEventListener('pk-jump', jump);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); el.removeEventListener('pk-jump', jump); };
  }, []);

  useEffect(() => {
    if (box.current && window.matchMedia('(prefers-reduced-motion: reduce)').matches) box.current.dispatchEvent(new Event('pk-jump'));
  }, [on]);

  // a slight tilt toward the pointer, like a print held to the light
  const tilt = (e) => {
    const el = box.current; if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };

  return (
    <section className="pk-sec" aria-labelledby="pk-h">
      <div className="wrap">
        <div ref={box} className="pk" onPointerMove={tilt}>
          <canvas ref={cv} className="pk-cv" aria-hidden="true" />
          <div className="pk-stage" aria-hidden="true">
            {P.map((p, i) => {
              const S = SCENES[p.key];
              return (
                <div key={p.key} className={`pk-scene${i === on ? ' on' : ''}`} data-k={p.key}>
                  <div className="pk-plane"><S /></div>
                </div>
              );
            })}
          </div>
          <div className="pk-head">
            <h2 id="pk-h">Secure every identity across your business</h2>
            <p>Three products, one platform, built for your people, your machines and your AI agents.</p>
          </div>
          <ul className="pk-cards">
            {P.map((p, i) => (
              <li key={p.key} className={i === on ? 'on' : ''} onMouseEnter={() => setOn(i)}>
                <Link to={p.to} onFocus={() => setOn(i)}>
                  <h3><img src={`/brand/products/${p.key}.webp`} alt="" width="26" height="26" />{p.name}</h3>
                  <p className="pk-short">{p.short}</p>
                  <p className="pk-long">{p.long}</p>
                  <span className="pk-go"><span className="pk-cta">{p.cta}</span><span aria-hidden="true">→</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
