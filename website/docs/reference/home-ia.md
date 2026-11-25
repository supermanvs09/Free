# Home page: critique, structure and signature concept (2026-11-25, round 3)

## 1. Weaknesses of the round-2 home

1. **Too many moving pictures.** Ten looping animations, all the same size and weight. Nothing is the signature; the eye has nowhere to rest; it reads as a demo reel, not an enterprise page. Leaders run one ambient hero motion and *one* signature piece; everything else is still.
2. **The headline idea is not shown.** "Securing your identities and digital ecosystem from AI-driven threats" is the promise, but no picture shows an AI-driven threat (deepfake voice, AI phishing, bot-scale credential stuffing, prompt injection, hijacked agents) being stopped.
3. **Weak placement of the AI-SPM statement.** It sits as an eyebrow plus headline above a generic hub-and-spoke diagram (logos feeding a circle), a picture every vendor already uses.
4. **Product-page depth on the home page.** Four identity cards, a loop strip, a Claude scene and three Zenstra cards duplicate the product pages. The home page should state, prove and route.
5. **No proof.** Customer logos, certifications and India's regulators (RBI, SEBI, DPDP) were removed; enterprise buyers look for trust right after the hero.
6. **ICMS is missing**, so one of three products has no door from the home page.
7. **Inconsistent sample numbers** (58,432 vs 56,005 identities; risk 88 everywhere).
8. **Phones**: wide diagrams scroll sideways instead of adapting.

## 2. What enterprise security home pages do (measured)

| Site | Height | Order after the hero |
|---|---|---|
| Cisco | 6.2k | logos/trust stat → technologies → outcomes → scale → customer stories → news → next steps |
| CyberArk | 11.1k | one platform → problem (3 words) → fragmentation → **control plane visual** → human/machine/agentic → analysts → demo → resources → FAQ |
| Silverfort | 9.5k | problem ("identity is where AI attackers go first") → **one platform** → outcomes → access → trusted by 1,000+ → watch an AI attack → resources → contact |
| Okta | 6.2k | coalition → audiences (agentic / workforce / customer) → Fortune 100 proof → analysts → thought leadership → CTA |
| Zscaler | 4.8k | one platform → scale and trust → see it at work → CTA |
| Wiz | 10.9k | rated #1 → operating model → agents → code-to-cloud → how it helps → trusted by → AI frontier → reviews → analysts → outcomes → CTA |
| CrowdStrike | 10.5k | **platform wheel** → frontier AI → analysts → bundles → customers → solutions |
| Zenstra | 7.8k | product film → one platform, three ways in → why (new identity) → console → industry → audits → CTA |

Pattern: **hero → proof → problem/why now → one signature platform visual → products/outcomes → proof (customers, analysts, certifications) → resources → CTA.** Six to nine sections. One signature motion piece. Each section is one idea, a headline, at most two lines, and a link deeper.

## 3. New structure for deepalgorithms.io

| # | Section | Job | Motion |
|---|---|---|---|
| 1 | Hero: "Discover every human, machine and AI agent identity." | Promise, two actions | Ambient wave (kept) |
| 2 | Trusted by banks, government and enterprises across India | Proof in the first scroll | None (logo rail) |
| 3 | **Continuous AI Security Posture Management** (signature) | Show AI-driven threats being stopped by five layers, for people, machines and agents | **One scroll-scrubbed 3D sequence** (anime.js `onScroll`) |
| 4 | Three products, one posture | Route to adapID AI, Zenstra AI, ICMS | Only the Zenstra card plays the film's Claude scene |
| 5 | Built for India's regulated industries | BFSI, government, healthcare, digital; RBI, SEBI, DPDP | None |
| 6 | Proof: certifications and measured figures | Trust | None |
| 7 | Research (latest three) | Expertise | None |
| 8 | Demo card (kept) | Convert | Existing |

Animation budget: **3** (ambient hero, signature, one product scene), down from 11.

## 4. Signature concept: "The Identity Core"

References: animejs.com (one lens, scroll-scrubbed from front view to an exploded technical drawing, each part explained in turn) and zenstra.ai/why-zenstra "Inside the Zenstra core" (star core inside rings, six steps, side cards with RUNS IN / CHECKS / STOPS).

Ours is its own object: a **hexagonal defence stack**, five translucent plates around one glowing identity keystone. Hexagons, not rings: a shield and honeycomb shape that neither reference uses. Every plate is one layer of Continuous AI-SPM, drawn as a technical line drawing with its own pattern:

| Plate | Pattern | AI-driven threat it stops |
|---|---|---|
| 01 Discover | rosette of identity dots: people, machines, AI agents | Shadow AI agent holding a production key |
| 02 Assess | radial tick gauge, posture arc | Bot-scale credential stuffing against accounts without MFA |
| 03 Detect | polar behaviour band with a live trace | Deepfake voice at the help desk, MFA fatigue |
| 04 Decide | six-blade iris that closes | Prompt injection steering an agent outside its task |
| 05 Prove | ring of chained record blocks | The examiner's question: prove it |

Scroll sequence (pinned): AI-driven threats close in on the assembled core, seen face-on, under the section statement → the stack tilts to an isometric view and explodes, with leader-line labels → each plate in turn: the threat flies in and is stopped at that plate, with a side card (what it does, what it covers, what it stopped, the decision line) → the stack reassembles: "One posture. Always on." Reduced motion: the exploded drawing and the five cards, static.

## 5. Section-by-section content (round 4, before styling)

Every line below comes from the site's own data (`src/data/*`). The visual treatment waits for the chosen template.

| # | Section | Headline | Content | Source |
|---|---|---|---|---|
| 1 | Hero | Discover every human, machine and AI agent identity. | Book a demo · Watch video (01:30). Ambient wave. | kept |
| 2 | Proof | Trusted by banks, government and enterprises across India | 10 customer logos (MeitY, Canara Bank, Karnataka Bank, DCB Bank, NCRTC, IIT Kanpur, IIT Mandi, IIIT Hyderabad, Bhaktivedanta, CCoE) · ISO/IEC 27001, SOC 2 Type II, ISO/IEC 42001, ISO/IEC 27701 | `site.js` CUSTOMERS, CERTS |
| 3 | Signature | Continuous AI Security Posture Management / Securing your identities and digital ecosystem from AI-driven threats. | The chosen concept (Air Traffic Control or Living City) | concept pending |
| 4 | Products | Three products. One posture. | Zenstra AI (AI agents, with the film's Claude scene) · adapID AI (people and machine identities: CIRM, NHI for AWS, fraud prevention, AD) · ICMS (personal data under the DPDP Act) | `nav.js` PRODUCT_MENU |
| 5 | Industries | Built for India's regulated industries | BFSI: "Every login, payee and payment, scored before it clears." · Healthcare: "Know who opened every patient record, and why." · Government · Digital platforms. Regulators named: RBI, SEBI, DPDP Act 2023 | `solutions.js` |
| 6 | Proof in numbers | Measured, certified, recognised | < 80 ms risk decision · p95 18 ms agent decision · < 5 min audit package · 72-hour breach reporting ready. Patent No. 602726 (multi-domain fraud detection, Oct 2026). DSCI Cybersecurity Excellence 2025 · Business Excellence Award 2025 · GITEX GLOBAL 2025 | `products.js` stats, `company.js` RECOGNITION, posts |
| 7 | Research | How identities get attacked, and how to stop it | Latest three: "Your AI Code Reviewer May Be Trusting the Wrong Instructions" (Oct 2026) · "Trusted Identities Remain a Critical Attack Surface" (Aug 2026) · "The Attack That Never Triggers an Alert" (Aug 2026) | `posts.js` |
| 8 | Demo card | Find your riskiest identity before attackers do. | unchanged | kept |

Template shortlist (Dribbble, opened individually): A Liberty (Emura), B Cyntra (BayFi Studio), C Fudo Security (Dave Roach), D Picus Security (Dave Roach), E PhishAI integrations (Illiyin Studio), F Stratiform (ROY'Z_VISUALS).
