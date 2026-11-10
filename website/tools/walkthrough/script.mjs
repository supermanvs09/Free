/* The walkthrough, as segments. Each starts from a fresh page load so it can be
   recorded (and re-recorded) on its own; make-video.sh joins them in ORDER.
   `phone` and `tablet` are recorded at their own sizes and shown side by side. */
export const ORDER = ['home', 'cirm', 'fraud', 'nhi', 'zenstra', 'ad', 'more', 'devices'];

const NAV = 'nav[aria-label="Primary"]';

/* Scroll through a page, stopping at each selector for `hold` seconds. */
async function tour(R, stops) {
  for (const [sel, hold = 1.6, off] of stops) {
    const to = sel === 'bottom' ? 'bottom' : sel;
    const y0 = await R.page.evaluate(() => scrollY);
    const y1 = to === 'bottom' ? await R.page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
      : await R.page.evaluate(([s, o]) => { const el = document.querySelector(s); return el ? el.getBoundingClientRect().top + scrollY - o : null; }, [to, off ?? 110]);
    if (y1 == null) throw new Error('tour: no ' + sel);
    const d = Math.abs(y1 - y0);
    await R.scrollTo(to, Math.min(2.6, Math.max(0.9, d / 1100)), off);
    await R.wait(hold);
  }
}

export const SEGMENTS = {
  async home(R) {
    await R.open('/');
    R.label('Home', 'Identity security for the AI era');
    await R.wait(3.4);
    await R.move(`text:${NAV}>>Products`, 1.0); await R.wait(2.4);
    await R.move(`text:${NAV}>>Solutions`, 0.6); await R.wait(1.4);
    await R.move({ x: 1500, y: 960 }, 0.7);
    // the CIRM platform view: pick two stages
    await tour(R, [['#how-h', 1.2, 120], ['#how .pl', 2.6, 130]]);
    await R.move('#how button[aria-label="Stage 5: Step up · Hold"]', 0.8); await R.click(2.2);
    await R.move('#how button[aria-label="Stage 6: Contain"]', 0.5); await R.click(2.2);
    await R.move({ x: 1700, y: 1000 }, 0.6);
    // why now: people turning into machine identities
    await tour(R, [['#now-h', 6.0, 260]]);
    // the platform and what it connects to
    await tour(R, [['#platform-h', 3.4, 120], ['#perimeter-h', 1.2, 140], ['[data-i="0"]', 6.5, 160], ['[data-i="1"]', 6.5, 160], ['[data-i="2"]', 6.5, 160]]);
    await tour(R, [['#roles-h', 1.2, 120]]);
    await R.move('[role=tablist][aria-label="Roles"] [role=tab]:nth-child(2)', 0.9); await R.click(2.6);
    await R.move({ x: 1780, y: 1000 }, 0.6);
    await tour(R, [['#inc-h', 4.0, 140], ['bottom', 2.0]]);
  },

  async cirm(R) {
    await R.open('/adapid-ai');
    R.label('adapID AI · CIRM', 'Continuous identity risk management');
    await R.wait(4.2);
    await R.move({ x: 1600, y: 980 }, 0.6);
    await tour(R, [['#pipe-h', 1.0, 120], ['section:has(#pipe-h) .pl', 5.0, 130], ['#itdr-h', 2.4, 120]]);
    await R.scrollBy(1100, 2.2); await R.wait(4.2);
    await R.scrollBy(1100, 2.2); await R.wait(3.6);
    await tour(R, [['#fam-h', 2.6, 120]]);
    await R.scrollBy(1200, 2.4); await R.wait(2.8);
  },

  async fraud(R) {
    await R.open('/adapid-ai/fraud-prevention');
    R.label('Identity Fraud Prevention', 'One session, from opening the app to paying');
    await R.wait(2.4);
    await tour(R, [['figure.jy', 23.5, 100]]);   // the mobile session plays through all six steps
    await R.move('figure.jy [role=tab]:nth-of-type(2)', 0.9); await R.click(0.4);
    R.label('Internet banking', 'Stolen credentials, a script on the keyboard and mouse');
    await R.wait(23);
    await R.move({ x: 1700, y: 1000 }, 0.6);
    await tour(R, [['#mob-h', 1.2, 120]]);
    await R.scrollBy(500, 1.2); await R.wait(2.4);
    await R.move('text:Scam signals', 0.8); await R.click(4.0);
    await tour(R, [['#web-h', 3.6, 120], ['bottom', 1.6]]);
  },

  async nhi(R) {
    await R.open('/adapid-ai/nhi-security');
    R.label('NHI Security for AWS', 'Every machine identity, found and scored');
    await R.wait(3.6);
    await tour(R, [['#lin-h', 1.0, 120], ['section:has(#lin-h) figure', 6.0, 130], ['#wb-h', 3.6, 120], ['#gu-h', 3.0, 120]]);
  },

  async zenstra(R) {
    await R.open('/agentic-ai/agentic-identity');
    R.label('Zenstra AI', 'Security for AI agents');
    await R.wait(3.6);
    await tour(R, [['#where-h', 2.2, 140], ['#con-h', 1.0, 120], ['section:has(#con-h) figure', 4.2, 130], ['#caps-h', 1.2, 120]]);
    for (const n of [2, 3]) { await R.move(`[aria-label="Zenstra capabilities"] [role=tab]:nth-of-type(${n})`, 0.7); await R.click(2.4); }
    await R.move({ x: 1600, y: 1000 }, 0.5);
    await tour(R, [['#chg-h', 3.0, 120]]);
  },

  async ad(R) {
    await R.open('/ad-security');
    R.label('Active Directory Security', 'Between every identity and Tier 0');
    await R.wait(3.2);
    await tour(R, [['#how-h', 1.0, 120], ['section:has(#how-h) figure', 4.0, 130], ['#tech-h', 2.4, 120], ['#fix-h', 2.6, 120]]);
  },

  async more(R) {
    await R.open('/botshield-ai');
    R.label('BotShield AI', 'Exposure, bots and DDoS');
    await R.wait(3.2);
    await R.scrollBy(1400, 2.6); await R.wait(2.6);
    await R.nav('/dpdpa-compliance');
    R.label('ICMS Compliance Suite', 'DPDPA compliance');
    await R.wait(3.2);
    await R.scrollBy(1400, 2.6); await R.wait(2.6);
    await R.nav('/products');
    R.label('All products', 'Filter by what you need to protect');
    await R.wait(3.0);
    await R.scrollBy(1000, 2.2); await R.wait(2.0);
    await R.nav('/request-demo');
    R.label('Book a demo', 'The agenda follows the product you choose');
    await R.wait(3.6);
  },

  async phone(R) {
    await R.open('/');
    await R.wait(2.5);
    await tour(R, [['#how-h', 1.0, 90], ['#how .pl', 4.0, 100], ['#now-h', 4.5, 520]]);
    await R.move('nav[aria-label="Quick actions"] button', 0.6); await R.click(2.6);
    await R.move('#mobile-menu button[aria-label="Close menu"]', 0.5); await R.click(1.0);
    await R.nav('/adapid-ai/fraud-prevention');
    await R.wait(1.6);
    await tour(R, [['figure.jy', 10, 80]]);
  },
  async tablet(R) {
    await R.open('/');
    await R.wait(2.5);
    await tour(R, [['#how-h', 1.6, 110], ['#platform-h', 2.4, 110]]);
    await R.scrollBy(1500, 2.6); await R.wait(1.0);
    await R.scrollTo(0, 1.6); await R.wait(0.6);
    await R.move('button[aria-controls="mobile-menu"]', 0.6); await R.click(2.4);
    await R.move('button[aria-controls="mobile-menu"]', 0.4); await R.click(1.0);
    await R.nav('/agentic-ai/agentic-identity');
    await R.wait(2.2);
    await R.scrollBy(1400, 2.6); await R.wait(1.2);
    await R.scrollBy(1600, 2.6); await R.wait(1.2);
  },
};
