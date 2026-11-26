import { useEffect, useRef } from 'react';

/* The hero background, after the cisco.com hero film: a landscape of silk.
   Hundreds of light fibres lie in rows, back to front, over a slowly moving
   terrain seen in perspective, so where the terrain folds the fibres crowd
   together and the light piles up into bright crests, just as in a render.
   The body is silver-white over blue, with iridescent warm and pink patches
   drifting through; here and there a fibre curls into a loop. Soft bokeh
   floats in the dark above. A bloom pass (blurred copy added back) gives the
   glow. The silk lifts a little under the pointer.

   All geometry is computed on the GPU (WebGL 1, one draw call for ~290k
   vertices). Pauses off screen, on the pause button and in background tabs;
   one still frame for reduced motion; without WebGL the hero keeps its dark
   background.

   It adapts to the machine. Rows are stored interleaved, so drawing the first
   half or quarter still covers the whole landscape evenly. On a software
   renderer (SwiftShader, llvmpipe: common in VDI and locked-down laptops) it
   paints one still frame at a quarter of the rows and stops. On a real GPU it
   times its first frames and steps down (all rows, half, a quarter, then no
   glow) until it holds a smooth rate; if even that is slow it keeps the still
   frame. `soft` is a lighter preset for product heroes, where it sits behind
   the content. */

const ROWS = 600;         // fibres, back to front
const SEGS = 240;         // segments along each fibre
const BOKEH = 46;

const LINE_VS = `
precision highp float;
attribute vec3 a;            // s along the fibre, z depth (0 back, 1 front), seed
uniform float uT;
uniform vec2 uRes;
uniform vec3 uP;             // pointer: s, depth, strength
varying vec3 vC;

float cx2(float t) { return 0.56 + 0.07 * sin(t * 0.05); }

float terrain(float s, float z, float t) {
  float v = 0.3 + 0.6 * smoothstep(-0.15, 1.05, s);                 // rises to the right
  v += 0.22 * sin(s * 3.3 + z * 2.1 + t * 0.13);
  v += 0.14 * sin(s * 7.9 - z * 3.7 - t * 0.21 + 1.3);
  v += 0.07 * sin(s * 15.0 + z * 6.3 + t * 0.31);
  v += 0.05 * sin(s * 23.0 - z * 17.0 + t * 0.4) * smoothstep(0.3, 0.8, s);   // fibres crossing in the crest
  v += 0.10 * sin(z * 5.0 - t * 0.17 + s * 1.7);
  // a great slow crest, centre right, that wanders and breathes
  float cx = 0.56 + 0.07 * sin(t * 0.05) + 0.05 * sin(z * 2.3 + t * 0.08);
  v += 0.55 * exp(-pow((s - cx) * 4.2, 2.0)) * (0.65 + 0.35 * sin(z * 3.1 + t * 0.11));
  v += uP.z * 0.32 * exp(-pow((s - uP.x) * 5.5, 2.0)) * (0.4 + 0.6 * z);   // lifts under the pointer
  return v;
}

void main() {
  float s = a.x, z = a.y, seed = a.z, t = uT;
  float W = uRes.x, H = uRes.y;
  float hv = terrain(s, z, t);
  // rows fan out from the crest (back) down to the bottom edge (front), so the silk fills the lower hero
  float ground = H * (1.02 - 0.4 * (1.0 - z));
  float amp = H * (0.32 - 0.13 * z);
  float x = (s * 1.24 - 0.12) * W;
  float y = ground - hv * amp;

  // here and there a fibre curls into a loop
  float env = pow(0.5 + 0.5 * sin(s * 2.7 + z * 4.3 - t * 0.09 + seed * 0.7), 4.0) * smoothstep(0.25, 0.6, s);
  float ph = s * 60.0 + z * 13.0 + t * 0.9;
  float rad = H * 0.075 * env * (0.35 + z);
  x += cos(ph) * rad;
  y += sin(ph) * rad * 0.8;

  // light: brightest on slopes facing up and to the left, and on the curls
  float d = (terrain(s + 0.004, z, t) - hv) / 0.004;
  float light = 0.48 + 0.52 * smoothstep(-0.9, 1.6, d * 0.7 + 0.35);
  float near = 0.3 + 0.7 * z;
  float fadeL = 0.22 + 0.78 * smoothstep(0.08, 0.5, s);             // calmer under the headline
  float fadeB = 1.0 - smoothstep(0.97, 1.06, y / H);
  float b = light * near * fadeL * fadeB * (1.0 + env * 1.6);

  // silver-white body, blue in the shade, iridescent warm and pink patches drifting through
  vec3 col = mix(vec3(0.42, 0.58, 1.0), vec3(0.93, 0.95, 1.0), smoothstep(0.35, 0.95, light));
  float warm = smoothstep(0.62, 0.98, (0.5 + 0.5 * sin(s * 2.2 - t * 0.07 + z * 1.9)) * (0.5 + 0.5 * sin(s * 1.1 + z * 0.7 + t * 0.05 + 2.0)) * 1.6);
  col = mix(col, vec3(1.0, 0.6, 0.34), warm * 0.7);
  col = mix(col, vec3(1.0, 0.72, 0.5), 0.35 * exp(-pow((s - cx2(t)) * 6.0, 2.0)) * smoothstep(0.5, 1.0, light));   // a warm core in the crest
  float pink = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(s * 1.7 + z * 3.1 + t * 0.06 + 4.0));
  col = mix(col, vec3(0.92, 0.52, 0.95), pink * 0.3 * (1.0 - z));
  vC = col * b;

  vec2 p = vec2(x, y) / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}`;
const LINE_FS = `
precision highp float;
uniform float uA;
varying vec3 vC;
void main() { gl_FragColor = vec4(vC * uA, 1.0); }`;

const DOT_VS = `
precision highp float;
attribute vec3 a;            // x, y (0..1), seed
uniform float uT;
uniform vec2 uRes;
uniform float uDpr;
varying vec3 vC;
varying float vA;
void main() {
  float sd = a.z;
  vec2 q = vec2(fract(a.x + uT * (0.004 + 0.006 * sd)), a.y + 0.03 * sin(uT * 0.3 + sd * 20.0));
  float big = step(0.82, fract(sd * 7.1));
  gl_PointSize = uDpr * mix(2.0 + 4.0 * fract(sd * 3.3), 12.0 + 14.0 * fract(sd * 5.7), big);
  vA = (0.35 + 0.65 * pow(0.5 + 0.5 * sin(uT * (0.5 + sd) + sd * 30.0), 2.0)) * mix(1.0, 0.35, big) * smoothstep(0.1, 0.45, q.x);
  float h = fract(sd * 11.3);
  vC = h < 0.33 ? vec3(1.0, 0.55, 0.8) : h < 0.66 ? vec3(0.85, 0.9, 1.0) : vec3(0.55, 0.7, 1.0);
  vec2 p = q * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
}`;
const DOT_FS = `
precision highp float;
varying vec3 vC;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float g = smoothstep(1.0, 0.0, r);
  gl_FragColor = vec4(vC * g * g * vA, 1.0);
}`;

const QUAD_VS = `
attribute vec2 a;
varying vec2 vU;
void main() { vU = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;
const BLUR_FS = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
varying vec2 vU;
void main() {
  vec3 c = texture2D(uTex, vU).rgb * 0.2270;
  c += (texture2D(uTex, vU + uDir * 1.385).rgb + texture2D(uTex, vU - uDir * 1.385).rgb) * 0.3162;
  c += (texture2D(uTex, vU + uDir * 3.231).rgb + texture2D(uTex, vU - uDir * 3.231).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}`;
const COMP_FS = `
precision highp float;
uniform sampler2D uBase;
uniform sampler2D uBloom;
uniform float uGlow;
varying vec2 vU;
void main() {
  vec3 c = texture2D(uBase, vU).rgb + texture2D(uBloom, vU).rgb * uGlow;
  c = 1.0 - exp(-c * 1.35);                                   // soft highlights, like film
  c += vec3(0.008, 0.016, 0.04);                              // the hero's night blue
  gl_FragColor = vec4(c, 1.0);
}`;

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

export default function HeroWave({ paused, soft = false }) {
  const ref = useRef(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const gl = cv.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = rng(11);

    const prog = (vs, fs) => {
      const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
      const u = new Proxy({}, { get: (o, n) => (o[n] ??= gl.getUniformLocation(p, n)) });
      return { p, u, a: gl.getAttribLocation(p, 'a') };
    };
    const P = { line: prog(LINE_VS, LINE_FS), dot: prog(DOT_VS, DOT_FS), blur: prog(QUAD_VS, BLUR_FS), comp: prog(QUAD_VS, COMP_FS) };
    if (Object.values(P).some((x) => !x)) return undefined;

    // geometry: fibres as gl.LINES pairs, bokeh points, one full-screen quad
    const narrow = cv.clientWidth < 700;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
    const rows = narrow || soft ? 300 : ROWS, segs = narrow || soft ? 160 : SEGS;
    // rows interleaved (0, 4, 8 … 2, 6 … 1, 3 …): any leading share of them spans the whole depth
    const order = [0, 2, 1, 3].flatMap((o) => Array.from({ length: Math.ceil((rows - o) / 4) }, (_, j) => o + j * 4)).filter((i) => i < rows);
    const lines = new Float32Array(rows * segs * 2 * 3);
    let k = 0;
    for (const i of order) {
      const z = Math.min(1, Math.max(0, i / (rows - 1) + (r() - 0.5) * 0.004)), seed = r();
      for (let j = 0; j < segs; j++) {
        lines[k++] = j / segs; lines[k++] = z; lines[k++] = seed;
        lines[k++] = (j + 1) / segs; lines[k++] = z; lines[k++] = seed;
      }
    }
    const buf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
    const lineBuf = buf(lines);
    const dots = new Float32Array(BOKEH * 3);
    for (let i = 0; i < BOKEH; i++) { dots[i * 3] = r(); dots[i * 3 + 1] = 0.08 + r() * 0.55; dots[i * 3 + 2] = r(); }
    const dotBuf = buf(dots);
    const quadBuf = buf(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));

    // render targets: the scene at full size, the glow at a quarter
    const target = (w, h) => {
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fb, w, h };
    };
    let base, bA, bB;
    const free = () => { for (const t of [base, bA, bB]) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } };

    let W = 0, H = 0, dpr = 1, raf = 0, visible = true, last = performance.now(), t = 30;
    // quality: share of rows drawn and whether the glow pass runs; lowered while the frame rate is poor
    let share = software ? 0.25 : 1, glow = !software;
    const times = [];
    const m = { s: 0.7, z: 0.6, k: 0, ts: 0.7, tk: 0 };
    const resize = () => {
      // CSS pixels (clientWidth): the site zooms html on laptops
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
      free();
      base = target(cv.width, cv.height);
      bA = target(Math.max(1, cv.width >> 2), Math.max(1, cv.height >> 2));
      bB = target(bA.w, bA.h);
    };
    const quad = (pr) => { gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.enableVertexAttribArray(pr.a); gl.vertexAttribPointer(pr.a, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };

    const draw = () => {
      // 1 · the silk and the bokeh, added together
      gl.bindFramebuffer(gl.FRAMEBUFFER, base.fb); gl.viewport(0, 0, base.w, base.h);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      const L = P.line; gl.useProgram(L.p);
      gl.uniform1f(L.u.uT, t); gl.uniform2f(L.u.uRes, W, H); gl.uniform3f(L.u.uP, m.s, m.z, m.k);
      gl.uniform1f(L.u.uA, (narrow ? 0.15 : 0.105) * Math.min(dpr, 1.5) / Math.sqrt(share) * (soft ? 0.85 : 1));
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.enableVertexAttribArray(L.a); gl.vertexAttribPointer(L.a, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, Math.round(rows * share) * segs * 2);
      const D = P.dot; gl.useProgram(D.p);
      gl.uniform1f(D.u.uT, t); gl.uniform2f(D.u.uRes, W, H); gl.uniform1f(D.u.uDpr, dpr);
      gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf); gl.enableVertexAttribArray(D.a); gl.vertexAttribPointer(D.a, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, BOKEH);
      gl.disable(gl.BLEND);
      // 2 · glow: blur a quarter-size copy, across then down
      if (!glow) { gl.bindFramebuffer(gl.FRAMEBUFFER, bB.fb); gl.viewport(0, 0, bB.w, bB.h); gl.clear(gl.COLOR_BUFFER_BIT); }
      const B = P.blur;
      if (glow) { gl.useProgram(B.p); gl.uniform1i(B.u.uTex, 0); gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bA.fb); gl.viewport(0, 0, bA.w, bA.h);
      gl.bindTexture(gl.TEXTURE_2D, base.tex); gl.uniform2f(B.u.uDir, 1 / bA.w, 0); quad(B);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bB.fb);
      gl.bindTexture(gl.TEXTURE_2D, bA.tex); gl.uniform2f(B.u.uDir, 0, 1 / bA.h); quad(B);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bA.fb);
      gl.bindTexture(gl.TEXTURE_2D, bB.tex); gl.uniform2f(B.u.uDir, 2 / bA.w, 0); quad(B);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bB.fb);
      gl.bindTexture(gl.TEXTURE_2D, bA.tex); gl.uniform2f(B.u.uDir, 0, 2 / bA.h); quad(B);
      }
      // 3 · the picture: scene plus glow
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height);
      const C = P.comp; gl.useProgram(C.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, base.tex); gl.uniform1i(C.u.uBase, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bB.tex); gl.uniform1i(C.u.uBloom, 1);
      gl.uniform1f(C.u.uGlow, 2.1);
      quad(C);
      gl.activeTexture(gl.TEXTURE0);
    };
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const gap = now - last;
      const dt = Math.min(0.05, gap / 1000); last = now;
      if (pausedRef.current || !visible || document.hidden) return;
      t += dt;
      const e = Math.min(1, dt * 2.2);
      m.s += (m.ts - m.s) * e; m.k += (m.tk - m.k) * e;
      draw();
      // keep the frame rate: step quality down while the frames come too slowly (under ~45 fps)
      if (gap < 200) times.push(gap);
      if (times.length === 30) {
        const med = times.sort((a, b) => a - b)[15];
        times.length = 0;
        if (med > 22) {
          if (share > 0.25) share /= 2;
          else if (glow) glow = false;
          else { cancelAnimationFrame(raf); raf = 0; }      // the still frame stays
        }
      }
    };
    const host = cv.parentElement;
    const onMove = (ev) => { const b = cv.getBoundingClientRect(); m.ts = (ev.clientX - b.left) / b.width * 0.8 + 0.1; m.tk = 1; };
    const onLeave = () => { m.tk = 0; };

    resize(); draw();
    const ro = new ResizeObserver(() => { resize(); draw(); }); ro.observe(cv);
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }); io.observe(cv);
    if (!reduce && !software) {
      raf = requestAnimationFrame(tick);
      host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave);
    }
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave);
      free(); gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return <canvas ref={ref} className="dx-hero-cv" aria-hidden="true" />;
}
