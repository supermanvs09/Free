/*
 * AWS errors as a customer should read them.
 *
 * A scanner error arrives as AWS wrote it: "User: arn:aws:sts::<our account>:
 * assumed-role/<our task role>/<session> is not authorized to perform
 * sts:AssumeRole on resource: arn:aws:iam::<their account>:role/<their role>".
 * That names our infrastructure, which customers must not see, and says
 * nothing about what to do. Known errors become a plain sentence about the
 * customer's own account and role; anything else keeps its text with our
 * identity removed.
 */

const ROLE_ARN = /arn:aws[a-z-]*:iam::(\d{12}):role\/([\w+=,.@/-]+)/;
/* The caller (always our side): an STS assumed-role or IAM user/role ARN. */
const CALLER = /\bUser:\s*arn:aws[a-z-]*:(?:sts|iam)::\d{12}:[\w+=,.@/:-]+\s*/gi;
const ANY_STS = /arn:aws[a-z-]*:sts::\d{12}:[\w+=,.@/:-]+/gi;

function target(text) {
  const m = text.match(ROLE_ARN);
  if (!m) return { account: '', role: '' };
  return { account: m[1], role: m[2].split('/').pop() };
}

const where = ({ account, role }) => (account ? `AWS account ${account}${role ? ` (role ${role})` : ''}` : role ? `the role ${role}` : 'your AWS account');

/** A customer-safe, actionable version of an AWS / scanner error message. */
export function customerAwsError(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return text;
  const t = target(text);

  if (/ExternalId/i.test(text)) {
    return `We could not sign in to ${where(t)}: the external ID does not match. Re-run the connection check in Integrations, or update the role's trust policy with the external ID shown there.`;
  }
  if (/AssumeRole/i.test(text) && /(AccessDenied|not authorized)/i.test(text)) {
    return `We could not sign in to ${where(t)}. AWS refused access to the role: it may have been deleted, renamed, or its trust policy changed. Check the role in AWS, then run the connection check again in Integrations.`;
  }
  if (/NoSuchEntity|cannot be found|does not exist/i.test(text) && t.role) {
    return `The role ${t.role} no longer exists in AWS account ${t.account}. Recreate it from the setup template, then run the connection check again.`;
  }
  if (/Throttl|Rate exceeded|TooManyRequests/i.test(text)) {
    return 'AWS asked us to slow down for a moment. Nothing is wrong with the connection; try the sync again in a few minutes.';
  }
  if (/ExpiredToken|RequestExpired|InvalidClientTokenId|SignatureDoesNotMatch/i.test(text)) {
    return 'AWS turned down a sign-in that had expired. This is usually temporary; try the sync again.';
  }
  if (/OptInRequired|RegionDisabled|not enabled for this account|region .* is (?:disabled|not enabled)/i.test(text)) {
    return `A region selected for ${where(t)} is not enabled in AWS. Remove it from the account's regions in Integrations, or enable it in AWS.`;
  }
  return text.replace(CALLER, '').replace(ANY_STS, 'the scanner').replace(/\s{2,}/g, ' ').trim();
}
