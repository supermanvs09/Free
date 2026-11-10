# Page Design Specifications

All pages use the design system (`DESIGN_SYSTEM.md`). Section labels below are in the order they appear. **[I]** marks an interactive product demonstration. Every demo uses labelled sample data and degrades to its final state without JavaScript or with reduced motion.

Shared rules:
- One H1 per page, then H2 per section.
- One closing CTA per page.
- Sections alternate `bg` and `bg-subtle`; no section is dark (except the footer and Prompt Heist).
- Product and platform pages carry a **sticky sub-nav** (Overview · How it works · Capabilities · Deployment · FAQ + Book a demo).
- Every statistic carries its source.

---

## Home `/`
1. **Hero** (two columns at ≥ 1024 px):
   - Overline "Identity security for the AI era".
   - H1 (display): **"Stop the attack that logs in."**
   - Lead: *Deep Algorithms secures the people, machine identities and AI agents your business runs on. It scores every identity continuously, decides before an action completes and explains every decision. Built for banks, government and enterprises.*
   - CTAs: **Book a demo** (primary) · **Explore products** (secondary).
   - **[I] Decision console:** four tabs (*Employee sign-in · Cloud workload · AI agent · Customer payment*). Each tab shows a short, live event sequence ending in a **DecisionCard** (allow, step-up, hold or block) with reasons and the product that decided. It auto-advances while visible; the visitor can pick a tab.
2. **Product ecosystem.** H2 "Three platforms. Every identity covered."
   - Three columns: adapID AI (4 products, each linked with one line), Zenstra AI (capabilities), ICMS (DPDPA).
   - Under them, a slim "how they connect" band: your identity sources → adapID / Zenstra / ICMS → decisions to your IdP, SOC and audit.
3. **The problem.** H2 "Attackers don't break in. They log in."
   - Three problem tiles, each with a sourced statistic and the product that answers it: stolen credentials (IBM ₹25.5 Cr), machine identities (CyberArk 82:1), mule accounts (I4C 26.5 lakh+).
4. **How it works.** Continuous, explainable, before the action: a 4-step horizontal stepper (*Connect read-only → Learn each identity's normal → Score every event → Act and record*). [I] The steps highlight in sequence; clicking a step shows its detail.
5. **Industries.** Four cards with photo, industry risk, products and link.
6. **Evidence.** "Organisations we work with", grouped (banks, government, academia, enterprise). Then the recognition row (DSCI Excellence 2025, Business Excellence Award 2025, patent granted Oct 2026, ₹16 Cr pre-Series A led by Unicorn India Ventures), each linked to its source.
7. **Security and compliance.** Deployment facts (read-only connectors, gateway in your VPC, data residency) and the certification list with "certificates available on request".
8. **Latest research.** Three newest posts.
9. **FAQ** (5 items, existing content).
10. **Closing CTA.**

## Products `/products`
1. Hero: H1 "Products for every identity you run on." Lead plus a **filter by need** (All · People · Machine identities · AI agents · Payments · Active Directory · Personal data).
2. Three **platform blocks** (adapID AI, Zenstra AI, ICMS). Each has a header (mark, one line, overview link) and a grid of its products or capabilities (icon tile, name, one line, "protects" tags). The filter dims non-matching items and announces the count.
3. **Use one, or combine.** Three bundles (Banks and fintechs; An AI rollout; A public service), each with its product chips.
4. Closing CTA ("Not sure which fits?").

## adapID AI overview `/adapid-ai` (NEW)
1. Hero:
   - Platform mark.
   - H1 "Identity security for every human and machine identity."
   - Lead.
   - CTAs: Book a demo · See the four products (anchor).
   - Visual: **[I] identity inventory**, an AppFrame table of 6 identities (person, service account, IAM role, customer, AD admin…) with type, score, trend and the product that covers it. Selecting a row reveals its reasons.
2. **Four products** in a 2×2 grid. Each card has the product name, the problem, 3 capabilities, a mini product preview and a link.
3. **One risk engine.** A diagram of signals (IdP, cloud, HR, SaaS, app SDK, AD) → behaviour baseline → risk score with reasons → policy actions (step-up, hold, revoke, ticket). SVG, drawn to the product model.
4. **What changes:** ITDR versus CIRM comparison (moved here from the CIRM page because it describes the platform), restyled as a clean table.
5. **Integrations:** a grid of the real connectors (Okta, Entra ID, AD, Google Workspace, M365, AWS, Salesforce, Slack, GitHub).
6. **Deployment and data handling.**
7. FAQ · CTA.

## Continuous Identity Risk Management `/adapid-ai/continuous-identity-risk-management`
1. Hero: H1 "A live risk score for every identity, acted on the moment it changes." Visual: a risk-score card for one identity with its timeline.
2. **[I] The seven-stage workflow** (the centrepiece, full width):
   - **Stepper:** Discover · Baseline · Score · Explain · Step-up · Contain · Evidence.
   - **Dashboard (AppFrame):** left, the identity profile (Kavya Reddy, Treasury, sample); centre, a stage-specific view; right, the risk gauge and reasons that accumulate.
     - **Discover:** the inventory count across IdPs and apps.
     - **Baseline:** her usual locations, hours, devices and apps.
     - **Score:** events stream in (Lagos sign-in 02:14 +46, new device +12, forwarding rule +23) and the score rises 18 → 81.
     - **Explain:** each point attributed in plain language.
     - **Step-up:** the policy threshold crossed, a step-up sent through Okta, and it failed.
     - **Contain:** sessions revoked across M365, Salesforce and Slack; the forwarding rule removed.
     - **Evidence:** a timeline record with a mono record ID and export.
   - Auto-plays while visible; Previous/Next/Play controls; the keyboard moves through stages.
3. **Your policy decides.** [I] A policy threshold slider (step-up at 40, hold at 60, contain at 80) applied to the same score.
4. **What it watches:** six signal groups (behaviour baseline, access and privilege, device and location, HR and lifecycle, session, machine identities).
5. **Two endings:** the same stolen password, with and without CIRM (timeline comparison).
6. Integrations · FAQ · related research · CTA.

## NHI Security for AWS `/adapid-ai/nhi-security`
1. Hero: H1 "Every machine identity in your AWS accounts. Found, scored, right-sized." Visual: inventory summary tiles (roles, users, keys, workloads; with no owner; unused for 90 days).
2. **[I] Cloud identity explorer** (AppFrame, `container-wide`):
   - **Left:** a filterable table (All · IAM roles · IAM users · Access keys · Workloads) with account, owner, last used, granted/used and risk.
   - **Right:** the selected identity.
     - **Relationships:** an SVG graph of workload → role → resources (S3, RDS, Lambda, KMS), with the risky edge highlighted.
     - **Granted versus used:** a bar and a list of unused permission families.
     - **Exposure:** what it can reach.
     - **Recommendation:** a least-privilege policy diff (`- s3:*` `+ s3:GetObject on arn:…`), with an Apply-with-approval button (simulated; it changes the state to "Proposed to owner").
3. **How it connects:** an architecture diagram (one read-only IAM role per account → CloudTrail 90 days → adapID → findings to owners, Jira and Slack).
4. **Baselines** for 26 workload families, and **secrets in code** (GitHub, CodeCommit).
5. FAQ · CTA ("Connect a sandbox account").

## Identity Fraud Prevention `/adapid-ai/fraud-prevention`
1. Hero: H1 "Stop fraud before the money moves." Lead (mobile and internet banking, one SDK, decisions in under 80 ms, Deep Algorithms benchmark).
2. **[I] Banking journey** (the centrepiece):
   - **Left:** a polished light bank app on a phone, with screens Sign in (MPIN) → Add payee → Enter amount → Review → Pay → Outcome.
   - **Right:** a live **Signals** panel (typing rhythm against her baseline, device and SIM, call in progress, payee age and mule risk, amount against history, session risk meter) and the **Assessment** (DecisionCard).
   - **Scenario switch:** *Genuine customer* → approved with no extra step · *Scam call in progress* → payment held, with a cooling-off message to the customer and a case for the analyst.
   - Step controls plus auto-play.
3. **Five capabilities in one SDK** (tabs): behavioural biometrics, silent TOTP, face verification at high-risk moments, device security, scam signals.
4. **Internet banking** (web step-up).
5. **Mule accounts at the payee:** the mule check view.
6. **Case management:** alert → case → decision → report.
7. Sourced statistics (RBI, I4C) · FAQ · CTA.

## Active Directory Security `/adapid-ai/active-directory-security`
1. Hero: H1 "Close the path to Domain Admins before anyone takes it."
2. **[I] Attack path explorer:**
   - Choose a starting identity (a phished user, a service account with SPN, a helpdesk operator).
   - An SVG path through groups, ACLs and hosts to Domain Admins (Tier 0), each edge labelled with its technique (GenericAll, Kerberoastable, AdminTo, DCSync).
   - Fix list: "Apply fix" removes the edge, the path re-routes or closes, and a re-check confirms it.
3. **Techniques covered:** a table of the 10 core AD techniques, from Kerberoasting to DCSync, with detection and fix.
4. **Live abuse detection:** an alert timeline.
5. FAQ · CTA.

## Zenstra AI overview `/agentic-ai/agentic-identity`
1. Hero: H1 "Let AI agents act. Check every action first." Visual: the gateway decision feed.
2. **[I] Agent security console** (the centrepiece):
   - **Inventory** (left): discovered agents (Copilot Studio, Claude, n8n, Cursor, LangGraph), each with owner, platform and status. Shadow agents are flagged "No owner".
   - **Agent identity** (centre): owner, declared task, scoped grant with expiry.
   - **Tool-call evaluator** (right): the visitor picks a call (e.g. *Read invoice INV-2291* → **Allow**; *Pay ₹4,80,000 to a new vendor* → **Hold for approver**; *Export vendor list to an outside address* → **Block**). Each call shows the policy checks (in task? in grant? data sensitivity? destination?) and the decision.
   - **Decision record** (bottom): each decision is appended with a hash chain.
3. **Six capabilities:** cards linking to each capability page.
4. **Deployment:** a diagram of the gateway in your VPC; read-only connectors to agent platforms; the SDK option; only decisions and redacted evidence leave.
5. **Without and with Zenstra** (five moments).
6. Integrations · FAQ · CTA.

## Zenstra capability pages `/agentic-ai/*` (×6)
A shared layout with distinct content:
- **Hero** with capability name and Zenstra breadcrumb.
- **[I] A focused view** of the console:
  - Discovery: inventory scan with a shadow-agent assign action.
  - Access: grant builder with expiry.
  - Runtime: tool-call evaluator.
  - MCP: allow-list with a changed tool held and the diff shown.
  - Detection: baseline-versus-now anomaly with containment.
  - Record: hash-chained log with a "verify chain" action.
- **Three steps**, **three outcomes**.
- **Capability switcher** (all six).
- CTA.

## ICMS Compliance Suite `/dpdpa-compliance`
1. Hero: H1 "Protect every piece of personal data. Prove DPDPA compliance."
2. **[I] PII map:** stores (Postgres, S3, Salesforce, M365) with PII counts by category. Selecting a store shows the access log with purpose and consent checks (passed, flagged).
3. **DPDPA duties to evidence:** a table mapping each duty to how ICMS evidences it.
4. **[I] 72-hour breach timeline:** a stepper from detection to Board notification.
5. **Five auditor questions** with time to answer.
6. Sourced statistics (DPDPA ₹250 Cr; DPDP Rules 72 h) · FAQ · CTA.

## Industry pages `/solutions/*` (×4)
Each page has the same section types, with distinct content and visuals.

| Section | BFSI | Healthcare | Government | Digital platforms |
|---|---|---|---|---|
| Hero H1 | Every login, payee and payment, scored before it clears. | Know who opened every patient record, and why. | Keep the domain closed and citizen data safe. | Grow fast without growing your attack surface. |
| Business risks (3) | Mule accounts, account takeover, scam payments | Shared logins, privileged misuse, breach reporting | Tier 0 compromise, administrator credential theft, citizen PII | Account takeover, leaked keys, ungoverned AI features |
| **[I] Workflow** | Login → payee → payment → mule check | Clinician access → purpose check → anomaly → evidence | Phished admin → path to DA → fix → citizen data guarded | Commit leaks key → key used from new region → role scoped → customer data safe |
| Product combination | Fraud + NHI + Zenstra + ICMS | ICMS + CIRM + AD + NHI | AD + CIRM + ICMS + Zenstra | NHI + Zenstra + Fraud + CIRM |
| Outcomes | Sourced figures (I4C, RBI, DPDPA) | DPDP 72 h; access explained | Deployment in your environment | CyberArk, Gartner, benchmark |
| CTA | Book a fraud signals session | See patient-data access, explained | Talk to our public-sector team | Book a demo |

## About `/about-us` (NEW content split)
Hero (mission plus founder quote) · Story · **Milestones** timeline (2022 founded … 2026) · **Leadership** (4) · **Advisors** (8) · **Recognition** (awards) · **In the news** (latest 6) · Life at Deep Algorithms (photos) · **Offices** (3) · CTA.

## Why Deep Algorithms `/why-deep-algorithms`
Hero ("The defence has to be as intelligent as the attack") · **Our approach** (6 beliefs, as engineering constraints) · **How it is different** (comparison against rule-based tools and periodic reviews) · **How it deploys** (architecture: read-only connectors, gateway in your VPC, data residency) · **Security and trust** (certifications on request, data handling, explainability) · CTA.

## Careers `/careers` (NEW)
Hero · What we work on (AI engineering, security research, product engineering) · How we work (beliefs) · Life at Deep Algorithms (photos) · How to apply (email `hr@…`; Prompt Heist as an optional challenge) · Offices.

## Resources `/blogs` and articles
- **Hub:** featured latest post, topic filter (tabs), card grid, "In the news" list.
- **Article:** light reading layout (760 px), meta row, table of contents (≥ 1280 px, sticky), anchors as icon links, related product card, related posts, CTA.

## Contact `/contact` · Book a demo `/request-demo`
- **Demo:** two columns. The form is first on mobile. The left side shows "Your session will cover" (driven by product; preselected from `?product=`), a 30-minute agenda and what happens next.
- **Contact:** a form plus offices, email and phone with copy buttons.
- Validation, honeypot and payload are unchanged.

## Product tour, Prompt Heist, legal pages, sitemap, 404
- **Product tour:** restyled with the same steps, light AppFrame.
- **Prompt Heist:** keeps its own dark game identity inside one navy band. The global overlay is removed.
- **Legal and sitemap:** light reading layout; anchors fixed.
- **404:** helpful links plus search.
