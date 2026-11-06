# Implementation Plan

## Principles
- **Preserve what works:** routing, prerender, SEO head, forms and endpoint, search, translation, the article renderer, the Prompt Heist game, data files and deployment config.
- **Replace what causes the problems:** the dark-first token system, ad-hoc type sizes, the one long template and the shell overlays.
- **No new runtime dependencies.** React, react-router, Tailwind 4, Phosphor icons, Simple Icons and GSAP are already present. See `DESIGN_SYSTEM.md` §9 for why Motion, Lenis and Lottie were not added.
- **Every interactive demo is a pure React component** with prerenderable final state, keyboard support, `aria-live` status and a reduced-motion path.

## Work breakdown

| # | Step | Files |
|---|---|---|
| 1 | **Tokens and base styles.** Rewrite `styles.css`: light-first tokens, type scale, containers, section rhythm, component classes, reduced motion. Keep `viz.css` only for pages that still use legacy pictures (Product tour, Heist). | `src/styles.css` |
| 2 | **IA source of truth.** `src/data/ia.js` holds the products tree, solutions, resources and company; it drives the menus, footer, sitemap page and breadcrumbs. | `src/data/ia.js`, `nav.js` (kept for search) |
| 3 | **DS components.** Button, Badge, Card, AppFrame, DataTable, Tabs, Stepper, Accordion, StatTile, DecisionCard, SubNav, Section, PageHero, CtaBand, LogoWall, ProductTile, FAQ, ArrowLink, ResearchCards. | `src/components/ds/*.jsx` |
| 4 | **Shell.** New Header (utility bar, 4 mega menus, search, mobile drawer), Footer, MobileBar (single fixed bar), removal of the HeistTeaser overlay and the decorative Backdrop. | `Header.jsx`, `Footer.jsx`, `MobileBar.jsx`, `App.jsx` |
| 5 | **Demos.** HomeConsole, CirmWorkflow, PolicySlider, NhiExplorer, FraudJourney, AdPathExplorer, ZenConsole (and capability modes), IcmsMap, BreachTimeline, IndustryWorkflow, IdentityInventory, ArchitectureDiagram. | `src/components/demos/*.jsx` |
| 6 | **Pages.** Home, Products, adapID overview (new), CIRM (moved), NHI, Fraud, AD (moved), Zenstra, Capability, ICMS, Solution, About (new), Why, Careers (new), Blog, Article, Demo, Contact, Tour, Legal, Sitemap, NotFound, Heist (restyle). | `src/pages/**` |
| 7 | **Routes and redirects.** New paths in `PATHS` and routes; redirects in `App.jsx`, `vercel.json`, `public/_redirects`, `nginx/default.conf`. | `App.jsx`, `data/products.js`, configs |
| 8 | **Content fixes.** C1–C11 from the audit (codenames, unverified statistics, grouped logos, single CTA, terminology, heading anchors). | data files, `Prose.jsx` |
| 9 | **Tests.** Update the Playwright e2e for the new IA; add a crawler that checks every internal link, every route at 6 widths for overflow, console errors and keyboard focus. | `tests/`, `tools/qa/` |
| 10 | **QA and screenshots.** Before and after captures for every major route; `QA_REPORT.md`. | `docs/redesign/` |

## Sequencing
1 → 2 → 3 → 4 are foundations, built and verified in the browser before any page.

Then pages in order of buyer impact: Home → adapID (overview, CIRM, NHI, Fraud, AD) → Zenstra (overview, capabilities) → ICMS → Solutions → Products → Company (About, Why, Careers) → Resources → forms → utility pages.

Each page is built, prerendered and screenshotted at 1440 and 390 before moving on.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Moving CIRM off `/adapid-ai` breaks inbound links to CIRM content | `/adapid-ai` stays live as the adapID overview with a prominent CIRM entry; no 404s |
| Prerender requires exactly one H1 and no Suspense placeholders | DS `PageHero` renders the only H1; demos render full markup on the server |
| Legacy pictures (`viz/*`) still referenced by the Product tour and articles | They are kept and imported only where used, so they do not load on other pages |
| Unverified claims (certifications, logo relationships) | Shown once, labelled neutrally, and listed as open questions in the audit |
