import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import { Logo } from './kit.jsx';

/* The product as an analyst sees it: one identity, its risk and usage, and
   tabs for what it is, what it can reach, why it is risky and the fix. The
   tabs turn on their own and can be clicked. NHI Security for AWS and Active
   Directory Security share the frame. Names and numbers are illustrative. */

const RISK = { Critical: 'crit', High: 'crit', Medium: 'warn', Low: 'ok' };
const Risk = ({ v }) => (
  <span className={cx('vz-chip plain', `c-${RISK[v]}`)} style={{ fontSize: 'max(var(--vz-min), .74em)', height: '1.6em' }}>
    <svg viewBox="0 0 12 10" width="1em" height=".9em" aria-hidden="true"><path d="M1 9h2V6H1zM5 9h2V3H5zM9 9h2V0H9z" fill="currentColor" opacity=".9" /></svg>{v}
  </span>
);
const Usage = ({ n }) => (
  <span className="inline-flex gap-[.2em]" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className="block h-[.32em] w-[.9em] rounded-full" style={{ background: i < n ? '#3f6ea8' : 'rgb(120 140 170 / .25)' }} />)}</span>
);
const Who = ({ n }) => <span className="inline-flex items-center gap-[.35em] rounded-full border px-[.5em] py-[.15em] vz-m" style={{ fontSize: 'max(var(--vz-min), .74em)', borderColor: 'rgb(120 140 170 / .3)' }}><span className="grid h-[1.3em] w-[1.3em] place-items-center rounded-full text-[max(var(--vz-min),.8em)] font-semibold" style={{ background: '#dbe7f6', color: '#24456f' }}>{n.split(' ').map((w) => w[0]).join('')}</span>{n}</span>;

/* a node on the graph: a small card with a label on its top edge */
function Node({ x, y, w = 21, tag, tagTone = 'info', logo, title, sub, risk, alert, hot, ok, gone, show = true, children }) {
  return (
    <div className={cx('wb-node absolute', show && 'on', gone && 'gone')} style={{ left: `${x}%`, top: `${y}%`, width: `${w}%` }}>
      {tag && <span className={cx('vz-chip plain absolute -top-[1.05em] left-[.6em]', `c-${tagTone}`)} style={{ fontSize: 'max(var(--vz-min), .62em)', height: '1.55em', borderRadius: '.35em' }}>{tag}</span>}
      <div className={cx('vz-panel relative flex items-center gap-[.5em] px-[.6em] py-[.55em] transition-colors duration-500', hot && 'wb-hot')} style={ok ? { borderColor: 'rgb(17 134 82 / .55)', background: 'color-mix(in oklab, var(--vz-solid) 92%, #1f9d63)' } : hot ? { borderColor: 'rgb(217 68 44 / .55)', background: 'color-mix(in oklab, var(--vz-solid) 93%, #d9442c)' } : { background: 'color-mix(in oklab, var(--vz-solid) 96%, #3f6ea8)' }}>
        {alert && <span className="absolute -left-[.55em] -top-[.55em] grid h-[1.2em] w-[1.2em] place-items-center rounded-full text-[max(var(--vz-min),.72em)] font-bold text-white" style={{ background: '#e5484d' }}>!</span>}
        {logo && <span className="grid h-[1.9em] w-[1.9em] shrink-0 place-items-center rounded-[.45em] bg-white" style={{ boxShadow: '0 0 0 1px rgb(16 40 80 / .1)' }}><Logo k={logo} size="1.2em" /></span>}
        <span className="min-w-0 leading-tight">
          <span className={cx('block truncate vz-t', gone && 'line-through')} style={{ fontSize: 'max(var(--vz-min), .8em)', fontWeight: 600 }}>{title}</span>
          {sub && <span className="block truncate vz-m" style={{ fontSize: 'max(var(--vz-min), .66em)' }}>{sub}</span>}
          {risk && <span className="mt-[.25em] block"><Risk v={risk} /></span>}
          {children}
        </span>
      </div>
    </div>
  );
}

/* elbow connectors between node centres, in % of the graph */
function Links({ links, t = 9, cut = [] }) {
  return (
    <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {links.map(([a, b, hot, at = 0], i) => {
        const mx = (a[0] + b[0]) / 2;
        const d = `M${a[0]} ${a[1]}H${mx}V${b[1]}H${b[0]}`;
        const isCut = cut.includes(i);
        const live = t >= at;
        return (
          <g key={i} style={{ opacity: live ? 1 : 0, transition: 'opacity .5s' }}>
            <path d={d} fill="none" stroke={isCut ? 'rgb(120 140 170 / .5)' : hot ? '#e0604a' : 'rgb(120 140 170 / .55)'} strokeWidth={hot ? 1.8 : 1.2} vectorEffect="non-scaling-stroke" strokeDasharray={isCut ? '4 4' : undefined} />
            {hot && !isCut && live && <path className="wb-flow" d={d} fill="none" stroke="#ff9d8a" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeDasharray="6 26" strokeLinecap="round" />}
          </g>
        );
      })}
    </svg>
  );
}
/* where a link is cut: a red cross badge on the link */
const Cut = ({ x, y, on }) => (
  <span className={cx('wb-cut absolute grid h-[1.6em] w-[1.6em] place-items-center rounded-full text-white', on && 'on')} style={{ left: `${x}%`, top: `${y}%`, background: '#1f9d63', boxShadow: '0 0 0 .3em rgb(31 157 99 / .2)' }}>
    <svg viewBox="0 0 12 12" width=".8em" height=".8em" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
  </span>
);
/* the same path for a narrow screen: one node under the other, each link
   marked hot or cut; items are [node props, link-below props] */
function Chain({ items, t, fix }) {
  return (
    <div className="wb-chain">
      {items.map(([n, l = {}], i) => (
        <div key={n.title}>
          <div className={cx('wb-row', (fix || t >= (n.at ?? i)) && 'on')}>
            <div className={cx('vz-panel relative flex items-center gap-[.6em] px-[.7em] py-[.55em] transition-colors duration-500', n.hot && 'wb-hot')} style={n.ok ? { borderColor: 'rgb(17 134 82 / .55)', background: 'color-mix(in oklab, var(--vz-solid) 92%, #1f9d63)' } : n.hot ? { borderColor: 'rgb(217 68 44 / .55)', background: 'color-mix(in oklab, var(--vz-solid) 93%, #d9442c)' } : { background: 'color-mix(in oklab, var(--vz-solid) 96%, #3f6ea8)' }}>
              <span className="grid h-[2em] w-[2em] shrink-0 place-items-center rounded-[.45em] bg-white" style={{ boxShadow: '0 0 0 1px rgb(16 40 80 / .1)' }}>{n.logo ? <Logo k={n.logo} size="1.25em" /> : <span className="vz-t" style={{ fontSize: 'max(var(--vz-min), .8em)', fontWeight: 700, color: '#24456f' }}>{n.title.slice(0, 2).toUpperCase()}</span>}</span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className={cx('block truncate vz-t', n.gone && 'line-through opacity-60')} style={{ fontWeight: 600 }}>{n.title}</span>
                {n.sub && <span className="block truncate vz-m">{n.sub}</span>}
              </span>
              {n.tag && <span className={cx('vz-chip plain shrink-0', `c-${n.tagTone || 'info'}`)} style={{ borderRadius: '.35em' }}>{n.tag}</span>}
            </div>
          </div>
          {i < items.length - 1 && (
            <div className={cx('wb-link', l.cut ? 'cut' : l.hot && 'hot')} style={{ opacity: fix || t >= (items[i + 1][0].at ?? i + 1) ? 1 : 0 }}>
              {l.cut !== undefined && <Cut x={50} y={50} on={!!l.cut} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* a counter that runs from one value to another once shown */
function Count({ from, to, run }) {
  const [v, setV] = useState(run ? to : from);
  useEffect(() => {
    if (!run) { setV(from); return undefined; }
    let raf, t0;
    const step = (n) => { t0 ??= n; const k = Math.min(1, (n - t0) / 1100); setV(Math.round(from + (to - from) * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, from, to]);
  return <span className="num">{v}</span>;
}

function Findings({ summary, rows, fixed, fixLabel, done }) {
  return (
    <div>
      <div className="flex gap-[.8em] rounded-[.7em] p-[.9em]" style={{ background: 'rgb(10 116 196 / .07)' }}>
        <svg viewBox="0 0 24 24" width="1.7em" height="1.7em" aria-hidden="true" className="shrink-0" style={{ color: '#2f6fe4' }}><path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8zM18 13l.9 2.6 2.6.9-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9z" fill="currentColor" /></svg>
        <span><span className="block vz-t" style={{ fontWeight: 650 }}>Summary</span><span className="mt-[.2em] block vz-m" style={{ fontSize: 'max(var(--vz-min), .86em)' }}>{summary}</span></span>
      </div>
      <p className="mt-[.9em] border-b pb-[.4em] vz-t" style={{ borderColor: 'rgb(120 140 170 / .3)', fontSize: 'max(var(--vz-min), .9em)' }}>Supporting findings</p>
      <div className="mt-[.4em]">
        {rows.map(([k, r, logo, what]) => (
          <div key={k} className="grid grid-cols-[8em_4.6em_1fr] items-center gap-[.7em] py-[.45em]">
            <span className="vz-m" style={{ fontSize: 'max(var(--vz-min), .8em)' }}>{k}</span><Risk v={r} />
            <span className="flex min-w-0 items-center gap-[.4em] vz-m" style={{ fontSize: 'max(var(--vz-min), .78em)' }}><Logo k={logo} size="1.1em" /><span className="truncate">{what}</span></span>
          </div>
        ))}
      </div>
      <div className="mt-[.6em] flex justify-end">
        <span data-cursor-target="" className={cx('rounded-[.5em] border px-[1em] py-[.35em] font-semibold', fixed && 'wb-press')} style={{ fontSize: 'max(var(--vz-min), .86em)', color: done ? '#11804f' : '#2f6fe4', borderColor: done ? 'rgb(17 134 82 / .4)' : 'rgb(47 111 228 / .55)', background: fixed ? 'rgb(47 111 228 / .1)' : 'transparent', transition: 'all .3s' }}>{done ? 'Remediated' : fixLabel}</span>
      </div>
    </div>
  );
}

/* the shared frame: who, risk, tabs, view; the tabs turn on their own */
function Bench({ label, head, tabs, render, dwell = 5700 }) {
  const ref = useRef(null);
  const tabRefs = useRef([]);
  const panel = useRef(null);
  const [cur, setCur] = useState(null); // the guide's pointer: where it is, and whether it is clicking
  const seen = useInView(ref, { threshold: 0.25 });
  const reduce = useReducedMotion();
  const [tab, setTab] = useState(0);
  const [t, setT] = useState(9); // time within the tab, in steps; the server shows each view complete
  const [held, setHeld] = useState(false);
  const [narrow, setNarrow] = useState(false); // a phone, or a small card: the graph becomes a chain
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (reduce || !seen || held) return undefined;
    setT(0);
    let n = 0;
    const id = setInterval(() => {
      n += 1; setT(n);
      if (n * 300 >= dwell) { n = 0; setT(0); setTab((v) => (v + 1) % tabs.length); }
    }, 300);
    return () => clearInterval(id);
  }, [seen, reduce, held, tabs.length, dwell, tab]);
  const pick = (i) => { setHeld(true); setTab(i); setT(9); setCur(null); };
  // the pointer: it moves to what is about to be pressed, and presses it
  const D = Math.round(dwell / 300);
  useEffect(() => {
    if (reduce || !seen || held || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const at = (el, click) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCur({ x: r.left + r.width * 0.55 - box.left, y: r.top + r.height * 0.6 - box.top, click });
    };
    const target = panel.current?.querySelector('[data-cursor-target]');
    if (t >= D - 4) at(tabRefs.current[(tab + 1) % tabs.length], t === D - 1);
    else if (target && t >= 4) at(target, t === 8);
    else if (t === 1) at(tabRefs.current[tab], false);
  }, [t, tab, seen, held, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <figure ref={ref} className="vzw" aria-label={label}>
      <div className="vz relative">
        <div className="vz-win">
          <div className="flex flex-wrap items-start gap-[.8em] px-[1.1em] pb-[.7em] pt-[1em]">
            <span className="grid h-[2.6em] w-[2.6em] place-items-center rounded-[.7em] bg-white" style={{ boxShadow: '0 0 0 1px rgb(16 40 80 / .1)' }}><Logo k={head.logo} size="1.6em" /></span>
            <span className="min-w-0 flex-1">
              <span className="block vz-t" style={{ fontWeight: 650, fontSize: '1.05em' }}>{head.name}</span>
              <span className="mt-[.3em] flex flex-wrap gap-[.35em]">{(narrow ? head.chips.slice(0, 1) : head.chips).map((c) => <span key={c} className="vz-chip plain c-mute" style={{ fontSize: 'max(var(--vz-min), .7em)', borderRadius: '.4em' }}>{c}</span>)}</span>
            </span>
            <span className={cx('vz-chip plain', head.done && tab === tabs.length - 1 ? 'c-ok' : 'c-warn')} style={{ fontSize: 'max(var(--vz-min), .72em)', borderRadius: '.4em' }}>{head.done && tab === tabs.length - 1 ? 'Resolved' : 'Pending review'}</span>
          </div>
          <div className="flex items-center gap-[1em] px-[1.1em] pb-[.8em]">
            <Risk v={head.done && tab === tabs.length - 1 ? 'Low' : head.risk} /><span className="flex items-center gap-[.5em] vz-m" style={{ fontSize: 'max(var(--vz-min), .74em)', letterSpacing: '.06em' }}>USAGE <Usage n={head.usage} /></span>
          </div>
          <div className="grid gap-[.4em] px-[1.1em] pb-[.8em]" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Views">
            {tabs.map((x, i) => (
              <button key={x} ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" aria-selected={i === tab} onClick={() => pick(i)}
                className="truncate rounded-[.5em] px-[.4em] py-[.5em] transition-colors" style={{ fontSize: 'max(var(--vz-min), .76em)', background: i === tab ? '#1c2633' : 'rgb(120 140 170 / .12)', color: i === tab ? '#fff' : undefined }}>
                <span className={i === tab ? '' : 'vz-m'}>{x}</span>
              </button>
            ))}
          </div>
          <div className="mx-[.8em] mb-[.8em] rounded-[.8em] p-[.9em]" style={{ background: 'var(--vz-solid)', boxShadow: '0 0 0 1px rgb(120 140 170 / .18)' }}>
            <div key={tab} ref={panel} className="fadein">{render(tab, t, narrow)}</div>
          </div>
        </div>
        {cur && !held && (
          <span aria-hidden="true" className="wb-cursor pointer-events-none absolute z-10" style={{ left: cur.x, top: cur.y }}>
            {cur.click && <span className="wb-ripple absolute -left-[.9em] -top-[.9em] h-[1.8em] w-[1.8em] rounded-full" />}
            <svg viewBox="0 0 20 22" width="1.5em" height="1.65em"><path d="M2 2l15 7-6.2 2.1L8 18Z" fill="#e5484d" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          </span>
        )}
      </div>
    </figure>
  );
}

/* the fix, as it happens: what it changes, the number it brings down, the
   steps ticking off; the graph above it shows the same change */
function Remedy({ label, from, to, t, start, items, children }) {
  const run = t >= start;
  const done = t >= start + items.length + 1;
  return (
    <div>
      <div className="mb-[.8em] flex items-center gap-[.8em] rounded-[.7em] px-[.9em] py-[.6em] transition-colors duration-500" style={{ background: done ? 'rgb(17 134 82 / .09)' : 'rgb(47 111 228 / .07)' }}>
        <span className={cx('grid h-[1.7em] w-[1.7em] shrink-0 place-items-center rounded-full text-white transition-colors duration-500', !done && run && 'wb-spin')} style={{ background: done ? '#1f9d63' : '#2f6fe4' }}>
          {done
            ? <svg viewBox="0 0 12 12" width=".8em" height=".8em" aria-hidden="true"><path d="m2.5 6.3 2.3 2.2L9.5 3.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            : <svg viewBox="0 0 12 12" width=".8em" height=".8em" aria-hidden="true"><path d="M6 1.5a4.5 4.5 0 1 0 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block vz-t" style={{ fontWeight: 650, fontSize: 'max(var(--vz-min), .92em)' }}>{done ? 'Remediated, and checked again' : 'Remediating, with approval'}</span>
          <span className="block vz-m" style={{ fontSize: 'max(var(--vz-min), .74em)' }}>{label}</span>
        </span>
        <span className="vz-t text-right" style={{ fontWeight: 750, fontSize: '1.45em', lineHeight: 1 }}>
          <span style={{ color: done ? '#11804f' : undefined }}><Count from={from} to={to} run={run} /></span>
          <span className="vz-m" style={{ fontSize: 'max(var(--vz-min), .5em)', fontWeight: 500 }}> / {from}</span>
        </span>
      </div>
      {children}
      <div className="mt-[.8em] flex flex-wrap gap-[.45em]">
        {items.map((x, i) => {
          const on = t >= start + i + 1;
          return (
            <span key={x} className="inline-flex items-center gap-[.4em] rounded-full border px-[.6em] py-[.2em] transition-all duration-500" style={{ fontSize: 'max(var(--vz-min), .72em)', opacity: on ? 1 : 0.35, borderColor: on ? 'rgb(17 134 82 / .4)' : 'rgb(120 140 170 / .3)', background: on ? 'rgb(17 134 82 / .07)' : 'transparent' }}>
              <span className="grid h-[1.2em] w-[1.2em] place-items-center rounded-full text-white transition-colors duration-500" style={{ background: on ? '#1f9d63' : 'rgb(120 140 170 / .45)' }}><svg viewBox="0 0 12 12" width=".7em" height=".7em" aria-hidden="true"><path d="m2.5 6.3 2.3 2.2L9.5 3.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              <span className="vz-t" style={{ fontWeight: 550 }}>{x}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* a small count in the corner of a graph */
const Tally = ({ on, tone = 'crit', children }) => (
  <span className={cx('vz-chip plain absolute right-0 top-0 transition-opacity duration-500', `c-${tone}`, on ? 'opacity-100' : 'opacity-0')} style={{ fontSize: 'max(var(--vz-min), .68em)', borderRadius: '.4em' }}>{children}</span>
);

/* ---------------- NHI Security for AWS ---------------- */
const INV = [
  ['ecs-notify-svc', 'aws', 'AWS', 'IAM role', 'Critical', '214 granted', 1, 'Priya Nair'],
  ['ci-deploy', 'github', 'GitHub', 'Deploy key', 'High', 'Write, Admin', 2, 'Arjun Rao'],
  ['lambda-kyc-sync', 'lambda', 'AWS', 'Lambda role', 'High', 'secrets:*', 3, 'Meera Iyer'],
  ['glue-ledger-etl', 'glue', 'AWS', 'Glue job', 'Medium', 'Read, Write', 2, 'Rahul Sen'],
  ['alerts-hook', 'slack', 'Slack', 'Webhook', 'Low', 'Post', 1, 'Neha Kapoor'],
];

/* the role's graph; with fix, the steps of the fix at t: the open trust
   policy is cut, the delete right is removed, and the role turns safe */
function NhiGraph({ t, fix, narrow }) {
  const trustCut = fix && t >= 3, delCut = fix && t >= 4, safe = fix && t >= 6;
  if (narrow) return (
    <div>
      {!fix && <p className={cx('mb-[.6em] vz-chip plain c-crit transition-opacity duration-500', t >= 5 ? 'opacity-100' : 'opacity-0')} style={{ borderRadius: '.4em' }}>205 of 214 permissions never used</p>}
      <Chain t={t} fix={fix} items={[
        [{ at: 1, title: trustCut ? 'Two named accounts' : 'Any account in the org', sub: trustCut ? 'Trust policy, scoped' : 'Trust policy: can assume the role', tag: trustCut ? 'Scoped' : 'Open', tagTone: trustCut ? 'ok' : 'crit', ok: trustCut }, { hot: !trustCut, cut: fix ? trustCut : undefined }],
        [{ at: 2, logo: 'iam', title: 'ecs-notify-svc', sub: safe ? 'Owner: Platform team' : 'Owner: Priya Nair, left in June', tag: safe ? 'Low' : 'Critical', tagTone: safe ? 'ok' : 'crit', hot: !safe, ok: safe }, { hot: !safe }],
        [{ at: 3, logo: 'rds', title: 'ledger-db', sub: 'RDS · PostgreSQL', tag: safe ? 'Low' : 'Medium', tagTone: safe ? 'ok' : 'warn' }, { hot: !delCut, cut: fix ? delCut : undefined }],
        [{ at: 4, title: 'rds:DeleteDB*', sub: delCut ? 'Removed with 204 others' : 'Granted, never used', tag: delCut ? 'Removed' : 'Never used', tagTone: delCut ? 'mute' : 'crit', hot: !delCut, gone: delCut }],
      ]} />
    </div>
  );
  const show = (n) => fix || t >= n;
  const links = [
    [[13, 25], [36, 52], false, 2], [[13, 80], [36, 52], !trustCut, 2],
    [[36, 52], [61, 25], false, 3], [[36, 52], [61, 77], !safe, 3],
    [[61, 25], [87, 15], false, 4], [[61, 25], [87, 37], false, 4], [[61, 77], [87, 66], false, 4], [[61, 77], [87, 88], !delCut, 5],
  ];
  return (
    <div className="relative aspect-[2.25/1]">
      <Links t={fix ? 9 : t} links={links} cut={[trustCut && 1, delCut && 7].filter((x) => x !== false)} />
      <Node show={show(2)} x={13} y={25} w={20} tag="Owner" title={safe ? 'Platform team' : 'Priya Nair'} sub={safe ? 'Owner reassigned' : 'Left the team in June'} ok={safe} />
      <Node show={show(2)} x={13} y={80} w={20} alert={!trustCut} tag="Trust policy" tagTone={trustCut ? 'ok' : 'crit'} title={trustCut ? 'Two named accounts' : 'Any account in the org'} sub={trustCut ? 'Scoped' : 'Can assume this role'} ok={trustCut} />
      <Node show={show(1)} x={36} y={52} w={22} tag="IAM role" tagTone={safe ? 'ok' : 'crit'} logo="iam" title="ecs-notify-svc" risk={safe ? 'Low' : 'Critical'} hot={!safe} ok={safe} />
      <Node show={show(3)} x={61} y={25} w={22} tag="Resource used" logo="s3" title="payments-prod" sub="S3 bucket" risk={safe ? 'Low' : 'High'} />
      <Node show={show(3)} x={61} y={77} w={22} tag="Resource used" logo="rds" title="ledger-db" sub="RDS · PostgreSQL" risk={safe ? 'Low' : 'Medium'} />
      {[['s3:GetObject', 15, 4], ['s3:PutObject', 37, 4], ['rds-db:connect', 66, 4]].map(([p, y, n]) => <Node key={p} show={show(n)} x={87} y={y} w={19} tag="Used" tagTone="mute" title={p} />)}
      <Node show={show(5)} x={87} y={88} w={19} tag={delCut ? 'Removed' : 'Never used'} tagTone={delCut ? 'mute' : 'crit'} title="rds:DeleteDB*" hot={!delCut} gone={delCut} />
      <Cut x={24.5} y={66} on={trustCut} />
      <Cut x={74} y={82.5} on={delCut} />
      {!fix && <Tally on={t >= 6}>205 of 214 permissions never used</Tally>}
    </div>
  );
}

export function NhiWorkbench() {
  return (
    <Bench
      label="Illustration: NHI Security for AWS. An inventory of machine identities with their risk, permissions, usage and owner; the identity graph of the IAM role ecs-notify-svc, whose owner has left, which reaches an S3 bucket and a database, has a trust policy open to any account and a delete right it never used; a risk summary of 214 permissions with 9 used; and the remediation that cuts the open trust policy, removes 205 unused permissions including the delete right, and reassigns the owner, bringing the role from Critical to Low."
      head={{ logo: 'aws', name: 'ecs-notify-svc', chips: ['IAM role', 'prod-payments', 'arn:…:role/ecs-notify'], risk: 'Critical', usage: 1, done: true }}
      tabs={['Inventory', 'Identity graph', 'Risk analysis', 'Remediation']}
      dwell={6300}
      render={(tab, t, narrow) => {
        if (tab === 0 && narrow) return (
          <div>
            <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-[.5em] rounded-[.45em] px-[.7em] py-[.5em]" style={{ background: '#1c2633', color: '#fff', fontSize: 'max(var(--vz-min), .66em)', fontWeight: 600 }}><span>Identity</span><span>Risk</span><span>Owner</span></div>
            {INV.map((r, i) => (
              <div key={r[0]} className="mt-[.35em] grid grid-cols-[1.4fr_1fr_1fr] items-center gap-[.5em] rounded-[.45em] px-[.7em] py-[.5em] transition-all duration-500" style={{ background: i < 3 ? 'rgb(217 68 44 / .06)' : 'transparent', opacity: t >= i ? 1 : 0 }}>
                <span className="flex min-w-0 items-center gap-[.4em]"><Logo k={r[1]} size="1.1em" /><span className="truncate vz-t" style={{ fontWeight: 600 }}>{r[0]}</span></span>
                <span><Risk v={r[4]} /></span>
                <span className="truncate vz-m">{r[7]}</span>
              </div>
            ))}
          </div>
        );
        if (tab === 0) return (
          <div>
            <div className="grid grid-cols-[1.25fr_.8fr_.85fr_.85fr_.9fr_.55fr_1fr] gap-[.5em] rounded-[.45em] px-[.7em] py-[.5em]" style={{ background: '#1c2633', color: '#fff', fontSize: 'max(var(--vz-min), .66em)', fontWeight: 600 }}>
              <span>Identity</span><span>Source</span><span>Type</span><span>Risk</span><span>Permissions</span><span>Usage</span><span>Owner</span>
            </div>
            {INV.map((r, i) => (
              <div key={r[0]} className={cx('mt-[.35em] grid grid-cols-[1.25fr_.8fr_.85fr_.85fr_.9fr_.55fr_1fr] items-center gap-[.5em] rounded-[.45em] px-[.7em] py-[.45em] transition-all duration-500', i === 0 && t >= 7 && 'wb-sel')} style={{ fontSize: 'max(var(--vz-min), .74em)', background: i < 3 ? 'rgb(217 68 44 / .06)' : 'transparent', opacity: t >= i ? 1 : 0, transform: t >= i ? 'none' : 'translateY(.4em)' }}>
                <span className="truncate vz-t" style={{ fontSize: '1em', fontWeight: 600 }}>{r[0]}</span>
                <span className="flex items-center gap-[.3em] vz-m" style={{ fontSize: '1em' }}><Logo k={r[1]} size="1.1em" />{r[2]}</span>
                <span className="truncate vz-m" style={{ fontSize: '1em' }}>{r[3]}</span>
                <span style={{ fontSize: '1.15em' }}><Risk v={r[4]} /></span>
                <span className="truncate vz-m" style={{ fontSize: '1em' }}>{r[5]}</span>
                <Usage n={r[6]} />
                <span className="truncate" style={{ fontSize: '1.15em' }}><Who n={r[7]} /></span>
              </div>
            ))}
            <p className="mt-[.7em] flex items-center gap-[.5em] vz-m transition-opacity duration-500" style={{ fontSize: 'max(var(--vz-min), .72em)', opacity: t >= 5 ? 1 : 0 }}>
              <span className="h-[.5em] w-[.5em] rounded-full" style={{ background: 'var(--vz-red)' }} />3 of 5 need action · sorted by risk · found in AWS, GitHub and Slack
            </p>
          </div>
        );
        if (tab === 1) return <NhiGraph t={t} narrow={narrow} />;
        if (tab === 2) return (
          <Findings summary="This role can use 214 permissions and has used 9 in the last 90 days. Its trust policy lets any account in the organisation assume it, and it can delete the ledger database."
            rows={[['Permission risk', 'Critical', 'iam', '205 permissions never used in 90 days'], ['Configuration risk', 'High', 'iam', 'Trust policy: any account in the org'], ['Ownership', 'Medium', 'aws', 'Owner on record left the team in June']]}
            fixed={t >= 8} done={false} fixLabel="Remediate" />
        );
        return (
          <Remedy label="Permissions this role can use" from={214} to={9} t={t} start={2} items={['Trust policy scoped', '205 unused removed', 'Owner reassigned', 'Evidence from CloudTrail']}>
            <NhiGraph t={t} fix narrow={narrow} />
          </Remedy>
        );
      }}
    />
  );
}

/* ---------------- Active Directory Security ---------------- */
/* the attack path; with fix, the GenericAll right is cut and the path dies */
function AdGraph({ t, fix, narrow }) {
  const cut = fix && t >= 3, rotated = fix && t >= 4, safe = fix && t >= 6;
  if (narrow) return (
    <div>
      {!fix && <p className={cx('mb-[.6em] vz-chip plain c-crit transition-opacity duration-500', t >= 5 ? 'opacity-100' : 'opacity-0')} style={{ borderRadius: '.4em' }}>41 of 57 paths cross one right</p>}
      <Chain t={t} fix={fix} items={[
        [{ at: 0, title: 'j.mehta', sub: 'Finance user', tag: 'Phished', tagTone: 'crit' }, { hot: !cut }],
        [{ at: 1, logo: 'windows', title: 'WKS-0412', sub: 'Logged on, workstation', tag: 'Session', tagTone: 'info' }, { hot: !cut }],
        [{ at: 2, logo: 'ad', title: 'svc-sql', sub: rotated ? 'Password rotated, AES only' : 'Service account', tag: rotated ? 'Fixed' : 'Kerberoastable', tagTone: rotated ? 'ok' : 'crit', hot: !rotated, ok: rotated }, { hot: !cut, cut: fix ? cut : undefined }],
        [{ at: 3, title: 'Server Admins', sub: cut ? 'GenericAll removed' : 'GenericAll from svc-sql', tag: cut ? 'Closed' : 'GenericAll', tagTone: cut ? 'ok' : 'crit', hot: !cut }, { hot: !cut }],
        [{ at: 4, title: 'Domain Admins', sub: safe ? 'Path closed' : 'Tier 0 group', tag: 'Tier 0', tagTone: safe ? 'ok' : 'crit', ok: safe }],
      ]} />
    </div>
  );
  const hot = !cut;
  const show = (n) => fix || t >= n;
  const links = [
    [[10, 50], [29, 50], hot, 1], [[29, 50], [49, 50], hot, 2], [[49, 50], [71, 50], hot, 3], [[71, 50], [90, 50], hot, 4],
    [[10, 16], [29, 16], false, 1], [[29, 16], [49, 50], false, 2], [[10, 84], [29, 84], false, 1], [[29, 84], [49, 50], false, 2], [[71, 50], [71, 16], false, 4], [[71, 16], [90, 50], false, 4],
  ];
  return (
    <div className="relative aspect-[2.05/1]">
      <Links t={fix ? 9 : t} links={links} cut={cut ? [2] : []} />
      <Node show={show(0)} x={10} y={16} w={17} tag="Start" tagTone="mute" title="a.khan" sub="Helpdesk" />
      <Node show={show(1)} x={29} y={16} w={17} tag="Logged on" logo="windows" title="WKS-0388" sub="Workstation" />
      <Node show={show(0)} x={10} y={50} w={17} tag="Phished" tagTone="crit" title="j.mehta" sub="Finance user" hot={!fix && t >= 1 && t < 5} />
      <Node show={show(1)} x={29} y={50} w={17} tag="Logged on" logo="windows" title="WKS-0412" sub="Workstation" />
      <Node show={show(0)} x={10} y={84} w={17} tag="Start" tagTone="mute" title="r.das" sub="Contractor" />
      <Node show={show(1)} x={29} y={84} w={17} tag="Logged on" logo="windows" title="VDI-117" sub="VDI" />
      <Node show={show(2)} x={49} y={50} w={17} tag={rotated ? 'AES only' : 'Kerberoastable'} tagTone={rotated ? 'ok' : 'crit'} logo="ad" title="svc-sql" sub={rotated ? 'Password rotated' : 'Service account'} hot={!rotated} ok={rotated} />
      <Node show={show(3)} x={71} y={50} w={16} tag={cut ? 'Right removed' : 'GenericAll'} tagTone={cut ? 'ok' : 'crit'} title="Server Admins" sub="Group" hot={!cut} />
      <Node show={show(4)} x={71} y={16} w={16} tag="Admin to" title="DC01" sub="Domain controller" />
      <Node show={show(4)} x={90} y={50} w={16} tag="Tier 0" tagTone={safe ? 'ok' : 'crit'} title="Domain Admins" sub={safe ? 'Path closed' : 'Group'} ok={safe} />
      <Cut x={60.25} y={50} on={cut} />
      {!fix && <Tally on={t >= 5}>41 of 57 paths cross this right</Tally>}
    </div>
  );
}

export function AdWorkbench() {
  return (
    <Bench
      label="Illustration: Active Directory Security. The attack path from a phished user, through a workstation and the Kerberoastable service account svc-sql, to Server Admins through a GenericAll right, and on to Domain Admins; a risk summary showing 41 of 57 attack paths cross that one right; and the remediation that cuts that right and rotates the password, leaving 16 paths."
      head={{ logo: 'ad', name: 'svc-sql', chips: ['Service account', 'corp.local', 'SPN: MSSQLSvc/db01'], risk: 'Critical', usage: 2, done: true }}
      tabs={['Attack paths', 'Risk analysis', 'Remediation']}
      dwell={6300}
      render={(tab, t, narrow) => {
        if (tab === 0) return <AdGraph t={t} narrow={narrow} />;
        if (tab === 1) return (
          <Findings summary="One over-broad right lets svc-sql control Server Admins. 41 of the 57 paths to Domain Admins cross it, and the account's ticket can be cracked offline."
            rows={[['Privilege risk', 'Critical', 'ad', 'GenericAll on Server Admins'], ['Credential risk', 'High', 'ad', 'Kerberoastable SPN, RC4 allowed'], ['Exposure', 'High', 'windows', 'Logged on to 23 workstations']]}
            fixed={t >= 8} done={false} fixLabel="Remediate" />
        );
        return (
          <Remedy label="Paths to Domain Admins" from={57} to={16} t={t} start={2} items={['GenericAll removed', 'Password rotated, AES only', 'Path checked again', 'Recorded for the audit']}>
            <AdGraph t={t} fix narrow={narrow} />
          </Remedy>
        );
      }}
    />
  );
}
