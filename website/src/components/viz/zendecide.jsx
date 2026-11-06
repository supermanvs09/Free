import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';

/* "Someone has to decide first", the picture from the Zenstra AI site: three
   agents each send an action; every action stops at Zenstra's line before it
   reaches a system; one is blocked, one is held for a person, one is allowed;
   each decision lands on the record. Then it plays again. Illustrative. */

const ROWS = [
  { agent: 'support-agent', act: 'export all members', sys: 'Member records', verdict: 'BLOCKED', tone: '#c4352a', why: 'outside its task' },
  { agent: 'payments-agent', act: 'pay invoice', sys: 'Payments', verdict: 'HELD → APPROVED', tone: '#a86400', why: '₹18,40,000, approved by Ravi Shah' },
  { agent: 'code-agent', act: 'push commit', sys: 'Secrets store', verdict: 'ALLOWED', tone: '#0c7546', why: 'within its task' },
];
const LINE = 58; // where Zenstra stands, % across

export function ZenDecideFirst() {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.3 });
  const reduce = useReducedMotion();
  const [k, setK] = useState(9); // the server and reduced motion show every decision made
  useEffect(() => {
    if (reduce || !seen) { setK(9); return undefined; }
    let i = 0, t;
    const next = () => { setK(i); t = setTimeout(() => { i = i >= 9 ? 0 : i + 1; next(); }, i >= 9 ? 3400 : 750); };
    next();
    return () => clearTimeout(t);
  }, [seen, reduce]);
  // row r: the action leaves at 3r, reaches the line at 3r+1, its verdict at 3r+2
  const at = (r) => (k >= r * 3 + 1 ? 'line' : k >= r * 3 ? 'go' : 'wait');
  const decided = (r) => k >= r * 3 + 2;
  return (
    <figure ref={ref} className="mono px-5 pb-6 pt-4 text-[#0e1116] xl:px-7" aria-label="Illustration: three AI agents act on their own. Each action stops at Zenstra before it reaches a system. The support agent's export of all members is blocked as outside its task; the payments agent's invoice is held and approved by Ravi Shah; the code agent's commit is allowed. Each decision is written to the record.">
      <div aria-hidden="true" className="relative" style={{ aspectRatio: '1.55 / 1' }}>
        {/* Zenstra's line */}
        <div className="absolute bottom-[4%] top-[2%] w-px" style={{ left: `${LINE}%`, background: 'linear-gradient(180deg, transparent, rgb(64 80 200 / .7) 12%, rgb(64 80 200 / .7) 88%, transparent)' }} />
        <span className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10.5px] tracking-[.12em] text-[#4050c8]" style={{ left: `${LINE}%`, top: '-2%' }}>✦ ZENSTRA DECIDES FIRST</span>
        {ROWS.map((r, i) => {
          const y = 18 + i * 32;
          const where = at(i);
          const d = decided(i);
          const pass = d && r.verdict !== 'BLOCKED';
          const left = where === 'wait' ? 16 : where === 'go' ? 28 : pass ? LINE + 3 : LINE - 27;
          return (
            <div key={r.agent}>
              <div className="absolute flex -translate-y-1/2 flex-col items-center" style={{ left: '2%', top: `${y}%`, width: '15%' }}>
                <span className="grid h-9 w-9 place-items-center rounded-full border border-[#4050c8]/40 bg-white text-[#4050c8]">✦</span>
                <span className="mt-1 whitespace-nowrap font-mono text-[10.5px] text-[#434852]">{r.agent}</span>
              </div>
              <div className="absolute h-px" style={{ left: '15%', right: '13%', top: `${y}%`, backgroundImage: 'linear-gradient(90deg, rgb(64 80 200 / .3) 50%, transparent 0)', backgroundSize: '6px 1px' }} />
              <span className="absolute -translate-y-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[11px] transition-all duration-700"
                style={{ left: `${left}%`, top: `${y}%`, opacity: where === 'wait' ? 0 : 1, background: '#fff', borderColor: d ? r.tone : 'rgb(14 17 22 / .25)', color: d ? r.tone : '#0e1116' }}>{r.act}</span>
              <span className="absolute grid h-3 w-3 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border transition-colors duration-300" style={{ left: `${LINE}%`, top: `${y}%`, background: d ? r.tone : '#fff', borderColor: d ? r.tone : '#4050c8' }} />
              <span className={cx('absolute -translate-y-1/2 whitespace-nowrap font-mono text-[10px] font-semibold tracking-[.06em] transition-opacity duration-300', d ? 'opacity-100' : 'opacity-0')} style={{ left: `${LINE + 2}%`, top: `${y - 9}%`, color: r.tone }}>{r.verdict}</span>
              <div className="absolute flex -translate-y-1/2 flex-col items-center" style={{ right: '0%', top: `${y}%`, width: '14%' }}>
                <span className="grid h-9 w-11 place-items-center rounded-[9px] border transition-colors duration-500" style={{ borderColor: d && r.verdict === 'BLOCKED' ? '#c4352a' : 'rgb(14 17 22 / .18)', background: '#fff' }}>
                  <span className="block h-[2px] w-5 rounded bg-[#9aa3b0] shadow-[0_5px_0_#9aa3b0,0_-5px_0_#9aa3b0]" />
                </span>
                <span className="mt-1 whitespace-nowrap font-mono text-[10px] text-[#434852]">{r.sys}</span>
              </div>
            </div>
          );
        })}
      </div>
      {/* the record */}
      <div className="mt-3 border-t border-[rgb(14_17_22/.1)] pt-3 font-mono text-[11px]">
        <p className="mb-1.5 tracking-[.1em] text-[#626873]">DECISION RECORD</p>
        {ROWS.map((r, i) => (
          <p key={r.agent} className={cx('grid grid-cols-[1.1fr_1.4fr_1fr] items-center gap-3 py-0.5 transition-opacity duration-500', decided(i) ? 'opacity-100' : 'opacity-0')}>
            <span className="flex items-center gap-2 text-[#0e1116]"><span className="h-1.5 w-1.5 rounded-full bg-[#4050c8]" />{r.agent}</span>
            <span className="truncate text-[#626873]">{r.why}</span>
            <span className="text-right font-semibold" style={{ color: r.tone }}>{r.verdict}</span>
          </p>
        ))}
      </div>
    </figure>
  );
}
