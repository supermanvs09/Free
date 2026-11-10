# QA Report — Deep Algorithms website redesign

Tested build: `npm run build` (44 prerendered pages, a 404, `sitemap.xml`, `robots.txt`), served with `scripts/serve.mjs` exactly as production serves `dist/`. Chromium (Playwright). 6 November 2026.

## 1. Summary

| Check | Result |
|---|---|
| Routes | 44 pages + 404, all return 200 (the 404 route returns 404) |
| Viewports | 1920, 1440, 1280, 768, 390, 360: **282 page loads, 0 console errors, 0 horizontal overflow, exactly one H1 on every page** |
| Internal links | **217 distinct internal targets from every page, 0 broken; every `#anchor` target exists** |
| Redirects | `/ad-security` → `/adapid-ai/active-directory-security`; `/platform` → `/products` (client, nginx, `vercel.json`, `_redirects`) |
| End-to-end suite | **183 passed, 0 failed, 11 skipped** (desktop-only and phone-only cases), run twice in a row with no retries |
| Contrast | Body, secondary, caption, lead, label and link text ≥ 4.5:1 on white (asserted in `tests/theme.spec.js`) |
| Keyboard | Skip link, utility bar, four menus, search, CTAs and every demo reachable by Tab, with a visible 2 px focus ring; Escape closes menus and returns focus; tabs support arrow keys, Home and End |
| Reduced motion | Demos render a finished state and do not auto-play; transitions are instant (asserted in `tests/interactive.spec.js`) |
| Minimum text | No UI text under 12 px in pages or demos. Exceptions: the decorative blog-cover illustrations (`aria-hidden`) and the Prompt Heist game's own styling |

## 2. Test matrix

| Area | How it was tested | Result |
|---|---|---|
| Every route renders | `tests/pages.spec.js`: status, one H1, title, meta description, scroll-through, no console errors | Pass (44 routes × desktop) |
| Every route, six widths | `tools/qa/viewports.cjs`: overflow, offending elements, H1, errors | Pass (282 loads) |
| Navigation | `tests/navigation.spec.js`: four menus open, close and return focus; Products menu lists all 4 adapID products, both overviews and all 6 Zenstra capabilities and navigates; menus, footer and sitemap list the same products; redirects; breadcrumbs; mobile drawer | Pass |
| Product demos | `tests/interactive.spec.js`: home decision console (4 identity types); CIRM stages, evidence generation and policy slider; NHI identity selection, granted vs used, propose-to-owner; Fraud scam hold vs genuine approval; AD apply fix (60 → 19 paths); Zenstra hold, block and chain verification; discovery scan and owner assignment; MCP keep version; detection containment; Products filter (6 and 14 matches); product tour by button, keyboard and URL | Pass |
| Forms | Demo: `?product=zenstra` preselects and updates "your session will cover"; empty submit shows errors and focuses the first invalid field. Contact: same validation. The payload and endpoint are unchanged from the previous site | Pass |
| Theme | `tests/theme.spec.js`: no dark sections on five representative pages, white header, navy footer; contrast | Pass |
| Phone layout | `tests/mobile.spec.js`: one bottom bar with Menu and Book a demo, drawer, bar steps aside at the footer; no sideways scroll at 360 px on five demo-heavy pages; demo form above the fold; footer folds | Pass |
| Search and terminal | `tests/details.spec.js`: Ctrl K, header search button, Escape, terminal | Pass |
| Responsive (existing suite) | `tests/responsive.spec.js` (unchanged) | Pass |

## 3. Issues found during QA and fixed

| # | Issue | Fix |
|---|---|---|
| Q1 | Prerender crashed on `/solutions/government`: all of its figures are unsourced, so the sourced-only filter left the hero empty | Hero falls back to the descriptive figure; the numbers section shows only sourced figures, or an "Outcomes" list when there are none |
| Q2 | A menu reopened itself if you hovered, clicked and pressed Escape within 120 ms (a pending hover timer) | The timer is cancelled on click and on Escape (`Header.jsx`) |
| Q3 | Pages without a scroll-reveal never marked themselves hydrated | The app shell sets the marker on mount (`App.jsx`) |
| Q4 | Skip to content scrolled to the main content, but focus stayed on `<body>` | `<main tabIndex={-1}>` takes focus |
| Q5 | Two Prompt Heist controls had no accessible name (Ideas, Send) | `aria-label` added |
| Q6 | Text under 12 px in the AD path labels, NHI graph labels, the phone status bar and the header "New" badge | Raised to 12 px |
| Q7 | The AD attack path overflowed horizontally and truncated node names | Re-laid as a vertical hop list beside the fix panel |
| Q8 | Fraud signal rows squeezed into tall columns at 390 px | Label and value stack below 640 px |
| Q9 | Healthcare solution cards linked "Answer the regulator" to NHI Security (positional mapping) | Explicit product per card |
| Q10 | The logo-wall caption said logos were "shown with permission", which is not verified | Reworded to "The nature of each relationship varies by organisation." |
| Q11 | AD technique "Golden ticket" had been reworded to a stronger claim during the rebuild | Restored to the original "Covered" |
| Q12 | The phone's call timer (7 min) disagreed with the signal panel (6 min) | Aligned |

## 4. Before and after

Screenshots are in `screenshots/before/`, `screenshots/after/` and `screenshots/compare/`. `compare/` holds side-by-side images of the hero and the whole page for 12 major routes. Page length is in pixels.

| Route (before → after) | Desktop before → after | Phone before → after |
|---|---|---|
| `/` | 8,499 → 8,558 | 13,140 → 14,405 |
| `/products` | 3,812 → 3,543 | 7,061 → 6,582 |
| `/adapid-ai` (CIRM) → `/adapid-ai/continuous-identity-risk-management` | 11,571 → 6,061 | 14,601 → 9,850 |
| `/adapid-ai/nhi-security` | 8,402 → 6,221 | 12,770 → 8,634 |
| `/adapid-ai/fraud-prevention` | 10,129 → 6,764 | 16,050 → 11,121 |
| `/ad-security` → `/adapid-ai/active-directory-security` | 8,456 → 5,094 | 11,838 → 7,433 |
| `/dpdpa-compliance` | 8,344 → 5,657 | 14,035 → 8,322 |
| `/agentic-ai/agentic-identity` | 10,389 → 6,297 | 17,039 → 9,560 |
| `/why-deep-algorithms` (company and case) → `/about-us` | 11,617 → 7,869 | 14,713 → 15,057 |
| `/blogs` | 5,226 → 3,993 | 8,910 → 6,828 |

The home page is about the same length, but it now carries the product ecosystem, problems, industries, evidence and trust sections the brief requires, and it no longer has a floating overlay.

Distinct font sizes per page (desktop):

| Page | Before | After |
|---|---|---|
| CIRM | 28 | 17 |
| BFSI | 33 | 12 |
| Products | 13 | 10 |
| ICMS | 18 | 12 |

What remains on demo-heavy pages is the product-UI scale (12–14.5 px for dense software screens), which is intentional.

## 5. Known limitations and items for the company

| # | Item | Status |
|---|---|---|
| L1 | External links to LinkedIn and techobserver.in return 999, 429 or 403 to automated checks (bot protection), so they could not be verified automatically | Manual click-through recommended before launch |
| L2 | Blog cover illustrations contain miniature text at phone width | Decorative and `aria-hidden`; the article title and summary carry the meaning |
| L3 | The Prompt Heist game keeps its own dark visual language and some 11 px labels | Intentional, separate experience; outside the marketing design system |
| L4 | Certifications (ISO/IEC 27001, SOC 2 Type II, ISO/IEC 42001, ISO/IEC 27701) | Shown once per relevant page as "available on request". **Needs confirmation** (Audit, open question 1) |
| L5 | Logo wall relationships | Grouped by sector under "Organisations we work with". **Needs confirmation** of each relationship and logo permission (open question 2) |
| L6 | Product documentation and case studies | Not linked: none exist in the repository (open questions 4 and 5) |
| L7 | All product UI in the demos is illustrative sample data, labelled as such. Real product screenshots can replace any demo panel one for one | By design (brief: "do not create fictional functionality"; every demo shows a capability documented on the previous site) |
| L8 | The previous e2e expectations about the old design (sheets, role cards, logo marquee) were replaced with tests of the new behaviour | `tests/*.spec.js` |

## 6. Addendum: Prompt Heist banner, launcher and practice lab

See `PROMPT_HEIST_DESIGN.md`. Re-tested after adding them:

| Check | Result |
|---|---|
| End-to-end suite | **197 passed, 0 failed**, 13 skipped (14 new runs in `tests/heist-lab.spec.js`) |
| Viewports 1440, 1280, 1024, 390, 360, 320 | 282 page loads, 0 console errors, 0 horizontal overflow, one H1 on every page |
| Lab panel at each of those widths | Inside the viewport, input visible, no sideways scroll; modal sheet below 640 px |
| On-screen keyboard (simulated `visualViewport`) | The sheet rides above the keyboard and the input stays visible |
| Navbar | `Header.jsx`, the menus and their styles, and `MobileBar.jsx` unchanged |

## 7. How to re-run

```bash
npm ci && npm run build
npm run test:e2e          # or BASE_URL=http://127.0.0.1:4173 npx playwright test
# in a container whose Chromium differs from the pinned Playwright:
CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```
