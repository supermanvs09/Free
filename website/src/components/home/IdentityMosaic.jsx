import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import { CountUp } from '../ui.jsx';

/* The hero picture, in the language of the brand film: four people and the
   identities they carry (an employee, a workload, a customer, an AI agent at
   work). A discovery frame moves from tile to tile and the record card in the
   middle shows what Deep Algorithms found for that identity: who it is, who
   owns it, what it can reach and its risk. The server render and reduced
   motion hold the first identity. Sample data, illustrative UI. */

const IDS = [
  { img: 'employee', tag: 'Employee', kind: 'Human identity', name: 'Mei Chen', sub: 'Finance Analyst · Hyderabad',
    rows: [['Source', 'Entra ID · HRMS'], ['Reach', 'Mail, Workspace, ERP'], ['Owner', 'Finance']], risk: ['14', 'Low', 'ok'] },
  { img: 'developer', tag: 'Workload', kind: 'Machine identity', name: 'payment-service-prod', mono: true, sub: 'IAM role · AWS production',
    rows: [['Source', 'AWS IAM · CloudTrail'], ['Reach', 's3:* on every bucket'], ['Owner', 'Platform Eng']], risk: ['71', 'High', 'risk'] },
  { img: 'customer', tag: 'Customer', kind: 'Customer identity', name: 'Customer ****4821', sub: 'Mobile banking',
    rows: [['Source', 'Banking app'], ['Device', 'Registered phone'], ['Behaviour', '94% match']], risk: ['8', 'Low', 'ok'] },
  { img: 'ai-at-work', tag: 'AI at work', kind: 'AI agent', name: 'Claude · laptop-208', sub: 'AI assistant · Engineering',
    rows: [['Source', 'Zenstra endpoint'], ['Reach', 'Prompts, code, .env files'], ['Owner', 'Priya K.']], risk: ['82', 'Critical', 'crit'] },
];

const TOTALS = [['Human', '12,480'], ['Machine', '51,818'], ['AI agents', '1,284']];

export default function IdentityMosaic() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const reduce = useReducedMotion();
  const [k, setK] = useState(0);

  useEffect(() => {
    if (reduce || !inView) return undefined;
    const t = setTimeout(() => setK((n) => (n + 1) % IDS.length), 2800);
    return () => clearTimeout(t);
  }, [k, inView, reduce]);

  const id = IDS[k];
  return (
    <figure ref={ref} className="im" aria-label="Identity discovery with sample data: Deep Algorithms finds an employee, a workload, a customer and an AI agent, and shows the source, reach, owner and risk of each.">
      <div className="im-stage">
        <ul className="im-grid" aria-hidden="true">
          {IDS.map((x, i) => (
            <li key={x.img} className={cx('im-tile', i === k && 'on')}>
              <img src={`/img/film/${x.img}.webp`} alt="" width="1100" height="619" loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
              <span className="im-tag"><i />{x.tag}</span>
            </li>
          ))}
        </ul>
        <svg className="im-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[[25, 25], [75, 25], [25, 75], [75, 75]].map(([x, y], i) => (
            <line key={i} x1="50" y1="50" x2={x} y2={y} className={cx(i === k && 'on')} />
          ))}
        </svg>
        <span className="im-hub" aria-hidden="true"><img src="/brand/mark.webp" alt="" width="40" height="40" /></span>
      </div>
      <div className="im-rec" aria-hidden="true">
        <div className="im-rec-id" key={k}>
          <p className="im-card-k"><span className="im-dot" />Discovered · {id.kind}</p>
          <p className={cx('im-card-n', id.mono && 'mono')}>{id.name}</p>
          <p className="im-card-s">{id.sub}</p>
        </div>
        <dl className="im-rows" key={`r${k}`}>
          {id.rows.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}
        </dl>
        <p className={cx('im-risk', id.risk[2])} key={`k${k}`}><span>Risk</span><b>{id.risk[0]}</b><em>{id.risk[1]}</em></p>
        <div className="im-foot">
          <p className="im-foot-k"><span className="im-pulse" />Identities discovered <b className="im-foot-v"><CountUp value="65,582" /></b></p>
          <ul className="im-foot-l">
            {TOTALS.map(([a, b]) => <li key={a}><b>{b}</b>{a}</li>)}
          </ul>
        </div>
      </div>
    </figure>
  );
}
