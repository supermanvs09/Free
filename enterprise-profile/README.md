# Deep Algorithms — Enterprise Profile (A4)

Outputs (A4 portrait, 300 dpi): `build/deep-algorithms-enterprise-profile.png` and `.pdf`.

- Edit text/layout in `src/profile.html` (placeholders like `{{icon:fingerprint}}` are filled by the build).
- Rebuild: `python3 build.py` (needs Node + Playwright for the PNG/PDF; `--no-render` for HTML only).
- Logos: `assets/brand` (Deep Algorithms, adapID, Zenstra AI) and `assets/logos` (clients, investor).
- CSB Bank: drop the official logo at `assets/logos/csb-bank.png` and rebuild — it replaces the text placeholder.
- `source-notes/` holds the annotated feedback print and the original Zenstra artwork.
