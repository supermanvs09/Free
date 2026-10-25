// Renders every route in PATHS to static HTML, plus 404.html, sitemap.xml and
// robots.txt. Fails the build if a page has no H1 or more than one.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { render, PATHS } = await import(pathToFileURL(join(root, 'dist-ssr/entry-server.js')).href);
const template = readFileSync(join(dist, 'index.html'), 'utf8');
const site = (process.env.VITE_SITE_URL || 'https://deepalgorithms.io').replace(/\/$/, '');

const errors = [];
async function page(url, file) {
  const { html, head } = await render(url);
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) errors.push(`${url}: ${h1} <h1>`);
  const out = join(dist, file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, template.replace('<!--app-head-->', head).replace('<!--app-html-->', html));
}

for (const url of PATHS) await page(url, url === '/' ? 'index.html' : `${url.slice(1)}/index.html`);
await page('/404', '404.html');
if (errors.length) { console.error('Prerender failed:\n' + errors.join('\n')); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PATHS.map((p) => `  <url><loc>${site}${p === '/' ? '/' : p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
console.log(`Prerendered ${PATHS.length} pages + 404.html, sitemap.xml, robots.txt`);
