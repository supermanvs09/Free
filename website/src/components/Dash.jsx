import { useEffect, useRef, useState } from 'react';

/* The product dashboards: one window shape for every product (dark glass,
   icon rail, top bar), with each product's own working screen inside.
   Everything animates once when the window scrolls into view: numbers count
   up, lines draw, bars grow, and a live feed adds a row every few seconds.
   Reduced motion gets the finished screen. Decorative: the page copy says
   what the picture shows, so the window is hidden from screen readers. */

const RAIL = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm-8 9c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z',
  pulse: 'M3 12h4l3-7 4 14 3-7h4',
  key: 'M14.5 9.5a4.5 4.5 0 1 1-1.3-3.2L21 14v3h-3v-2h-2v-2h-2.2',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 2.8L6 9.3 4 9l-1 3 2 1v1.5',
};
const Ico = ({ d }) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

/* one window: product name, the screen's place, and the rail */
export function DashWindow({ product, crumb, rail = ['grid', 'user', 'shield', 'pulse', 'file'], live = 'Live', children, className = '' }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setOn(true); el.classList.add('still'); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`dw ${on ? 'on' : ''} ${className}`} aria-hidden="true">
      <div className="dw-glow" />
      <div className="dw-win">
        <aside className="dw-rail">
          <img src="/brand/mark.webp" alt="" width="22" height="22" />
          {rail.map((r, i) => <span key={r} className={i === 0 ? 'cur' : ''}><Ico d={RAIL[r]} /></span>)}
          <span className="dw-rail-end"><Ico d={RAIL.gear} /></span>
        </aside>
        <div className="dw-main">
          <header className="dw-top">
            <p><b>{product}</b><i>/</i>{crumb}</p>
            <span className="dw-search">Search identities, assets, cases</span>
            <span className="dw-live"><i />{live}</span>
            <span className="dw-av">PS</span>
          </header>
          <div className="dw-body">{children(on)}</div>
        </div>
      </div>
    </div>
  );
}

/* a number that counts up once the window is on screen */
export function Num({ to, on, dec = 0, pre = '', suf = '', ms = 1400 }) {
  const [v, setV] = useState(on ? to : 0);
  useEffect(() => {
    if (!on) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return undefined; }
    let raf = 0; const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms); setV(to * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on, to, ms]);
  return <>{pre}{v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })}{suf}</>;
}

export function Kpi({ k, children, d, tone }) {
  return <div className="dw-kpi"><p>{k}</p><b>{children}</b>{d && <em className={tone || ''}>{d}</em>}</div>;
}

/* a smooth line (and soft area) through the points, drawn left to right */
export function Line({ pts, w = 520, h = 140, color = '#3aa8f0', area = true, dash, second }) {
  const max = Math.max(...pts, ...(second || [])) * 1.1, step = w / (pts.length - 1);
  const xy = (p) => p.map((v, i) => [i * step, h - (v / max) * h]);
  const path = (a) => a.map(([x, y], i) => (i ? `L${x.toFixed(1)} ${y.toFixed(1)}` : `M${x} ${y.toFixed(1)}`)).join(' ');
  const a = xy(pts), d = path(a);
  return (
    <svg className="dw-line" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} className="dw-grid" />)}
      {area && <path d={`${d} L${w} ${h} L0 ${h}Z`} fill={color} className="dw-area" />}
      {second && <path d={path(xy(second))} stroke="rgb(255 255 255 / .28)" strokeWidth="1.5" fill="none" strokeDasharray="4 4" pathLength="1" className="dw-draw" />}
      <path d={d} stroke={color} strokeWidth="2" fill="none" pathLength="1" className="dw-draw" strokeDasharray={dash} />
    </svg>
  );
}

/* a feed that brings in a new row every few seconds, newest on top */
export function Feed({ rows, on, every = 2600, show = 4, render }) {
  const [n, setN] = useState(show);
  useEffect(() => {
    if (!on || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setN((x) => x + 1), every);
    return () => clearInterval(t);
  }, [on, every]);
  const list = Array.from({ length: show }, (_, i) => ({ r: rows[(n - 1 - i + rows.length * 50) % rows.length], key: n - i }));
  return <ul className="dw-feed">{list.map(({ r, key }) => <li key={key}>{render(r)}</li>)}</ul>;
}

export const Pill = ({ t, tone = '' }) => <span className={`dw-pill ${tone}`}>{t}</span>;
export const Bar = ({ v, tone = '', d = 0 }) => <span className={`dw-bar ${tone}`}><i style={{ '--v': `${v}%`, transitionDelay: `${d}ms` }} /></span>;
