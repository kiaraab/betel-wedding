// 3D view of the reception, built from the same plan data as the floor plan. Units: feet.
// Loaded on demand (three.js comes from a CDN via the import map in index.html).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { seatCount, roundRadius, rectDims, chairPositions, openingRect } from './layout.js';

const WALL_H = 14;
const _v = new THREE.Vector3();
let allLabels = [];

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

export async function mount(host, state, mood, { onSeat, unseated = () => [] } = {}) {
  host.innerHTML = '';
  allLabels = [];
  const { w, h, fixed } = state.room;
  const X = (x) => x - w / 2, Z = (y) => y - h / 2;

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.classList.add('three');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const dayBg = new THREE.Color('#e9e2d2'), nightBg = new THREE.Color('#15180f');
  scene.background = dayBg.clone();

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.42; controls.minDistance = 12; controls.maxDistance = 160;
  controls.target.set(0, 0, -4);

  /* ---- light ---- */
  const hemi = new THREE.HemisphereLight('#fff7e6', '#7a6748', 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe9c4', 1.6);
  sun.position.set(-20, 40, -h); sun.castShadow = true;
  const coarse = matchMedia('(pointer: coarse)').matches;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -w, right: w, top: h, bottom: -h, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  /* ---- floor + walls ---- */
  const wood = woodTexture(); wood.repeat.set(w / 16, h / 16);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#cdbd98', roughness: 0.9, side: THREE.DoubleSide });
  const lowWall = new THREE.MeshStandardMaterial({ color: '#cdbd98', roughness: 0.9, transparent: true, opacity: 0.35 });
  const wall = (len, x, z, rotY, height = WALL_H, mat = wallMat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, height, 0.6), mat);
    m.position.set(x, height / 2, z); m.rotation.y = rotY; m.receiveShadow = true;
    scene.add(m);
  };
  wall(w, 0, -h / 2, 0);                          // far wall (arched doors)
  wall(h, -w / 2, 0, Math.PI / 2);                // left
  wall(h, w / 2, 0, Math.PI / 2);                 // right
  wall(w, 0, h / 2, 0, 3, lowWall);               // near wall cut away so you can see in
  // Coffered-style ceiling, one-sided so it disappears when you look down from above
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: '#f3ead6', roughness: 0.95 }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = WALL_H;
  scene.add(ceiling);

  /* ---- arched doors + windows (glow like daylight; dusk at night) ---- */
  const glassMat = new THREE.MeshStandardMaterial({ color: '#fdf6e3', emissive: '#fff4d6', emissiveIntensity: 1.1, roughness: 0.2 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#fbf8f0', roughness: 0.6 });
  fixed.openings.forEach((o) => {
    if (o.wall === 'bottom') return; // entrance sits under the balcony (cut-away wall)
    const isWin = o.kind === 'window';
    const ow = o.w, oh = isWin ? 6.5 : 7.5, sill = isWin ? 2.5 : 0;
    const frame = new THREE.Mesh(new THREE.ShapeGeometry(archShape(ow + 0.6, oh)), frameMat);
    const glass = new THREE.Mesh(new THREE.ShapeGeometry(archShape(ow, oh)), glassMat);
    const grp = new THREE.Group(); grp.add(frame, glass);
    frame.position.z = 0.01; glass.position.z = 0.03;
    const r = openingRect(state.room, o, 0);
    if (o.wall === 'top') { grp.position.set(X(o.at), sill, Z(0) + 0.35); }
    if (o.wall === 'left') { grp.position.set(X(0) + 0.35, sill, Z(o.at)); grp.rotation.y = Math.PI / 2; }
    if (o.wall === 'right') { grp.position.set(X(w) - 0.35, sill, Z(o.at)); grp.rotation.y = -Math.PI / 2; }
    void r;
    scene.add(grp);
  });

  /* ---- balcony across the near end (overhead) ---- */
  if (fixed.balcony) {
    const d = fixed.balcony.depth;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, d), new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.8 }));
    slab.position.set(0, 11, Z(h - d / 2)); slab.castShadow = true;
    scene.add(slab);
    const postMat = new THREE.MeshStandardMaterial({ color: '#f3ecdd', roughness: 0.7 });
    [-w / 2 + 6, -w / 6, w / 6, w / 2 - 6].forEach((x) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 10.6, 16), postMat);
      post.position.set(x, 5.3, Z(h - d) + 0.6); post.castShadow = true; scene.add(post);
    });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: '#2b241d' }));
    rail.position.set(0, 14.2, Z(h - d)); scene.add(rail);
    const balMat = new THREE.MeshStandardMaterial({ color: '#2b241d' });
    for (let x = -w / 2 + 1; x < w / 2; x += 1.6) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), balMat);
      b.position.set(x, 12.8, Z(h - d)); scene.add(b);
    }
    const ent = label('Entrance', { size: 1.4 }); ent.position.set(0, 3.5, Z(h) - 1); scene.add(ent);
  }

  /* ---- round tiered stage ---- */
  if (fixed.stage) {
    const { cx, cy, r, steps } = fixed.stage;
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#eadfca', roughness: 0.7 });
    for (let i = 0; i < steps; i++) {
      const rr = r - i * (r / (steps + 1));
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.7, 48, 1, false, 0, Math.PI), stoneMat);
      tier.position.set(X(cx), 0.35 + i * 0.7, Z(cy));
      tier.castShadow = tier.receiveShadow = true;
      scene.add(tier);
    }
  }

  /* ---- chandeliers ---- */
  const lamps = [];
  const goldMat = new THREE.MeshStandardMaterial({ color: '#c9a45c', metalness: 0.7, roughness: 0.3 });
  const glowMat = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb860', emissiveIntensity: 0.6 });
  for (let i = 0; i < 4; i++) {
    const z = Z(10 + i * ((h - 22) / 3));
    const ch = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.08, 8, 32), goldMat); ring.rotation.x = Math.PI / 2;
    ch.add(ring);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.45, 12), glowMat);
      shade.position.set(Math.cos(a) * 1.6, 0.3, Math.sin(a) * 1.6); ch.add(shade);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, WALL_H - 10.5), goldMat); stem.position.y = (WALL_H - 10.5) / 2; ch.add(stem);
    ch.position.set(0, 10.5, z);
    scene.add(ch);
    const pl = new THREE.PointLight('#ffc27a', 0, 34, 1.4);
    pl.position.set(0, 9.6, z);
    scene.add(pl);
    lamps.push(pl);
  }

  /* ---- tables + chairs ---- */
  const cloth = new THREE.MeshStandardMaterial({ color: '#f5efe2', roughness: 0.85 });
  const chairMat = new THREE.MeshStandardMaterial({ color: '#c9a45c', metalness: 0.55, roughness: 0.35 });
  const seatedMat = new THREE.MeshStandardMaterial({ color: mood.swatches[3], roughness: 0.7 });
  const bloomMat = new THREE.MeshStandardMaterial({ color: mood.swatches[3], roughness: 0.8 });
  const leafMat = new THREE.MeshStandardMaterial({ color: mood.swatches[1], roughness: 0.8 });
  const flameMat = new THREE.MeshStandardMaterial({ color: '#ffe7b0', emissive: '#ffb347', emissiveIntensity: 0.4 });
  const flames = [];
  const popIns = [];

  const chairMeshes = []; // for tap-to-seat
  const tableInfo = new Map(); // tableId -> { group, tag, n, total }
  const chair = (x, z, faceX, faceZ, seated) => {
    const c = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 1.3), seated ? seatedMat : chairMat);
    seat.position.y = 1.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.7, 0.12), chairMat);
    back.position.set(0, 2.4, 0.62);
    for (const [lx, lz] of [[-.55, -.55], [.55, -.55], [-.55, .55], [.55, .55]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5), chairMat);
      leg.position.set(lx, 0.75, lz); c.add(leg);
    }
    c.add(seat, back);
    c.position.set(x, 0, z);
    c.rotation.y = Math.atan2(x - faceX, z - faceZ);
    c.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    c.userData.seat = seat;
    return c;
  };

  state.tables.forEach((t, i) => {
    const g = new THREE.Group();
    const n = state.guests.filter((x) => x.tableId === t.id).length;
    const rot = ((t.rot || 0) * Math.PI) / 180;
    let top;
    if (t.shape === 'round') {
      const r = roundRadius(t.seats);
      top = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.3, 2.5, 40), cloth);
    } else {
      const { L, D } = rectDims(t);
      top = new THREE.Mesh(new THREE.BoxGeometry(L, 2.5, D), cloth);
    }
    top.position.y = 1.25; top.castShadow = top.receiveShadow = true;
    g.add(top);
    // centerpiece: blooms + a candle
    [[0, 0, .45, bloomMat], [.5, .2, .3, leafMat], [-.45, .25, .28, leafMat]].forEach(([dx, dz, r, m]) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m); b.position.set(dx, 2.5 + r * 0.8, dz); g.add(b);
    });
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2), new THREE.MeshStandardMaterial({ color: '#fbf6ea' }));
    candle.position.set(0, 3.1, -0.6); g.add(candle);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), flameMat); flame.position.set(0, 3.8, -0.6); g.add(flame); flames.push(flame);
    chairPositions(t).forEach(([cx, cz], k) => {
      const px = cx * Math.cos(rot) - cz * Math.sin(rot), pz = cx * Math.sin(rot) + cz * Math.cos(rot);
      const ch = chair(px, pz, 0, 0, k < n);
      ch.userData.tableId = t.id; ch.userData.taken = k < n;
      ch.traverse((m) => { if (m.isMesh) { m.userData.chair = ch; chairMeshes.push(m); } });
      g.add(ch);
    });
    if (t.shape !== 'round') top.rotation.y = -rot;
    g.position.set(X(t.x), 0, Z(t.y));
    const tag = label(t.id === 'head' ? t.name : `${t.name} · ${n}/${seatCount(t)}`, { size: 1.2 });
    tag.position.set(0, 6, 0); g.add(tag);
    tableInfo.set(t.id, { group: g, tag, n, total: seatCount(t), table: t });
    g.scale.setScalar(0.001);
    popIns.push({ g, delay: 0.25 + i * 0.06 });
    scene.add(g);
  });

  /* ---- areas ---- */
  const danceMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd79a', emissiveIntensity: 0.05, transparent: true, opacity: 0.55, roughness: 0.12, metalness: 0.15 });
  state.room.areas.forEach((a) => {
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
    } else if (a.preset === 'lounge') {
      m = new THREE.Mesh(new THREE.BoxGeometry(a.w, 1.6, a.h), new THREE.MeshStandardMaterial({ color: '#3c4a2c', roughness: 0.9 }));
      m.position.set(cx, 0.8, cz);
    } else {
      m = new THREE.Mesh(new THREE.BoxGeometry(a.w, 0.3, a.h), new THREE.MeshStandardMaterial({ color: '#dcd2bb', roughness: 0.8 }));
      m.position.set(cx, 0.15, cz);
    }
    if (a.preset !== 'dance') m.rotation.y = -((a.rot || 0) * Math.PI) / 180;
    scene.add(m);
    const tag = label(a.label, { size: 1.2, color: '#6b1f2a' }); tag.position.set(cx, 5, cz); scene.add(tag);
  });

  /* ---- size ---- */
  const resize = () => {
    const W = host.clientWidth || 600;
    const H = Math.max(320, Math.min(W * 0.8, innerHeight - 230));
    renderer.setSize(W, H);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();

  /* ---- light moods ---- */
  const dayGlass = new THREE.Color('#fff4d6'), duskGlass = new THREE.Color('#334063');
  let evening = 0, eveningTarget = 0;
  const applyLight = (k) => {
    hemi.intensity = 1.3 - 1.12 * k;
    sun.intensity = 1.6 * (1 - k);
    lamps.forEach((l) => { l.intensity = 90 * k; });
    glowMat.emissiveIntensity = 0.6 + 2.4 * k;
    flameMat.emissiveIntensity = 0.4 + 3.2 * k;
    danceMat.emissiveIntensity = 0.05 + 0.5 * k;
    glassMat.emissive.copy(dayGlass).lerp(duskGlass, k);
    glassMat.emissiveIntensity = 1.1 - 0.75 * k;
    scene.background.copy(dayBg).lerp(nightBg, k);
    renderer.toneMappingExposure = 1 - 0.1 * k;
  };

  /* ---- intro + "Experience the evening" camera moves ---- */
  const home = { pos: new THREE.Vector3(0, 52, h * 0.78), target: new THREE.Vector3(0, 0, -4) };
  let flight = { from: new THREE.Vector3(0, h * 1.55, 0.01), to: home.pos.clone(), fromT: new THREE.Vector3(0, 0, 0), toT: home.target.clone(), t: 0, dur: 1.8 };
  camera.position.copy(flight.from);
  let tour = null;

  function experience() {
    if (walking) { walking = false; pad.hidden = true; host.classList.remove('walking'); }
    eveningTarget = 1;
    const H = (x) => new THREE.Vector3(...x);
    tour = {
      t: 0, dur: 18,
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
  function tapAt(e) {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(chairMeshes, false)[0];
    if (!hit) return closePrompt();
    const ch = hit.object.userData.chair;
    if (ch.userData.taken) return;
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
    if (promptChair && !keep && !promptChair.userData.taken) promptChair.userData.seat.material = chairMat;
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
    info.tag = label(info.table.id === 'head' ? info.table.name : `${info.table.name} · ${info.n}/${info.total}`, { size: 1.2 });
    info.tag.position.set(0, 6, 0); info.group.add(info.tag);
    const ch = promptChair; ch.scale.setScalar(1.25); popChairs.push({ ch, t: 0 });
    closePrompt(true);
  };
  prompt.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePrompt(); });
  const popChairs = [];

  /* ---- loop ---- */
  let raf, last = performance.now(), clock = 0;
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
      camera.position.copy(tour.path.getPointAt(k));
      controls.target.copy(tour.look.getPointAt(k));
      if (tour.t >= 1) { tour = null; controls.enabled = true; }
    }
    popIns.forEach((p) => {
      const k = Math.min(1, Math.max(0, (clock - p.delay) / 0.45));
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
    evening += (eveningTarget - evening) * Math.min(1, dt * 1.2);
    applyLight(evening);
    flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(clock * 9 + i) * 0.15 * evening; });
    lamps.forEach((l, i) => { l.intensity *= 1 + Math.sin(clock * 3 + i * 2) * 0.02; });
    if (walking && !flight) {
      const speed = 14 * dt, fwd = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0), side = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      camera.position.x = Math.max(-w / 2 + 1.5, Math.min(w / 2 - 1.5, camera.position.x + (fx * fwd - fz * side) * speed));
      camera.position.z = Math.max(-h / 2 + 1.5, Math.min(h / 2 - 1.5, camera.position.z + (fz * fwd + fx * side) * speed));
      camera.position.y = 5.5;
      camera.lookAt(camera.position.x + fx * Math.cos(pitch), 5.5 + Math.sin(pitch) * 1, camera.position.z + fz * Math.cos(pitch));
    }
    popChairs.forEach((p) => { p.t += dt * 4; p.ch.scale.setScalar(1 + Math.max(0, 0.25 * (1 - p.t))); });
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
    snapshot() { renderer.render(scene, camera); return renderer.domElement; },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.forceContextLoss();
      removeEventListener('keydown', onKey); removeEventListener('keyup', onKey);
      scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); });
    },
  };
}
