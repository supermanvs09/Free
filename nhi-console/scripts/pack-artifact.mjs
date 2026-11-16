/*
 * Packs dist-artifact/ into one HTML file that runs anywhere a single page can
 * (a Claude Artifact): script, styles and brand images inlined.
 *   npm run build:artifact  ->  dist-artifact/nhi-console.html
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('dist-artifact');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const jsFile = /<script[^>]+src="\/?(assets\/[^"]+\.js)"/.exec(html)[1];
const cssFile = /<link[^>]+href="\/?(assets\/[^"]+\.css)"/.exec(html)[1];
let js = fs.readFileSync(path.join(dir, jsFile), 'utf8');
let css = fs.readFileSync(path.join(dir, cssFile), 'utf8');
const themeInit = fs.readFileSync(path.join(dir, 'theme-init.js'), 'utf8');

const dataUri = (file) => `data:image/png;base64,${fs.readFileSync(path.join(dir, 'brand', file)).toString('base64')}`;
for (const file of fs.readdirSync(path.join(dir, 'brand'))) {
  const uri = dataUri(file);
  js = js.split(`/brand/${file}`).join(uri);
  css = css.split(`/brand/${file}`).join(uri);
}
/* Encoding-proof: every non-ASCII character escaped, so the page reads the
   same whatever character set it is served with. */
js = js.replace(/[^\x00-\x7f]/gu, (ch) => [...ch].map((c) => {
  const code = c.codePointAt(0);
  return code > 0xffff ? `\\u{${code.toString(16)}}` : `\\u${code.toString(16).padStart(4, '0')}`;
}).join(''));
css = css.replace(/[^\x00-\x7f]/gu, (ch) => `\\${ch.codePointAt(0).toString(16)} `);
/* A literal closing tag inside the script would end it early. */
js = js.replace(/<\/script/gi, '<\\/script');
css = css.replace(/<\/style/gi, '<\\/style');

const out = `<meta charset="utf-8">
<title>NHI Console</title>
<meta name="description" content="Non-human identity security console: discovery, posture, access graph, blast radius and live response scenarios.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<script>${themeInit}</script>
<style>${css}
html, body { min-height: 100%; }
body { background: var(--t-canvas); }
</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
const target = path.join(dir, 'nhi-console.html');
fs.writeFileSync(target, out);
console.log(`${target} ${(Buffer.byteLength(out) / 1024 / 1024).toFixed(2)} MB`);
