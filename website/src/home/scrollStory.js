/* The home page's scroll choreography, after the motion language of premium
   infrastructure sites (Gcore's Inference page): every move is tied to the
   reader's scroll, eased, and finished before it gets in the way.

   1  hero words rise one by one when the intro lifts
   2  section titles: words sharpen out of a blur and rise, in turn
   3  the white products panel grows from an inset card to the full width
   4  the posture screen rises and scales up into place
   5  cards settle in one after another
   6  the certifications panel slides up over the dark page like a sheet
   7  the closing call glows up from a horizon

   GSAP and ScrollTrigger load after first paint; reduced motion gets the
   finished page. Smooth scrolling (Lenis) drives ScrollTrigger directly. */
import { onSmoothScroll } from '../lib/smooth.js';

const words = (el) => {
  if (el.dataset.split) return el.querySelectorAll('.sw > span');
  el.dataset.split = '1';
  const txt = el.textContent;
  el.setAttribute('aria-label', txt);
  el.innerHTML = txt.split(/(\s+)/).map((w) => (/^\s+$/.test(w) ? w : `<span class="sw" aria-hidden="true"><span>${w}</span></span>`)).join('');
  return el.querySelectorAll('.sw > span');
};

export async function startScrollStory(root) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
  gsap.registerPlugin(ScrollTrigger);
  const off = onSmoothScroll(() => ScrollTrigger.update());
  const ctx = gsap.context(() => {
    // 1 hero: after the intro (or at once when there is none)
    const hero = root.querySelector('#hero-h');
    if (hero) {
      const w = words(hero);
      const play = () => gsap.fromTo(w, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.1, ease: 'expo.out', stagger: 0.045 });
      gsap.set(w, { yPercent: 110, opacity: 0 });
      if (document.documentElement.classList.contains('intro-on')) window.addEventListener('da:intro-done', () => setTimeout(play, 250), { once: true });
      else play();
    }

    // 2 titles
    root.querySelectorAll('.dx-h2, .ai-big').forEach((h) => {
      const w = words(h);
      gsap.fromTo(w, { yPercent: 60, opacity: 0, filter: 'blur(10px)' }, {
        yPercent: 0, opacity: 1, filter: 'blur(0px)', duration: 1, ease: 'power3.out', stagger: 0.05,
        scrollTrigger: { trigger: h, start: 'top 85%', once: true },
      });
    });

    // 3 the white panel grows to full width
    root.querySelectorAll('.grow-panel').forEach((p) => {
      gsap.fromTo(p, { clipPath: 'inset(6% 5% 0% 5% round 36px)' }, {
        clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
        scrollTrigger: { trigger: p, start: 'top 95%', end: 'top 20%', scrub: 0.6 },
      });
    });

    // 4 the posture screen rises into place
    root.querySelectorAll('.gx').forEach((g) => {
      gsap.fromTo(g, { y: 120, scale: 0.86, opacity: 0.2 }, {
        y: 0, scale: 1, opacity: 1, ease: 'none',
        scrollTrigger: { trigger: g, start: 'top 100%', end: 'top 35%', scrub: 0.6 },
      });
    });

    // 5 cards, in turn
    root.querySelectorAll('.pr-grid, .in-grid, .rs-grid, .ce-grid, .dx-logos').forEach((grid) => {
      gsap.fromTo(grid.children, { y: 48, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.08,
        scrollTrigger: { trigger: grid, start: 'top 88%', once: true },
      });
    });
    root.querySelectorAll('.pr-visual, .px-feature').forEach((m) => {
      gsap.fromTo(m, { y: 80, scale: 0.94, opacity: 0 }, {
        y: 0, scale: 1, opacity: 1, ease: 'none',
        scrollTrigger: { trigger: m, start: 'top 98%', end: 'top 50%', scrub: 0.6 },
      });
    });

    // 6 the sheet slides up over the dark page
    root.querySelectorAll('.sheet-up').forEach((s) => {
      gsap.fromTo(s, { y: 140 }, {
        y: 0, ease: 'none',
        scrollTrigger: { trigger: s, start: 'top 100%', end: 'top 30%', scrub: 0.6 },
      });
    });

    // 7 the closing glow
    root.querySelectorAll('.cta-glow').forEach((c) => {
      gsap.fromTo(c, { opacity: 0, scaleY: 0.4 }, {
        opacity: 1, scaleY: 1, ease: 'none', transformOrigin: '50% 100%',
        scrollTrigger: { trigger: c.parentElement, start: 'top 90%', end: 'top 30%', scrub: 0.6 },
      });
    });
  }, root);
  ScrollTrigger.refresh();
  return () => { off(); ctx.revert(); };
}
