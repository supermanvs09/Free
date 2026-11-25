# Redesign study: current site + competitors (2026-11-25)

## 1. The current site (branch `ccr-0f7bf97b-gg4vr9`)

React 19 + Vite 8 + Tailwind 4, prerendered to static HTML. `npm run dev` → http://localhost:5173.
~42 routes. Light "sheets" with dark "stage" bands; Inter, Cisco type scale (H1 60/68 w500, H2 48/56). One CSS file (`src/styles.css`, 1.7k lines) plus product pictures drawn in code (`src/components/viz/`).

| Page | Route | What it does today |
|---|---|---|
| Home | `/` | Dark particle-wave hero "Discover every human, machine and AI agent identity." → customer logos → "Continuous AI Security Posture Management" in 4 alternating rows (Discover / Detect / Secure AI agents / Prove) with app-window cards → centred statement → posture console + 4 stats → 3 product cards → trust/certs → CTA band. |
| Products | `/products` | Hub: hero, logo strip, filter chips (AI agents, People, Machine identities, Payments, AD, Personal data) over 6 product cards, "better together" combos. |
| Zenstra AI | `/agentic-ai/agentic-identity` | AI-agent security. Dark hero with gateway window, owner/scope story, agent console, 6 capabilities, observability/governance/security tiles, before/after table, deployment (SDK / gateway / discovery app), comparison table, FAQ, blogs. |
| Zenstra capabilities ×6 | `/agentic-ai/{agent-discovery,agent-access,runtime-enforcement,mcp-security,detection-response,decision-record}` | Shared template `Capability.jsx`: hero, 3 steps, outcomes, blogs, CTA. |
| adapID AI (CIRM) | `/adapid-ai` | Continuous identity risk. Centred hero with live risk-score window, 7-stage loop, ITDR-vs-CIRM table, blast-radius graph, "same password, two endings", 4 sub-products, policy, FAQ. |
| NHI Security | `/adapid-ai/nhi-security` | AWS machine identities: inventory, key history, granted vs used, baselines, leaked secrets. |
| Fraud Prevention | `/adapid-ai/fraud-prevention` | Banking fraud: 3 checks, in-app journey, mule-account pattern, case handling, explainable scores. |
| AD Security | `/ad-security` | Attack paths to Domain Admins, live abuse, remediation. |
| ICMS | `/dpdpa-compliance` | DPDPA: duties→evidence, PII lifecycle, discovery, access purpose, 72-hour breach, audit package. |
| Solutions ×4 | `/solutions/{bfsi,healthcare,government,digital-platforms}` | Industry story + where each product stops the attack. |
| Why Deep Algorithms | `/why-deep-algorithms` | Company: manifesto, 2022–2026 timeline with event photos, comparison table, values, leadership, research/patents, certifications, life at DA, careers, offices. |
| Blogs / Article | `/blogs`, `/blogs/:slug` | 11 posts from `src/content/posts/*.json`, "In the news". |
| Prompt Heist | `/prompt-heist`, `/play` | Recruiting CTF game: crack 5 AI vaults. |
| Demo / Contact | `/request-demo`, `/contact` | Forms posting JSON to an AWS endpoint. |
| Sitemap, Legal ×n, 404 | | Utility. |

Global: top utility bar (Prompt Heist promo, phone, search, language), mega-menus for Products/Solutions, ⌘K search + hidden terminal, floating "Prompt Heist" pill, footer with certs.

### Problems worth fixing in the redesign
- **Three brands, one site.** Deep Algorithms + adapID AI + Zenstra AI + ICMS each have their own mark and accent; the home page never says in one line what the company *is*. Positioning drifts between "identity security", "AI-SPM" and "AI agent security".
- **Too long, too even.** Product pages are 9–13k px with 9–10 sections of equal weight; every section is headline + window. Little hierarchy or rhythm.
- **Proof is thin and late.** Logos are small/greyscale; no customer quotes, case results or analyst mentions. Stats are third-party (CyberArk, IBM), not our outcomes.
- **Content hidden behind motion.** Many sections render empty until scroll animations fire (huge blank bands in full-page captures) — risky for SEO previews, slow devices and screenshots.
- **Hero is generic.** Stock particle wave; the hero h1 says "Discover…" which is the weakest verb of the offer.
- Floating Prompt Heist pill overlaps content on every page; utility bar + nav + sub-nav on product pages stack three bars.

## 2. Competitors studied (live home pages, read with Playwright)

| Company | Space | Hero line | Type | Look |
|---|---|---|---|---|
| **Silverfort** | Identity security / ITDR | "Stop AI attacks the moment it matters. Inline. At runtime." + stats row (10B auths/day, 4.8 Gartner, <24h, ZERO infra changes) | Stag serif 48 w300 + Inter 17 | Dark, warm orange accent, robot portrait |
| **Zenity** | AI agent security | Announcement carousel; "By the time anyone notices, the agent already decided" | Basis Grotesque | Deep purple dark, isometric 3D, graph diagrams, metric quote cards |
| **Noma** | AI / agent security | "SECURE AI. CONTROL YOUR AGENTS." | Libertinus Serif 90 caps + grotesk | Loud cyan/lime, 3D gnome mascots, Gartner quadrant |
| **Oasis** (now Cyera) | NHI / agentic access | "Agentic Access Management" | Inter 100/90 w700, H2 96 | Dark navy, glowing scroll scenes, real product table |
| **Aembit** | Workload & agent IAM | "Identity Control Plane Built for Agents" | Be Vietnam Pro 72 | Dark violet + orange italic, before/after diagrams, standards grid (OIDC, SPIFFE…) |
| **Wiz** | Cloud & AI security | "Protect Everything You Build and Run" + email field | Custom 49 w600 | White, blue, product UI everywhere, customer portrait cards, analyst reports |
| **CrowdStrike** | Platform | "Falcon Platform: one unified platform to secure the agentic enterprise" | Sharp Sans 56 w700 | Black/red, platform wheel diagram, pricing bundles |
| **Okta** | Identity | "Bring agents out of the shadows" | SeasonMix 64 w400 | Electric blue/violet gradients, 3 audience cards (Agentic / Workforce / Customer), McLaren story |
| **BioCatch** | Banking fraud | "Together, we make banking safer every day" | Gilroy | Saturated blue, huge platform numbers ($17.2T assessed, 18B sessions), bank logos |
| **Securiti** | Data/privacy (DPDPA) | "Your Data+AI Command Platform" | Avant Garde 45 w900 | White, dense |
| Astrix (→ Cisco Identity Intelligence), SailPoint (blocked bots) | | | | |

## 3. Patterns to adopt

1. **One sharp claim + proof in the hero.** Silverfort and BioCatch put 3–4 big numbers directly under the hero line. We should lead with our own figures (sessions scored, <80 ms decision, banks protected, 26.5 lakh mules context).
2. **Segment by identity type, not by product name.** Okta: Agentic / Workforce / Customer. Our natural split: **People · Machines · AI agents · Payments · Personal data**, with product names secondary.
3. **Real product UI as the hero object** (Wiz, Oasis). We already draw product pictures in code — make one large, legible console the star instead of many small windows.
4. **"Runtime / inline" vocabulary** is now the category language (Silverfort, Noma, Zenity, Aembit). Our "decided before the action runs" story fits — say it in the hero.
5. **Before → after diagrams** (Aembit, Zenity, our own "What changes with Zenstra") beat feature lists. Keep one per product page, drop the rest.
6. **Proof wall:** named customer stories with a number (Okta McLaren, Wiz CISO portraits, Zenity 95%/80% cards). We have Canara, Karnataka, DCB Bank, MeitY — one quote + one metric each.
7. **Distinct, ownable visual language.** Every competitor owns one strong colour + one display face (Silverfort orange serif, Noma lime caps, Zenity purple, Aembit orange italic). Our current neutral Inter/blue reads like Cisco. Pick a display face and a signature accent.
8. **Shorter pages:** competitor home pages run 6–10k px with 6–8 sections; product pages should target ~6 sections.
9. **India as a differentiator.** No competitor speaks DPDPA, RBI, SEBI, UPI, mule accounts. Make "built for India's banks and regulators" a first-class message, not a footnote.

## 4. Suggested IA for the redesign
- **Home:** hero (claim + 3 own metrics + console) → logos → "Every identity you have" (People / Machines / AI agents / Payments / Data cards) → how it works (discover → score → decide → prove, one diagram) → customer stories → India regulation band → trust/certs → CTA.
- **Platform** (one page) replacing the "Continuous AI-SPM" section; products become modules of one platform.
- **Products:** adapID AI (CIRM, NHI, Fraud, AD), Zenstra AI (+6 capabilities), ICMS — fixed 6-section template.
- **Solutions:** BFSI, Government, Healthcare, Digital — keep.
- **Company / Resources / Prompt Heist (Careers).**
