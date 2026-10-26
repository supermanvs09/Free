# Deep Algorithms redesign: research and design system

## Direction

The reference is astrix.security (identity security for NHIs and AI agents, acquired by Cisco in 2026), cross-checked against Cisco, SailPoint and other enterprise security sites. The site borrows Astrix's structure, restraint and illustration approach. It does not copy Astrix's artwork:

- **Hero.** The identity orbit (`OrbitHero`): our mark large at the centre, three rings of monochrome icons, a pulse that turns risk dots into ticks. The same orbit (`OrbitMini`) fills the navy panels on Home, Platform and the solution pages. Third-party logos are never shown next to our mark.
- **Product console.** Products are the main tabs and capabilities are the sub-tabs. Only the two most important capabilities per product animate (`ProductTour`). No product mixes its alerts into another's view.
- **Story film.** "The Identity Shift" (`IdentityFilm`): a narrated 72-second explainer. The orbit builds up, an attacker logs in unseen, then four product views show what Deep Algorithms does (inventory, risk analysis, fix, audit evidence). Chapters seek the player.
- **Covers.** Soft 3D renders on a flat brand-colour field (glossy tiles, mascot, lifted chips) with SVG headlines on top, after Astrix's "Learn more" cards.
- **No dotted backgrounds** anywhere. Product shots sit in solid grey frames, as on Astrix.
- **Product UI is illustrative.** It is drawn in code with realistic names and real third-party icons (Simple Icons). Nothing is taken from the NHI codebase UI. All data is sample data.

## Information hierarchy

| Page type | Order |
|---|---|
| Home | H1 + two CTAs → identity lanes → customer band → problem (three animated scenario cards) → "Identity Shift" explainer → platform console (product tabs) → identity types (progress tabs) → What's new → navy "Why" accordion → industries → certifications → research → CTA |
| Product (8) | Coloured rounded hero (rotating keyword, live console) → logos → capability sections (progress tabs, text left, UI right) → navy sourced stats → getting started + integrations → related modules → research → CTA |
| Solution (4) | Navy hero with app-network illustration → logos → challenges (sourced stats) → navy "How we help" accordion → recommended products → research → CTA |
| Platform | "Why Deep Algorithms": Discover / Secure / Prove, differentiators, all products, deployment, certifications |

## Product architecture on the site

- **Zenstra AI**: AI agent security (`/agentic-ai/agentic-identity`). Context from zenstra.ai.
- **adapID AI**: identity risk (CIRM, `/adapid-ai`), plus three modules: **NHI Security for AWS** (`/adapid-ai/nhi-security`, claims limited to what the NHI codebase does), Identity Fraud Prevention, and Active Directory Security.
- **BotShield AI**: CTEM and bot defence, plus DDoS Protection.
- **ICMS Compliance Suite**: DPDPA.

The NHI page deliberately does **not** claim containment or credential freezing, because the backend returns 501 for those.

## Rules that keep the brand first

- Our mark is the largest and only saturated brand object in any picture that shows it.
- Third-party marks are small and one neutral tone wherever they sit near ours (integration rows use `mono`).
- Colour: navy, brand blue and cyan for us; coral only for risk. No rainbow tiles.
- One icon set and weight per picture. Display type Hanken Grotesk Light, text Inter.
- The full checklist is in `qa-checklist.md`.

## Tokens

| Token | Value | Use |
|---|---|---|
| navy | `#062f57` | Primary buttons, dark panels |
| brand | `#0068ac` | Blue bands and heroes, eyebrows, links |
| cyan | `#00aeef` | Accents on navy only |
| coral / coral-2 | `#f0644d` / `#b3361d` | Risk. Use coral-2 behind or as small text |
| frame | `#e9ecf0` | Solid frame behind product UI |
| ink / ink-2 / ink-3 | `#0b1220` / `#3f4a5a` / `#5c6777` | Text. ink-3 passes AA on mist |
| ok / warn / crit | `#17703c` / `#8a5a12` / `#c62828` | Status chips (AA on their soft fills) |

- **Type.** Display is Hanken Grotesk, weight 300 (a free stand-in for Astrix's BDO Grotesk). Body is Inter, as on cisco.com.
- **Shape.** Cards have a 20px radius and panels 40px. Buttons are pills.
- **Motion.** Every animation runs only while in view and stops under `prefers-reduced-motion`. Product demos use a coral cursor that glides between real UI targets.
