# Redesign v3: "Signal Graphite"

A complete visual redesign of deepalgorithms.io (UI, type, imagery and motion) built from the 96 website
shots by Emon (dribbble.com/emon_pixels, stored in `templates/emon-pixels/all-96/` on the design branch)
and the competitor research (SailPoint, CyberArk, Okta, Microsoft Entra, Palo Alto Networks).
Content, URLs, navigation labels, form fields and the information architecture stay as they are
(redesign protocol: change the look, not what search engines, analytics and users rely on).

## 1. Direction

**Reading:** an enterprise identity-security site for CISOs, IAM and SOC teams, banks and government,
with a cinematic, dark, precise language, leaning toward the dark product-led SaaS shots (Outnex, Markiq,
Signal X, Volectra) with Quantra's sharp, bracketed detailing.

| Decision | Choice | Why |
|---|---|---|
| Theme | Dark, one theme for every page | 70% of the strongest shots (Outnex 54/68, Markiq 18/70, Quantra 26, Signal X 42/67, Volectra 28, Paymark 30/91) are dark. Security buyers read dark as "operational". One theme avoids mid-page flips. |
| Colour | Graphite neutrals tinted toward the brand blue + one action colour (brand blue, brightened for dark) | Keeps the brand recognisable (logo and current site are #0a62b0). Product accents kept, retuned for dark. Prompt Heist keeps its red, scoped to its pages. |
| Display type | **Funnel Display** (variable) | Wide, confident grotesk with character, like the display faces in the shots (Kenter, Markiq, Payco). Replaces Inter. |
| Body | **Geist** (variable) | Neutral, highly legible on dark, technical feel. |
| Data / labels | **Geist Mono** (variable) | Mono labels and figures, as in Quantra, Navarre and the dashboard shots. Replaces JetBrains Mono. |
| Shape | Sharp: 2 to 6 px radii, bracket corners on frames and media | The user's "sharp edges, more detailing" brief (Quantra). Pills only for tags. |
| Imagery | Existing photography treated as graded, masked media: duotone-blue grade, grain, clip-path reveal, parallax, slow zoom | No stock swap needed; the treatment makes the set cohesive and cinematic. |

## 2. Pattern catalogue (shot number → where it is used)

Shot numbers refer to `templates/emon-pixels/shots.txt`.

| Pattern | Shots | Used on |
|---|---|---|
| Centred dark hero over a product console, glow behind | 18, 54, 68, 70, 42, 67 | Home hero, Products, platform pages |
| Device / app frame in perspective that flattens on scroll | 10, 17, 19, 28, 29, 31 | Home hero console, product heroes (`TiltFrame`) |
| Kinetic headline: words rise out of a mask | 3, 12, 22, 77, 88 | Every page hero (`SplitTitle`) |
| Logo marquee row | 18, 53, 54, 69, 71, 89 | Home trust strip, About |
| Big-number stat band with count-up | 13, 55, 89, 69 | Home, Why, About, product pages |
| Bento grid with mixed tile sizes and media tiles | 24, 47, 53, 69, 73, 74 | Platforms, trust, capabilities |
| Sticky stacking cards | 26 ("How Quantra secures"), 37, 57 | Home problems, Why |
| Sticky scroll: steps on the left, pinned visual on the right | 26, 54, 70 | Home "How it works", product workflows |
| Scroll-linked manifesto (words light up as you scroll) | 50, 57, 77 | Home statement, About, Why |
| Horizontal rail of cards | 20, 75, 86 | Industries, research |
| Masked photo reveal + parallax | 4, 5, 57, 59, 63 | Industries, About, Careers, Solutions |
| Spotlight border that follows the cursor | 54, 68, 80, 92 | Cards and feature tiles |
| Bracket corners and mono metadata | 26, 9, 41 | Frames, media, section labels |
| Numbered FAQ / accordion in hairline rows | 26, 31, 65, 70 | FAQ on every page |
| Giant wordmark footer | 8, 36, 50, 57, 59 | Footer on every page |
| Floating assistant widget | 32, 33 (AI chat widget), SailPoint "Ask Lisa" | Prompt Heist launcher (Vault) |
| Glow grid backdrop and film grain | 28, 42, 61, 80 | Heroes, CTA band |

## 3. Motion system

All motion enhances content that is already in the prerendered HTML; nothing is hidden without JavaScript.
Every effect has a `prefers-reduced-motion` fallback that shows the final state.

| Primitive | Implementation | Notes |
|---|---|---|
| `SplitTitle` | words wrapped in masks, CSS transition triggered after hydration | SSR text unchanged; screen readers read the plain heading |
| `MediaReveal` | clip-path inset wipe + 1.12 → 1 scale on enter, parallax via GSAP ScrollTrigger scrub | images get bracket corners and grade |
| `TiltFrame` | rotateX 18° → 0 tied to scroll (ScrollTrigger scrub) | desktop only |
| `Marquee` | CSS keyframes, duplicated track, pauses on hover/focus | already supported pattern, restyled |
| `ScrollWords` | word opacity bound to scroll progress (ScrollTrigger) | |
| `StickyStack` | CSS `position: sticky` cards with scale/dim driven by the next card (ScrollTrigger) | |
| `Spotlight` | CSS radial gradient following pointer via CSS variables | pointer: fine only |
| Count-up | existing `CountUp` | |
| Footer wordmark | letters rise on enter | |

GSAP is already a dependency (`gsap` 3.14); no new animation library is added. Only fonts are added.

## 4. Implementation order

1. Tokens, fonts, global CSS (`src/styles.css`): dark theme, type scale, buttons, cards, frames, forms, tabs, prose.
2. Motion primitives (`src/components/fx.jsx`).
3. Shared components: `ui.jsx`, `ds.jsx` (PageHero, Section, StatTile, FeatureCard, LogoWall, Faq, CtaBand, PostCard, AppFrame).
4. Header (mega menu), Footer (giant wordmark), MobileBar.
5. Home, rebuilt section by section with the catalogue above.
6. Products, platform and product pages, Solutions, Why, About, Careers, Blog, Article, Tour, Demo, Contact, Legal, Sitemap, 404, Prompt Heist.
7. Demos and visualisations re-themed (hard-coded light colours replaced by tokens).
8. QA (section 5), fixes, second pass.

## 5. Test plan

- `npm run build` must prerender every page.
- The existing Playwright suite (`tests/`, desktop and phone) must pass; tests are only changed where they assert old styling, never to skip behaviour.
- Screenshot every route at 1440, 1024, 768 and 390 px; check for overflow, overlap and clipped text.
- Contrast: body text ≥ 4.5:1, large text ≥ 3:1 on the dark surfaces.
- Reduced motion: every page renders its final state.
- Keyboard: menus, tabs, accordions, demos, Prompt Heist.
- No console errors.
