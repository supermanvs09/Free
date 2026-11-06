# Deep Algorithms Solutions — Brand Advertisement (Final Revision)

**Master:** `deepalgorithms-brand-ad-v3-1080p.mp4` · 1:44 (104 s) · 1920×1080 · 30 fps · H.264 + AAC 48 kHz stereo, −16 LUFS integrated
**Captions:** `captions-en.vtt`, `captions-en.srt` (29 cues, timed to the narration)
**Source:** `film3/` in this repository (deterministic: every frame is a function of time; it can be re-rendered exactly)

---

## 1. What changed from the previous cut, against the brief

| Brief requirement | How this cut answers it |
|---|---|
| 90–120 s, length driven by the story | 104 s. Opening 0–14 s · adapID AI 14–65 s · Zenstra AI 65–90 s · reveal 92–104 s |
| Light, clean, premium compositions with strong typography (PhonePe-level polish, not copied) | Every product screen, title card and the logo reveal are now light. Large type, white space, a single accent colour per product. Nothing is borrowed from the reference ad's layouts or assets |
| Say "adapID AI" once and "Zenstra AI" once | Each name is spoken exactly once (14.8 s and 74.4 s). The three adapID capabilities are introduced with "It…", not the product name |
| The three adapID capabilities: CIRM, NHI for AWS, Identity Fraud Prevention | Each one gets a lower third, a live-action lead-in and a light dashboard explainer. A ring and caption walk the viewer through three steps per screen |
| Light-themed product explainers | The dashboards are rebuilt on white, with readable 1080p type. There are no dark dashboards, glow, particles, holograms or hacker imagery |
| Fraud section: real banking activity on a smartphone | Three live-action handheld phone shots. The green screens are replaced with a fictional "Your Bank" UPI flow, timed to the real finger taps: choose Amma, enter ₹12,500 on the keypad, review, tap Pay, processing, paid. The fraud dashboard follows |
| Zenstra: realistic AI-assistant interaction | A Claude-style chat with a pasted `.env` holding AWS keys and a production database password. Zenstra flags the three secrets, blocks the prompt before it is sent and records the decision |
| Logo reveal: the D icon first, then the full logo, name and positioning line, light background, no 3D glow | The diagonal stroke slides in and the bowl draws on. The mark settles with a soft sheen, then moves into its place in the official lockup. Then come the company name, "Securing identity and AI in the connected world.", both products and deepalgorithms.io |
| 50–60% live action | About 56 s of 104 s (≈54%) is live action: full-frame shots, phone composites, grids of live clips, and title cards over moving footage |
| Official logos | The company lockup, the D mark and the Zenstra wordmark are the files from the website build. They are not redrawn |
| No invented customers, certifications, integrations, statistics or claims | None appear. Product capabilities are worded from the website copy. The bank, the people and the transaction are fictional and generic |

## 2. Narration (spoken script)

| In | Line |
|---|---|
| 0.6 | Every business today runs on trust. |
| 2.9 | An employee signs in. A cloud service calls another. A customer sends money. A team asks AI for help. |
| 10.6 | Behind every one of these moments is an identity. |
| 14.8 | Meet adapID AI. It protects those identities, human and machine. |
| 20.0 | It keeps reading every session after the login. When the device, the network or the behaviour changes, trust adapts with it. |
| 33.6 | It finds the machine identities across your AWS accounts, shows what each one can reach and what it really uses, and proposes the least privilege it needs. |
| 47.4 | And in digital banking, it recognises the customer, not just the password: how they type, tap and pay. |
| 61.6 | Even an impostor with valid credentials stands out. |
| 66.4 | As teams bring AI into their daily work, sensitive data can travel with every prompt. |
| 74.4 | Zenstra AI checks what is about to leave, and stops credentials and secrets before they are sent. |
| 85.2 | Your teams get the power of AI, without the exposure. |
| 95.0 | Deep Algorithms Solutions. Securing identity and AI in the connected world. |

I checked the speech-to-text transcript of the final mix against this script. Every line transcribes correctly. "adapID" is voiced as "Adap ID", a single word plus I-D.

## 3. Edit

| Time | Picture | Purpose |
|---|---|---|
| 0.0–10.4 | Five live shots: city walk, office, engineer, phone, planning | Everyday moments that depend on trust |
| 10.2–14.4 | Four-up grid of live clips · "Every connection carries trust." | Bridge to identity |
| 14.3–19.8 | Title card over a city walk · "Every identity, human and machine." + three capability chips | Introduces adapID AI |
| 19.7–33.2 | Live lead-in → CIRM dashboard → live | Session context changes → reasons for risk → policy response |
| 33.2–47.0 | Live lead-in → NHI for AWS dashboard → live | Machine identities → reach versus use → least-privilege proposal |
| 47.0–65.6 | Live lead-in → three phone shots of the payment → fraud dashboard | The customer is recognised by behaviour, not just credentials |
| 65.5–84.3 | Live lead-in → Claude-style chat with secrets → Zenstra block → Zenstra detection record | AI used safely |
| 84.2–89.9 | Title card · "Use AI freely. Keep secrets inside." | Zenstra promise |
| 89.8–92.6 | Grid collapses · "Every identity deserves protection." | Transition to brand |
| 92.45–104 | D mark → lockup → name, positioning line, products, URL | Logo reveal |

## 4. Sound

The score is an original synthesised piece (pads, plucks, mallets, light percussion) in D minor. It lifts through B♭, G minor and A into D major on the logo. Location ambience follows each shot. UI and phone-tap sounds sit on the on-screen actions. The music holds its breath during the payment's "Processing…" beat and in the second before Zenstra blocks the prompt. Music ducks under every narration line. The master is normalised to −16 LUFS integrated with −1.5 dBTP.

## 5. Production notes — please read before release

1. **The voice is synthetic, not a recorded human Indian-English artist.** After the earlier feedback, the narration uses the same deep, natural-paced voice character as your reference video (a text-to-speech voice at that pace). The brief asks for a professionally directed human voiceover, so this track is a guide. For broadcast, re-record the script in section 2 with a voice artist; the timings in the table are the slots to fit.
2. **Live action is licensed stock, not a commissioned shoot.** All clips come from Coverr and Mixkit free licences (list below). The three phone shots are green-screen stock with the banking interface composited in. A commissioned shoot with a real device would look better still and allow Indian locations and talent.
3. **The product screens are rebuilt motion graphics.** They are based on the documented product workflows on the website, not screen recordings of the products. Please have product owners confirm each screen's wording, especially the Zenstra banner text ("Blocked! This prompt contains credentials, API keys and tokens.").
4. **Claude interface and name.** The Zenstra section shows a Claude-style chat and names "Claude (claude.ai)" in the detection record. Confirm with legal that third-party product names and UI may appear in the ad. If not, the chat can be made generic in a few minutes.
5. **Credentials on screen are not real.** The AWS keys are AWS's documented example keys (`AKIAIOSFODNN7EXAMPLE`). The database host and password are invented.
6. **Resolution.** The delivery is 1080p. Some sources are 720p (mk_9078, mk_9181), upscaled with Lanczos. A 4K version needs 4K source footage. The graphics already render at any resolution.

## 6. Footage credits

| ID | Title | Source |
|---|---|---|
| cv_6nRlImEv2r | Woman Adjusting Appearance During Walk by Office Windows | Coverr |
| cv_0X6OX0QjlC | Focused Woman Puts On Headphones to Work Remotely | Coverr |
| cv_OQsjEZ4kND | Businesswoman Answering Phone Call Outdoors in City | Coverr |
| cv_bY6MmxNA8Q | Confident Businesswoman Walking Outdoors in City | Coverr |
| cv_7Ly15I4p2C | Young Businesswoman Contemplating in City Setting | Coverr |
| cv_9DfpggkcyD | Swiping on iPhone green screen | Coverr |
| mk_918 | Busy office space | Mixkit |
| mk_1805 | A woman using her smartphone | Mixkit |
| mk_4806 | Young woman writes a list on her work schedule | Mixkit |
| mk_41637 / 41639 / 41642 / 41645 | Programmer working at a computer (series) | Mixkit |
| mk_9078 | Woman holding greenscreen mobile phone taps screen | Mixkit |
| mk_9181 | Man touching mobile phone greenscreen | Mixkit |

## 7. Rebuilding

```
# phone composites (green-screen replacement), per shot
python3 film3/tools/phone_comp.py <clip> <in> <dur> <ui-frames> <out> [dark]
# frames, sound, captions
node film3/tools/render.cjs http://127.0.0.1:8767/index.html <frames-dir> 0 "" 3
python3 film3/tools/mix.py events.json <vo-dir> film3/tools/edl.json mix.wav
python3 film3/tools/captions.py <vo-dir> deliverables/brand-ad-v3/captions-en
```
