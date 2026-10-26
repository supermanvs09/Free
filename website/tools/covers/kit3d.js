import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* Soft 3D object kit for covers, the film and the hero loop.
   Layout is authored in SVG units on an 800 x 500 canvas (the same numbers the
   site's text overlay uses); 100 SVG units = 1 world unit. */
export const U = 100;
export const wx = (sx) => (sx - 400) / U;
export const wy = (sy) => (250 - sy) / U;
export const BG = { navy: ['#1246a0', '#0a2a5e'], ink: ['#0e2a52', '#06132b'], blue: ['#2f89ee', '#1666c8'], coral: ['#df5b3f', '#a8341d'], light: ['#f4f9ff', '#e2eefb'] };
const CORAL = '#f0644d';

let LOGOS = {};
export async function loadAssets() {
  LOGOS = await (await fetch('./logos.json')).json();
  await Promise.all([document.fonts.load('500 80px HK'), document.fonts.load('300 80px HK'), document.fonts.load('600 40px IN'), document.fonts.load('400 40px IN')]);
}
const isDark = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.2; };
const TEXT_MARKS = { aws: ['aws', '#232f3e'], ad: ['AD', '#0067b8'], m365: ['M365', '#d83b01'] };

export function logoTex(name, fill) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const L = LOGOS[name];
  if (L) { g.scale(512 / (L.vb || 24), 512 / (L.vb || 24)); g.fillStyle = fill || (isDark(L.hex) ? '#0b1220' : L.hex); g.fill(new Path2D(L.path)); }
  else if (TEXT_MARKS[name]) { const [t, col] = TEXT_MARKS[name]; g.fillStyle = fill || col; g.font = `700 ${t.length > 3 ? 190 : 300}px IN`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 256, 270); }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; return tx;
}
export function textTex(text, { w = 1024, h = 256, size = 150, color = '#0f56b8', weight = 500, font = 'HK', grad } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.font = `${weight} ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = `${-size * 0.02}px`;
  if (grad) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, grad[0]); gr.addColorStop(1, grad[1]); g.fillStyle = gr; } else g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + size * 0.04);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; return tx;
}
const basicTex = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, depthWrite: false, ...extra });
export const gloss = (c = '#ffffff', o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9, ...o });
const shadowy = (m) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = true; } }); return m; };

/* A glossy app tile carrying a brand mark. size in SVG units. */
export function Tile3D(name, size = 110, { bg = '#ffffff', fill } = {}) {
  const s = size / U, d = s * 0.3, g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(s, s, d, 10, s * 0.26), gloss(bg, { roughness: 0.16 })));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.6, s * 0.6), basicTex(logoTex(name, fill)));
  m.position.z = d / 2 + 0.004; g.add(m);
  return shadowy(g);
}

/* Glossy pill chip with a label, lifted off the page on a darker lip. */
export const THEMES = { base: { top: '#f3f8ff', lip: '#1d4fa6', text: ['#1a6bd1', '#0c4aa8'] }, risk: { top: '#fff1ee', lip: '#c4432b', text: ['#e0482c', '#a8341d'] }, fix: { top: '#ecfbf2', lip: '#17803f', text: ['#1fa35a', '#0f6f38'] }, dark: { top: '#0f2a52', lip: '#06142e', text: ['#ffffff', '#cfe3ff'] } };
export function Chip3D(text, w = 360, h = 108, size, theme = 'base') {
  const T = THEMES[theme];
  const W = w / U, H = h / U, D = H * 0.34, g = new THREE.Group();
  const shape = (inset = 0) => { const s = new THREE.Shape(), r = H / 2 - inset, x0 = -W / 2 + H / 2, x1 = W / 2 - H / 2; s.moveTo(x0, -r); s.lineTo(x1, -r); s.absarc(x1, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(x0, r); s.absarc(x0, 0, r, Math.PI / 2, Math.PI * 1.5, false); return s; };
  const ext = (inset, depth, mat, bevel) => new THREE.Mesh(new THREE.ExtrudeGeometry(shape(inset), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 10, curveSegments: 48 }), mat);
  const lip = ext(0, D, gloss(T.lip, { roughness: 0.3 }), 0.035); lip.position.set(0, -0.12, -0.06); g.add(lip);
  const top = ext(0, D, gloss(T.top, { roughness: 0.14 }), 0.05); g.add(top);
  const pw = W * 0.92, ph = H * 0.8;
  const tx = textTex(text, { w: 1400, h: Math.round(1400 * ph / pw), size: (size || h * 0.5) * (1400 / (pw * U)) * 1.0, grad: T.text });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), basicTex(tx)); m.position.z = D + 0.06; g.add(m);
  return shadowy(g);
}

/* Four-point sparkle. */
export function Sparkle3D(color = CORAL, s = 1) {
  const sh = new THREE.Shape(), k = 0.22 * s;
  sh.moveTo(0, k); sh.bezierCurveTo(0.02 * s, 0.09 * s, 0.09 * s, 0.02 * s, k, 0); sh.bezierCurveTo(0.09 * s, -0.02 * s, 0.02 * s, -0.09 * s, 0, -k); sh.bezierCurveTo(-0.02 * s, -0.09 * s, -0.09 * s, -0.02 * s, -k, 0); sh.bezierCurveTo(-0.09 * s, 0.02 * s, -0.02 * s, 0.09 * s, 0, k);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.04 * s, bevelEnabled: true, bevelThickness: 0.02 * s, bevelSize: 0.02 * s, bevelSegments: 5, curveSegments: 24 }), gloss(color, { roughness: 0.3 }));
  m.castShadow = true; return m;
}

/* Our agent mascot: a soft coral bot. */
export function Mascot3D({ shades = false } = {}) {
  const g = new THREE.Group(), coral = gloss(CORAL, { roughness: 0.42, clearcoat: 0.5, sheen: 1, sheenColor: new THREE.Color('#ffc2b6') });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.66, 64, 48), coral); body.scale.set(1, 1.06, 0.86); g.add(body);
  for (const sx of [-1, 1]) { const a = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 24), coral); a.scale.set(0.8, 1.2, 0.8); a.position.set(sx * 0.72, -0.06, 0.04); a.rotation.z = sx * -0.25; g.add(a); const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.1, 8, 16), gloss('#e5533b', { roughness: 0.5 })); f.position.set(sx * 0.27, -0.74, 0.08); g.add(f); }
  const eye = gloss('#0a1f3d', { roughness: 0.15, clearcoat: 1 });
  if (shades) { const sg = new THREE.Mesh(new RoundedBoxGeometry(1.02, 0.28, 0.14, 6, 0.1), eye); sg.position.set(0, 0.1, 0.54); g.add(sg); }
  else for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.095, 32, 24), eye); e.scale.set(0.9, 1.25, 0.7); e.position.set(sx * 0.25, 0.1, 0.56); g.add(e); const hl = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 12), new THREE.MeshBasicMaterial({ color: '#fff' })); hl.position.set(sx * 0.25 + 0.03, 0.15, 0.64); g.add(hl); }
  const sm = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 12, 40, Math.PI), eye); sm.rotation.z = Math.PI; sm.position.set(0, -0.12, 0.6); g.add(sm);
  const an = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 12), gloss('#ff8d77')); an.position.set(0, 0.78, 0); g.add(an);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 18), gloss('#ffc2b6')); tip.position.set(0, 0.95, 0); g.add(tip);
  const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffd0c4', transparent: true, opacity: 0.22 })); cheek.scale.set(1.4, 0.7, 0.2); cheek.position.set(-0.28, 0.36, 0.5); cheek.rotation.z = 0.5; g.add(cheek);
  return shadowy(g);
}

export function XMark3D(s = 1) {
  const g = new THREE.Group(), m = gloss('#ff4b34', { roughness: 0.3 });
  for (const r of [Math.PI / 4, -Math.PI / 4]) { const b = new THREE.Mesh(new RoundedBoxGeometry(0.17 * s, 0.9 * s, 0.14 * s, 6, 0.06 * s), m); b.rotation.z = r; g.add(b); }
  return shadowy(g);
}
export function Check3D(s = 1, color = '#3fc58a') {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.1 * s, 48), gloss(color, { roughness: 0.25 })));
  g.children[0].rotation.x = Math.PI / 2;
  const w = gloss('#fff', { roughness: 0.3 });
  const a = new THREE.Mesh(new RoundedBoxGeometry(0.05 * s, 0.14 * s, 0.04 * s, 3, 0.02 * s), w); a.position.set(-0.05 * s, -0.02 * s, 0.07 * s); a.rotation.z = Math.PI / 4; g.add(a);
  const b = new THREE.Mesh(new RoundedBoxGeometry(0.05 * s, 0.26 * s, 0.04 * s, 3, 0.02 * s), w); b.position.set(0.05 * s, 0.02 * s, 0.07 * s); b.rotation.z = -Math.PI / 4; g.add(b);
  return shadowy(g);
}
export function Shield3D(s = 1) {
  const sh = new THREE.Shape(); sh.moveTo(0, 0.72); sh.lineTo(0.64, 0.5); sh.lineTo(0.64, -0.1); sh.bezierCurveTo(0.64, -0.46, 0.3, -0.66, 0, -0.78); sh.bezierCurveTo(-0.3, -0.66, -0.64, -0.46, -0.64, -0.1); sh.lineTo(-0.64, 0.5); sh.closePath();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 8, curveSegments: 40 }), gloss('#ffffff', { roughness: 0.16 })));
  const blue = gloss('#1a63c8', { roughness: 0.25 });
  const a = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.4, 0.08, 4, 0.04), blue); a.position.set(-0.17, -0.02, 0.23); a.rotation.z = Math.PI / 4; g.add(a);
  const b = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.78, 0.08, 4, 0.04), blue); b.position.set(0.14, 0.08, 0.23); b.rotation.z = -Math.PI / 4; g.add(b);
  g.scale.setScalar(s); return shadowy(g);
}
/* Faint brand mark behind the subject. */
export function Ghost3D(name, size, opacity = 0.18) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size / U, size / U), basicTex(logoTex(name, '#ffffff'), { opacity }));
  return m;
}

/* Scene shell: gradient backdrop, thin rings, soft-shadow catcher, lights, env. */
export function makeStage(renderer, bgKey = 'navy', { rings = true } = {}) {
  const scene = new THREE.Scene();
  const [c1, c2] = BG[bgKey];
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 256;
  const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const bt = new THREE.CanvasTexture(cv); bt.colorSpace = THREE.SRGBColorSpace;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(40, 25), new THREE.MeshBasicMaterial({ map: bt, toneMapped: false })); bg.position.z = -3; scene.add(bg);
  if (rings) for (const r of [1.5, 2.35, 3.3]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 8, 160), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: bgKey === 'light' ? 0.5 : 0.12, toneMapped: false })); t.position.set(0, 0, -2.9); scene.add(t); }
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.ShadowMaterial({ opacity: bgKey === 'light' ? 0.16 : 0.42, color: '#020b1d' })); catcher.position.z = -0.32; catcher.receiveShadow = true; scene.add(catcher);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; scene.environmentIntensity = 0.85;
  scene.add(new THREE.HemisphereLight('#ffffff', bgKey === 'light' ? '#cfe3f8' : '#2a4f90', 0.55));
  const key = new THREE.DirectionalLight('#ffffff', 2.1); key.position.set(-1.1, 2.2, 9); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 14; key.shadow.blurSamples = 25; key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 30 }); scene.add(key);
  const rim = new THREE.DirectionalLight('#9fd0ff', 0.9); rim.position.set(5, 2, 4); scene.add(rim);
  return { scene, key };
}
export function makeCamera(aspect = 1.6) {
  const cam = new THREE.PerspectiveCamera(20, aspect, 0.1, 100); cam.position.set(0, 0, 14.3); cam.lookAt(0, 0, 0); return cam;
}
export function makeRenderer(canvas, W, H) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  r.setPixelRatio(1); r.setSize(W, H); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NoToneMapping;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.VSMShadowMap; return r;
}
export function place(obj, sx, sy, z = 0, scale = 1) { obj.position.set(wx(sx), wy(sy), z); obj.scale.multiplyScalar(scale); return obj; }

/* Person tile: initials on a coloured disc. */
export function Avatar3D(initials = 'KR', size = 130, color = '#0b7563') {
  const s = size / U, d = s * 0.3, g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(s, s, d, 10, s * 0.26), gloss('#ffffff', { roughness: 0.16 })));
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = color; x.beginPath(); x.arc(256, 256, 236, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = '600 220px IN'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(initials, 256, 270);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.7, s * 0.7), basicTex(tx)); m.position.z = d / 2 + 0.004; g.add(m);
  return shadowy(g);
}
/* A flat info card with up to three text lines drawn on a rounded white panel. */
export function Card3D(lines, w = 2.6, h = 1.0) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.12, 8, 0.12), gloss('#ffffff', { roughness: 0.2 })));
  const c = document.createElement('canvas'); c.width = 1300; c.height = Math.round(1300 * h / w); const x = c.getContext('2d');
  x.textBaseline = 'alphabetic'; let y = 120;
  lines.forEach(({ t, size = 74, color = '#0b1220', weight = 600, font = 'IN', gap = 1.25 }) => { x.font = `${weight} ${size}px ${font}`; x.fillStyle = color; x.fillText(t, 90, y + size * 0.35); y += size * gap; });
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basicTex(tx)); m.position.z = 0.065; g.add(m);
  return shadowy(g);
}
