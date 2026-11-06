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

## Motion graphics

`src/lib/nullmotion.jsx` ports motion templates from [Null Motion](https://github.com/blixvip/NullMotion) (MIT) and drives them with [GSAP](https://gsap.com) (standard no-charge licence), as the templates do: the hero's kinetic word pill (22-kinetic-headline), every section title's word-by-word blur reveal (12-blur-reveal), the product icons rising as a 3D stack in the closing band (27-icon-stack-rise), HUD corners and a scan line over the hero picture (27-cinematic-hud-overlay), the incidents dropping in like a stack of toasts (06-notification) and the CIRM connectors popping in (17-integrations-grid). Each product page has its own move: AD Security's cursor clicks the fix and the paths to Tier 0 drop (18-cta-click), Zenstra's gateway hub and spokes (09-grid-network), BotShield's bot counter and Refused pill (16-line-growth, 01-cta-pill), ICMS's question typing itself (20-search-typing), NHI's genome rows popping in (17-integrations-grid) and the bank's notification on the Fraud phone (24-showreel-notify). GSAP loads in the browser after first paint; nothing runs for reduced motion; the server render is the finished state. The product film uses the same choreography (toast stack, phone-notify card) with GSAP's eases.

## Where things are

| Path | What |
| --- | --- |
| `src/styles.css` | Design tokens and base styles. One type family (Inter 4 with its optical-size axis); JetBrains Mono only for machine values inside product pictures. Each product line keeps one accent. |
| Themes | The default mixes tones: each page's top-level bands are light **sheets** unless marked `stage` (heroes, the logo moment, one showcase band per product page, calls to action). Light sheets only redefine the colour tokens; product pictures (`.vz`) and anything marked `tone-d` stay dark inside them. `html[data-theme=dark]` turns every band dark. The switch is in the header (`src/lib/theme.js`); the choice is stored in `localStorage` and applied by an inline script before the first paint, so there is no flash. |
| `src/components/FlowRibbons.jsx` | Fine silver ribbons behind the heroes only (canvas, pauses off screen, static under reduced motion). The film draws the same ribbons in full colour. |
| `src/components/Backdrop.jsx` | A still, neutral graphite surface behind the dark bands. Colour lives in the product pictures and the accents, not the background; brand blue is the one accent for actions. Dense reading sits on `.calm`. |
| `src/components/LogoOrbit.jsx` | The home page logo moment: the mark rises into a brand-blue plate with the line, then pops out and lands at the centre of the identity orbit, with the four products under it. |
| `src/components/HeroPhoto.jsx`, `public/img/photos/` | The home hero: a real photograph (Pexels, free licence) of a person confirmed as himself, then an impostor with his password stopped. The industry cards and industry page heroes use the same photo set; team pages use only our own photos. |
| `public/img/zenstra/agent.webp` | The Zenstra agent console: a robot hand reaching into a data network, photographed by Tara Winstead (Pexels photo 8386437, Pexels licence, free for commercial use), cropped square. |
| `src/components/Stage3D.jsx` | 3D frame for key pictures; `<Pop>` lifts the important part out of the frame. |
| `src/components/ProductMark.jsx`, `public/brand/products/` | The official product logos (Zenstra AI, adapID AI, BotShield AI, ICMS), taken from the products' own artwork on deepalgorithms.io and used in the menus, heroes, cards, the company page, research and the film. |
| `src/components/viz/` | Every product picture, as code with sample data, one file per product line, using the real tools involved (Okta, Microsoft 365, AWS services, GitHub, Claude, Salesforce, UPI…) from `kit.jsx`. Steps play while on screen; server HTML shows the final step. |
| `src/components/Header.jsx`, `src/data/nav.js` | Products and Solutions open plain enterprise menus (group labels, a name and one line per item; Products adds the tools we work with). Why Deep Algorithms, Research and Trust center are links. The bar above carries the phone number, search and the language menu. |
| `src/lib/translate.js` | The language menu: English is the source; other languages are translated in the browser by Google's page translator, loaded only when a visitor picks one. |
| `src/components/Command.jsx` | Loaded on demand. Site search (Ctrl/⌘ K, `/` or the header button) over every product, solution, report and page; and a small toy terminal behind the `` ` `` key (try `help`), hinted at by a puzzle in the browser console. |
| `src/pages/products/` | One page per product, each with its own structure; the six Zenstra capabilities share `Capability.jsx`. |
| `src/data/` | Products, solutions, company, legal, posts and site facts. Article bodies are in `src/content/posts/`. |
| `tools/film/` | The one-minute product film: script, voice, music, captions, frame renderer. See its README. |
| `tools/walkthrough/` | The site walkthrough video, recorded frame by frame on a virtual clock (`clock.js`), so every scroll and animation is smooth whatever the machine: `record.mjs <url> <dir> <segment>` for each segment in `script.mjs`, `cards.mjs`, then `make-video.sh <dir> walkthrough.mp4`. |
| `tests/` | Playwright end-to-end checks: every page, menus, interactions, search and terminal, phone layouts. |
| `Dockerfile`, `docker-compose.yml`, `nginx/`, `scripts/csp.mjs` | Container build and serving (see Docker above). |

Dev-only pages (not part of the build): `gallery.html` shows every product picture side by side; `film.html` renders the film frame by frame.

Product figures are attributed to Deep Algorithms; third-party figures carry their source. All product UI in the pictures is illustrative.
