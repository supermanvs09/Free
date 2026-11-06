/* Injected before any page script. Replaces the page's clocks (performance.now,
   Date.now, requestAnimationFrame, timers) with a virtual clock that only moves
   when the recorder calls window.__frame(dt), and steps every CSS animation,
   transition and SVG (SMIL) animation to that clock. Each recorded frame is therefore exact, however long
   the screenshot takes. Scroll-driven animations keep their scroll timeline. */
(() => {
  const realSetTimeout = window.setTimeout.bind(window);
  const t0 = Date.now();
  let vt = 0;
  performance.now = () => vt;
  Date.now = () => t0 + vt;

  let raf = new Map(), rafId = 0;
  window.requestAnimationFrame = (cb) => { raf.set(++rafId, cb); return rafId; };
  window.cancelAnimationFrame = (id) => { raf.delete(id); };

  const timers = new Map(); let tid = 0;
  window.setTimeout = (cb, ms = 0, ...a) => { timers.set(++tid, { at: vt + Math.max(0, +ms || 0), cb, a }); return tid; };
  window.setInterval = (cb, ms = 0, ...a) => { const every = Math.max(1, +ms || 0); timers.set(++tid, { at: vt + every, cb, a, every }); return tid; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };

  const start = new WeakMap(), ours = new WeakSet();
  const tick = () => new Promise((r) => realSetTimeout(r, 4));

  function runTimers(end) {
    for (let guard = 0; guard < 10000; guard++) {
      let next = null, nid = 0;
      for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next.at)) { next = t; nid = id; }
      if (!next) break;
      vt = Math.max(vt, next.at);
      if (next.every) next.at += next.every; else timers.delete(nid);
      try { typeof next.cb === 'function' ? next.cb(...next.a) : 0; } catch (e) { console.error(e); }
    }
    vt = end;
  }
  function stepAnimations() {
    for (const a of document.getAnimations()) {
      if (a.timeline && a.timeline !== document.timeline) continue; // scroll-driven
      if (!start.has(a)) {
        if (a.playState === 'paused' && !ours.has(a)) continue; // paused by the page (e.g. hover)
        start.set(a, vt); // starts on the next recorded frame, however long loading took
      }
      if (a.playState === 'paused' && !ours.has(a)) continue;
      if (a.playState === 'finished') continue;
      a.pause(); ours.add(a);
      a.currentTime = vt - start.get(a);
    }
    // SVG (SMIL) motion: particles along graph edges run on each <svg>'s own clock
    for (const svg of document.querySelectorAll('svg')) {
      if (svg.ownerSVGElement || !svg.querySelector('animate, animateMotion, animateTransform')) continue;
      svg.pauseAnimations(); svg.setCurrentTime(vt / 1000);
    }
  }
  window.__vt = () => vt;
  /* move the clock without recording (while a page or chunk loads) */
  window.__idle = (dt) => { runTimers(vt + dt); const q = raf; raf = new Map(); q.forEach((cb) => { try { cb(vt); } catch (e) { console.error(e); } }); };
  /* advance dt ms; optionally scroll first so scroll handlers see the new position */
  window.__frame = async (dt, scrollY) => {
    runTimers(vt + dt);
    if (scrollY != null && Math.abs(window.scrollY - scrollY) > 0.1) {
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    }
    const q = raf; raf = new Map();
    q.forEach((cb) => { try { cb(vt); } catch (e) { console.error(e); } });
    await tick(); await tick();   // let React commit what the timers and frames scheduled
    stepAnimations();
    return vt;
  };
})();
