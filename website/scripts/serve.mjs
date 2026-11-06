/* Serve dist/ the way Vercel or Netlify do: /trust -> trust/index.html,
   the 301s in _redirects, unknown paths -> 404.html with status 404, and byte
   ranges for the film (Safari needs them to play video). For local preview
   and the e2e tests.
     node scripts/serve.mjs [port]            (default 4173) */
import { createServer } from 'node:http';
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = +(process.argv[2] || 4173);
let REDIRECTS = [];
try {
  REDIRECTS = readFileSync(join(root, '_redirects'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
} catch { /* no redirects file */ }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

async function file(p) {
  try { const s = await stat(p); return s.isFile() ? { p, size: s.size } : null; } catch { return null; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);
  if (path === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  const moved = REDIRECTS.find(([from]) => from === path);
  if (moved) { res.writeHead(+moved[2] || 301, { Location: moved[1] + url.search }); res.end(); return; }
  const base = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  const hit = await file(join(base, 'index.html')) || await file(base) || await file(base + '.html');
  const f = hit || await file(join(root, '404.html'));
  const type = TYPES[extname(f.p)] || 'application/octet-stream';
  const range = hit && req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    const start = range[1] ? +range[1] : 0, end = range[2] ? Math.min(+range[2], f.size - 1) : f.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${f.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(f.p, { start, end }).pipe(res);
  }
  res.writeHead(hit ? 200 : 404, { 'Content-Type': type, 'Content-Length': f.size, 'Accept-Ranges': 'bytes' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(f.p).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('serving dist on http://127.0.0.1:' + port));
