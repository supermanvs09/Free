# Cisco research (October 2026)

Astrix is now part of Cisco, so Cisco is the right benchmark for **how a multi-product security company is organised**. Astrix remains the benchmark for **illustration and motion**. All pages below were captured live from cisco.com and astrix.security.

## Typography
- **Cisco web body font: Inter** (with CiscoSans and Noto Sans as fallbacks). Body 16px / 400, ink `#07182d`. Hero H1 60px / 500 white on black. Lead text 20px in slate `#536070`.
- Inter is open source (SIL OFL), so we adopt it for body and UI. We keep Hanken Grotesk Light for display headings, as the closest free match to Astrix's light grotesk.
- We do not use CiscoSans or BDO Grotesk: both are proprietary.

## Navigation (copied as a pattern)
- **Utility bar** above the header: How to buy, Partners, Log in, region.
- **Primary nav:** Products and Services, Solutions, Support, Learn, Why Cisco. At the right, an outlined pill "Trials and demos" and search.
- **Mega menu is two-pane.**
  - Left: a vertical list of categories, with a blue marker on the active one and a "Home" link at the top.
  - Right: for Products, a "Featured products" column, a "Use cases" column and one promo card (image, title, blurb, link). For Solutions, three image cards.
  - Hovering or clicking a category swaps the right pane in place.
  - The close X sits at the top right.

## Information structure
- **Category page (Security):** dark hero → "What's new" (3 image cards) → "What you can do" (icon grid) → products grouped by **job to be done** (Cloud protection, Workforce protection, Threat intelligence and response). Each group has 3 to 4 product cards, each with a UI thumbnail, name, two-line description and "Explore X". Then a customer quote, resources, **FAQ accordion** and a dark closing CTA.
- **Product page (AI Defense):** generative-art hero with "Request a demo" and "Watch overview (02:19)" → problem paragraph → three icon pillars (Identify, See, Mitigate) → dark call-out → "essential components" grid with UI screenshots → a feature block → platform value with a quote → resources → closing CTA.
- **Products index:** categories as H2s, each with its product cards. This is Cisco's equivalent of one page that lists everything.
- **Footer:** very light, a single row of utility links.

## What we adopt, and what we skip
| Cisco pattern | Our version |
|---|---|
| Two-pane mega menu with promo card | Products menu: product lines on the left, modules and a promo card on the right. Solutions menu: industries with image cards. |
| One page listing every product by job to be done | New `/products` page |
| UI thumbnails on product cards | Original mini-console thumbnails, no stock photography |
| FAQ accordion with FAQPage schema | Added on `/products` and `/platform` |
| "What's new" cards | Home page, led by NHI Security for AWS |
| Dark closing CTA | Already in place |

## Astrix (motion and illustration, recreated as original work)
- Light grotesk headings, solid grey frames behind product UI, product UI shown with real vendor logos, coral for risk.
- Motion vocabulary: progress-bar tabs, a cursor that glides and clicks inside the UI, nodes lighting up along a path, slow ambient loops. We re-draw these in code with our own content. We do not reuse their Lottie files or artwork.

## Problems found in our own v2 (user feedback)
1. The home "Most access in your company…" block used a generic story film and plain line icons. It read as dull.
2. Research covers were flat colour plus a thin icon, identical per category.
3. The nav was a flat grid of links with no hierarchy or imagery.

## Second review (October 2026)

Re-read cisco.com (home, Security category, AI Defense product page) against our site.

| Cisco has | Our answer |
|---|---|
| Utility strip above the header (How to buy, Partners, Log in, region) | **Removed on request.** Contact, Careers and Research live in the main menu and footer; phone and email are in the footer and on Contact. |
| Hero with a second CTA "Watch video (01:33)" | Home hero now has "Watch the film (1:12)", which jumps to the film. |
| Sticky bar under the product hero (Overview, Resources, Request a demo) | Added to every product page: Capabilities, Why it matters, Getting started, Research. The demo button shows on phones, where the header has none. |
| Footer with Accessibility, Sitemap, Trademarks, Newsroom | Added an Accessibility Statement and an HTML Sitemap page. No Trademarks or Newsroom page yet: nothing to put on them. |
| Search in the header | Skipped for now: 35 pages, and the menus reach all of them in two clicks. Revisit past about 60 pages. |
| Announcement strip under the header | Skipped: it adds a second banner above the story, and the hero already carries the film. |
| Chat assistant bubble, cookie banner | Skipped. We have no assistant, and we set no tracking cookies (see the Cookie Policy). |
| Customer quotes, case studies, logo wall of 1 million customers | Skipped on purpose: we do not invent customers or quotes. Add real ones when you have written permission. |
| Free trials, Partners, How to buy | Not offered today. Add pages only when the offer exists. |
| Product pages: problem paragraph, three pillars, component grid with UI shots, resources, FAQ | Same order on ours (capabilities with product UI, why it matters, getting started, research, closing CTA); FAQ is on /products and /platform. |
