# deepalgorithms.io

React 19 + Vite 8 + Tailwind 4, prerendered to static HTML (41 pages, a 404, sitemap.xml and robots.txt).

```bash
npm ci
npm run dev          # http://localhost:5173
npm run build        # dist/, static, deploy anywhere
npm run preview      # serves dist/ the way Vercel or Netlify do
npm run test:e2e     # Playwright checks against the build (npx playwright install chromium once)
```

Deploy `dist/` to any host that serves `about-us/index.html` for `/about-us` (Vercel and Netlify do; `vercel.json` and `public/_redirects` are included). Do not use a single-page-app fallback that answers every URL with the home page: React would hydrate the wrong page.

## Docker

```bash
docker compose up --build -d      # http://localhost:8080
# or
docker build -t deepalgorithms-website . && docker run -p 8080:8080 deepalgorithms-website
```

Two stages: Node 22 installs, builds and prerenders every page; nginx then serves the static files as a non-root user (port 8080, `/healthz` for health checks). `docker-compose.yml` also runs it read-only, with every Linux capability dropped. Put TLS in front (a load balancer, Cloudflare or a reverse proxy).

`nginx/default.conf` serves clean URLs (`/about-us`), sends `/about-us/` to `/about-us`, answers unknown paths with `404.html` and a real 404, caches fingerprinted assets for a year and pages not at all, gzips text and supports byte ranges. `nginx/security-headers.conf` adds HSTS, `nosniff`, frame denial, a referrer and permissions policy, and a Content-Security-Policy that `scripts/csp.mjs` writes from the built pages: inline scripts run only by hash, forms post only to `SITE.formEndpoint`, and the only outside scripts allowed are Google's page translator, loaded when a visitor picks a language. The e2e suite passes against the container: `BASE_URL=http://127.0.0.1:8080 npm run test:e2e`.

## Design system and redesign documents

The 2026 enterprise redesign is documented in `docs/redesign/`:

| Document | What it covers |
| --- | --- |
| `WEBSITE_AUDIT.md` | Every route audited (purpose, hierarchy, layout, type, visuals, interactions, conversion, mobile, accessibility), content and credibility findings, open questions for the company |
| `DESIGN_SYSTEM.md` | Research findings, colour, type scale, spacing, radius, elevation, components, motion and accessibility rules |
| `INFORMATION_ARCHITECTURE.md` | The verified portfolio, menus, footer, URL changes and journeys |
| `PAGE_DESIGN_SPECIFICATIONS.md` | Page by page: sections and the interactive product demonstration on each |
| `IMPLEMENTATION_PLAN.md` | What was kept, what was replaced, and why no new dependencies were added |
| `QA_REPORT.md` | Results at six widths, links, e2e, keyboard, contrast, reduced motion; issues fixed; known limitations |
| `screenshots/` | `before/`, `after/` and side-by-side `compare/` images |

## Where things are

| Path | What |
| --- | --- |
| `src/styles.css` | Design tokens (light foundation; dark only via `.tone-d` for the footer and Prompt Heist), type scale (`t-display` … `t-caption`), buttons, cards, badges, app frames, tables, tabs, stepper, header, sub-nav and mobile bar |
| `src/components/ds.jsx` | Design-system components: `PageHero`, `Section`, `SubNav`, `StatTile` (source required), `DecisionCard`, `AppFrame`, `Stepper`, `DemoControls`, `FeatureCard`, `LogoWall` (grouped by kind), `Faq`, `CtaBand`, `ResearchCards` |
| `src/components/ui.jsx` | Primitives: `Button`, `Icon` (Phosphor), `Reveal`, `SectionHead`, `Breadcrumb`, `Accordion`, `Tabs` |
| `src/data/ia.js` | The information architecture, one source for the header menus, mobile drawer, footer, breadcrumbs and sitemap page |
| `src/components/demos/` | Interactive product demonstrations with sample data: home decision console, CIRM seven-stage workflow, NHI cloud identity explorer, Fraud banking journey, AD attack path explorer, Zenstra agent console and capability panels, ICMS data map and breach timeline, deployment architecture |
| `src/lib/useSteps.js` | Drives every step-by-step demo: plays only while on screen, pauses on interaction, finished state for the server render and reduced motion |
| `src/components/Header.jsx`, `Footer.jsx`, `MobileBar.jsx` | Utility bar, four mega menus (Products, Solutions, Resources, Company), search, mobile drawer; footer; the single phone bar |
| `src/pages/` | One component per page; product pages under `pages/products/`; the six Zenstra capabilities share `Capability.jsx` with a focused demo each |
| `src/components/viz/kit.jsx` | Brand marks of the tools the products connect to (Simple Icons, CC0, plus drawn marks) |
| `tests/` | Playwright end-to-end checks: every page, navigation and IA, every demo, theme and contrast, phone layout |
| `tools/qa/` | Crawlers used for the QA report: every route at six widths, every internal link and anchor |
| `tools/film/`, `tools/walkthrough/`, `src/dev/` | The product film and walkthrough tooling, and the dev-only gallery (not part of the build) |

All product UI in the demonstrations is illustrative sample data and is labelled as such.
