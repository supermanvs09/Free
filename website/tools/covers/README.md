# Cover renders

Offline 3D renders for the research and industry covers. Output is committed under `public/img/covers`; nothing here ships in the bundle.

- `kit3d.js` — glossy tiles, chips, mascot, sparkles, stage and lighting (three.js 0.170).
- `covers3d.js`, `cover.html`, `cover.js` — `node cover.js <slug> ...` renders `covers/<slug>.png` at 1600x1000. Convert to 1280x800 WebP (quality 84) into `public/img/covers`. Headline text is not baked in; it lives in `src/components/visuals/CoverArt.jsx`.

Setup: `npm i three@0.170 playwright`, serve this folder (the script starts its own server), and launch Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader`. Fonts are in `fonts/` (Hanken Grotesk, Inter); brand logos are path data in `logos.json`.
