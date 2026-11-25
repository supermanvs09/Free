import { useEffect, useRef, useState } from 'react';
import { useReducedMotion, cx } from '../../lib/motion.js';
import { Icon } from '../ui.jsx';

/* AI-driven threats against every identity, drawn on a canvas.
   The enterprise lies on a perspective floor: people, customers, workloads,
   keys, AI agents and MCP servers around the Deep Algorithms core. A lattice
   dome of continuous posture turns slowly over all of them. Named threats
   arc in from outside as comets with light trails; each one meets the dome,
   bursts into a hexagonal ripple and sparks, its name is stamped "stopped"
   where it hit, and the decision lands in the log beside the scene.
   Off screen it sleeps; with reduced motion it draws one still frame.
   Sample decisions, illustrative timings. */

const IDS = [
  { k: 'Employee', icon: 'User', a: 210 },
  { k: 'Customer', icon: 'UserCircle', a: 270 },
  { k: 'Service account', icon: 'HardDrives', a: 330 },
  { k: 'API key', icon: 'Key', a: 30 },
  { k: 'AI agent', icon: 'Robot', a: 90 },
  { k: 'MCP server', icon: 'Plug', a: 150 },
];

const THREATS = [
  { k: 'AI-generated phishing', to: 0, d: 'Leaked credential flagged, risk raised', by: 'adapID AI' },
  { k: 'Prompt injection', to: 4, d: 'Injected instruction blocked before the tool ran', by: 'Zenstra AI' },
  { k: 'Deepfake voice', to: 0, d: 'Help-desk reset held for verification', by: 'adapID AI' },
  { k: 'Tool poisoning', to: 5, d: 'Changed tool server held for review', by: 'Zenstra AI' },
  { k: 'MFA fatigue', to: 1, d: 'Push flood detected, step-up enforced', by: 'adapID AI' },
  { k: 'Token theft', to: 3, d: 'Stolen key revoked in seconds', by: 'adapID AI' },
  { k: 'Agent hijacking', to: 4, d: 'Out-of-task action denied', by: 'Zenstra AI' },
  { k: 'Session hijacking', to: 1, d: 'Hijacked session ended', by: 'adapID AI' },
  { k: 'Privilege escalation', to: 2, d: 'Unused privilege removed', by: 'adapID AI' },
  { k: 'Data leakage to AI', to: 4, d: 'Secrets kept out of the prompt', by: 'Zenstra AI' },
];

const TAU = Math.PI * 2;

export default function ThreatDome() {
  const wrap = useRef(null);
  const cvs = useRef(null);
  const fly = useRef(null);
  const reduce = useReducedMotion();
  const [log, setLog] = useState([1, 0, 3]);
  const [count, setCount] = useState(1284);
  const [stamps, setStamps] = useState([]);
  const [geo, setGeo] = useState(null);

  useEffect(() => {
    const el = wrap.current; const c = cvs.current;
    if (!el || !c) return undefined;
    const ctx = c.getContext('2d');
    let W = 0, H = 0, dpr = 1, G = null;
    let raf = 0, running = false, last = 0, t = 0, nextSpawn = 0.6, seq = 0;
    const shots = []; const bursts = []; const sparks = [];

    const layout = () => {
      const r = el.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const narrow = W < 560;
      const R = Math.min(W * (narrow ? 0.4 : 0.31), H * 0.56);
      G = { cx: W / 2, cy: H * (narrow ? 0.7 : 0.74), R, sq: 0.34, narrow };
      // identity anchors on the floor
      G.ids = IDS.map((x) => {
        const a = (x.a * Math.PI) / 180;
        return { x: G.cx + Math.cos(a) * R * 0.78, y: G.cy + Math.sin(a) * R * 0.78 * G.sq };
      });
      setGeo({ W, H, ids: G.ids, cy: G.cy });
    };

    /* a point on the dome: theta around (0 = right), phi up from the floor */
    const dome = (th, ph, rot = 0) => {
      const a = th + rot; const cp = Math.cos(ph);
      return { x: G.cx + G.R * cp * Math.cos(a), y: G.cy - G.R * Math.sin(ph) * 0.92 + G.R * cp * Math.sin(a) * G.sq, z: Math.sin(a) };
    };

    const spawn = () => {
      const T = THREATS[seq % THREATS.length]; const n = seq++;
      const target = G.ids[T.to];
      // start outside the view, on a wide ring above the floor
      const side = (n % 2 ? 1 : -1);
      const sa = (side > 0 ? -0.35 : Math.PI + 0.35) + (Math.random() - 0.5) * 0.9;
      const sx = G.cx + Math.cos(sa) * (W * 0.62), sy = G.cy - G.R * (0.9 + Math.random() * 0.9) + Math.sin(sa) * 40;
      // aim at the target, through a control point high above
      const cxp = (sx + target.x) / 2 + (Math.random() - 0.5) * 80, cyp = Math.min(sy, target.y) - G.R * (0.55 + Math.random() * 0.3);
      // find where the path first meets the dome (sample the curve)
      let hitT = 0.92, hit = { x: target.x, y: target.y };
      for (let u = 0.02; u < 1; u += 0.01) {
        const x = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cxp + u * u * target.x;
        const y = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * cyp + u * u * target.y;
        const dx = (x - G.cx) / G.R, dy = (G.cy - y) / (G.R * 0.92);
        if (y < G.cy + 4 && dx * dx + dy * dy <= 1) { hitT = u; hit = { x, y }; break; }
      }
      let tag = null;
      if (fly.current) {
        tag = document.createElement('span'); tag.className = 'td-fly'; tag.textContent = T.k;
        fly.current.appendChild(tag);
      }
      shots.push({ T, n, sx, sy, cxp, cyp, tx: target.x, ty: target.y, u: 0, hitT, hit, trail: [], speed: 0.42 + Math.random() * 0.1, tag });
    };

    const draw = (dt) => {
      ctx.clearRect(0, 0, W, H);
      const { cx: X, cy: Y, R, sq } = G;
      const rot = t * 0.12;

      // floor: concentric ellipses and radial lines, slowly turning
      ctx.save();
      ctx.lineWidth = 1;
      for (let i = 1; i <= 6; i++) {
        const rr = R * (0.25 * i);
        ctx.strokeStyle = `rgba(120,190,255,${0.16 - i * 0.017})`;
        ctx.beginPath(); ctx.ellipse(X, Y, rr, rr * sq, 0, 0, TAU); ctx.stroke();
      }
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU + rot * 0.5;
        const g = ctx.createLinearGradient(X, Y, X + Math.cos(a) * R * 1.5, Y + Math.sin(a) * R * 1.5 * sq);
        g.addColorStop(0, 'rgba(120,190,255,.14)'); g.addColorStop(1, 'rgba(120,190,255,0)');
        ctx.strokeStyle = g;
        ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(a) * R * 1.5, Y + Math.sin(a) * R * 1.5 * sq); ctx.stroke();
      }
      ctx.restore();

      // links from the core to each identity, brightening when a threat targets it
      G.ids.forEach((p, i) => {
        const hot = shots.some((s) => s.T.to === i && s.u < s.hitT);
        ctx.strokeStyle = hot ? 'rgba(255,140,120,.55)' : 'rgba(127,214,255,.28)';
        ctx.lineWidth = hot ? 1.6 : 1;
        ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(p.x, p.y); ctx.stroke();
      });

      // core beam
      const beam = ctx.createLinearGradient(X, Y, X, Y - R * 0.92);
      beam.addColorStop(0, 'rgba(120,200,255,.65)'); beam.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = beam; ctx.fillRect(X - 1.5, Y - R * 0.92, 3, R * 0.92);
      const glow = ctx.createRadialGradient(X, Y, 0, X, Y, R * 0.5);
      glow.addColorStop(0, 'rgba(60,160,255,.55)'); glow.addColorStop(1, 'rgba(60,160,255,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(X, Y, R * 0.5, R * 0.5 * sq * 1.4, 0, 0, TAU); ctx.fill();

      // the dome lattice: back half first (dim), then front half (bright)
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const front of [false, true]) {
        // latitudes
        for (let j = 1; j <= 5; j++) {
          const ph = (j / 6) * (Math.PI / 2);
          ctx.beginPath();
          let started = false;
          for (let s = 0; s <= 72; s++) {
            const p = dome((s / 72) * TAU, ph, 0);
            const isFront = p.z > 0;
            if (isFront !== front) { started = false; continue; }
            if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
          }
          ctx.strokeStyle = front ? 'rgba(127,214,255,.34)' : 'rgba(127,214,255,.1)';
          ctx.lineWidth = front ? 1.1 : 0.8; ctx.stroke();
        }
        // longitudes
        for (let i = 0; i < 18; i++) {
          const th = (i / 18) * TAU;
          ctx.beginPath(); let started = false;
          for (let s = 0; s <= 24; s++) {
            const p = dome(th, (s / 24) * (Math.PI / 2), rot);
            if ((p.z > 0) !== front) { started = false; continue; }
            if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
          }
          ctx.strokeStyle = front ? 'rgba(127,214,255,.3)' : 'rgba(127,214,255,.08)';
          ctx.lineWidth = front ? 1 : 0.7; ctx.stroke();
        }
      }
      // rim of the dome on the floor
      ctx.strokeStyle = 'rgba(143,211,255,.75)'; ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(80,170,255,.9)'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.ellipse(X, Y, R, R * sq, 0, 0, TAU); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // threats: comets with trails
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.u = Math.min(s.hitT, s.u + dt * s.speed);
        const u = s.u;
        const x = (1 - u) * (1 - u) * s.sx + 2 * (1 - u) * u * s.cxp + u * u * s.tx;
        const y = (1 - u) * (1 - u) * s.sy + 2 * (1 - u) * u * s.cyp + u * u * s.ty;
        s.trail.push({ x, y }); if (s.trail.length > 34) s.trail.shift();
        if (s.tag) { s.tag.style.left = `${(x / W) * 100}%`; s.tag.style.top = `${(y / H) * 100}%`; }
        for (let k = 1; k < s.trail.length; k++) {
          const a = k / s.trail.length;
          ctx.strokeStyle = `rgba(255,${110 + a * 60},${90 + a * 30},${a * 0.85})`;
          ctx.lineWidth = 0.6 + a * 3;
          ctx.beginPath(); ctx.moveTo(s.trail[k - 1].x, s.trail[k - 1].y); ctx.lineTo(s.trail[k].x, s.trail[k].y); ctx.stroke();
        }
        const hg = ctx.createRadialGradient(x, y, 0, x, y, 16);
        hg.addColorStop(0, 'rgba(255,230,220,1)'); hg.addColorStop(0.3, 'rgba(255,110,90,.9)'); hg.addColorStop(1, 'rgba(255,90,70,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill();
        if (u >= s.hitT) {
          shots.splice(i, 1);
          if (s.tag) s.tag.remove();
          bursts.push({ x: s.hit.x, y: s.hit.y, age: 0 });
          for (let k = 0; k < 22; k++) { const a = Math.random() * TAU, v = 40 + Math.random() * 120; sparks.push({ x: s.hit.x, y: s.hit.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.6 + Math.random() * 0.5, age: 0 }); }
          const id = s.n;
          setStamps((st) => [...st.filter((q) => q.id > id - 4), { id, k: s.T.k, x: s.hit.x / W, y: s.hit.y / H }]);
          setLog((l) => [THREATS.indexOf(s.T), ...l].slice(0, 4));
          setCount((n) => n + 1);
        }
      }
      // bursts: hexagonal ripple on the dome where the threat was stopped
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]; b.age += dt;
        const k = b.age / 1.1; if (k >= 1) { bursts.splice(i, 1); continue; }
        for (let ring = 0; ring < 2; ring++) {
          const r = 8 + (k + ring * 0.18) * 70;
          ctx.strokeStyle = `rgba(143,211,255,${(1 - k) * (ring ? 0.5 : 0.95)})`; ctx.lineWidth = ring ? 1.2 : 2.4;
          ctx.beginPath();
          for (let h = 0; h <= 6; h++) { const a = (h / 6) * TAU + Math.PI / 6; const px = b.x + Math.cos(a) * r, py = b.y + Math.sin(a) * r * 0.62; h ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
          ctx.stroke();
        }
        const fg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 46);
        fg.addColorStop(0, `rgba(200,235,255,${(1 - k) * 0.9})`); fg.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(b.x, b.y, 46, 0, TAU); ctx.fill();
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]; p.age += dt; if (p.age > p.life) { sparks.splice(i, 1); continue; }
        p.vy += 120 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.fillStyle = `rgba(170,225,255,${1 - p.age / p.life})`;
        ctx.fillRect(p.x, p.y, 2, 2);
      }
      ctx.restore();
    };

    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; t += dt;
      nextSpawn -= dt;
      if (nextSpawn <= 0 && shots.length < 4) { spawn(); nextSpawn = 0.85 + Math.random() * 0.5; }
      draw(dt);
      if (running) raf = requestAnimationFrame(frame);
    };
    const start = () => { if (running || reduce) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    layout();
    if (reduce) {
      // one still frame: the dome, the floor and a few stopped threats
      draw(0);
      setStamps([{ id: 1, k: 'Prompt injection', x: 0.62, y: 0.4 }, { id: 2, k: 'AI-generated phishing', x: 0.36, y: 0.47 }, { id: 3, k: 'Token theft', x: 0.7, y: 0.6 }]);
    }
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.15 });
    io.observe(el);
    const ro = new ResizeObserver(() => { layout(); if (!running) draw(0); });
    ro.observe(el);
    return () => { stop(); io.disconnect(); ro.disconnect(); shots.forEach((q) => q.tag && q.tag.remove()); };
  }, [reduce]);

  return (
    <figure className="td" aria-label="Deep Algorithms keeps a continuous posture over every identity. AI-driven threats (AI-generated phishing, prompt injection, deepfake voice, tool poisoning, MFA fatigue, token theft, agent hijacking, session hijacking, privilege escalation and data leakage to AI) are each stopped before they reach an employee, customer, service account, API key, AI agent or MCP server.">
      <div ref={wrap} className="td-stage" aria-hidden="true">
        <canvas ref={cvs} className="td-cvs" />
        {geo && <span className="td-core" style={{ top: `${(geo.cy / geo.H) * 100}%` }}><img src="/brand/mark.webp" alt="" width="40" height="40" /></span>}
        {geo && geo.ids.map((p, i) => (
          <span key={IDS[i].k} className="td-id" style={{ left: `${(p.x / geo.W) * 100}%`, top: `${(p.y / geo.H) * 100}%` }}>
            <Icon name={IDS[i].icon} size={15} /><small>{IDS[i].k}</small>
          </span>
        ))}
        {stamps.map((s) => (
          <span key={s.id} className="td-stamp" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}>
            <Icon name="ShieldCheck" size={13} weight="fill" />{s.k}<em>stopped</em>
          </span>
        ))}
        <span ref={fly} className="td-flylayer" />
        <span className="td-hud tl">Continuous AI Security Posture</span>
        <span className="td-hud tr"><i />Live</span>
      </div>
      <figcaption className="td-log" aria-hidden="true">
        <p className="td-log-h"><span>Threats stopped</span><small>Sample data</small></p>
        <p className="td-count">{count.toLocaleString('en-IN')}</p>
        <ol>
          {log.map((n, i) => {
            const T = THREATS[n];
            return (
              <li key={`${n}-${i}-${count}`} className={cx(i === 0 && 'new')}>
                <b>{T.k}</b>
                <span>{T.d}</span>
                <em>{T.by} · {IDS[T.to].k}</em>
              </li>
            );
          })}
        </ol>
      </figcaption>
    </figure>
  );
}
