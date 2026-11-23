import client from './client';
import { params, unwrapMain } from './http';

/*
 * Reports: files built from data the console already stores.
 *
 *   GET /api/v1/reports/posture/preview?class=&severity=          what the report would hold
 *   GET /api/v1/reports/posture/export?format=pdf|xlsx|csv&class=&severity=&include=
 *
 * class: all | human | nhi; severity and include are comma lists.
 */
const BASE = '/api/v1/reports/posture';

const ACCEPT = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};

const query = ({ identityClass, severities, include, format } = {}) =>
  params({
    class: identityClass && identityClass !== 'all' ? identityClass : undefined,
    severity: severities?.length && severities.length < 4 ? severities : undefined,
    include: include === undefined ? undefined : include.length ? include : '',
    format,
  });

export async function fetchPostureReportPreview({ identityClass, severities }, signal) {
  const d = unwrapMain(await client.get(`${BASE}/preview`, { params: query({ identityClass, severities }), signal })) ?? {};
  const n = (v) => Number(v) || 0;
  return {
    scored: n(d.identities_scored),
    failing: n(d.identities_failing),
    checks: n(d.failing_checks),
    bySeverity: d.by_severity ?? {},
    accounts: n(d.accounts),
    averageScore: d.average_score ?? null,
  };
}

/** Downloads the report file; resolves with its name. */
export async function downloadPostureReport({ identityClass, severities, include, format }) {
  const p = query({ identityClass, severities, include, format });
  /* An empty include list means "none of the optional parts", which params()
     would drop; it is sent explicitly. */
  if (include && include.length === 0) p.include = '';
  const response = await client.get(`${BASE}/export`, {
    params: p,
    responseType: 'blob',
    headers: { Accept: ACCEPT[format] ?? 'application/pdf' },
    timeout: 120000,
  });
  const disposition = response.headers?.['content-disposition'] ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] || `posture-report.${format}`;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename };
}
