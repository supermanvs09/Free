# Website Audit — react-uat.adapid.link

Audit date: 6 November 2026 · Audited build: the UAT deployment of this repository (identical to `deliverables/deepalgorithms-website.zip`), React 19 + Vite 8 + Tailwind 4, prerendered to 41 static pages.

## Method

1. **Every route.** The 41 URLs in the live `sitemap.xml` plus a deliberate 404 were crawled with Playwright at 1440×900 and 390×844. For each one I recorded the HTTP status, load time, `<title>`, meta description, the H1, all H2s, the H3 count, the number of buttons, forms and images, images without `alt`, horizontal overflow, page height, word count, distinct font sizes and console errors. Raw results: `screenshots/before/` (hero frame plus an all-screens overview for every major route at desktop, and for 7 routes at mobile).
2. **Every interaction.** I worked through the navigation menus (Products, Solutions, language, search), the mobile bar, the jump bars, tabs, accordions, carousels, the forms (demo, contact) and the Prompt Heist teaser.
3. **The source.** I read the routing (`App.jsx`), shared components, design tokens (`styles.css`), data files (`src/data/*`), the build and prerender scripts, and the e2e tests.
4. **Facts.** I checked content claims against the repository's own data files, which are the only authoritative internal source available. The production domain (deepalgorithms.io) still runs the older site and blocks automated visitors (its own BotShield protection), so it could not be used for cross-checking. Anything not verifiable here is flagged under **Content and credibility**.

### Technical baseline (good news)

| Check | Result |
|---|---|
| HTTP status | 41/41 routes return 200; the unknown route returns a real 404 |
| Console errors | 0 on every page (the 404 page logs the expected failed request) |
| Horizontal overflow | None at 1440 or 390 |
| Images without `alt` | 0 |
| H1 per page | Exactly one everywhere (enforced by `scripts/prerender.mjs`) |
| Prerendered HTML | Every page ships complete HTML; content is readable without JavaScript |

The codebase is technically sound. **The problems are in information architecture, visual system, page composition and product storytelling**, not in the plumbing. Those are the subject of this audit.

---

## Site-wide findings

### S1. The product hierarchy is inconsistent and confusing — critical
- `/adapid-ai` is **both** the adapID AI family page and the *Continuous Identity Risk Management* product page. Its H1 is CIRM's ("A live risk score for every identity…"), yet the page also carries "Four products for human and machine identities". A buyer cannot tell whether they are on the platform page or a product page.
- Active Directory Security lives at `/ad-security`, outside the `/adapid-ai/…` path its sibling products use. The URL tree, breadcrumbs and menus disagree with each other.
- The homepage says "One platform. Three product lines." The products page says "A product for every way attackers get in." The menu shows "Platforms" with "4 products" and "Platform" tags. The footer lists adapID AI, Zenstra AI and ICMS, then three adapID sub-products without CIRM. The same portfolio is described four different ways.
- The Zenstra AI overview lives at `/agentic-ai/agentic-identity`, a URL that names neither the product nor the overview.

### S2. Every product page uses the same long template — high
- Product pages are 8,000–11,600 px on desktop and 11,800–17,000 px on mobile, with 9–13 sections each. Every one follows the same template: dark navy hero → "Protects / Stops / Deploys / Shows" strip → logo marquee → tabs → comparison table → story card with a stock photo → statistic cards → FAQ → three blog cards → blue gradient CTA → "Works alongside" chips.
- The six Zenstra capability pages are the same 4,300 px template with only the copy changed.
- The four industry pages share one template too: photo hero, one scene, three statistics, four numbered cards, blogs, CTA.
- Result: pages feel interchangeable and long; the key product moment is buried.

### S3. Dark islands inside light pages — high
The token system is dark-first. Light "sheets" invert the colour variables for each section, while product pictures and anything marked `.tone-d` stay dark. Every page therefore alternates navy heroes, light sections, dark dashboard islands and blue gradient CTA slabs, then ends in a graphite footer. This is the opposite of the brief's "refined light-theme foundation". It also forces two copies of every colour token, and two sets of contrast decisions for each component.

### S4. No type scale in practice — high
Distinct font sizes per page reach **28** (CIRM), **27** (Agent access), **33–37** (solutions and articles). Utility classes such as `text-[13.5px]`, `text-[14.5px]` and `text-[15.5px]` are used inline throughout. Headings are sized well, but body, caption and UI text drift by half-pixels, so hierarchy reads as noise.

### S5. The Prompt Heist teaser covers content on every page — high
A 260×110 px dark card ("I am guarding a secret. Bet you cannot get it.") is pinned bottom-right on every page and every screen (visible in all overview captures). On mobile it sits above a second fixed bar (Menu / Search / Call / Book a demo). It competes with the primary CTA and obscures content, which is a conversion and accessibility problem. The challenge itself is good recruitment and brand material; it belongs in Resources and the utility bar, not over the content.

### S6. Decorative visuals where product evidence should be — medium
- The homepage "One platform" section is an orbit of integration logos around the mark. It shows that things connect, not what the product does.
- Each CTA band shows three product icons floating over a blue gradient.
- Story cards use stock photographs of models with "Flagged" and "Verified" pills.
- `Stage3D` tilts product pictures in 3D, which makes small UI text harder to read.

### S7. Navigation — medium
- The Products menu is good in content (grouped items with one line each, a "works with" panel), but it lists "Platforms" and "adapID AI products" with no route for CIRM except `/adapid-ai`.
- Solutions mixes "by use case" links that all point to product pages with "by industry" links.
- There is no Resources or Company menu. "Blogs" and "Why Deep Algorithms" are bare links, and Leadership, Careers and Contact are only reachable as footer anchors into one long page.
- The utility bar (phone, search, language, Prompt Heist announcement) adds a second 40 px row from 1024 px up.

### S8. Trust evidence mixes kinds of relationship — high (credibility)
- The "Trusted by banks, government and enterprises across India" marquee shows 17 logos together: banks (Canara, Karnataka, DCB), a ministry (MeitY), academic institutes (IIT Kanpur, IIT Mandi, IIIT Hyderabad), a centre of excellence (CCoE), a hospital, and small companies.
- Some may be customers, some pilots or partners, some academic collaborators (an advisor is Dean at IIT Mandi; the CRO is chairperson there). Labelling all of them "trusted by" implies a customer relationship that is not documented in the repository. See **Content and credibility**.

### S9. Mobile — medium
- Everything is centre-aligned on mobile, including long paragraphs and bullet lists. This is hard to read beyond two lines.
- Product pictures shrink to illegible sizes (8–9 px UI text) or scroll sideways.
- Pages reach 17,000 px.
- Two fixed bottom elements (MobileBar plus the Heist teaser) cover about 20% of the viewport.

### S10. Accessibility — medium
- **Headings:** H2s on articles and legal pages end in a visible "#" anchor that is part of the heading text ("The Scale of India's Crisis#"), so screen readers announce "number sign".
- **Motion:** auto-playing loops (logo marquee, carousels, dashboard step loops) run with only a pause button on some. Reduced motion is honoured globally.
- **Contrast:** some dark-island captions use 11–12 px grey on navy, which is borderline.
- **Text size:** some tab and chip text falls under 12 px.

### S11. Performance — low
- The homepage loads in 4.5–5.2 s on first visit (networkidle), with several large dark pictures.
- Pages pull in GSAP, the 3D stage, canvas ribbons and more than 300 KB of product-picture modules.
- Text pages are fast (about 1 s).

---

## Page-by-page audit

Legend for **Purpose / Audience** → **Should understand** → **Clear today?** → issues 4–11 → **Changes required**.

### `/` Home
1. **Purpose and audience:** The front door for CISOs, CROs, heads of fraud, IAM and SOC leads, and technical evaluators, mostly in Indian BFSI, government and enterprise, with some US interest.
2. **The visitor should understand:** what Deep Algorithms does (identity security and fraud prevention for people, machines and AI agents), the problems it solves, for whom, and why to believe it.
3. **Clear today:** Partly. The H1 "Identity security for the AI era." is strong. The kinetic pill ("Verifies every service account before it acts") cycles words, which slows reading. The next section, "Your workforce has changed…", leads with an 82-identity grid before the product family is explained.
4. **Hierarchy:** Seven H2 sections with roughly equal visual weight. The product family arrives at screen 3 inside a logo orbit. Incidents, personas and FAQ follow, and none is stronger than the others.
5. **Layout and spacing:** The hero video card is small (about 480 px) beside the headline. Gaps between sections are inconsistent (some 200+ px of empty band). The incident timeline is a very long single column.
6. **Typography:** 12 sizes. Headline 54 px against a 17 px lead is fine. Captions and chips are 11–13 px.
7. **Product visualization:** The video thumbnail, an identity grid, a logo orbit and stock-photo persona cards. None of these shows the product making a decision.
8. **Interactions:** Persona tabs (CISO, SecOps, …) are useful. The kinetic word pill and logo marquee are decorative. The Heist teaser is distracting.
9. **Navigation and conversion:** Book a demo appears in the header and hero. "See how it works" scrolls down the page. The product family's own CTAs are small.
10. **Mobile:** 13,140 px tall, centre-aligned text, and two fixed overlays.
11. **Accessibility and performance:** Slowest first load (5.2 s). The marquee auto-scrolls.
12. **Changes required:**
    - New hero: plain-language headline, the audience, two CTAs, and an interactive product visualization that shows one decision per identity type (employee, workload, AI agent, customer payment).
    - Replace the orbit with a clear product-ecosystem section: adapID AI and its four products, Zenstra AI and its capabilities, and ICMS.
    - Add a problems-to-products section and an industries section.
    - Label trust evidence honestly.
    - Make security and compliance credibility one section.
    - Keep the FAQ and end with one closing CTA.
    - Remove the teaser overlay.

### `/products`
1. **Purpose and audience:** Directory for buyers comparing products.
2. **The visitor should understand:** every product, what each protects, and how they combine.
3. **Clear today:** Partly. The filter chips ("Everything", "AI agents", "People", …) are good. The cards are small and dense, and the platform/product distinction is unclear.
4. **Hierarchy:** H1 "A product for every way attackers get in." Below it, three ranks of cards (Platform, Product, Products) look alike.
5. **Layout and spacing:** 4-up cards hold 6 lines of 13 px text each.
6. **Typography:** 13 sizes.
7. **Product visualization:** Icons only.
8. **Interactions:** The filter works. The "better together" combinations are useful but sit low on the page.
9. **Navigation and conversion:** Good. "Not sure which fits?" leads to the demo form.
10. **Mobile:** The filter chips scroll sideways and the cards stack. Acceptable.
11. **Accessibility and performance:** Fine.
12. **Changes required:**
    - Restructure by product line (adapID AI with four products, Zenstra AI with six capabilities, ICMS).
    - Give each a clear line on who it is for and what it protects.
    - Keep the filter by need, and keep "Use one or combine" as solution bundles.

### `/adapid-ai` (adapID AI and CIRM, conflated)
1. **Purpose and audience:** Today it serves both the adapID AI family page and the CIRM product page. Audience: CISO, IAM and SOC.
2. **The visitor should understand:** (a) what adapID AI is and its four products; (b) separately, what CIRM does and how.
3. **Clear today:** No. See S1. The family appears in section 5 of 10.
4. **Hierarchy:**
   - The CIRM H1 sits under the "adapID AI" product mark.
   - "Seven stages" (a 7-chevron pipeline) carries the main product idea but is a dark island at screen 3.
   - The ITDR comparison table, identity graph, before/after timelines, family cards, score factors and policy slider each compete for attention.
5. **Layout and spacing:** 11,571 px with 13 sections. A jump bar with 8 items helps.
6. **Typography:** 28 sizes, the worst on the site.
7. **Product visualization:** The seven-stage pipeline is the right idea, but the stages are 9 px vertical labels and the dashboard is static per stage. The identity graph is decorative. The risk timeline is good.
8. **Interactions:** Stage tabs, the policy slider and the FAQ. The slider is good.
9. **Navigation and conversion:** The CTA repeats in three bands.
10. **Mobile:** 14,601 px. The pipeline becomes a sideways scroll.
11. **Accessibility and performance:** Small vertical text.
12. **Changes required:**
    - Split into **`/adapid-ai` (platform overview)** and **`/adapid-ai/continuous-identity-risk-management` (CIRM)**.
    - The CIRM page gets an interactive seven-stage workflow (Discover → Baseline → Score → Explain → Step-up → Contain → Evidence) driving a realistic light dashboard.

### `/adapid-ai/nhi-security`
1. **Purpose and audience:** Cloud security, platform and DevSecOps teams running AWS.
2. **The visitor should understand:** discovery of IAM roles, users, keys and workload identities; permissions granted versus used; relationships; risk; least privilege.
3. **Clear today:** Mostly in copy ("Granted is not the same as used"). The visuals are dark, dense and split across six sections.
4. **Hierarchy:** Six concept sections with equal weight (inventory, key lineage, workbench, granted/used, baselines, secrets).
5. **Layout and spacing:** 8,402 px with 11 sections.
6. **Typography:** 19 sizes.
7. **Product visualization:** The workbench is the right content in the wrong place: a dark, 4-tab table at small size. The key-lineage graph is good.
8. **Interactions:** Tabs in the workbench.
9. **Navigation and conversion:** "Connect a sandbox account with a read-only role" is a strong, concrete CTA. Keep it.
10. **Mobile:** 12,770 px, and the tables scroll sideways.
11. **Accessibility and performance:** Fine.
12. **Changes required:**
    - One **Cloud identity explorer**: an inventory table with type filters (IAM role, IAM user, access key, workload), then a selected identity's relationship graph, granted versus used permissions, risk exposure and a least-privilege recommendation with a policy diff.
    - Add a deployment architecture diagram (one read-only role per account, CloudTrail).
    - Shorter page.

### `/adapid-ai/fraud-prevention`
1. **Purpose and audience:** Heads of fraud, digital banking product owners and CISOs at banks, NBFCs and fintechs.
2. **The visitor should understand:**
   - The customer is recognised by behaviour across login, payee and payment.
   - Scams and account takeover are caught before money moves.
   - Every decision has a reason.
3. **Clear today:** Yes in copy, and the phone demo is close to right. But it spreads over 10 sections, with three separate phone pictures, a ring diagram, a mule graph and a case-management list.
4. **Hierarchy:** "Three checks. One decision." (ring) and "Inside the app…" (tabs over 5 capabilities) say similar things.
5. **Layout and spacing:** 10,129 px.
6. **Typography:** 22 sizes.
7. **Product visualization:** The phones are good but small and dark-framed. The journey strip (Opens the app → Enters MPIN → Goes to Pay → Adds a payee → Types the amount → Taps Pay) is the right spine.
8. **Interactions:** Many tabs (29 buttons). The scenario switch (Genuine, Takeover, Payment scam, Mule) is valuable.
9. **Navigation and conversion:** Fine.
10. **Mobile:** 16,050 px.
11. **Accessibility and performance:** Fine.
12. **Changes required:**
    - One polished, interactive **banking journey**: a light bank app on a phone with steps Sign in → Add payee → Enter payment → Review → Pay.
    - A live signal panel (typing rhythm, device, call in progress, payee age, amount against history) beside it.
    - Two scenarios (genuine customer, scam in progress) leading to approve or hold, with reasons.
    - Then capabilities, internet banking, mule detection and case management, all in light UI.

### `/ad-security`
1. **Purpose and audience:** AD administrators, IAM and SOC teams, government and healthcare IT.
2. **The visitor should understand:** attack paths to Tier 0, weak Kerberos, live abuse detection, fixes that are verified.
3. **Clear today:** Yes. It is the shortest product page.
4. **Hierarchy:** Fine.
5. **Layout:** Dark workbench island.
6. **Typography:** 18 sizes.
7. **Product visualization:** The attack-path graph is good but dark and static-looking.
8. **Interactions:** Few.
9. **Navigation and conversion:** The URL sits outside `/adapid-ai/`.
10. **Mobile:** 11,838 px.
11. **Accessibility and performance:** Fine.
12. **Changes required:**
    - Move to `/adapid-ai/active-directory-security`, with a redirect from `/ad-security`.
    - Build an interactive attack-path view: pick a starting identity, see the path to Domain Admins, apply a fix and watch the path close.
    - Add a coverage table of AD techniques.

### `/dpdpa-compliance` (ICMS Compliance Suite)
1. **Purpose and audience:** DPOs, compliance and CISOs under DPDPA, RBI and SEBI.
2. **The visitor should understand:** PII discovery, purpose and consent checks, breach response in 72 hours, audit evidence.
3. **Clear today:** Yes. "Five questions every auditor asks" is a strong idea.
4. **Hierarchy:** 10 H2s, several overlapping (evidence appears three times).
5. **Layout and spacing:** 8,344 px.
6. **Typography:** 18 sizes.
7. **Product visualization:** Dark data maps, consent ledger, breach clock.
8. **Interactions:** Tabs.
9. **Navigation and conversion:** ICMS is absent from the brief's suggested IA but is a real, live product line (menu, footer, demo form, solution pages). It is kept.
10. **Mobile:** 14,035 px.
11. **Accessibility and performance:** Fine.
12. **Changes required:**
    - A light PII map with consent checks and a 72-hour breach timeline.
    - DPDPA duties mapped to evidence.
    - A shorter page.

### `/agentic-ai/agentic-identity` (Zenstra AI overview)
1. **Purpose and audience:** CISOs, AI platform owners and risk committees adopting AI agents.
2. **The visitor should understand:** agent discovery, agent identity, scoped permissions, tool-call evaluation (allow, hold, block), decision records.
3. **Clear today:** The hero is clear ("Let AI agents act. Check every action first."). After that it loses focus.
4. **Hierarchy:**
   - Internal names appear without explanation: "Khetaka Vault", "Identity Vector", "5-stream context-based identity", "Deterministic acceleration".
   - A grid of 9 feature tiles is followed by a 3-card "platform at a glance".
5. **Layout and spacing:** 10,389 px with 12 sections. A full-width stock photo of a robot hand.
6. **Typography:** 21 sizes.
7. **Product visualization:** The hero gateway table (support-triage, payments-agent, invoice-agent with Allow, Hold, Block) is exactly the right idea, but it is static. The console sections are dark.
8. **Interactions:** Capability tabs (Discover, Scope, Enforce, MCP, Detect, Prove).
9. **Navigation and conversion:** "Visit zenstra.ai" sends buyers off-site in the hero.
10. **Mobile:** 17,039 px, the longest page.
11. **Accessibility and performance:** Fine.
12. **Changes required:**
    - An interactive **agent security console**: discovered agents, then the selected agent's identity (owner, purpose, scope, expiry).
    - The visitor fires a tool call and sees it evaluated (allow, hold for approver, or block) with the reason, appended to a tamper-evident decision record.
    - Remove internal codenames.
    - Keep the deployment model (gateway in your VPC).

### `/agentic-ai/{agent-discovery, agent-access, runtime-enforcement, mcp-security, detection-response, decision-record}`
1. **Purpose and audience:** Deep links for each Zenstra capability (SEO and menu targets).
2. **The visitor should understand:** what this one capability does, and how it fits the platform.
3. **Clear today:** Yes, but identical structure ×6: hero, 3 steps, 3 gains, blogs, CTA.
4–8. Same template; 23–27 font sizes; one dark picture each.
9. **Navigation and conversion:** Good capability names. These pages are not linked to each other except through the menu.
10. **Mobile:** About 5,000 px. Fine.
12. **Changes required:**
    - Keep one shared layout (the right call for six sibling pages).
    - Each page gets its own focused, interactive view of the console (inventory, grant, gateway decision, MCP allow-list, anomaly, record chain).
    - Add capability-to-capability navigation.

### `/solutions/bfsi`, `/healthcare`, `/government`, `/digital-platforms`
1. **Purpose and audience:** Industry buyers, often arriving from campaigns.
2. **The visitor should understand:** the industry's risks, which products fit together, a realistic workflow, outcomes, evidence.
3. **Clear today:** Partly. The copy is industry-specific, but the four pages are structurally identical and thin (about 550 words). They use 23–34 font sizes. There is one scene, then numbered cards.
4. **Hierarchy:** The stock photo dominates the hero.
7. **Product visualization:** One scene per industry (mule check, patient access, AD tier graph, key lineage). These are good choices.
8. **Interactions:** None beyond links.
12. **Changes required:** Each page gets:
    - An industry-specific hero.
    - Business risks.
    - A product combination shown as an architecture or workflow (BFSI: login → payee → payment → mule; healthcare: record access → purpose → evidence; government: domain → citizen data → agents; digital platforms: commit → key → cloud → customer data).
    - Outcomes, relevant research, and an industry CTA.
    - Content must not repeat across the four.

### `/why-deep-algorithms` (company and the case, conflated)
1. **Purpose and audience:** Evaluators doing diligence, and candidates.
2. **The visitor should understand:** who the company is (story, leadership, milestones, recognition), why its approach is different, how it deploys, where it is.
3. **Clear today:** It is all here, but in 10 sections on one 11,617 px page. "Company" menu items (Leadership, Careers, Contact) are anchors into it.
4. **Hierarchy:** Manifesto text in 34 px blue, then a timeline, comparison, beliefs, leaders, advisors, news (10 cards), recognition, photos, careers, offices.
7. **Product visualization:** n/a.
12. **Changes required:**
    - Split into **`/about-us`** (company story, milestones, leadership, advisors, recognition, news, offices) and **`/why-deep-algorithms`** (the approach, how it is different, how it deploys, security and trust).
    - Add **`/careers`** (areas, how to apply, life at Deep Algorithms).
    - Today `/about-us` redirects to `/why-deep-algorithms`; that redirect is removed.

### `/blogs` and `/blogs/:slug` (12 articles)
1. **Purpose and audience:** Thought leadership and SEO, for practitioners.
2. **The visitor should understand:** the latest research, by topic.
3. **Clear today:** Yes. Topic filter, cards, an "In the news" list.
4. **Hierarchy:** The articles are long (559–2,991 words) with a good reading measure (about 760 px).
6. **Typography:** Up to 37 sizes on articles (inline figures).
10. **Accessibility:** Headings end in "#" (S10).
12. **Changes required:**
    - Restyle as **Resources** (research and blog) with a featured article, topic filters and a clean card grid.
    - Articles: a light reading layout, anchor links as icons with an accessible label (not text inside the heading), a table of contents on wide screens, and a related-product panel.

### `/product-tour`
1. **Purpose:** A ten-step guided tour without a demo call.
3. **Clear today:** Yes. A short page with step buttons.
12. **Changes required:** Restyle to the new system. Keep the steps.

### `/request-demo` and `/contact`
1. **Purpose:** Conversion.
3. **Clear today:** Yes. The demo page's "your session will cover" panel changes with the chosen product, which is excellent.
4. **Hierarchy:** A dark navy band behind the form, a logo marquee under it, and an agenda with arrows.
10. **Mobile:** The form comes after a long intro (the form starts at about 1,400 px).
12. **Changes required:**
    - Light two-column layout with the form first on mobile.
    - Keep validation, honeypot and payload unchanged (the endpoint contract is preserved).
    - Contact: offices, email and phone with copy buttons, and a form.

### `/prompt-heist` and `/prompt-heist/play`
1. **Purpose:** Recruitment and brand challenge (prompt-injection CTF).
3. **Clear today:** Yes. It is its own world (dark "vault" styling), which is appropriate for a game.
12. **Changes required:**
    - Keep the page and its game.
    - Remove the global teaser overlay.
    - Link it from the Resources menu and the utility bar announcement.

### `/sitemap`, `/privacy-policy`, `/terms-of-use`, `/cookie-policy`, `/accessibility`
- **Today:** Text pages that are fine, apart from "#" inside headings.
- **Changes required:** Restyle in the light reading layout and fix the anchors.

### `/404`
- Fine. Restyle and add links to products and search.

---

## Content and credibility

| # | Finding | Where | Action |
|---|---|---|---|
| C1 | **Certifications.** ISO/IEC 27001, SOC 2 Type II, ISO/IEC 42001 and ISO/IEC 27701 appear as seals in the footer, home, company, government solution and FAQ, and in the product FAQ answer "Which certifications do you hold?". No certificate numbers, issuers or dates are in the repository. | `data/site.js` `CERTS` | Shown once, in a single **Security and compliance** section, with a note that certificates are available on request. **Needs confirmation** from Deep Algorithms before go-live (see open questions). |
| C2 | **Logo wall labelled "Trusted by…"** mixes banks, a ministry, academic institutes, a CoE, a hospital and small companies. | `data/site.js` `CUSTOMERS` | Grouped by kind: *Banks and financial services*, *Government and public sector*, *Academia and research*, *Enterprise and technology*, under the neutral heading **"Organisations we work with"**. The exact relationship (customer, pilot, partner) **needs confirmation**. |
| C3 | "94% success rate of identity-centric attacks in our analysis" and "0 average alerts generated" are internal analysis figures attributed only to "Deep Algorithms Blogs, 2026". | `data/products.js` (adapid) | Removed from headline statistics. Third-party statistics with a named source (IBM, I4C, RBI, CyberArk, Gartner, DPDPA) are kept with their sources. |
| C4 | "< 80 ms risk decision at every event" and "< 5 min to generate an audit package" are attributed to "Deep Algorithms benchmark". | fraud, icms, digital-platforms | Kept as product specifications, labelled "Deep Algorithms benchmark", not as customer results. |
| C5 | Internal codenames shown to buyers: "Khetaka Vault", "Identity Vector", "5-stream context-based identity", "Deterministic acceleration". | `pages/products/Zenstra.jsx` | Replaced with plain capability names. |
| C6 | Inconsistent terminology for the same thing: "product line", "platform", "family", "products" for adapID; "Blogs", "Research" and "Resources"; "Book a demo" and "Request a demo". | site-wide | One vocabulary: **Platform** (adapID AI, Zenstra AI), **Suite** (ICMS), **Product** (CIRM, NHI, Fraud, AD), **Capability** (each Zenstra capability), **Resources**, **Book a demo**. |
| C7 | Stock photographs of models presented with real-looking names ("Kavya Reddy", "Anita") and "Flagged" pills. | story cards | Product demos use clearly illustrative sample data in product UI, captioned "Sample data". People photos are kept only where they illustrate an industry (hero photos), never as fake users. |
| C8 | Headline repetition: "Questions teams ask us" appears on 7 pages, and "Book a demo / Take the product tour" in 3–4 bands per page. | product pages | One closing CTA per page. FAQs are titled per product. |
| C9 | Hero "Visit zenstra.ai" sends evaluators off-site from the first screen. | Zenstra | Moved to the product resources area. |
| C10 | "Trusted by banks, government and enterprises across India" also appears under heroes on product pages. | `TrustedRow` | One evidence section per page at most, worded as C2. |
| C11 | Founder quote "0.2% end user step-up rate" is a media interview quote. | `data/company.js` | Kept as a quote attributed to CXOToday, not presented as a product statistic. |

No customer names, partnerships, certifications, statistics, features or integrations are added in the redesign. Product demos use sample data and say so.

---

## Technical debt found in the codebase

| Item | Impact | Plan |
|---|---|---|
| Dark-first tokens with light "sheet" inversion (`styles.css`, about 1,040 lines plus `viz.css`) | Two palettes per component; dark islands everywhere | A light-first token set; dark only where intentionally chosen (footer, Prompt Heist) |
| Inline Tailwind sizes (`text-[14.5px]`, …) everywhere | 28+ sizes per page | A fixed type scale as classes and tokens (`t-display` … `t-caption`); pages use only these |
| `Stage3D` perspective tilt, `FlowRibbons` canvas, `BlurWords` per-word blur | Decorative motion, small-text blur | Removed from pages; motion explains state changes only |
| The 6 Zenstra capability pages and 4 solution pages share undifferentiated templates | Interchangeable pages | Shared layout, distinct content and visuals |
| The global `HeistTeaser` overlay | Covers content | Removed from the shell |
| `/about-us` → `/why-deep-algorithms`, `/platform` → `/why-deep-algorithms` redirects | IA conflation | `/about-us` becomes the company page; `/platform` → `/products` |
| H2 anchor "#" inside heading text | Screen-reader noise | Anchor rendered as an icon link outside the heading text with an `aria-label` |

Kept because they work: routing and prerendering (`entry-server.jsx`, `scripts/prerender.mjs`, the one-H1 check), `Seo` and structured data (`lib/head.jsx`), the lead form logic and endpoint contract (`components/Form.jsx`), site search (`Command.jsx`), the language menu (`lib/translate.js`), the article renderer and posts, the Prompt Heist game, the data files, the nginx, Docker and CSP setup.

## Open questions for Deep Algorithms (must be answered before production)

1. **Certifications.** Are ISO/IEC 27001, SOC 2 Type II, ISO/IEC 42001 and ISO/IEC 27701 held today, and with what scope and dates?
2. **Organisations.** For each organisation in the logo wall, is it a customer, a pilot, a partner or another relationship? Do we have permission to show each logo?
3. **BotShield AI.** It is still live on deepalgorithms.io (it protects that site), but the UAT build redirects `/botshield-ai` to `/products`. Is it still a product line? The redesign keeps it out until confirmed.
4. **Product documentation.** Is there a public documentation site to link from Resources? None exists in the repository, so none is linked.
5. **Case studies.** None are published, so the Case studies menu item is omitted rather than shown empty.
