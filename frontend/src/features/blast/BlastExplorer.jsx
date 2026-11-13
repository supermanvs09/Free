import { memo, useEffect, useMemo, useState } from 'react';
import { Background, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { Box, ChevronRight, KeyRound, Lock, UserRoundCog, X } from 'lucide-react';
import { formatNumber } from '../../lib/format';
import { cn } from '../../ui/cn';

/* ── Vocabulary (kept local: the explorer is self-contained) ────────────── */

const SERVICE = {
  s3: 'S3', secretsmanager: 'Secrets Manager', kms: 'KMS', iam: 'IAM roles', sts: 'STS', dynamodb: 'DynamoDB', sqs: 'SQS',
  sns: 'SNS', lambda: 'Lambda', ec2: 'EC2', rds: 'RDS', ssm: 'Parameter Store', ecr: 'ECR', logs: 'CloudWatch Logs',
};
const serviceLabel = (s) => SERVICE[s] ?? (s ? s.toUpperCase() : 'Other');
const SENSITIVE = new Set(['secretsmanager', 'kms', 'ssm', 'iam', 'sts']);
const isSensitive = (r) => SENSITIVE.has(r.service) || r.type === 'secret' || r.type === 'key';
const accountOf = (arn) => String(arn ?? '').split(':')[4] || '';
export const shortName = (arn) => {
  const text = String(arn ?? '');
  if (text.startsWith('*:')) return `All ${serviceLabel(text.slice(2))}`;
  if (text === '*') return 'Every resource';
  if (/^arn:[^:]+:s3:::[^/]+\/\*$/.test(text)) return `Objects in ${text.split(':::')[1].slice(0, -2)}`;
  const tail = text.split(':').slice(5).join(':');
  return tail.split('/').filter(Boolean).pop() || tail || text;
};

/* ── Nodes ──────────────────────────────────────────────────────────────── */

const ICON = { source: UserRoundCog, role: KeyRound, service: Box, resource: Lock };

const BlastNode = memo(function BlastNode({ data }) {
  const Icon = ICON[data.kind] ?? Box;
  const source = data.kind === 'source';
  return (
    <div
      className={cn(
        'flex h-[54px] w-[220px] items-center gap-2.5 rounded-[12px] border px-3 transition-[opacity,box-shadow,border-color] duration-200',
        source ? 'border-ink bg-ink text-surface shadow-[var(--t-shadow-lg)]' : 'bg-surface text-ink',
        !source && (data.sensitive ? 'border-critical/40' : 'border-line'),
        data.selected && 'ring-2 ring-brand ring-offset-2 ring-offset-surface',
        data.dim ? 'opacity-25' : 'opacity-100',
      )}
      title={data.arn}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-[8px]',
          source ? 'bg-white/10' : data.sensitive ? 'bg-critical-soft text-critical' : 'bg-surface-2 text-ink-3',
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-tight font-semibold">{data.label}</span>
        <span className={cn('mt-0.5 block truncate text-[11px] leading-tight', source ? 'text-surface/70' : 'text-ink-3')}>{data.sub}</span>
      </span>
      {data.count != null && (
        <span className={cn('flex shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums', data.open ? 'bg-brand text-white' : 'bg-surface-3 text-ink-2')}>
          {data.count}
          <ChevronRight className={cn('size-3 transition-transform', data.open && 'rotate-90')} />
        </span>
      )}
      <Handle type="source" position={Position.Right} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
    </div>
  );
});
const nodeTypes = { blast: BlastNode };

/* ── Model: columns of the attack surface ──────────────────────────────── */

const COL_X = [0, 290, 580, 870];
const ROW = 66;

function buildModel(result, open) {
  const src = result.source_arn;
  const resources = result.reachable_resources ?? [];
  const roleSet = new Map();
  for (const r of result.reachable_identities ?? []) roleSet.set(r.arn, r);
  for (const r of resources) for (const a of (r.path_arns ?? []).slice(1, -1)) if (!roleSet.has(a)) roleSet.set(a, { arn: a });
  const roles = [...roleSet.values()];
  const byService = new Map();
  for (const r of resources) {
    if (!byService.has(r.service)) byService.set(r.service, []);
    byService.get(r.service).push(r);
  }
  const services = [...byService.entries()]
    .map(([service, list]) => ({ service, list: list.sort((a, b) => b.score - a.score), max: Math.max(...list.map((r) => r.score)) }))
    .sort((a, b) => b.max - a.max);

  const nodes = [];
  const edges = new Map();
  const add = (id, col, data) => nodes.push({ id, col, data });
  const link = (from, to, data) => {
    const id = `${from}->${to}`;
    const prev = edges.get(id);
    edges.set(id, { id, source: from, target: to, sensitive: (prev?.sensitive ?? false) || data.sensitive, cross: (prev?.cross ?? false) || data.cross });
  };

  add(src, 0, { kind: 'source', label: result.source_name || shortName(src), sub: 'This identity', arn: src });
  roles.forEach((r) => add(r.arn, 1, { kind: 'role', label: shortName(r.arn), sub: accountOf(r.arn) !== accountOf(src) ? `Account ${accountOf(r.arn)}` : 'Role it can become', arn: r.arn, sensitive: false }));
  for (const s of services) {
    const sid = `svc:${s.service}`;
    add(sid, 2, { kind: 'service', label: serviceLabel(s.service), sub: s.list.some((r) => r.wildcard) ? 'includes a wildcard' : 'service', sensitive: SENSITIVE.has(s.service), count: s.list.length, open: open.has(s.service), service: s.service });
    for (const r of s.list) {
      const via = (r.path_arns ?? []).slice(1, -1);
      const from = via.length ? via[via.length - 1] : src;
      link(from, sid, { sensitive: isSensitive(r), cross: accountOf(r.arn) && accountOf(r.arn) !== accountOf(src) });
      if (open.has(s.service)) {
        add(`res:${r.arn}`, 3, { kind: 'resource', label: shortName(r.arn), sub: `${r.score.toFixed(1)} · ${r.observed_activity ? 'used' : 'allowed'}`, arn: r.arn, sensitive: isSensitive(r), resource: r });
        link(sid, `res:${r.arn}`, { sensitive: isSensitive(r), cross: false });
      }
    }
  }
  for (const r of roles) {
    const prev = (result.reachable_identities ?? []).find((x) => x.arn === r.arn)?.path_arns ?? [src, r.arn];
    link(prev[prev.length - 2] ?? src, r.arn, { sensitive: false, cross: accountOf(r.arn) !== accountOf(src) });
  }

  /* Column layout, each column centred on the tallest. */
  const counts = [0, 0, 0, 0];
  nodes.forEach((n) => (counts[n.col] += 1));
  const height = Math.max(...counts) * ROW;
  const seen = [0, 0, 0, 0];
  const placed = nodes.map((n) => {
    const i = seen[n.col]++;
    return { id: n.id, type: 'blast', data: n.data, position: { x: COL_X[n.col], y: (height - counts[n.col] * ROW) / 2 + i * ROW }, draggable: false, connectable: false };
  });
  return { nodes: placed, edges: [...edges.values()], services, resources, roles };
}

/* What the selection lights up: the chain from the identity to it. */
function pathOf(sel, model, src) {
  if (!sel) return null;
  const on = new Set([src]);
  if (sel.kind === 'resource') {
    const r = sel.resource;
    (r.path_arns ?? []).slice(0, -1).forEach((a) => on.add(a));
    on.add(`svc:${r.service}`);
    on.add(`res:${r.arn}`);
  } else if (sel.kind === 'service') {
    on.add(`svc:${sel.service}`);
    for (const r of model.resources.filter((x) => x.service === sel.service)) {
      (r.path_arns ?? []).slice(0, -1).forEach((a) => on.add(a));
      on.add(`res:${r.arn}`);
    }
  } else if (sel.kind === 'role') {
    on.add(sel.arn);
    for (const r of model.resources.filter((x) => (x.path_arns ?? []).includes(sel.arn))) {
      (r.path_arns ?? []).slice(0, -1).forEach((a) => on.add(a));
      on.add(`svc:${r.service}`);
      on.add(`res:${r.arn}`);
    }
  }
  return on;
}

/* ── Selection panel (under the graph, so the graph keeps its width) ─────────────────────────────────────────────────────────── */

const LIMIT_TEXT = {
  crosses_account_boundary: 'Crosses into another AWS account',
  does_not_prove_access_happened: 'Allowed by policy, not seen used in CloudTrail',
  wildcard_resource_grant: 'Granted on "*", not on a named resource',
};

function Steps({ resource, paths }) {
  const path = paths.find((p) => p.target_arn === resource.arn);
  const hops = path?.hops ?? [];
  const chain = [{ text: 'Attacker controls', name: shortName(path?.source_arn ?? resource.path_arns?.[0]), how: 'starting point', dot: 'bg-ink' }].concat(
    hops.map((h, i) => ({
      text: h.edge_type === 'CAN_ASSUME' ? 'assumes' : 'can use',
      name: shortName(h.to_arn),
      how: h.evidence === 'observed' ? 'seen in CloudTrail' : 'allowed by IAM policy',
      dot: i === hops.length - 1 ? (isSensitive(resource) ? 'bg-critical' : 'bg-high') : 'bg-ink-3',
    })),
  );
  return (
    <>
      <ol className="mt-3 flex flex-col gap-2 md:flex-row md:items-stretch md:gap-0">
        {chain.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center md:flex-1">
            <span className="min-w-0 flex-1 rounded-[12px] border border-line px-3 py-2.5">
              <span className="flex items-center gap-2 text-[11px] text-ink-3">
                <span className={cn('size-2 shrink-0 rounded-full', c.dot)} />
                {c.text}
              </span>
              <span className="mt-0.5 block truncate text-[13px] font-semibold text-ink" title={c.name}>
                {c.name}
              </span>
              <span className="block text-[11px] text-ink-3">{c.how}</span>
            </span>
            {i < chain.length - 1 && <ChevronRight aria-hidden="true" className="mx-1 hidden size-4 shrink-0 text-ink-3 md:block" />}
          </li>
        ))}
      </ol>
      {path?.path_description && <p className="mt-3 rounded-[10px] bg-surface-2 px-3 py-2 text-[12px] text-ink-2">{path.path_description}</p>}
      {(path?.limitations ?? []).length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {path.limitations.map((l) => (
            <span key={l} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-3">
              {LIMIT_TEXT[l] ?? l.replaceAll('_', ' ')}
            </span>
          ))}
        </p>
      )}
    </>
  );
}

function Panel({ sel, model, paths, onSelect, onClear }) {
  const close = (
    <button type="button" onClick={onClear} aria-label="Clear selection" className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
      <X className="size-4" />
    </button>
  );
  if (sel.kind === 'resource') {
    const r = sel.resource;
    return (
      <div className="grid gap-x-10 gap-y-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">{serviceLabel(r.service)} {r.type && !serviceLabel(r.service).toLowerCase().includes(r.type) ? r.type : ''}</p>
              <h4 className="mt-1 text-[16px] font-semibold break-all text-ink">{shortName(r.arn)}</h4>
            </div>
            <span className="lg:hidden">{close}</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
              <span className={cn('block h-full rounded-full', r.score >= 8 ? 'bg-critical' : r.score >= 6 ? 'bg-high' : r.score >= 4 ? 'bg-medium' : 'bg-low')} style={{ width: `${r.score * 10}%` }} />
            </span>
            <span data-numeric="" className="text-[13px] font-semibold text-ink">
              {r.score.toFixed(1)}
              <span className="font-normal text-ink-3"> / 10</span>
            </span>
          </div>
          <p className="mt-3 text-[12.5px] text-ink-2">
            {r.observed_activity ? 'This access has been used - CloudTrail shows it.' : 'Allowed by policy; CloudTrail has not shown it being used.'}{' '}
            {r.hops > 1 ? `Reached in ${r.hops} steps.` : 'Reached directly.'}
          </p>
          <p className="mt-3 font-mono text-[10.5px] break-all text-ink-3">{r.arn}</p>
        </div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">How an attacker gets there</p>
            <span className="hidden lg:block">{close}</span>
          </div>
          <Steps resource={r} paths={paths} />
        </div>
      </div>
    );
  }
  const list = sel.kind === 'service' ? model.resources.filter((r) => r.service === sel.service) : model.resources.filter((r) => (r.path_arns ?? []).includes(sel.arn));
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">{sel.kind === 'service' ? 'Service' : 'Role it can become'}</p>
          <h4 className="mt-1 text-[16px] font-semibold break-all text-ink">{sel.kind === 'service' ? serviceLabel(sel.service) : shortName(sel.arn)}</h4>
        </div>
        {close}
      </div>
      <p className="mt-2 text-[12.5px] text-ink-2">
        {sel.kind === 'service' ? 'Reachable here:' : 'Becoming this role unlocks:'} {formatNumber(list.length)} {list.length === 1 ? 'resource' : 'resources'}.
      </p>
      <ul className="mt-3 grid gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <li key={r.arn}>
            <button type="button" onClick={() => onSelect({ kind: 'resource', arn: r.arn, resource: r })} className="flex w-full items-center gap-2 bg-surface px-3 py-2.5 text-left hover:bg-surface-2">
              <span className={cn('size-1.5 shrink-0 rounded-full', isSensitive(r) ? 'bg-critical' : 'bg-ink-3')} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{shortName(r.arn)}</span>
              <span data-numeric="" className="text-[11.5px] text-ink-3">
                {r.score.toFixed(1)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── The explorer ───────────────────────────────────────────────────────── */

function ExplorerInner({ result }) {
  /* Sensitive services start open: those are what a reader looks for first. */
  const [open, setOpen] = useState(() => new Set((result.reach_by_service ?? []).filter((s) => SENSITIVE.has(s.service) && s.resources <= 8).map((s) => s.service)));
  const [sel, setSel] = useState(null);
  const model = useMemo(() => buildModel(result, open), [result, open]);
  const lit = useMemo(() => pathOf(sel, model, result.source_arn), [sel, model, result.source_arn]);
  const selId = sel ? (sel.kind === 'resource' ? `res:${sel.arn}` : sel.kind === 'service' ? `svc:${sel.service}` : sel.arn) : null;

  /* Refit when a service expands or collapses. */
  const { fitView } = useReactFlow();
  const panel = Boolean(sel);
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.1, maxZoom: 1.15, duration: 250 }), 30);
    return () => clearTimeout(t);
  }, [model.nodes.length, fitView]);
  const rows = Math.max(...[0, 1, 2, 3].map((c) => model.nodes.filter((n) => n.position.x === COL_X[c]).length));
  const height = Math.min(760, Math.max(420, rows * ROW + 120));

  const nodes = model.nodes.map((n) => ({ ...n, data: { ...n.data, dim: Boolean(lit) && !lit.has(n.id), selected: n.id === selId } }));
  const edges = model.edges.map((e) => {
    const on = !lit || (lit.has(e.source) && lit.has(e.target));
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: Boolean(lit) && on,
      style: {
        stroke: e.sensitive ? 'var(--color-critical)' : 'var(--color-ink-3)',
        strokeWidth: lit && on ? 2 : 1.25,
        strokeOpacity: on ? (e.sensitive ? 0.75 : 0.45) : 0.08,
        strokeDasharray: e.cross ? '5 4' : undefined,
      },
    };
  });

  const onNodeClick = (_, node) => {
    const d = node.data;
    if (d.kind === 'service') {
      setOpen((cur) => {
        const next = new Set(cur);
        if (next.has(d.service) && selId === node.id) next.delete(d.service);
        else next.add(d.service);
        return next;
      });
      setSel({ kind: 'service', service: d.service });
    } else if (d.kind === 'resource') setSel({ kind: 'resource', arn: d.arn, resource: d.resource });
    else if (d.kind === 'role') setSel({ kind: 'role', arn: d.arn });
    else setSel(null);
  };

  return (
    <div>
      <div className="relative" style={{ height }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSel(null)}
          fitView
          fitViewOptions={{ padding: 0.1, maxZoom: 1.15 }}
          minZoom={0.3}
          maxZoom={1.6}
          nodesDraggable={false}
          nodesConnectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          zoomActivationKeyCode={['Control', 'Meta']}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} size={1} color="var(--color-line)" />
        </ReactFlow>
        <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-full border border-line bg-surface/90 px-3 py-1 text-[11px] text-ink-3 backdrop-blur">
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 bg-critical" /> to secrets & keys
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-ink-3" /> another account
          </span>
          <span>Click a service to open its resources · Ctrl/⌘ + scroll to zoom</span>
        </div>
      </div>
      {panel && (
        <aside aria-label="Selected" className="border-t border-line p-5">
          <Panel sel={sel} model={model} paths={result.paths ?? []} onSelect={setSel} onClear={() => setSel(null)} />
        </aside>
      )}
    </div>
  );
}

/** The attack surface as an explorable graph with a path-tracing side panel. */
export function BlastExplorer({ result }) {
  return (
    <ReactFlowProvider>
      <ExplorerInner result={result} />
    </ReactFlowProvider>
  );
}
