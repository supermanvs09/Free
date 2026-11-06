/* Runtime: preload, render(t) for the frame renderer, grain and the global dip. */
(function () {
  const grain = document.getElementById('grain'), gg = grain.getContext('2d');
  const tiles = [0, 1, 2, 3].map((s) => {
    const c = document.createElement('canvas'); c.width = 960; c.height = 540;
    const x = c.getContext('2d'), d = x.createImageData(960, 540), r = rng(s + 3);
    for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (r() - 0.5) * 70; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); return c;
  });
  const dip = document.getElementById('dip');
  async function render(t) {
    for (const s of SCENES) {
      const on = t >= s.a && t < s.b;
      S(s.root, { display: on ? 'block' : 'none' });
      if (on) s.update(t);
    }
    const f = Math.round(t * FPS);
    gg.drawImage(tiles[f % 4], -(f * 37) % 200, -(f * 53) % 120, 1160, 660);
    S(dip, { opacity: Math.max(1 - seg(t, 0.0, 0.5), E.inOutSine(seg(t, 119.4, 120))).toFixed(3) });
    const imgs = [...document.images].filter((i) => i.offsetParent !== null && !i.complete);
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    await document.fonts.ready;
  }
  async function ready() {
    const ps = []; for (const i of document.images) ps.push(i.decode().catch(() => {}));
    await Promise.all(ps); await document.fonts.ready;
    for (const f of ['600 70px "Inter Display"', '500 24px Inter', '600 20px Inter', '400 20px Inter', '500 20px "JetBrains Mono"']) await document.fonts.load(f);
  }
  window.FILM = { duration: DURATION, fps: FPS, render, ready: ready(), events: () => EVENTS.slice().sort((a, b) => a.t - b.t) };
  const q = new URLSearchParams(location.search);
  if (q.has('t')) window.FILM.ready.then(() => render(+q.get('t')));
})();
