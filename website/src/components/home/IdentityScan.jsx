import { useEffect, useRef, useState } from 'react';
import { Gl, Logo } from '../viz/kit.jsx';
import { cx } from '../ui.jsx';

/* ---------------- Home hero: continuous discovery ----------------
   The picture performs the headline. A scan crosses a dark field of
   identities; as it passes, each one resolves into what it is: a person, a
   machine identity or an AI agent, with where it lives. The ones that carry
   risk are flagged in red, then contained, and the counts of everything
   found rise underneath. It loops while on screen, rests on its last frame
   for reduced motion and on the server, and pauses off screen.
   Names, counts and findings are illustrative. */

const KIND = {
  human: { g: 'user', c: '#5fd0ff', label: 'Human' },
  machine: { g: 'key', c: '#7aa8ff', label: 'Machine' },
  agent: { g: 'agent', c: '#a9b4ff', label: 'AI agent' },
};

/* x, y in % of the field; risk: [what the scan found, what Deep Algorithms did] */
const IDS = [
  { k: 'human', n: 'Priya Nair', s: 'Treasury', app: 'okta', x: 9, y: 20, mob: [27, 10], risk: ['New device, Lagos', 'Step-up sent'] },
  { k: 'machine', n: 'svc-backup', s: 'Active Directory', app: 'ad', x: 15, y: 62, mob: [30, 76], risk: ['Path to Domain Admins', 'Path closed'] },
  { k: 'agent', n: 'invoice-agent', s: 'Copilot Studio', app: 'copilotstudio', x: 29, y: 38, mob: [34, 43] },
  { k: 'human', n: 'Arjun Mehta', s: 'Engineering', app: 'entra', x: 33, y: 78, m: true },
  { k: 'machine', n: 'AKIA••7Q2F', s: 'deploy-bot · AWS', app: 'aws', x: 45, y: 14, mob: [70, 27], mono: true, risk: ['Admin key, unused 94 days', 'Key revoked'] },
  { k: 'agent', n: 'lead-enricher', s: 'Zapier', app: 'zapier', x: 50, y: 56, mob: [69, 60], risk: ['Shadow AI, no owner', 'Owner assigned'] },
  { k: 'machine', n: 'payments-api', s: 'Kubernetes', app: 'kubernetes', x: 63, y: 32, m: true },
  { k: 'human', n: 'Kavya Reddy', s: 'HR', app: 'google', x: 66, y: 80 },
  { k: 'agent', n: 'kb-sync', s: 'MCP server', app: 'mcp', x: 77, y: 52, risk: ['Tool definition changed', 'Version pinned'] },
  { k: 'agent', n: 'release-agent', s: 'Cursor', app: 'cursor', x: 82, y: 17, m: true },
  { k: 'machine', n: 'github-actions', s: 'OIDC role', app: 'github', x: 90, y: 74, m: true },
];

const LOOP = 12000;      // one full pass, ms
const SWEEP = 0.56;      // share of the loop the scan takes to cross
const FLAG = 0.06;       // a found risk turns red this long after the scan passes
const FIX = 0.66;        // everything flagged is contained from here
const OUT = 0.95;        // and the field clears from here

const TOTALS = [['Humans', 3412, 'human'], ['Machines', 12708, 'machine'], ['AI agents', 64, 'agent']];
const fmt = (n) => n.toLocaleString('en-IN');

export default function IdentityScan() {
  const box = useRef(null);
  const cvs = useRef(null);
  const [p, setP] = useState(0.9); // server and first paint: the finished picture
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = 0; let on = true; let t0 = performance.now(); let last = -1;
    const io = new IntersectionObserver(([e]) => { on = e.isIntersecting; if (on) { t0 = performance.now() - (last < 0 ? 0 : last * LOOP); tick(); } }, { threshold: 0.05 });
    io.observe(el);
    setLive(true);
    const ctx = cvs.current?.getContext('2d');
    const dots = [];
    for (let r = 0; r < 15; r++) for (let c = 0; c < 46; c++) dots.push([c / 45, r / 14, Math.random()]);
    const draw = (q) => {
      if (!ctx) return;
      const c = cvs.current; const w = c.clientWidth; const h = c.clientHeight; const d = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(w * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
      ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, h);
      const bx = Math.min(1, q / SWEEP);
      for (const [u, v, j] of dots) {
        // a floor that recedes: rows bunch toward the top
        const yy = Math.pow(v, 1.6) * h; const spread = 0.62 + 0.38 * Math.pow(v, 1.6);
        const xx = (0.5 + (u - 0.5) * spread) * w;
        const near = q < SWEEP + 0.02 ? Math.max(0, 1 - Math.abs(xx / w - bx) * 9) : 0;
        const seen = xx / w < bx || q >= SWEEP;
        const a = (0.07 + 0.1 * v) + (seen ? 0.08 : 0) + near * 0.55 + j * 0.04;
        ctx.fillStyle = near > 0.05 ? `rgba(120,210,255,${a})` : `rgba(170,200,240,${a})`;
        ctx.beginPath(); ctx.arc(xx, yy, 0.8 + v * 0.9 + near * 1.2, 0, 6.283); ctx.fill();
      }
    };
    let acc = 0;
    function tick(now = performance.now()) {
      if (!on) return;
      const q = ((now - t0) % LOOP) / LOOP;
      el.style.setProperty('--scan', String(Math.min(1, q / SWEEP)));
      el.style.setProperty('--beam', q < SWEEP + 0.02 ? '1' : '0');
      draw(q);
      if (now - acc > 90) { acc = now; last = q; setP(q); } // the labels move in coarse steps; the beam and dots every frame
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { on = false; cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  const scanX = Math.min(1, p / SWEEP) * 100;
  const fixed = p >= FIX && p < OUT;
  const fading = p >= OUT;
  const found = (x) => scanX >= x || p >= SWEEP;
  const count = (frac) => Math.round(frac * Math.min(1, p / SWEEP));
  const flagged = IDS.filter((d) => d.risk && found(d.x) && p - (d.x / 100) * SWEEP > FLAG).length;

  return (
    <div ref={box} className={cx('iscan', live && 'is-live', fading && 'is-out')} style={{ '--scan': Math.min(1, p / SWEEP) }} role="img"
      aria-label="Illustration: a continuous scan discovers people, machine identities and AI agents across identity providers, clouds and AI platforms. It flags a sign-in from a new device, a path to Domain Admins, an unused admin key, a shadow AI agent with no owner and a changed MCP tool, then contains each one.">
      <canvas ref={cvs} className="iscan-dots" aria-hidden="true" />
      <div className="iscan-beam" aria-hidden="true" />
      <div className="iscan-field" aria-hidden="true">
        {IDS.map((d) => {
          const K = KIND[d.k];
          const on = found(d.x);
          const hot = d.risk && on && p - (d.x / 100) * SWEEP > FLAG;
          return (
            <div key={d.n} className={cx('iscan-id', on && 'on', hot && !fixed && 'hot', hot && fixed && 'ok', d.m && 'iscan-m', !d.mob && 'iscan-nomob')} style={{ left: `${d.x}%`, top: `${d.y}%`, '--k': K.c, ...(d.mob ? { '--mx': `${d.mob[0]}%`, '--my': `${d.mob[1]}%` } : null) }}>
              <span className="iscan-dot" />
              <span className="iscan-chip">
                <span className="iscan-ic"><Gl g={K.g} /></span>
                <span className="min-w-0">
                  <span className={cx('iscan-n', d.mono && 'mono')}>{d.n}</span>
                  <span className="iscan-s"><Logo k={d.app} size="1.05em" />{d.s}</span>
                </span>
                <span className="iscan-kind">{K.label}</span>
              </span>
              {d.risk && <span className="iscan-risk">{fixed ? d.risk[1] : d.risk[0]}</span>}
            </div>
          );
        })}
      </div>
      <div className="iscan-bar" aria-hidden="true">
        <span className="iscan-live"><i />Continuous discovery</span>
        {TOTALS.map(([l, n, k]) => (
          <span key={l} className="iscan-tot" style={{ '--k': KIND[k].c }}><b className="num">{fmt(count(n))}</b>{l}</span>
        ))}
        <span className={cx('iscan-tot iscan-risks', flagged > 0 && !fixed && 'hot', fixed && 'ok')}><b className="num">{flagged}</b>{fixed ? 'risks contained' : 'risks found'}</span>
      </div>
    </div>
  );
}
