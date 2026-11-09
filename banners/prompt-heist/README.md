# Prompt Heist banners

| File | Size | Use |
|---|---|---|
| `prompt-heist-landscape-1920x1080.png` (+ `@2x`) | 16:9 | Website hero, LinkedIn/X event cover, slides |
| `prompt-heist-portrait-1080x1350.png` (+ `@2x`) | 4:5 | LinkedIn / Instagram feed post |

Design direction: `design-philosophy.md` ("Signal Collage").

## How the references were merged
- Halftone cut-out object with white sticker edge: "We are hiring" megaphone poster
- Cracked padlock: HackAPrompt
- Job offer letter: isometric job-offer illustration
- Huge condensed headline + pill tags for prizes: "July 2025 Grants" poster
- Outlined display type, circular stamp, dotted path, striped band: Wiz Prompt Airlines
- Dark field with hairline grid and small line icons: Google Bug Hunters

## Missing before publishing
Event date, registration link / QR code, and the host company logo. Add them in `src/banner.html`, then run `node src/render.js 1` and `node src/render.js 2` from this folder.

## Source
- `src/banner.html`: layout for both sizes
- `src/halftone_lock.py`: generates `src/lock.png` (halftone padlock)
- `src/render.js`: renders the PNGs with Playwright
- `src/fonts/`: Big Shoulders, Geist Mono, Instrument Sans (SIL Open Font License)

## v2 (current)
`prompt-heist-v2-*.png`, source `src/banner-v2.html`. Render: `node src/render.js 2 banner-v2.html -v2`.
- The AI guard "Vault" chat panel is the hero; "Try it now" replaces "Register now".
- Giant halftone lock cropped by the frame, redacted job offer, partly revealed secret.
- Live chat widget UI (no backend): `/chatbot/vault/index.html`.
