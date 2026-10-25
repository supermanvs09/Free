# deepalgorithms.io

React 19 + Vite 8 + Tailwind 4, prerendered to static HTML.

```bash
npm ci
cp .env.example .env
npm run dev      # http://localhost:5173
npm run build    # dist/ (static, deploy anywhere)
```

- Content lives in `src/data/` (products, solutions, company, legal, posts) and `src/content/posts/` (article bodies).
- Product UI illustrations are code (`src/components/visuals/`), with sample data only.
- Launch blockers, SEO checklist and QA results: `../docs/redesign/HANDOFF.md`. Design rationale: `../docs/redesign/design-system.md`.
