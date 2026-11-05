# Deep Algorithms Solutions · Brand film · Production bible

**Master:** `deep-algorithms-brand-film-master-1080p.mp4` · 1:36 · 1920×1080 · 30 fps · H.264 + AAC · −16 LUFS
**Promo cut:** `deep-algorithms-brand-film-30s.mp4` · 0:31 · built to work on mute · −14 LUFS
**Captions:** `deep-algorithms-brand-film.vtt` / `.srt` (upload the SRT to LinkedIn)
**Source:** `film/` in this repository. Every frame is a pure function of time (HTML/Canvas, rendered by Playwright), so the film can be re-cut when a product, a claim or a line changes.

---

## 1. Audit of the 88-second reference film

The reference is "take 9" of the website film. It has 13 scenes. Each one is a stock clip with a lower-third line, two or three signal toasts and one white product card.

| # | Time | What is on screen | Problem it shows | Product | Clear on mute? | Memorable / premium? | Accurate? | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | 0–2 | Aerial city at dusk | Scale, setting | — | Yes | Generic stock | — | **Redesign.** The opening has no idea of its own. |
| 2 | 2–5 | Man in front of a trading screen, "82:1" | Machine identities outnumber people | — | Partly. The stat is tiny. | Strong silhouette, weak use | Sourced stat (CyberArk 2025) | **Keep the shot, rebuild the moment.** Now the push-in through his screen opens the film. |
| 3 | 5–8 | Server rack, cables, terminal, each with a label | Service accounts, cloud keys, AI agents | — | Yes | Stock B-roll | OK | **Replace** with the identity constellation: people vs. non-human identities. |
| 4 | 8–10 | **Hooded hacker** | Attackers noticed | — | Yes | Cliché | — | **Remove.** The brief bans it. |
| 5 | 11–16 | Hands typing; "stolen password… healthcare network down for weeks" | Credential theft | CIRM | Needs the caption | Generic | Real incident, unnamed | **Redesign** as the M365 story: a valid sign-in whose context changes. |
| 6 | 17–22 | Office worker + "Login held before access" card | CIRM response | adapID CIRM | Partly | Small card, top-left | "Held 1.4 s" is unverified | **Expand.** Show the score change with its reasons. Policy response only. |
| 7 | 23–31 | Woman on phone, help-desk reset → "Session stopped, reset reversed" | Help-desk social engineering | adapID AD | Needs the caption | Stock | "Stopped · 2 s" is unverified | **Redesign** as the AD story: a quiet membership change opens a path to Tier 0, flagged for review. |
| 8 | — | *Missing* | Cloud keys and roles | NHI for AWS | — | — | — | **Add.** The reference names cloud keys but never shows NHI. |
| 9 | 32–42 | Woman with phone, scam call → "Payment held" | Coached payment fraud | adapID Fraud | Needs the caption | Stock, blank phone screen | "38 ms" is unverified | **Redesign:** the right password and OTP, but the wrong person; behavioural side-by-side; bank-policy step-up. |
| 10 | 43–52 | Developer at code → "Export blocked before it ran" | AI agent token misuse | Zenstra | Needs the caption | Stock | Plausible | **Redesign** around the brief's Zenstra story: secrets pasted into an AI prompt, blocked before sending. |
| 11 | 53–61 | Laptop login page, bots → BotShield | Credential stuffing | BotShield | Yes | OK | — | **Remove from this cut.** Out of scope for this brief. |
| 12 | 62–68 | Hands typing → ICMS "PII protected" | DPDPA evidence | ICMS | Needs the caption | Generic | OK | **Remove from this cut.** Out of scope. |
| 13 | 69–87 | Blue plate, "Built in India", logos, Rashtrapati Bhavan, CTA | Brand, proof, ask | All | Yes | Solid ending, weak plate | Real customer logos | **Keep the ending idea, rebuild it.** Nodes converge into the D mark, then lockup, families, CTA, certifications. |

**What works and is kept:** the 82:1 idea, the silhouette at a screen, the "worst case, then product" rhythm, Indian context, and an ending with proof and a clear ask.
**What is weak and is fixed:**
- Every chapter used the same template, so the film felt like five ads.
- The product UI was tiny.
- The threat was told in captions instead of shown.
- There was a hooded hacker and no AWS story.
- The film made unverified timing claims.
- The audio was a single needle-drop.

---

## 2. Product claim validation

Sources: the company's own site content (`src/data/*`, `src/pages/products/*` in the website codebase) and zenstra.ai (`/use-cases/data-leakage`, `/use-cases/coding-agents`, `/use-cases/shadow-ai`), read on 5 Nov 2026.

| Product | Claim shown in the film | Evidence | Approved |
|---|---|---|---|
| CIRM (M365) | Every identity gets a live risk score from 0 to 100, with the reason for every point | "A 0 to 100 score where every point of risk carries its reason" | **Yes** |
| CIRM (M365) | Signals: new device, hosting network, inbox forwarding rule, bulk download | CIRM picture: Okta sign-in from Lagos, a new Microsoft 365 forwarding rule, a bulk export; "first-seen devices, impossible travel" | **Yes** (fictional data) |
| CIRM (M365) | Response: step-up verification before the next sensitive action; owner and SOC notified | "Ask for a stronger check before the next sensitive action." "Pause the session and notify the identity owner and the SOC." Responses are customer policy. | **Yes**, labelled *Your policy* |
| CIRM (M365) | Automatic blocking or session termination | Policy-driven only | **Not shown** |
| CIRM (AD) | Maps paths to Domain Admins; tracks new privilege | "Paths to Domain Admins mapped"; "new privilege it has gained" | **Yes** |
| CIRM (AD) | The change is *flagged for review*, not called an attack | Brief rule: not every change is malicious | **Yes** |
| CIRM (AD) | Auto-remediation | Not confirmed for this flow | **Not shown.** The buttons are human choices. |
| NHI for AWS | Finds roles, keys and workload identities; maps what each one can reach | "discovers every IAM role, user, key and workload identity… maps what it can reach" | **Yes** |
| NHI for AWS | Granted vs. used, from 90 days of CloudTrail | "Granted permissions are compared with 90 days of CloudTrail" | **Yes** |
| NHI for AWS | Least-privilege fix proposed, applied with approval | "the remediation, applied with approval"; "least-privilege fix, checked against CloudTrail" | **Yes**, labelled *Proposed* |
| NHI for AWS | Workload uses temporary STS credentials (no static keys) | AWS IAM best practice | **Yes** (technical accuracy) |
| NHI for AWS | Compromise or auto-fix | — | **Not shown** |
| Fraud Prevention | Behavioural biometrics: how the customer types, taps and holds the phone | "measures how the customer types, taps, holds and moves the phone" | **Yes** |
| Fraud Prevention | Several signals together; the amount is only one of five | Device, behaviour, beneficiary, session, amount | **Yes** |
| Fraud Prevention | Face verification at a high-risk moment, by bank policy | "Face verification runs only at high-risk moments, such as a new device or a large payment"; "above it, a step-up check" | **Yes**, labelled *Bank policy* |
| Fraud Prevention | Mobile **and** internet banking | "Fraud prevention for mobile and internet banking" | **Yes** |
| Fraud Prevention | Automatic transaction block | Not claimed | **Not shown** |
| Zenstra AI | Detects secrets in an AI prompt and blocks it before it is sent | zenstra.ai: "deny model.call with secrets in payload"; "Credentials: keys and secrets… pasted into AI tools"; AI Discovery "sees the prompt"; "Secret access blocked" | **Yes**. Confirm the exact banner wording with the Zenstra team. |
| Zenstra AI | Decision recorded with the policy that decided it | "Recorded with the policy that decided it" | **Yes** |
| Zenstra AI | Works with Claude | zenstra.ai integrations list | **Yes** (named only in the console record) |
| Company | ISO/IEC 27001, SOC 2 Type II, ISO/IEC 42001, ISO/IEC 27701; built in India | `site.js`, zenstra.ai compliance page | **Yes** |
| Stat | 82 machine identities for every human | CyberArk Identity Security Landscape 2025, sourced on screen | **Yes** |

**Dropped from the reference:** "held in 1.4 s", "stopped in 2 s", "38 ms", "4 ms". None of these were verified as product behaviour, so the film shows no latency numbers.

---

## 3. What each reference taught, and where it is used

| Reference | Technique | Where in the film |
|---|---|---|
| Wevi · Text Typing In / Tilted Type-In | Character-by-character typing with human timing; a window that starts tilted in 3D and settles flat while you type | Zenstra prompt (64.5–68.3 s); M365 sign-in; banking login and amount |
| Wevi · Animated Text Bar | The camera pushes into the input field that matters | Zenstra push into the pasted config (68.6–70.4 s) |
| Kario · product demo | UIs rebuilt as separate layers (no screen recordings); cursor glides and clicks; results animate in | All product panels; cursor to *Sign in* and *Send*; panel rows reveal one by one |
| PhonePe films | The audience understands the problem before the product appears; one human situation per idea | Each chapter opens on a normal action (sign-in, a deploy question, opening a banking app) before any security UI |
| Microsoft Entra / Okta "Secures AI" | Invisible identity relationships made visible; product as the calm answer | Constellation, directory graph, isometric access graph |
| Scenetheory / Motion-Lab | Isometric architecture with depth and lit faces | AWS chapter |
| motion.so / SaaS Animate / Behance AI demo | Kinetic type, blur-in word reveals, restrained palette | Headlines and end cards |

---

## 4. Campaign concept

**"Every identity tells a story. Every interaction creates risk. Every connection needs intelligence."**

The film opens on one person at a screen at 21:42 in Hyderabad. It pushes through his screen into the hidden world behind an ordinary sign-in. That world is a constellation of people, privileged accounts, customers, service accounts, cloud workloads and AI agents.

Each chapter then follows one identity from that constellation into its own story:
- A Microsoft 365 session
- A directory account
- An AWS workload
- A banking customer
- An AI prompt

In the finale the same constellation returns with those five identities lit and linked. The campaign line lands, and every node converges into the Deep Algorithms mark.

**Product hierarchy.** adapID AI carries three chapters (CIRM for M365 and AD, NHI for AWS, Identity Fraud Prevention), all with the cyan accent and the shield tile. Zenstra AI gets its own chapter, its own indigo world, its own mark and wordmark, and "A Deep Algorithms Solutions product". It is never shown as part of adapID.

**Distinct visual language per story.**

| Story | Visual language | Hero visual |
|---|---|---|
| Microsoft 365 CIRM | Cinematic identity timeline, cool navy | Behaviour leaving its baseline band; gauge 12 → 91 |
| Active Directory CIRM | 3D directory architecture, camera orbit | One amber membership edge, then a 4-hop path into Tier 0 |
| AWS NHI | Isometric 3D cloud account | Role badge whose reach fans out to every bucket, then narrows |
| Banking fraud | Warm fintech world, 3D phone, evening bokeh | "Same credentials. Different behaviour." side-by-side |
| Zenstra AI | Light AI assistant inside an indigo world | The message lifts, hits a glass wall; Send becomes a lock |

---

## 5. Storyboard, script and on-screen text

Keyframes are in `keyframes/` (file name = order and timecode).

| Time | Scene | Visual | Voiceover | On-screen text | Sound |
|---|---|---|---|---|---|
| 0.0–2.6 | **Opening** | A real silhouette at a monitor at night (Coverr footage, graded cool). His screen shows an ordinary workspace: "Good evening, Alex". *(k01)* | — | `Hyderabad · 21:42 IST` | Room tone, a low drone |
| 1.4–4.0 | | The camera pushes in and passes *through* the screen. The desktop's app tiles become nodes around alex.morgan. *(k02)* | "Every day, millions of identities connect people, applications and systems." | `alex.morgan` | Whoosh in; shimmer bloom on the reveal |
| 4.0–8.6 | | Pull back to the full constellation. Families are labelled; the human nodes dim and the non-human nodes brighten. *(k03)* | "But not every identity belongs to a person." | People · Privileged accounts · Customers · Service accounts · Cloud workloads · AI agents; **82 machine identities for every human.** (CyberArk 2025) | Dm pad |
| 8.8–11.3 | | Some links turn amber and pulses travel along them. The camera dives into alex.morgan. *(k04)* | "And as the digital world evolves, so do the threats." | — | Heartbeat pulse; riser into the dive |
| 10.9–15.7 | **adapID · CIRM · Microsoft 365** | The node's light becomes a sign-in card: email typed, password, Sign in, MFA approved, "Signed in". Context chips: registered device · Hyderabad · MFA passed · **Risk LOW**. *(k05)* | "A successful sign-in is only the beginning." | — | Keys, click, success chime |
| 15.2–19.6 | | The card dissolves into an identity timeline with Outlook · Teams · SharePoint · OneDrive. The activity line leaves its baseline band as signals arrive: new device → hosting network → forwarding rule → 1,240 files at 30× usual. The gauge goes 12 → 41 → 58 → 79 → 91 and LOW → ELEVATED → HIGH; the ambient light turns red. *(k06)* | — (the visuals carry it) | **Same identity. Same password. Different behaviour.** | Grid starts (96 bpm, Dm–B♭–F–C); alerts rise in pitch; impact at HIGH |
| 19.6–22.7 | | adapID panel: alex.morgan · 91/100 · HIGH. "Why the score changed": +29, +21, +29. Decision: *Your policy: step-up verification before the next sensitive action* · Requested · owner and SOC notified. *(k07)* | "adapID AI keeps reading the context, and adapts trust as the risk changes." | — | Panel whoosh, ticks, confirm |
| 22.7–25.1 | | End card *(k08)* | — | **Identity risk doesn't stop at login.** adapID AI · Continuous Identity Risk Management for Microsoft 365 | Hit + bell |
| 24.8–29.3 | **adapID · CIRM · Active Directory** | alex.morgan becomes one node in corp.local. Pull back through OUs, users, privileged accounts, service accounts, groups, computers and the Tier 0 halo. | "Every enterprise identity has relationships." | Legend | Reveal shimmer |
| 29.3–31.9 | | An amber dashed edge draws: svc-backup → Server Admins (02:14, no linked change request). The path lights hop by hop: Server Admins → SRV-DB01 → it-admin.sam's session → Domain Admins. *(k09)* | "One quiet change can open a path to the whole directory." | Hop 1 … "Domain Admins reached · 4 hops" | Alert; four path steps |
| 31.7–33.5 | | adapID panel: change, effect (path chips), context ("never changed membership before"), **Flagged for review**, Approve change / Remove membership. *(k10)* | — | — | — |
| 33.5–35.4 | | End card | — | **Understand the identities behind your enterprise.** CIRM for Active Directory | Hit |
| 35.1–39.6 | **adapID · NHI Security for AWS** | Camera rises; an isometric production account builds: payments-app, payments-db (RDS), batch-worker (EC2), five S3 buckets. The workload assumes the IAM role and an STS token travels. *(k11)* | "Your applications have identities too." | Identity card: payment-service-prod · IAM role · Production · AWS. "Application workload → IAM role → Cloud resources" | Glass build clicks; token blips |
| 39.6–43.3 | | Camera pushes to the role. The policy window opens on `"Action": "s3:*", "Resource": "*"`, highlighted. Amber reach fans out to every bucket, including hr-exports and customer-kyc-archive. *(k12)* | "This one can reach far more than it ever uses." | **Excessive permissions detected.** | Five rising zips; impact |
| 43.3–45.6 | | adapID NHI panel: HIGH · Excessive permissions. Granted s3:* on 5 of 5 buckets vs. used (90 days of CloudTrail): 1 bucket, 2 actions. **Review permissions. Apply least privilege.** Proposed policy, applied with approval. The reach narrows to one cyan bucket ("Proposed scope"). *(k13)* | — | — | Confirm |
| 45.8–47.9 | | End card | — | **Every workload has an identity. Every identity needs protection.** NHI Security for AWS | Hit |
| 47.6–51.9 | **adapID · Identity Fraud Prevention** | One cyan line draws a phone outline, and the phone fills in. Your Bank (fictional): customer ID \*\*\*\*\*\*\*4821 typed, password, Log in tap, OTP auto-fills, "Authentication successful". | "The password is right. The OTP is right." | — | Taps, success |
| 51.9–58.5 | | Dashboard ("Good evening, Ananya"). The phone slides left and a side-by-side opens: device, typing rhythm, touch and hold, network. Behavioural match slides 92% → 18% LOW. *(k14)* | "But is it really the customer?" | **Same credentials. Different behaviour.** · **Behavioural identity mismatch detected.** | Mallet ostinato (warmer voice); ticks; alert |
| 56.8–60.3 | | Send money: new beneficiary added 3 min ago, ₹85,000 typed, Confirm tap. Five equal chips (device, behavioural match, beneficiary, session age, amount) converge into **Identity risk: High**. *(k15)* | "adapID AI recognises the person: how they type, tap and hold the phone." | "Elevated identity risk detected" | Converge sweep; impact |
| 60.0–62.4 | | adapID panel with all brief fields; risk 88 HIGH; *Bank policy: verify the customer before this transfer* → Face verification requested. On the phone: "Verify it's you" sheet. Mobile banking · Internet banking chips. *(k16)* | — | — | Confirm |
| 62.2–64.4 | | End card | — | **Recognize the person. Not just the password.** Identity Fraud Prevention for Mobile & Internet Banking | Hit |
| 64.3–68.4 | **Zenstra AI · AI security** | A light beam carries the information into an AI assistant window, which arrives tilted and settles flat while the request types: "Our payments service fails on deploy. Here's the config, can you spot the bug?" *(k17)* | "AI makes every team faster." | — | Streak; typing |
| 68.5–71.4 | | Config pasted (region, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, DATABASE_PASSWORD; fictional AWS-documented example keys). The camera pushes into the prompt; the cursor glides to Send. *(k18)* | — | — | Paste; riser; the music drops to a heartbeat |
| 71.45–73.0 | | **The intervention.** Click. A Zenstra scan line sweeps the prompt; three secrets are boxed in red and tagged; the message lifts and hits a glass wall; Send becomes a lock. *(k19)* | — | AWS access key · AWS secret key · Database password | Scan sweep → deep block hit with a glass chord |
| 72.4–74.6 | | The banner slides in: Zenstra mark · **Blocked! This prompt contains credentials, API keys and tokens. It was not sent.** · Policy: Sensitive credential protection. "Not sent · recorded by Zenstra AI". *(k20)* | "Zenstra AI sees what is about to leave, and stops it before it is sent." | — | Notification chime; the music returns brighter |
| 74.7–78.2 | | Zenstra console, Detections: DET-2318 · Application: AI assistant (Claude) · Exposed API credentials, 3 secrets · Risk High · Blocked, prompt not sent · Sensitive credential protection · laptop-208 · steps Prompt → Secrets found → Blocked → Recorded. *(k21)* | — | — | Ticks |
| 78.2–82.2 | | End card in Zenstra's own world *(k22)* | — | **Let AI move your business forward. Not your sensitive data outside.** Zenstra mark and wordmark · AI Security · zenstra.ai · A Deep Algorithms Solutions product | Hit |
| 82.4–87.0 | **Finale** | From the AI node, the camera pulls out to the full constellation. Six story identities light up and link in a loop (M365 session, directory privilege, service account, AWS workload, banking customer, AI prompt). *(k23)* | "Every identity tells a story. Every interaction creates risk." | Same, as kinetic type | Pads move B♭ → Gm → C |
| 87.5–89.3 | | A brand-blue wave of light runs outward through every connection *(k24)* | "Every connection needs intelligence." | **Every connection needs *intelligence*.** | The score resolves to **D major** |
| 88.9–92.0 | | Every node converges into the D mark; the crisp mark resolves and slides into the DEEP ALGORITHMS lockup *(k25)* | "Deep Algorithms Solutions." | Identity security for the AI era. | **Sonic logo:** three rising bells, D–A–F♯ |
| 92.3–96.0 | | Product families (adapID AI and its three offerings; Zenstra AI · AI security), **Book a demo**, deepalgorithms.io, ISO/IEC 27001 · SOC 2 Type II · ISO/IEC 42001 · ISO/IEC 27701 · Built in India. Fade. *(k26)* | — | — | Tail |

**Word count:** 142 words of narration in 96 seconds. Several stretches are deliberately silent (15–19 s, 33–37 s, 43–49 s, 67–72 s) so that the visuals carry the story.

---

## 6. Transitions and camera

| From → to | Transition | Camera |
|---|---|---|
| Real room → digital world | Push-in **through** the monitor: a log-space zoom about a fixed point, the screen keyed behind the silhouette, the person dissolving as we pass the glass | Slow creep, then an ease-in surge |
| Constellation → M365 | Dive into alex.morgan; the node's light becomes the sign-in card | Ease-in dive to 120 units |
| M365 → AD | The identity becomes one node in corp.local | Pull back and orbit; move to svc-backup; frame the path |
| AD → AWS | The directory camera rises while the isometric account builds below | Camera rises to a top-down pitch; iso push to the workload, then the role, then wide |
| AWS → Banking | One cyan connector line draws the phone outline, then the phone fills in | 3D phone drift (rotateY −14° → −8°) |
| Banking → Zenstra | A beam of light carries the session's information right, into the prompt caret | Tilted type-in settles flat; push into the prompt; pull back for the banner; the window steps aside for the console |
| Zenstra → Finale | The camera pulls out from the AI node into the constellation | Long ease out to 2,500 units |
| Finale → Brand | Nodes converge into the mark; the mark slides into the lockup | Locked off |

No glitch transitions, light sweeps or repeated zooms. Each chapter end card is a deliberate beat, and the next chapter rises out of it.

---

## 7. Sound design

- **Score (original, synthesised in `tools/mix.py`, no samples):** D minor, 96 bpm, a progression Dm–B♭–F–C on a fixed grid from 15 s.
  - The voice changes by chapter: a soft pluck for CIRM, a higher octave for AD, more hats for AWS, warm mallets for banking and a lighter mallet line for Zenstra.
  - The opening is a drone with a dissonant E♭ under the threat.
  - Before the Zenstra click the music drops to a heartbeat (held breath), then the block lands as a deep hit with a glass chord.
  - The finale climbs B♭–Gm–C and **resolves to D major** on "intelligence".
- **Sonic logo:** a sub hit plus three bells, D5–A5–F♯6, rising.
- **UI sound:** every keystroke, tap, alert, step and reveal is triggered from the film's own event list (218 events), so sound and picture are frame-synced. Alerts rise in pitch with risk; HIGH lands an impact.
- **Voice:** Kokoro TTS (Apache-2.0), voice `am_fenrir`. All 17 lines pass a speech-to-text check on the *final mix*, so the voice stays intelligible over the music. The music ducks about 7.5 dB under the voice.
- **Loudness:** master −16 LUFS (web/LinkedIn), 30 s cut −14 LUFS (social), true peak −1.5 dBTP.
- **Recommended before launch:** replace the TTS with a professional voice artist. `tools/vo_script.json` holds each line's start time; drop new WAVs into the VO folder and re-run `mix.py`.

---

## 8. 30-second cut (edit list)

| Cut time | Master source | Beat |
|---|---|---|
| 0.0–3.5 | 2.55–6.0 | Push through the screen into the constellation |
| 3.5–6.5 | 16.3–19.3 | Risk climbing on the M365 timeline |
| 6.5–8.3 | 22.8–24.6 | "Identity risk doesn't stop at login." |
| 8.3–10.9 | 29.25–31.9 | AD: membership change → path to Domain Admins |
| 10.9–12.4 | 33.5–35.0 | "Understand the identities behind your enterprise." |
| 12.4–14.8 | 40.3–42.7 | AWS: `s3:*` reach to every bucket |
| 14.8–16.5 | 45.85–47.5 | "Every workload has an identity…" |
| 16.5–18.2 | 54.7–56.4 | Banking: behavioural mismatch |
| 18.2–20.0 | 62.15–63.95 | "Recognize the person. Not just the password." |
| 20.0–23.0 | 70.6–73.6 | Zenstra: Send → blocked |
| 23.0–25.1 | 78.25–80.4 | "Let AI move your business forward…" |
| 25.1–30.9 | 89.55–95.4 | Convergence → lockup → CTA, "Deep Algorithms Solutions." |

The audio is a continuous bed from the score that blooms into the finale chord, plus each beat's own sound effects. There is no mid-sentence narration, so the cut works muted with autoplay.

---

## 9. Image-generation prompts (visual development / alternate keyframes)

These are for concept boards and for a live-action or 3D vendor. They are **not** evidence of product functionality. Add typography and logos in post; never generate logos.

1. **Opening.** *Cinematic over-the-shoulder shot of a professional in a dark Hyderabad apartment at night, silhouetted against a single bright monitor showing a calm workspace UI. Cool blue screen light rims the hair and shoulders, deep shadows, shallow depth of field, subtle film grain, 16:9, premium enterprise ad cinematography, no logos.*
2. **Transition: screen → identity world.** *The camera passes through a glowing monitor surface into an infinite dark space of softly glowing nodes: cyan circles for people, violet rounded squares for machine identities, small four-point stars for AI agents. Thin luminous links, deep navy volumetric haze, restrained palette, 16:9.*
3. **M365, opening.** *A clean white enterprise sign-in card floating in a dark navy space, born from a point of cyan light. Soft blue bloom, crisp shadows, 16:9.*
4. **M365, main moment.** *A horizontal identity timeline across a dark stage: a faint grey baseline band, a cyan activity line that bends upward and turns amber then red, small glass event cards on stems, a semicircular risk gauge reading 91 in red at top right, subtle red ambient light. Data-viz cinematography, 16:9.*
5. **M365, product.** *A dark glass security panel centred over a dimmed timeline, a large score "91/100" with a red HIGH pill, three reason rows with red bars, a cyan-tinted policy bar at the bottom. Premium UI render, 16:9.*
6. **AD, opening.** *A three-dimensional enterprise directory: a domain node at the top, five organisational units in a ring, users, service accounts, groups and servers as small labelled pills, a soft white "Tier 0" halo around the domain controller. Dark navy, depth of field, 16:9.*
7. **AD, main moment.** *The same directory with one amber dashed edge from a violet service-account node to a group, then a glowing amber-to-red path across four hops into the Tier 0 halo. Camera orbiting, restrained lighting.*
8. **AD, product.** *A dark glass panel to the left of the graph with a path made of five chips and an amber "Flagged for review" pill. Calm, credible enterprise UI.*
9. **AWS, opening.** *An isometric 3D cloud account on a dark navy slab with a faint grid: a cyan container workload, a tall blue database cylinder, a slate compute block and five teal storage cylinders. Soft studio light, lit top faces, soft shadows, 16:9, no AWS logos.*
10. **AWS, main moment.** *A floating violet hexagonal IAM role badge above the workload. Amber beams fan from it to every storage cylinder, each rim glowing amber. A code window shows "Action": "s3:*", "Resource": "*" highlighted. Isometric, cinematic.*
11. **AWS, product.** *The same scene with the amber beams retracted to one cyan beam on a single bucket labelled "Proposed scope", beside a dark glass panel comparing granted vs. used permissions.*
12. **Banking, opening.** *A premium smartphone floating at a slight 3D angle against a warm, dark evening-home bokeh. A fictional Indian bank app in teal shows a login screen with a masked customer ID. Natural, believable, 16:9.*
13. **Banking, comparison.** *A split comparison beside the phone: "Usual for this customer" vs. "This session". Steady cyan typing-rhythm bars vs. irregular amber bars, thumb-touch dot clusters in different places, a behavioural-match slider sliding into red. Elegant data viz, not a dashboard.*
14. **Banking, risk.** *Five small amber signal chips (device, behaviour, new beneficiary, session age, amount) converging into a large red "High" beside a phone showing a ₹85,000 transfer; then a "Verify it's you" face-check sheet on the phone.*
15. **Zenstra, opening.** *A light, minimal AI assistant window arriving tilted in 3D inside a deep indigo space, a cursor typing a polite technical question, soft periwinkle haze. Wevi-style tilted type-in, 16:9.*
16. **Zenstra, main moment.** *Macro close-up on the prompt box: three lines of configuration text boxed in red with small red tags. A periwinkle scan line sweeps the prompt; a translucent copy of the message lifts and stops against a glowing glass wall; the send button becomes a lock.*
17. **Zenstra, product.** *A dark indigo security console with a detection record (application, detection, risk, action "Blocked · prompt not sent", policy) and a four-step strip Prompt → Secrets found → Blocked → Recorded.*
18. **Finale.** *A vast constellation of identity nodes with six highlighted nodes linked in a bright brand-blue loop, then thousands of points converging into a bold geometric "D" monogram with soft blue bloom on near-black navy. Add the logo in post.*

---

## 10. Final approval test

| Question | Answer |
|---|---|
| Does the opening grab attention? | Yes. A real person, and a push *through* his screen into the hidden identity world in the first 4 seconds. |
| Does it keep and improve the reference's best ideas? | Yes: the silhouette shot, the 82:1 idea, the "situation, then answer" rhythm, the Indian context and the proof-and-CTA ending. |
| Is it understandable without narration? | Yes. Every chapter has kinetic headlines and an end card; the 30 s cut has no narration except the brand name. |
| Are M365 and AD CIRM clearly distinguished? | Yes: a timeline of one session vs. a 3D directory graph and path. |
| Is AWS NHI visually different from human identity? | Yes: an isometric architecture with no people, a role badge and STS. |
| Is banking fraud prevention included? | Yes: a full 17-second chapter covering mobile and internet banking. |
| Is Zenstra clearly separate from adapID? | Yes: its own world, palette, mark, wordmark and end line. |
| Does every product have a memorable moment? | The gauge going to 91; the amber path into Tier 0; the reach fan narrowing to one bucket; "Same credentials. Different behaviour."; the message hitting the wall. |
| Are the transitions meaningful? | Each one carries an object from one story into the next (node, line, beam, constellation). |
| Does it feel like a real campaign? | It is a premium motion-design film with an original score and sonic logo. The synthetic voice is the main gap; see §7. |
| Will viewers remember Deep Algorithms Solutions? | The constellation-to-mark resolve, the sonic logo and the campaign line are built to stick. |

---

## 11. Open items before public release

1. **Voice.** Replace the Kokoro TTS with a professional voice artist (Indian English, calm and confident). The timings are in `tools/vo_script.json`.
2. **Zenstra wording.** Confirm the banner copy ("Blocked! This prompt contains credentials, API keys and tokens. It was not sent.") and the console fields match the shipping product.
3. **adapID screens.** All adapID panels are conceptual rebuilds based on documented workflows, not screenshots. If approved screenshots exist, they can replace the panel contents.
4. **Company name.** The brief says "Deep Algorithms **Solutions**"; the legal name on the site is "Deep Algorithms **Solution** Pvt. Ltd." The film says "Deep Algorithms Solutions". Confirm.
5. **Trademarks.** Microsoft 365, Outlook, Teams, SharePoint, OneDrive, AWS, Amazon S3/RDS/EC2 and Claude appear as text references only, with no official logos and no implied endorsement.
6. **Footage.** The opening shot is Coverr clip "A man shutting down his PC and walking away" (Coverr licence: free for commercial use). Everything else is original.
7. **Data.** All people, accounts, keys, amounts and banks are fictional. The AWS keys are AWS's own documented example values (`…EXAMPLE`).
