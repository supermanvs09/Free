import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  siOkta, siGithub, siGithubcopilot, siClaude, siGooglegemini, siKubernetes, siTerraform, siN8n, siZapier,
  siLanggraph, siGooglecloud, siCursor, siJira, siGitlab, siModelcontextprotocol, siRazorpay, siPhonepe, siPaytm,
  siCloudflare, siDatabricks, siSnowflake, siAtlassian, siGoogle,
} from 'simple-icons';

export const cx = (...a) => a.filter(Boolean).join(' ');

/* ---------- motion helpers ---------- */

export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return r;
}

export function useInView(ref, margin = '0px') {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!ref.current) return undefined;
    const io = new IntersectionObserver(([e]) => setV(e.isIntersecting), { rootMargin: margin, threshold: 0.25 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref, margin]);
  return v;
}

/* Steps through a scripted sequence while the visual is on screen. Each step
   is { dur, ... }. Under reduced motion it holds `still` (default 0). */
export function useScript(steps, ref, still = 0) {
  const reduce = useReducedMotion();
  const inView = useInView(ref);
  const [i, setI] = useState(still);
  useEffect(() => {
    if (reduce || !inView) return undefined;
    const t = setTimeout(() => setI((n) => (n + 1) % steps.length), steps[i].dur);
    return () => clearTimeout(t);
  }, [i, reduce, inView, steps]);
  useEffect(() => { if (reduce) setI(still); }, [reduce, still]);
  return { step: steps[i], i, reduce };
}

/* Coral pointer that glides to a target element inside `box`. */
export function Cursor({ box, target, click, hidden }) {
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const b = box.current;
      const t = target && b?.querySelector(`[data-cur="${target}"]`);
      if (!b || !t) return;
      const br = b.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      setPos({ x: tr.left - br.left + tr.width * 0.55, y: tr.top - br.top + tr.height * 0.6 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [box, target]);
  if (!pos || hidden) return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-30 transition-transform duration-[900ms] ease-[cubic-bezier(.45,0,.2,1)]"
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
      <svg width="22" height="24" viewBox="0 0 22 24" className={cx('drop-shadow-[0_2px_3px_rgba(0,0,0,.18)] transition-transform duration-150', click && 'scale-[.82]')}>
        <path d="M2 2 L20 9.5 L11.5 12 L8 21 Z" fill="#f0644d" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      {click && <span className="absolute -left-2 -top-2 h-7 w-7 animate-ping rounded-full bg-coral/40" />}
    </span>
  );
}

/* ---------- product UI primitives ---------- */

export function Frame({ className, children, ...rest }) {
  return <div className={cx('frame relative', className)} {...rest}>{children}</div>;
}

export function Mark({ size = 18 }) {
  return <img src="/brand/mark.webp" alt="" width={size} height={size} style={{ width: size, height: size }} />;
}

export function WinTitle({ children, right }) {
  return (
    <div className="flex items-center gap-2.5 px-1 pb-3 pt-0.5">
      <Mark size={20} />
      <span className="font-display text-[20px] font-light tracking-[-0.02em] text-ink md:text-[24px]">{children}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

const LEVEL = {
  Low: ['text-ok bg-ok-soft', 1],
  Medium: ['text-warn bg-warn-soft', 2],
  High: ['text-coral-2 bg-coral-soft', 3],
  Critical: ['text-white bg-navy-2', 4],
};
export function Risk({ level }) {
  const [cls, n] = LEVEL[level];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', cls)}>
      <svg width="10" height="9" viewBox="0 0 10 9" aria-hidden="true">
        {[0, 1, 2, 3].map((k) => <rect key={k} x={k * 2.6} y={8 - (k + 1) * 2} width="1.7" height={(k + 1) * 2} rx=".5" fill="currentColor" opacity={k < n ? 1 : 0.28} />)}
      </svg>
      {level}
    </span>
  );
}

export function Usage({ n = 2 }) {
  return (
    <span role="img" className="inline-flex items-center gap-0.5" aria-label={`usage ${n} of 3`}>
      {[0, 1, 2].map((k) => <span key={k} className={cx('h-1.5 rounded-[2px]', k === 2 ? 'w-4' : 'w-2', k < n ? 'bg-ink-3' : 'bg-line-2')} />)}
    </span>
  );
}

const AV = ['#0068ac', '#c4520a', '#0b7563', '#7a4fd0', '#b03a86', '#3f4a5a'];
export function Person({ name, small }) {
  const ini = name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  const c = AV[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV.length];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border border-line bg-white py-0.5 pl-0.5 pr-2.5 text-ink-2', small ? 'text-[10.5px]' : 'text-[11.5px]')}>
      <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[8.5px] font-semibold text-white" style={{ background: c }}>{ini}</span>
      <span className="truncate">{name}</span>
    </span>
  );
}

const BRANDS = {
  okta: siOkta, github: siGithub, copilot: siGithubcopilot, claude: siClaude, gemini: siGooglegemini, kubernetes: siKubernetes,
  terraform: siTerraform, n8n: siN8n, zapier: siZapier, langgraph: siLanggraph, gcp: siGooglecloud, cursor: siCursor,
  jira: siJira, gitlab: siGitlab, mcp: siModelcontextprotocol, razorpay: siRazorpay, phonepe: siPhonepe, paytm: siPaytm,
  cloudflare: siCloudflare, databricks: siDatabricks, snowflake: siSnowflake, atlassian: siAtlassian, google: siGoogle,
};
/* Text badges for marks Simple Icons does not carry (AWS, Microsoft). */
const TEXT_MARKS = { aws: ['aws', '#232f3e'], ad: ['AD', '#0067b8'], m365: ['M365', '#d83b01'], bedrock: ['BR', '#232f3e'] };

const brandFill = (icon) => {
  const n = parseInt(icon.hex, 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.2 ? '#0b1220' : `#${icon.hex}`;
};

/* mono: draw the mark in one neutral tone, for rows of integrations. */
export function Logo({ name, size = 16, mono }) {
  const icon = BRANDS[name];
  if (icon) return <svg role="img" aria-label={icon.title} viewBox="0 0 24 24" width={size} height={size} fill={mono ? '#5c6777' : brandFill(icon)}><path d={icon.path} /></svg>;
  const t = TEXT_MARKS[name];
  if (!t) return null;
  return <span role="img" aria-label={name.toUpperCase()} className="inline-flex items-center justify-center font-sans font-bold leading-none" style={{ color: mono ? '#5c6777' : t[1], fontSize: size * 0.62, minWidth: size, height: size }}>{t[0]}</span>;
}

/* Same marks for use inside an <svg> scene (decorative: the scene carries the label). */
export function SvgLogo({ name, x = 0, y = 0, size = 24, fill, opacity }) {
  const icon = BRANDS[name];
  if (icon) return <svg x={x} y={y} width={size} height={size} viewBox="0 0 24 24" fill={fill || brandFill(icon)} opacity={opacity} aria-hidden="true"><path d={icon.path} /></svg>;
  const t = TEXT_MARKS[name];
  return t ? <text x={x + size / 2} y={y + size * (t[0].length > 3 ? 0.62 : 0.7)} textAnchor="middle" fontSize={size * (t[0].length > 3 ? 0.42 : 0.62)} fontWeight="700" fill={fill || t[1]} opacity={opacity}>{t[0]}</text> : null;
}

export function Tile({ name, size = 28, mono }) {
  return (
    <span className="inline-flex items-center justify-center rounded-[7px] border border-line bg-white" style={{ width: size, height: size }}>
      <Logo name={name} size={Math.round(size * 0.56)} mono={mono} />
    </span>
  );
}

export function Chip({ children, tone = 'grey', className }) {
  const t = { grey: 'bg-mist text-ink-3 border-line', coral: 'bg-coral-soft text-coral-2 border-coral-soft', green: 'bg-ok-soft text-ok border-ok-soft', amber: 'bg-warn-soft text-warn border-warn-soft', blue: 'bg-sky text-brand border-sky' }[tone];
  return <span className={cx('inline-flex items-center rounded-[6px] border px-1.5 py-0.5 text-[10.5px] font-medium', t, className)}>{children}</span>;
}

/* Segmented tabs inside a product window (Astrix style). */
export function UITabs({ tabs, active, dark = true }) {
  return (
    <div className="flex gap-2 overflow-hidden">
      {tabs.map((t, k) => (
        <span key={t} data-cur={`tab-${k}`}
          className={cx('flex-1 truncate rounded-[8px] px-3 py-2 text-center text-[12px] transition-colors duration-500 md:text-[13px]',
            k === active ? (dark ? 'bg-navy text-white' : 'bg-white text-ink shadow-sm') : 'bg-white/70 text-ink-3')}>
          {t}
        </span>
      ))}
    </div>
  );
}
