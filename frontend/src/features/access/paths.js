import { FORMER, PROVIDERS } from '../../data/world';

/*
 * Attack paths: chains of trust between identities in different
 * applications, from something easy to steal (a CI token, a PAT, an app
 * password, a leaked key) to something that matters (admin, production data).
 */
const ENTRY_TYPES = new Set(['github.pat', 'github.actions', 'github.deploykey', 'bitbucket.apppassword', 'bitbucket.pipelines', 'bitbucket.repotoken', 'vault.token', 'vault.approle']);

export function findAttackPaths(view) {
  const exposedIds = new Set(view.exposures.filter((x) => x.status === 'open').map((x) => x.identityId));
  const out = [];
  const seen = new Set();
  for (const start of view.identities) {
    if (!ENTRY_TYPES.has(start.type) && !exposedIds.has(start.id)) continue;
    const stack = [[start]];
    while (stack.length) {
      const chain = stack.pop();
      const last = chain.at(-1);
      const next = (last.links || []).filter((l) => l.to).map((l) => ({ node: view.idById.get(l.to), label: l.label })).filter((n) => n.node && !chain.includes(n.node));
      if (!next.length || chain.length >= 4) {
        if (chain.length < 2) continue;
        const end = chain.at(-1);
        const crossApp = new Set(chain.map((c) => c.provider)).size > 1;
        if (!crossApp) continue;
        const key = chain.map((c) => c.id).join('>');
        if (seen.has(key)) continue;
        seen.add(key);
        const admin = chain.some((c) => c.permissions.adminLike);
        const prod = end.environment === 'prod';
        const leaked = exposedIds.has(start.id);
        const formerOwner = chain.some((c) => FORMER.some((p) => p.id === c.owner));
        const score = (admin ? 40 : 0) + (prod ? 20 : 0) + (leaked ? 30 : 0) + (formerOwner ? 10 : 0) + chain.reduce((s, c) => s + c.risk, 0) / chain.length / 2;
        const reach = end.resources?.[0];
        out.push({
          id: key,
          start,
          end,
          hops: chain,
          score,
          severity: score >= 80 ? 'critical' : score >= 55 ? 'high' : 'medium',
          leaked,
          admin,
          summary: `${PROVIDERS[start.provider].short} ${leaked ? 'credential already leaked' : 'credential'} reaches ${admin ? 'administrator access' : 'production'} in ${PROVIDERS[end.provider].short}${reach ? ` (${reach})` : ''}`,
        });
        continue;
      }
      for (const n of next) stack.push([...chain, n.node]);
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
