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
      <div className="gx-bar">
        <span className="gx-title"><span className="gx-badge"><Shield /></span><span><b>Security posture</b><small>Every identity across your digital ecosystem, watched continuously</small></span></span>
        <span className="gx-live"><i />Live environment</span>
      </div>
      <div className="gx-body">
        <div className="gx-col">{SIDES.slice(0, 2).map((x) => <Side key={x.h} x={x} />)}</div>
        <div ref={stage} className="gx-stage">
          <canvas ref={canvas} className="gx-cv" aria-hidden="true" />
          <div className="gx-core" aria-hidden="true"><span /><span /><span /><i><Shield /></i></div>
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
