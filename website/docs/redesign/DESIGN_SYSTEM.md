# Design System — Deep Algorithms 2027

Implemented in `src/styles.css` (tokens and component classes) and `src/components/ds/` (React components). Every page uses only these.

## 1. What the research showed

I studied eight enterprise security sites (Wiz, Okta, Semperis, CyberArk/Palo Alto Networks Idira, Microsoft Entra, Tenable, Zscaler) and two pattern libraries (Insposec, UXCyber) at 1440 px. Screens and menus were captured, and computed type was measured.

| Pattern | Seen at | What we take from it |
|---|---|---|
| A light foundation with one confident brand colour | Wiz, Entra, Okta (body), Tenable (light sections) | White and neutral-50 surfaces, brand blue reserved for actions and data emphasis |
| A heavy dark foundation | Semperis, CyberArk/Idira, Palo Alto | Works for "war room" brands; the brief asks us not to. Dark is used only in the footer and the Prompt Heist game |
| A display headline of 48–76 px with a 16–18 px lead, **one** primary CTA | all | Hero H1 at 60 px desktop, one primary CTA plus one secondary |
| Real product UI as the hero visual, legible at full size | Wiz ("Ask AI" attack path), Idira (command centre), Entra (product cards) | Every product hero shows an interactive, light, full-size product UI, never a tilted or blurred one |
| Mega menus: an intro column, grouped lists (name plus one line), featured platform cards | Okta, Semperis, Entra | Products menu: platform cards, product lists and "by need"; plus Solutions, Resources and Company menus |
| A sticky in-page sub-navigation on product pages | Entra (Overview, Products, Pricing…), Idira (Overview, Challenges…) | A product sub-nav under the header on every product and platform page |
| Analyst and customer evidence in a calm band, sources cited | Wiz, Entra, Tenable | One evidence band per page, honestly labelled, with sources |
| Big statistic with source | Idira ("109:1 machines outnumber humans"), Semperis | Statistic tiles always carry their source line |
| An FAQ near the end, then one closing CTA | Entra, Idira, Wiz | One FAQ per product page, then one CTA |
| Restraint in motion: content fades in; demos animate state, not decoration | Entra, Wiz | Motion explains a state change (score rising, path closing, decision made) |

**Our distinct identity.** The others sell platforms through analyst badges. Deep Algorithms has no analyst coverage to show. Its credibility is **showing the decision**: every product demo ends in an explainable decision (score with reasons, allow/hold/block with policy, path closed with evidence). The visual identity follows from that:
- **The decision card:** a white card with a status badge, the reason lines and a mono record ID. It recurs across all products and becomes the signature element.
- **The blue hairline:** the brand blue appears as a 2 px rule that marks the active step or stage, never as a gradient slab.
- **The mark:** the D mark from the logo appears only in the logo and the closing CTA, never as decoration.

## 2. Colour

Light foundation. Brand blue is the only colour used for actions. Product accents mark product identity in small doses (icon tile, 2 px rule, badge). Status colours are only for status.

| Token | Value | Use |
|---|---|---|
| `--c-bg` | `#FFFFFF` | Page |
| `--c-bg-subtle` | `#F6F8FB` | Alternate sections, app canvas |
| `--c-bg-muted` | `#EEF2F7` | Table headers, inputs (hover), tracks |
| `--c-surface` | `#FFFFFF` | Cards, panels |
| `--c-border` | `#E3E8EF` | Hairlines |
| `--c-border-strong` | `#CBD3DF` | Inputs, dividers that must show |
| `--c-ink` | `#0B1424` | Headings, primary text (17.9:1 on white) |
| `--c-ink-2` | `#3A4555` | Body (10.0:1) |
| `--c-ink-3` | `#5D6878` | Secondary and captions (5.9:1) |
| `--c-ink-4` | `#8A94A3` | Placeholder and disabled only (not for content) |
| `--c-brand` | `#0A62B0` | Primary actions, links, active states (5.9:1) |
| `--c-brand-hover` | `#08518F` | Hover |
| `--c-brand-50` | `#EAF3FC` | Selected rows, brand tints |
| `--c-brand-100` | `#D3E6F8` | Brand tint borders |
| `--c-accent` | `#00AEEF` | Logo cyan: data highlights and the hairline (never text on white) |
| `--c-navy` | `#0A1626` | Footer and the dark game band |

Product accents (icon tiles, product badges, the 2 px active rule):

| Token | Value | Product |
|---|---|---|
| `--c-adap` | `#0A7AB8` | adapID AI (shield blue) |
| `--c-zen` | `#4F46E5` | Zenstra AI (indigo, from its mark) |
| `--c-icms` | `#B26A00` | ICMS Compliance Suite (amber) |

Status, each with a 50 tint for badge backgrounds:

| Token | Text | Tint | Meaning |
|---|---|---|---|
| `--c-ok` | `#067647` | `#E9F7EF` | Allowed, passed, fixed |
| `--c-warn` | `#9A5B00` | `#FFF6E5` | Elevated, review |
| `--c-hold` | `#B54708` | `#FFF1E6` | Held, step-up |
| `--c-crit` | `#B42318` | `#FEECEB` | Blocked, critical |
| `--c-info` | `#0A62B0` | `#EAF3FC` | Informational |

Every text-on-tint pair meets WCAG AA (≥ 4.5:1).

**Dark surfaces.** Only `--c-navy`, used for the footer and the Prompt Heist band. Light text there is `#E8EEF6` / `#A9B6C8`.

## 3. Typography

One family, **Inter Variable** (already self-hosted via `@fontsource-variable/inter`, optical-size axis on). **JetBrains Mono** is used only for machine values inside product UI (IDs, hashes, ARNs, timestamps).

| Class | Desktop | Mobile | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `t-display` | 60/64 | 38/42 | 600 | −0.032em | Home and product hero H1 |
| `t-h1` | 48/54 | 34/40 | 600 | −0.028em | Page H1 (non-hero pages) |
| `t-h2` | 38/44 | 28/34 | 600 | −0.024em | Section headings |
| `t-h3` | 24/31 | 21/28 | 600 | −0.018em | Card and sub-section headings |
| `t-h4` | 18/26 | 18/26 | 600 | −0.01em | Small headings, table titles |
| `t-lead` | 20/31 | 18/28 | 400 | −0.005em | Section lead |
| `t-body` (base) | 16/26 | 16/26 | 400 | 0 | Body |
| `t-small` | 14/21 | 14/21 | 400 | 0 | Secondary text, UI |
| `t-caption` | 12.5/18 | 12.5/18 | 500 | 0.01em | Captions, sources |
| `t-overline` | 12.5/16 | 12.5/16 | 600 | 0.08em uppercase | Section labels |
| `mono` | 12.5–13 | | 500 | 0 | Machine values |

Rules:
- Headings use `text-wrap: balance`.
- Body measure is 68 characters at most.
- Never centre more than two lines of body text.
- Product UI uses `t-small`, `t-caption` and `mono` only; nothing under 12 px.

## 4. Space, grid and containers

- **Spacing:** a 4 px base. Tokens `--s-1` (4) `--s-2` (8) `--s-3` (12) `--s-4` (16) `--s-5` (20) `--s-6` (24) `--s-8` (32) `--s-10` (40) `--s-12` (48) `--s-16` (64) `--s-20` (80) `--s-24` (96) `--s-32` (128).
- **Section rhythm:** `sec` 96 px top and bottom at ≥ 1024 px, 72 px tablet, 56 px mobile. `sec-sm` is 64 / 48 / 40.
- **Containers:** `container` max 1240 px; `container-wide` 1400 px (dashboards); `container-text` 760 px (articles).
- **Gutters:** 20 px mobile, 32 px tablet, 40 px desktop.
- **Grid:** 12 columns with a 24 px gutter (32 px from 1280). Common splits are 6/6, 5/7 and 4/8; card grids use 3 or 4 columns, or 2 at tablet.

## 5. Radius, borders, elevation

| Token | Value | Use |
|---|---|---|
| `--r-xs` | 4 px | Badges, tags |
| `--r-sm` | 6 px | Inputs, small buttons, table cells |
| `--r-md` | 8 px | Buttons |
| `--r-lg` | 12 px | Cards |
| `--r-xl` | 16 px | Panels, app frames |
| `--r-2xl` | 24 px | Hero media, CTA band |

Borders are 1 px `--c-border`. Elevation is subtle, and only on things that float:

| Token | Value |
|---|---|
| `--e-1` | `0 1px 2px rgb(11 20 36 / .06)` (cards at rest) |
| `--e-2` | `0 4px 12px -2px rgb(11 20 36 / .08), 0 2px 4px -2px rgb(11 20 36 / .05)` (hover, menus) |
| `--e-3` | `0 24px 48px -16px rgb(11 20 36 / .18), 0 4px 12px -4px rgb(11 20 36 / .08)` (app frames, mega menu) |

No glows, no glass blur, no gradient borders.

## 6. Components (`src/components/ds/`)

| Component | Variants and states |
|---|---|
| **Button** | `primary` (brand fill), `secondary` (white plus border), `tertiary` (text with arrow), `inverse` (white on navy); sizes `sm` 36, `md` 44, `lg` 52; hover, active (1 px press), focus (2 px brand ring offset 2), disabled (ink-4, no pointer), loading (`aria-busy`) |
| **Link** | Inline (brand, underline on hover); `ArrowLink` (tertiary with a sliding arrow) |
| **Badge / Status** | `neutral`, `brand`, `ok`, `warn`, `hold`, `crit`, `product` (adap, zen, icms); dot or no dot |
| **Card** | `card` (border plus e-1), `card-link` (hover e-2 and border-strong), `card-flat` (subtle bg, no border) |
| **Panel / AppFrame** | Product UI chrome: a 44 px title bar with product mark, breadcrumb and status; optional left rail; `bg-subtle` canvas; e-3 |
| **DataTable** | Sticky header (`bg-muted`, t-caption uppercase), 44 px rows, zebra none, selected row `brand-50` plus 2 px brand left rule, sortable header button, empty, loading (skeleton rows) and error states |
| **Tabs** | `underline` (page level, 2 px brand indicator that slides) and `segmented` (in-app filters); roving tabindex, arrow keys, Home/End |
| **Stepper** | Numbered steps with a hairline connector; current step brand, done steps ok; keyboard operable; used by the CIRM workflow, fraud journey and solution workflows |
| **Accordion** | Plus/minus, a single or multi open, `aria-expanded`, animates height |
| **Field** | Label above, 44 px input, `border-strong`; focus ring brand; error `crit` text plus icon plus `aria-invalid` plus `aria-describedby`; help text |
| **Select, Checkbox** | Native controls styled; full keyboard support |
| **MegaMenu** | A disclosure per top-level item (button with `aria-expanded`); opens on click, hover (desktop) and Enter/Space; Escape closes and returns focus; panels with an intro column, groups and a featured card |
| **SubNav** | A sticky product sub-navigation (anchor links plus a primary CTA); the active section is tracked with IntersectionObserver |
| **StatTile** | Value (t-h2, tabular), label, **source line (required)** |
| **DecisionCard** | The signature element: subject, status badge, reasons list, policy, mono record ID and time |
| **LogoWall** | Groups with an overline; logos greyscale at rest (60% opacity) and full on hover; no auto-scroll |
| **CTA band** | A white card on `bg-subtle`, H2 plus lead plus primary and secondary actions plus the D mark; one per page |

## 7. Icons and illustration

- **Icons:** Phosphor (already a dependency), regular weight, 16/20/24 px, `currentColor`. Product tiles are a 36 px rounded square with the product accent at 10% and the icon at 100%.
- **Third-party logos:** existing `viz/kit.jsx` (Simple Icons) inside product UI only, where they name a real integration (Okta, Entra ID, AWS, etc.).
- **No generic AI illustrations.** Visuals are product UI, architecture diagrams (SVG, drawn to the actual deployment model) and real event photography on the company pages.

## 8. Breakpoints

| Name | Width | Notes |
|---|---|---|
| `sm` | ≥ 640 | |
| `md` | ≥ 768 | Tablet: 2-column cards, demos stack |
| `lg` | ≥ 1024 | Desktop navigation (mega menus); below this, a drawer |
| `xl` | ≥ 1280 | 12-column splits at full gutter |
| `2xl` | ≥ 1536 | `container-wide` used for dashboards; content stays at 1240 |

Tested at 360, 390, 768, 1280, 1440 and 1920.

## 9. Motion

| Token | Value | Use |
|---|---|---|
| `--d-fast` | 150 ms | Hover and press |
| `--d-base` | 240 ms | Tabs, menus, state badges |
| `--d-slow` | 420 ms | Panel transitions, path drawing |
| `--ease` | `cubic-bezier(.2, 0, 0, 1)` | Standard |
| `--ease-out` | `cubic-bezier(.16, 1, .3, 1)` | Entrances |

Principles:
1. **Motion explains a change of state.** A score rising, a path closing, a decision appended, a step completing. Content fades in once (opacity plus 8 px), never re-hides, and is fully present in the prerendered HTML.
2. **The visitor drives the demos.** Demos auto-advance only while visible, pause on hover or focus and on any interaction, and have explicit Play/Pause and step controls.
3. **No scroll hijacking, parallax, smooth-scroll libraries, cursor effects, 3D tilt or blur reveals.**
4. **`prefers-reduced-motion: reduce`.** All transitions become instant, demos show their final state with manual stepping, and auto-advance is disabled.

**Technology.** CSS transitions plus React state cover every interaction. GSAP stays installed for the Prompt Heist game and the existing Null Motion pieces, and is lazy-loaded. **Motion for React, Lenis and Lottie were evaluated and not added.** Every interaction here is a discrete state change that CSS handles natively. Lenis would take over native scrolling (against the brief's "avoid scroll hijacking"). Lottie would mean shipping decorative vector animations. This keeps the "no unnecessary dependencies" requirement.

## 10. Accessibility rules (enforced in components)

- Visible focus on everything interactive: a 2 px brand outline, 2 px offset.
- Every interactive demo is operable by keyboard. Its state is announced through a visually hidden `aria-live="polite"` line ("Stage 4 of 7: Explain").
- Colour is never the only signal: status badges always carry text.
- Minimum text in UI is 12 px; minimum target is 40×40 px (44 px for primary actions on mobile).
- Headings follow outline order. Anchor links are icons outside the heading text, with `aria-label`.
