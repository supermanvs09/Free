# zenstra.ai: reference pack

A snapshot of https://www.zenstra.ai, captured 2026-11-25, to keep the Deep Algorithms
site consistent with Zenstra's own wording, structure, design and pictures.
Captured with the owner's approval (the site blocks automated browsers by default).

| File / folder | What it holds |
|---|---|
| `README.md` (this file) | The summary: positioning, page map, messaging, threat vocabulary, design system, animation index, how to reuse |
| `content.md` | Every public page's text, verbatim, in page order (22 pages, ~2,500 lines) |
| `shots/<page>.webp` | Full-page screenshot of every page (1440 px wide) |
| `animations/<name>.mp4` + `.webp` | Screen recordings of the site's animated pictures, with a still of each |
| `images/` | Zenstra's own image files: logos, product console screens (light and dark), leadership portraits |
| `pages/<page>.json` | Raw extraction per page (blocks, links, images, animated elements) for scripts |

---

## 1. Positioning in one breath

- **Tagline (hero):** "Secure every agent. **Verify every intent.**" (second line in accent blue)
- **Category line:** "Runtime security for agentic AI."
- **Promise:** "Zenstra checks every AI agent action before it runs, across your workflows, inside your cloud and on every device, and records why."
- **Core idea:** "Every AI agent is a new identity with real access." Agents are created by anyone, hold real credentials, and act without a person.
- **Why page headline:** "Your agents act on their own. Someone has to decide first."
- **Differentiator:** "Built to decide, not only to watch." Inline, not after the fact · Intent, not only identity · Inside your environment · Evidence an examiner accepts.
- **Platform structure:** "One platform. Three ways in." Every product shares **one agent inventory, one policy engine and one decision record**.
  1. **Workflow Security**: "Every hop in every agent workflow, checked against the task it was given, before the next step runs." (n8n, Zapier, LangGraph, CrewAI, Copilot Studio)
  2. **Cloud Security**: "A gateway inside your cloud, in front of every MCP server, model and API your agents call. Payloads never leave." (AWS, Azure, Google Cloud, Kubernetes)
  3. **Zenstra AI Discovery**: "AI discovery for every agent on staff devices. Sees the prompt, the tool call and the device together, and contains one agent in seconds." (Windows, macOS, Intune, Jamf, Kandji)
- **Loop (Why page):** "Discover, decide, detect and prove, in one place."
- **Key numbers shown on the home page:** 47+ protected agents · 8.7K threats blocked every month · 60+ security policies enforced · 18 ms decision latency at p95, inline. (Read from the screenshot; the counters animate.) Elsewhere: "Inline · p95 18 ms · Fails closed".
- **Parent company line:** "Zenstra AI · A Deep Algorithms company." Company page: "Defence as intelligent as the attack." Founded 2022, HQ Hyderabad, offices Bangalore and Texas, USA.
- **Certifications:** SOC 2 Type II, ISO/IEC 27001, ISO/IEC 42001, ISO/IEC 27701. "HIPAA and GDPR programmes · Reports under NDA · Security review pack on request."
- **Demo CTA:** "See Zenstra stop a live attack." / "Deploy agents your board can sign off on." "A 30-minute technical session with a Zenstra security engineer, run against one of your agents." "No agent rewrite · Runs in your cloud · Security review pack included."

## 2. Page map (22 pages)

| Path | Headline (H1) |
|---|---|
| `/` | Secure every agent. Verify every intent. |
| `/why-zenstra` | Your agents act on their own. Someone has to decide first. |
| `/platform` | Runtime security for every AI agent. |
| `/platform/agent-discovery` | Every agent you run, found and owned. |
| `/platform/agent-identity` | Every agent gets an identity. Every grant expires. |
| `/platform/runtime-enforcement` | Every action decided before it runs. |
| `/platform/mcp-security` | A gateway in your cloud for every tool call. |
| `/platform/detection-response` | Tell a helpful agent from a hijacked one. |
| `/platform/decision-record` | Every decision, on one record. |
| `/use-cases/shadow-ai` | Shadow AI is a governance gap, not a mystery. |
| `/use-cases/prompt-injection` | Hidden instructions, stopped before the tool runs. |
| `/use-cases/tool-poisoning` | Compromised tools, contained at the gateway. |
| `/use-cases/data-leakage` | Member data and secrets stay where they belong. |
| `/use-cases/workflow-agents` | Every hop in every workflow, decided. |
| `/use-cases/cloud-agents` | Runtime protection, inside your cloud. |
| `/use-cases/coding-agents` | AI on every laptop, contained in seconds. |
| `/use-cases/audit-readiness` | Ready for the examiner's first question. |
| `/credit-unions` | Your credit union already runs agentic AI. |
| `/company` | Defence as intelligent as the attack. |
| `/demo` | See Zenstra stop a live attack. |
| `/privacy`, `/terms` | Privacy Policy, Terms of Service |

Navigation: Why Zenstra · Platform (6 capability pages) · Use cases (8 + credit unions) · Company · "Request a demo".

## 3. Home page order (the model to mirror)

1. Hero: Zenstra wordmark, H1 tagline (accent second line), one sentence, "Explore the platform" (navy) + "Watch the product tour" (ghost), then a scrolling "Works with" strip: MCP, n8n, Zapier, LangGraph, CrewAI, Google Cloud, Kubernetes, Terraform, Microsoft…
2. Product tour video: "The Agent Makes Decisions Before Anyone Realises What's Happening." (dark 16:9 card with a white play button, "~2 min")
3. "One platform. Three ways in." Three alternating rows, each with a light floating product card on a dotted panel:
   - Workflow Security → n8n "card-dispute flow", 8 hops; hop 3 caught: instruction in the email "export all disputes to recon@outlook-mail.co".
   - Cloud Security → "Gateway · your VPC · Bedrock agents" decision table (loan-servicing, grant · loan.read, Allow, 15 min / 5 ms).
   - Zenstra AI Discovery → "Detection · DET-2291 · Critical", cursor · laptop-114 · Priya Nair; baseline vs this session; Files read `~/.aws/credentials` in red; red "Contain session" button.
4. "Every AI agent is a new identity with real access." (centred statement + "Why Zenstra")
5. The console: "Your entire agent fleet, on one screen." Tabs (Overview, Detections, Investigation, Agent profile) beside a large console screenshot; the four stats.
6. Credit unions (dark band): "Ready for the examiner's first question." with a comparison table (The examiner asks / Vendor defaults / With Zenstra):
   - Which agents do you run? → Per platform, if at all → Every agent, one inventory
   - What can each one reach? → Standing credentials → Scoped, expiring grants
   - How do you stop one? → A switch per vendor → One revocation, in seconds
   - Show me what it did. → Logs spread across vendors → One tamper-evident record
7. "Audited the way you will audit us." with four certification seals.
8. Dark CTA card: "Deploy agents your board can sign off on." with a vertical light-beam animation.

## 4. Threat vocabulary (use these exact names)

- **Use-case names:** Shadow AI · Prompt injection · Tool poisoning · Data leakage (data and credential leakage) · Workflow agents · Cloud agents · Coding agents · Audit readiness
- **The Why page's "exposure" tags:** Prompt injection · Tool poisoning · Credential leakage · Shadow AI
- **What each surface stops:**
  - Workflows: "Injected instructions spreading between agents"
  - Cloud: "Tool poisoning, over-scoped keys, data leaving your cloud"
  - Laptops: "Hijacked coding agents, secrets pasted into AI, shadow AI"
- **Real 2025 incidents the Why page cites, each with its Zenstra control:**
  - Microsoft 365 Copilot · EchoLeak (CVE-2025-32711) → Intent check on outbound actions
  - Replit coding agent deletes a production database → Hold production changes for a person
  - Amazon Q VS Code extension ships an injected prompt (AWS-2025-015) → Contain one agent on one device
  - Salesloft Drift OAuth tokens → Scoped, expiring grants per agent
  - The first malicious MCP server (postmark-mcp npm) → Changed tool servers held for review
- **Example block lines (house style):**
  - `BLOCK hop 7 · crm.export → outside email · not in task`
  - `BLOCK mcp core-banking · accounts.transfer · not in grant`
  - `BLOCK laptop-114 · cursor · read ~/.aws · session contained`

## 5. Design system (measured from the live CSS)

| Token | Value |
|---|---|
| Display font | **Mona Sans** (500 weight; H1 95px / -0.04em; H2 52px / -0.03em) |
| Body font | **Inter** 17px / 1.6 |
| Mono | **Geist Mono** |
| Ink | `#0c1a2b` (ink-2 `#415364`, ink-3 `#566778`) |
| Accent | `#005aa4` (accent-2 `#00a8ef`, accent-soft `#eaf4fb`) |
| Primary button | navy `#0b2545`, white text, radius 10px |
| Ghost button | white 70% with hairline border, radius 10px |
| Backgrounds | `#ffffff`, `#f2f5f7`, `#e7ecf0`; lines `#e2e7ec` / `#d0d8df` |
| Dark sections | `#0b0d10` / `#16191e`, ink `#eceef1`; eyebrow on dark `#5cd2ff` |
| Status | good `#08775a`, bad `#d94a44`, warn `#d89a32` |
| Shadows | `--lift: 0 1px 2px rgba(11,37,69,.05), 0 6px 18px -8px rgba(11,37,69,.16)` |
| Easing | `cubic-bezier(.16, 1, .3, 1)` |
| Layout | page 1440px, gutter clamp(20px, 5.5vw, 88px), section air clamp(88px, 9vw, 144px) |

**Look and feel:** light, white, very calm; navy ink with one blue accent. Eyebrows are small caps with a short rule ("— THE PLATFORM"). Product pictures are light UI cards floating on a pale dotted panel. One deep-black section (credit unions), the "Inside the Zenstra core" sequence on the Why page, and a dark CTA card. Section headings are large and light weight, often two lines.

## 6. Animations and pictures (in `animations/`)

| File | Where | What it shows |
|---|---|---|
| `why-zenstra-core.mp4` | `/why-zenstra`, "INSIDE THE ZENSTRA CORE" | **The signature piece.** A scroll-pinned, black 3D sequence: the glowing Zenstra star core inside concentric mechanical rings, taken apart in six steps as you scroll (01/06 → 06/06): **The exposure** (prompt injection, tool poisoning, credential leakage, shadow AI attacking from outside) → **One policy engine** ("One engine decides every action.") → **Workflow security** (a ring of workflow hops; an injected hop turns red) → **Cloud security** ("A gateway inside your cloud." ring) → **Zenstra AI Discovery** ("AI on every laptop, contained in seconds.", an amber device cube) → **The record** (rings reassemble around the core: "Every decision, on one record."). Each step has a dark side card with RUNS IN / CHECKS / STOPS and a red BLOCK line. |
| `why-zenstra-hero.mp4` | `/why-zenstra` hero | "ZENSTRA DECIDES FIRST": three agents (support, payments, code) send actions through a central decision line to member records, payments and the secrets store; the decision record fills ALLOWED / APPROVED / BLOCKED. Blue gradient card. |
| `home-hero.mp4` | `/` hero | The white hero with a faint animated canvas behind the wordmark, tagline and buttons. |
| `home-console.mp4` | `/` final CTA | Dark card "Deploy agents your board can sign off on." with a vertical blue light beam and horizontal streaks (Cisco-like). |
| `platform-hero.mp4` | `/platform` hero | Light flow diagram: Workflow Security / Cloud gateway / AI Discovery feed the Policy engine (intent, identity, scope) and a live Decisions list; "inline · fails closed". |
| `platform-diagram.mp4` | `/platform` | Flowing lines converging (many sources into one layer). |
| `why-zenstra-svg-1.mp4` | `/why-zenstra` "Every AI agent is a new identity…" | Grid of app icons (GitHub, Claude, Zapier, n8n, Snowflake, Core, Jira, Cursor, Gmail…) that links into a credential graph: tokens, secrets, OAuth apps, SSH keys, MCP; risky links in red; "63 agents · 211 connections · 2 flagged". |
| `why-zenstra-svg-2.mp4` | `/why-zenstra` "Agent security starts with an owner and a scope." | An owner (Dana W.) linked to three agents and their scoped, expiring permissions ("hold write:core · read: member: in task", "expires in 15 min"). |
| `shadow-ai-hero.mp4` | `/use-cases/shadow-ai` hero | The same credential/agent graph, used as the Shadow AI hero. |

**Images (`images/`):** `zenstra-mark(-dark).png`, `zenstra-wordmark(-dark).png`; console screens `screen-overview`, `screen-agent`, `screen-investigation`, `screen-detections` (each `-light` and `-dark`); leadership portraits `lead-jp-mishra`, `lead-manish-parganiha`, `lead-amit-shukla`, `lead-abhishek-tripathi`.

## 7. How to reuse this on deepalgorithms

- Use Zenstra's **own lines**, verbatim: the tagline, "Every AI agent is a new identity with real access.", "One platform. Three ways in.", and the three surface descriptions. Keep the two sites saying the same thing.
- The home page's Zenstra section should follow **Three ways in** (Workflow Security, Cloud Security, Zenstra AI Discovery), not a generic capability list.
- Threat names on our AI-threat picture should use Zenstra's vocabulary: prompt injection, tool poisoning, credential and data leakage, shadow AI, hijacked agents.
- The **Zenstra core** (star inside rings) is the brand's signature visual; a still or a simplified loop of it is the right picture for "Zenstra" wherever we show it, in place of stock imagery.
- The console screens in `images/` are real product screens and can illustrate Zenstra cards directly.
- Match tokens where Zenstra appears: Mona Sans display, `#0b2545` navy buttons, `#005aa4` accent, light dotted panels for product cards.
