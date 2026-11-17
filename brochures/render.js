// node render.js <page.html>...  — writes <page>.png (A4 @ 300 dpi) next to each page
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const file of process.argv.slice(2)) {
    const pg = await b.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 2 });
    await pg.goto('file://' + file, { waitUntil: 'networkidle' });
    await pg.evaluate(() => document.fonts.ready);
    const base = file.replace(/\.html$/, '');
    await pg.locator('.page').screenshot({ path: base + '.png' });
    // PDF is made from this PNG by build.py, so every viewer shows exactly the same colours.
    const over = await pg.evaluate(() => { const p = document.querySelector('.page');
      return [...p.children].reduce((s, c) => s + c.offsetHeight, 0) - p.clientHeight; });
    console.log(file.split('/').pop(), 'overflow px (<=0 ok):', over);
    await pg.close();
  }
  await b.close();
})();
