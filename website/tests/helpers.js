import { readFileSync } from 'node:fs';

/* Every public route, read from the sitemap the build writes. */
export const ROUTES = readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8')
  .match(/<loc>[^<]+<\/loc>/g).map((l) => new URL(l.slice(5, -6)).pathname);

export const PRODUCT_PAGES = ['/agentic-ai/agentic-identity', '/adapid-ai', '/adapid-ai/nhi-security', '/adapid-ai/fraud-prevention', '/ad-security', '/dpdpa-compliance'];

/* Record console and page errors for a test. */
export function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return errors;
}

/* Scroll through the page so every reveal, picture and lazy image gets its turn. */
export async function scrollThrough(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 700) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/* Wait until React has hydrated the page (Reveal marks <html> with .io on mount),
   so key presses reach the app rather than the prerendered HTML. */
export const hydrated = (page) => page.waitForFunction(() => document.documentElement.classList.contains('io'));
