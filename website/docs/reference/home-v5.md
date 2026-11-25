# Home v5: audit, verification, system and content (2026-11-25)

## 1. Audit of the current home (home-complete.mp4)

| Section | Decision | Why |
|---|---|---|
| Navigation | REWORK | Destinations are right; it sits as a white bar over a dark hero. Make it transparent and dark over dark chapters, calmer type. |
| Hero: "Discover every human, machine and AI agent identity." + light-strand wave | REPLACE | Concept kept (human, machine, AI agent identities; two CTAs; an interconnected visual). Headline, visual and composition replaced. |
| Logo strip + certifications | KEEP, REWORK | Genuine proof (`site.js`). Moves into the hero's footer, Nullgate-style. |
| Continuous AI-SPM four cards | REPLACE | Subject kept (people, machine identities, AI agents, personal data). Four cards become one ecosystem illustration with a numbered list. |
| Products (Zenstra card + Claude scene, adapID, ICMS) | REWORK | "Three products. One posture." kept. Becomes one product showcase with switching, real Zenstra console screens, 3D product renders, adapID's four offerings told apart. |
| Industries (4 photo cards) | REWORK | Same verified industries and licensed photos, editorial asymmetric layout instead of four cards. |
| Proof: < 80 ms, p95 18 ms, < 5 min, "4" | REMOVE figures, KEEP evidence | See §2. Certifications, patent, recognition and offices stay. |
| Research (3 cards) | REWORK | Folded into the attack-scenarios chapter as "Go deeper" links. |
| Demo card | REWORK | Message kept: "Find your riskiest identity before attackers do." New dark-blue CTA with a 3D render; CTA "Talk to our experts". |
| Footer | REWORK | Same links and contacts, new compact layout. |

## 2. Verification of claims

| Claim | Source in the repo | Decision |
|---|---|---|
| < 80 ms risk decision | `products.js` fraud stats, "Deep Algorithms benchmark", no conditions | Removed from home until the measurement conditions are confirmed |
| p95 18 ms | zenstra.ai copy ("Inline · p95 18 ms · Fails closed"), no conditions | Removed from home until confirmed |
| < 5 min audit package | `products.js` ICMS stats, "Deep Algorithms benchmark", no conditions | Removed from home until confirmed |
| "4" | Count of certifications in `site.js` CERTS | Not a metric; certifications shown by name |
| ISO/IEC 27001, SOC 2 Type II, ISO/IEC 42001, ISO/IEC 27701 | `site.js` CERTS | Kept |
| Patent No. 602726 (Oct 2026) | `company.js` | Kept |
| DSCI Cybersecurity Excellence 2025, Business Excellence Award 2025, GITEX GLOBAL 2025 | `company.js` RECOGNITION, with photos | Kept |
| Customers | `site.js` CUSTOMERS, logo files | Kept |
| Zenstra blocks actions | zenstra.ai ("checks every AI agent action before it runs", BLOCK lines, runtime enforcement) and `zenstra.js` | Kept: verified by the company's own product site |
| Three products | `nav.js` PRODUCT_MENU: Zenstra AI, adapID AI (CIRM, NHI Security for AWS, Identity Fraud Prevention, Active Directory Security), ICMS Compliance Suite | Kept as is; no new product names |

Images: the Design Monks shot is the designer's copyrighted work with no reuse licence, so its renders are not reused. Original 3D renders were made instead (Three.js, `public/img/home/`), matching its composition: a glossy hero object on graphite pedestals, icon tokens joined by light, translated to blue. Zenstra screens are the real console from zenstra.ai. Industry photos are the site's licensed photos.

## 3. System

- **Surfaces:** a soft grey canvas; content sits on large rounded sheets (Eloqwnt), dark navy or white. Dark sheets carry a hairline grid with crosshairs (Nullgate).
- **Colour:** near-black #050913, navy #0A1A3A, electric blue #2E7BFF, sky #5AA6FF, ice #CFE6FF, steel #8C9BB4, white, canvas #E9ECF1. No orange, purple or rainbow.
- **Type:** Inter (the face cisco.com uses), weight 500 headlines with tight tracking, two-tone headlines (white, then steel), 17px body, mono chapter labels "[01] …".
- **Motion:** GSAP / Null Motion for headline reveals; anime.js for the illustrations (data pulses along the hero's light paths, ecosystem flows, attack paths, behaviour trace). Reduced motion gets every finished frame.

## 4. Structure and copy (final)

1. Hero: "Identity security for an AI-driven world." · From human and machine identities to AI agents… · Explore the platform / Talk to our experts · trusted-by logos and certifications.
2. [01] "Your enterprise has more identities than you can see." Ecosystem illustration + 01 Human, 02 Machine, 03 AI, 04 Sensitive data, each with the product that protects it.
3. [02] "Three products. One identity posture." Zenstra AI · adapID AI · ICMS Compliance Suite.
4. [03] "Continuous, not once a quarter." Behaviour against its own normal; Discover → Assess → Detect → Decide → Prove.
5. [04] "Identity risks don't always look like attacks." Five scenarios with attack paths, each answered by the product that supports it. Go deeper: latest research.
6. [05] "Security for industries that cannot afford blind spots." BFSI, healthcare, government, digital platforms.
7. [06] "Built for trust. Audited like it." Certifications, patent, recognition, offices.
8. CTA: "Find your riskiest identity before attackers do." Talk to our experts.
9. Footer.
