/* The AI-SPM globe (WebGL, three.js): your digital ecosystem as a dotted
   globe inside a protective field. Identity signals orbit it; AI-driven and
   identity attacks (the ones Cisco's Identity Intelligence film names, plus
   deepfakes, prompt injection and hijacked agents) fly in from outside and
   are stopped at the field, which ripples where each one lands. Exposes
   start(), stop() and destroy(); onHit(name, x, y) reports each block in
   canvas pixels so the page can label it. */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import LAND from '../components/scenes/land.json';

export const THREATS = ['Stolen credentials', 'Phishing', 'MFA fatigue', 'Compromised session', 'Deepfake voice', 'Prompt injection', 'Hijacked AI agent', 'Credential stuffing bots'];

const R = 1, SHIELD = 1.32;
const v3 = (lat, lon, r = R) => {
  const p = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180;
  return new THREE.Vector3(r * Math.cos(p) * Math.sin(l), r * Math.sin(p), r * Math.cos(p) * Math.cos(l));
};

export function createGlobe(canvas, { onHit, reduced } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x06122e, 1); // opaque, faded into the panel by a CSS mask (bloom and alpha do not mix)
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0, 0.35, 5.4); camera.lookAt(0, 0, 0);

  const world = new THREE.Group(); world.rotation.set(0.3, -0.4, 0); scene.add(world);

  // dotted continents
  const pts = [];
  for (let i = 0; i < LAND.length; i += 2) { const p = v3(LAND[i] / 10, LAND[i + 1] / 10); pts.push(p.x, p.y, p.z); }
  const dotGeo = new THREE.BufferGeometry(); dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const dotMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uSize: { value: 3.4 }, uDpr: { value: 1 } },
    vertexShader: `uniform float uSize; uniform float uDpr; varying float vFace;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vec3 n = normalize(mat3(modelViewMatrix) * position);
        vFace = n.z; gl_PointSize = uSize * uDpr * (4.5 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vFace; void main(){ vec2 c = gl_PointCoord - .5; float d = length(c); if(d > .5) discard;
        float a = smoothstep(.5, .15, d) * smoothstep(-0.15, 0.35, vFace);
        gl_FragColor = vec4(mix(vec3(.12,.32,.85), vec3(.35,.62,1.), smoothstep(.2,.9,vFace)), a * .85); }`,
  });
  world.add(new THREE.Points(dotGeo, dotMat));


  // network: nodes on the surface, joined by arcs that lift off it; a few reach outside
  const NODES = [[52, -10], [28, 77], [40, 116], [-12, -55], [-28, 28], [6, 2], [60, 30], [20, -100], [-35, 140], [12, 45], [-5, 105], [45, -75], [-20, -30], [35, 60]];
  const nodeMat = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  NODES.forEach(([la, lo], i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), nodeMat(i % 5 === 2 ? 0xffb347 : 0x6fb6ff));
    m.position.copy(v3(la, lo, 1.005)); world.add(m);
  });
  const arcMat = new THREE.LineBasicMaterial({ color: 0x4f9bff, transparent: true, opacity: 0.85, toneMapped: false });
  const arc = (a, b, lift) => {
    const A = v3(a[0], a[1], 1.005), B = v3(b[0], b[1], 1.005);
    const M = A.clone().add(B).normalize().multiplyScalar(1 + lift);
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(A, M, B).getPoints(48)), arcMat));
  };
  [[0, 6], [6, 9], [9, 1], [1, 2], [3, 4], [4, 5], [5, 12], [12, 3], [7, 11], [11, 0], [8, 10], [10, 2], [13, 1], [4, 8]].forEach(([i, j], k) => arc(NODES[i], NODES[j], 0.18 + (k % 3) * 0.12));
  // tendrils: arcs from a surface node out past the edge
  [[0, 1.55], [2, 1.6], [3, 1.5], [7, 1.55], [8, 1.45], [13, 1.5]].forEach(([i, r], k) => {
    const A = v3(NODES[i][0], NODES[i][1], 1.005), out = A.clone().normalize().multiplyScalar(r).add(new THREE.Vector3(Math.cos(k * 2.1), Math.sin(k * 1.7), 0).multiplyScalar(0.35));
    const M = A.clone().lerp(out, 0.5).normalize().multiplyScalar(r * 0.95);
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(A, M, out).getPoints(40)), arcMat));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), nodeMat(0x8fc8ff)); tip.position.copy(out); world.add(tip);
  });

  // the globe body: dark, with a blue rim
  const fres = (color, power, alpha, side = THREE.FrontSide) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: power }, uA: { value: alpha }, uPulse: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPow; uniform float uA; uniform float uPulse; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1. - abs(dot(vN, vV)), uPow); gl_FragColor = vec4(uColor, f * (uA + uPulse)); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.995, 64, 48), new THREE.MeshBasicMaterial({ color: 0x040b22, transparent: true, opacity: 0.96 })));
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.01, 64, 48), fres('#3b86ff', 8, 1.0)));
  // the protective field
  const shieldMat = fres('#5aa6ff', 5, 0.0);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(SHIELD, 64, 48), shieldMat));
  const shieldBack = fres('#2e7bff', 6, 0.0, THREE.BackSide);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(SHIELD, 64, 48), shieldBack));

  // orbits with identity signals travelling them
  const orbits = [];
  [[1.55, 0.35, 0.1, 0.42], [1.72, -0.5, 0.9, -0.3], [1.45, 1.25, -0.3, 0.55]].forEach(([r, rx, ry, speed], k) => {
    const g = new THREE.Group(); g.rotation.set(rx, ry, 0); scene.add(g);
    const c = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2).getPoints(160).map((p) => new THREE.Vector3(p.x, 0, p.y));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c), new THREE.LineBasicMaterial({ color: 0x3f86ff, transparent: true, opacity: 0.5, toneMapped: false })));
    const nodes = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), new THREE.MeshBasicMaterial({ color: k === 1 ? 0xffb347 : 0x8fc8ff, toneMapped: false }));
      g.add(m); nodes.push({ m, a: (i / 3) * Math.PI * 2 + k });
    }
    orbits.push({ g, r, speed, nodes });
  });

  // attacks
  const attacks = [], ripples = [];
  const trailMat = () => new THREE.LineBasicMaterial({ color: 0xff4d63, transparent: true, opacity: 1, toneMapped: false });
  let ti = 0;
  const spawn = () => {
    // arrive from around the globe, in view: start outside the frame's ring, land on the field's front half
    const a = Math.random() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.8, 0.55 + Math.random() * 0.35).normalize();
    const from = new THREE.Vector3(Math.cos(a) * 3.4, Math.sin(a) * 2.3, 0.4 + Math.random() * 0.6);
    const hit = dir.clone().multiplyScalar(SHIELD);
    const ctrl = from.clone().lerp(hit, 0.5).add(new THREE.Vector3(-Math.sin(a), Math.cos(a), 0).multiplyScalar(0.6 * (Math.random() < 0.5 ? -1 : 1)));
    const curve = new THREE.QuadraticBezierCurve3(from, ctrl, hit);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff6075, toneMapped: false }));
    const geo = new THREE.BufferGeometry().setFromPoints(new Array(40).fill(from));
    const trail = new THREE.Line(geo, trailMat());
    trail.frustumCulled = false; // its bounds were taken at spawn, off screen
    scene.add(head, trail);
    attacks.push({ curve, head, trail, geo, t: 0, speed: 0.45 + Math.random() * 0.2, name: THREATS[ti++ % THREATS.length], hit, dir });
  };
  const ripple = (pos, dir) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.045, 48), new THREE.MeshBasicMaterial({ color: 0x3f8cff, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos); m.lookAt(pos.clone().add(dir)); scene.add(m); ripples.push({ m, t: 0 });
  };

  // post: bloom
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.25, 0.42); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let w = 0, h = 0;
  const resize = () => {
    const b = canvas.getBoundingClientRect(); w = Math.max(1, b.width); h = Math.max(1, b.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); composer.setPixelRatio(dpr); composer.setSize(w, h);
    dotMat.uniforms.uDpr.value = dpr;
    camera.aspect = w / h;
    // keep the globe a constant share of the shorter side
    camera.position.z = w < h * 1.1 ? 7 : 6;
    camera.updateProjectionMatrix();
  };
  resize();

  let raf = 0, last = 0, next = 0.4, pulse = 0, T = 0;
  const tmp = new THREE.Vector3();
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; T += dt;
    world.rotation.y += dt * 0.08;
    orbits.forEach((o) => o.nodes.forEach((n) => { n.a += dt * o.speed; n.m.position.set(Math.cos(n.a) * o.r, 0, Math.sin(n.a) * o.r); }));
    next -= dt; if (next <= 0) { spawn(); next = 1.1 + Math.random() * 0.7; }
    for (let i = attacks.length - 1; i >= 0; i--) {
      const a = attacks[i];
      if (a.t < 1) {
        a.t = Math.min(1, a.t + dt * a.speed);
        const p = a.curve.getPoint(a.t); a.head.position.copy(p);
        const arr = a.geo.attributes.position.array;
        for (let k = arr.length - 3; k >= 3; k -= 3) { arr[k] = arr[k - 3]; arr[k + 1] = arr[k - 2]; arr[k + 2] = arr[k - 1]; }
        arr[0] = p.x; arr[1] = p.y; arr[2] = p.z; a.geo.attributes.position.needsUpdate = true;
        if (a.t >= 1) {
          ripple(a.hit, a.dir); pulse = 0.45;
          a.head.material.color.set(0x9fd2ff); a.trail.material.color.set(0x7cc0ff);
          if (onHit) { tmp.copy(a.hit).project(camera); onHit(a.name, (tmp.x * 0.5 + 0.5) * w, (1 - (tmp.y * 0.5 + 0.5)) * h); }
        }
      } else {
        a.fade = (a.fade || 0) + dt * 1.6;
        a.trail.material.opacity = Math.max(0, 0.9 - a.fade); a.head.material.transparent = true; a.head.material.opacity = Math.max(0, 1 - a.fade);
        if (a.fade >= 1) { scene.remove(a.head, a.trail); a.geo.dispose(); a.trail.material.dispose(); a.head.geometry.dispose(); a.head.material.dispose(); attacks.splice(i, 1); }
      }
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]; r.t += dt * 1.1; const s = 1 + r.t * 5; r.m.scale.set(s, s, s); r.m.material.opacity = Math.max(0, 1 - r.t);
      if (r.t >= 1) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); ripples.splice(i, 1); }
    }
    pulse = Math.max(0, pulse - dt * 0.9); shieldMat.uniforms.uPulse.value = pulse * 0.5;
    composer.render();
  };

  const ro = new ResizeObserver(() => { resize(); if (!raf) composer.render(); });
  ro.observe(canvas);
  if (reduced) { for (let i = 0; i < 3; i++) frame(performance.now() + i * 16); cancelAnimationFrame(raf); raf = 0; }
  return {
    start() { if (!raf && !reduced) { last = 0; raf = requestAnimationFrame(frame); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); composer.dispose?.(); },
  };
}
