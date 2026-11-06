# Deep Algorithms Solutions · 120-second brand advertisement · Production book

**Master:** `deep-algorithms-solutions-brand-ad-120s-1080p.mp4` · exactly 120.0 s · 1920×1080 · 30 fps · H.264 + AAC 48 kHz · −16 LUFS, −1.5 dBTP
**Captions:** `.vtt` / `.srt` (22 cues, timed to the voice)
**Source:** `film2/` in this repository. Every frame is rendered from code over graded live-action plates, so any line, claim or shot can be changed and re-rendered.

---

## 1. Creative treatment

**Idea:** *Every connection carries trust. Every identity deserves protection.*

The film follows four real people through an ordinary working day:
- **Mei**, a finance analyst, signs in at the office, then works outdoors on her own laptop over public Wi-Fi.
- **An engineer** runs production services late at night.
- **A customer** sends money from a café.
- **A professional** asks an AI assistant to summarise a board document.

The opening ties their four frames together with one line of light ("Every connection carries trust."). Each story then shows the moment its connection becomes a risk, and the product that understands it.

At the close the same four people return in the same grid ("Every identity deserves protection."), and the grid resolves into the company mark.

**Balance (measured from the edit)**

| Material | Seconds | Share | Brief target |
|---|---|---|---|
| Live action, full frame (product lockups play over it) | 73.0 | 61% | ~55% |
| Product screens | 37.7 | 31% | ~25% |
| Full-frame motion graphics (two grids, brand end card) | 9.8 | 8% | ~20% |

The graphics layer does more work than the 8% suggests. Four product lockups, the light-line wipes and the connection lines all play *over* live action. That's deliberate: technology supports the people rather than replacing them.

**Look.** All 15 source clips share one grade: controlled contrast, colour pulled back about 15%, cool shadows and warm skin. Every live shot has a slow camera push.

**Typography.** Inter Display for statements, Inter for interface, JetBrains Mono for system values.

**Motion.** The motion vocabulary comes from Null Motion (MIT), built as GSAP timelines that are seeked frame by frame:
- a guide line draws first
- the product mark lands with a squash-and-settle (`power3.out`, then `back.out(1.55)`)
- the product name rises from a mask (`power4.out`)
- descriptor words blur in one by one
- a sheen passes across the name

**Transition language.** Footage cuts to footage on the beat. Live action hands over to product screens with one hair-line of light that wipes the next picture in. That line is the "connection" made literal.

## 2. Moodboard

The 36 stills in `keyframes/` are the visual reference, taken from the finished film (file name = order and timecode). Use them for reviews and thumbnails, and as the look reference for a live re-shoot.

## 3. Final voiceover script

The lines are as you supplied them, with two small edits:
- **"But identities aren't limited to people"** now opens without "But". It followed straight after another "But" line.
- **The "Zenstra AI" tag** is spelled differently for the synthetic voice, so the name is said correctly.

| Start | Line |
|---|---|
| 0:00.9 | Every second, businesses make thousands of digital connections. |
| 0:05.4 | People access systems. |
| 0:07.3 | Applications communicate. |
| 0:09.5 | Customers move money. |
| 0:11.4 | And AI is changing how work gets done. |
| 0:15.4 | But a successful login doesn't guarantee continuous trust. |
| 0:19.8 | Identity risk can change throughout a session. |
| 0:23.4 | Understanding who is accessing what, how they behave, and when that behaviour changes, is essential. |
| 0:33.5 | adapID AI. Continuous Identity Risk Management. |
| 0:39.6 | Identities aren't limited to people. |
| 0:42.6 | Applications, workloads and services have identities of their own. |
| 0:48.0 | Their permissions and access relationships can create risks that are difficult to see. |
| 0:57.1 | adapID AI. Non-Human Identity Security for AWS. |
| 1:03.8 | In financial services, even valid credentials can hide a fraudulent interaction. |
| 1:11.2 | Protecting customers means looking beyond the login, and understanding the identity and behaviour behind the transaction. |
| 1:21.6 | adapID AI. Identity Fraud Prevention. |
| 1:26.5 | And as organisations embrace AI, another challenge emerges. |
| 1:31.6 | Employees need the power of AI without exposing sensitive business information. |
| 1:38.4 | Security must become part of the interaction itself. |
| 1:42.7 | Zenstra AI. Secure AI Interactions. |
| 1:46.4 | Because the future of business depends on identities we can understand, interactions we can trust, and technology we can secure. |
| 1:54.4 | Deep Algorithms Solutions. Securing identity and AI in the connected world. |

## 4. Shot-by-shot storyboard (120 s)

**L** = live action · **P** = product screen · **M** = motion graphics. The source column refers to the clip IDs in §8.

| Time | Type | Shot | Source |
|---|---|---|---|
| 0.0–2.9 | L | Mei walks past the glass of her office building; her reflection walks with her | `cv_6nRlImEv2r` |
| 2.9–5.2 | L | High angle: an open-plan office at work | `mk_914` |
| 5.2–7.3 | L | The office floor, people at their workstations ("People access systems") | `mk_918` |
| 7.3–9.5 | L | Over the engineer's shoulder: code across two monitors ("Applications communicate") | `mk_41637` |
| 9.5–11.4 | L | A customer at a café, phone in hand ("Customers move money") | `mk_1805` |
| 11.4–12.9 | L | A professional with notes and a laptop ("AI is changing how work gets done") | `mk_4806` |
| 12.9–15.5 | M | The four people tile into a grid; one line of light links them; the pill reads **"Every connection carries trust."**; the camera dives into Mei's tile | four clips |
| 15.5–18.8 | L | Mei walks out, laptop under her arm | `cv_bY6MmxNA8Q` |
| 18.8–22.1 | L | She sits outdoors, opens her laptop, puts on headphones: a new place and a new network | `cv_0X6OX0QjlC` |
| 22.1–24.6 | P | Her company workspace: "Signed in with SSO · MFA passed" | rebuilt |
| 24.5–31.1 | P | **adapID AI CIRM.** Her usual pattern vs. today's session: public Wi-Fi, a personal laptop first seen, a first access to finance reports in 90 days. Risk 14 → 62, Elevated, with a reason for every point. Policy: step-up verification, marked "not a confirmed compromise". | rebuilt |
| 31.0–33.3 | L | Mei takes a call | `cv_OQsjEZ4kND` |
| 33.3–39.3 | L+M | Mei at work outdoors; lockup **adapID AI · Continuous Identity Risk Management** | `cv_0X6OX0QjlC` |
| 39.3–47.1 | L | The engineer: monitors, keyboard, a close profile in the glow | `mk_41642`, `41643`, `41645` |
| 47.1–54.6 | P | **adapID AI NHI for AWS.** Machine identity inventory; the access graph runs workload → IAM role (STS) → `s3:*` on `*` → five buckets. "Excessive permissions". Granted vs. used from 90 days of CloudTrail. "Review permissions. Apply least privilege." Proposed policy, applied with approval; the graph narrows to one bucket. | rebuilt |
| 54.6–57.1 | L | The engineer reviews | `mk_41639` |
| 57.1–63.2 | L+M | Engineer at his desk; lockup **adapID AI · Non-Human Identity Security for AWS** | `mk_41637` |
| 63.2–66.1 | L | The customer at the café opens her banking app | `mk_1805` |
| 66.1–69.2 | P | Close on her phone: ₹12,500 to a saved beneficiary. Confirm, a beat of "Checking…", then "Sent" | rebuilt |
| 69.1–71.3 | L | Close on her face; relief | `mk_1805` (crop) |
| 71.3–74.3 | L | An analyst in a security operations room | `mk_23226` |
| 74.3–81.1 | P | **adapID AI Identity Fraud Prevention.** Two active sessions, one customer, both past login. Session A, her phone: allowed, no extra step. Session B, a new device: password and OTP valid, behavioural match 18%, new beneficiary, ₹85,000. Identity risk 88. Bank policy asks for face verification; marked "Potential account takeover · not confirmed". | rebuilt |
| 80.9–86.5 | L+M | The analyst; lockup **adapID AI · Identity Fraud Prevention** | `mk_23226` |
| 86.4–89.9 | L | The professional with her notes | `mk_4806` |
| 89.7–101.0 | P | An AI assistant. She types "Summarise the Q3 renewal risks for the board:" and pastes a table of customer names and account numbers. The camera pushes in and the cursor reaches Send. **Zenstra AI** scans the prompt and flags names and account numbers; the message lifts and stops at a wall of light; Send becomes a lock. "Blocked: this prompt contains customer personal data. It was not sent." | rebuilt |
| 100.8–108.4 | L+M | Back at her desk, unbothered. A quiet chip: "Zenstra AI · decision record". Lockup **Zenstra AI · Secure AI Interactions** | `mk_4806` |
| 108.3–113.5 | L | Mei in the city · the engineer · the customer smiling | `cv_7Ly15I4p2C`, `mk_41645`, `mk_1805` |
| 113.3–115.3 | M | The same four people return in the grid: **"Every identity deserves protection."** The tiles fold into the centre | four clips |
| 114.8–120.0 | M | The D mark rises out of a blur. **DEEP ALGORITHMS SOLUTIONS** · "Securing identity and AI in the connected world." · adapID AI · Identity Security | Zenstra AI · Secure AI Interactions · deepalgorithms.io | official marks |

## 5. Product claim verification

These are checked against the company's own product pages (website codebase) and zenstra.ai.

| Shown | Evidence | Status |
|---|---|---|
| CIRM learns each identity's usual pattern; risk rises with reasons when context changes | "A live, explainable risk score… every point of risk carries its reason"; "First-seen devices…" | Shown |
| CIRM response is the customer's policy: step-up before sensitive access | "Ask for a stronger check before the next sensitive action." | Shown, labelled *Your policy*, *not a confirmed compromise* |
| NHI: inventory of roles, users, keys; access graph; granted vs. used over 90 days of CloudTrail | "Granted permissions are compared with 90 days of CloudTrail" | Shown |
| NHI: least-privilege fix is proposed and applied with approval | "the remediation, applied with approval" | Shown as *Proposed* |
| Fraud: behaviour, device and context compared with the customer's own normal; valid password and OTP can still be an impostor | "A fraudster with the customer's password and OTP looks exactly like the customer." | Shown |
| Fraud: genuine customers have no extra step; high-risk moments get face verification | "with no extra step for genuine customers"; "Face verification runs only at high-risk moments" | Shown, labelled *Bank policy*, *not confirmed* |
| Zenstra: customer data in an AI prompt is blocked before it is sent; the decision is recorded | zenstra.ai: "deny upload of member data to unapproved AI"; "Staff pasting secrets and member data into chat tools"; "Recorded with the policy that decided it" | Shown. **Confirm the banner copy** with the Zenstra team. |
| Not shown anywhere | Performance numbers, detection rates, customer logos, certifications, integrations beyond the products' own pages | — |

## 6. Music and sound

- **Score:** original, synthesised, no samples. D minor at 96 bpm.
  - **0–15 s:** a quiet sixteenth-note pulse that grows.
  - **From 15 s:** rhythm enters.
  - **Where risk rises:** tension swells (26 s, 49 s, 75 s).
  - **Bank check:** the music dips during "Checking…" and resolves when the money is sent.
  - **Before the Zenstra block:** it holds its breath.
  - **Company section:** the progression lifts through B♭–Gm–A into **D major**.
- **Brand audio signature:** a sub hit and three rising bells (D–A–F♯) as the mark appears.
- **Location sound:** city air for Mei's scenes, office murmur, café room tone with cup clinks, room hum for the engineer (with keystrokes on the typing shot) and the operations room.
- **Interface sound:** every UI event in the edit triggers its own sound, so sound and picture are frame-synced.
- **Voice:** Kokoro TTS (Apache-2.0), a blend of a mature Indian male voice (75%) and an international voice (25%). EQ adds warmth at 180 Hz and presence at 3 kHz, with gentle compression. The music ducks about 7.5 dB under the voice.
  - Speech-to-text over the **final mix** returns every line correctly, so the voice stays clear over score and ambience.

## 7. Quality review against the Final Creative Test

| Question | Assessment |
|---|---|
| Does the opening capture attention? | Yes. A real person and a real reflection, then the working world in four cuts, then the four people linked by light within 13 seconds. |
| Does it look like a real enterprise ad? | The picture, grade and motion do. The synthetic voice is the gap that most gives it away (§9). |
| Are real people central? | Yes. 61% of the film is live action, and every product moment is bracketed by the person it protects. |
| Can a decision-maker understand the problems? | Each chapter is one concrete situation: a session drifting from its baseline, a role that can reach every bucket, two sessions with the same valid credentials, customer data in an AI prompt. |
| Are the products introduced naturally? | Each product appears only after its problem, as a screen at the moment it matters, and then as a lockup over the person. |
| Does the voice sound professionally directed? | Pace, warmth and clarity are good. It's still a synthetic voice; replace it before launch (§9). |
| Consistent visual identity? | Yes: one grade, one type system, one transition device, one lockup system. |
| Credible and memorable? | No invented claims. The bookended grid lines and the sonic logo carry the memory. |
| Right for website, LinkedIn and conferences? | Yes, at 1080p. For very large conference screens, see §9. |

## 8. Footage credits and licences

| ID | Clip | Library | Page |
|---|---|---|---|
| `cv_6nRlImEv2r` | Woman Adjusting Appearance During Walk by Office Windows | Coverr | https://coverr.co/videos/contemplative-walk-by-the-office-buildings |
| `cv_bY6MmxNA8Q` | Confident Businesswoman Walking Outdoors in City | Coverr | https://coverr.co/videos/confident-businesswoman-walking-outdoors |
| `cv_0X6OX0QjlC` | Focused Woman Puts On Headphones to Work Remotely | Coverr | https://coverr.co/videos/focused-remote-work-at-outdoor-setting |
| `cv_OQsjEZ4kND` | Businesswoman Answering Phone Call Outdoors in City | Coverr | https://coverr.co/videos/businesswoman-checking-phone-outdoors |
| `cv_7Ly15I4p2C` | Young Businesswoman Contemplating in City Setting | Coverr | https://coverr.co/videos/businesswoman-contemplating-in-city-park |
| `mk_41637` | programmer working with codes on a computer | Mixkit | https://mixkit.co/free-stock-video/programmer-working-with-codes-on-a-computer-41637/ |
| `mk_41642` | professional programmer working on a big computer | Mixkit | https://mixkit.co/free-stock-video/professional-programmer-working-on-a-big-computer-41642/ |
| `mk_41643` | experienced programmer working on a computer | Mixkit | https://mixkit.co/free-stock-video/experienced-programmer-working-on-a-computer-41643/ |
| `mk_41639` | experienced programmer working on a large computer | Mixkit | https://mixkit.co/free-stock-video/experienced-programmer-working-on-a-large-computer-41639/ |
| `mk_41645` | experienced programmer working very concentrated | Mixkit | https://mixkit.co/free-stock-video/experienced-programmer-working-very-concentrated-41645/ |
| `mk_1805` | a woman using her smartphone | Mixkit | https://mixkit.co/free-stock-video/a-woman-using-her-smartphone-1805/ |
| `mk_23226` | man working with the computer in the office (720p source, upscaled) | Mixkit | https://mixkit.co/free-stock-video/man-working-with-the-computer-in-the-office-23226/ |
| `mk_4806` | young woman writes a list on her work schedule | Mixkit | https://mixkit.co/free-stock-video/young-woman-writes-a-list-on-her-work-schedule-4806/ |
| `mk_918` | busy office space | Mixkit | https://mixkit.co/free-stock-video/busy-office-space-918/ |
| `mk_914` | open office space | Mixkit | https://mixkit.co/free-stock-video/open-office-space-914/ |

All clips are free for commercial use under the Coverr licence and the Mixkit Stock Video Free License. AI-generated and premium clips were excluded. For paid media, have legal confirm the licence terms for footage showing identifiable people.

## 9. What a live production would still add

The brief asks for things that can't be produced from this environment. Here is what was done instead, so you can decide what to commission.

1. **Directed actors and a shoot.** The film uses licensed footage, but cast for continuity: each story keeps one person throughout, and every clip shares one grade.
   - A two-day shoot in Hyderabad or Bengaluru would add Indian talent for every role, consistent wardrobe, and on-screen device inserts.
   - The storyboard in §4 is ready to shoot.
2. **A professional voice artist.** Record the 22 lines in §3.
   - `film2/tools/edl.json` holds each line's start time. Drop the WAVs in and re-run the mix; the picture doesn't change.
3. **Real product recordings.** The product screens are rebuilt from documented workflows.
   - If approved screen recordings of adapID AI and Zenstra AI exist, they can replace the rebuilt screens one for one.
4. **4K.** The master is native 1080p (the brief's minimum).
   - The Coverr clips, which carry the CIRM chapter, are only available free at 1080p.
   - A 4K master would mostly be upscaled, so this deliverable doesn't pretend to be one.
