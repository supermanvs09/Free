// Every route in dist/sitemap.xml at several widths: console errors, horizontal overflow, H1 count, text under 12px.
// node tools/qa/viewports.cjs http://127.0.0.1:4173 out.json 1920,1440,1280,768,390,360 dist
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2], OUT = process.argv[3];
const widths = (process.argv[4] || '1440,390').split(',').map(Number);
(async () => {
  const sm = fs.readFileSync(require('path').join(process.argv[5], 'sitemap.xml'), 'utf8');
  const routes = [...sm.matchAll(/<loc>https:\/\/deepalgorithms\.io([^<]*)<\/loc>/g)].map((m) => m[1] || '/');
  routes.push('/this-page-does-not-exist', '/ad-security', '/platform');
  const b = await chromium.launch(); const res = [];
  for (const w of widths) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    for (const r of routes) {
      const p = await ctx.newPage(); const errs = [];
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) errs.push(m.text().slice(0, 160)); });
      p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 160)));
      let st = 0; try { const x = await p.goto(BASE + r, { waitUntil: 'networkidle', timeout: 45000 }); st = x.status(); } catch (e) { errs.push('NAV ' + e.message.slice(0, 80)); }
      await p.waitForTimeout(500);
      const info = await p.evaluate(() => ({ url: location.pathname, h1: document.querySelectorAll('h1').length, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight,
        wide: [...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 2 && getComputedStyle(e).position !== 'fixed' && !e.closest('.overflow-x-auto, .no-scrollbar, .seg, .tabs-u, [class*=overflow-x], [class*=overflow-auto], .overflow-hidden'); }).slice(0, 3).map((e) => e.tagName + '.' + String(e.className).slice(0, 60)),
        small: [...document.querySelectorAll('main *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12 && e.getBoundingClientRect().width > 0).length }));
      res.push({ w, r, st, ...info, errs });
      if (errs.length || info.sw > info.cw + 1 || info.h1 !== 1 || st >= 400 && r !== '/this-page-does-not-exist' || info.wide.length) console.log(w, r, st, '->', info.url, 'h1', info.h1, 'sw', info.sw, info.cw, info.wide.join(' | '), errs.join(' || '));
      await p.close();
    }
    await ctx.close();
  }
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); console.log('done', res.length);
  const small = res.filter((x) => x.small > 0).map((x) => `${x.w}${x.r}:${x.small}`); console.log('text<12px', small.join(' '));
  await b.close();
})();
