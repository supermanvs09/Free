# Enterprise benchmarks (measured 2026-11-25)

Typography was read from each live home page with Playwright (computed styles), not estimated from screenshots.

## Typography

| Site | Family | H1 | H2 | Body | Nav | Primary button |
|---|---|---|---|---|---|---|
| **Cisco** (cisco.com, /products/security) | **Inter** | 60/68, weight 500, tracking normal | 48/56 (40/48 on product pages), 500 | 16/24, 400 | 14/21, 400 | 16px, 600, pill (radius 48), padding 10px 20px |
| Microsoft Security | Segoe UI Variable | 62/72, 500, -1.55px | 48/56, 500, -1.2px | 16/24 | 18, 600 | 15px, 600, radius 8 |
| IBM Security | IBM Plex Sans | 54/63, **300** | 54/63, 300 | 16/24 | 14 | 14px, 400, radius 4 |
| Okta | SeasonMix / Aeonik | 64/72, 400 | 48/56, 400 | 24/32 lead | 12–16 | 16px, 500, pill |
| Cloudflare | STK Bureau Sans | 56/55, 500, -1.4px | 48–56, 500 | 19/23 | 16, 500 | 16px, 500, pill |
| Palo Alto Networks | Figtree | 49/59, 500 | 55/66, 500 | 13–16 | 14, 400 | 15px, 400, pill |
| CrowdStrike | Sharp Sans / Neue Haas | 56/70, 700 | 48/54, 700 | 24/30 lead | — | 16px, 600, radius 8 |

**Conclusion.** Every leader except CrowdStrike sets headlines at **medium weight (400–500)**, never bold, with normal or very slight negative tracking, and uses a strict scale: one display size, one section size, one card size, 16px body. Cisco itself now uses Inter, the family this site already ships. Deep Algorithms follows Cisco: Inter, H1 60/68 w500, H2 48/56 w500, H3 24/32 w500, lead 20/30, body 16/24, buttons 16px w600 pill.

## Messaging patterns worth adapting (never copying)

- **Cisco:** two-directional framing for AI ("protect the world from agents / protect agents from the world"); every card is a title plus one line.
- **CrowdStrike:** outcome titles as verb + object ("Stop identity attacks", "Secure your AI"); the identity triad "human, non-human, AI".
- **Microsoft:** information architecture: four outcomes, then a product grid with one-line descriptions, then named customer results with numbers.
- **Okta:** identity split by audience: workforce, customer, agentic.
- **Palo Alto Networks:** speed and scale of attacks as the problem; live platform figures in small data cards ("inline attacks blocked per day").
- **Cloudflare:** plain technical promises ("secure by default", "fits into your existing workflows"); concrete numbers.
- **IBM:** one consistent type treatment on every surface.

## Threat visualization principles drawn from the leaders

1. Show **how detection works**, not a decorative attack: signals, correlation, threshold, action.
2. Use the industry's own vocabulary: **MITRE ATT&CK** (and **MITRE ATLAS** for AI) technique IDs.
3. Show **behavioural intelligence**: a learned baseline, and why each signal is unusual against it.
4. Show **time**: when the first signal arrived, when the pattern was recognised, what the attacker never got to do.
5. One idea in motion at a time; everything else still.
