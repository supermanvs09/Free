/* Blast radius, who-can-assume and an identity's sign-in credentials: from
   the entitlement model (reach.js), the same one the access graph reads. */
import { ok, fail } from '../util';
import { identityById, visible } from '../world';
import { blastRadius, blastSubjects, whoCanAssume } from '../reach';

/* Identifiers travel in the path, where "//" and a leading "/" do not survive
   the router: jenkins://, vault://, saas:// and /subscriptions/... are put back. */
function normalize(arn) {
  const text = String(arn ?? '');
  if (/^[a-z]+:\/[^/]/.test(text)) return text.replace(':/', '://');
  if (text.startsWith('subscriptions/') || text.startsWith('tenants/')) return `/${text}`;
  return text;
}

export default function register(r) {
  r.get('/api/v1/correlations/blast-radius/*arn', ({ params }) => {
    const result = blastRadius(normalize(params.arn));
    if (!result) return fail(404, 'Nothing in scope has that ARN.', 'NOT_FOUND');
    return ok(result);
  });

  r.get('/api/v1/correlations/who-can-assume/*arn', ({ params }) => ok(whoCanAssume(normalize(params.arn))));

  r.get('/api/v1/correlations/identities/:id/credentials', ({ params }) => {
    const i = identityById(params.id);
    if (!i || !visible(i)) return fail(404, 'Not in scope.', 'NOT_FOUND');
    return ok({ credentials: blastSubjects(i) });
  });
}
