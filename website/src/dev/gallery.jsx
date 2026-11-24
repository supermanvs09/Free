import { createRoot } from 'react-dom/client';
import '../styles.css';
import '../components/viz/viz.css';
import { HeroActivity } from '../components/viz/home.jsx';
import { ZenGateway, ZenInventory, ZenGrant, ZenMcp, ZenDetect, ZenRecord, ZenApproval } from '../components/viz/zenstra.jsx';
import { AdapRiskTimeline, NhiGraph, RiskScoreCard, AdPath, IdentityGraph, AdTierGraph } from '../components/viz/adapid.jsx';
import { MachineCrowd } from '../components/scenes/crowd.jsx';
import { LoginGlobe } from '../components/scenes/login.jsx';
import { MoneyTrail } from '../components/scenes/money.jsx';
import { AgentBoundary } from '../components/scenes/agent.jsx';
import { IcmsEvidence, DataMap, BreachClock } from '../components/viz/icms.jsx';
const ALL = { AgentBoundary, MachineCrowd, LoginGlobe, MoneyTrail, IdentityGraph, AdTierGraph, HeroActivity, ZenGateway, ZenInventory, ZenGrant, ZenMcp, ZenDetect, ZenRecord, ZenApproval, AdapRiskTimeline, NhiGraph, RiskScoreCard, AdPath, IcmsEvidence, DataMap, BreachClock };
const q = new URLSearchParams(location.search);
const only = q.get('v') ? q.get('v').split(',') : Object.keys(ALL);
const w = q.get('w') || '620';
createRoot(document.getElementById('root')).render(
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, padding: 40, background: q.has('light') ? '#fff' : undefined }}>
    {only.map((n) => { const C = ALL[n]; return <div key={n} style={{ width: +w }} data-v={n}><p style={{ color: '#8a97aa', fontSize: 12, marginBottom: 8 }}>{n}</p><C t={q.get('t') ? +q.get('t') : undefined} film={q.has('light') || undefined} /></div>; })}
  </div>,
);
