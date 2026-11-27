import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Brand } from '../components/Dash.jsx';

/* Our three products on one deep blue card. Behind the cards, a scene of
   frosted glass tiles for the product in focus; the light behind it shifts
   colour as the reader moves between products, and the card in focus
   widens to say more. The light is a canvas; the tiles are HTML in 3D.
   Reduced motion keeps the still scene. */

const P = [
  {
    key: 'adapid', name: 'adapID AI', to: '/adapid-ai', short: 'Secure every human and machine identity.',
    long: 'Continuous risk scoring for people, service accounts and keys across your identity provider, cloud and SaaS, with step-up, hold and revoke in seconds.',
    glow: [[20, 90, 255], [0, 170, 255], [70, 40, 200]],
    tiles: [['entra', 'Entra ID'], ['okta', 'Okta'], ['aws', 'AWS IAM']], pill: 'Risk 91 · step-up sent',
  },
  {
    key: 'zenstra', name: 'Zenstra AI', to: '/agentic-ai/agentic-identity', short: 'Secure the agentic enterprise.',
    long: 'Find every AI agent, give it an owner and a scope, and check every tool call before it runs, from a gateway inside your VPC.',
    glow: [[60, 40, 230], [150, 70, 255], [255, 110, 60]],
    tiles: [['claude', 'Claude'], ['microsoft', 'Copilot Studio'], ['n8n', 'n8n']], pill: 'Tool call blocked · outside task',
  },
  {
    key: 'icms', name: 'ICMS', to: '/dpdpa-compliance', short: 'Protect personal data, prove DPDPA.',
    long: 'Find PII wherever it lives, check every access against consent and purpose, and keep audit evidence ready for the 72-hour window.',
    glow: [[10, 80, 220], [0, 190, 200], [40, 120, 255]],
    tiles: [['postgresql', 'Core banking'], ['snowflake', 'Data lake'], ['googledrive', 'Shared drives']], pill: 'Aadhaar masked · consent valid',
  },
];

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
    const size = () => { dpr = Math.min(2, devicePixelRatio || 1); w = el.clientWidth; h = el.clientHeight; c.width = w * dpr; c.height = h * dpr; c.style.width = `${w}px`; c.style.height = `${h}px`; };
    const blob = (x, y, r, [R, G, B], a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${R},${G},${B},${a})`); g.addColorStop(1, `rgba(${R},${G},${B},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); };
    const draw = (t) => {
      const goal = P[want.current].glow;
      cur.forEach((col, i) => col.forEach((v, k) => { col[k] = v + (goal[i][k] - v) * 0.04; }));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#050b3a'; ctx.fillRect(0, 0, w, h);
      const s = Math.sin(t * 0.0003), q = Math.cos(t * 0.00023);
      blob(w * (0.62 + 0.05 * s), h * (0.45 + 0.05 * q), Math.max(w, h) * 0.75, cur[0], 0.95);
      blob(w * (0.88 - 0.04 * q), h * 0.15, w * 0.45, cur[1], 0.55);
      blob(w * (0.05 + 0.04 * s), h * 1.0, w * 0.5, cur[2], 0.65);
      blob(w * 0.15, h * 0.05, w * 0.35, [10, 10, 60], 0.8);
    };
    const loop = (t) => { raf = requestAnimationFrame(loop); if (!vis || document.hidden) return; draw(t); };
    size(); for (let i = 0; i < 60; i++) draw(0);
    const ro = new ResizeObserver(() => { size(); draw(performance.now()); }); ro.observe(el);
    const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; }); io.observe(el);
    if (!reduce) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  useEffect(() => {
    if (!cv.current) return;
    // reduced motion: redraw once at the new colours
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) window.dispatchEvent(new Event('resize'));
  }, [on]);

  return (
    <section className="pk-sec" aria-labelledby="pk-h">
      <div className="wrap">
        <div ref={box} className="pk">
          <canvas ref={cv} className="pk-cv" aria-hidden="true" />
          {P.map((p, i) => (
            <div key={p.key} className={`pk-scene${i === on ? ' on' : ''}`} aria-hidden="true">
              <div className="pk-tilt">
                <span className="pk-pill"><img src={`/brand/products/${p.key}.webp`} alt="" width="20" height="20" />{p.pill}</span>
                {p.tiles.map(([k, t], j) => <span key={t} className={`pk-tile t${j}`}><Brand k={k} s={34} /><b>{t}</b></span>)}
              </div>
            </div>
          ))}
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
                  <span className="pk-go" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
