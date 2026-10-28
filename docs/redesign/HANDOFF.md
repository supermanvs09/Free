# Handoff: deepalgorithms.io redesign

The code is in `website/`. It is built with React 19, Vite 8, Tailwind 4 and react-router 8. Every public page is prerendered to static HTML.

```bash
cd website
npm ci
cp .env.example .env   # fill in before a production build
npm run build          # client build, SSR build, then prerender to dist/
npx vite preview       # serve dist/ locally
```

Deploy `dist/` to any static host. The prerender step fails the build if any page does not have exactly one `<h1>`.

## Fix before launch

1. **The form endpoint is an API Gateway `/dev` stage.** `VITE_FORM_ENDPOINT` defaults to the URL the old site used. Point it at a production stage.
   - Demo requests now send the product ids `zenstra` and `nhi` as well as the old `all`, `adapid`, `botshield` and `dpdpa`. Make sure the backend accepts the new ids.
   - The CORS preflight was checked and allows `*`.
   - One test demo request ("Test User", Acme, test@acme.com) may have reached that endpoint during QA. Please delete it.
2. **Google Analytics conflicts with the cookie policy.** The cookie policy (copied verbatim) says "no tracking, no advertising, no analytics". Do not set `VITE_GA_ID` until the policy is updated and consent is in place.
3. **The privacy policy has no DPDPA content.** It cites only the IT Act and the SPDI Rules, and it names no grievance officer. For a company that sells DPDPA compliance, this needs legal review.
4. **The legal entity name is inconsistent.** It appears as "Deep Algorithms Solution Pvt. Ltd." (privacy policy, footer) and as "Deep Algorithms Solutions Pvt Ltd." (terms). Confirm which is correct.
5. **The US office differs between sites.** zenstra.ai lists Texas, while this site lists Maryland (Clarksburg). Confirm which is correct.
6. **Certifications.** The site shows ISO 27001, SOC 2 Type II, ISO 42001 and ISO 27701. Confirm that all four are current before launch.
7. **Leadership photo.** The source file for Abhishek Tripathi's photo was named `image-gen_…`, which suggests it is AI-generated. Replace it with a real photo.
8. **Product claims to confirm.** Please confirm these with product owners:
   - "< 80 ms" fraud decisions
   - "< 5 min" ICMS audit packages
   - the 99.99% SLA
   - "15:1" NHI to human ratio, "94%" and "0 alerts" (Deep Algorithms Research)
   - "26 workload families" and "90 days of CloudTrail" (from the NHI codebase)

   Old-site figures that could not be traced to a source were removed.

## Environment

| Variable | Purpose |
|---|---|
| `VITE_SITE_URL` | Canonical origin, used for canonical URLs, Open Graph and the sitemap |
| `VITE_FORM_ENDPOINT` | Lead API for the demo and contact forms |
| `VITE_GA_ID` | GA4 ID. Empty means no analytics (see item 2 above) |
| `VITE_GSC_VERIFICATION` | Search Console HTML-tag token |

## Hosting notes

- **URLs.** Pages are written as `path/index.html`. Canonicals have no trailing slash.
  - `vercel.json` sets `cleanUrls` and `trailingSlash: false`.
  - On Netlify or Cloudflare Pages, `public/_redirects` applies.
  - On nginx, use `try_files $uri $uri/index.html =404; error_page 404 /404.html;`.
- **Redirects.** Every old URL is kept. The only removed pages are `/svg-export` and `/verify`, which 301 to `/` (`_redirects` and `vercel.json`). On nginx, add `location = /verify { return 301 /; }` and the same for `/svg-export`.
- **404.** Unknown URLs must be served `404.html` with a 404 status. It is `noindex`.

## SEO checklist (20 basic checks)

| # | Check | Status |
|---|---|---|
| 1 | SSR/static for all public pages | Done: 35 pages + 404 prerendered |
| 2 | robots.txt | Done: generated, points to the sitemap |
| 3 | sitemap.xml | Done: generated from the route list |
| 4 | Unique title per page | Done: verified, 35/35 unique |
| 5 | Unique meta description | Done: verified, 35/35 unique |
| 6 | One H1 per page | Done: enforced at build |
| 7 | Canonical tags | Done: all unique |
| 8 | OG image and tags | Done: `public/og/default.png` (1200×630) plus Twitter card |
| 9 | Custom 404 | Done |
| 10 | 301s for changed URLs | Done: see Hosting notes |
| 11 | Alt text on images | Done: verified on every `<img>`. Illustrations have `role="img"` labels |
| 12 | WebP images | Done: all content images. PNG kept only for favicons and the OG image, for crawler compatibility |
| 13 | Lazy loading below the fold | Done |
| 14 | Organization JSON-LD | Done, on every page, plus SoftwareApplication, BlogPosting and BreadcrumbList |
| 15 | Breadcrumbs | Done: visible on inner pages, plus JSON-LD |
| 16 | Internal links | Done: related products, research rows, article to product, 404 suggestions |
| 17 | Google Analytics | Ready behind `VITE_GA_ID` (blocked by item 2) |
| 18 | Search Console tag | Ready behind `VITE_GSC_VERIFICATION` |
| 19 | Privacy policy page | Done (content gap: item 3) |
| 20 | Contact form that sends | Tested end to end against a mocked API (validation, focus, error, success, honeypot, exact payload). Live CORS preflight passes. Send one real test after item 1 |

## QA results

- **Screenshots and checks.** All 35 routes at 1440px and 390px: no console errors, no hydration errors, no horizontal overflow, one H1 each. The one exception is a URL with no page (`/no-such-page`) when served by `vite preview`, which falls back to the home HTML and logs React error 418. Real hosts must serve `404.html` with a 404 status (see Hosting notes); `404.html` itself loads clean.
- **Film.** Scrubbed across the whole timeline in quarter-second steps with no page error. Audio sync, chapter seeking, pause, resume and mute were checked with the audio playing. The audio could not be listened to here, so the voice quality needs a human ear.
- **Accessibility.** axe-core (WCAG 2 A/AA and best practice): 0 violations at both widths.
- **Bundle.** The main JS chunk is about 160 KB gzipped. Phosphor icons ship all six weights per icon. If page weight matters, swap to an icon set that tree-shakes per weight.
- **Fonts.** Body and UI use Inter (the font cisco.com uses; open source). Headings use Hanken Grotesk Light as a free stand-in for Astrix's BDO Grotesk, whose licence was unclear. CiscoSans is proprietary and is not used.

## What changed in this round

- Removed the utility strip above the navigation. Phone and email moved to the footer.
- Rebuilt the About page: split hero with facts card, product links, compact leadership and advisor cards, and uniform photo galleries sized per use (no oversized photos).
- New hero (identity orbit) and a 20-second narrated film that shows what the product does, with floating cards and badges.
- About: Beliefs and Recognition keep the earlier card layout with softer cards, hover motion and a featured photo; "Outside the build" is an endless photo row with a pause button.
- Product pages: sticky section bar under the hero. Solution pages: own headline for the challenge section and own closing call to action. Research articles: cover beside the title instead of a full-width banner. Products page: one- and two-product groups use the space.
- Added an Accessibility Statement and an HTML Sitemap page, both linked from the footer.
- Home hero button: "Watch the film (1:12)".
- Design checklist in `qa-checklist.md`; Cisco comparison in `cisco-research.md`.

## Imagery (v5)

- **Research and industry covers** (`public/img/covers/*.webp`, 1280x800, 12-22 KB each) are soft 3D renders made offline: glossy brand tiles, our coral agent mascot and lifted chips on a flat brand-colour field. Headlines are SVG text over the render in `CoverArt.jsx`, so they stay sharp. The category is a small text label under the card, not a pill on the image. Sources and render steps are in `website/tools/covers/README.md`.
- **Home hero** (`OrbitHero` in `src/components/visuals/Flows.jsx`): the identity orbit. Our mark sits large in the middle and is the only brand colour. Three rings carry people, machine identities and AI agents as plain monochrome icons, with no third-party logos. A pulse leaves the mark every five seconds and each coral risk dot it reaches becomes a blue tick. Live SVG from one clock, a separate round layout for phones, a still frame under reduced motion and in the prerendered HTML.
- **The 20-second pitch film** (`IdentityFilm` in the same file): a narrated film in a video-style player. Three rings of icons fill up (people, machine identities, AI agents), an attacker logs in with a key nobody owns and no alert is raised, then three product views show what we do (an inventory of every identity with its owner, a risk analysis that explains why an AI agent is risky, the fixes plus a runtime check that blocks a bad action), and it ends on the secured orbit with banks, government and enterprises around our mark. Floating cards and badges, captions (CC), a transcript, and a list beside the player that seeks. The sound button sits beside the time stamp; sound starts only when you press it, from the beginning.
- **Voice-over.** The script is: "Most access in your company no longer belongs to a person. Keys, service accounts and AI agents hold it now, and attackers know it. We find every one of them, show you the risk, and fix it before it is used. Built in India, and trusted by banks, government and enterprises. Impact the future, today." It is synthetic speech (Piper voice `en_US-lessac-high`) over a very quiet generated music bed, made offline; the file is `public/audio/identity-shift.mp3`. To change the words or voice see `website/tools/voice/README.md`. A human recording would be better for a launch film; keep the same sentence timings or re-time `src/data/voiceover.js`.
- **Third-party marks** (Okta, Google, Jira, GitHub, Snowflake, Claude, PhonePe, Paytm and others) appear small, as editorial references to what each story discusses. Remove any you do not want to show.
- **Product card images** (`public/img/products/*.webp`) are crops of an illustrative console with sample data (see `tools/thumbs`). The scenario cards (`Scenarios.jsx`) and the product console tours stay live SVG/HTML. Everything pauses off screen and under reduced motion.
- **Tried and dropped:** a pre-rendered 3D hero loop and 3D film (third-party logos overpowered our mark), and flow-lane diagrams in the style of astrix.security (too close to their look). The orbit is our own system and is reused in the navy panels on Home, Platform and the four solution pages.
- **Messaging.** Home leads with "Attackers no longer break in. They log in.", a manifesto line and four sourced "why now" figures. Every external figure carries its source. Confirm the Deep Algorithms Research figure (15:1) with the research owner.
- **Cisco-style structure:** two-pane mega menu with promo cards, a `/products` page grouped by job to be done with an FAQ (FAQPage schema), and a "What's new" row. Research notes: `cisco-research.md`.
- **Not used:** AI-generated images or people, and stock photography. Real team and event photos appear on the About page only.

## Round 5 (2026-10-28): look, Zenstra capabilities, layouts, film v3
- Global: flowing ribbons (components/Ribbons.jsx), Instrument Serif italic accent words (`.accent`), brighter buttons, per-product display fonts (`font-theme-*`, set by `theme` in data/products.js).
- Zenstra: six capability pages (data/zenstra.js, illustrations in visuals/CapVisuals.jsx), all listed in the Products menu.
- Product layouts (`layout` in data/products.js): tour (adapID, ICMS), hub (Zenstra), split (NHI, BotShield, DDoS), ledger (fraud, AD), capability (Zenstra sub-pages). A hero picture that equals a row's picture is not repeated.
- Film v3 (visuals/Film.jsx): isometric 3D platform, tilted pop-up product cards, layered finish; same audio and VO cues. Hero orbit stays in Flows.jsx.
- QA run: 42 routes at 1440 and 390, one H1 each, no overflow, film scrubbed 0 to 21.5 s with no errors. Known: React #418 on the static /no-such-page only (pre-existing); one transient axe contrast hit during a heading fade on mobile /dpdpa-compliance.
- Not verified: audio sync of film v3 with sound playing (cues unchanged, scrub only).
