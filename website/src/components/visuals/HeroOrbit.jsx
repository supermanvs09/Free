import { useEffect, useRef } from 'react';
import { useReducedMotion, useInView } from './kit.jsx';

/* Hero: the identity orbit. Three tilted rings around the Deep Algorithms
   mark carry people, machine identities and AI agents. A scan beam sweeps
   continuously; each risky identity it passes flips from risk (coral) to its
   fix (blue). Message: every identity, continuously checked. */
const W = 1200, H = 440, CX = 600, CY = 214, K = 0.40;
const RINGS = [
  { r: 175, speed: 0.045, label: 'People' },
  { r: 315, speed: -0.03, label: 'Machine identities' },
  { r: 460, speed: 0.022, label: 'AI agents' },
];
const CHIPS = [
  { ring: 0, a: 20, icon: 'user', ok: 'Treasury analyst', risk: 'New device at 23:47', fix: 'Step-up MFA' },
  { ring: 0, a: 150, icon: 'user', ok: 'Admin', risk: 'Contractor after exit', fix: 'Access revoked' },
  { ring: 0, a: 265, icon: 'user', ok: 'Customer ops' },
  { ring: 1, a: 55, icon: 'key', ok: 'IAM role', risk: 'Admin, 3% used', fix: 'Least privilege' },
  { ring: 1, a: 160, icon: 'key', ok: 'Service account' },
  { ring: 1, a: 230, icon: 'key', ok: 'API key', risk: 'Key 412 days old', fix: 'Key rotated' },
  { ring: 1, a: 320, icon: 'key', ok: 'OAuth app' },
  { ring: 2, a: 10, icon: 'agent', ok: 'Copilot agent', risk: 'Exporting customer data', fix: 'Blocked before execution' },
  { ring: 2, a: 105, icon: 'agent', ok: 'MCP server' },
  { ring: 2, a: 190, icon: 'agent', ok: 'n8n workflow', risk: 'Shadow agent, no owner', fix: 'Owner assigned' },
  { ring: 2, a: 285, icon: 'agent', ok: 'Claude agent' },
];
const SWEEP_MS = 9000;
const pillW = (s) => 30 + s.length * 6.9;
const initial = (c) => {
  const rad = (c.a * Math.PI) / 180;
  const depth = (Math.sin(rad) + 1) / 2;
  return { t: `translate(${(CX + RINGS[c.ring].r * Math.cos(rad)).toFixed(1)} ${(CY + RINGS[c.ring].r * K * Math.sin(rad)).toFixed(1)}) scale(${(0.82 + depth * 0.22).toFixed(3)})`, o: (0.55 + depth * 0.45).toFixed(2) };
};

const ICONS = {
  user: 'M8 8.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Zm-5.4 6c.5-2.7 2.8-4.4 5.4-4.4s4.9 1.7 5.4 4.4',
  key: 'M10.6 2.2a3.4 3.4 0 0 0-3.2 4.5L2.2 11.9V14h2.1v-1.4h1.4v-1.4h1.4l1.1-1.1a3.4 3.4 0 1 0 2.4-7.9Zm.9 3.4a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z',
  agent: 'M4 5.5h8a1.5 1.5 0 0 1 1.5 1.5v4.5A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 4 5.5Zm4-3.3v3.3M6 9h.01M10 9h.01',
};

function Chip({ c, idRef }) {
  const text = c.risk || c.ok;
  const p0 = initial(c);
  return (
    <g ref={idRef} data-state={c.risk ? 'risk' : 'ok'} transform={p0.t} style={{ opacity: p0.o }}>
      <rect className="pill" x={-pillW(text) / 2} y="-14" width={pillW(text)} height="28" rx="14" />
      <path className="ic" transform={`translate(${-pillW(text) / 2 + 9} -8)`} d={ICONS[c.icon]} fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <text className="tx" x={-pillW(text) / 2 + 29} y="4.5" fontSize="13">{text}</text>
    </g>
  );
}

export default function HeroOrbit() {
  const reduce = useReducedMotion();
  const box = useRef(null);
  const inView = useInView(box);
  const chipRefs = useRef([]);
  const beamRef = useRef(null);

  useEffect(() => {
    let raf;
    const start = performance.now();
    const flipped = new Map();
    const place = (now) => {
      const t = reduce ? 4200 : now - start;
      const sweep = ((t / SWEEP_MS) * 360) % 360;
      if (beamRef.current) beamRef.current.setAttribute('transform', `rotate(${sweep})`);
      CHIPS.forEach((c, i) => {
        const g = chipRefs.current[i];
        if (!g) return;
        const ring = RINGS[c.ring];
        const ang = (c.a + (t / 1000) * ring.speed * 57.3) % 360;
        const rad = (ang * Math.PI) / 180;
        const x = CX + ring.r * Math.cos(rad);
        const y = CY + ring.r * K * Math.sin(rad);
        const depth = (Math.sin(rad) + 1) / 2; // 0 back, 1 front
        const s = 0.82 + depth * 0.22;
        g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})`);
        g.style.opacity = (0.55 + depth * 0.45).toFixed(2);
        if (!c.risk) return;
        // Fixed as the beam passes; a new risk surfaces just before it comes round again.
        const rel = (((sweep - ((ang % 360) + 360) % 360) % 360) + 360) % 360;
        const isFixed = reduce ? i % 2 === 0 : rel < 290;
        const want = isFixed ? 'fix' : 'risk';
        if (flipped.get(i) !== want) {
          flipped.set(i, want);
          const txt = isFixed ? c.fix : c.risk;
          g.dataset.state = want;
          const w = pillW(txt);
          g.querySelector('.pill').setAttribute('x', -w / 2);
          g.querySelector('.pill').setAttribute('width', w);
          g.querySelector('.ic').setAttribute('transform', `translate(${-w / 2 + 9} -8)`);
          const tx = g.querySelector('.tx');
          tx.setAttribute('x', -w / 2 + 29);
          tx.textContent = txt;
        }
      });
      if (!reduce) raf = requestAnimationFrame(place);
    };
    if (reduce || inView) raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [reduce, inView]);

  return (
    <div ref={box} className="relative mx-auto w-full max-w-[1200px]">
      <style>{`
        .orbit [data-state="ok"] .pill { fill: #fff; stroke: #cfd6df; }
        .orbit [data-state="ok"] .ic { stroke: #6b7686; }
        .orbit [data-state="ok"] .tx { fill: #3f4a5a; }
        .orbit [data-state="risk"] .pill { fill: #fdebe7; stroke: #f0644d; }
        .orbit [data-state="risk"] .ic { stroke: #d9472f; }
        .orbit [data-state="risk"] .tx { fill: #b03a22; }
        .orbit [data-state="fix"] .pill { fill: #e6f3fb; stroke: #0068ac; }
        .orbit [data-state="fix"] .ic { stroke: #0068ac; }
        .orbit [data-state="fix"] .tx { fill: #06406b; }
        .orbit .pill, .orbit .tx, .orbit .ic { transition: fill .5s, stroke .5s; }
        .orbit text { font-family: 'Inter Variable', sans-serif; }
      `}</style>
      <div className="overflow-hidden">
      {/* ponytail: phones see the centre of the orbit at a readable size, outer chips crop */}
      <svg viewBox={`0 0 ${W} ${H}`} className="orbit -ml-[55%] h-auto w-[210%] max-w-none md:ml-0 md:w-full" role="img"
        aria-label="Animated illustration: people, machine identities and AI agents orbit the Deep Algorithms platform. A continuous scan turns each risk into a fix, such as key rotated, owner assigned and access revoked.">
        <defs>
          <radialGradient id="beam" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(470)">
            <stop offset="0" stopColor="#00aeef" stopOpacity=".28" />
            <stop offset="1" stopColor="#00aeef" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="edge" x1="0" x2="1"><stop offset="0" stopColor="#fff" /><stop offset=".12" stopColor="#fff" stopOpacity="0" /><stop offset=".88" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" /></linearGradient>
        </defs>
        {RINGS.map((r) => (
          <g key={r.r}>
            <ellipse cx={CX} cy={CY} rx={r.r} ry={r.r * K} fill="none" stroke="#cfd6df" strokeWidth="1" />
            <text x={CX - r.r - 10} y={CY + 4} textAnchor="end" fontSize="12" fill="#6b7686">{r.label}</text>
          </g>
        ))}
        <g transform={`translate(${CX} ${CY}) scale(1 ${K})`}>
          <g ref={beamRef}>
            <path d="M0 0 L470 0 A470 470 0 0 1 407 235 Z" fill="url(#beam)" />
            <line x1="0" y1="0" x2="470" y2="0" stroke="#00aeef" strokeOpacity=".55" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          </g>
        </g>
        {CHIPS.map((c, i) => <Chip key={c.ok} c={c} idRef={(el) => { chipRefs.current[i] = el; }} />)}
        <rect x="0" y="0" width={W} height={H} fill="url(#edge)" pointerEvents="none" />
        <g>
          <circle cx={CX} cy={CY} r="62" fill="#fff" opacity=".9" />
          <rect x={CX - 44} y={CY - 44} width="88" height="88" rx="22" fill="#fff" stroke="#cfd6df" />
          <image href="/brand/mark.png" x={CX - 25} y={CY - 26} width="50" height="52" />
        </g>
      </svg>
      </div>
    </div>
  );
}
