import { useRef } from 'react';
import { cx, useSteps } from '../../lib/motion.js';
import { Logo } from '../viz/kit.jsx';
import { Icon } from '../ui.jsx';

/* The home page's product pictures, built the way zenstra.ai builds its own:
   every picture is the same object, a white app window with a title bar,
   sitting on a pale dotted stage. One small story plays inside each while it
   is on screen, then holds. Reduced motion and the server render show the
   finished state. All data is sample data. */

export function Stage({ title, meta, children, className }) {
  return (
    <div className={cx('ac-stage', className)}>
      <div className="ac-win">
        <div className="ac-bar">
          <img src="/brand/mark.webp" alt="" width="16" height="16" />
          <b>{title}</b>
          {meta && <span>{meta}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

/* 1 · Discover: the identity inventory fills in */
const INV = [
  { id: 'r.mehta', type: 'Employee', src: 'entra', owner: 'Finance', risk: 14 },
  { id: 'svc-payments-prod', type: 'Workload role', src: 'aws', owner: 'Platform Eng', risk: 71, mono: true },
  { id: 'support-triage', type: 'AI agent', src: 'copilotstudio', owner: 'Customer Care', risk: 38, mono: true },
  { id: 'deploy-key-ci', type: 'API key', src: 'github', owner: 'DevOps', risk: 22, mono: true },
  { id: 'lead-enricher', type: 'AI agent', src: 'zapier', owner: null, risk: 66, mono: true },
];
const tone = (r) => (r >= 60 ? 'hi' : r >= 30 ? 'md' : 'lo');

export function InventoryCard() {
  const ref = useRef(null);
  const k = useSteps(ref, [500, 450, 450, 450, 450, 600], { loop: false });
  return (
    <div ref={ref}>
      <Stage title="Identity inventory" meta="All sources · live">
        <div className="ac-tabs"><span className="on">All 65,582</span><span>Human 12,480</span><span>Machine 51,818</span><span>AI agents 1,284</span></div>
        <div className="ac-th ac-inv"><span>Identity</span><span>Source</span><span>Owner</span><span>Risk</span></div>
        <ul className="ac-rows">
          {INV.map((r, i) => (
            <li key={r.id} className={cx('ac-tr ac-inv', i < k && 'in')}>
              <span className="ac-id"><b className={cx(r.mono && 'mono')}>{r.id}</b><small>{r.type}</small></span>
              <span className="ac-src"><Logo k={r.src} size="16px" /></span>
              <span className={cx('ac-owner', !r.owner && 'none')}>{r.owner || 'No owner'}</span>
              <span className={cx('ac-risk', tone(r.risk))}>{r.risk}</span>
            </li>
          ))}
        </ul>
        <p className={cx('ac-note', k >= 6 && 'in')}><Icon name="Warning" size={14} weight="fill" />312 AI agents have no accountable owner</p>
      </Stage>
    </div>
  );
}

/* 2 · Detect: baseline against this session, then the decision */
const DIFF = [
  ['Device', 'Managed laptop', 'Unmanaged laptop, first seen'],
  ['Location', 'Hyderabad', 'Frankfurt, 6 min later'],
  ['MFA', 'One push a day', '11 pushes in 90 s, approved'],
  ['Activity', 'Mail, ERP', 'Mail forwarding to outside address'],
];

export function DetectionCard() {
  const ref = useRef(null);
  const k = useSteps(ref, [700, 700, 700, 700, 900], { loop: false });
  const risk = [14, 34, 52, 70, 88, 88][Math.min(k, 5)];
  const done = k >= 5;
  return (
    <div ref={ref}>
      <Stage title="Detection · DET-4127" meta={<span className="ac-crit">Critical</span>}>
        <div className="ac-who">
          <span className="ac-avatar">RM</span>
          <span><b>r.mehta</b><small>Finance analyst · Entra ID</small></span>
          <span className={cx('ac-pill', done ? 'ok' : 'bad')}>{done ? 'Contained' : 'Investigating'}</span>
        </div>
        <div className="ac-th ac-diff"><span /><span>Baseline</span><span>This session</span></div>
        <ul className="ac-rows">
          {DIFF.map(([a, b, c], i) => (
            <li key={a} className="ac-tr ac-diff in">
              <span className="ac-k">{a}</span>
              <span>{b}</span>
              <span className={cx('ac-new', i < k && 'on')}>{i < k ? c : '—'}</span>
            </li>
          ))}
        </ul>
        <div className="ac-foot">
          <span className="ac-score"><small>Risk</small><b className={cx(risk >= 70 && 'hi')}>{risk}</b></span>
          <span className="ac-mitre mono">T1078 · T1621 · T1114.003</span>
          <span className={cx('ac-btn', done ? 'ok' : 'bad')}>{done ? <><Icon name="Check" size={13} weight="bold" />Session revoked</> : 'Revoke session'}</span>
        </div>
      </Stage>
    </div>
  );
}

/* 3 · Zenstra: a scan across the AI apps staff actually use */
const APPS = [
  ['claude', 'Claude'], ['cursor', 'Cursor'], ['copilot', 'GitHub Copilot'], ['copilotstudio', 'Copilot Studio'],
  ['gemini', 'Gemini'], ['n8n', 'n8n'], ['zapier', 'Zapier'], ['mcp', 'MCP servers'],
];
const FOUND = [
  { app: 'copilotstudio', name: 'support-triage', owner: 'Customer Care', st: 'ok' },
  { app: 'n8n', name: 'invoice-flow', owner: 'Finance Ops', st: 'ok' },
  { app: 'zapier', name: 'lead-enricher', owner: 'No owner', st: 'shadow' },
  { app: 'cursor', name: 'cursor · laptop-114', owner: 'Priya N.', st: 'bad', note: 'Read ~/.aws/credentials' },
];
const ST = { ok: 'Governed', shadow: 'Shadow agent', bad: 'Out of task' };

export function AgentScanCard() {
  const ref = useRef(null);
  // steps 1-8 scan the apps; 9-12 add the agents found
  const k = useSteps(ref, [...APPS.map(() => 260), 500, 500, 500, 700], { loop: true, hold: 3200 });
  const scanned = Math.min(k, APPS.length);
  const found = Math.max(0, k - APPS.length);
  return (
    <div ref={ref}>
      <Stage title="Agent discovery" meta={k < APPS.length ? <span className="ac-live"><i />Scanning</span> : '1,284 agents · 8 platforms'}>
        <ul className="ac-apps">
          {APPS.map(([key, l], i) => (
            <li key={key} className={cx(i < scanned && 'done', i === scanned && k < APPS.length && 'now')} title={l}>
              <span className="ac-app"><Logo k={key} size="22px" /></span>
              <small>{l}</small>
            </li>
          ))}
        </ul>
        <ul className="ac-rows ac-found">
          {FOUND.map((f, i) => (
            <li key={f.name} className={cx('ac-tr ac-ag', i < found && 'in', f.st)}>
              <span className="ac-src"><Logo k={f.app} size="15px" /></span>
              <span className="ac-id"><b className="mono">{f.name}</b><small>{f.note || f.owner}</small></span>
              <span className={cx('ac-tag', f.st)}>{ST[f.st]}</span>
              {f.st === 'bad' ? <span className="ac-btn bad sm">Contain</span> : <span />}
            </li>
          ))}
        </ul>
      </Stage>
    </div>
  );
}

/* 4 · Prove: the decision record, entry by entry */
const REC = [
  ['#48213', 'block', 'support-triage', 'crm.export outside task', 'POL-114'],
  ['#48214', 'step-up', 'r.mehta', 'new device and location', 'POL-021'],
  ['#48215', 'revoke', 'svc-payments-prod', 'admin unused 94 days', 'POL-047'],
  ['#48216', 'allow', 'invoice-flow', 'within task and grant', 'POL-003'],
];

export function RecordCard() {
  const ref = useRef(null);
  const k = useSteps(ref, [500, 500, 500, 500, 600], { loop: false });
  return (
    <div ref={ref}>
      <Stage title="Decision record" meta="Hash-chained">
        <ul className="ac-rows">
          {REC.map(([id, v, who, why, pol], i) => (
            <li key={id} className={cx('ac-tr ac-rec', i < k && 'in')}>
              <span className="mono ac-k">{id}</span>
              <span className={cx('ac-v', v.replace('-', ''))}>{v}</span>
              <span className="ac-id"><b className="mono">{who}</b><small>{why}</small></span>
              <span className="mono ac-k">{pol}</span>
            </li>
          ))}
        </ul>
        <div className={cx('ac-foot', k >= 5 && 'in')}>
          <span className="ac-maps"><span>DPDP Act 2023</span><span>ISO/IEC 42001</span><span>RBI</span><span>SEBI</span></span>
          <span className="ac-btn">Export evidence</span>
        </div>
      </Stage>
    </div>
  );
}
