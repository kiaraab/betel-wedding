// 3D view of the reception, built from the same plan data as the floor plan. Units: feet.
// Loaded on demand (three.js comes from a CDN via the import map in index.html).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seatCount, tableR, rectDims, chairPositions } from './layout.js';
import { partyDots } from './spaces.js';

const WALL_H = 20;     // ESTIMATE ~20 ft to the coffers (photo: arched doors ~10 ft = half the wall below the crown); not published. Balcony slab ~11 ft
const _v = new THREE.Vector3();
let allLabels = [];

/** Shimmery gold-taupe wall finish: soft mottling + tiny bright flecks (one small canvas, tiled). */
function wallTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#cdbc96'; g.fillRect(0, 0, 256, 256);
  for (let n = 0; n < 900; n++) {
    const r = 2 + Math.random() * 7, x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = Math.random() < 0.5 ? `rgba(120,98,62,${Math.random() * 0.12})` : `rgba(236,220,180,${Math.random() * 0.14})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let n = 0; n < 2200; n++) { g.fillStyle = `rgba(255,240,200,${0.15 + Math.random() * 0.35})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Frieze under the crown molding: interlocking gold circles on cream. */
function friezeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#efe6cf'; g.fillRect(0, 0, 128, 32);
  g.strokeStyle = '#b8924f'; g.lineWidth = 2.2;
  for (let x = 0; x <= 128; x += 32) { g.beginPath(); g.arc(x, 16, 12, 0, Math.PI * 2); g.stroke(); }
  for (let x = 16; x <= 128; x += 32) { g.beginPath(); g.arc(x, 16, 12, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#c9a45c'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 30, 128, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One window pane with its white muntin border; tiled in feet so every opening gets an even grid. */
function paneTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, '#bcd3d6'); grd.addColorStop(1, '#93b08f');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 6); g.fillRect(0, 0, 6, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const tones = ['#b98a5a', '#c49766', '#b07f52', '#c9a072', '#a97a4e'];
  for (let i = 0; i < 16; i++) { // planks run the long way
    g.fillStyle = tones[(i * 7) % tones.length];
    g.fillRect(i * 32, 0, 32, 512);
    g.fillStyle = 'rgba(60,35,15,.25)'; g.fillRect(i * 32, 0, 1.5, 512);
    for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(60,35,15,.18)'; g.fillRect(i * 32, ((i * 97 + k * 173) % 512), 32, 1.5); }
  }
  for (let n = 0; n < 2500; n++) { g.fillStyle = `rgba(80,50,20,${Math.random() * 0.06})`; g.fillRect(Math.random() * 512, Math.random() * 512, 1, 8 + Math.random() * 30); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function label(text, { size = 1.6, color = '#2f3823', bg = 'rgba(255,253,248,.92)' } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '600 64px "DM Sans", Helvetica, sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 56;
  c.width = w; c.height = 104;
  g.font = font;
  g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, 104, 52); g.fill();
  g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 28, 54);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  const k = 0.026 * (size / 1.2); // fraction of screen height
  s.scale.set((k * w) / 104, k, 1);
  s.renderOrder = 10;
  allLabels.push(s);
  return s;
}

function archShape(w, h) { // rectangle with a round top, base at y=0
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h); s.absarc(0, h, r, 0, Math.PI, false); s.lineTo(-r, 0);
  return s;
}

/* Palette read straight off Betel's board (assets/inspo): wine, olive/sage, chocolate, ivory, candlelight. */
const PAL = { wine: '#5a1624', wineLt: '#7d2c38', blush: '#d9a3a8', olive: '#6b7340', oliveDk: '#4b522b', sage: '#a9b38a', choc: '#4d2e1d', ivory: '#f2ead8', candle: '#ffcf8a' };

/** Soft round glow (canvas radial fade) used for candle / bulb halos. */
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,214,150,1)'); r.addColorStop(0.25, 'rgba(255,190,110,.45)'); r.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Sky for the open spaces: zenith at the top, horizon band, then ground colour below (used on the upper hemisphere only). */
function skyTexture(stops) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  g.fillStyle = stops[stops.length - 1][1]; g.fillRect(0, 128, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Soft vertical folds (greyscale, tiles sideways): multiplies a cloth colour so velvet / satin falls in pleats. */
function linenTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x++) {
    const v = Math.sin((x / 128) * Math.PI * 2 * 5) * 0.5 + Math.sin((x / 128) * Math.PI * 2 * 11 + 1) * 0.3;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v * 0.28})` : `rgba(0,0,0,${-v * 0.32})`; g.fillRect(x, 0, 1, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(3, 1);
  return t;
}

/* ---- merged, vertex-coloured decor pieces (one draw call per table): runner, plates, candles, low florals ---- */
const U = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 10), sph: new THREE.SphereGeometry(1, 7, 5), cone: new THREE.ConeGeometry(1, 1, 6) };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
/** A unit primitive, scaled / rotated / moved and painted a single colour. */
function part(kind, color, [x, y, z], [sx, sy, sz], [rx = 0, ry = 0, rz = 0] = []) {
  const g = U[kind].clone();
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  _c.set(color);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const rngOf = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const BLOOMS = [PAL.wine, PAL.wine, PAL.wine, PAL.wineLt, '#8c2a3a', PAL.blush, PAL.ivory, PAL.ivory, '#b9c08a'];
/** A low, loose mound of blooms and greenery (the board: hydrangea, roses, trailing leaves) centred at (cx, y, cz). */
function florals(cx, y, cz, R, H, seed) {
  const rnd = rngOf(seed), out = [];
  for (let k = 0; k < 14; k++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R, r = 0.2 + rnd() * 0.22;
    out.push(part('sph', BLOOMS[Math.floor(rnd() * BLOOMS.length)], [cx + Math.cos(a) * d, y + H * (1 - d / R) + r * 0.6, cz + Math.sin(a) * d], [r, r * 0.85, r]));
  }
  for (let k = 0; k < 7; k++) { // leaves fanning outward and trailing over the cloth
    const a = (k / 7) * Math.PI * 2 + rnd(), d = R * 0.85;
    out.push(part('cone', k % 2 ? PAL.oliveDk : '#7d8a4c', [cx + Math.cos(a) * d, y + 0.28, cz + Math.sin(a) * d], [0.14, 1.0, 0.14], [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25]));
  }
  return out;
}
/** Pillar candles (ivory) on a small brass foot; flame tips are returned separately so they can glow. */
function candles(list, y, parts, tips) {
  list.forEach(([x, z, hh]) => {
    parts.push(part('cyl', PAL.ivory, [x, y + hh / 2, z], [0.09, hh, 0.09]), part('cyl', '#b08d57', [x, y + 0.04, z], [0.3, 0.08, 0.3]));
    tips.push(part('sph', '#fff', [x, y + hh + 0.14, z], [0.07, 0.14, 0.07])); // all flames share the emissive flame material
  });
}
const round1 = (n) => Math.round(n * 10) / 10;
const _decorCache = new Map();
/** Round table decor: cross runner, place settings (olive charger + ivory plate), candle trio, floral mound. Cached per size. */
function roundDecor(r, seats, small, runnerColor, th, seed) {
  const key = ['r', round1(r), seats, small, runnerColor, th, seed].join();
  if (_decorCache.has(key)) return _decorCache.get(key);
  const parts = [], tips = [], y = th;
  if (!small) {
    for (const a of [0, Math.PI / 2]) parts.push(part('box', runnerColor, [0, y + 0.03, 0], [2 * r + 0.7, 0.05, 1.05], [0, a, 0]));
    for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; parts.push(part('box', runnerColor, [Math.cos(a) * (r + 0.33), y - 0.55, Math.sin(a) * (r + 0.33)], [0.05, 1.2, 1.05], [0, -a + Math.PI / 2, 0])); }
    for (let i = 0; i < seats; i++) {
      const a = (i / seats) * Math.PI * 2 - Math.PI / 2, d = r - 1.0;
      parts.push(part('cyl', PAL.oliveDk, [Math.cos(a) * d, y + 0.04, Math.sin(a) * d], [0.62, 0.05, 0.62]), part('cyl', PAL.ivory, [Math.cos(a) * d, y + 0.08, Math.sin(a) * d], [0.46, 0.05, 0.46]));
    }
  }
  const k = small ? 0.55 : 1;
  parts.push(...florals(0, y, 0, 0.95 * k, 0.5 * k, seed));
  candles(small ? [[0.5, 0.3, 0.7]] : [[0.95, 0.35, 1.9], [-0.85, 0.55, 2.3], [0.1, -1.0, 2.0]], y, parts, tips);
  const out = { decor: mergeGeometries(parts), tips: mergeGeometries(tips), tipAt: small ? [[0.5, y + 0.84, 0.3]] : [[0.95, y + 2.04, 0.35], [-0.85, y + 2.44, 0.55], [0.1, y + 2.14, -1.0]] };
  parts.forEach((g) => g.dispose()); tips.forEach((g) => g.dispose());
  _decorCache.set(key, out); return out;
}
/** Long (rect) table decor: a run of floral mounds with candle clusters between them, a long runner with hanging ends, a plate per seat. */
function longDecor(L, D, seatsTop, runnerColor, th) {
  const key = ['l', round1(L), round1(D), seatsTop, runnerColor, th].join();
  if (_decorCache.has(key)) return _decorCache.get(key);
  const parts = [], tips = [], tipAt = [], y = th;
  parts.push(part('box', runnerColor, [0, y + 0.03, 0], [L + 1.2, 0.05, Math.min(1.5, D * 0.5)]));
  [-1, 1].forEach((sd) => parts.push(part('box', runnerColor, [sd * (L / 2 + 0.6), y - 0.7, 0], [0.05, 1.5, Math.min(1.5, D * 0.5)])));
  const n = Math.max(2, Math.round(L / 4.2));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * (L - 1.6);
    parts.push(...florals(x, y, 0, 1.0, 0.55, 11 + i * 5));
    if (i < n - 1) { const cx = x + (L - 1.6) / (n - 1) / 2; candles([[cx - 0.2, 0.2, 2.2], [cx + 0.2, -0.25, 1.7]], y, parts, tips); tipAt.push([cx - 0.2, y + 2.34, 0.2], [cx + 0.2, y + 1.84, -0.25]); }
  }
  if (seatsTop) for (let i = 0; i < seatsTop; i++) {
    const x = (i / seatsTop - 0.5) * (L - 1.2) + (L - 1.2) / seatsTop / 2;
    parts.push(part('cyl', PAL.oliveDk, [x, y + 0.04, D / 2 - 0.9], [0.62, 0.05, 0.62]), part('cyl', PAL.ivory, [x, y + 0.08, D / 2 - 0.9], [0.46, 0.05, 0.46]));
  }
  const out = { decor: mergeGeometries(parts), tips: tips.length ? mergeGeometries(tips) : null, tipAt };
  parts.forEach((g) => g.dispose()); tips.forEach((g) => g.dispose());
  _decorCache.set(key, out); return out;
}
/** Cross-back chair frame (turned legs, raked back posts, top rail, X splat), merged into one geometry. Seat height 1.5 ft, back at +z. */
let _chairFrame = null, _cushion = null;
function chairFrame() {
  if (_chairFrame) return _chairFrame;
  const b = (sx, sy, sz, x, y, z, rz = 0, rx = 0) => new THREE.BoxGeometry(sx, sy, sz).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1)));
  const parts = [
    b(0.11, 1.45, 0.11, -0.55, 0.72, -0.55), b(0.11, 1.45, 0.11, 0.55, 0.72, -0.55),        // front legs
    b(0.11, 1.5, 0.11, -0.55, 0.75, 0.55, 0, -0.07), b(0.11, 1.5, 0.11, 0.55, 0.75, 0.55, 0, -0.07), // rear legs, raked
    b(0.11, 1.9, 0.11, -0.55, 2.4, 0.66, 0, 0.07), b(0.11, 1.9, 0.11, 0.55, 2.4, 0.66, 0, 0.07),     // back posts
    b(1.2, 0.12, 0.1, 0, 1.38, -0.55), b(1.2, 0.12, 0.1, 0, 1.38, 0.55), b(0.1, 0.12, 1.1, -0.55, 1.38, 0), b(0.1, 0.12, 1.1, 0.55, 1.38, 0), // seat rails
    b(1.2, 0.2, 0.1, 0, 3.3, 0.7), b(1.15, 0.1, 0.08, 0, 2.05, 0.64),                        // top rail, low rail
    b(0.07, 1.5, 0.06, 0, 2.7, 0.67, 0.55), b(0.07, 1.5, 0.06, 0, 2.7, 0.67, -0.55),        // crossed splat
  ];
  _chairFrame = mergeGeometries(parts); parts.forEach((g) => g.dispose());
  _cushion = new RoundedBoxGeometry(1.25, 0.24, 1.2, 2, 0.08).translate(0, 1.58, 0.0);
  return _chairFrame;
}
const chairCushion = () => (chairFrame(), _cushion);

/** Floor-length cloth for a round table: pooled hem and soft radial pleats (cached). */
function clothGeo(r, th) {
  const key = ['c', round1(r), th].join();
  if (_decorCache.has(key)) return _decorCache.get(key);
  const pts = [[r + 0.65, 0], [r + 0.5, 0.1], [r + 0.34, 0.55], [r + 0.22, th * 0.55], [r + 0.1, th - 0.18], [r + 0.04, th - 0.04], [r - 0.05, th], [0.01, th]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 40), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i), f = 1 + 0.035 * Math.sin(Math.atan2(z, x) * 14) * Math.max(0, 1 - y / th) * (Math.hypot(x, z) > r * 0.9 ? 1 : 0);
    pos.setXYZ(i, x * f, y, z * f);
  }
  g.computeVertexNormals(); _decorCache.set(key, g); return g;
}

/** `sp` = { room, tables } of another space (ceremony / hangout / tasting room); omit it for the ballroom reception. `countAt(t)` = guests seated at a table, `pool` = the ceremony's wedding party pool. */
export async function mount(host, state, mood, { onSeat, unseated = () => [], sp = null, countAt = null, pool = [] } = {}) {
  host.innerHTML = '';
  allLabels = [];
  const ballroom = !sp, ROOM = sp ? sp.room : state.room, TABLES = sp ? sp.tables : state.tables;
  const { w, h, fixed } = ROOM;
  const closed = ballroom || ROOM.floor === 'tile'; // walled rooms; the lawn and the courtyard are open air
  const WH = ballroom ? WALL_H : 12;
  const X = (x) => x - w / 2, Z = (y) => y - h / 2;
  // The stage bay is on the LEFT long wall, outside the hall; its platform is 3 steps (0.5 ft rise each) up. Items inside the bay (sweetheart table, cake) stand on it.
  const stg = ballroom && fixed.stage && fixed.stage.wall !== 'top' ? fixed.stage : null, STEP_RISE = 0.5, PLATFORM = stg ? STEP_RISE * (stg.steps || 3) : 0;
  const onStage = (x, y) => !!stg && x < 0 && Math.abs(y - stg.cy) < stg.r + 1;

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.classList.add('three');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const dayBg = new THREE.Color('#e9e2d2'), nightBg = new THREE.Color('#1a1310');
  scene.background = dayBg.clone();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.42; controls.minDistance = 12; controls.maxDistance = 160;
  controls.target.set(0, 0, -4);

  /* ---- light ---- */
  const hemi = new THREE.HemisphereLight('#fff7e6', '#7a6748', 1.3);
  scene.add(hemi);
  const hemiSky = { day: new THREE.Color('#fff7e6'), night: new THREE.Color('#ffc58a') }, hemiGnd = { day: new THREE.Color('#7a6748'), night: new THREE.Color('#2a1a14') };
  const sun = new THREE.DirectionalLight('#ffe9c4', 1.6);
  sun.position.set(-20, 40, -h); sun.castShadow = true;
  const coarse = matchMedia('(pointer: coarse)').matches;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -w, right: w, top: h, bottom: -h, near: 1, far: 200 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3; // softer edges, no extra pass
  scene.add(sun);
  const moon = new THREE.DirectionalLight('#9fb0e0', 0); // a faint cool fill for the evening, so the lawn and trees are not pitch black
  moon.position.set(30, 50, 40); scene.add(moon);

  /* ---- shared materials (the ballroom block below and the other spaces both light these) ---- */
  const ceilingG = new THREE.Group();
  scene.add(ceilingG);
  const creamMat = new THREE.MeshStandardMaterial({ color: '#f4ecd9', roughness: 0.9, emissive: '#e9dfc6', emissiveIntensity: 0.45 });
  const moldMat = new THREE.MeshStandardMaterial({ color: '#fbf6ea', roughness: 0.7, emissive: '#f1e8d2', emissiveIntensity: 0.5 });
  const glowMat = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb860', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const glassMats = [], lamps = [], flames = [], popIns = [];

  /* ---- floor + walls ---- */
  const FLOORS = { lawn: '#8fa876', concrete: '#cfc9bd', tile: '#d9ccb6' }; // flat colors for the other spaces
  let floorMat;
  if (ballroom) { const wood = woodTexture(); wood.repeat.set(w / 16, h / 16); floorMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55 }); }
  else floorMat = new THREE.MeshStandardMaterial({ color: FLOORS[ROOM.floor] || '#d9ccb6', roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);

  /* ---- backdrop for the open spaces (lawn, courtyard): a dusk sky, layered hills and a ring of trees, like the villa photos on the board.
         Hills and trees are instanced, so the whole backdrop is a handful of draw calls. ---- */
  const skyDomes = [];
  if (!closed) {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(420, 32), new THREE.MeshStandardMaterial({ color: ROOM.floor === 'lawn' ? '#6f8a58' : '#9b9588', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; ground.receiveShadow = true; scene.add(ground);
    const domeGeo = new THREE.SphereGeometry(400, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    [skyTexture([[0, '#7fb0d6'], [0.7, '#cfe2e6'], [1, '#f3e8c9']]), skyTexture([[0, '#1b2038'], [0.55, '#5d3b52'], [1, '#f0a066']])].forEach((tex, i) => {
      const m = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false, transparent: true, opacity: i ? 0 : 1 }));
      m.renderOrder = -2 + i; scene.add(m); skyDomes.push(m);
    });
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
    const R0 = Math.max(w, h) * 0.5;
    // two ranks of low hills (far = hazy sage, near = deeper olive)
    const hills = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 1 }), 22);
    for (let i = 0; i < 22; i++) {
      const far = i < 12, a = (far ? i / 12 : (i - 12) / 10) * Math.PI * 2 + rnd() * 0.4, R = far ? 230 + rnd() * 30 : 140 + R0 * 0.4 + rnd() * 25;
      P.set(Math.cos(a) * R, -2, Math.sin(a) * R); S.set(far ? 70 + rnd() * 40 : 40 + rnd() * 25, far ? 22 + rnd() * 16 : 10 + rnd() * 8, far ? 60 : 45);
      Q.setFromAxisAngle(UP, -a); M.compose(P, Q, S); hills.setMatrixAt(i, M);
      hills.setColorAt(i, C.set(far ? '#7f8c63' : '#566a3f').offsetHSL(0, 0, (rnd() - 0.5) * 0.05));
    }
    scene.add(hills);
    // trees ringed outside the room: round canopies + a few cypress, each on a trunk
    const NT = 34, trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.6, 1, 6), new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 1 }), NT);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), NT);
    Q.identity();
    for (let i = 0; i < NT; i++) {
      const a = rnd() * Math.PI * 2, ex = w / 2 + 14 + rnd() * 55, ez = h / 2 + 14 + rnd() * 55, px = Math.cos(a) * ex, pz = Math.sin(a) * ez;
      const cyp = i % 5 === 0, ht = cyp ? 20 + rnd() * 8 : 9 + rnd() * 6, cr = cyp ? 2.2 : 5 + rnd() * 3.5;
      P.set(px, ht * 0.15, pz); S.set(1, ht * 0.3, 1); M.compose(P, Q, S); trunks.setMatrixAt(i, M);
      P.set(px, ht * 0.3 + (cyp ? ht * 0.35 : cr * 0.7), pz); S.set(cr, cyp ? ht * 0.5 : cr * 0.85, cr); M.compose(P, Q, S); crowns.setMatrixAt(i, M);
      crowns.setColorAt(i, C.set(cyp ? '#2f4128' : '#4f6a3a').offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.08));
    }
    scene.add(trunks, crowns);
  }

  if (ballroom) {
  // Shimmery gold-taupe walls (a touch of metalness catches the light)
  const wallTex = wallTexture();
  const wallMatFor = (len, height) => { const t = wallTex.clone(); t.repeat.set(len / 9, height / 9); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, color: '#fff6e2', roughness: 0.6, metalness: 0.06, side: THREE.DoubleSide }); };
  const lowWall = new THREE.MeshStandardMaterial({ color: '#cdbd98', roughness: 0.9, transparent: true, opacity: 0.35 });
  const wall = (len, x, z, rotY, height = WALL_H, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, height, 0.6), mat || wallMatFor(len, height));
    m.position.set(x, height / 2, z); m.rotation.y = rotY; m.receiveShadow = true;
    scene.add(m);
  };
  wall(w, 0, -h / 2, 0);                          // far wall (arched doors)
  if (stg) { // left wall, with the arched opening to the stage bay cut out (the arch spandrel is added with the bay below)
    const a = stg.cy - stg.r, b = h - (stg.cy + stg.r);
    wall(a, -w / 2, Z(a / 2), Math.PI / 2);
    wall(b, -w / 2, Z(h - b / 2), Math.PI / 2);
  } else wall(h, -w / 2, 0, Math.PI / 2);          // left
  wall(h, w / 2, 0, Math.PI / 2);                 // right
  wall(w, 0, h / 2, 0, 3, lowWall);               // near wall cut away so you can see in

  /* ---- ceiling: cream coffers, crown molding, gold circle frieze. Hidden when the camera is above it. ---- */
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, h), creamMat);
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = WALL_H;
  ceilingG.add(ceiling);
  const BEAM_D = 1.7, BEAM_W = 2.2;
  const beam = (lenX, lenZ, x, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(lenX, BEAM_D, lenZ), creamMat);
    b.position.set(x, WALL_H - BEAM_D / 2, z); ceilingG.add(b);
    // a slim molding lip under each beam edge
    const lip = new THREE.Mesh(new THREE.BoxGeometry(lenX + (lenX > lenZ ? 0 : 0.5), 0.25, lenZ + (lenZ > lenX ? 0 : 0.5)), moldMat);
    lip.position.set(x, WALL_H - BEAM_D - 0.12, z); ceilingG.add(lip);
  };
  beam(BEAM_W, h, 0, 0);                                         // one long beam down the middle
  [22, 42, 62].forEach((y) => beam(w, BEAM_W, 0, Z(y)));          // cross beams → big coffers
  // crown molding (stepped cornice) around the walls
  [[w, 1.6, 0, -h / 2 + 0.8], [1.6, h, -w / 2 + 0.8, 0], [1.6, h, w / 2 - 0.8, 0], [w, 1.6, 0, h / 2 - 0.8]].forEach(([lx, lz, x, z]) => {
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(lx, 1.1, lz), moldMat); c1.position.set(x, WALL_H - 0.55, z); ceilingG.add(c1);
  });
  [[w, 0.8, 0, -h / 2 + 0.4], [0.8, h, -w / 2 + 0.4, 0], [0.8, h, w / 2 - 0.4, 0]].forEach(([lx, lz, x, z]) => {
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(lx, 0.5, lz), moldMat); c2.position.set(x, WALL_H - 1.35, z); ceilingG.add(c2);
  });
  // gold circle frieze band just under the cornice (far + both long walls)
  const friezeTex = friezeTexture();
  const FRIEZE_H = 1.3, fy = WALL_H - 1.6 - FRIEZE_H / 2;
  const friezeSegs = [[w, 0, -h / 2 + 0.32, 0], [h, w / 2 - 0.32, 0, -Math.PI / 2]];
  if (stg) { const a = stg.cy - stg.r, b = h - (stg.cy + stg.r); friezeSegs.push([a, -w / 2 + 0.32, Z(a / 2), Math.PI / 2], [b, -w / 2 + 0.32, Z(h - b / 2), Math.PI / 2]); }
  else friezeSegs.push([h, -w / 2 + 0.32, 0, Math.PI / 2]);
  friezeSegs.forEach(([len, x, z, ry]) => {
    const t = friezeTex.clone(); t.repeat.set(len / (FRIEZE_H * 4), 1); t.needsUpdate = true;
    const band = new THREE.Mesh(new THREE.PlaneGeometry(len, FRIEZE_H), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.35 }));
    band.position.set(x, fy, z); band.rotation.y = ry; ceilingG.add(band);
  });

  /* ---- doors + windows, as the photo shows them: arched French doors, Palladian windows, plain windows.
         Glass is a tiled pane texture (white muntin grid) that glows like daylight, dusk at night. ---- */
  const paneTex = paneTexture();
  const frameMat = new THREE.MeshStandardMaterial({ color: '#fbf8f0', roughness: 0.55 });
  const glassFor = (cols, ow, rows, rectH) => {
    const t = paneTex.clone();
    // ShapeGeometry UVs are in feet: one pane = ow/cols wide, rectH/rows tall, grid centered on the opening
    t.repeat.set(cols / ow, rows / rectH); t.offset.set(cols / 2, 0); t.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 0.55, roughness: 0.25 });
    glassMats.push(m);
    return m;
  };
  const rectShape = (ow, oh) => { const s = new THREE.Shape(); s.moveTo(-ow / 2, 0); s.lineTo(ow / 2, 0); s.lineTo(ow / 2, oh); s.lineTo(-ow / 2, oh); s.lineTo(-ow / 2, 0); return s; };
  const bar = (grp, bw, bh, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.12), frameMat); b.position.set(x, y, 0.08); grp.add(b); };
  fixed.openings.forEach((o) => {
    if (o.wall === 'bottom') return; // entrance sits under the balcony (cut-away wall)
    const ow = o.w;
    let sill, rectH, arched, cols, rows;
    if (o.kind === 'window' && o.style === 'palladian') { sill = 3; rectH = 8.5; arched = true; cols = 4; rows = 5; }
    else if (o.kind === 'window') { sill = 2.5; rectH = 8.5; arched = false; cols = 3; rows = 5; }
    else if (o.style === 'rect') { sill = 0; rectH = 9.5; arched = false; cols = 2; rows = 6; }
    else { sill = 0; rectH = 8; arched = true; cols = 4; rows = 5; }              // arched French door
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.ShapeGeometry(arched ? archShape(ow + 0.8, rectH) : rectShape(ow + 0.8, rectH + 0.4)), frameMat);
    const glass = new THREE.Mesh(new THREE.ShapeGeometry(arched ? archShape(ow, rectH) : rectShape(ow, rectH)), glassFor(cols, ow, rows, rectH));
    frame.position.set(0, arched ? 0 : -0.2, 0.01); glass.position.z = 0.03;
    grp.add(frame, glass);
    if (arched) {
      bar(grp, ow, 0.32, 0, rectH);                                   // transom under the fanlight
      for (const a of [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) { // fanlight spokes
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, ow / 2, 0.1), frameMat);
        s.position.set(Math.cos(a) * ow / 4, rectH + Math.sin(a) * ow / 4, 0.08); s.rotation.z = a - Math.PI / 2; grp.add(s);
      }
    }
    if (o.kind !== 'window') bar(grp, 0.22, rectH, 0, rectH / 2);     // doors: meeting stile between the two leaves
    else { const sillB = new THREE.Mesh(new THREE.BoxGeometry(ow + 1.1, 0.25, 0.5), frameMat); sillB.position.set(0, -0.15, 0.15); grp.add(sillB); }
    if (o.wall === 'top') { grp.position.set(X(o.at), sill, Z(0) + 0.35); }
    if (o.wall === 'left') { grp.position.set(X(0) + 0.35, sill, Z(o.at)); grp.rotation.y = Math.PI / 2; }
    if (o.wall === 'right') { grp.position.set(X(w) - 0.35, sill, Z(o.at)); grp.rotation.y = -Math.PI / 2; }
    scene.add(grp);
  });

  /* ---- balcony across the near end (overhead) ----
     Knot photo #143: the railed front is a curved bow ~25 ft wide in the middle with straight railed sections either side (side sections' depth is uncertain). ---- */
  if (fixed.balcony) {
    const d = fixed.balcony.depth, bowW = Math.min(w - 4, fixed.balcony.bow || 25), bulge = 3;
    const sh = new THREE.Shape(); // shape y = -world z (ExtrudeGeometry is then laid flat)
    sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2, d - h / 2); sh.lineTo(bowW / 2, d - h / 2);
    sh.absellipse(0, d - h / 2, bowW / 2, bulge, 0, Math.PI, false); sh.lineTo(-w / 2, d - h / 2); sh.lineTo(-w / 2, -h / 2);
    const slabGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: false }); slabGeo.rotateX(-Math.PI / 2);
    const slab = new THREE.Mesh(slabGeo, new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.8 }));
    slab.position.y = 10.6; slab.castShadow = true;
    scene.add(slab);
    const postMat = new THREE.MeshStandardMaterial({ color: '#f3ecdd', roughness: 0.7 });
    [-w / 2 + 6, -w / 6, w / 6, w / 2 - 6].forEach((x) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 10.6, 16), postMat);
      post.position.set(x, 5.3, Z(h - d) + 0.6); post.castShadow = true; scene.add(post);
    });
    // railing path: straight, around the bow, straight
    const zf = Z(h - d), path = [];
    for (let x = -w / 2 + 0.5; x < -bowW / 2; x += 1) path.push([x, zf]);
    for (let k = 0; k <= 24; k++) { const a = Math.PI - (k / 24) * Math.PI; path.push([(bowW / 2) * Math.cos(a), zf - bulge * Math.sin(a)]); }
    for (let x = bowW / 2 + 1; x <= w / 2 - 0.5; x += 1) path.push([x, zf]);
    const railMat = new THREE.MeshStandardMaterial({ color: '#2b241d' });
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(x, 14.2, z)), false, 'catmullrom', 0), 160, 0.14, 6), railMat);
    scene.add(rail);
    const bals = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), railMat, path.length), M4 = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < path.length; i += 1) { if (i % 3 === 2) continue; M4.makeTranslation(path[i][0], 12.8, path[i][1]); bals.setMatrixAt(n++, M4); }
    bals.count = n; scene.add(bals);
    const ent = label('Entrance', { size: 1.4 }); ent.position.set(0, 3.5, Z(h) - 1); scene.add(ent);
  }

  /* ---- balcony-end doors (photo #143): two white paneled ~5 ft double doors (x about 16 and 31) + a single door near each corner. Positions are approximate (+-3 ft).
         Slightly see-through so the room behind them stays visible from the cut-away side. ---- */
  {
    const leafMat = new THREE.MeshStandardMaterial({ color: '#fbf8f0', roughness: 0.5, transparent: true, opacity: 0.6 });
    fixed.openings.filter((o) => o.wall === 'bottom').forEach((o) => {
      const dh = 8, leaves = o.w > 4 ? 2 : 1, lw = o.w / leaves, grp = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.6, dh + 0.4, 0.25), frameMat); frame.position.y = (dh + 0.4) / 2 - 0.1; grp.add(frame);
      for (let i = 0; i < leaves; i++) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(lw - 0.15, dh, 0.3), leafMat); leaf.position.set((i - (leaves - 1) / 2) * lw, dh / 2, 0.02); grp.add(leaf);
        const knob = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), frameMat); knob.position.set((i - (leaves - 1) / 2) * lw + (leaves === 2 ? (i ? -0.5 : 0.5) : 0.9), 3.5, 0.22); grp.add(knob);
      }
      grp.position.set(X(o.at), 0, Z(h) - 0.3); scene.add(grp);
    });
  }

  /* ---- stage: a domed octagonal bay with columns in the left long wall (outside the hall); only 3 curved tile-faced steps reach ~4.5 ft in ---- */
  if (stg) {
    const d = stg.d || 15, r = stg.r, k = d / 15, reach = stg.stepD ?? 4.5, steps = stg.steps || 3;
    const bx = X(0), bz = Z(stg.cy), BAY_H = 16;
    const half = [[-r, 0], [-r, 5 * k], [-6.5, 11 * k], [-3, d]];
    const poly = [...half, ...half.slice().reverse().map(([u, v]) => [-u, v])];  // [u along the wall, v out of the hall]
    // platform
    const sh = new THREE.Shape(poly.map(([u, v]) => new THREE.Vector2(-v, u)));
    const platGeo = new THREE.ExtrudeGeometry(sh, { depth: PLATFORM, bevelEnabled: false }); platGeo.rotateX(-Math.PI / 2);
    const plat = new THREE.Mesh(platGeo, new THREE.MeshStandardMaterial({ color: '#b98a5a', roughness: 0.45 }));
    plat.position.set(bx, 0, bz); plat.receiveShadow = true; scene.add(plat);
    // bay walls (every edge but the opening) + a dome
    for (let i = 0; i < poly.length - 1; i++) {
      const [u1, v1] = poly[i], [u2, v2] = poly[i + 1], dx = -(v2 - v1), dz = u2 - u1, len = Math.hypot(dx, dz);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, BAY_H, 0.5), wallMatFor(len, BAY_H));
      m.position.set(bx - (v1 + v2) / 2, BAY_H / 2, bz + (u1 + u2) / 2); m.rotation.y = -Math.atan2(dz, dx); scene.add(m);
    }
    const domeMat = creamMat.clone(); domeMat.side = THREE.DoubleSide;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.scale.set(d * 0.52, 6, r * 1.02); dome.position.set(bx - d * 0.48, BAY_H, bz); ceilingG.add(dome);
    // arch spandrel over the opening + two tall white columns
    const sp = new THREE.Shape(); sp.moveTo(-r, 8); sp.lineTo(-r, WALL_H); sp.lineTo(r, WALL_H); sp.lineTo(r, 8); sp.absarc(0, 8, r, 0, Math.PI, false);
    const span = new THREE.Mesh(new THREE.ExtrudeGeometry(sp, { depth: 0.6, bevelEnabled: false }), wallMatFor(1, 1));
    span.rotation.y = Math.PI / 2; span.position.set(bx - 0.3, 0, bz); scene.add(span);
    const colMat = new THREE.MeshStandardMaterial({ color: '#faf6ec', roughness: 0.5 });
    [-r, r].forEach((u) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 17, 18), colMat); col.position.set(bx + 0.2, 8.5 + PLATFORM * 0.5, bz + u); col.castShadow = true; scene.add(col);
    });
    // 3 curved steps (half-ellipses), outermost lowest; tile faced
    const tileMat = new THREE.MeshStandardMaterial({ color: '#c9d6e3', roughness: 0.55 });
    const stepGeo = new THREE.CylinderGeometry(1, 1, 1, 36, 1, false, 0, Math.PI);
    for (let i = 0; i < steps; i++) {
      const e = reach * (1 - i / steps), hw = r - i * 0.7, ht = STEP_RISE * (i + 1);
      const tier = new THREE.Mesh(stepGeo, tileMat);
      tier.scale.set(e, ht, hw); tier.position.set(bx, ht / 2, bz); tier.castShadow = tier.receiveShadow = true; scene.add(tier);
    }
    const lbl = label('Stage', { size: 1.2 }); lbl.position.set(bx - d + 3, PLATFORM + 4, bz); scene.add(lbl);
  }

  /* ---- chandeliers ---- */
  // 6 gold tiered chandeliers with amber shades, two rows down the length (one per coffer);
  // only 4 point lights shared between them, to stay light on phones
  const goldMat = new THREE.MeshStandardMaterial({ color: '#c9a45c', metalness: 0.75, roughness: 0.3 });
  const shadeGeo = new THREE.CylinderGeometry(0.2, 0.32, 0.5, 12, 1, true);
  const HANG = 11.5; // chandelier body height (ft) — estimate
  const chandelier = (x, z) => {
    const ch = new THREE.Group();
    [[1.9, 0, 9], [1.25, 0.9, 7], [0.6, 1.75, 5]].forEach(([r, y, n]) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 28), goldMat); ring.rotation.x = Math.PI / 2; ring.position.y = y; ch.add(ring);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + y;
        const shade = new THREE.Mesh(shadeGeo, glowMat); shade.position.set(Math.cos(a) * r, y + 0.35, Math.sin(a) * r); ch.add(shade);
      }
    });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.6, 10), goldMat); column.position.y = 0.9; ch.add(column);
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), goldMat); drop.position.y = -0.5; ch.add(drop);
    const chainLen = WALL_H - HANG - 2.2;
    // chain + ceiling rose belong to the ceiling, so they vanish with it when you look down from above
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, chainLen), goldMat); chain.position.set(x, HANG + 2.2 + chainLen / 2, z); ceilingG.add(chain);
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 0.2, 24), moldMat); rose.position.set(x, WALL_H - 0.1, z); ceilingG.add(rose);
    ch.position.set(x, HANG, z);
    scene.add(ch);
  };
  [11, 32, 52].forEach((y) => [-w / 6, w / 6].forEach((x) => chandelier(x, Z(y))));
  [11, 25, 39, 53].forEach((y) => {
    const pl = new THREE.PointLight('#ffc27a', 0, 46, 1.3);
    pl.position.set(0, HANG - 1.5, Z(y));
    scene.add(pl);
    lamps.push(pl);
  });

  } else buildSpace();

  /* ---- the other spaces: lawn pergola, courtyard, tasting room. Fixed features come from room.fixed.decor (same data as the floor plan). ---- */
  function buildSpace() {
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
    const stone = std('#d8d2c4'), white = std('#faf6ec', { roughness: 0.5 });
    const box = (x, y, bw, bh, hh, mat, cast = true) => { // plan rect (x, y, w, h) -> box of height hh standing on the floor
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, hh, bh), mat);
      m.position.set(X(x + bw / 2), hh / 2, Z(y + bh / 2)); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m;
    };
    if (closed) { // tasting room: three walls and a ceiling, the near wall cut away like the ballroom's
      const wt = wallTexture(), mat = (len) => { const t = wt.clone(); t.repeat.set(len / 9, WH / 9); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, color: '#fff6e2', roughness: 0.6, side: THREE.DoubleSide }); };
      [[w, 0, -h / 2, 0], [h, -w / 2, 0, Math.PI / 2], [h, w / 2, 0, Math.PI / 2]].forEach(([len, x, z, ry]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, WH, 0.6), mat(len)); m.position.set(x, WH / 2, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m);
      });
      const low = new THREE.Mesh(new THREE.BoxGeometry(w, 3, 0.6), new THREE.MeshStandardMaterial({ color: '#cdbd98', roughness: 0.9, transparent: true, opacity: 0.35 }));
      low.position.set(0, 1.5, h / 2); scene.add(low);
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, h), creamMat); ceil.rotation.x = Math.PI / 2; ceil.position.y = WH; ceilingG.add(ceil);
    }
    (fixed.decor || []).forEach((d) => {
      const cx = X(d.x + d.w / 2), cz = Z(d.y + d.h / 2);
      if (d.kind === 'balustrade') box(d.x, d.y, d.w, d.h, 3, stone);
      else if (d.kind === 'building') box(d.x, d.y, d.w, d.h, 9, std('#e0d4bd'));
      else if (d.kind === 'pergola') {
        [0, 1 / 3, 2 / 3, 1].forEach((fx) => [0, 1].forEach((fy) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 10, 14), white); c.position.set(X(d.x + fx * d.w), 5, Z(d.y + fy * d.h)); c.castShadow = true; scene.add(c); }));
        [0, 1].forEach((fy) => box(d.x - 0.6, d.y + fy * d.h - 0.4, d.w + 1.2, 0.8, 0.7, white).position.setY(10.3)); // two long beams
        for (let x = d.x; x <= d.x + d.w + 0.01; x += 2.4) box(x - 0.2, d.y - 0.8, 0.4, d.h + 1.6, 0.4, white).position.setY(10.9); // cross slats
        const l = label(d.label || 'Pergola', { size: 1.2 }); l.position.set(cx, 12.5, cz); scene.add(l);
      } else if (d.kind === 'fountain') {
        const r = d.w / 2;
        const basin = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.3, 1.8, 40), stone); basin.position.set(cx, 0.9, cz); basin.castShadow = basin.receiveShadow = true; scene.add(basin);
        const water = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.7, r - 0.7, 0.1, 40), std('#a9cfd6', { roughness: 0.2 })); water.position.set(cx, 1.85, cz); scene.add(water);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4.2, 16), stone); col.position.set(cx, 3, cz); scene.add(col);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2, 0.9, 0.8, 24), stone); bowl.position.set(cx, 5.2, cz); scene.add(bowl);
        const l = label(d.label || 'Fountain', { size: 1.2 }); l.position.set(cx, 7.5, cz); scene.add(l);
      } else if (d.kind === 'tree') {
        const r = d.w / 2;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 9, 10), std('#6e5238')); trunk.position.set(cx, 4.5, cz); trunk.castShadow = true; scene.add(trunk);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), std('#6f8f54')); crown.scale.y = 0.62; crown.position.set(cx, 11.5, cz); crown.castShadow = true; scene.add(crown);
      } else if (d.kind === 'fireplace') {
        box(d.x, d.y, d.w, d.h, 7, std('#bdb3a2'));
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 3.2), std('#2a2420')); mouth.position.set(X(d.x + d.w) + 0.05, 1.8, cz); scene.add(mouth);
        const l = label(d.label || 'Fireplace', { size: 1.2 }); l.position.set(cx + 1.5, 8.6, cz); scene.add(l);
      } else if (d.kind === 'wine') box(d.x, d.y, d.w, Math.max(d.h, 1.4), 8, std('#5b3a29'));
      else if (d.kind === 'sunroom') {
        const room8 = new THREE.Mesh(new THREE.CylinderGeometry(d.w / 2, d.w / 2, 10, 8, 1, true), std('#b9d0cf', { transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
        room8.position.set(cx, 5, cz); room8.rotation.y = Math.PI / 8; scene.add(room8);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(d.w / 2, d.w / 2, 0.2, 8), std('#cbbd9f')); base.position.set(cx, 0.1, cz); base.rotation.y = Math.PI / 8; scene.add(base);
      } else if (d.kind === 'bar') {
        box(d.x, d.y, d.w, d.h, 3.4, std('#7a5638'));
        box(d.x - 0.2, d.y - 0.2, d.w + 0.4, d.h + 0.4, 0.2, std('#efe6d2')).position.setY(3.5);
        const l = label('Bar', { size: 1.2, color: '#6b1f2a' }); l.position.set(cx, 6, cz); scene.add(l);
      } else if (d.kind === 'hedge') box(d.x, d.y, d.w, d.h, 4, std('#5f7d48'));
      else if (d.kind === 'cypress') { const c = new THREE.Mesh(new THREE.ConeGeometry(d.w / 2, 14, 12), std('#41593a')); c.position.set(cx, 7, cz); c.castShadow = true; scene.add(c); }
      else if (d.kind === 'statue') { box(d.x, d.y, d.w, d.h, 3, stone); const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 4, 10), white); s2.position.set(cx, 5, cz); scene.add(s2); }
    });
    // the wedding party stands either side of the altar (same positions as the plan's numbered dots)
    if (ROOM.party) {
      partyDots(ROOM, pool).forEach((d, i) => {
        const g = new THREE.Group(), mat = std(d.side === 'b' ? mood.swatches[3] : mood.swatches[1]);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 3.6, 14), mat); body.position.y = 2.4; body.castShadow = true;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), std('#e8d5bf')); head.position.y = 4.8;
        g.add(body, head); g.position.set(X(d.x), 0, Z(d.y)); g.scale.setScalar(0.001);
        const tag = label(d.label, { size: 1 }); tag.position.set(0, 6.6, 0); g.add(tag);
        popIns.push({ g, delay: 0.3 + i * 0.05 }); scene.add(g);
      });
    }
  }

  /* ---- tables + chairs ---- */
  const cloth = new THREE.MeshStandardMaterial({ color: '#f5efe2', roughness: 0.85 });
  const SPACE_LOOK = { ceremony: { chair: '#f4f1ea', top: '#f5efe2' }, cocktail: { chair: '#2b2b2b', top: '#2b2b2b' }, tasting: { chair: '#7a5638', top: '#7a5638' } };
  const look = SPACE_LOOK[sp?.id] || null;
  // Linens in the board's palette (chocolate satin, wine velvet, olive velvet), with soft folds; each table gets the next colour in turn, the head table is olive velvet.
  const foldTex = linenTexture();
  const linen = (c, rough = 0.78) => new THREE.MeshStandardMaterial({ color: c, map: foldTex, roughness: rough });
  const LINENS = [linen(PAL.choc, 0.55), linen(PAL.wine, 0.85), linen(PAL.olive, 0.85)];
  const runnerOf = (cloth) => (cloth === 0 ? '#6f7a45' : cloth === 1 ? '#c9c3a3' : PAL.wine); // moss runner on chocolate, ivory-sage on wine, wine on olive
  const clothIdx = (t, i) => (t.id === 'head' ? 2 : i % 3 === 2 ? 1 : 0); // mostly chocolate, a wine one now and then
  const topMat = look && sp.id === 'tasting' ? new THREE.MeshStandardMaterial({ color: look.top, roughness: 0.7 }) : null; // null = pick a linen per table
  const decorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const chairMat = look ? new THREE.MeshStandardMaterial({ color: look.chair, roughness: 0.6 }) : new THREE.MeshStandardMaterial({ color: '#4a2f1e', roughness: 0.6 }); // dark walnut cross-back chairs
  const cushionMat = new THREE.MeshStandardMaterial({ color: sp?.id === 'cocktail' ? '#2b2b2b' : '#e9dfc8', roughness: 0.95 }); // ivory linen seat pad
  const seatedMat = new THREE.MeshStandardMaterial({ color: mood.swatches[3], roughness: 0.7 });
  const bloomMat = new THREE.MeshStandardMaterial({ color: mood.swatches[3], roughness: 0.8 });
  const leafMat = new THREE.MeshStandardMaterial({ color: mood.swatches[1], roughness: 0.8 });
  const flameMat = new THREE.MeshStandardMaterial({ color: '#ffe7b0', emissive: '#ffb347', emissiveIntensity: 0.4 });

  const candlePos = []; // world positions of every flame, for the glow halos
  const chairMeshes = []; // for tap-to-seat
  const tableInfo = new Map(); // tableId -> { group, tag, n, total }
  const chair = (x, z, faceX, faceZ, seated) => {
    const c = new THREE.Group(); // two draw calls per chair, both on shared geometry: the wooden frame and the cushion (the cushion changes colour when someone sits)
    const seat = new THREE.Mesh(chairCushion(), seated ? seatedMat : cushionMat);
    c.add(new THREE.Mesh(chairFrame(), chairMat), seat);
    c.position.set(x, 0, z);
    c.rotation.y = Math.atan2(x - faceX, z - faceZ);
    c.children[0].castShadow = true; // the frame only: fewer shadow draws
    c.userData.seat = seat;
    return c;
  };

  TABLES.forEach((t, i) => {
    const g = new THREE.Group();
    const n = countAt ? countAt(t) : state.guests.filter((x) => x.tableId === t.id).length;
    const isRow = t.shape === 'row', th = t.high ? 3.6 : 2.5;
    const rot = ((t.rot || 0) * Math.PI) / 180;
    let top, dec = null, rectGeo = null;
    const ci = clothIdx(t, i), tmat = topMat || LINENS[ci], rc = runnerOf(ci);
    const small = !!t.high;
    if (isRow) { // ceremony row: chairs only
      top = new THREE.Object3D();
    } else if (t.shape === 'round') {
      const r = tableR(t);
      top = new THREE.Mesh(clothGeo(r, th), tmat);
      if (!topMat) dec = roundDecor(r, t.arc ? 0 : t.seats, small, rc, th, 3 + i * 7);
    } else {
      const { L, D } = rectDims(t);
      const key = ['b', round1(L), round1(D), th].join();
      if (!_decorCache.has(key)) { const a = new THREE.BoxGeometry(L, th, D).translate(0, th / 2, 0), b = new THREE.BoxGeometry(L + 0.5, 0.4, D + 0.5).translate(0, 0.2, 0); _decorCache.set(key, mergeGeometries([a, b])); a.dispose(); b.dispose(); }
      top = new THREE.Mesh(_decorCache.get(key), tmat);
      if (!topMat) dec = longDecor(L, D, 0, rc, th);
    }
    top.position.y = 0; top.castShadow = top.receiveShadow = true;
    g.add(top);
    // low florals, candle trio, runner and place settings: one merged mesh + one flame mesh per table
    if (dec) {
      const deco = new THREE.Group();
      deco.add(new THREE.Mesh(dec.decor, decorMat));
      if (dec.tips) deco.add(new THREE.Mesh(dec.tips, flameMat));
      if (t.shape !== 'round') deco.rotation.y = -rot;
      g.add(deco);
      g.userData.candles = dec.tipAt.map(([x, y, z]) => new THREE.Vector3(x, y, z).applyEuler(deco.rotation));
    }
    chairPositions(t).forEach(([cx, cz], k) => {
      const px = cx * Math.cos(rot) - cz * Math.sin(rot), pz = cx * Math.sin(rot) + cz * Math.cos(rot);
      const ch = chair(px, pz, isRow ? px : 0, isRow ? pz - 10 : 0, k < n); // ceremony rows face the altar (up the plan)
      ch.userData.tableId = t.id; ch.userData.taken = k < n;
      ch.traverse((m) => { if (m.isMesh) { m.userData.chair = ch; chairMeshes.push(m); } });
      g.add(ch);
    });
    if (t.shape !== 'round' && !isRow) top.rotation.y = -rot;
    g.position.set(X(t.x), onStage(t.x, t.y) ? PLATFORM : 0, Z(t.y));
    (g.userData.candles || []).forEach((v) => candlePos.push(v.x + g.position.x, v.y + g.position.y + 0.25, v.z + g.position.z));
    const tag = isRow ? null : label(t.id === 'head' ? t.name : `${/^\d+$/.test(t.name) ? t.name.padStart(2, '0') : t.name} · ${n}/${seatCount(t)}`, { size: 1.2 });
    if (tag) { tag.position.set(0, t.high ? 7 : 6, 0); g.add(tag); }
    tableInfo.set(t.id, { group: g, tag, n, total: seatCount(t), table: t });
    g.scale.setScalar(0.001);
    popIns.push({ g, delay: 0.25 + i * 0.06 });
    scene.add(g);
  });

  /* ---- areas ---- */
  const danceMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd79a', emissiveIntensity: 0.05, transparent: true, opacity: 0.55, roughness: 0.12, metalness: 0.15 });
  ROOM.areas.forEach((a) => {
    const cx = X(a.x + a.w / 2), cz = Z(a.y + a.h / 2);
    let m;
    if (a.preset === 'dance') {
      m = new THREE.Mesh(new THREE.PlaneGeometry(a.w, a.h), danceMat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = -((a.rot || 0) * Math.PI) / 180; m.position.set(cx, 0.03, cz);
    } else if (a.preset === 'bar' || a.preset === 'dj') {
      m = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(a.w, 3.3, a.h), new THREE.MeshStandardMaterial({ color: a.preset === 'bar' ? '#7a5638' : '#2a2a26', roughness: 0.55 }));
      body.position.y = 1.65; body.castShadow = true;
      const topSlab = new THREE.Mesh(new THREE.BoxGeometry(a.w + 0.4, 0.2, a.h + 0.4), new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.35 }));
      topSlab.position.y = 3.4;
      m.add(body, topSlab); m.position.set(cx, 0, cz);
    } else if (a.preset === 'cake') {
      m = new THREE.Group();
      [[1.4, 1.1], [1.0, 0.9], [0.65, 0.8]].reduce((y, [r, hh]) => { const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hh, 32), new THREE.MeshStandardMaterial({ color: '#fbf7ee' })); tier.position.y = y + hh / 2; m.add(tier); return y + hh; }, 2.6);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(a.w, a.h) / 2, Math.min(a.w, a.h) / 2, 2.6, 32), cloth); stand.position.y = 1.3; m.add(stand);
      m.position.set(cx, 0, cz);
    } else if (a.preset === 'aisle') {
      m = new THREE.Mesh(new THREE.PlaneGeometry(a.w, a.h), new THREE.MeshStandardMaterial({ color: '#d9cfb8', roughness: 0.95 }));
      m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.05, cz);
    } else if (a.preset === 'altar') {
      m = new THREE.Mesh(new THREE.BoxGeometry(a.w, 0.6, a.h), new THREE.MeshStandardMaterial({ color: '#e7dcc6', roughness: 0.8 }));
      m.position.set(cx, 0.3, cz); m.receiveShadow = true;
    } else if (a.preset === 'lounge') {
      m = new THREE.Mesh(new THREE.BoxGeometry(a.w, 1.6, a.h), new THREE.MeshStandardMaterial({ color: '#3c4a2c', roughness: 0.9 }));
      m.position.set(cx, 0.8, cz);
    } else {
      m = new THREE.Mesh(new THREE.BoxGeometry(a.w, 0.3, a.h), new THREE.MeshStandardMaterial({ color: '#dcd2bb', roughness: 0.8 }));
      m.position.set(cx, 0.15, cz);
    }
    if (a.preset !== 'dance' && a.preset !== 'aisle') m.rotation.y = -((a.rot || 0) * Math.PI) / 180;
    const up = onStage(a.x + a.w / 2, a.y + a.h / 2) ? PLATFORM : 0; // the cake table in the bay stands on the platform
    m.position.y += up;
    scene.add(m);
    if (a.preset !== 'aisle') { const tag = label(a.label, { size: 1.2, color: '#6b1f2a' }); tag.position.set(cx, 5 + up, cz); scene.add(tag); }
  });

  /* ---- string lights: swags of warm bulbs across the room (wire = one LineSegments, bulbs = one InstancedMesh, halos = one Points) ---- */
  let candleGlow = null; // halos appear once the tables have popped in
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff0cf', emissive: '#ffbf66', emissiveIntensity: 0.3 });
  const glowTex = glowTexture();
  const bulbHalo = new THREE.PointsMaterial({ map: glowTex, size: 2.4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffc98a' });
  const candleHalo = new THREE.PointsMaterial({ map: glowTex, size: 1.9, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffc27a' });
  {
    const topY = ballroom ? 16 : closed ? WH - 1.3 : 13.5, sag = ballroom ? 2.6 : 1.7;
    const strands = []; // [x1, y1, z1, x2, y2, z2]
    const rows = ballroom ? [22, 42, 62] : closed ? [h * 0.3, h * 0.6] : [Math.max(26, h * 0.4), Math.max(42, h * 0.62), h - 6];
    rows.forEach((y) => strands.push([-w / 2 + 0.6, topY, Z(y), w / 2 - 0.6, topY, Z(y)]));
    (fixed.decor || []).filter((d) => d.kind === 'pergola').forEach((d) => [d.y + 0.5, d.y + d.h - 0.5].forEach((y) => strands.push([X(d.x), 10, Z(y), X(d.x + d.w), 10, Z(y)])));
    const wire = [], bulbs = [], halos = [];
    strands.forEach(([x1, y1, z1, x2, y2, z2]) => {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(4, Math.round(len / 2.4)), dip = y1 === 10 ? 0.9 : sag;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const u = i / n, p = [x1 + (x2 - x1) * u, y1 + (y2 - y1) * u - dip * 4 * u * (1 - u), z1 + (z2 - z1) * u];
        if (prev) wire.push(...prev, ...p);
        if (i > 0 && i < n) { bulbs.push(p); halos.push(...p); }
        prev = p;
      }
    });
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)), new THREE.LineBasicMaterial({ color: '#2b2118' }));
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 6, 5), bulbMat, bulbs.length), m4 = new THREE.Matrix4();
    bulbs.forEach((p, i) => { m4.makeTranslation(...p); inst.setMatrixAt(i, m4); });
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(halos, 3)), bulbHalo);
    (closed ? ceilingG : scene).add(lines, inst); scene.add(pts);
    if (candlePos.length) { candleGlow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(candlePos, 3)), candleHalo); scene.add(candleGlow); }
    if (!closed) { // slim poles at both ends of each open-air strand
      const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, topY + 0.4, 6), new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 0.9 }), rows.length * 2);
      let k = 0; rows.forEach((y) => [-w / 2 + 0.6, w / 2 - 0.6].forEach((x) => { m4.makeTranslation(x, (topY + 0.4) / 2 - 0.1, Z(y)); poles.setMatrixAt(k++, m4); }));
      scene.add(poles);
    }
    // two warm lamps stand in for the whole string for the shared light budget (the ballroom already has its chandelier lamps)
    if (!ballroom) [0.35, 0.7].forEach((f) => { const pl = new THREE.PointLight('#ffc27a', 0, 60, 1.3); pl.position.set(0, 10, Z(h * f)); scene.add(pl); lamps.push(pl); });
  }

  /* ---- size ---- */
  let refitHome = () => {}; // set below, once the home view exists: re-frames it when the picture changes shape
  const resize = () => {
    const W = host.clientWidth || 600;
    const H = host.closest('.vow') ? Math.max(320, host.clientHeight || innerHeight - 190) : Math.max(320, Math.min(W * 0.8, innerHeight - 230));
    renderer.setSize(W, H, !host.closest('.vow'));
    camera.aspect = W / H; camera.updateProjectionMatrix();
    refitHome();
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  /* ---- light moods ---- */
  const dayGlass = new THREE.Color('#fff4d6'), duskGlass = new THREE.Color('#334063');
  let evening = 0, eveningTarget = 0;
  const LAMP = ballroom ? 55 : 80; // candlelight, not floodlight: the evening should read dim and warm
  const applyLight = (k) => {
    hemi.intensity = 1.3 - 1.05 * k;
    hemi.color.copy(hemiSky.day).lerp(hemiSky.night, k); hemi.groundColor.copy(hemiGnd.day).lerp(hemiGnd.night, k);
    sun.intensity = 1.6 * (1 - k); moon.intensity = closed ? 0 : 0.5 * k;
    bulbMat.emissiveIntensity = 0.3 + 2.8 * k; bulbHalo.opacity = 0.85 * k; candleHalo.opacity = 0.9 * k;
    bulbHalo.visible = k > 0.01;
    if (skyDomes.length) { skyDomes[1].material.opacity = k; skyDomes[1].visible = k > 0.01; }
    lamps.forEach((l) => { l.intensity = LAMP * k; });
    glowMat.emissiveIntensity = 0.6 + 2.4 * k;
    flameMat.emissiveIntensity = 0.4 + 3.2 * k;
    danceMat.emissiveIntensity = 0.05 + 0.5 * k;
    creamMat.emissiveIntensity = 0.45 * (1 - 0.75 * k); moldMat.emissiveIntensity = 0.5 * (1 - 0.75 * k);
    glassMats.forEach((m) => { m.emissive.copy(dayGlass).lerp(duskGlass, k); m.emissiveIntensity = 0.55 - 0.35 * k; m.color.setScalar(1 - 0.6 * k); });
    scene.background.copy(dayBg).lerp(nightBg, k);
    renderer.toneMappingExposure = 1 - 0.1 * k;
  };

  /* ---- intro + "Experience the evening" camera moves ---- */
  // The home view is framed for a wide screen. On a tall narrow one (a phone) the room is wider than the picture, so pull the camera back until the room's width fits.
  const calcHome = () => {
    const span = Math.max(h, w * 0.8); // the other spaces: 45 degrees down, far enough back that the whole room is in frame
    const target = new THREE.Vector3(0, 0, ballroom ? -4 : 0), base = ballroom ? new THREE.Vector3(0, 52, h * 0.78) : new THREE.Vector3(0, span, span), d0 = base.distanceTo(target);
    const need = (w * 1.12) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(0.3, camera.aspect));
    const k = Math.min(controls.maxDistance * 0.95 / d0, Math.max(1, need / d0));
    return { pos: target.clone().add(base.sub(target).multiplyScalar(k)), target };
  };
  const home = calcHome();
  let touched = false; // once someone moves the view themselves, a resize leaves it alone
  controls.addEventListener('start', () => { touched = true; });
  let flight = { from: new THREE.Vector3(0, h * 1.55, 0.01), to: home.pos.clone(), fromT: new THREE.Vector3(0, 0, 0), toT: home.target.clone(), t: 0, dur: 1.8 };
  refitHome = () => {
    const nh = calcHome(); home.pos.copy(nh.pos);
    if (flight && flight.to) flight.to.copy(home.pos);
    if (!touched && !tour && (!flight || flight.t >= 1)) { camera.position.copy(home.pos); controls.target.copy(home.target); controls.update(); }
  };
  camera.position.copy(flight.from);
  let tour = null;

  function experience() {
    if (walking) { walking = false; pad.hidden = true; host.classList.remove('walking'); }
    eveningTarget = 1;
    const H = (x) => new THREE.Vector3(...x);
    tour = {
      t: 0, dur: 18, from: camera.position.clone(), fromT: controls.target.clone(),
      path: new THREE.CatmullRomCurve3([H([0, 6, h / 2 + 10]), H([0, 5.6, h / 2 - 4]), H([-6, 6, h / 2 - 20]), H([-14, 7, Z(32)]), H([0, 6.5, Z(24)]), H([12, 7, Z(14)]), H([0, 30, h * 0.5]), home.pos.clone()]),
      look: new THREE.CatmullRomCurve3([H([0, 4, 0]), H([0, 4, -10]), H([0, 3, Z(24)]), H([0, 3, Z(18)]), H([0, 3.5, Z(8)]), H([-4, 3, Z(18)]), H([0, 0, -4]), home.target.clone()]),
    };
    controls.enabled = false;
  }

  /* ---- walk mode: eye-level, drag to look, arrows/WASD or the on-screen pad to move ---- */
  let walking = false, yaw = 0, pitch = -0.08;
  const keys = new Set();
  const pad = document.createElement('div');
  pad.className = 'walkpad'; pad.hidden = true;
  pad.innerHTML = ['up', 'left', 'down', 'right'].map((d) => `<button data-dir="${d}" aria-label="Move ${d}">${{ up: '\u25B2', down: '\u25BC', left: '\u25C0', right: '\u25B6' }[d]}</button>`).join('');
  host.appendChild(pad);
  pad.querySelectorAll('[data-dir]').forEach((b) => {
    const on = (e) => { e.preventDefault(); keys.add(b.dataset.dir); };
    const off = () => keys.delete(b.dataset.dir);
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  });
  const keyMap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const onKey = (e) => {
    if (!walking || !keyMap[e.code] || e.target.closest?.('input')) return;
    e.preventDefault();
    e.type === 'keydown' ? keys.add(keyMap[e.code]) : keys.delete(keyMap[e.code]);
  };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);

  function setWalk(on) {
    walking = on; pad.hidden = !on; tour = null;
    controls.enabled = !on;
    host.classList.toggle('walking', on);
    if (on) {
      flight = { from: camera.position.clone(), to: new THREE.Vector3(0, 5.5, h / 2 - 3), fromT: controls.target.clone(), toT: new THREE.Vector3(0, 5, 0), t: 0, dur: 1.2 };
      yaw = 0; pitch = -0.08;
    } else {
      flight = { from: camera.position.clone(), to: home.pos.clone(), fromT: controls.target.clone(), toT: home.target.clone(), t: 0, dur: 1.2 };
    }
    return walking;
  }

  // drag to look (walk) / tap a chair to seat someone (any mode)
  let down = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }; });
  el.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
    if (walking && !flight) { yaw = down.yaw - dx * 0.005; pitch = Math.max(-1.1, Math.min(0.6, down.pitch - dy * 0.004)); }
  });
  el.addEventListener('pointerup', (e) => { const d = down; down = null; if (d && !d.moved) tapAt(e); });

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  // ease the camera toward a table (from the room's open side), unless we are walking or on the tour
  function focusTable(id) {
    const info = tableInfo.get(id);
    if (!info || walking || tour) return;
    const p = info.group.position, dir = new THREE.Vector3(-p.x * 0.3, 0, h * 0.5 - p.z).setY(0).normalize();
    const to = new THREE.Vector3(p.x, 0, p.z).addScaledVector(dir, 20).setY(15);
    flight = { from: camera.position.clone(), to, fromT: controls.target.clone(), toT: new THREE.Vector3(p.x, 1.5, p.z), t: 0, dur: 0.9 };
  }
  function tapAt(e) {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(chairMeshes, false)[0];
    if (!hit) return closePrompt();
    const ch = hit.object.userData.chair;
    focusTable(ch.userData.tableId);
    if (ch.userData.taken || !onSeat) return;
    openPrompt(ch, e.clientX - r.left, e.clientY - r.top);
  }

  const prompt = document.createElement('form');
  prompt.className = 'seat-prompt'; prompt.hidden = true;
  prompt.innerHTML = `<label><span></span><input name="who" list="seat3dList" placeholder="Who sits here?" autocomplete="off"/></label><datalist id="seat3dList"></datalist>`;
  host.appendChild(prompt);
  let promptChair = null;
  function openPrompt(ch, x, y) {
    const info = tableInfo.get(ch.userData.tableId);
    promptChair = ch;
    prompt.querySelector('span').textContent = info.table.id === 'head' ? info.table.name : `Table ${info.table.name}`;
    prompt.querySelector('datalist').innerHTML = unseated().map((g) => `<option value="${g.name.replace(/"/g, '&quot;')}"></option>`).join('');
    prompt.style.left = Math.min(x, host.clientWidth - 230) + 'px';
    prompt.style.top = Math.max(8, y - 70) + 'px';
    prompt.hidden = false;
    ch.userData.seat.material = seatedMat;
    prompt.who.value = ''; prompt.who.focus();
  }
  function closePrompt(keep) {
    if (promptChair && !keep && !promptChair.userData.taken) promptChair.userData.seat.material = cushionMat;
    promptChair = null; prompt.hidden = true;
  }
  prompt.onsubmit = (e) => {
    e.preventDefault();
    const name = prompt.who.value.trim();
    if (!name || !promptChair || !onSeat) return closePrompt();
    const info = tableInfo.get(promptChair.userData.tableId);
    if (info.n >= info.total) { closePrompt(); return; }
    if (!onSeat(info.table.id, name)) return closePrompt();
    promptChair.userData.taken = true;
    info.n += 1;
    // refresh the table's floating label
    info.group.remove(info.tag);
    info.tag = label(info.table.id === 'head' ? info.table.name : `${/^\d+$/.test(info.table.name) ? info.table.name.padStart(2, '0') : info.table.name} · ${info.n}/${info.total}`, { size: 1.2 });
    info.tag.position.set(0, 6, 0); info.group.add(info.tag);
    const ch = promptChair; ch.scale.setScalar(1.25); popChairs.push({ ch, t: 0 });
    closePrompt(true);
  };
  prompt.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePrompt(); });
  const popChairs = [];

  /* ---- loop ---- */
  let raf, last = performance.now(), clock = 0, lit = -1;
  const mountedAt = performance.now(); // tables pop in on REAL time: the frame clock below is capped per frame, so a slow device (or a throttled tab) used to leave them invisible for ages
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  function frame(now) {
    if (document.hidden) { last = now; raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    if (flight) {
      flight.t += dt / flight.dur;
      const k = ease(Math.min(1, flight.t));
      camera.position.lerpVectors(flight.from, flight.to, k);
      controls.target.lerpVectors(flight.fromT, flight.toT, k);
      if (flight.t >= 1) flight = null;
    }
    if (tour) {
      tour.t += dt / tour.dur;
      const k = ease(Math.min(1, tour.t));
      const b = ease(Math.min(1, (tour.t * tour.dur) / 1.6)); // first 1.6 s: ease from the current view onto the path
      camera.position.lerpVectors(tour.from, tour.path.getPointAt(k), b);
      controls.target.lerpVectors(tour.fromT, tour.look.getPointAt(k), b);
      if (tour.t >= 1) { tour = null; controls.enabled = true; }
    }
    if (candleGlow) candleGlow.visible = evening > 0.01 && (performance.now() - mountedAt) > 1800;
    popIns.forEach((p) => {
      const k = Math.min(1, Math.max(0, ((performance.now() - mountedAt) / 1000 - p.delay) / 0.45));
      const s = k === 0 ? 0.001 : 1 + Math.sin(k * Math.PI) * 0.08 * (1 - k) - (1 - ease(k)) * 0.999;
      p.g.scale.setScalar(Math.max(0.001, s));
    });
    // Labels hide during the tour, and fade out when you walk close so they never fill the screen
    allLabels.forEach((l) => {
      let target = tour ? 0 : 1;
      if (walking && !tour) { l.getWorldPosition(_v); target = Math.max(0, Math.min(1, (camera.position.distanceTo(_v) - 9) / 12)); }
      l.material.opacity += (target - l.material.opacity) * Math.min(1, dt * 5);
      l.visible = l.material.opacity > 0.02;
    });
    if (evening !== eveningTarget || lit !== evening) {
      evening += (eveningTarget - evening) * Math.min(1, dt * 1.2);
      if (Math.abs(eveningTarget - evening) < 0.0005) evening = eveningTarget;
      applyLight(evening); lit = evening; // only while the mood is changing
    }
    if (evening > 0) {
      flameMat.emissiveIntensity = (0.4 + 3.2 * evening) * (1 + Math.sin(clock * 9) * 0.1 + Math.sin(clock * 23) * 0.04);
      lamps.forEach((l, i) => { l.intensity = LAMP * evening * (1 + Math.sin(clock * 3 + i * 2) * 0.02); });
    }
    if (walking && !flight) {
      const speed = 14 * dt, fwd = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0), side = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      camera.position.x = Math.max(-w / 2 + 1.5, Math.min(w / 2 - 1.5, camera.position.x + (fx * fwd - fz * side) * speed));
      camera.position.z = Math.max(-h / 2 + 1.5, Math.min(h / 2 - 1.5, camera.position.z + (fz * fwd + fx * side) * speed));
      camera.position.y = 5.5;
      camera.lookAt(camera.position.x + fx * Math.cos(pitch), 5.5 + Math.sin(pitch) * 1, camera.position.z + fz * Math.cos(pitch));
    }
    popChairs.forEach((p) => { p.t += dt * 4; p.ch.scale.setScalar(1 + Math.max(0, 0.25 * (1 - p.t))); });
    // the ceiling only exists from below: looking down from above you see straight into the room
    ceilingG.visible = camera.position.y < WH - 1.5;
    if (walking && !flight) { /* camera already aimed */ }
    else if (!tour) controls.update();
    else camera.lookAt(controls.target);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    toggleLight() { eveningTarget = eveningTarget ? 0 : 1; return !!eveningTarget; },
    walk(on) { return setWalk(on ?? !walking); },
    experience,
    zoom(f) { camera.position.sub(controls.target).multiplyScalar(f).add(controls.target); },
    stats() { const i = renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, pixelRatio: renderer.getPixelRatio() }; },
    snapshot() { renderer.render(scene, camera); return renderer.domElement; },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.forceContextLoss();
      removeEventListener('keydown', onKey); removeEventListener('keyup', onKey);
      scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); });
    },
  };
}
