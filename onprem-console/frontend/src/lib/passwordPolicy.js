/**
 * The console's password rule, the same as the server's
 * (internal/platform/passwordpolicy): 12 to 72 characters with an upper-case
 * letter, a lower-case letter, a number and a symbol, and no space at either end.
 */
export const PASSWORD_RULE = '12-72 characters with an upper-case letter, a lower-case letter, a number and a symbol.';

export function passwordProblem(value) {
  const pw = String(value ?? '');
  if (pw.length < 12 || pw.length > 72) return 'Use 12 to 72 characters.';
  if (pw.trim() !== pw) return 'The password cannot start or end with a space.';
  const missing = [
    !/\p{Lu}/u.test(pw) && 'an upper-case letter',
    !/\p{Ll}/u.test(pw) && 'a lower-case letter',
    !/\p{Nd}/u.test(pw) && 'a number',
    !/[\p{P}\p{S}]/u.test(pw) && 'a symbol',
  ].filter(Boolean);
  if (!missing.length) return '';
  return `Add ${missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`}.`;
}
