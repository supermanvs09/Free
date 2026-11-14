import { ok, fail, bare, iso, MIN } from '../util';
import { scans, changesOf, visibleChanges, recordScan } from '../changes';
import { identities, credentials } from '../world';
import { slice, save } from '../state';
import { audit } from '../users';


export default function register(r) {
  r.get('/api/v1/scans', ({ query }) => ok({ scans: scans().slice(0, Number(query.limit) || 20) }));

  r.get('/api/v1/scans/latest/status', () => ok({ scan_id: scans()[0].scan_id, status: 'COMPLETED', scan_time: scans()[0].completed_at }));

  r.get('/api/v1/scans/:id/changes', ({ params, query }) => {
    const list = scans();
    const index = params.id === 'latest' ? 0 : list.findIndex((s) => s.scan_id === params.id);
    if (index < 0) return fail(404, 'That scan is not in the history any more.', 'SCAN_NOT_FOUND');
    const scan = list[index];
    let rows = visibleChanges(changesOf(scan.scan_id, index));
    const all = rows;
    if (query.change_type) rows = rows.filter((c) => c.change_type === query.change_type);
    if (query.entity_type) rows = rows.filter((c) => c.entity_type === query.entity_type);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 25);
    const zero = { change_type: { CREATED: 0, MODIFIED: 0, DELETED: 0 }, entity_type: { identity: 0, credential: 0, permission: 0, binding: 0, trust_edge: 0 } };
    const tally = (key) => all.reduce((m, c) => ({ ...m, [c[key]]: (m[c[key]] ?? 0) + 1 }), { ...zero[key] });
    const both = {};
    for (const c of all) {
      both[c.entity_type] ??= {};
      both[c.entity_type][c.change_type] = (both[c.entity_type][c.change_type] ?? 0) + 1;
    }
    return ok({
      scan,
      summary: { total: all.length, by_change_type: tally('change_type'), by_entity_type: tally('entity_type'), by_entity_and_change: both },
      changes: rows.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total: rows.length, total_pages: Math.max(1, Math.ceil(rows.length / limit)) },
    });
  });

  /* "Sync now": a discovery scan that runs for a little while and completes. */
  r.post('/scan-api/api/v1/scan/start', ({ body, user }) => {
    const st = slice('runningScanState', () => ({}));
    if (st.scan && Date.now() - st.scan.started < 45000) {
      return bare({ success: false, scan_id: st.scan.id, started_at: iso(st.scan.started), elapsed: `${Math.round((Date.now() - st.scan.started) / 1000)}s`, message: 'A scan is already running.' }, 409);
    }
    const id = `scan_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}`;
    st.scan = { id, started: Date.now(), accounts: body?.account_ids ?? [] };
    save();
    audit(user, 'scan.run', 'Started a discovery scan');
    return bare({ success: true, data: { scan_id: id, schema: 'tnt_7f3a91c2', accounts: st.scan.accounts.length ? st.scan.accounts : [...new Set(identities().map((i) => i.account_id))], status: 'STARTED' } });
  });

  r.get('/scan-api/api/v1/scan/status', ({ query }) => {
    const st = slice('runningScanState', () => ({}));
    const scan = st.scan;
    if (!scan || scan.id !== query.scan_id) return bare({ success: true, data: { status: 'COMPLETED', total_identities: identities().length, total_credentials: credentials().length, total_changes: 0, scan_end: iso(Date.now() - MIN) } });
    const elapsed = Date.now() - scan.started;
    if (elapsed < 14000) return bare({ success: true, data: { status: 'RUNNING', message: elapsed < 6000 ? 'Listing identities' : 'Resolving credentials and trust' } });
    if (!scan.recorded) {
      scan.recorded = true;
      recordScan({ scan_id: scan.id, status: 'COMPLETED', account_id: null, started_at: iso(scan.started), completed_at: iso(scan.started + 14000) });
    }
    return bare({ success: true, data: { status: 'COMPLETED', total_identities: identities().length, total_credentials: credentials().length, total_changes: changesOf(scan.id, 1).length, scan_end: iso(scan.started + 14000) } });
  });

  /* Posture scan behind the same button. */
  r.post('/api/v1/ispm/scans', () => {
    const st = slice('runningScanState', () => ({}));
    st.posture = { id: `job_${Date.now().toString(36)}`, started: Date.now() };
    save();
    return { status: 202, body: { data: { job_id: st.posture.id, already_running: false } } };
  });
  r.get('/api/v1/ispm/scans/:id', ({ params }) => {
    const st = slice('runningScanState', () => ({}));
    const job = st.posture;
    const done = !job || job.id !== params.id || Date.now() - job.started > 8000;
    return { status: 200, body: { data: { job_id: params.id, status: done ? 'COMPLETED' : 'RUNNING', tenants: [{ tenant_id: 'tnt_7f3a91c2', status: done ? 'COMPLETED' : 'RUNNING' }] } } };
  });
}
