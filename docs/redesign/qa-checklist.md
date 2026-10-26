# Page QA checklist

Every rule below came from a mistake that was made and pointed out. Run all of it on every page, at 1440 px and 390 px, before calling a page done. A page passes only if every box is ticked.

## A. Brand first
- [ ] Our mark is the largest and most saturated brand object in any picture that shows it. Nothing else competes with it for size or colour.
- [ ] Third-party logos are small and drawn in one neutral tone (grey-blue), never in their full brand colours, wherever our mark is on screen.
- [ ] The palette is minimal: navy, brand blue and cyan for us; coral only for risk (and the one approved accent on the About beliefs cards); white and greys for the rest. No rainbow of app colours.
- [ ] Icons share one weight and one style (Phosphor, one weight per picture). No mixed icon sets in one view.
- [ ] Type: Hanken Grotesk Light for display, Inter for text. No third font. No bold display headings.
- [ ] No utility strip above the main navigation. No on-page disclaimers inside pictures or players unless legally needed (sample-data notes live in alt text and docs).
- [ ] No Zenstra look, no Astrix look: borrow structure and restraint, never the artwork, the line style, the wording or the layout.

## B. Imagery and motion
- [ ] Every picture has one idea. Count the objects: if more than about six compete, remove some.
- [ ] No tiny text inside pictures. Anything meant to be read is real page text or large enough to read at 390 px.
- [ ] Pictures are not oversized. On content pages a picture never exceeds its column, and no picture is taller than 60% of the viewport on a laptop.
- [ ] Covers and product shots are separate per product; no product shows another product's alerts.
- [ ] No dotted or grid backgrounds behind pictures or animation.
- [ ] Animation starts only when on screen, pauses off screen, honours reduced motion and has a pause control when longer than 5 seconds.
- [ ] Motion has a purpose (it explains something). Nothing loops purely to decorate.
- [ ] Real product UI is drawn with real names and icons, not copied from the NHI codebase. All sample data is labelled.
- [ ] Every image has alt text, or is decorative with `aria-hidden`.

## C. Words and pitch
- [ ] The first screen says what this is, who it is for and what to do next, in under 25 words of body copy.
- [ ] Each claim is one we can support. Numbers carry a source or are labelled illustrative. Nothing is invented: no customers, quotes, certifications or statistics.
- [ ] Strong wording is allowed, unsupported superlatives are not ("Impact the future, today" is a promise of intent; "most secure" is a claim).
- [ ] No filler ("cutting-edge", "seamless", "world-class", "leverage"), no jargon without a plain-language gloss, no passive voice where an active one is shorter.
- [ ] One H1 per page. Headings tell the story when read alone.
- [ ] Every page ends in one clear next step.
- [ ] Wording is consistent: product names, company name (see HANDOFF for the open legal-name question), capitalisation, dates, units.
- [ ] Products are not mixed: NHI security (adapID) and Zenstra agent security stay separate products.

## D. Layout
- [ ] Nothing overflows horizontally at 390 px. No clipped text, no overlapping elements, no orphan single words in headings.
- [ ] Touch targets are at least 44 px. Focus rings are visible.
- [ ] Spacing follows the scale (sections 80 to 128 px). No cramped or floating blocks.
- [ ] Menus open, close with Escape and are reachable by keyboard.
- [ ] Looks right with images blocked or slow: boxes reserve their space, text stays readable.

## E. Engineering
- [ ] SEO basics (20-point list in HANDOFF): unique title and description, canonical, one H1, JSON-LD, sitemap, 404, alt text, WebP, lazy below the fold.
- [ ] axe-core reports no violations at both widths.
- [ ] No console errors or hydration warnings. Never mutate server HTML before hydration.
- [ ] Forms validate, focus the first error, send the exact payload and show a clear result.
- [ ] Videos and audio: sound only on a user click, captions on, a transcript on the page.

- [ ] Interactive pieces are exercised, not just photographed: click every control, scrub the whole timeline in small steps, seek to each chapter, pause, resume, mute. No page error at any position. (A single out-of-range index once crashed the film for every visitor at 2.5 seconds; screenshots alone did not catch it.)
- [ ] Anything that plays audio is tested with the audio actually playing: the picture stays in step with the sound after seeking, pausing and muting.

## F. Before saying "done"
- [ ] Look at the page as a security buyer would. Ask: what is this, why should I trust it, what do I do next?
- [ ] Ask: is this the best we can do? If not, fix it before reporting.
- [ ] Report only what was verified, and say what was not.
