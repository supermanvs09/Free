/*
 * Folds the Vite build into one HTML file:
 *   dist/index.html        a complete standalone page
 *   dist/console.html      the same page without the document skeleton, as
 *                          the page publisher expects (it adds its own)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const read = (href) => readFileSync(join(dist, href.replace(/^\//, '')), 'utf8');

let css = '';
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  css += read(href);
  return '';
});
let js = '';
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  js += read(src);
  return '';
});
const safeJs = js.replace(/<\/script/gi, '<\\/script');
const safeCss = css.replace(/<\/style/gi, '<\\/style');

const full = html
  .replace('</head>', () => `<style>${safeCss}</style>\n</head>`)
  .replace('</body>', () => `<script type="module">${safeJs}</script>\n</body>`);
writeFileSync(join(dist, 'index.html'), full);

const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1]
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '');
const body = /<body>([\s\S]*?)<\/body>/.exec(html)[1];
const fragment = `${head.trim()}\n<meta name="description" content="Non-human identity security across AWS, Azure, GitHub, Bitbucket and HashiCorp Vault." />\n<style>${safeCss}</style>\n${body.trim()}\n<script type="module">${safeJs}</script>\n`;
writeFileSync(join(dist, 'console.html'), fragment);
console.log(`inlined: ${(full.length / 1024).toFixed(0)} KB`);
