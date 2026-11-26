import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Gl } from '../components/viz/kit.jsx';

/* Continuous AI-SPM, as one picture: the digital ecosystem as a globe inside a
   protective field (WebGL, three.js, loaded only when on screen). Attacks
   arrive and are stopped at the field; each block is labelled where it lands
   and added to the live list. The four kinds of identity sit at the sides,
   one line each. */
const SIDES = [
  { g: 'user', h: 'People', p: 'Employees, contractors and customers', by: 'adapID AI', to: '/adapid-ai' },
  { g: 'key', h: 'Machine identities', p: 'Service accounts, cloud roles and keys', by: 'adapID AI', to: '/adapid-ai/nhi-security' },
  { g: 'bot', h: 'AI agents', p: 'Agents, copilots and MCP servers', by: 'Zenstra AI', to: '/agentic-ai/agentic-identity' },
  { g: 'db', h: 'Personal data', p: 'PII under the DPDP Act', by: 'ICMS', to: '/dpdpa-compliance' },
];
const Shield = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.6 3.4 8.4 8 9 4.6-.6 8-4.4 8-9V6l-8-3z" /><path d="m8.6 12 2.4 2.4 4.4-4.6" strokeLinecap="round" /></svg>;

function Side({ x }) {
  return (
    <Link to={x.to} className="gx-card">
      <span className="gx-ic"><Gl g={x.g} /></span>
      <span className="gx-ct"><b>{x.h}</b><small>{x.p}</small><em>{x.by}</em></span>
    </Link>
  );
}

export default function AispmGlobe() {
  const stage = useRef(null), canvas = useRef(null), labels = useRef(null), feed = useRef(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let g, cancelled = false, io;
    const onHit = (name, x, y) => {
      const lab = document.createElement('span');
      lab.className = 'gx-hit'; lab.style.left = `${x}px`; lab.style.top = `${y}px`;
      lab.innerHTML = `<i></i>${name}<b>Blocked</b>`;
      labels.current.appendChild(lab);
      setTimeout(() => lab.remove(), 2400);
      const li = document.createElement('li'); li.innerHTML = `<i></i><span>${name}</span><b>Blocked</b>`;
      const f = feed.current; f.prepend(li); while (f.children.length > 3) f.lastChild.remove();
    };
    const boot = () => import('./ThreatGlobe.js').then(({ createGlobe }) => {
      if (cancelled) return;
      try { g = createGlobe(canvas.current, { onHit, reduced }); } catch { el.classList.add('no-gl'); return; }
      el.classList.add('live');
      if (io) io.disconnect();
      io = new IntersectionObserver(([e]) => (e.isIntersecting ? g.start() : g.stop()), { threshold: 0.05 });
      io.observe(el);
    });
    // load three.js only when the globe comes near the screen
    const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { near.disconnect(); boot(); } }, { rootMargin: '300px' });
    near.observe(el);
    return () => { cancelled = true; near.disconnect(); io?.disconnect(); g?.destroy(); };
  }, []);

  return (
    <figure className="gx" aria-label="Animation: your digital ecosystem as a globe inside a protective field. Attacks such as stolen credentials, phishing, MFA fatigue, compromised sessions, deepfake voices, prompt injection and hijacked AI agents arrive and are blocked at the field.">
      <span className="gx-live gx-live-float"><i />Live environment</span>
      <div className="gx-body">
        <div className="gx-col">{SIDES.slice(0, 2).map((x) => <Side key={x.h} x={x} />)}</div>
        <div ref={stage} className="gx-stage">
          <canvas ref={canvas} className="gx-cv" aria-hidden="true" />
          <svg className="gx-core" viewBox="-120 -120 240 240" aria-hidden="true">
            <defs>
              <radialGradient id="gxc-disc" cx="50%" cy="42%" r="60%"><stop offset="0" stopColor="#123a86" /><stop offset=".7" stopColor="#081a44" /><stop offset="1" stopColor="#050f2a" /></radialGradient>
              <radialGradient id="gxc-halo"><stop offset=".45" stopColor="#2f7dff" stopOpacity=".55" /><stop offset="1" stopColor="#2f7dff" stopOpacity="0" /></radialGradient>
              <filter id="gxc-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <circle r="118" fill="url(#gxc-halo)" />
            <circle className="gxc-pulse" r="104" fill="none" stroke="#4d9bff" strokeWidth="1.5" opacity=".7" />
            <circle r="96" fill="none" stroke="#3d8bff" strokeWidth="1.6" filter="url(#gxc-glow)" />
            <circle r="76" fill="none" stroke="#5aa8ff" strokeWidth="7" filter="url(#gxc-glow)" />
            <circle r="76" fill="none" stroke="#0a1f4d" strokeWidth="7" strokeDasharray="60 418" transform="rotate(-70)" opacity=".85" />
            <circle r="60" fill="url(#gxc-disc)" stroke="#9fd6ff" strokeWidth="2.2" filter="url(#gxc-glow)" />
            <g filter="url(#gxc-glow)" fill="none" strokeLinejoin="round">
              <path d="M0 -30 L-23 -21 V-2 C-23 15 -12 26 0 31 C12 26 23 15 23 -2 V-21 Z" stroke="#e8f5ff" strokeWidth="3.4" />
              <path d="M0 -19 L-14 -13 V-1 C-14 9 -7 16 0 19 C7 16 14 9 14 -1 V-13 Z" stroke="#9fd6ff" strokeWidth="2.4" />
            </g>
          </svg>
          <div ref={labels} className="gx-labels" aria-hidden="true" />
        </div>
        <div className="gx-col">{SIDES.slice(2).map((x) => <Side key={x.h} x={x} />)}</div>
      </div>
      <div className="gx-foot">
        <p>AI-driven threats, stopped at the edge</p>
        <ul ref={feed} className="gx-feed" aria-hidden="true">
          <li><i /><span>Phishing</span><b>Blocked</b></li>
          <li><i /><span>MFA fatigue</span><b>Blocked</b></li>
          <li><i /><span>Prompt injection</span><b>Blocked</b></li>
        </ul>
      </div>
    </figure>
  );
}
