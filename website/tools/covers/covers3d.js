import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Tile3D, Chip3D, Sparkle3D, Mascot3D, XMark3D, Check3D, Shield3D, Ghost3D, gloss, place, wx, wy, U } from './kit3d.js';

const C = { co: '#ff8d77', bl: '#7fb8ff', wh: '#ffffff' };
const sp = (list) => (sc) => list.forEach(([x, y, s = 1, c = C.co, o]) => { const m = Sparkle3D(c, s); place(m, x, y, 0.02); m.rotation.z = 0.2; if (o) { m.material.transparent = true; m.material.opacity = o; } sc.add(m); });
const tilt = (m, x = -0.1, y = 0.16, z = 0.03) => { m.rotation.set(x, y, z); return m; };
const add = (sc, m, x, y, z = 0.1, s = 1) => { place(m, x, y, z, s); sc.add(m); return m; };
const stdSp = [[150, 110, 1], [660, 100, 0.8, C.bl], [700, 230, 0.7]];
const whSp = [[150, 110, 1, C.wh], [660, 100, 0.8, C.wh, 0.85], [700, 230, 0.7, C.wh, 0.8]];

const bolt = () => {
  const s = new THREE.Shape(), p = [[10, -34], [-18, 6], [0, 6], [-10, 34], [20, -8], [2, -8]];
  p.forEach(([x, y], i) => (i ? s.lineTo(x / U, -y / U) : s.moveTo(x / U, -y / U))); s.closePath();
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 6 }), gloss('#ff8d77', { roughness: 0.28 }));
  m.castShadow = true; return m;
};
const terminal = () => {
  const g = new THREE.Group(), W = 3.4, H = 1.5;
  g.add(new THREE.Mesh(new RoundedBoxGeometry(W, H, 0.22, 8, 0.16), new THREE.MeshStandardMaterial({ color: '#06142b', roughness: 0.55, metalness: 0.1, envMapIntensity: 0.25 })));
  const c = document.createElement('canvas'); c.width = 1360; c.height = 600; const x = c.getContext('2d');
  x.fillStyle = '#071733'; x.beginPath(); x.roundRect(8, 8, 1344, 584, 60); x.fill();
  [['#ff5a43', 100], ['#f2b04a', 188], ['#3fc58a', 276]].forEach(([col, px]) => { x.fillStyle = col; x.beginPath(); x.arc(px, 100, 24, 0, 7); x.fill(); });
  x.font = '600 88px "DejaVu Sans Mono", monospace'; x.fillStyle = '#7fb8ff'; x.fillText('$ whoami', 100, 280); x.fillStyle = '#fff'; x.fillText('trusted-user', 100, 400); x.fillStyle = '#ff8d77'; x.fillText('$ _', 100, 520);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tx, transparent: true, toneMapped: false })); m.position.z = 0.115; g.add(m);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g;
};
const wave = (sc) => {
  const pts = [[0, 440], [100, 440, 150, 428, 220, 414], [300, 396, 330, 330, 400, 322], [470, 330, 500, 396, 580, 414], [650, 428, 700, 440, 800, 440]];
  const f = (x, y) => [wx(x), wy(y)];
  const sh = new THREE.Shape(); sh.moveTo(...f(-40, 440)); sh.lineTo(...f(0, 440));
  const curve = new THREE.CurvePath(); let cur = new THREE.Vector2(...f(0, 440));
  pts.slice(1).forEach(([a, b, c, d, e, g]) => { const v = [[a, b], [c, d], [e, g]].map(([x, y]) => new THREE.Vector2(...f(x, y))); sh.bezierCurveTo(v[0].x, v[0].y, v[1].x, v[1].y, v[2].x, v[2].y); curve.add(new THREE.CubicBezierCurve(cur, v[0], v[1], v[2])); cur = v[2]; });
  sh.lineTo(...f(840, 440)); sh.closePath();
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: '#ff8d77', transparent: true, opacity: 0.14, toneMapped: false })); fill.position.z = -0.4; sc.add(fill);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve.getPoints(160).map((p) => new THREE.Vector3(p.x, p.y, 0))), 200, 0.022, 8), gloss('#ff8d77', { roughness: 0.3 })); tube.position.z = -0.3; sc.add(tube);
  const base = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.03, 0.03), gloss('#5cc2ff', { roughness: 0.3 })); base.position.set(0, wy(440), -0.3); sc.add(base);
};

/* Each spec returns the 3D layer only. Headline text is drawn crisply over it in CoverArt.jsx. */
export const SPECS = {
  bfsi: { bg: 'navy', build: (sc) => { sp(stdSp)(sc); add(sc, tilt(Tile3D('bank', 132)), 400, 125); } },
  healthcare: { bg: 'blue', build: (sc) => { sp(whSp)(sc); add(sc, tilt(Tile3D('firstaid', 132)), 400, 125); } },
  government: { bg: 'ink', build: (sc) => { sp(stdSp)(sc); add(sc, tilt(Tile3D('buildings', 132)), 400, 125); } },
  'digital-platforms': { bg: 'navy', build: (sc) => { sp(stdSp)(sc); add(sc, tilt(Tile3D('browsers', 132)), 400, 125); } },
  'identity-security': { bg: 'navy', build: (sc) => {
    sp([[170, 110, 0.9], [640, 90, 0.7, C.bl], [690, 210, 1], [110, 250, 0.6, C.bl]])(sc);
    add(sc, tilt(Tile3D('okta', 132)), 400, 125); add(sc, Check3D(1.35), 466, 69, 0.55);
  } },
  'ai-security-intelligence': { bg: 'blue', build: (sc) => {
    add(sc, Ghost3D('claude', 270, 0.18), 400, 130, -0.5);
    sp([[140, 120, 1, C.wh], [670, 130, 0.7, C.wh, 0.8], [690, 300, 0.9, C.wh, 0.9]])(sc);
    add(sc, tilt(Chip3D('Authority', 430, 120, 64), -0.08, 0, 0), 400, 190);
  } },
  'threat-intelligence': { bg: 'ink', build: (sc) => { sp([[130, 110, 0.8], [680, 120, 1, C.bl]])(sc); add(sc, tilt(Chip3D('Aflac Japan breach', 430, 68, 32), -0.06, 0, 0), 400, 120); } },
  'ai-agent-governance': { bg: 'navy', build: (sc) => {
    sp([[140, 100, 0.9], [670, 100, 0.7, C.bl], [700, 230, 0.9]])(sc);
    add(sc, tilt(Tile3D('m365', 118), -0.08, 0.2), 320, 125); add(sc, tilt(Tile3D('copilot', 118), -0.08, -0.2), 480, 125);
    const link = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.06, 0.06, 3, 0.025), gloss('#cfe3ff')); link.castShadow = true; add(sc, link, 400, 125, 0.2);
  } },
  'ai-security': { bg: 'blue', build: (sc) => {
    sp([[150, 110, 1, C.wh], [660, 100, 0.7, C.wh], [700, 260, 0.9, C.wh, 0.85], [110, 260, 0.6, C.wh, 0.8]])(sc);
    add(sc, tilt(Mascot3D(), -0.06, 0.22, 0), 400, 140, 0.1, 1.2);
  } },
  'india-mule-account-crisis': { bg: 'coral', build: (sc) => {
    sp([[130, 110, 1, C.wh, 0.9], [680, 100, 0.7, C.wh, 0.9]])(sc);
    add(sc, tilt(Tile3D('phonepe', 92), -0.08, 0.2), 230, 95); add(sc, tilt(Tile3D('paytm', 92), -0.08, 0), 400, 85); add(sc, tilt(Tile3D('razorpay', 92), -0.08, -0.2), 570, 95);
    add(sc, tilt(Chip3D('26.5 lakh', 430, 108, 62), -0.06, 0, 0), 400, 260);
  } },
  'mythos-ai-banking-threat': { bg: 'ink', build: (sc) => {
    sp([[130, 120, 1], [680, 110, 0.8, C.bl], [700, 260, 0.6]])(sc);
    add(sc, tilt(Chip3D('Mythos-class AI', 470, 78, 38), -0.06, 0, 0), 400, 100);
    add(sc, tilt(bolt(), -0.1, 0.25, 0.02), 400, 205, 0.1, 2.1);
  } },
  'confessions-entry-01': { bg: 'ink', build: (sc) => { sp([[120, 120, 0.7], [690, 110, 0.9, C.bl]])(sc); add(sc, tilt(terminal(), -0.08, 0.14, 0.01), 400, 125); } },
  'ctem-dpdpa-india-2026': { bg: 'blue', build: (sc) => {
    sp([[140, 110, 1, C.wh], [670, 110, 0.7, C.wh, 0.8], [700, 290, 0.8, C.wh, 0.85]])(sc);
    add(sc, tilt(Shield3D(0.9), -0.06, 0.22, 0), 400, 112);
    add(sc, tilt(Chip3D('DPDPA', 360, 96, 58), -0.06, 0, 0), 400, 270);
  } },
  'ctem-bot-defence-fintech': { bg: 'navy', build: (sc) => {
    sp([[110, 270, 0.9], [700, 250, 0.8, C.bl], [330, 60, 0.6, C.bl]])(sc);
    add(sc, tilt(Tile3D('phonepe', 100), -0.08, 0.22), 190, 130); add(sc, tilt(Tile3D('paytm', 100), -0.08, -0.22), 610, 130);
    add(sc, tilt(Mascot3D({ shades: true }), -0.04, 0.12, 0), 400, 130, 0.1, 1.05); add(sc, XMark3D(1.05), 400, 138, 0.95);
  } },
  'ddos-mitigation-strategy-2026': { bg: 'navy', build: (sc) => {
    wave(sc); sp([[130, 110, 1], [690, 120, 0.8, C.bl]])(sc);
    add(sc, tilt(Chip3D('Layer 7', 330, 92, 54), -0.06, 0, 0), 400, 105);
  } },
};
export const FALLBACK = { bg: 'navy', build: (sc) => { sp(stdSp)(sc); add(sc, Mascot3D(), 400, 190); } };
