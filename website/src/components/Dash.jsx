import { useEffect, useRef } from 'react';
import { BRANDS } from '../data/brands.js';

/* The product screens: white, static and precise, like a product screenshot.
   Each is drawn at a fixed design width (1200px) and scaled as one picture,
   so it reads the same on a phone as on a desktop. Panels are separate
   components, so a page can lift one out and show it close up beside the
   copy that talks about it. Decorative: the page copy carries the meaning. */

const NAV_ICONS = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10c0-3.5 3.1-6 7-6s7 2.5 7 6M16 4.1a4 4 0 0 1 0 7.8M18 15c2.4.6 4 2.6 4 6',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z',
  pulse: 'M3 12h4l3-7 4 14 3-7h4',
  key: 'M15 7a4 4 0 1 1-3.5 6L4 20.5V17h3v-3h3',
  plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6',
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  bot: 'M12 3v3M5 9h14v10H5zM9 14h.01M15 14h.01M2 13v3M22 13v3',
  check: 'M4 12.5l5 5L20 6.5',
  graph: 'M5 5h4v4H5zM15 5h4v4h-4zM10 15h4v4h-4zM7 9l4 6M17 9l-4 6',
  card: 'M3 6h18v12H3zM3 10h18',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm10 3-5-5',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
  cal: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
};
export const Ico = ({ n, s = 16, w = 1.7 }) => <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={NAV_ICONS[n]} /></svg>;

/* a real brand mark (simple-icons, or drawn) */
export function Brand({ k, s = 16 }) {
  const b = BRANDS[k];
  if (!b) return null;
  if (b.raw) return <span className="db-brand" style={{ width: s, height: s }} dangerouslySetInnerHTML={{ __html: b.raw }} />;
  return <svg className="db-brand" viewBox="0 0 24 24" width={s} height={s} aria-hidden="true"><path d={b.d} fill={b.c === '#000000' || b.c === '#181717' || b.c === '#191919' ? '#0f172a' : b.c} /></svg>;
}

/* scale a fixed-width drawing to its container, like an image */
export function Fit({ w = 1200, children, className = '' }) {
  const box = useRef(null), inner = useRef(null);
  useEffect(() => {
    const fit = () => {
      const b = box.current, i = inner.current;
      if (!b || !i) return;
      const k = Math.min(1, b.clientWidth / w);
      i.style.transform = `scale(${k})`;
      b.style.height = `${i.offsetHeight * k}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={box} className={`db-fit ${className}`} aria-hidden="true">
      <div ref={inner} className="db-fit-in" style={{ width: w }}>{children}</div>
    </div>
  );
}

/* the product window: sidebar with the product's own sections, a top bar */
export function Window({ product, mark = 'adapid', nav, active = 0, title, sub, actions, children }) {
  return (
    <div className="db-win">
      <aside className="db-side">
        <p className="db-prod"><img src={`/brand/products/${mark}.webp`} alt="" width="22" height="22" onError={(e) => { e.currentTarget.src = '/brand/mark.webp'; }} /><b>{product}</b></p>
        <ul>{nav.map(([ic, t], i) => <li key={t} className={i === active ? 'on' : ''}><Ico n={ic} />{t}</li>)}</ul>
        <ul className="db-side-end"><li><Ico n="gear" />Settings</li></ul>
      </aside>
      <div className="db-main">
        <header className="db-top">
          <span className="db-search"><Ico n="search" s={14} />Search</span>
          <span className="db-range"><Ico n="cal" s={14} />Last 30 days</span>
          <span className="db-bell"><Ico n="bell" s={16} /><i /></span>
          <span className="db-av">PS</span>
        </header>
        <div className="db-body">
          <div className="db-title"><div><h4>{title}</h4>{sub && <p>{sub}</p>}</div>{actions && <div className="db-actions">{actions}</div>}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

export const Kpis = ({ items }) => (
  <div className="db-kpis">{items.map(([k, v, d, tone]) => <div key={k} className="db-kpi"><p>{k}</p><b>{v}</b>{d && <em className={tone || ''}>{d}</em>}</div>)}</div>
);
export const Card = ({ title, meta, children, className = '' }) => (
  <section className={`db-card ${className}`}>{title && <p className="db-h"><b>{title}</b>{meta && <span>{meta}</span>}</p>}{children}</section>
);
export const Pill = ({ t, tone = '' }) => <span className={`db-pill ${tone}`}>{t}</span>;
export const Bar = ({ v, tone = '' }) => <span className={`db-bar ${tone}`}><i style={{ width: `${v}%` }} /></span>;
export const Av = ({ n, c = '#3b82f6' }) => <span className="db-avt" style={{ background: c }}>{n.split(/[\s.-]/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</span>;
export const Btn = ({ t, solid }) => <span className={`db-btn ${solid ? 'solid' : ''}`}>{t}</span>;

/* a smooth area chart */
export function Area({ pts, base, w = 560, h = 150, color = '#2563eb', labels }) {
  const max = Math.max(...pts, ...(base || [0])) * 1.12, step = w / (pts.length - 1);
  const xy = (p) => p.map((v, i) => [i * step, h - (v / max) * h]);
  const curve = (a) => a.reduce((s, [x, y], i) => {
    if (!i) return `M${x} ${y}`;
    const [px, py] = a[i - 1], cx = (px + x) / 2;
    return `${s} C${cx} ${py} ${cx} ${y} ${x} ${y}`;
  }, '');
  const a = xy(pts), d = curve(a), id = `g${color.slice(1)}`;
  return (
    <div className="db-area">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".18" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} stroke="#eef1f5" />)}
        <path d={`${d} L${w} ${h} L0 ${h}Z`} fill={`url(#${id})`} />
        {base && <path d={curve(xy(base))} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />}
        <path d={d} stroke={color} strokeWidth="2.2" fill="none" />
        <circle cx={a[a.length - 1][0]} cy={a[a.length - 1][1]} r="4" fill="#fff" stroke={color} strokeWidth="2" />
      </svg>
      {labels && <p className="db-xl">{labels.map((l) => <span key={l}>{l}</span>)}</p>}
    </div>
  );
}

export function Donut({ v, color = '#2563eb', label, sub, size = 132 }) {
  return (
    <div className="db-donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="#eef1f5" strokeWidth="12" /><circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" pathLength="100" strokeDasharray={`${v} 100`} transform="rotate(-90 60 60)" /></svg>
      <p><b>{label}</b>{sub && <span>{sub}</span>}</p>
    </div>
  );
}

/* a panel lifted out of a screen and shown close up, floating */
export function Zoom({ children, w = 580, className = "" }) {
  return <Fit w={w} className={`db-zoom ${className}`}>{children}</Fit>;
}
