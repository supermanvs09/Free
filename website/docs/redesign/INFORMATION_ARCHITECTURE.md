# Information Architecture

## 1. The verified portfolio

From the repository's product data (`src/data/products.js`, `zenstra.js`, `nav.js`), the demo form's product options and the solution pages, the live portfolio is:

| Level | Name | What it is | Route (new) |
|---|---|---|---|
| Platform | **adapID AI** | Identity security for human and machine identities | `/adapid-ai` |
| Product | Continuous Identity Risk Management (CIRM) | Live, explainable risk score for every identity; step-up, hold, contain | `/adapid-ai/continuous-identity-risk-management` |
| Product | Non-Human Identity Security for AWS | IAM roles, users, keys and workload identities: inventory, granted versus used, baselines, secrets | `/adapid-ai/nhi-security` |
| Product | Identity Fraud Prevention | Mobile and internet banking: behavioural biometrics, scam signals, mule detection | `/adapid-ai/fraud-prevention` |
| Product | Active Directory Security | Attack paths to Tier 0, Kerberos weaknesses, live abuse detection | `/adapid-ai/active-directory-security` |
| Platform | **Zenstra AI** | Security for AI agents | `/agentic-ai/agentic-identity` (kept; see note) |
| Capability | Agent Discovery | | `/agentic-ai/agent-discovery` |
| Capability | Agent Identity and Access | | `/agentic-ai/agent-access` |
| Capability | Runtime Enforcement | | `/agentic-ai/runtime-enforcement` |
| Capability | MCP Security | | `/agentic-ai/mcp-security` |
| Capability | Detection and Response | | `/agentic-ai/detection-response` |
| Capability | Decision Record | | `/agentic-ai/decision-record` |
| Suite | **ICMS Compliance Suite** | PII discovery, purpose and consent, 72-hour breach response, DPDPA/RBI/SEBI evidence | `/dpdpa-compliance` |

Notes:
- **The brief's suggested IA** lists three Zenstra items. All six capabilities are kept, because each has its own page and SEO, and the brief does not permit removals. The menu groups them under *Discover and govern* (Discovery, Identity and Access, MCP Security) and *Enforce and prove* (Runtime Enforcement, Detection and Response, Decision Record).
- **ICMS** is a verified, live product line (menu, footer, demo form, three industry pages). It appears as the third product line.
- **BotShield AI** is redirected away in this build. It stays out pending confirmation (Audit, open question 3).
- **The Zenstra overview URL** `/agentic-ai/agentic-identity` is kept, because it is indexed and linked from press and LinkedIn. The menu and breadcrumbs call it "Zenstra AI overview".

## 2. Global navigation

```
[Logo]  Products ▾   Solutions ▾   Resources ▾   Company ▾            [Search]  [Book a demo]
```

A slim utility bar (≥ 1024 px) holds the Prompt Heist announcement, phone, language and Contact. The previous floating teaser is removed.

### Products ▾ (mega menu)

| Column 1: intro | Column 2: adapID AI | Column 3: Zenstra AI | Column 4: featured |
|---|---|---|---|
| "Products". Security for people, machine identities and AI agents. → All products | adapID AI overview · Continuous Identity Risk Management · NHI Security for AWS · Identity Fraud Prevention · Active Directory Security | Zenstra AI overview · Discover and govern: Agent Discovery, Agent Identity and Access, MCP Security · Enforce and prove: Runtime Enforcement, Detection and Response, Decision Record | **ICMS Compliance Suite** card (DPDPA) · **Product tour** card |

### Solutions ▾

| By industry | By need |
|---|---|
| Banking and Financial Services · Healthcare · Government and Public Sector · Digital Platforms | Catch stolen logins → CIRM · Stop payment fraud → Fraud · Secure cloud identities → NHI · Protect Active Directory → AD · Secure AI agents → Zenstra · Protect PII for DPDPA → ICMS |

### Resources ▾

| Learn | Explore |
|---|---|
| Blog and research (all) · Identity security · AI agent security · Financial crime · Compliance (topic filters) | Product tour · Prompt Heist challenge · In the news (→ About us) |

Product documentation and case studies are omitted until they exist (Audit, open questions 4 and 5).

### Company ▾

About Deep Algorithms (`/about-us`) · Why Deep Algorithms (`/why-deep-algorithms`) · Leadership (`/about-us#leadership`) · Careers (`/careers`) · Contact (`/contact`)

### Mobile (< 1024 px)

A full-height drawer with the same four groups as accordions, Search at the top, and "Book a demo" pinned at the bottom of the drawer. One fixed bottom element on mobile pages ("Book a demo" plus Menu), with the Heist teaser removed.

## 3. Footer

```
[Logo, one-line positioning, contact]
Products            Solutions                 Resources          Company
adapID AI           Banking & Financial Svcs  Blog & research    About Deep Algorithms
 CIRM               Healthcare                Product tour       Why Deep Algorithms
 NHI for AWS        Government & Public       Prompt Heist       Leadership
 Fraud Prevention   Digital Platforms                            Careers
 AD Security        All products                                 Contact
Zenstra AI                                                       Book a demo
ICMS Compliance
—
© 2026 Deep Algorithms Solution Pvt. Ltd. · Terms · Privacy · Cookies · Accessibility · Sitemap
```

The footer, menus, breadcrumbs, sitemap page and `sitemap.xml` are generated from **one** source: `src/data/ia.js`. That is how the inconsistencies in Audit S1 are prevented from coming back.

## 4. URL changes and redirects

| Old | New | Kind |
|---|---|---|
| `/adapid-ai` (CIRM content) | `/adapid-ai` becomes the **adapID AI overview**; CIRM moves to `/adapid-ai/continuous-identity-risk-management` | New page plus moved content |
| `/ad-security` | `/adapid-ai/active-directory-security` | 301 (nginx, vercel.json, `_redirects`) plus client `<Navigate>` |
| `/about-us` → redirect to `/why-deep-algorithms` | `/about-us` becomes the **company page** | Redirect removed |
| `/platform` → `/why-deep-algorithms` | `/platform` → `/products` | Redirect changed |
| — | `/careers` | New page |

Every other URL is unchanged, so inbound links, press and SEO are preserved.

## 5. Page inventory after the redesign (45 URLs)

| Group | Pages |
|---|---|
| Home | `/` |
| Products | `/products`, `/adapid-ai`, `/adapid-ai/continuous-identity-risk-management`, `/adapid-ai/nhi-security`, `/adapid-ai/fraud-prevention`, `/adapid-ai/active-directory-security`, `/agentic-ai/agentic-identity`, 6 × `/agentic-ai/*`, `/dpdpa-compliance` |
| Solutions | `/solutions/bfsi`, `/solutions/healthcare`, `/solutions/government`, `/solutions/digital-platforms` |
| Resources | `/blogs`, 12 × `/blogs/:slug`, `/product-tour`, `/prompt-heist`, `/prompt-heist/play` |
| Company | `/about-us`, `/why-deep-algorithms`, `/careers`, `/contact`, `/request-demo` |
| Utility | `/sitemap`, `/privacy-policy`, `/terms-of-use`, `/cookie-policy`, `/accessibility`, 404 |

## 6. Journeys

| Visitor | Entry | Path | Conversion |
|---|---|---|---|
| CISO, non-technical | Home | Hero → product ecosystem → industry → evidence | Book a demo (hero or closing) |
| Head of fraud, bank | Campaign → `/solutions/bfsi` | Risks → login-to-ledger workflow → Fraud Prevention demo | "Book a fraud signals session" (demo form preselects adapID) |
| Cloud security engineer | Search → `/adapid-ai/nhi-security` | Cloud identity explorer → deployment (read-only role) | "Connect a sandbox account" (demo form preselects NHI) |
| AI platform owner | LinkedIn → `/agentic-ai/agentic-identity` | Console demo: fire a tool call → capability pages | Book a demo (preselects Zenstra) |
| DPO | `/dpdpa-compliance` | Duties-to-evidence → breach timeline | DPDPA gap analysis (preselects ICMS) |
| Candidate | `/careers` or Prompt Heist | Areas → apply by email | `hr@` email |

The demo form accepts `?product=adapid|nhi|zenstra|dpdpa|all`, so every product CTA arrives with the right session already selected.
