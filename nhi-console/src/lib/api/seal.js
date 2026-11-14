/**
 * Passwords go to the built-in service, which runs in this browser, so there
 * is nothing to encrypt them against. Kept as a function so the callers read
 * the same as they would against a remote sign-in service.
 */
export async function seal(value) {
  return String(value ?? '');
}
