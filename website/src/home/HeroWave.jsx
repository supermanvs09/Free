import { useEffect, useRef } from 'react';

/* The hero background: a ribbon of silk-fine light strands that twists
   through space (the cisco.com hero idea, made ours). The ribbon is a real
   surface: every strand is a line across it, and as the ribbon turns edge-on
   the strands crowd together and the light builds up, so it has form, depth
   and highlights rather than a flat wobble. All of it is computed on the GPU
   (WebGL, ~100k vertices, one draw call), so it can be dense and smooth.
   Signals travel along the strands: blue-white for identities moving through
   the network, now and then an amber one, flagged. The ribbon leans gently
   towards the pointer. Pauses off screen, on the pause button and in
   background tabs; one still frame for reduced motion. Without WebGL the
   hero keeps its dark background. */

const STRANDS = 320;      // lines across the ribbon
const SEGS = 180;         // segments along each line
const SIGNALS = 14;

const VS = `
precision highp float;
attribute vec3 a;            // s along the ribbon, v across it, seed
uniform float uT;
uniform vec2 uRes;
uniform vec2 uM;             // pointer, 0..1, eased
uniform float uMode;         // 0 strands, 1 signals
uniform float uSize;
varying float vB;            // brightness
varying vec3 vC;             // colour
varying float vS;

const float PI = 3.14159265;

// the ribbon: centre line, half width, twist; returns screen xy, depth and edge-on factor
vec4 ribbon(float s, float v, float layer) {
  float t = uT + layer * 11.0;
  float W = uRes.x, H = uRes.y;
  float x = mix(-0.08, 1.08, s) * W;
  // a long sweep up to the right, breathing slowly
  float rise = smoothstep(-0.1, 1.05, s);
  float yc = H * (0.84 - 0.46 * rise)
           + H * 0.07 * sin(s * 5.2 - t * 0.12 + layer * 2.0)
           + H * 0.035 * sin(s * 11.0 + t * 0.2);
  // the pointer pulls the ribbon a little towards it
  float pull = exp(-pow((s - uM.x) * 3.2, 2.0));
  yc += (uM.y - 0.55) * H * 0.12 * pull;
  float w = H * (0.07 + 0.3 * smoothstep(0.0, 0.9, s)) * (0.8 + 0.2 * sin(s * 4.0 + t * 0.17)) * (1.0 - layer * 0.35);
  float th = s * (4.0 + layer * 1.5) + t * 0.22 + 0.9 * sin(s * 3.1 - t * 0.11) + layer * 1.3;
  float c = cos(th), sn = sin(th);
  // a gentle ruffle across the width, like silk
  float ruffle = 0.12 * sin(v * 6.0 + s * 9.0 + t * 0.5) * (0.4 + 0.6 * s);
  float y = yc + (v * c + ruffle * sn) * w;
  float depth = v * sn;
  x += depth * w * 0.35;
  return vec4(x, y, depth, abs(c));
}

void main() {
  float s, v, seed, layer;
  if (uMode < 0.5) {
    s = a.x; v = a.y; seed = a.z;
    layer = step(0.78, fract(seed * 7.13));        // about a fifth of the strands on a second ribbon behind
  } else {
    seed = a.z; v = a.y;
    layer = 0.0;
    s = fract(a.x + uT * (0.028 + 0.02 * fract(seed * 3.7)));
  }
  vec4 r = ribbon(s, v, layer);
  vec2 p = r.xy / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);

  float edgeOn = 1.0 - r.w;                         // 1 where the ribbon is seen edge-on
  float light = 0.5 + 0.5 * pow(edgeOn, 1.4);
  float rim = 0.75 + 0.25 * abs(v);                 // the ribbon's edges catch a little more light
  float near = 0.72 + 0.28 * r.z;                   // the near side is brighter
  float fadeL = smoothstep(0.02, 0.42, s);          // quiet under the headline
  float fadeR = 1.0 - smoothstep(0.97, 1.08, s);
  vB = light * rim * near * fadeL * fadeR * (1.0 - layer * 0.45);

  // deep blue in the body, cyan as it brightens, white at the crest
  vec3 deep = vec3(0.10, 0.32, 0.95), cyan = vec3(0.30, 0.78, 1.0), white = vec3(0.88, 0.95, 1.0);
  vec3 col = mix(deep, cyan, smoothstep(0.25, 0.7, light));
  col = mix(col, white, smoothstep(0.78, 1.0, light) * 0.8);
  if (fract(seed * 13.7) < 0.025) col = vec3(1.0, 0.68, 0.32);   // a few amber threads
  vC = col;
  vS = 0.0;

  if (uMode > 0.5) {
    float life = sin(s * PI);
    vB = life * smoothstep(0.08, 0.3, s);
    vS = step(0.9, fract(seed * 5.3));             // amber: flagged
    vC = mix(vec3(0.78, 0.92, 1.0), vec3(1.0, 0.7, 0.35), vS);
    gl_PointSize = uSize * (0.7 + 0.6 * fract(seed * 9.1)) * (0.6 + 0.4 * life);
  }
}`;

const FS = `
precision highp float;
uniform float uMode;
uniform float uA;
varying float vB;
varying vec3 vC;
varying float vS;
void main() {
  if (uMode > 0.5) {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float g = exp(-r * r * 5.0) * 0.55 + exp(-r * r * 60.0);
    gl_FragColor = vec4(vC * g * vB, 1.0);
  } else {
    gl_FragColor = vec4(vC * vB * uA, 1.0);
  }
}`;

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

export default function HeroWave({ paused }) {
  const ref = useRef(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const gl = cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = rng(11);

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return undefined;
    gl.useProgram(prog);
    const U = Object.fromEntries(['uT', 'uRes', 'uM', 'uMode', 'uSize', 'uA'].map((n) => [n, gl.getUniformLocation(prog, n)]));
    const aLoc = gl.getAttribLocation(prog, 'a');

    // strands, as pairs of points (gl.LINES), one buffer, one draw call
    const lines = new Float32Array(STRANDS * SEGS * 2 * 3);
    let k = 0;
    for (let i = 0; i < STRANDS; i++) {
      const v = (i / (STRANDS - 1)) * 2 - 1 + (r() - 0.5) * 0.004;
      const seed = r();
      for (let j = 0; j < SEGS; j++) {
        lines[k++] = j / SEGS; lines[k++] = v; lines[k++] = seed;
        lines[k++] = (j + 1) / SEGS; lines[k++] = v; lines[k++] = seed;
      }
    }
    const lineBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
    const pts = new Float32Array(SIGNALS * 3);
    for (let i = 0; i < SIGNALS; i++) { pts[i * 3] = r(); pts[i * 3 + 1] = r() * 2 - 1; pts[i * 3 + 2] = i === 4 ? 0.95 / 5.3 + 0 : r() * 0.85; }
    const ptBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf); gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STATIC_DRAW);

    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);   // additive: crossings glow
    gl.clearColor(0, 0, 0, 0);

    let W = 0, H = 0, dpr = 1, raf = 0, visible = true, last = performance.now(), t = 24;
    const m = { x: 0.7, y: 0.55, tx: 0.7, ty: 0.55 };
    const resize = () => {
      const b = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = b.width; H = b.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      gl.viewport(0, 0, cv.width, cv.height);
    };
    const draw = () => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.uT, t); gl.uniform2f(U.uRes, W, H); gl.uniform2f(U.uM, m.x, m.y);
      // fewer, brighter strands on narrow screens
      const narrow = W < 700;
      gl.uniform1f(U.uA, (narrow ? 0.4 : 0.28) * Math.min(dpr, 1.6) / 1.3);
      gl.uniform1f(U.uMode, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf); gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, (narrow ? STRANDS / 2 : STRANDS) * SEGS * 2);
      gl.uniform1f(U.uMode, 1); gl.uniform1f(U.uSize, 26 * dpr);
      gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf); gl.vertexAttribPointer(aLoc, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, SIGNALS);
    };
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (pausedRef.current || !visible || document.hidden) return;
      t += dt;
      m.x += (m.tx - m.x) * Math.min(1, dt * 1.8); m.y += (m.ty - m.y) * Math.min(1, dt * 1.8);
      draw();
    };
    const onMove = (e) => {
      const b = cv.getBoundingClientRect();
      m.tx = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width));
      m.ty = Math.min(1, Math.max(0, (e.clientY - b.top) / b.height));
    };
    const onLeave = () => { m.tx = 0.7; m.ty = 0.55; };

    resize(); draw();
    const ro = new ResizeObserver(() => { resize(); draw(); }); ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(cv);
    const host = cv.parentElement;
    if (!reduce) {
      raf = requestAnimationFrame(tick);
      host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave);
    }
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return <canvas ref={ref} className="dx-hero-cv" aria-hidden="true" />;
}
