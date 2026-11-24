import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import { Logo } from '../viz/kit.jsx';

/* Zenstra agent discovery, as a picture: the platforms agents live on sit on
   an outer ring; a scan sweeps them and each agent it finds lands in the
   inventory with its status. The server render and reduced motion show the
   finished inventory. Sample data, illustrative UI. */

const SOURCES = [
  ['copilotstudio', 'Copilot Studio'], ['claude', 'Claude'], ['cursor', 'Cursor'], ['n8n', 'n8n'],
  ['langgraph', 'LangGraph'], ['zapier', 'Zapier'], ['mcp', 'MCP servers'], ['github', 'GitHub Actions'],
];

const AGENTS = [
  { name: 'support-triage', src: 'copilotstudio', owner: 'Customer Care', st: 'risk', note: 'Write access to CRM' },
  { name: 'invoice-bot', src: 'n8n', owner: 'Finance Ops', st: 'ok', note: 'Scoped · approved' },
  { name: 'code-assist', src: 'cursor', owner: 'Platform Eng', st: 'ok', note: 'Scoped · approved' },
  { name: 'lead-enricher', src: 'zapier', owner: 'No owner', st: 'shadow', note: 'Created by a personal account' },
  { name: 'mcp-files', src: 'mcp', owner: 'No owner', st: 'shadow', note: 'Unapproved MCP server' },
  { name: 'research-agent', src: 'claude', owner: 'Strategy', st: 'risk', note: 'Token never expires' },
];
const ST = { ok: ['Governed', '#0c7546'], risk: ['Over-privileged', '#b9520f'], shadow: ['Shadow agent', '#c4321f'] };

export default function AgentMap() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.25 });
  const reduce = useReducedMotion();
  const [n, setN] = useState(AGENTS.length);
  const done = useRef(false);

  useEffect(() => {
    if (reduce || !inView || done.current) return undefined;
    done.current = true;
    setN(0);
    const ids = AGENTS.map((_, i) => setTimeout(() => setN(i + 1), 700 + i * 700));
    return () => ids.forEach(clearTimeout);
  }, [inView, reduce]);

  const found = AGENTS.slice(0, n);
  const shadow = found.filter((a) => a.st === 'shadow').length;
  const risky = found.filter((a) => a.st === 'risk').length;

  return (
    <figure ref={ref} className="am" aria-label="Zenstra agent discovery with sample data: six AI agents found across Copilot Studio, n8n, Cursor, Zapier, an MCP server and Claude; two are shadow agents and two are over-privileged.">
      <div className="am-radar" aria-hidden="true">
        <span className={cx('am-sweep', !reduce && inView && 'run')} />
        <span className="am-ring r1" /><span className="am-ring r2" /><span className="am-ring r3" />
        <span className="am-core"><span className="am-core-k">Zenstra</span><b>{n === AGENTS.length ? '1,284' : (n * 214).toLocaleString('en-US')}</b><small>agents found</small></span>
        {SOURCES.map(([k, l], i) => {
          const a = (i / SOURCES.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <span key={k} className="am-src" style={{ left: `${50 + Math.cos(a) * 40}%`, top: `${50 + Math.sin(a) * 38}%` }} title={l}>
              <Logo k={k} size="20px" />
            </span>
          );
        })}
      </div>
      <div className="am-list" aria-hidden="true">
        <p className="am-h"><span>Agent inventory</span><span className="am-tags"><span style={{ '--c': ST.shadow[1] }}>{shadow} shadow</span><span style={{ '--c': ST.risk[1] }}>{risky} over-privileged</span></span></p>
        <ul>
          {AGENTS.map((a, i) => (
            <li key={a.name} className={cx('am-row', i < n && 'in')}>
              <span className="am-app"><Logo k={a.src} size="16px" /></span>
              <span className="am-name"><b>{a.name}</b><small>{a.owner} · {a.note}</small></span>
              <span className="am-st" style={{ '--c': ST[a.st][1] }}>{ST[a.st][0]}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
