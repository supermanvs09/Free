import client from './client';

/**
 * Encrypts a password before it leaves the browser, so a request body never
 * carries it as readable text (nhi-backend internal/platform/fieldcrypt):
 *
 *   ephemeral ECDH P-256 key pair, shared secret with the server's public key,
 *   HKDF-SHA256 (info "nhi-field-v1") -> AES-256-GCM over "<unix ms>:<value>"
 *   wire: "v1.<ephemeral public>.<iv>.<ciphertext>", base64url without padding
 *
 * Web Crypto exists only on HTTPS (and localhost), which the console needs anyway.
 */
let serverKey = null;

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromB64url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function loadServerKey() {
  const res = await client.get('/api/v1/auth/key');
  const raw = res?.data?.data?.key;
  if (!raw) throw new Error('The service did not publish its key.');
  return crypto.subtle.importKey('raw', fromB64url(raw), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

export async function seal(value) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Signing in needs a secure (HTTPS) connection.');
  }
  serverKey ??= loadServerKey().catch((error) => {
    serverKey = null; // try again next time
    throw error;
  });
  const server = await serverKey;
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: server }, eph.privateKey, 256);
  const hkdf = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('nhi-field-v1') },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(`${Date.now()}:${value}`));
  const pub = await crypto.subtle.exportKey('raw', eph.publicKey);
  return `v1.${b64url(pub)}.${b64url(iv)}.${b64url(ct)}`;
}
