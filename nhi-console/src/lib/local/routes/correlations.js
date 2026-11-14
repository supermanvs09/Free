/* Blast radius and who-can-assume, from the credential and permission graph. */
import { ok, fail } from '../util';
import { identityByArn, credentialByArn, credentialsOf, identitiesOf, identityById, visible, eventsOf } from '../world';
import { permissionsOf } from '../permissions';

function reach(identity) {
  const perms = permissionsOf(identity);
  const resources = new Map();
  for (const p of perms) {
    const arn = p.resource_arn || '*';
    const e = resources.get(arn) ?? { arn, resource_arn: arn, resource_type: arn === '*' ? 'Any resource' : arn.split(':')[2] ?? identity.provider, actions: [], access_level: 'read', sensitive: /secret|kms|key|vault|payments|ledger|cards/i.test(arn) };
    e.actions.push(p.action);
    if (!/^(Get|List|Describe|Read)|:(Get|List|Describe)|read/i.test(p.action)) e.access_level = 'write';
    if (p.action === '*' || p.action.includes('roleAssignments/write') || p.action.includes('Administer') || p.action.includes('sudo')) e.access_level = 'admin';
    resources.set(arn, e);
  }
  return [...resources.values()];
}

export default function register(r) {
  r.get('/api/v1/correlations/blast-radius/*arn', ({ params }) => {
    const arn = params.arn;
    const cred = credentialByArn(arn);
    const identity = identityByArn(arn) ?? (cred ? identitiesOf(cred)[0] : null);
    if (!identity || !visible(identity)) return fail(404, 'Nothing in scope has that ARN.', 'NOT_FOUND');
    const res = reach(identity);
    const admin = res.some((x) => x.access_level === 'admin');
    return ok({
      subject: { arn, name: cred?.name ?? identity.name, type: cred ? cred.credential_type : identity.identity_type, provider: identity.provider },
      risk_level: admin ? 'CRITICAL' : res.some((x) => x.sensitive && x.access_level === 'write') ? 'HIGH' : res.some((x) => x.sensitive) ? 'MEDIUM' : 'LOW',
      summary: { resources: res.length, sensitive: res.filter((x) => x.sensitive).length, write: res.filter((x) => x.access_level !== 'read').length, admin, accounts: 1 + (credentialsOf(identity).some((c) => c.has_external_trust) ? 1 : 0) },
      resources: res,
      reachable_identities: credentialsOf(identity).flatMap((c) => identitiesOf(c)).filter((i) => i.id !== identity.id).map((i) => ({ arn: i.arn, name: i.name, provider: i.provider })),
      computed_at: new Date().toISOString(),
    });
  });

  r.get('/api/v1/correlations/who-can-assume/*arn', ({ params }) => {
    const cred = credentialByArn(params.arn);
    if (!cred) return ok({ principals: [], paths: [] });
    const principals = identitiesOf(cred).filter(visible).map((i) => ({ arn: i.arn, name: i.name, type: i.identity_type, provider: i.provider, depth: 1, via: cred.name }));
    if (cred.external_principal) principals.push({ arn: cred.external_principal, name: cred.external_principal, type: 'external', depth: 1, via: 'trust policy', external: true });
    return ok({ principals, paths: principals.map((p) => [p.arn, cred.arn]) });
  });

  r.get('/api/v1/correlations/identities/:id/credentials', ({ params }) => {
    const i = identityById(params.id);
    if (!i || !visible(i)) return fail(404, 'Not in scope.', 'NOT_FOUND');
    const used = new Set(eventsOf(i).slice(0, 500).map((e) => e.credential_id));
    return ok({ credentials: credentialsOf(i).map((c) => ({ arn: c.arn, name: c.name, type: c.credential_type, provider: c.provider, used_recently: used.has(c.id) })) });
  });
}
