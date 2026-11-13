import axios from 'axios';

/**
 * Encrypts every API payload both ways when the service asks for it
 * (nhi-backend internal/platform/payloadcrypt, PAYLOAD_ENCRYPTION_ENABLED):
 *
 *   per request: random AES-256-GCM key K, RSA-OAEP-SHA256(K) -> header X-Enc-Key
 *   body:        { iv, data: AES-GCM(json), ts }, AAD "<METHOD> <path> <ts>"
 *   response:    { iv, data, ct } sealed with the same K, AAD "response <METHOD> <path>"
 *
 * Whether it is on comes from GET /api/v1/auth/payload-key, asked once, so the
 * setting can be switched on the server without a new console build.
 */
const KEY_PATH = '/api/v1/auth/payload-key';
const EXEMPT = [/\/api\/v1\/health$/, /\/api\/v1\/auth\/payload-key$/];

let settings = null;

const enc = new TextEncoder();
const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function loadSettings(baseURL) {
  settings ??= axios
    .get(`${baseURL || ''}${KEY_PATH}`, { timeout: 15000 })
    .then(async (res) => {
      const data = res?.data?.data ?? {};
      if (!data.enabled) return { enabled: false };
      if (!globalThis.crypto?.subtle) throw new Error('This console needs a secure (HTTPS) connection.');
      const publicKey = await crypto.subtle.importKey('spki', fromB64(data.key), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
      /* Paths the server leaves in the clear (PAYLOAD_ENCRYPTION_EXEMPT): sent
         plain, with no key header - they may be served by another service. */
      const exempt = (Array.isArray(data.exempt) ? data.exempt : []).map((p) => String(p).replace(/\/+$/, '')).filter(Boolean);
      return { enabled: true, publicKey, exempt };
    })
    .catch((error) => {
      settings = null; // ask again on the next request
      throw error;
    });
  return settings;
}

/* The path as the server sees it (Go's r.URL.Path is decoded): an ARN sent as
   %3A / %2F must be bound as ':' and '/', or both sides seal different AADs. */
const pathOf = (config) => {
  const raw = new URL(axios.getUri(config), window.location.origin).pathname;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

async function encryptRequest(config) {
  if (EXEMPT.some((re) => re.test(config.url || ''))) return config;
  const { enabled, publicKey, exempt } = await loadSettings(config.baseURL);
  if (!enabled) return config;
  const path = pathOf(config);
  if (exempt.some((p) => path === p || path.startsWith(`${p}/`))) return config;

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await crypto.subtle.exportKey('raw', key);
  const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, raw);
  config.headers['X-Enc-Key'] = toB64(wrapped);
  config._payloadKey = key;

  /* Keep the original body: a retried request (after a session renewal) is
     sealed again with its own new key. */
  if (!('_plainData' in config)) config._plainData = config.data;
  const plain = config._plainData;
  if (plain === undefined || plain === null || plain instanceof FormData) {
    /* No body at all: axios would otherwise send JSON "null". */
    config.data = plain instanceof FormData ? plain : undefined;
    return config;
  }
  const text = typeof plain === 'string' ? plain : JSON.stringify(plain);
  const ts = Date.now();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = enc.encode(`${(config.method || 'get').toUpperCase()} ${path} ${ts}`);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, enc.encode(text));
  config.data = { iv: toB64(iv), data: toB64(data), ts };
  config.headers['Content-Type'] = 'application/json';
  return config;
}

async function decryptResponse(response) {
  const config = response?.config;
  if (!response || !config?._payloadKey || response.headers?.['x-payload-encrypted'] !== '1') return response;
  let envelope = response.data;
  if (envelope instanceof Blob) envelope = JSON.parse(await envelope.text());
  else if (typeof envelope === 'string') envelope = JSON.parse(envelope);
  const aad = enc.encode(`response ${(config.method || 'get').toUpperCase()} ${pathOf(config)}`);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(envelope.iv), additionalData: aad },
    config._payloadKey,
    fromB64(envelope.data),
  );
  const type = envelope.ct || 'application/json';
  if (config.responseType === 'blob') {
    response.data = new Blob([plain], { type });
  } else {
    const text = new TextDecoder().decode(plain);
    response.data = type.includes('json') && text ? JSON.parse(text) : text;
  }
  response.headers['content-type'] = type;
  return response;
}

/** Adds the encryption to an axios instance; call before its other response interceptors. */
export function usePayloadCrypto(instance) {
  instance.interceptors.request.use(encryptRequest);
  instance.interceptors.response.use(decryptResponse, async (error) => {
    if (error?.response) {
      try {
        await decryptResponse(error.response);
      } catch {
        /* leave the error as it came */
      }
    }
    return Promise.reject(error);
  });
  return instance;
}
