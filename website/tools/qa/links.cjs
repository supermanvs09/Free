// Every internal link and #anchor on every page resolves; lists external links for a manual check.
// node tools/qa/links.cjs http://127.0.0.1:4173 dist/sitemap.xml external.txt
const { chromium } = require('playwright'); const fs = require('fs');
const BASE = process.argv[2];
(async () => {
  const sm = fs.readFileSync(process.argv[3], 'utf8');
  const routes = [...sm.matchAll(/<loc>https:\/\/deepalgorithms\.io([^<]*)<\/loc>/g)].map((m) => m[1] || '/');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const links = new Map(); const ext = new Set(); const buttons = [];
  for (const r of routes) {
    await p.goto(BASE + r, { waitUntil: 'networkidle' });
    const hs = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
    for (const h of hs) {
      if (/^https?:/.test(h)) ext.add(h); else if (/^(mailto|tel):/.test(h)) continue;
      else { const k = h.startsWith('#') ? r + h : h; if (!links.has(k)) links.set(k, r); }
    }
    // buttons with no accessible name or no handler-free role
    const nameless = await p.evaluate(() => [...document.querySelectorAll('button, a[href]')].filter((e) => !(e.getAttribute('aria-label') || e.textContent.trim() || e.querySelector('img[alt]:not([alt=""])'))).length);
    if (nameless) buttons.push(`${r}: ${nameless} controls without a name`);
  }
  const bad = [];
  for (const [h, from] of links) {
    const [path, anchor] = h.split('#'); const url = BASE + (path || '/');
    const res = await p.goto(url, { waitUntil: 'domcontentloaded' });
    if (!res || res.status() >= 400) { bad.push(`${h} (from ${from}) -> ${res && res.status()}`); continue; }
    if (anchor) { await p.waitForTimeout(150); const ok = await p.evaluate((a) => !!document.getElementById(decodeURIComponent(a)), anchor); if (!ok) bad.push(`${h} (from ${from}) -> missing #${anchor}`); }
  }
  console.log('internal targets', links.size, 'broken', bad.length); bad.forEach((x) => console.log('  ', x));
  console.log('external links', ext.size); fs.writeFileSync(process.argv[4], [...ext].join('\n'));
  buttons.forEach((x) => console.log('  ', x));
  await b.close();
})();
