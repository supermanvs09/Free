import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { ArrowRight, Crosshair, Database, ExternalLink, Wrench } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel, PanelHeader } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { useView } from '../../data/store';
import { IDENTITY_TYPES, PROVIDERS } from '../../data/world';
import { AppLogo, IdentityLogo } from '../../components/Logo';
import { PersonName, RiskBar, SeverityTag } from '../../components/bits';
import { cn } from '../../ui/cn';
import { findAttackPaths } from './paths';

function IdentityNode({ data }) {
  const i = data.identity;
  return (
    <div className={cn('w-[228px] rounded-[12px] border bg-surface p-2.5 shadow-[var(--t-shadow-md)] transition-shadow', data.focus ? 'border-brand ring-4 ring-brand/15' : data.risky ? 'border-critical/50' : 'border-line-strong')}>
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-line-strong" />
      <div className="flex items-center gap-2">
        <IdentityLogo type={i.type} size={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-ink" title={i.name}>{i.name}</p>
          <p className="truncate text-[10.5px] text-ink-3">{IDENTITY_TYPES[i.type].label}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-3"><AppLogo name={PROVIDERS[i.provider].logo} size={14} />{PROVIDERS[i.provider].short} · {i.environment}</span>
        <RiskBar value={i.risk} />
      </div>
      {(i.permissions.adminLike || data.leaked) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {data.leaked && <span className="rounded bg-critical-soft px-1.5 py-px text-[10px] font-semibold text-critical">Leaked</span>}
          {i.permissions.adminLike && <span className="rounded bg-high-soft px-1.5 py-px text-[10px] font-semibold text-high">{i.permissions.scopes[0]}</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-line-strong" />
    </div>
  );
}
function ResourceNode({ data }) {
  return (
    <div className="flex w-[200px] items-center gap-2 rounded-full border border-line bg-surface-2 py-1.5 pr-3 pl-1.5">
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-line-strong" />
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-ink-3"><Database aria-hidden="true" className="size-3.5" /></span>
      <span className="truncate font-mono text-[11px] text-ink-2" title={data.label}>{data.label}</span>
    </div>
  );
}
const nodeTypes = { identity: IdentityNode, resource: ResourceNode };

function buildGraph(view, chain, focusId) {
  const nodes = [];
  const edges = [];
  const leaked = new Set(view.exposures.filter((x) => x.status === 'open').map((x) => x.identityId));
  const col = (k) => k * 300;
  const placed = new Set();
  const add = (i, x, y, focus = false) => {
    if (placed.has(i.id)) return;
    placed.add(i.id);
    nodes.push({ id: i.id, type: 'identity', position: { x, y }, data: { identity: i, focus, leaked: leaked.has(i.id), risky: i.riskLevel === 'critical' } });
  };
  const edge = (a, b, label, hot) =>
    edges.push({ id: `${a}-${b}`, source: a, target: b, label, animated: hot, labelStyle: { fill: 'var(--t-ink-3)', fontSize: 10 }, labelBgStyle: { fill: 'var(--t-surface)' }, style: { stroke: hot ? 'var(--t-graph-risk)' : 'var(--t-graph-flow)', strokeWidth: hot ? 2 : 1.4 }, markerEnd: { type: MarkerType.ArrowClosed, color: hot ? 'var(--t-graph-risk)' : 'var(--t-graph-flow)' } });

  if (chain) {
    chain.forEach((i, k) => {
      add(i, col(k), 120, i.id === focusId);
      if (k > 0) edge(chain[k - 1].id, i.id, (chain[k - 1].links || []).find((l) => l.to === i.id)?.label, true);
    });
    const end = chain.at(-1);
    (end.resources || []).slice(0, 4).forEach((r, k) => {
      nodes.push({ id: `res-${r}`, type: 'resource', position: { x: col(chain.length), y: 40 + k * 64 }, data: { label: r } });
      edges.push({ id: `${end.id}-res-${k}`, source: end.id, target: `res-${r}`, style: { stroke: 'var(--t-line-strong)', strokeDasharray: '4 4' } });
    });
    return { nodes, edges };
  }

  const focus = view.idById.get(focusId);
  if (!focus) return { nodes, edges };
  const ups = (focus.links || []).filter((l) => l.from).map((l) => ({ i: view.idById.get(l.from), label: l.label })).filter((x) => x.i);
  const downs = (focus.links || []).filter((l) => l.to).map((l) => ({ i: view.idById.get(l.to), label: l.label })).filter((x) => x.i);
  const mid = Math.max(ups.length, downs.length, 1) * 60;
  ups.forEach((u, k) => {
    add(u.i, col(0), k * 120 + mid - ups.length * 60);
    edge(u.i.id, focus.id, u.label, leaked.has(u.i.id) || u.i.riskLevel === 'critical');
  });
  add(focus, col(1), mid - 40, true);
  downs.forEach((d, k) => {
    add(d.i, col(2), k * 120 + mid - downs.length * 60);
    edge(focus.id, d.i.id, d.label, d.i.permissions.adminLike);
  });
  const resX = col(downs.length ? 3 : 2);
  (focus.resources || []).slice(0, 5).forEach((r, k) => {
    nodes.push({ id: `res-${r}`, type: 'resource', position: { x: resX, y: k * 60 + mid - 120 }, data: { label: r } });
    edges.push({ id: `${focus.id}-res-${k}`, source: focus.id, target: `res-${r}`, style: { stroke: 'var(--t-line-strong)', strokeDasharray: '4 4' } });
  });
  return { nodes, edges };
}

export default function AttackPathsPage() {
  const { id } = useParams();
  const view = useView();
  const navigate = useNavigate();
  const paths = useMemo(() => findAttackPaths(view), [view]);
  const [selected, setSelected] = useState(null);
  const focus = id ? view.idById.get(id) : null;
  const activePath = selected ? paths.find((p) => p.id === selected) : !id ? paths[0] : null;
  const graph = useMemo(() => buildGraph(view, activePath?.hops, activePath ? null : id), [view, activePath, id]);
  const subject = activePath?.start || focus;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Attack paths"
        lede="Trust between identities in different applications. Each path starts at something easy to steal and ends where it would hurt."
        actions={focus && <Button as={Link} to={`/identities/${focus.id}`} variant="secondary" icon={ExternalLink}>Open {focus.name}</Button>}
      />
      <div className="grid gap-4 @min-[72rem]:grid-cols-[360px_minmax(0,1fr)]">
        <Panel flush className="flex max-h-[680px] flex-col">
          <div className="border-b border-line px-4 py-3">
            <PanelHeader title={`${paths.length} cross-application paths`} subtitle="Ranked by what the end of the path can do." />
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {paths.map((p) => {
              const active = activePath?.id === p.id;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => { setSelected(p.id); if (id) navigate('/access-graph'); }} className={cn('w-full px-4 py-3 text-left transition-colors', active ? 'bg-info-soft' : 'hover:bg-surface-2')}>
                    <div className="flex items-center gap-1">
                      {p.hops.map((h, k) => (
                        <span key={h.id} className="inline-flex items-center gap-1">
                          {k > 0 && <ArrowRight aria-hidden="true" className="size-3 text-ink-3" />}
                          <IdentityLogo type={h.type} size={22} />
                        </span>
                      ))}
                      <span className="ml-auto"><SeverityTag severity={p.severity} /></span>
                    </div>
                    <p className="mt-1.5 truncate text-[12.5px] font-semibold text-ink">{p.start.name} → {p.end.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] text-ink-3">{p.summary}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel flush className="relative h-[520px] overflow-hidden">
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-[12px] text-ink-2 shadow-sm backdrop-blur">
              <Crosshair aria-hidden="true" className="size-3.5 text-brand" />
              {activePath ? 'Showing the selected path' : focus ? `Everything that trusts or is trusted by ${focus.name}` : 'Select a path'}
            </div>
            <ReactFlowProvider>
              <ReactFlow key={activePath?.id || id} nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.25 }} proOptions={{ hideAttribution: true }} nodesDraggable nodesConnectable={false} onNodeClick={(_, n) => n.type === 'identity' && navigate(`/access-graph/${n.id}`)} minZoom={0.3}>
                <Background gap={22} size={1} color="var(--t-line)" />
                <Controls showInteractive={false} className="!shadow-none [&>button]:!border-line [&>button]:!bg-surface [&>button]:!fill-ink-2" />
              </ReactFlow>
            </ReactFlowProvider>
          </Panel>
          {subject && (
            <Panel>
              <PanelHeader title={activePath ? 'Break this path' : `About ${subject.name}`} subtitle={activePath ? 'Cutting any one link stops the chain. The first link is usually cheapest.' : IDENTITY_TYPES[subject.type].label} />
              <div className="mt-3 grid gap-3 @min-[48rem]:grid-cols-3">
                {(activePath?.hops || [subject]).slice(0, 3).map((h, k) => (
                  <div key={h.id} className="rounded-[10px] border border-line p-3">
                    <div className="flex items-center gap-2">
                      <IdentityLogo type={h.type} size={26} />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold text-ink">{h.name}</p>
                        <p className="text-[11px] text-ink-3">Owner: <PersonName refId={h.owner} /></p>
                      </div>
                    </div>
                    <p className="mt-2 text-[12px] text-ink-2">
                      {k === 0 ? 'Replace with short-lived, scoped credentials.' : h.permissions.adminLike ? `Remove ${h.permissions.scopes[0]}; it uses ${h.permissions.used} of ${h.permissions.granted} grants.` : 'Restrict who can assume or read this identity.'}
                    </p>
                    <Button as={Link} to={`/identities/${h.id}`} size="sm" variant="secondary" icon={Wrench} className="mt-2.5">Fix on identity</Button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
