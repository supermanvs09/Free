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
- Header photos (`assets/photos/hero-*.jpg`) are Unsplash photos (free to use under the Unsplash License),
  duotoned to the brand navy.
- `source-notes/` holds the annotated feedback prints and original artwork.
