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
| 1 | SSR/static for all public pages | Done: 32 pages + 404 prerendered |
| 2 | robots.txt | Done: generated, points to the sitemap |
| 3 | sitemap.xml | Done: generated from the route list |
| 4 | Unique title per page | Done: verified, 33/33 unique |
| 5 | Unique meta description | Done: verified, 33/33 unique |
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

- **Screenshots and checks.** All 32 routes at 1440px and 390px: no console errors, no hydration errors, no horizontal overflow.
- **Accessibility.** axe-core (WCAG 2 A/AA and best practice): 0 violations at both widths.
- **Bundle.** The main JS chunk is about 160 KB gzipped. Phosphor icons ship all six weights per icon. If page weight matters, swap to an icon set that tree-shakes per weight.
- **Fonts.** BDO Grotesk (Astrix) was substituted with Hanken Grotesk because the licence was unclear.
