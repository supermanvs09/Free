# Deep Algorithms brochures (A4 portrait)

| Brochure | Source | Outputs (PNG 300 dpi + PDF) |
|---|---|---|
| Enterprise profile | `src/profile.html` | `build/deep-algorithms-enterprise-profile_tagline-{1,2}.*` |
| adapID AI · NHI Security | `src/nhi-security.html` | `build/adapid-nhi-security-brochure_tagline-{1,2}.*` |

Tagline versions (footer):
1. Protecting identities, securing intelligence, empowering enterprises.
2. Making Digital Security Smarter, Stronger and Proactive.

- Shared styles and the brand colour (Deep Navy Blue `#0E1A5C`) live in `src/base.css`.
- Rebuild everything: `python3 build.py` (Node + Playwright render the PNG/PDF; `--no-render` for HTML only).
  Taglines are set in `build.py` (`TAGLINES`).
- Logos: `assets/brand` (Deep Algorithms, adapID, Zenstra AI), `assets/logos` (clients, investor).
- Profile header photo (`assets/photos/hero-biometric.jpg`) is an Unsplash photo (Unsplash License), recoloured to the brand palette. The NHI header art is drawn in code (`orbit_light` in build.py).
- `source-notes/` holds the annotated feedback prints and original artwork.
- PDFs are made from the 300 dpi PNGs so every viewer shows identical colours.
- Integration icons: Simple Icons (CC0) and Phosphor (MIT); licences in `assets/icons`.
