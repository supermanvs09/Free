# deepalgorithms.io: Pre-Redesign Audit

Captured 2026-10-24 from the live production build (`index-DeuYRYUC.js`). Every page's full text, headings, links, images and form fields are in [`content/`](./content/).

**Method.** The site runs behind its own BotShield check (`/botdetect.js`), which returns 403 "Access Denied" to headless browsers. So I downloaded the public static build, served it locally with the bot check stubbed out and every external request blocked, and rendered all 30 routes at 1440px and 390px.

---

## 1. The uncomfortable summary

1. **The product story isn't consistent.** The site names 3 platforms in one place and 4 in another. The About page says "two flagship AI platforms, BotShield AI and adapID AI" and "3 Platforms". The home page shows 4 cards. The nav and footer show 3 (Zenstra, adapID, ICMS). **BotShield is missing from both the nav and the footer.** Its two pages can only be reached from one home-page card.
2. **Zenstra and adapID overlap.** The Zenstra card on the home page says "*adapID AI* governs every NHI". adapID's own page has a block titled "Fully Powered Zenstra Identity Security", repeated twice. A buyer can't tell which product secures AI agents.
3. **BotShield is pitched as two different products.** The home card says it is "bot defence built on behavioural intent, not signatures". `/botshield-ai` says it is an "agentic CTEM" red-team/blue-team platform. `/botshield-ai/ddos-protection` says it is an ISP-edge DDoS appliance. The privacy policy calls it "intelligent bot detection".
4. **The site has almost no SEO.** It's a client-rendered SPA. There is no robots.txt or sitemap.xml (both paths return the HTML shell), no meta description, and every page is titled "Deep Algorithms". The one exception is the Mythos blog post. Crawlers that don't run JavaScript see an empty `<div id="root">`. The BotShield gate likely blocks the ones that do.
5. **The legal pages undercut the compliance pitch.** The company sells DPDPA compliance, but its own privacy policy cites only the IT Act 2000 and the SPDI Rules 2011. It has no DPDPA notice structure, names no grievance officer, and describes the products using older positioning ("behavioral biometrics-based authentication").

---

## 2. Sitemap / IA (as built)

| Route | Page | In nav? | In footer? |
|---|---|---|---|
| `/` | Home | logo | — |
| `/agentic-ai/agentic-identity` | Zenstra AI Identity (agentic / NHI) | ✓ | ✓ |
| `/adapid-ai` | adapID AI: CIRM Platform | ✓ | ✓ |
| `/adapid-ai/fraud-prevention` | adapID: Unified Identity Fraud Prevention | ✓ | — |
| `/ad-security` | adapID: Active Directory Security (three.js, ~11.5k px) | ✓ | — |
| `/dpdpa-compliance` | ICMS Compliance Suite | ✓ | ✓ |
| `/botshield-ai` | BotShield AI: Agentic CTEM | **✗** | **✗** |
| `/botshield-ai/ddos-protection` | BotShield: DDoS Protection | **✗** | **✗** |
| `/about-us` | About | ✓ | ✓ |
| `/blogs` + 11 posts | "Intelligence" hub | ✓ | ✓ |
| `/contact` | Contact form + offices | — | ✓ |
| `/request-demo` | Demo form | ✓ (CTA) | — |
| `/privacy-policy`, `/cookie-policy`, `/terms-of-use` | Legal | — | ✓ |
| `*` | 404 | — | — |
| `/svg-export` | **Internal dev tool, publicly reachable** | — | — |
| `/verify` | Redirects to `/` (probably the bot-check landing) | — | — |

The nav "Platforms" mega-menu has 3 columns: Zenstra AI Security → Zenstra AI Identity · adapID AI → CIRM Platform, Active Directory Security, Unified Identity Fraud Prevention · ICMS Compliance Suite → Data Protection & Compliance.

---

## 3. Page-by-page section inventory (→ template candidates)

### Home (`/`), 7,463px desktop / 12,339px mobile
1. Hero: monospace eyebrow "ONE PLATFORM • EVERY IDENTITY • ZERO BLIND SPOTS". H1 "Secure every Human, Non‑Human & Agentic Identity." Subhead. Two CTAs (Request Demo / Explore Platform). Particle-network background.
2. Stats row: 83% ATO (Abnormal 2024) · 197 days dwell (IBM 2024) · 3× (Gartner CTEM 2025).
3. "Ahead of Every Threat. Autonomous Defence Layer.": 4 hover-reveal product cards (adapID, Zenstra, ICMS, BotShield).
4. "Engineered for the Attack That Hasn't Happened Yet.": radial dial selector (only 3 platforms; no BotShield) + Zenstra detail with live agent graph + 4 feature tiles.
5. "The Attack Surface Is Borderless": world-map background, 4 stat blurbs ($4.88M breach, compliance, $12.5B ATO, 94% bots bypass WAF).
6. "Continuous. Autonomous. Adaptive.": 5-step loop (Discover → Analyse → Prioritise → Respond → Evolve).
7. Intelligence: 3 blog cards.
8. "Trusted by": 2-row logo marquee (MeitY, DCB Bank, Karnataka Bank, Canara Bank, BhaktiVedanta Hospital, IIT Kanpur, IIT Mandi, IIIT Hyderabad, NCRTC, Silda, SDET, inMorphis, Seizure Tracker, CCoE, Corecys, FourthSquare, Vibho). Several tiles render blank.
9. Certifications: ISO 27001, SOC 2 Type II, HIPAA, GDPR, ISO/IEC 42001:2023, ISO/IEC 27701:2025.
10. Final CTA: "The threat is autonomous. Your defence should be too."
11. Footer.

### Product pages: they share a skeleton
All five product pages follow the same arc. That arc is the **Product template**:

`Breadcrumb/eyebrow → Hero (H1 + sub + CTA + live "console" mock widget) → Problem stats (3–4 big numbers w/ sources) → Platform/capabilities grid → Numbered lifecycle/how-it-works (5–6 steps) → "Why X" differentiators (4) → Industries served (4–6) → Proof stats → Closing CTA (+ link to sibling module)`

| Page | Hero widget | Unique sections |
|---|---|---|
| Zenstra `/agentic-ai/agentic-identity` | Live bot network | 6-risk tab explorer, 6-stage lifecycle tabs, 3 "industry first" primitives, posture score dashboard, **comparison table** (Trad IAM vs ISPM/ITDR vs Zenstra), "under the hood" animated explainer, audit & compliance block |
| adapID CIRM `/adapid-ai` | Identity risk card (score 41/100, signals feed) | Product video, ITDR-vs-CIRM before/after |
| adapID Fraud `/adapid-ai/fraud-prevention` | Transaction risk monitor (₹) | Lifecycle rail (6 stages), 4 coverage cards (numbered /001 /002 **/004 /003**, out of order), 5-signal decisioning engine, "part of adapID" module switcher |
| adapID AD `/ad-security` | three.js identity graph | Totally different visual language: all-caps, cinematic scroll story, attack-path hop simulator, technique tabs (Pass-the-Hash, Kerberoasting, Golden Ticket, AS-REP, DCSync, …) |
| ICMS `/dpdpa-compliance` | Personal Data Access Monitor (replayable) | Manual-vs-ICMS comparison, 5-step pipeline, regulatory stats (₹250 Cr, 72 h, 90 d) |
| BotShield `/botshield-ai` | Inbound traffic → engine → output | Product video, adversarial-AI vs agentic-defence comparison, 3-agent loop |
| BotShield DDoS `/botshield-ai/ddos-protection` | Multi-vector attack sim | 8 capability grid, edge architecture diagram, 6 industries |

### About (`/about-us`)
Hero with mission → story + pull-quote → company facts card (Founded 2022, Hyderabad HQ, focus market Global, "3 Platforms") → logos → **Leadership** (JP Mishra CEO, Manish Parganiha CTO, Dr. Amit Shukla CRO, Abhishek Tripathi Chief of Innovation) → **Mentors/Advisors** (8: Dr. Amarendra Sahoo, Yogesh Chadha, Prakash Govindan, Himanshu Singhal, Ajitesh Shukla, Amit Shukla, Dr. Anil Rachamalla, Dr. Satvasheel Powar) → Careers (hr@deepalgorithms.in) → 6 beliefs → Recognition marquee (DSCI, Bharat Mandapam, GITEX Dubai, T-Hub, Business Excellence Award…) → Team photo gallery (6) → logos again → contact + Google Maps.

### Blog hub (`/blogs`) and posts
- Hub: "Deep Algorithms Intelligence". **All 7 top articles are labelled "FEATURED"**, so the label means nothing. The "More articles" grid has 4 posts.
- Two post templates already exist:
  - **Research report**: eyebrow ("RESEARCH & SOLUTIONS REPORT · GLOBAL/INDIA FOCUS"), H1, author "Deep Algorithms Research Team", date, read time, 4-stat strip, numbered sections, Key Takeaways, "Path Forward" CTA. (Aflac Japan, AI agent governance, AI security, AI authority, identity security, mule accounts, Mythos.)
  - **Classic article**: tags, intro, H2 body. (CTEM fintech, CTEM+DPDPA, DDoS 2026.)
  - **Campaign series**: "Confessions of a Hacker · Entry 01" uses its own typewriter styling (Special Elite / Courier Prime / IM Fell English).
- Posts are hardcoded in the JS bundle, with no CMS. Every new post means a redeploy and makes the 2 MB bundle bigger.
- Author/date formats are inconsistent ("Feb 18,2026", "May 2026", "Deep Algorithms Intelligence Team" vs "Research Team" vs "Research").

### Conversion pages
- **Request Demo**: Full Name*, Company*, Product of Interest* (select: adapID AI, BotShield AI, ICMS; **Zenstra isn't an option**), Work Email*, Mobile*. Promises a reply "within one business day" and a "30-minute" live demo. It posts to `https://asu79c3171.execute-api.ap-south-2.amazonaws.com/dev/Das_website2`, a **`/dev` stage in production**.
- **Contact**: Name, Email, Subject, Message. **No field is required and no field has a `name` attribute.** Phone +91 7702846856, info@deepalgorithms.in. Offices: Hyderabad (Shanta Sriram Tech Park, Gachibowli 500032), Bangalore (Prestige Shantiniketan, Whitefield 560048), Maryland USA (23231 Aurora Hills Dr, Clarksburg MD 20871; "Clarks Burg" on the site is misspelled).

### Legal
Privacy (Mar 2026, IT Act/SPDI only), Cookie (strictly necessary only, bot-protection cookies), Terms (IT Act / Intermediary Rules 2021 language, oriented to behavioural biometrics). Legal entity: **Deep Algorithms Solution Pvt. Ltd.** Support: support@deepalgorithms.in.

---

## 4. Brand & design system (current)

- **Theme:** dark navy by default (`#030213`, `#04060A`), with a working light mode (toggle in the header and footer). Primary blue `#3B82F6`, accent cyan `#3ED8F0`, `#63A0FF`; status colours green `#34D399`, orange `#FF9A4D`/`#EA580C`, red `#FF5C5C`/`#DC2626`; slate neutrals `#94A3B8`, `#475569`.
- **Type:** 9 Google font families are loaded: Inter, DM Sans, DM Mono, Cormorant Garamond (italic taglines), Playfair Display, Syne, Special Elite, Courier Prime, IM Fell English. In practice the site uses **Inter (headings) + DM Sans (body) + DM Mono (eyebrows/labels)**, plus Cormorant italic for pull lines. The rest are unused or used only on the blog campaign page.
- **Motifs:** spaced-out mono eyebrows, particle/network backgrounds, "live console" UI mocks in every hero, big-number stat rows with source citations, numbered step rails, logo marquees.
- **Logo:** "DEEP ALGORITHMS" lockup with an "N/D" mark and the tagline **"Fostering AI. Connecting Minds."** Product marks: adapID (shield), Zenstra (4-point star), ICMS (shield), BotShield (robot).
- **Social:** LinkedIn `/company/deepalgorithms.in`. The **Twitter/X and YouTube icons link to `#`**. Meta references `@DeepAlgorithms`.

---

## 5. Defects & risks found

**Functional / content**
- BotShield is missing from the nav, the footer, the home dial selector, and the About page count.
- Zenstra is missing from the demo form's product list.
- Fraud page cards are numbered /001, /002, /004, /003.
- The adapID page repeats "Cross-System Intelligence" and "Fully Powered Zenstra Identity Security" word for word.
- "zenstra identity" appears in lowercase mid-sentence on the home page. The Zenstra page title reads "THE ZENSTRA IDENTITY CRISIS".
- "HOVER TO EXPLORE" on the product cards is meaningless on touch devices.
- Several "Trusted by" logo tiles render blank.
- The "Learn More →" button on the home Zenstra section has no destination.
- Domains are mixed: the site is `.io`, every email is `.in`, the bundle links to `deepalgorithms.com/intelligence/...`, and LinkedIn is `deepalgorithms.in`.
- Stat claims conflict across pages: 75% vs 61% for credential breaches (both cite Verizon DBIR), "4 hrs detection" vs "Day-1 detection", 94% bots bypass WAF (no source).

**Security / hygiene** (sensitive, given the market)
- `/svg-export` is a dev-only page shipped to production.
- The demo form posts to an API Gateway **`/dev`** stage.
- The bot check blocks legitimate crawlers, link-preview bots (LinkedIn, Slack, WhatsApp), and accessibility tools. Shared links likely unfurl with nothing.

**Performance**
- One 2.0 MB JS bundle (≈500 KB gzipped) holds every page, every blog post, and three.js-adjacent code.
- 108 MB of assets: a 34 MB product MP4, PNG blog images up to 9.3 MB each, and team photos at 2–3 MB.
- 9 font families requested.
- Rendering waits on `botdetect.js` before React mounts, so first paint depends on a third-party round-trip.

**SEO / accessibility**
- No per-page titles or descriptions, no OG images, no canonical tags, no structured data, no sitemap.
- Many `<img alt="">` on meaningful images. Fake `/100` gauges and animated counters have no text alternatives.
- The mobile home page is 12,339px tall, mostly because 4 product cards are nearly empty until hovered.

---

## 6. What this means for the template phase

Recommended template set (derived from what exists, not invented):

1. **Global shell**: header with a 4-product mega-menu (add BotShield), footer, theme toggle.
2. **Home**.
3. **Product overview**: the shared skeleton in §3, with slots for a hero widget, problem stats, capabilities, lifecycle, differentiators, industries, comparison table (optional), and CTA. It covers Zenstra, adapID CIRM, ICMS and BotShield.
4. **Product sub-module**: the same template plus a breadcrumb and a "part of X" sibling switcher. It covers Fraud Prevention, AD Security and DDoS.
5. **Company / About**.
6. **Blog hub** + **Research report post** + **Article post** (the Confessions series as a theme variant of Article).
7. **Form page** (Demo / Contact share one layout).
8. **Legal/prose**.
9. **404**.

Decisions needed before building templates:
- **Product architecture:** is it 4 products (Zenstra, adapID, ICMS, BotShield) or 3? Where does AI-agent security live? The redesign can't fix the IA until this is answered.
- **Stack:** should it stay a Vite SPA, or move to SSG/SSR (Astro/Next) to fix SEO and previews? I'd move. The current architecture is the cause of §5's SEO findings.
- **Blog source:** keep posts in the code, or move them to MDX/CMS files?
- **Visual direction:** keep the dark-navy "security console" language (it's distinctive and consistent across 5 of the 7 product pages), or reset? AD Security already diverges.

Note: `frontend-nhi-console.zip` / `nhi-backend-merged.zip` in this repo are the NHI product console and backend, not the marketing site. The site's source is not in this repo.
